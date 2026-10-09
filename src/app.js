/* ============================================================
   E-BOOK · Банк педагогических ситуаций — прототип
   Маршрутизация по hash, двуязычный интерфейс (kz / ru),
   локальное хранение заметок и решений, демо AI-тьютор.
   ============================================================ */

/* ---------- хранилище (безопасно для file:// и приватного режима) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('ebook.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ebook.' + k, JSON.stringify(v)); } catch (e) {} },
};

let LANG = store.get('lang', 'kz');
const t = (o) => (o && typeof o === 'object') ? (o[LANG] ?? o.ru) : o;
const u = (k) => UI[LANG][k] ?? UI.ru[k] ?? k;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const caseById = (id) => CASES.find(c => c.id === id);
const catById = (id) => CATEGORIES.find(c => c.id === id);

/* ---------- иконки ---------- */
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  cases: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4M9 13h.01M15 13h.01M9.5 16h5"/><circle cx="12" cy="3.5" r="1"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 7h6M9 11h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  list: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  tick: '<path d="m5 12 5 5 9-10"/>',
  school1: '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M10 21v-5h4v5M10 11h4"/>',
  school2: '<path d="M2 21h20M4 21V9h16v12M12 3l8 6H4z"/><path d="M8 13h2M14 13h2M8 17h2M14 17h2"/>',
  school3: '<path d="M3 21h18M5 21V8h6v13M11 21V4h8v17"/><path d="M14 8h2M14 12h2M14 16h2M7 12h2M7 16h2"/>',
  inclusion: '<circle cx="12" cy="4.5" r="2"/><path d="M8 9h8M12 9v6M12 15l-3 6M12 15l3 6"/>',
  pin: '<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.5c2.6 0 4.6 1.6 5.5 4.5"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  scale: '<path d="M12 3v18M5 21h14M4 7h16M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M17 20h4M20 17v3"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  copy: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5a4 4 0 1 0 0 5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  teacher: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M7 20l2-4M17 20l-2-4M7 9h6M7 12h4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
};
const ic = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
const grad = (h) => `background:linear-gradient(135deg,hsl(${h} 70% 62%),hsl(${(h + 30) % 360} 65% 42%))`;
const catIcon = (c) => catById(c.cats[c.cats.length - 1])?.icon || 'cases';

/* ---------- состояние пользователя ---------- */
const getNotes = (id) => store.get('diag.' + id, {});
const getDecision = (id) => store.get('dec.' + id, null);
const portfolio = () => CASES.map(c => ({ c, d: getDecision(c.id) })).filter(x => x.d);
const bookmarks = () => store.get('bm', []);
function toggleBm(id) { const b = bookmarks(); const i = b.indexOf(id); i < 0 ? b.push(id) : b.splice(i, 1); store.set('bm', b); render(); }
function toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2400); }

/* ---------- шапка, навигация ---------- */
function header(route) {
  const items = [['home', 'nav_home'], ['about', 'nav_about'], ['catalog', 'nav_catalog'], ['video', 'nav_video'], ['ai', 'nav_ai'], ['materials', 'nav_materials'], ['teacher', 'nav_teacher']];
  return `<header class="top"><div class="wrap bar1">
    <a class="brand" href="#/home"><div class="logo">AU</div><small>${u('uni')}</small></a>
    <div class="tools">
      <span class="proto">${u('proto')}</span>
      <div class="lang" role="group" aria-label="Language">
        <button data-lang="kz" class="${LANG === 'kz' ? 'on' : ''}">ҚАЗ</button><button data-lang="ru" class="${LANG === 'ru' ? 'on' : ''}">РУС</button>
      </div>
      <a class="iconbtn" href="#/profile" title="${u('prof_title')}">${ic('user')}</a>
    </div></div>
    <div class="bar2"><nav class="wrap nav">${items.map(([r, k]) => `<a href="#/${r}" class="${route === r || (route === 'case' && r === 'catalog') ? 'on' : ''}">${u(k)}</a>`).join('')}</nav></div></header>`;
}
function tabbar(route) {
  const items = [['home', 'home', 'tab_home'], ['catalog', 'cases', 'tab_cases'], ['ai', 'bot', 'tab_ai'], ['video', 'video', 'tab_video'], ['profile', 'user', 'tab_profile']];
  return `<nav class="tabbar">${items.map(([r, i, k]) => `<a href="#/${r}" class="${route === r || (route === 'case' && r === 'catalog') ? 'on' : ''}">${ic(i)}<span>${u(k)}</span></a>`).join('')}</nav>`;
}

