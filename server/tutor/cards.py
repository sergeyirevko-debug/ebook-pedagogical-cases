"""Хранилище карт кейсов: модели подаются ТОЛЬКО опубликованные кейсы.

Источник задаётся переменной CARDS_SOURCE:
  file:/srv/ebook/tutor/cases.json   — выгрузка в формате сайта (server/tools/export_cases.mjs)
  http(s)://…/cases.json             — та же выгрузка по HTTP (например, отдаёт CMS)
  directus:https://cms.example       — Directus: коллекции cases / principles / categories (схема = схема CASES сайта)

Формат выгрузки: {"categories": [...], "principles": [...], "cases": [...]}; у кейса может быть поле
status ("published" | "review" | "draft"). Кейсы без поля status считаются опубликованными
(так выгружает прототип). Кейсы с ошибками в схеме пропускаются с предупреждением в журнале.
Карты перечитываются каждые CARDS_REFRESH секунд; при ошибке остаётся последний удачный набор.
"""
import json, logging, os, threading, time, urllib.parse, urllib.request
from pathlib import Path

from .prompt import OC

log = logging.getLogger("tutor.cards")
LANGS = ("ru", "kz")


def _bi(x):
    return isinstance(x, dict) and all(isinstance(x.get(k), str) and x[k].strip() for k in LANGS)


def validate(c, principles, categories):
    """Возвращает текст ошибки или None. Проверяет ровно то, что нужно card_text()/catalog_text()."""
    if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not c["id"]:
        return "нет id"
    for f in ("title", "short", "text", "expert"):
        if not _bi(c.get(f)):
            return f"поле {f} должно быть {{ru, kz}}"
    if not isinstance(c.get("grade"), str):
        return "нет grade"
    opts = c.get("options")
    if not isinstance(opts, list) or len(opts) < 2:
        return "нужно не меньше двух вариантов действий"
    for o in opts:
        if not _bi(o) or o.get("oc") not in OC or not _bi(o.get("cons")):
            return "вариант без ru/kz, оценки oc или последствий cons"
    if not c.get("principles") or any(p not in principles for p in c["principles"]):
        return "неизвестный принцип"
    if not c.get("cats") or any(x not in categories for x in c["cats"]):
        return "неизвестная категория"
    if not isinstance(c.get("ai"), list) or not c["ai"] or not all(_bi(q) for q in c["ai"]):
        return "нет вопросов для диалога ai"
    return None


def _get_json(url, token=None, timeout=20):
    req = urllib.request.Request(url, headers={"Accept": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def load_export(source):
    if source.startswith("file:"):
        return json.loads(Path(source[5:]).read_text(encoding="utf-8"))
    if source.startswith(("http://", "https://")):
        return _get_json(source, os.environ.get("CARDS_TOKEN"))
    if source.startswith("directus:"):
        base = source[len("directus:"):].rstrip("/")
        tok = os.environ.get("DIRECTUS_TOKEN")
        flt = urllib.parse.quote(json.dumps({"status": {"_eq": "published"}}))
        return {
            "cases": _get_json(f"{base}/items/cases?limit=-1&filter={flt}", tok)["data"],
            "principles": _get_json(f"{base}/items/principles?limit=-1", tok)["data"],
            "categories": _get_json(f"{base}/items/categories?limit=-1", tok)["data"],
        }
    raise ValueError(f"неизвестный CARDS_SOURCE: {source}")


class CardStore:
    def __init__(self, source, refresh=300, on_change=None):
        self.source, self.refresh, self.on_change = source, refresh, on_change
        self.cards, self.principles, self.categories = {}, {}, {}
        self.version = ""
        self._lock = threading.Lock()
        self.reload()

    def reload(self):
        data = load_export(self.source)
        principles = {p["id"]: p for p in data.get("principles", [])}
        categories = {c["id"]: c for c in data.get("categories", [])}
        cards = {}
        for c in data.get("cases", []):
            if c.get("status", "published") != "published":
                continue
            err = validate(c, principles, categories)
            if err:
                log.warning("кейс %s пропущен: %s", c.get("id"), err)
                continue
            cards[c["id"]] = c
        version = json.dumps([cards, principles, categories], sort_keys=True, ensure_ascii=False)
        changed = version != self.version
        with self._lock:
            self.cards, self.principles, self.categories, self.version = cards, principles, categories, version
        if changed:
            log.info("карт опубликовано: %d", len(cards))
            if self.on_change:
                self.on_change(self)
        return changed

    def snapshot(self):
        with self._lock:
            return self.cards, self.principles, self.categories

    def get(self, cid):
        return self.cards.get(cid or "")

    def start_refresh(self):
        def loop():
            while True:
                time.sleep(self.refresh)
                try:
                    self.reload()
                except Exception as e:  # оставляем последний удачный набор
                    log.error("не удалось обновить карты: %s", e)
        threading.Thread(target=loop, daemon=True, name="cards-refresh").start()
