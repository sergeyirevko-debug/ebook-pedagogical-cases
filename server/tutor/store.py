"""Хранилище сервиса (SQLite): согласия, диалоги и жалобы на ответы AI.

Тексты диалогов — персональные данные. Правила:
  * ничего не пишется без записанного согласия пользователя (POST /api/consent);
  * диалоги сохраняются, только если включено STORE_DIALOGS=1; хранятся DIALOG_RETENTION_DAYS дней;
  * при отзыве согласия (DELETE /api/consent) диалоги пользователя удаляются, жалобы обезличиваются;
  * вместо ФИО — псевдоним; реплики пользователя хранятся уже после фильтра ПДн.
"""
import json, sqlite3, threading, time

SCHEMA = """
CREATE TABLE IF NOT EXISTS consent (pseud TEXT PRIMARY KEY, version TEXT NOT NULL, at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS dialogs (id INTEGER PRIMARY KEY, pseud TEXT, case_id TEXT, lang TEXT, user_text TEXT, reply TEXT, at REAL);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, pseud TEXT, case_id TEXT, lang TEXT, context TEXT, reply TEXT,
                                    comment TEXT, status TEXT DEFAULT 'open', at REAL);
CREATE INDEX IF NOT EXISTS dialogs_at ON dialogs(at);
"""


class Store:
    def __init__(self, path, store_dialogs=False, retention_days=180):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript(SCHEMA)
        self.lock = threading.Lock()
        self.store_dialogs, self.retention = store_dialogs, retention_days * 86400

    def _q(self, sql, args=()):
        with self.lock:
            cur = self.db.execute(sql, args)
            self.db.commit()
            return cur.fetchall()

    def consent(self, pseud):
        r = self._q("SELECT version FROM consent WHERE pseud=?", (pseud,))
        return r[0][0] if r else None

    def give_consent(self, pseud, version):
        self._q("INSERT OR REPLACE INTO consent VALUES (?,?,?)", (pseud, version, time.time()))

    def withdraw(self, pseud):
        self._q("DELETE FROM consent WHERE pseud=?", (pseud,))
        self._q("DELETE FROM dialogs WHERE pseud=?", (pseud,))
        self._q("UPDATE reports SET pseud='withdrawn', context='[]' WHERE pseud=?", (pseud,))

    def save_turn(self, pseud, case_id, lang, user_text, reply):
        if self.store_dialogs and self.consent(pseud):
            self._q("INSERT INTO dialogs (pseud, case_id, lang, user_text, reply, at) VALUES (?,?,?,?,?,?)",
                    (pseud, case_id, lang, user_text, reply, time.time()))

    def add_report(self, pseud, case_id, lang, context, reply, comment):
        if not self.consent(pseud):
            return None
        self._q("INSERT INTO reports (pseud, case_id, lang, context, reply, comment, at) VALUES (?,?,?,?,?,?,?)",
                (pseud, case_id, lang, json.dumps(context, ensure_ascii=False), reply, comment, time.time()))
        return self._q("SELECT last_insert_rowid()")[0][0]

    def open_reports(self, limit=50):
        rows = self._q("SELECT id, pseud, case_id, lang, context, reply, comment, at FROM reports WHERE status='open' ORDER BY at DESC LIMIT ?", (limit,))
        return [dict(id=r[0], who=r[1], caseId=r[2], lang=r[3], context=json.loads(r[4]), reply=r[5], comment=r[6], at=r[7]) for r in rows]

    def resolve_report(self, rid):
        self._q("UPDATE reports SET status='resolved' WHERE id=?", (rid,))

    def cleanup(self):
        self._q("DELETE FROM dialogs WHERE at < ?", (time.time() - self.retention,))
