"""Фильтр персональных данных в репликах пользователя (до отправки в модель).

1. Регулярки эталона: ИИН (12 цифр), телефоны, e-mail — без изменений.
2. Имена (дополнение к эталону): словарь казахских и русских имён (data/names.txt) и фамилии по окончаниям.
   Модель и сама обучена не повторять ФИО и просить обезличить; фильтр — страховка.
   Чтобы не мешать разбору кейса, не скрываются слова из текста текущей карты (в кейсах имена
   вымышлены и помечены *, например «Арман*»). Имена, совпадающие с обычными словами (AMBIGUOUS:
   арман — «мечта», бақыт — «счастье», Вера, Надежда…), скрываются только вместе с фамилией.
Метки вида «[… скрыт]» — как в эталоне: поиск по каталогу их игнорирует.
"""
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

PII = [
    (re.compile(r"\b\d{12}\b"), "[ИИН скрыт]"),
    (re.compile(r"(\+?7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}"), "[тел. скрыт]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[e-mail скрыт]"),
]
NAME_MARK = "[ФИО скрыт]"

NAMES = {w.strip().lower() for w in (DATA / "names.txt").read_text(encoding="utf-8").split() if w.strip() and not w.startswith("#")}
# имена, совпадающие с обычными словами (арман — «мечта», бақыт — «счастье», вера, надежда…)
AMBIGUOUS = {"арман", "бақыт", "бакыт", "сәуле", "сауле", "нұр", "нур", "жан", "вера", "надежда", "любовь", "роза",
             "слава", "лев", "мир", "ай", "айна", "әсем", "асем", "гүл", "гуль", "дана", "ерлік", "мейір", "шолпан", "жұлдыз", "жулдыз",
             "майя", "лилия"}
SURNAME = re.compile(r"^[А-ЯЁӘҒҚҢӨҰҮҺІ][а-яёәғқңөұүһі]+(?:(?:ов|ев|ёв|ин|ын)(?:а|у|е|ым|ой|ых|ою|ой)?|(?:ск|цк)(?:ий|ая|ого|ому|им|ой|ую)|енко|ук|юк|ұлы|улы|қызы|кызы)$")
PATRONYMIC = re.compile(r"^[А-ЯЁ][а-яё]+(?:ович|евич|ич|овна|евна|ична|инична)$")
# известные педагоги и деятели — не персональные данные
FAMOUS = {"выготский", "выготского", "выготскому", "макаренко", "сухомлинский", "сухомлинского", "ушинский", "ушинского",
          "алтынсарин", "алтынсарина", "алтынсарин", "байтұрсынов", "байтұрсынұлы", "байтурсынов", "абай", "абая", "абайдың",
          "песталоцци", "монтессори", "блум", "блума", "коменский", "коменского", "амонашвили", "занков", "эльконин", "давыдов"}
WORD = re.compile(r"[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі-]+")
SENT_END = re.compile(r"(^|[.!?…:\n]\s*)$")


def _base(w):
    """Имя без казахских/русских падежных окончаний: Арманға → арман, Айгерімнің → айгерім, Аслана → аслан."""
    w = w.lower()
    if w in NAMES:
        return w
    for suf in ("ның", "нің", "дың", "дің", "тың", "тің", "ға", "ге", "қа", "ке", "на", "не", "ны", "ні", "ды", "ді", "ты", "ті",
                "дан", "ден", "тан", "тен", "нан", "нен", "мен", "бен", "пен", "да", "де", "та", "те",
                "ой", "ей", "ом", "ем", "ою", "ею", "а", "я", "у", "ю", "е", "ы", "и"):
        if w.endswith(suf) and w[: -len(suf)] in NAMES:
            return w[: -len(suf)]
    return None


def make_redactor(whitelist_text=""):
    """whitelist_text — текст карты текущего кейса: встречающиеся в нём слова не скрываются."""
    allow = {w.lower() for w in WORD.findall(whitelist_text or "")}
    allow |= {_base(w) for w in allow if _base(w)}

    def redact(text):
        hit = False
        for rx, rep in PII:
            text, n = rx.subn(rep, text)
            hit |= n > 0
        out, last = [], 0
        tokens = list(WORD.finditer(text))
        drop = set()

        def kind(m):
            w = m.group()
            if not w[0].isupper() or w.lower() in allow or w.lower() in FAMOUS:
                return None
            name = _base(w)
            if name:
                return None if name in allow else ("A" if name in AMBIGUOUS else "N")
            if PATRONYMIC.match(w) or SURNAME.match(w):
                return "S"
            return None

        # группы подряд идущих слов с заглавной буквы: «Иванова Анна», «Ерлан Касымович», «Бақыт Серікова»
        i = 0
        while i < len(tokens):
            run = [i]
            while run[-1] + 1 < len(tokens) and text[tokens[run[-1]].end(): tokens[run[-1] + 1].start()].strip() == "" \
                    and tokens[run[-1] + 1].group()[0].isupper():
                run.append(run[-1] + 1)
            kinds = {j: kind(tokens[j]) for j in run}
            has_name = any(k in ("N", "A") for k in kinds.values())
            has_sur = any(k == "S" for k in kinds.values())
            for j, k in kinds.items():
                if k == "N" or (k == "A" and has_sur) or (k == "S" and has_name):
                    drop.add(j)
                elif k == "S" and len(tokens[j].group()) > 4 and not SENT_END.search(text[: tokens[j].start()]):
                    drop.add(j)  # одиночная фамилия посреди предложения: «…сказал Петрову»
            i = run[-1] + 1
        if drop:
            hit = True
            for idx in sorted(drop):
                m = tokens[idx]
                if idx - 1 in drop and text[tokens[idx - 1].end(): m.start()].strip() == "":
                    last = m.end()  # склеиваем «Имя Фамилия» в одну метку
                    continue
                out.append(text[last: m.start()])
                out.append(NAME_MARK)
                last = m.end()
            out.append(text[last:])
            text = "".join(out)
        return text, hit

    return redact
