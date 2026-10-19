"""Сервис AI-тьютора e-book: POST /api/tutor и служебные эндпоинты.

Основа — эталон server/tutor_server.py из комплекта ebook-ai-tutor-bundle (промпт и формат карт без изменений),
плюс то, что эталон делает упрощённо (docs/INTEGRATION.md, п. 6): карты только опубликованных кейсов,
аутентификация, лимиты, фильтр имён, поиск на векторах, хранение диалогов только по согласию, жалобы.
Только стандартная библиотека Python 3.10+ (PyJWT[crypto] — лишь для AUTH_MODE=oidc).

    python -m tutor.app            # настройки — переменные окружения, см. deploy/tutor.env.example

Эндпоинты (все ответы JSON, кроме потока):
  POST /api/tutor                  {caseId, history, lang, mode?, stream?, stage?} → {reply, label, pii_redacted, suggest}
                                   stream:true → text/event-stream: data:{"delta"} … data:{"done", label, pii_redacted, suggest}
  GET  /api/tutor/health           {ok, llm, cards}
  GET  /api/tutor/cases            опубликованные кейсы, которые видит тьютор: [{id, title}]
  POST /api/tutor/report           жалоба «Сообщить о некорректном ответе» {caseId, lang, history, reply, comment?}
  GET  /api/tutor/reports          очередь жалоб (роль «эксперт»); POST /api/tutor/reports/<id>/resolve
  POST /api/consent {version}      согласие на обработку ПДн; DELETE /api/consent — отзыв (удаляет диалоги)
"""
import json, logging, os, re, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import prompt
from .auth import AI_ROLES, REVIEW_ROLES, TEACHER_MODE_ROLES, AuthError, Authenticator
from .cards import CardStore
from .limits import Busy, Gate, RateLimiter
from .llm import LLM, LLMUnavailable
from .pii import make_redactor
from .search import EmbeddingSearch, KeywordSearch
from .store import Store

log = logging.getLogger("tutor")
MAX_BODY = 64 * 1024
MAX_TURNS = 40
MAX_MSG = 4000


def env(name, default):
    v = os.environ.get(name)
    return type(default)(v) if v is not None and not isinstance(default, bool) else (v in ("1", "true", "yes") if v is not None else default)


class Tutor:
    def __init__(self):
        self.system_prompt = prompt.load_system_prompt()
        self.llm = LLM(env("LLM_URL", "http://127.0.0.1:8080"), timeout=env("LLM_TIMEOUT", 300),
                       model=env("LLM_MODEL", ""), kind=env("LLM_KIND", "llama"))
        self.auth = Authenticator(env("AUTH_MODE", "oidc"))
        self.limiter = RateLimiter(env("RATE_PER_MIN", 6), env("RATE_PER_DAY", 200))
        self.gate = Gate(env("SLOTS", 4), env("QUEUE", 8), env("QUEUE_WAIT", 90))
        self.db = Store(env("DB_PATH", "tutor.db"), env("STORE_DIALOGS", False), env("DIALOG_RETENTION_DAYS", 180))
        self.cards = CardStore(env("CARDS_SOURCE", "file:data/cases.json"), env("CARDS_REFRESH", 300))
        self.keyword = KeywordSearch(self.cards)
        embed = env("EMBED_URL", "")
        self.search = EmbeddingSearch(self.cards, embed, self.keyword) if embed else self.keyword
        self.warm_langs = [x for x in env("WARMUP", "kz").split(",") if x]
        self.warm_max = env("WARMUP_MAX", 4)
        self.cards.on_change = self._cards_changed
        self._cards_changed(self.cards)

    # ---------- карты: прогрев кэша префикса и индекс поиска ----------
    def _cards_changed(self, store):
        if isinstance(self.search, EmbeddingSearch):
            threading.Thread(target=self.search.rebuild, daemon=True).start()
        if self.warm_langs and self.warm_max:
            threading.Thread(target=self.warmup, daemon=True, name="warmup").start()

    def warmup(self):
        """Один короткий запрос на кейс и язык: системный промпт + карта попадают в кэш llama-server
        (первый ответ студенту — секунды вместо ~45 с на CPU)."""
        cards, princ, cats = self.cards.snapshot()
        for cid in list(cards)[: self.warm_max]:
            for lang in self.warm_langs:
                msgs = prompt.build_messages(self.system_prompt, cards[cid], [{"role": "user", "content": "."}], lang, "student",
                                             None, princ, cats)
                try:
                    with self.gate:
                        self.llm.complete(msgs, max_tokens=1)
                except Exception as e:
                    log.info("прогрев пропущен (%s)", e)
                    return
        log.info("прогрев завершён")

    # ---------- сборка запроса к модели ----------
    def prepare(self, req, who):
        if not isinstance(req, dict):
            raise ValueError("ожидается JSON-объект")
        history = req.get("history")
        if not isinstance(history, list) or not history or len(history) > MAX_TURNS:
            raise ValueError(f"history: от 1 до {MAX_TURNS} реплик")
        if any(isinstance(m, dict) and isinstance(m.get("content"), str) and len(m["content"]) > MAX_MSG for m in history):
            raise ValueError(f"реплика длиннее {MAX_MSG} символов")
        lang = prompt.k_of(req.get("lang"))
        # экспертный комментарий (mode=teacher) — только проверенным ролям, не по слову клиента
        mode = "teacher" if req.get("mode") == "teacher" and who.role in TEACHER_MODE_ROLES else "student"
        cards, princ, cats = self.cards.snapshot()
        card = cards.get(req.get("caseId") or "")
        allow = " ".join(card[f][k] for f in ("title", "text") for k in ("ru", "kz")) if card else ""
        hist, pii = prompt.clean_history(history, make_redactor(allow))
        found = None if card else self.search(" ".join(m["content"] for m in hist if m["role"] == "user"), lang)
        msgs = prompt.build_messages(self.system_prompt, card, hist, lang, mode, req.get("stage"), princ, cats, found)
        meta = {"label": prompt.LABEL[lang], "pii_redacted": pii, "suggest": [c["id"] for c in found] if found else []}
        return msgs, meta, card["id"] if card else None, lang, hist[-1]["content"]


