"""Диагностика Ollama: тот же запрос, что делает сервис тьютора (/api/generate, raw, промпт как при обучении).

    python server\\tools\\ollama_probe.py [--model ebook-4b] [--url http://127.0.0.1:11434]
Тексты реплик тестовые, без персональных данных — вывод можно пересылать.
"""
import argparse, json, sys, time, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tutor import prompt  # noqa: E402
from tutor.llm import LLM, render_prompt  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="ebook-4b")
ap.add_argument("--url", default="http://127.0.0.1:11434")
a = ap.parse_args()

print("версия Ollama:", urllib.request.urlopen(a.url + "/api/version").read().decode())
data = json.loads((Path(__file__).resolve().parent.parent / "data" / "cases.json").read_text(encoding="utf-8"))
princ = {p["id"]: p for p in data["principles"]}
cats = {c["id"]: c for c in data["categories"]}
card = next(c for c in data["cases"] if c["id"] == "PS-027")
msgs = prompt.build_messages(prompt.load_system_prompt(), card, [{"role": "user", "content": "Думаю, надо сразу вызвать родителей обоих учеников."}],
                             "ru", "student", None, princ, cats)
print("конец промпта:", repr(render_prompt(msgs)[-120:]))
llm = LLM(a.url, kind="ollama", model=a.model)
t0, first, text = time.time(), None, ""
for piece in llm.stream(msgs):
    first = first or time.time() - t0
    text += piece
print(f"\nпервый символ: {first or 0:.1f} с · весь ответ: {time.time() - t0:.1f} с · {len(text.split())} слов")
print(text)