/* ---------- элементы ---------- */
function caseCard(c) {
  const done = getDecision(c.id);
  return `<a class="card ccard" href="#/case/${c.id}/desc">
    <div class="thumb" style="${grad(c.hue)}">${ic(catIcon(c))}</div>
    <div style="min-width:0;flex:1">
      <div class="code">${c.id}${done ? ` · <span style="color:var(--good)">✓</span>` : ''}</div>
      <h4>${esc(t(c.title))}</h4>
      <div class="row"><span class="chip">${esc(t(catById(c.cats[c.cats.length - 1])))}</span><span class="chip ${LEVELS[c.level].cls}">${t(LEVELS[c.level])}</span></div>
    </div>${ic('chev', 'muted')}</a>`;
}
function heroArt() {
  return `<svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMax slice">
    <path d="M0 230 L70 150 L120 190 L190 110 L260 180 L320 130 L400 200 L400 340 L0 340Z" fill="#ffffff" opacity=".35"/>
    <path d="M0 260 L90 200 L160 240 L240 190 L320 230 L400 210 L400 340 L0 340Z" fill="#ffffff" opacity=".45"/>
    <g fill="#f4f8ff" stroke="#bcd0f0"><rect x="70" y="170" width="250" height="120"/><rect x="160" y="140" width="70" height="150"/></g>
    <g fill="#8fb2e6">${Array.from({ length: 5 }, (_, r) => Array.from({ length: 8 }, (_, k) => k === 3 || k === 4 ? '' : `<rect x="${84 + k * 29}" y="${182 + r * 20}" width="16" height="11" rx="1"/>`).join('')).join('')}
      ${Array.from({ length: 6 }, (_, r) => `<rect x="172" y="${152 + r * 22}" width="18" height="12"/><rect x="200" y="${152 + r * 22}" width="18" height="12"/>`).join('')}</g>
    <rect x="0" y="288" width="400" height="52" fill="#e6efe0"/>
    <g fill="#2f7d5b">${[30, 345, 375, 50].map((x, i) => `<path d="M${x} ${300 - (i % 2) * 10} l14 -60 l14 60z"/>`).join('')}</g>
  </svg>`;
}

/* ---------- страницы ---------- */
function pageHome() {
  const counts = CATEGORIES.slice(0, 6);
  return `<section class="hero">
      <div class="hero-l">
        <h1>${u('hero_title')}<span>${u('hero_sub')}</span></h1>
        <p class="lead">${u('hero_lead')}</p>
        <form class="search" id="hsearch">${ic('search', 'muted')}<input name="q" placeholder="${u('search_ph')}" aria-label="${u('search_ph')}"></form>
        <div class="cats">${counts.map(c => `<a class="cat" href="#/catalog?cat=${c.id}"><div class="ci">${ic(c.icon)}</div>${t(c)}</a>`).join('')}</div>
        <div class="stats">
          <div class="stat"><b>200+</b><span>${u('stat_cases')}</span></div>
          <div class="stat"><b>50+</b><span>${u('stat_videos')}</span></div>
          <div class="stat"><b>AI</b><span>${u('stat_ai')}</span></div>
          <div class="stat"><span>${u('stat_aud')}</span></div>
        </div>
      </div>
      <div class="hero-r">${heroArt()}<div class="slogan">${u('hero_slogan')}</div></div>
    </section>
    <div style="display:flex;justify-content:space-between;align-items:end"><h2 class="sec-title">${u('featured')}</h2><a class="btn btn-l" href="#/catalog" style="margin-bottom:14px">${u('all_cases')} ${ic('chev')}</a></div>
    <div class="grid3">${CASES.slice(0, 3).map(caseCard).join('')}</div>
    <h2 class="sec-title">${u('how_title')}</h2>
    <div class="steps">${ALGORITHM.map((s, i) => `<div class="card step"><div class="n">${i + 1}</div><h4>${t(s)}</h4><p>${t(s.d)}</p></div>`).join('')}</div>`;
}