TUTOR = None
SITE_INDEX = os.path.join(os.environ["SITE_DIR"], "index.html") if os.environ.get("SITE_DIR") else None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    allow_origin = os.environ.get("ALLOW_ORIGIN", "")

    def log_message(self, fmt, *args):  # тексты реплик не логируем
        pass

    def _cors(self):
        if self.allow_origin:
            self.send_header("Access-Control-Allow-Origin", self.allow_origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Ebook-Pseudonym, X-Ebook-Role")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")

    def _json(self, code, obj, extra=None):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("слишком большой запрос")
        return json.loads(self.rfile.read(n) or b"{}")

    def _who(self, roles=AI_ROLES):
        who = TUTOR.auth.authenticate(self.headers)
        if who.role not in roles:
            raise AuthError(403, "недоступно для вашей роли")
        return who

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        try:
            if SITE_INDEX and self.path.split("?")[0] in ("/", "/index.html"):
                # только для локальной проверки (SITE_DIR): сайт и /api/tutor с одного адреса; на сервере сайт отдаёт nginx
                body = open(SITE_INDEX, "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                return self.wfile.write(body)
            if self.path == "/api/tutor/health":
                cards, _, _ = TUTOR.cards.snapshot()
                ok = TUTOR.llm.healthy()
                return self._json(200 if ok else 503, {"ok": ok, "llm": ok, "cards": len(cards)})
            if self.path == "/api/tutor/cases":
                cards, _, _ = TUTOR.cards.snapshot()
                return self._json(200, [{"id": c["id"], "title": c["title"]} for c in cards.values()])
            if self.path == "/api/tutor/reports":
                self._who(REVIEW_ROLES)
                return self._json(200, TUTOR.db.open_reports())
            self._json(404, {"error": "not found"})
        except AuthError as e:
            self._json(e.code, {"error": str(e)})

    def do_DELETE(self):
        try:
            if self.path == "/api/consent":
                who = self._who(AI_ROLES | {"admin"})
                TUTOR.db.withdraw(who.pseud)
                return self._json(200, {"ok": True})
            self._json(404, {"error": "not found"})
        except AuthError as e:
            self._json(e.code, {"error": str(e)})

    def do_POST(self):
        try:
            if self.path == "/api/tutor":
                return self.tutor()
            if self.path == "/api/consent":
                who = self._who(AI_ROLES | {"admin"})
                v = str(self._body().get("version") or "")[:40]
                if not v:
                    raise ValueError("нужна версия согласия")
                TUTOR.db.give_consent(who.pseud, v)
                return self._json(200, {"ok": True})
            if self.path == "/api/tutor/report":
                return self.report()
            m = re.fullmatch(r"/api/tutor/reports/(\d+)/resolve", self.path)
            if m:
                self._who(REVIEW_ROLES)
                TUTOR.db.resolve_report(int(m.group(1)))
                return self._json(200, {"ok": True})
            self._json(404, {"error": "not found"})
        except AuthError as e:
            self._json(e.code, {"error": str(e)})
        except (ValueError, json.JSONDecodeError) as e:
            self._json(400, {"error": str(e)})
        except Exception:
            log.exception("ошибка обработки %s", self.path)
            try:
                self._json(500, {"error": "внутренняя ошибка"})
            except OSError:
                pass

    def report(self):
        who = self._who()
        req = self._body()
        lang = prompt.k_of(req.get("lang"))
        redact = make_redactor("")
        ctx = [{"role": m["role"], "content": redact(m["content"][:MAX_MSG])[0] if m["role"] == "user" else m["content"][:MAX_MSG]}
               for m in (req.get("history") or [])[-12:] if isinstance(m, dict) and m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str)]
        rid = TUTOR.db.add_report(who.pseud, str(req.get("caseId") or "")[:40] or None, lang, ctx,
                                  str(req.get("reply") or "")[:MAX_MSG], redact(str(req.get("comment") or "")[:1000])[0])
        if rid is None:
            return self._json(409, {"error": "нет согласия на обработку данных"})
        self._json(201, {"id": rid})

    def tutor(self):
        t0 = time.time()
        who = self._who()
        wait = TUTOR.limiter.check(who.pseud)
        if wait:
            return self._json(429, {"error": "слишком много запросов"}, {"Retry-After": str(wait)})
        req = self._body()
        msgs, meta, case_id, lang, last_user = TUTOR.prepare(req, who)
        stream = bool(req.get("stream"))
        status, first, reply = "ok", None, ""
        try:
            with TUTOR.gate:
                if not stream:
                    reply = TUTOR.llm.complete(msgs)
                    self._json(200, {"reply": reply} | meta)
                else:
                    gen = TUTOR.llm.stream(msgs)
                    try:
                        try:  # ошибка модели до первого слова — ещё до заголовков потока, чтобы отдать 502
                            piece = next(gen, None)
                        except RuntimeError as e:
                            raise LLMUnavailable(str(e))
                        self.send_response(200)
                        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                        self.send_header("Cache-Control", "no-cache")
                        self.send_header("X-Accel-Buffering", "no")  # nginx: не копить поток
                        self.send_header("Connection", "close")
                        self._cors()
                        self.end_headers()
                        self.close_connection = True
                        while piece is not None:
                            first = first or time.time() - t0
                            reply += piece
                            self.wfile.write(f"data: {json.dumps({'delta': piece}, ensure_ascii=False)}\n\n".encode())
                            self.wfile.flush()
                            piece = next(gen, None)
                        self.wfile.write(f"data: {json.dumps({'done': True} | meta, ensure_ascii=False)}\n\n".encode())
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        status = "client_gone"
                    except LLMUnavailable:
                        raise
                    except Exception as e:  # обрыв генерации посреди ответа
                        status = "llm_error"
                        try:
                            self.wfile.write(f"data: {json.dumps({'error': 'генерация прервана'}, ensure_ascii=False)}\n\n".encode())
                            self.wfile.flush()
                        except OSError:
                            pass
                        log.warning("обрыв потока: %s", e)
                    finally:
                        gen.close()
        except Busy:
            status = "busy"
            return self._json(503, {"error": "AI-ассистент занят, попробуйте через минуту"}, {"Retry-After": "30"})
        except LLMUnavailable as e:
            status = "llm_down"
            log.error("llama-server недоступен: %s", e)
            return self._json(502, {"error": "AI временно недоступен"})
        finally:
            log.info(json.dumps({"who": who.pseud, "role": who.role, "case": case_id, "lang": lang, "stream": stream, "status": status,
                                 "first_s": round(first, 1) if first else None, "total_s": round(time.time() - t0, 1), "chars": len(reply)}))
        if status == "ok" and reply:
            TUTOR.db.save_turn(who.pseud, case_id, lang, last_user, reply)


def main():
    global TUTOR
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    TUTOR = Tutor()
    TUTOR.cards.start_refresh()

    def daily():
        while True:
            time.sleep(86400)
            TUTOR.db.cleanup()
    threading.Thread(target=daily, daemon=True).start()
    host, port = env("TUTOR_HOST", "127.0.0.1"), env("TUTOR_PORT", 8000)
    cards, _, _ = TUTOR.cards.snapshot()
    log.info("/api/tutor на http://%s:%s → %s · опубликованных карт: %d · вход: %s", host, port, TUTOR.llm.url, len(cards), TUTOR.auth.mode)
    srv = ThreadingHTTPServer((host, port), Handler)
    srv.daemon_threads = True
    srv.serve_forever()


if __name__ == "__main__":
    main()
