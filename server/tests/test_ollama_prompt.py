"""Промпт для Ollama (raw) = chat_template.jinja модели при enable_thinking=false, на всех кейсах и в многоходовом диалоге.

    BUNDLE_DIR=/path/to/ebook-ai-tutor-bundle python -m unittest tests.test_ollama_prompt   (нужен jinja2)
"""
import json, os, sys, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from tutor import prompt  # noqa: E402
from tutor.llm import render_prompt  # noqa: E402

TPL = Path(os.environ.get("BUNDLE_DIR", "/mnt/user-data/uploads/ebook-ai-tutor-bundle")) / "models" / "lora-4B-v1" / "chat_template.jinja"
try:
    import jinja2
except ImportError:
    jinja2 = None


@unittest.skipUnless(jinja2 and TPL.exists(), "нужны jinja2 и chat_template.jinja комплекта")
class OllamaPrompt(unittest.TestCase):
    def test_matches_jinja(self):
        env = jinja2.Environment(extensions=["jinja2.ext.loopcontrols"])
        env.globals["raise_exception"] = lambda m: (_ for _ in ()).throw(Exception(m))
        tpl = env.from_string(TPL.read_text(encoding="utf-8"))
        data = json.loads((HERE.parent / "data" / "cases.json").read_text(encoding="utf-8"))
        princ = {p["id"]: p for p in data["principles"]}
        cats = {c["id"]: c for c in data["categories"]}
        sp = prompt.load_system_prompt()
        hist = [{"role": "user", "content": " Менің ойымша, жинап алу керек. "}, {"role": "assistant", "content": "Жақсы. [AI-ұсыныс] Неге?\n"},
                {"role": "user", "content": "Себебі тәртіп маңызды."}]
        n = 0
        for c in data["cases"] + [None]:
            for lang in ("kz", "ru"):
                for mode in ("student", "teacher"):
                    msgs = prompt.build_messages(sp, c, hist, lang, mode, None, princ, cats, found=data["cases"][:4])
                    self.assertEqual(render_prompt(msgs), tpl.render(messages=msgs, add_generation_prompt=True, enable_thinking=False))
                    n += 1
        self.assertEqual(n, 24)


if __name__ == "__main__":
    unittest.main()