function pageCatalog(q) {
  const cat = q.get('cat') || 'all';
  const s = (q.get('q') || '').trim().toLowerCase();
  const lvl = q.get('lvl') || '';
  const list = CASES.filter(c => (cat === 'all' || c.cats.includes(cat)) && (!lvl || c.level === lvl) &&
    (!s || [c.id, c.title.ru, c.title.kz, c.text.ru, c.text.kz].join(' ').toLowerCase().includes(s)));
  const link = (k, v) => { const p = new URLSearchParams(q); v ? p.set(k, v) : p.delete(k); return '#/catalog?' + p; };
  return `<div class="catalog">
    <aside class="card side"><h4>${u('categories')}</h4>
      <a href="${link('cat', '')}" class="${cat === 'all' ? 'on' : ''}">${ic('cases')}${u('all_cases')}<em>${CASES.length}</em></a>
      ${CATEGORIES.map(c => `<a href="${link('cat', c.id)}" class="${cat === c.id ? 'on' : ''}">${ic(c.icon)}${t(c)}<em>${CASES.filter(x => x.cats.includes(c.id)).length}</em></a>`).join('')}
    </aside>
    <section>
      <div class="filters">
        <form class="search" id="csearch">${ic('search', 'muted')}<input name="q" value="${esc(q.get('q') || '')}" placeholder="${u('search_ph')}"></form>
        <select id="lvl" aria-label="${u('level')}"><option value="">${u('level')}: —</option>${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${lvl === k ? 'selected' : ''}>${t(v)}</option>`).join('')}</select>
      </div>
      <p class="muted" style="margin:0 0 10px">${u('found')}: ${list.length}</p>
      <div class="list">${list.length ? list.map(caseCard).join('') : `<div class="card pad muted">${u('nothing')}</div>`}</div>
    </section></div>`;
}

function pageCase(id, tab) {
  const c = caseById(id); if (!c) return pageCatalog(new URLSearchParams());
  const dec = getDecision(id);
  const notes = getNotes(id);
  const hasNotes = Object.values(notes).some(v => v && v.trim());
  const bm = bookmarks().includes(id);
  const tabs = [['desc', 't_desc', false], ['analysis', 't_analysis', hasNotes], ['solutions', 't_solutions', !!dec], ['comment', 't_comment', false]];
  let body = '';
  if (tab === 'analysis') {
    body = `<div><h3>${u('diag_title')}</h3><p class="muted" style="margin-top:-4px">${u('diag_hint')}</p>
      ${DIAG_FIELDS.map(f => `<div class="field"><label for="d_${f.id}">${t(f)}</label><textarea id="d_${f.id}" data-diag="${f.id}">${esc(notes[f.id] || '')}</textarea></div>`).join('')}
      <div class="savehint" id="savehint"></div>
      <a class="btn btn-p" href="#/case/${id}/solutions">${u('next_step')} ${ic('chev')}</a></div>`;
  } else if (tab === 'solutions') {
    const sel = dec ? dec.choice : (window._pick?.[id] ?? null);
    body = `<div><h3>${u('sol_title')}</h3><p class="muted" style="margin-top:-4px">${u('sol_hint')}</p>
      ${c.options.map((o, i) => `<button class="opt ${sel === i ? 'sel' : ''}" data-opt="${i}"><span class="lt">${'ABC'[i]}</span>${esc(t(o))}
        ${sel === i ? `<div class="cons"><b>${u('consequences')} <span class="chip ${OUTCOME[o.oc].cls}">${t(OUTCOME[o.oc])}</span></b>${esc(t(o.cons))}</div>` : ''}</button>`).join('')}
      <button class="opt ${sel === 'own' ? 'sel' : ''}" data-opt="own"><span class="lt">+</span>${u('own')}</button>
      <div class="field" style="margin-top:16px"><label>${u('own')}</label><textarea id="own" placeholder="${u('own_ph')}">${esc(dec?.own || '')}</textarea></div>
      <div class="field"><label>${u('justify')}</label><textarea id="just" placeholder="${u('justify_ph')}">${esc(dec?.just || '')}</textarea></div>
      <div class="field"><label>${u('principles')}</label><div class="pchips">${PRINCIPLES.map(p => `<button class="pchip ${(dec?.pr || window._pr?.[id] || []).includes(p.id) ? 'on' : ''}" data-pr="${p.id}">${t(p)}</button>`).join('')}</div></div>
      <button class="btn btn-p" id="savedec">${ic('download')} ${u('save_portfolio')}</button>
      ${dec ? `<span style="margin-left:12px;color:var(--good);font-weight:600">✓ ${u('in_portfolio')}</span>` : ''}</div>`;
  } else if (tab === 'comment') {
    if (!dec && !window._unlock?.[id]) {
      body = `<div class="card gate">${ic('lock')}<h3>${u('gate_title')}</h3><p class="muted">${u('gate_text')}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-p" href="#/case/${id}/solutions">${u('go_solutions')}</a><button class="btn btn-o" id="unlock">${u('gate_btn')}</button></div></div>`;
    } else {
      const mine = dec ? (dec.choice === 'own' ? (dec.own || '—') : `${'ABC'[dec.choice]}. ${t(c.options[dec.choice])}`) : '—';
      body = `<div><h3>${u('expert_title')}</h3><div class="expert">${esc(t(c.expert))}</div>
        <div class="compare"><div class="box"><h4>${u('portfolio')}</h4>${esc(mine)}${dec?.just ? `<p class="muted" style="margin:6px 0 0">${esc(dec.just)}</p>` : ''}</div>
          <div class="box"><h4>${u('key_principles')}</h4><div class="pchips">${c.principles.map(p => `<span class="chip">${t(PRINCIPLES.find(x => x.id === p))}</span>`).join('')}</div></div></div>
        <div class="field"><label>${u('reflection')}</label><textarea id="refl" data-refl placeholder="${u('reflection_ph')}">${esc(store.get('refl.' + id, ''))}</textarea></div>
        <div class="savehint" id="savehint"></div></div>`;
    }
  } else {
    body = `<div><h3>${u('situation')}</h3><p class="case-text">${esc(t(c.text))}</p><p class="muted" style="font-size:13px">${u('names_changed')}</p></div>`;
  }
  const side = `<div class="actions">
      <a class="btn btn-p btn-block" href="#/video/${id}">${ic('play')} ${u('watch')}</a>
      <a class="btn btn-v btn-block" href="#/ai/${id}">${ic('bot')} ${u('discuss')}</a>
      <a class="btn btn-l btn-block" href="#/case/${id}/comment">${ic('book')} ${u('expert')}</a>
      <button class="btn btn-o btn-block" id="bm">${ic('bookmark')} ${bm ? u('bm_remove') : u('bm_add')}</button></div>`;
  return `<div class="crumb"><a href="#/catalog">${u('nav_catalog')}</a>${ic('chev')}<span>${c.id}</span></div>
    <article class="card">
      <div class="case-head"><div><div class="code">${c.id}</div><h1>${esc(t(c.title))}</h1>
        <div class="row" style="display:flex;gap:6px;flex-wrap:wrap">${c.cats.map(k => `<span class="chip">${t(catById(k))}</span>`).join('')}<span class="chip">${c.grade} ${u('grade')}</span><span class="chip ${LEVELS[c.level].cls}">${u('level')}: ${t(LEVELS[c.level])}</span></div></div>
        <div class="case-img" style="${grad(c.hue)}">${ic(catIcon(c))}</div></div>
      <nav class="tabs">${tabs.map(([k, l, d]) => `<a href="#/case/${id}/${k}" class="${tab === k ? 'on' : ''}">${u(l)}${d ? '<span class="dot"></span>' : ''}</a>`).join('')}</nav>
      <div class="case-body">${body}${side}</div>
    </article>`;
}

