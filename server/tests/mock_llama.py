"""Заглушка llama-server для тестов: OpenAI-совместимые /v1/chat/completions (поток и без), /v1/embeddings, /health.
Записывает последний запрос в файл (--dump), чтобы тесты могли сверить промпт. Только стандартная библиотека.

    python mock_llama.py --port 8080 [--dump last.json] [--delay 0.02] [--fail]
"""
import argparse, hashlib, json, math, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPLY = "Жақсы бастама. [AI-ұсыныс] Алдымен анықтайық: Арман шынымен тақырып бойынша ақпарат іздеп отыр ма? Сіз мұны қалай тексерер едіңіз?"


def vec(text, dim=64):
    v = [0.0] * dim
    for w in text.lower().split():
        h = int(hashlib.md5(w[:5].encode()).hexdigest(), 16)
        v[h % dim] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


class H(BaseHTTPRequestHandler):
    dump = None
    delay = 0.02
    fail = False
    calls = 0

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/health":
            return self._json(503 if H.fail else 200, {"status": "ok"})
        self._json(404, {})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)))
        H.calls += 1
        if H.fail:
            return self._json(500, {"error": "model not loaded"})
        if self.path == "/v1/embeddings":
            inp = body["input"] if isinstance(body["input"], list) else [body["input"]]
            return self._json(200, {"data": [{"index": i, "embedding": vec(t)} for i, t in enumerate(inp)]})
        if self.path != "/v1/chat/completions":
            return self._json(404, {})
        if H.dump:
            with open(H.dump, "w", encoding="utf-8") as f:
                json.dump(body, f, ensure_ascii=False, indent=1)
        text = REPLY if body.get("max_tokens", 400) > 1 else "."
        if not body.get("stream"):
            return self._json(200, {"choices": [{"message": {"role": "assistant", "content": text}}]})
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for w in text.split(" "):
            ev = {"choices": [{"delta": {"content": w + " "}}]}
            self.wfile.write(f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode())
            self.wfile.flush()
            time.sleep(H.delay)
        self.wfile.write(b"data: [DONE]\n\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--dump")
    ap.add_argument("--delay", type=float, default=0.02)
    ap.add_argument("--fail", action="store_true")
    a = ap.parse_args()
    H.dump, H.delay, H.fail = a.dump, a.delay, a.fail
    ThreadingHTTPServer(("127.0.0.1", a.port), H).serve_forever()
