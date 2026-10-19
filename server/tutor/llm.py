"""Клиент модели. Параметры генерации — как при тестировании модели (docs/INTEGRATION.md комплекта, п. 3).

kind="llama"  — llama-server, OpenAI-совместимый /v1/chat/completions с --jinja, enable_thinking=false
                (основной вариант: так модель тестировалась; так работает сервер университета).
kind="ollama" — Ollama (удобно локально). Ollama 0.34 применяет к модели собственный разбор «рассуждений» Qwen
                и шаблон из GGUF, из-за чего ответ уходил в поле reasoning, а модель начинала рассуждать вслух.
                Поэтому промпт собирается здесь, ровно как chat_template.jinja модели при enable_thinking=false
                (render_prompt, сверка — tests/test_ollama_prompt.py), и отправляется в /api/generate с raw=true:
                Ollama не трогает ни шаблон, ни режим рассуждений.
"""
import json, re, urllib.error, urllib.request

GEN = {"max_tokens": 400, "temperature": 0.6, "top_p": 0.8, "top_k": 20, "presence_penalty": 1.0,
       "chat_template_kwargs": {"enable_thinking": False}, "cache_prompt": True}
OLLAMA_OPTIONS = {"temperature": 0.6, "top_p": 0.8, "top_k": 20, "presence_penalty": 1.0, "num_predict": 400,
                  "num_ctx": 8192, "stop": ["<|im_end|>", "<|endoftext|>"]}
THINK = re.compile(r"<think>.*?</think>\s*", re.S)


def render_prompt(messages):
    """chat_template.jinja модели (Qwen3.5) для случая: без инструментов, последняя реплика — пользователя,
    add_generation_prompt=true, enable_thinking=false. Содержимое обрезается (|trim), как в шаблоне."""
    out = []
    for m in messages:
        content = m["content"].strip()
        if m["role"] == "assistant" and "</think>" in content:
            content = content.split("</think>")[-1].lstrip("\n")
        out.append(f"<|im_start|>{m['role']}\n{content}<|im_end|>\n")
    return "".join(out) + "<|im_start|>assistant\n<think>\n\n</think>\n\n"


class LLMUnavailable(Exception):
    pass


class LLM:
    def __init__(self, url, timeout=300, model="", kind="llama"):
        self.url, self.timeout, self.model, self.kind = url.rstrip("/"), timeout, model, kind

    def _open(self, path, body):
        req = urllib.request.Request(self.url + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        try:
            return urllib.request.urlopen(req, timeout=self.timeout)
        except (urllib.error.URLError, OSError) as e:
            raise LLMUnavailable(str(e))

    def _request(self, messages, stream, max_tokens=None):
        if self.kind == "ollama":
            opts = dict(OLLAMA_OPTIONS, **({"num_predict": max_tokens} if max_tokens else {}))
            return "/api/generate", {"model": self.model, "prompt": render_prompt(messages), "raw": True, "think": False,
                                     "stream": stream, "keep_alive": "30m", "options": opts}
        body = dict(GEN, messages=messages, stream=stream)
        if max_tokens:
            body["max_tokens"] = max_tokens
        if self.model:
            body["model"] = self.model
        return "/v1/chat/completions", body

    def complete(self, messages, max_tokens=None):
        path, body = self._request(messages, False, max_tokens)
        with self._open(path, body) as r:
            j = json.loads(r.read())
        text = j.get("response", "") if self.kind == "ollama" else j["choices"][0]["message"].get("content") or ""
        return THINK.sub("", text)

    def stream(self, messages):
        """Генератор кусочков текста. Закрытие генератора (клиент ушёл) закрывает соединение —
        сервер модели прекращает генерацию и освобождает слот."""
        path, body = self._request(messages, True)
        resp = self._open(path, body)
        try:
            for raw in resp:
                line = raw.decode("utf-8").strip()
                if self.kind == "ollama":  # NDJSON: {"response": "...", "done": false}
                    if not line:
                        continue
                    ev = json.loads(line)
                    if ev.get("error"):
                        raise RuntimeError(str(ev["error"]))
                    if ev.get("response"):
                        yield ev["response"]  # поле thinking (рассуждения) студенту не показываем
                    continue
                if not line.startswith("data:") or line == "data: [DONE]":
                    continue
                ev = json.loads(line[5:])
                if ev.get("error"):  # llama-server сообщает об ошибке событием в потоке
                    raise RuntimeError(str(ev["error"]))
                for ch in ev.get("choices", []):
                    piece = (ch.get("delta") or {}).get("content")
                    if piece:
                        yield piece
        finally:
            resp.close()

    def healthy(self):
        try:
            with urllib.request.urlopen(self.url + ("/api/version" if self.kind == "ollama" else "/health"), timeout=3) as r:
                return r.status == 200
        except Exception:
            return False
