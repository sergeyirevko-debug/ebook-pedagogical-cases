"""Поиск по каталогу для навигационного чата (запрос без caseId).

KeywordSearch — алгоритм эталона (слова с весами редкости), но только по опубликованным картам.
EmbeddingSearch — смысловой поиск: ловит синонимы («буллинг» ≈ «травля»). Векторы считает отдельный
llama-server с моделью multilingual-e5-small в режиме --embeddings (без Python-зависимостей).
Если сервер векторов недоступен, поиск откатывается на KeywordSearch.
"""
import json, logging, math, re, threading, urllib.request

log = logging.getLogger("tutor.search")


def k_of(lang):
    return "kz" if lang == "kz" else "ru"


def clean_query(query):
    return re.sub(r"\[[^\]]*скрыт\]", " ", query)  # не искать по меткам скрытых ПДн


class KeywordSearch:
    def __init__(self, store):
        self.store = store

    def __call__(self, query, lang, n=4):
        cards, _, _ = self.store.snapshot()
        k = k_of(lang)
        words = {w[:4] for w in re.findall(r"[\w-]+", clean_query(query).lower()) if len(w) > 3}
        docs = {c["id"]: " ".join([c["title"][k], c["title"][k], c["short"][k], c["text"][k]]).lower() for c in cards.values()}
        idf = {w: math.log((1 + len(docs)) / (1 + sum(w in d for d in docs.values()))) for w in words}
        scored = sorted(((sum(idf[w] for w in words if w in hay), cid) for cid, hay in docs.items()), reverse=True)
        ids = [i for s, i in scored[:n] if s > 0] or list(cards)[:n]
        return [cards[i] for i in ids]


class EmbeddingSearch:
    """multilingual-e5: документы с префиксом «passage: », запрос — «query: ». Индекс по обоим языкам."""

    def __init__(self, store, url, fallback, timeout=10):
        self.store, self.url, self.fallback, self.timeout = store, url.rstrip("/"), fallback, timeout
        self.index, self._lock = {}, threading.Lock()

    def _embed(self, texts):
        body = json.dumps({"input": texts}).encode()
        req = urllib.request.Request(self.url + "/v1/embeddings", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            data = sorted(json.loads(r.read())["data"], key=lambda d: d["index"])
        out = []
        for d in data:
            v = d["embedding"]
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out

    def rebuild(self, store=None):
        cards, _, _ = self.store.snapshot()
        ids = list(cards)
        texts = [f"passage: {cards[i]['title'][k]}. {cards[i]['short'][k]} {cards[i]['text'][k]}" for i in ids for k in ("ru", "kz")]
        try:
            vecs = self._embed(texts) if texts else []
            index = {i: (vecs[2 * j], vecs[2 * j + 1]) for j, i in enumerate(ids)}
            with self._lock:
                self.index = index
            log.info("индекс векторов: %d кейсов", len(index))
        except Exception as e:
            log.warning("индекс векторов не построен (%s) — поиск по словам", e)

    def __call__(self, query, lang, n=4):
        cards, _, _ = self.store.snapshot()
        with self._lock:
            index = {i: v for i, v in self.index.items() if i in cards}
        if not index:
            return self.fallback(query, lang, n)
        try:
            q = self._embed(["query: " + clean_query(query)])[0]
        except Exception as e:
            log.warning("векторы недоступны (%s) — поиск по словам", e)
            return self.fallback(query, lang, n)
        score = {i: max(sum(a * b for a, b in zip(q, v)) for v in vs) for i, vs in index.items()}
        return [cards[i] for i in sorted(score, key=score.get, reverse=True)[:n]]
