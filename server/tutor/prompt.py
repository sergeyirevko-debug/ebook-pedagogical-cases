"""Сборка промпта для модели ebook-4B-v1 / ebook-2B-v1.

ВСЁ В ЭТОМ ФАЙЛЕ ЗАШИТО В МОДЕЛЬ ОБУЧЕНИЕМ (docs/INTEGRATION.md комплекта, п. 3 и 8).
Формат перенесён из эталона server/tutor_server.py без изменений; тест tests/test_prompt_parity.py
сверяет результат с эталоном побайтно. Менять только вместе с переобучением модели.

Порядок: системный промпт → <материалы> → история. Ничего не вставлять перед историей —
это ломает и поведение модели, и кэш префикса в llama-server.
"""
import hashlib
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
# sha256 data/system_prompt.txt из SHA256SUMS.txt комплекта ebook-ai-tutor-bundle
SYSTEM_PROMPT_SHA256 = "b3fc0c933c2e8de623b37a2f83b15daf71df45e8ad72906d576c7bba3f035685"

OC = {"good": ("Конструктивно", "Сындарлы"), "risky": ("Рискованно", "Тәуекелді"), "weak": ("Малоэффективно", "Тиімділігі төмен")}
LABEL = {"ru": "Ответ сгенерирован AI", "kz": "Жауапты AI жасады"}
TEACHER_MARK = "\n\nЭкспертный комментарий (доступен преподавателю): "
REFLECT_MARK = "\n\nЭкспертный комментарий (показан пользователю после его решения): "
REFLECTION_ENABLED = False  # True — только с моделью v2 (dataset_v2, шаг «Рефлексия»). С v1 не включать.
MAX_HISTORY_CHARS = 9000


def load_system_prompt(path=DATA / "system_prompt.txt"):
    raw = Path(path).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != SYSTEM_PROMPT_SHA256:
        raise RuntimeError(f"system_prompt.txt изменён (sha256 {digest[:12]}…): модель обучена на исходном тексте")
    return raw.decode("utf-8").strip()


def k_of(lang):
    return "kz" if lang == "kz" else "ru"


def card_text(c, lang, principles):
    """Формат карты = формат обучения. principles: {id: {"ru","kz"}}."""
    i, k = (1, "kz") if lang == "kz" else (0, "ru")
    lines = [f"Кейс {c['id']} · {c['title'][k]} · класс {c['grade']}", c["text"][k], "Варианты действий:"]
    for n, o in enumerate(c["options"], 1):
        lines.append(f"{n}) {o[k]} [оценка эксперта: {OC[o['oc']][i]}] Последствия: {o['cons'][k]}")
    lines.append("Ключевые принципы: " + "; ".join(principles[p][k] for p in c["principles"]))
    lines.append("Вопросы для диалога: " + " | ".join(q[k] for q in c["ai"]))
    return "\n".join(lines)


def catalog_text(cards, lang, categories):
    """Формат навигации = формат обучения."""
    k = k_of(lang)
    rows = "\n".join(f"- {c['id']} · {c['title'][k]} · {', '.join(categories[x][k] for x in c['cats'])} · {c['short'][k]}" for c in cards)
    return "Каталог e-book — результаты поиска по запросу пользователя:\n" + rows


def clean_history(history, redact):
    """Как в эталоне: только user/assistant, фильтр ПДн в репликах пользователя, история начинается с user,
    обрезка с начала целыми парами, последней должна быть реплика пользователя."""
    hist, pii = [], False
    for m in history or []:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant") or not isinstance(m.get("content"), str):
            continue
        content = m["content"]
        if m["role"] == "user":
            content, h = redact(content)
            pii |= h
        hist.append({"role": m["role"], "content": content})
    while hist and hist[0]["role"] != "user":
        hist.pop(0)
    while sum(len(m["content"]) for m in hist) > MAX_HISTORY_CHARS and len(hist) > 2:
        hist = hist[2:]
    if not hist or hist[-1]["role"] != "user":
        raise ValueError("история должна заканчиваться репликой пользователя")
    return hist, pii


def build_messages(system_prompt, card, hist, lang, mode, stage, principles, categories, found=None):
    """card — карта кейса или None (навигация, тогда found — результаты поиска).
    mode == "teacher" передавать только для проверенной роли преподавателя (см. app.py)."""
    if card:
        mats = card_text(card, lang, principles)
        if mode == "teacher":
            mats += TEACHER_MARK + card["expert"][lang]
        elif REFLECTION_ENABLED and stage == "reflection":
            mats += REFLECT_MARK + card["expert"][lang]
    else:
        mats = catalog_text(found or [], lang, categories)
    system = system_prompt + "\n\n<материалы>\n" + mats + "\n</материалы>"
    return [{"role": "system", "content": system}] + hist
