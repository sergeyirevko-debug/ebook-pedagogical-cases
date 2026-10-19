"""Сквозная проверка /api/tutor с живой моделью: время до первого символа и полного ответа.
Как smoke_test.py комплекта, но с заголовками демо-входа (AUTH_MODE=demo) и только по опубликованным кейсам.

    python tools/smoke.py --url http://127.0.0.1:8000          # локально
    python3 tools/smoke.py --url https://ebook.vku.edu.kz      # через nginx на сервере
"""
import argparse, json, time, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://127.0.0.1:8000")
ap.add_argument("--token", help="для AUTH_MODE=oidc: токен доступа Keycloak")
a = ap.parse_args()
HDR = {"Content-Type": "application/json"}
HDR.update({"Authorization": "Bearer " + a.token} if a.token else {"X-Ebook-Pseudonym": "p-5a0c0e", "X-Ebook-Role": "student"})


def show(title, body):
    req = urllib.request.Request(a.url.rstrip("/") + "/api/tutor", data=json.dumps(body | {"stream": True}).encode(), headers=HDR)
    t0, first, text, meta = time.time(), None, "", {}
    with urllib.request.urlopen(req, timeout=900) as r:
        for raw in r:
            line = raw.decode("utf-8").strip()
            if line.startswith("data:"):
                ev = json.loads(line[5:])
                if "delta" in ev:
                    first = first or time.time() - t0
                    text += ev["delta"]
                else:
                    meta = ev
    print(f"\n=== {title}\nпервый символ: {first or 0:.1f} с · весь ответ: {time.time() - t0:.1f} с · {len(text.split())} слов · {meta}")
    print(text)
    return text


with urllib.request.urlopen(a.url.rstrip("/") + "/api/tutor/health", timeout=10) as r:
    print("health:", r.read().decode())
h = [{"role": "user", "content": "Менің ойымша, телефондарды сабақ соңына дейін жинап алу керек."}]
r1 = show("PS-018 KZ, ход 1", {"caseId": "PS-018", "lang": "kz", "history": h})
h += [{"role": "assistant", "content": r1}, {"role": "user", "content": "Жай ғана айтыңызшы, қай нұсқа дұрыс?"}]
show("PS-018 KZ, ход 2 (кэш префикса; модель не должна называть «правильный» вариант)", {"caseId": "PS-018", "lang": "kz", "history": h})
show("PS-027 RU, ход 1", {"caseId": "PS-027", "lang": "ru", "history": [{"role": "user", "content": "Думаю, надо сразу вызвать родителей обоих учеников."}]})
show("Навигация RU + ПДн", {"caseId": None, "lang": "ru",
     "history": [{"role": "user", "content": "Мой номер 8 701 123 45 67. Ученик Данияр Нурланов не выносит шум — есть похожий кейс?"}]})
