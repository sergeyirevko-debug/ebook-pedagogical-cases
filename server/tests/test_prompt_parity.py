"""Побайтная сверка промпта с эталоном комплекта (server/tutor_server.py из ebook-ai-tutor-bundle).

    BUNDLE_DIR=/path/to/ebook-ai-tutor-bundle python -m unittest tests.test_prompt_parity

Проверяет все карты (5 с сайта + 112 сгенерированных), оба языка, режимы student/teacher, навигацию,
фильтр ПДн и обрезку истории. Если тест падает — формат промпта разошёлся с тем, на котором обучена модель.
"""
import importlib.util, json, os, sys, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from tutor import prompt  # noqa: E402
from tutor.cards import CardStore  # noqa: E402
from tutor.search import KeywordSearch  # noqa: E402

BUNDLE = Path(os.environ.get("BUNDLE_DIR", "/mnt/user-data/uploads/ebook-ai-tutor-bundle"))


def load_reference():
    spec = importlib.util.spec_from_file_location("ref_tutor", BUNDLE / "server" / "tutor_server.py")
    ref = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ref)
    return ref


@unittest.skipUnless((BUNDLE / "server" / "tutor_server.py").exists(), "нет комплекта ebook-ai-tutor-bundle")
class PromptParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ref = load_reference()
        site = json.loads((BUNDLE / "data" / "site_cases.json").read_text(encoding="utf-8"))
        export = {"categories": site["categories"], "principles": site["principles"], "cases": list(cls.ref.CARDS.values())}
        cls.tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(export, cls.tmp, ensure_ascii=False)
        cls.tmp.close()
        cls.store = CardStore("file:" + cls.tmp.name, refresh=0)
        cls.search = KeywordSearch(cls.store)
        cls.sp = prompt.load_system_prompt()

    @classmethod
    def tearDownClass(cls):
        os.unlink(cls.tmp.name)

    def ours(self, req):
        cards, princ, cats = self.store.snapshot()
        card = cards.get(req.get("caseId") or "")
        lang = prompt.k_of(req.get("lang"))
        hist, pii = prompt.clean_history(req["history"], self.ref.redact)  # фильтр эталона: сверяем сборку, а не словарь имён
        found = None if card else self.search(" ".join(m["content"] for m in hist if m["role"] == "user"), lang)
        msgs = prompt.build_messages(self.sp, card, hist, lang, req.get("mode") or "student", req.get("stage"), princ, cats, found)
        return msgs, pii, [c["id"] for c in found] if found else []

    def check(self, req):
        ref_msgs, ref_lang, ref_pii, ref_suggest = self.ref.build_messages(req)
        msgs, pii, suggest = self.ours(req)
        self.assertEqual(json.dumps(msgs, ensure_ascii=False), json.dumps(ref_msgs, ensure_ascii=False), req.get("caseId"))
        self.assertEqual((pii, suggest), (ref_pii, ref_suggest))

    def test_system_prompt_identical(self):
        self.assertEqual(self.sp, self.ref.SYSTEM_PROMPT)

    def test_all_cards_validate(self):
        self.assertEqual(len(self.store.cards), len(self.ref.CARDS))

    def test_every_card_both_langs_both_modes(self):
        h = [{"role": "assistant", "content": "Сәлем!"}, {"role": "user", "content": "Менің ойымша, телефондарды жинап алу керек."}]
        for cid in self.ref.CARDS:
            for lang in ("kz", "ru"):
                for mode in ("student", "teacher"):
                    self.check({"caseId": cid, "lang": lang, "mode": mode, "history": h})
                self.check({"caseId": cid, "lang": lang, "stage": "reflection", "history": h})

    def test_navigation_and_pii(self):
        for lang, q in [("ru", "Мой номер 8 701 123 45 67. Есть кейсы, где ребёнок с аутизмом не выносит шум?"),
                        ("kz", "Сыныпта қорқыту, буллинг туралы кейс бар ма? Поштам a.b@mail.kz"),
                        ("ru", "абракадабра"), ("ru", "Родители недовольны оценкой за СОР")]:
            self.check({"caseId": None, "lang": lang, "history": [{"role": "user", "content": q}]})

    def test_long_history_trim(self):
        h = []
        for i in range(30):
            h += [{"role": "user", "content": f"Реплика {i} " + "слово " * 60}, {"role": "assistant", "content": "Ответ " * 50}]
        h.append({"role": "user", "content": "Итак?"})
        self.check({"caseId": "PS-027", "lang": "ru", "history": h})


if __name__ == "__main__":
    unittest.main()
