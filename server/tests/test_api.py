"""Сквозные проверки сервиса на заглушке llama-server (tests/mock_llama.py): поток, роли, ПДн, лимиты,
очередь, недоступность модели, согласие, жалобы, вход по OIDC.

    python -m unittest tests.test_api
"""
import base64, json, os, sys, tempfile, threading, time, unittest, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import mock_llama  # noqa: E402

TMP = tempfile.mkdtemp()
DUMP = os.path.join(TMP, "last.json")


def serve(handler, port=0):
    srv = ThreadingHTTPServer(("127.0.0.1", port), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


LLAMA = serve(mock_llama.H)
mock_llama.H.dump, mock_llama.H.delay = DUMP, 0.01
os.environ.update({
    "LLM_URL": f"http://127.0.0.1:{LLAMA.server_port}", "AUTH_MODE": "demo", "DB_PATH": os.path.join(TMP, "t.db"),
    "CARDS_SOURCE": "file:" + str(HERE.parent / "data" / "cases.json"), "STORE_DIALOGS": "1",
    "RATE_PER_MIN": "100", "WARMUP": "", "SLOTS": "2", "QUEUE": "1", "QUEUE_WAIT": "1",
})
from tutor import app  # noqa: E402

app.TUTOR = app.Tutor()
API = serve(app.Handler)
BASE = f"http://127.0.0.1:{API.server_port}"
STUDENT = {"X-Ebook-Pseudonym": "p-a1b2c3", "X-Ebook-Role": "student"}
TEACHER = {"X-Ebook-Pseudonym": "p-000aaa", "X-Ebook-Role": "teacher"}
EXPERT = {"X-Ebook-Pseudonym": "p-e0e0e0", "X-Ebook-Role": "expert"}


def call(path, body=None, headers=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data else "GET"),
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw, code, hdr = r.read().decode(), r.status, r.headers
    except urllib.error.HTTPError as e:
        raw, code, hdr = e.read().decode(), e.code, e.headers
    if hdr.get("Content-Type", "").startswith("text/event-stream"):
        return code, [json.loads(l[5:]) for l in raw.splitlines() if l.startswith("data:")], hdr
    return code, json.loads(raw) if raw else None, hdr


def dump():
    with open(DUMP, encoding="utf-8") as f:
        return json.load(f)


def last_system():
    return dump()["messages"][0]["content"]


H1 = [{"role": "user", "content": "Менің ойымша, телефондарды сабақ соңына дейін жинап алу керек."}]


class Api(unittest.TestCase):
    def test_health_and_cases(self):
        code, j, _ = call("/api/tutor/health")
        self.assertEqual((code, j["ok"], j["cards"]), (200, True, 5))
        code, j, _ = call("/api/tutor/cases")
        self.assertEqual([c["id"] for c in j], ["PS-018", "PS-027", "PS-041", "PS-057", "PS-083"])

    def test_auth_required_and_roles(self):
        self.assertEqual(call("/api/tutor", {"caseId": "PS-018", "lang": "kz", "history": H1})[0], 401)
        admin = {"X-Ebook-Pseudonym": "p-ad0000", "X-Ebook-Role": "admin"}
        self.assertEqual(call("/api/tutor", {"caseId": "PS-018", "lang": "kz", "history": H1}, admin)[0], 403)

    def test_stream_case_kz(self):
        code, evs, hdr = call("/api/tutor", {"caseId": "PS-018", "lang": "kz", "history": H1, "stream": True}, STUDENT)
        self.assertEqual(code, 200)
        self.assertEqual(hdr["X-Accel-Buffering"], "no")
        text = "".join(e.get("delta", "") for e in evs)
        self.assertIn("[AI-ұсыныс]", text)
        self.assertEqual(evs[-1], {"done": True, "label": "Жауапты AI жасады", "pii_redacted": False, "suggest": []})
        body = dump()
        self.assertEqual(body["chat_template_kwargs"], {"enable_thinking": False})
        self.assertTrue(body["cache_prompt"])
        sys_ = last_system()
        self.assertIn("<материалы>\nКейс PS-018 · Сабақтағы смартфон · класс 7–9", sys_)
        self.assertIn("[оценка эксперта: Сындарлы]", sys_)
        self.assertNotIn("Экспертный комментарий", sys_)

    def test_teacher_mode_only_for_teacher(self):
        call("/api/tutor", {"caseId": "PS-018", "lang": "ru", "mode": "teacher", "history": H1}, STUDENT)
        self.assertNotIn("Экспертный комментарий", last_system())  # студент не получит экспертный комментарий
        code, j, _ = call("/api/tutor", {"caseId": "PS-018", "lang": "ru", "mode": "teacher", "history": H1}, TEACHER)
        self.assertEqual(code, 200)
        self.assertIn("Экспертный комментарий (доступен преподавателю): ", last_system())

    def test_reflection_off_for_v1(self):
        call("/api/tutor", {"caseId": "PS-018", "lang": "ru", "stage": "reflection", "history": H1}, STUDENT)
        self.assertNotIn("Экспертный комментарий", last_system())

    def test_navigation_suggests_only_published(self):
        q = [{"role": "user", "content": "Есть кейс про ребёнка с аутизмом и групповую работу? Ученик Данияр Нурланов, тел. 8 701 123 45 67"}]
        code, j, _ = call("/api/tutor", {"caseId": None, "lang": "ru", "history": q}, STUDENT)
        self.assertEqual(code, 200)
        self.assertTrue(j["pii_redacted"])
        self.assertEqual(j["suggest"][0], "PS-083")
        self.assertTrue(set(j["suggest"]) <= {"PS-018", "PS-027", "PS-041", "PS-057", "PS-083"})
        user = dump()["messages"][-1]["content"]
        self.assertNotIn("Данияр", user)
        self.assertNotIn("701", user)

    def test_case_names_not_redacted(self):
        q = [{"role": "user", "content": "Арманға сенуге бола ма? Ол шынымен ақпарат іздеп отыр ма?"}]
        code, j, _ = call("/api/tutor", {"caseId": "PS-018", "lang": "kz", "history": q}, STUDENT)
        self.assertFalse(j["pii_redacted"])
        self.assertIn("Арманға", dump()["messages"][-1]["content"])

    def test_bad_requests(self):
        self.assertEqual(call("/api/tutor", {"caseId": "PS-018", "history": []}, STUDENT)[0], 400)
        self.assertEqual(call("/api/tutor", {"caseId": "PS-018", "history": [{"role": "assistant", "content": "x"}]}, STUDENT)[0], 400)
        self.assertEqual(call("/api/tutor", {"history": [{"role": "user", "content": "x" * 5000}]}, STUDENT)[0], 400)

    def test_queue_busy(self):
        mock_llama.H.delay = 0.3
        res = []
        def go(i):
            res.append(call("/api/tutor", {"caseId": "PS-027", "lang": "ru", "history": H1, "stream": True},
                            {"X-Ebook-Pseudonym": f"p-00000{i}", "X-Ebook-Role": "student"})[0])
        ts = [threading.Thread(target=go, args=(i,)) for i in range(8)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        mock_llama.H.delay = 0.01
        self.assertIn(503, res)  # 2 слота + 1 в очереди, остальным — «занято»
        self.assertIn(200, res)

    def test_consent_reports_dialogs(self):
        who = {"X-Ebook-Pseudonym": "p-c0ffee", "X-Ebook-Role": "student"}
        rep = {"caseId": "PS-018", "lang": "ru", "history": H1, "reply": "плохой ответ", "comment": "Звоните 87011234567"}
        self.assertEqual(call("/api/tutor/report", rep, who)[0], 409)  # без согласия ничего не храним
        self.assertEqual(call("/api/consent", {"version": "1.0 · 2026-10"}, who)[0], 200)
        call("/api/tutor", {"caseId": "PS-018", "lang": "ru", "history": H1}, who)
        self.assertEqual(app.TUTOR.db._q("SELECT count(*) FROM dialogs WHERE pseud='p-c0ffee'")[0][0], 1)
        self.assertEqual(call("/api/tutor/report", rep, who)[0], 201)
        self.assertEqual(call("/api/tutor/reports", headers=who)[0], 403)
        code, lst, _ = call("/api/tutor/reports", headers=EXPERT)
        mine = [r for r in lst if r["who"] == "p-c0ffee"]
        self.assertEqual(len(mine), 1)
        self.assertNotIn("8701", mine[0]["comment"])
        self.assertEqual(call(f"/api/tutor/reports/{mine[0]['id']}/resolve", {}, EXPERT)[0], 200)
        self.assertEqual(call("/api/consent", headers=who, method="DELETE")[0], 200)
        self.assertEqual(app.TUTOR.db._q("SELECT count(*) FROM dialogs WHERE pseud='p-c0ffee'")[0][0], 0)

    def test_no_dialog_without_consent(self):
        who = {"X-Ebook-Pseudonym": "p-dead00", "X-Ebook-Role": "student"}
        call("/api/tutor", {"caseId": "PS-018", "lang": "ru", "history": H1}, who)
        self.assertEqual(app.TUTOR.db._q("SELECT count(*) FROM dialogs WHERE pseud='p-dead00'")[0][0], 0)

    def test_llm_down_502(self):
        old = app.TUTOR.llm.url
        app.TUTOR.llm.url = "http://127.0.0.1:9"
        try:
            for stream in (False, True):
                self.assertEqual(call("/api/tutor", {"caseId": "PS-018", "lang": "kz", "history": H1, "stream": stream}, STUDENT)[0], 502)
            self.assertEqual(call("/api/tutor/health")[0], 503)
        finally:
            app.TUTOR.llm.url = old

    def test_rate_limit(self):
        from tutor.limits import RateLimiter
        rl = RateLimiter(per_min=3, per_day=10)
        self.assertEqual([rl.check("x") for _ in range(3)], [None] * 3)
        self.assertGreater(rl.check("x"), 0)
        self.assertIsNone(rl.check("y"))


class Embeddings(unittest.TestCase):
    def test_search_and_fallback(self):
        from tutor.search import EmbeddingSearch, KeywordSearch
        kw = KeywordSearch(app.TUTOR.cards)
        es = EmbeddingSearch(app.TUTOR.cards, app.TUTOR.llm.url, kw)
        es.rebuild()
        self.assertEqual(len(es.index), 5)
        self.assertEqual(len(es("смартфон на уроке", "ru")), 4)
        dead = EmbeddingSearch(app.TUTOR.cards, "http://127.0.0.1:9", kw)
        dead.rebuild()
        self.assertEqual([c["id"] for c in dead("аутизм групповая работа", "ru")], [c["id"] for c in kw("аутизм групповая работа", "ru")])


class Oidc(unittest.TestCase):
    """Вход по токену Keycloak: подпись RS256, издатель, аудитория, роль, псевдоним."""

    @classmethod
    def setUpClass(cls):
        import jwt
        from cryptography.hazmat.primitives.asymmetric import rsa
        cls.jwt = jwt
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pub = cls.key.public_key().public_numbers()
        b64 = lambda n: base64.urlsafe_b64encode(n.to_bytes((n.bit_length() + 7) // 8, "big")).rstrip(b"=").decode()
        jwks = json.dumps({"keys": [{"kty": "RSA", "kid": "k1", "use": "sig", "alg": "RS256", "n": b64(pub.n), "e": b64(pub.e)}]}).encode()

        class J(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(jwks)
            def log_message(self, *a):
                pass
        cls.srv = serve(J)
        os.environ.update({"OIDC_JWKS_URL": f"http://127.0.0.1:{cls.srv.server_port}/certs", "OIDC_ISSUER": "https://sso.vku.edu.kz/realms/ebook",
                           "OIDC_AUDIENCE": "ebook", "PSEUDONYM_SALT": "test-salt"})
        from tutor.auth import Authenticator
        cls.auth = Authenticator("oidc")

    def token(self, **over):
        claims = {"sub": "user-42", "iss": "https://sso.vku.edu.kz/realms/ebook", "aud": "ebook", "exp": int(time.time()) + 300,
                  "realm_access": {"roles": ["student", "offline_access"]}, "name": "Айдана Серикова"} | over
        return "Bearer " + self.jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "k1"})

    def test_valid(self):
        p = self.auth.authenticate({"Authorization": self.token()})
        self.assertEqual(p.role, "student")
        self.assertRegex(p.pseud, r"^u-[0-9a-f]{12}$")
        self.assertNotIn("Айдана", p.pseud)

    def test_rejects(self):
        from tutor.auth import AuthError
        for bad in (self.token(aud="other"), self.token(iss="https://evil"), self.token(exp=int(time.time()) - 10), "Bearer x.y.z", ""):
            with self.assertRaises(AuthError):
                self.auth.authenticate({"Authorization": bad})
        with self.assertRaises(AuthError):
            self.auth.authenticate({"Authorization": self.token(realm_access={"roles": ["offline_access"]})})


if __name__ == "__main__":
    unittest.main()