/* ---------- AI-тьютор (демо) ----------
   В продакшене askTutor() отправляет запрос на сервер:
   POST /api/tutor {caseId, history, lang} → LLM + RAG по методбазе
   с системной инструкцией «сократический тьютор» и экспертной картой кейса. */
let CHAT = store.get('chat', null);
function chatInit(caseId) {
  CHAT = { caseId: caseId || null, step: 0, msgs: [] };
  CHAT.msgs.push({ from: 'ai', kind: 'hello' });
  if (caseId) CHAT.msgs.push({ from: 'ai', kind: 'intro', step: 0 });
  else CHAT.msgs.push({ from: 'ai', kind: 'pick' });
  store.set('chat', CHAT);
}
function redactPII(s) {
  let hit = false;
  const r = s.replace(/\b\d{12}\b/g, () => (hit = true, '[ИИН скрыт]'))
    .replace(/(\+?7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, () => (hit = true, '[тел. скрыт]'))
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => (hit = true, '[e-mail скрыт]'));
  return { text: r, hit };
}
function askTutor(text) {
  const out = [];
  const low = text.toLowerCase();
  const { text: clean, hit } = redactPII(text);
  CHAT.msgs.push({ from: 'me', text: clean });
  if (hit) out.push({ from: 'ai', kind: 'pii' });
  const wantsAnswer = /(правильн|верн|ответ|дұрыс|жауап)/.test(low);
  if (!CHAT.caseId) {
    const words = low.split(/[^\p{L}\d]+/u).filter(w => w.length > 3);
    const found = CASES.filter(c => words.some(w => [c.title.ru, c.title.kz, c.text.ru, c.text.kz].join(' ').toLowerCase().includes(w.slice(0, 5))));
    out.push({ from: 'ai', kind: 'suggest', ids: (found.length ? found : CASES).slice(0, 3).map(c => c.id) });
  } else {
    const c = caseById(CHAT.caseId);
    CHAT.step++;
    if (wantsAnswer) out.push({ from: 'ai', kind: 'noanswer', step: Math.min(CHAT.step, c.ai.length - 1) });
    else if (CHAT.step < c.ai.length) out.push({ from: 'ai', kind: 'ask', step: CHAT.step, ack: CHAT.step % 4 });
    else out.push({ from: 'ai', kind: 'finish' });
  }
  return out;
}
function aiMsgHTML(m, i) {
  const c = CHAT.caseId ? caseById(CHAT.caseId) : null;
  let h = '';
  if (m.kind === 'hello') h = u('ai_hello');
  if (m.kind === 'pick') h = `${u('ai_pick')}<div class="quick">${CASES.map(x => `<button data-pick="${x.id}">${x.id} · ${esc(t(x.title))}</button>`).join('')}</div>`;
  if (m.kind === 'suggest') h = `${u('ai_suggest')}<div class="quick">${m.ids.map(id => `<button data-pick="${id}">${id} · ${esc(t(caseById(id).title))}</button>`).join('')}</div>`;
  if (m.kind === 'pii') h = `⚠️ ${u('ai_pii')}`;
  if (c && m.kind === 'intro') h = `${u('ai_case_intro').replace('{t}', esc(t(c.title)))}<ol>${c.ai.slice(0, 1).map(q => `<li>${t(q)}</li>`).join('')}</ol>`;
  if (c && m.kind === 'ask') h = `${UI[LANG].ai_ack[m.ack]} ${t(c.ai[m.step])}`;
  if (c && m.kind === 'noanswer') h = `${u('ai_no_answer')} ${t(c.ai[m.step])}`;
  if (c && m.kind === 'finish') h = `${u('ai_finish')}<div class="quick"><button data-go="#/case/${c.id}/solutions">${u('ai_to_solutions')}</button><button data-go="#/case/${c.id}/comment">${u('ai_to_expert')}</button></div>`;
  const meta = (m.kind === 'hello' || m.kind === 'pick') ? '' : `<div class="meta"><span>${u('ai_label')}</span><button data-report="${i}">${m.reported ? '✓' : u('ai_report')}</button></div>`;
  return `<div class="msg"><div class="bot">${ic('bot')}</div><div class="bubble">${h}${meta}</div></div>`;
}
function pageAI(caseId) {
  if (!CHAT || (caseId && CHAT.caseId !== caseId)) chatInit(caseId);
  const c = CHAT.caseId ? caseById(CHAT.caseId) : null;
  return `<div class="chat-wrap">
    <aside class="chat-side">
      <div class="ai-promo"><div class="bot" style="width:56px;height:56px">${ic('bot')}</div><h3>${u('ai_name')}</h3>
        <ul class="feat">${UI[LANG].ai_features.map(f => `<li>${ic('check')}${f}</li>`).join('')}</ul></div>
      ${c ? `<div style="margin-top:14px">${caseCard(c)}</div>` : ''}
    </aside>
    <section class="card chat">
      <div class="chat-h"><div class="bot">${ic('bot')}</div><div><b>${u('ai_name')}</b><small>${u('ai_org')}${c ? ' · ' + c.id : ''}</small></div>
        <button class="btn btn-o" id="newchat" style="margin-left:auto;padding:8px 12px;font-size:13px">${u('ai_reset')}</button></div>
      <div class="msgs" id="msgs">${CHAT.msgs.map((m, i) => m.from === 'me' ? `<div class="msg me"><div class="bubble">${esc(m.text)}</div></div>` : aiMsgHTML(m, i)).join('')}</div>
      <form class="compose" id="compose"><input id="cinput" autocomplete="off" placeholder="${u('ai_ph')}"><button class="send" aria-label="send">${ic('send')}</button></form>
    </section></div>`;
}

function videoPlayer(c, big) {
  return `<div class="player" style="${grad(c.hue)}"><span class="soon">${u('video_soon')}</span>
    <div class="play">${ic('play')}</div>
    ${big ? `<div class="pbar"><span>0:00 / 2:35</span><div class="track"></div>${ic('monitor')}</div>` : ''}</div>`;
}
function pageVideo(id) {
  const c = id && caseById(id);
  if (!c) return `<h2 class="sec-title" style="margin-top:0">${u('video_title')}</h2>
    <div class="vlist">${CASES.map(x => `<a class="card vitem" href="#/video/${x.id}">${videoPlayer(x)}<div class="t"><div class="muted" style="font-size:12px;font-weight:700">${x.id}</div><b>${esc(t(x.title))}</b></div></a>`).join('')}</div>`;
  return `<div class="crumb"><a href="#/video">${u('video_title')}</a>${ic('chev')}<span>${c.id}</span></div>
    <div class="grid2" style="grid-template-columns:1.6fr 1fr">
      <div class="card pad">${videoPlayer(c, true)}<h2 style="margin-top:16px">${c.id} · ${esc(t(c.title))}</h2><p class="muted">${esc(t(c.short))}</p></div>
      <div class="card pad"><h3 style="margin-bottom:12px">${u('video_q')}</h3><ol class="qlist">${VIDEO_QUESTIONS.map(q => `<li>${t(q)}</li>`).join('')}</ol>
        <div class="actions" style="margin-top:18px"><a class="btn btn-p" href="#/case/${c.id}/analysis">${u('video_to_case')}</a><a class="btn btn-v" href="#/ai/${c.id}">${ic('bot')} ${u('discuss')}</a></div></div>
    </div>`;
}

function pageMaterials() {
  return `<h2 class="sec-title" style="margin-top:0">${u('mat_title')}</h2>
    <div class="grid2">
      <div class="card pad"><h3 style="margin-bottom:14px">${u('mat_algo')}</h3>
        ${ALGORITHM.map((s, i) => `<div style="display:flex;gap:12px;margin-bottom:12px"><div class="step" style="padding:0"><div class="n">${i + 1}</div></div><div><b>${t(s)}</b><div class="muted" style="font-size:14px">${t(s.d)}</div></div></div>`).join('')}</div>
      <div class="card pad"><h3 style="margin-bottom:14px">${u('mat_princ')}</h3>
        <ul class="ticks">${PRINCIPLES.map(p => `<li>${ic('tick')}${t(p)}</li>`).join('')}</ul>
        <p class="muted" style="font-size:13px;margin-top:16px">${u('mat_note')}</p></div>
    </div>`;
}

function pageProfile() {
  const pf = portfolio();
  const bm = bookmarks().map(caseById).filter(Boolean);
  return `<h2 class="sec-title" style="margin-top:0">${u('prof_title')}</h2>
    <div class="grid3" style="margin-bottom:16px">
      <div class="card pad"><div class="muted">${u('progress')}</div><b style="font-size:30px;color:var(--blue-dd)">${pf.length} / ${CASES.length}</b>
        <div style="height:8px;background:var(--blue-l);border-radius:4px;margin-top:8px"><div style="height:8px;border-radius:4px;background:var(--blue);width:${pf.length / CASES.length * 100}%"></div></div></div>
      <div class="card pad"><div class="muted">${u('bookmarks')}</div><b style="font-size:30px;color:var(--blue-dd)">${bm.length}</b></div>
      <div class="card pad" style="display:flex;align-items:center"><button class="btn btn-l btn-block" id="csv">${ic('download')} ${u('export_csv')}</button></div>
    </div>
    <div class="quicklinks">${[['materials', 'book', 'nav_materials'], ['teacher', 'teacher', 'nav_teacher'], ['about', 'list', 'nav_about']].map(([r, i, k]) => `<a class="card" href="#/${r}">${ic(i)}<span>${u(k)}</span>${ic('chev', 'muted')}</a>`).join('')}</div>
    <div class="grid2">
      <div class="card pad"><h3 style="margin-bottom:12px">${u('portfolio')}</h3>
        ${pf.length ? `<table><tr><th>${u('nav_catalog')}</th><th>${u('teach_choice')}</th></tr>${pf.map(({ c, d }) => `<tr><td><a href="#/case/${c.id}/comment" style="color:var(--blue);font-weight:600">${c.id}</a> ${esc(t(c.title))}</td><td>${d.choice === 'own' ? u('own') : 'ABC'[d.choice] + ' · <span class="chip ' + OUTCOME[c.options[d.choice].oc].cls + '">' + t(OUTCOME[c.options[d.choice].oc]) + '</span>'}</td></tr>`).join('')}</table>` : `<p class="muted">${u('empty_portfolio')}</p>`}</div>
      <div class="card pad"><h3 style="margin-bottom:12px">${u('bookmarks')}</h3>
        ${bm.length ? `<div class="list">${bm.map(caseCard).join('')}</div>` : `<p class="muted">${u('empty_bm')}</p>`}</div>
    </div>`;
}

function pageTeacher() {
  const demo = [['Студент 01', 'done', 1, 92], ['Студент 02', 'done', 0, 74], ['Студент 03', 'prog', null, null], ['Студент 04', 'done', 'own', 88], ['Студент 05', 'none', null, null]];
  const st = { done: ['st_done', 'oc-good'], prog: ['st_prog', 'oc-risky'], none: ['st_none', ''] };
  const c = CASES[0];
  return `<h2 class="sec-title" style="margin-top:0">${u('teach_title')}</h2>
    <div class="grid2">
      <div class="card pad"><h3 style="margin-bottom:12px">${u('teach_assign')}</h3>
        ${CASES.map(x => `<label class="checkrow"><input type="checkbox" ${x.id === c.id ? 'checked' : ''}><b>${x.id}</b> ${esc(t(x.title))}<span class="chip ${LEVELS[x.level].cls}" style="margin-left:auto">${t(LEVELS[x.level])}</span></label>`).join('')}
        <div class="formrow"><select aria-label="${u('teach_group')}"><option>${u('teach_group')}: ПО-21</option><option>${u('teach_group')}: ПО-22</option></select><input type="date" aria-label="${u('teach_deadline')}"></div>
        <button class="btn btn-p" id="assign">${u('teach_btn')}</button></div>
      <div class="card pad"><h3 style="margin-bottom:12px">${u('teach_results')} · ${c.id}</h3>
        <table><tr><th>${u('teach_student')}</th><th>${u('teach_status')}</th><th>${u('teach_choice')}</th><th>${u('teach_score')}</th></tr>
        ${demo.map(([n, s, ch, sc]) => `<tr><td>${n}</td><td><span class="chip ${st[s][1]}">${u(st[s][0])}</span></td><td>${ch === null ? '—' : ch === 'own' ? u('own') : 'ABC'[ch]}</td><td>${sc ?? '—'}</td></tr>`).join('')}</table>
        <button class="btn btn-l" style="margin-top:14px" id="tcsv">${ic('download')} ${u('export_csv')}</button></div>
    </div>`;
}

function pageAbout() {
  const accessIcons = ['monitor', 'qr', 'doc', 'cap', 'users'];
  return `<div class="about-cards">
      <div class="card pad"><h3>${ic('book')}${u('about_what')}</h3><p style="margin:0;color:var(--ink2)">${u('about_what_t')}</p></div>
      <div class="card pad"><h3>${ic('target')}${u('about_goal')}</h3><p style="margin:0;color:var(--ink2)">${u('about_goal_t')}</p></div>
      <div class="card pad"><h3>${ic('list')}${u('about_tasks')}</h3><ul class="ticks">${UI[LANG].tasks.map(x => `<li>${ic('check')}${x}</li>`).join('')}</ul></div>
    </div>
    <h2 class="sec-title">${u('access_title')}</h2>
    <div class="access">${UI[LANG].access.map((x, i) => `<div class="card"><div class="ai">${ic(accessIcons[i])}</div>${x}</div>`).join('')}</div>
    <div class="band">
      <div>${ic('award')}${LANG === 'kz' ? 'Amanzholov University түпнұсқа контенті' : 'Оригинальный контент Amanzholov University'}</div>
      <div>${ic('copy')}${LANG === 'kz' ? 'Жағдаяттық бейнематериалдарға авторлық құқықты тіркеу' : 'Регистрация авторских прав на ситуационные видеоматериалы'}</div>
      <div>${ic('users')}${LANG === 'kz' ? 'Студенттерге, оқытушыларға, тәлімгерлерге және серіктес ұйымдарға' : 'Для студентов, преподавателей, наставников и организаций-партнёров'}</div>
      <div>${ic('chart')}${LANG === 'kz' ? 'Педагогикалық білім сапасына үлес' : 'Вклад в качество педагогического образования'}</div>
    </div>`;
}

/* ---------- экспорт ---------- */
function downloadCSV(name, rows) {
  const csv = '﻿' + rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- роутер ---------- */
function parse() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  const parts = path.split('/');
  return { route: parts[0], a: parts[1], b: parts[2], q: new URLSearchParams(qs || '') };
}
function render() {
  const { route, a, b, q } = parse();
  document.documentElement.lang = LANG === 'kz' ? 'kk' : 'ru';
  document.title = `E-book · ${u('hero_title')}`;
  let page;
  switch (route) {
    case 'catalog': page = pageCatalog(q); break;
    case 'case': page = pageCase(a, b || 'desc'); break;
    case 'ai': page = pageAI(a); break;
    case 'video': page = pageVideo(a); break;
    case 'materials': page = pageMaterials(); break;
    case 'profile': page = pageProfile(); break;
    case 'teacher': page = pageTeacher(); break;
    case 'about': page = pageAbout(); break;
    default: page = pageHome();
  }
  $('#app').innerHTML = header(route) + `<main><div class="wrap">${page}</div></main>
    <footer><div class="wrap">© 2026 ${u('uni')} · E-book «${u('hero_title')}» · ${u('proto')}</div></footer>` + tabbar(route);
  bind(route, a, b);
}

function bind(route, a) {
  document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { LANG = b.dataset.lang; store.set('lang', LANG); render(); });
  const hs = $('#hsearch'); if (hs) hs.onsubmit = e => { e.preventDefault(); location.hash = '#/catalog?q=' + encodeURIComponent(hs.q.value); };
  const cs = $('#csearch'); if (cs) cs.onsubmit = e => { e.preventDefault(); const p = parse().q; cs.q.value ? p.set('q', cs.q.value) : p.delete('q'); location.hash = '#/catalog?' + p; };
  const lv = $('#lvl'); if (lv) lv.onchange = () => { const p = parse().q; lv.value ? p.set('lvl', lv.value) : p.delete('lvl'); location.hash = '#/catalog?' + p; };

  if (route === 'case') {
    const id = a;
    const tb = $('.tabs'), on = $('.tabs a.on'); if (tb && on) tb.scrollLeft = on.offsetLeft - tb.clientWidth / 2 + on.clientWidth / 2;
    const hint = () => { const h = $('#savehint'); if (h) { h.textContent = '✓ ' + u('saved'); clearTimeout(h._t); h._t = setTimeout(() => h.textContent = '', 1500); } };
    document.querySelectorAll('[data-diag]').forEach(el => el.oninput = () => { const n = getNotes(id); n[el.dataset.diag] = el.value; store.set('diag.' + id, n); hint(); });
    const rf = $('#refl'); if (rf) rf.oninput = () => { store.set('refl.' + id, rf.value); hint(); };
    window._pick = window._pick || {}; window._pr = window._pr || {};
    document.querySelectorAll('[data-opt]').forEach(el => el.onclick = () => {
      const v = el.dataset.opt === 'own' ? 'own' : +el.dataset.opt;
      const d = getDecision(id); if (d) { d.choice = v; store.set('dec.' + id, d); }
      window._pick[id] = v; keepScroll(render); if (v === 'own') $('#own')?.focus();
    });
    document.querySelectorAll('[data-pr]').forEach(el => el.onclick = () => {
      const d = getDecision(id); const arr = d ? d.pr : (window._pr[id] = window._pr[id] || []);
      const i = arr.indexOf(el.dataset.pr); i < 0 ? arr.push(el.dataset.pr) : arr.splice(i, 1);
      if (d) store.set('dec.' + id, d); el.classList.toggle('on');
    });
    const sv = $('#savedec'); if (sv) sv.onclick = () => {
      const d = getDecision(id); const choice = d ? d.choice : window._pick[id];
      if (choice === undefined || choice === null) { toast(u('sol_title')); return; }
      store.set('dec.' + id, { choice, own: $('#own').value, just: $('#just').value, pr: d ? d.pr : (window._pr[id] || []), at: new Date().toISOString() });
      toast(u('in_portfolio')); keepScroll(render);
    };
    const ul = $('#unlock'); if (ul) ul.onclick = () => { window._unlock = { ...(window._unlock || {}), [id]: true }; render(); };
    const bm = $('#bm'); if (bm) bm.onclick = () => toggleBm(id);
  }

  if (route === 'ai') {
    const box = $('#msgs'); box.scrollTop = box.scrollHeight;
    $('#newchat').onclick = () => { chatInit(CHAT.caseId); render(); };
    box.onclick = e => {
      const p = e.target.closest('[data-pick]'); if (p) { location.hash = '#/ai/' + p.dataset.pick; return; }
      const g = e.target.closest('[data-go]'); if (g) { location.hash = g.dataset.go; return; }
      const r = e.target.closest('[data-report]'); if (r) { CHAT.msgs[+r.dataset.report].reported = true; store.set('chat', CHAT); toast(u('ai_reported')); render(); }
    };
    $('#compose').onsubmit = e => {
      e.preventDefault(); const inp = $('#cinput'); const v = inp.value.trim(); if (!v) return;
      const replies = askTutor(v); store.set('chat', CHAT); render();
      const b2 = $('#msgs'); b2.insertAdjacentHTML('beforeend', `<div class="msg" id="typing"><div class="bot">${ic('bot')}</div><div class="bubble"><div class="typing"><i></i><i></i><i></i></div></div></div>`); b2.scrollTop = b2.scrollHeight;
      setTimeout(() => { CHAT.msgs.push(...replies); store.set('chat', CHAT); render(); $('#cinput')?.focus(); }, 700);
    };
  }

  if (route === 'profile') $('#csv').onclick = () => downloadCSV('portfolio.csv', [['case', 'title', 'choice', 'own', 'justification', 'principles', 'date'],
    ...portfolio().map(({ c, d }) => [c.id, t(c.title), d.choice === 'own' ? 'own' : 'ABC'[d.choice], d.own, d.just, (d.pr || []).map(p => t(PRINCIPLES.find(x => x.id === p))).join(', '), d.at])]);
  if (route === 'teacher') {
    $('#assign').onclick = () => toast(u('teach_done'));
    $('#tcsv').onclick = () => downloadCSV('group-results-demo.csv', [['student', 'status', 'choice', 'score'], ['Студент 01', 'done', 'B', 92], ['Студент 02', 'done', 'A', 74], ['Студент 03', 'progress', '', ''], ['Студент 04', 'done', 'own', 88], ['Студент 05', 'none', '', '']]);
  }
}
function keepScroll(fn) { const y = scrollY; fn(); scrollTo(0, y); }

let LAST = '';
window.addEventListener('hashchange', () => { const { route, a } = parse(); const key = route + '/' + (a || ''); render(); if (key !== LAST) scrollTo(0, 0); LAST = key; });
LAST = parse().route + '/' + (parse().a || '');
render();
