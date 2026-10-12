/* ============================================================
   АВТОРИЗАЦИЯ (демо) / АВТОРИЗАЦИЯ (демо)
   Имитирует целевую схему: вход через сервер авторизации
   университета (Keycloak: SSO / LMS LTI 1.3 / приглашение),
   второй фактор для сотрудников, согласие на обработку ПД,
   ролевой доступ и журнал действий.
   В продакшене всё это делает сервер; здесь — только интерфейс.
   ============================================================ */

let USER = null;          // текущий пользователь; загружается в app.js после store
let LOGIN = { step: 'start' };
const CONSENT_VERSION = '1.0 · 2026-10';

const ROLES = {
  student:   { icon: 'cap',     mfa: false, home: 'catalog', ru: 'Студент',              kz: 'Студент',
               d: { ru: 'Кейсы, AI-диалог, портфолио',            kz: 'Кейстер, AI-диалог, портфолио' } },
  teacher:   { icon: 'teacher', mfa: true,  home: 'teacher', ru: 'Преподаватель',        kz: 'Оқытушы',
               d: { ru: 'Назначения группам, результаты',         kz: 'Топтарға тағайындау, нәтижелер' } },
  methodist: { icon: 'doc',     mfa: true,  home: 'editor',  ru: 'Методист',             kz: 'Әдіскер',
               d: { ru: 'Создание и правка кейсов',               kz: 'Кейстерді құру және өңдеу' } },
  expert:    { icon: 'award',   mfa: true,  home: 'review',  ru: 'Эксперт',              kz: 'Сарапшы',
               d: { ru: 'Проверка кейсов, жалобы на AI',          kz: 'Кейстерді тексеру, AI шағымдары' } },
  admin:     { icon: 'lock',    mfa: true,  home: 'admin',   ru: 'Администратор',        kz: 'Әкімші',
               d: { ru: 'Пользователи, роли, журнал',             kz: 'Пайдаланушылар, рөлдер, журнал' } },
  mentor:    { icon: 'users',   mfa: false, home: 'catalog', ru: 'Наставник (внешний)',  kz: 'Тәлімгер (сыртқы)',
               d: { ru: 'По приглашению, доступ ограничен сроком', kz: 'Шақыру бойынша, мерзімі шектеулі' } },
};

/* Демо-учётные записи (вымышленные) */
const DEMO_USERS = {
  student:   { id: 'u-s01', name: 'Айдана Серикова',  src: 'sso',    group: 'ПО-21' },
  teacher:   { id: 'u-t01', name: 'Ерлан Касымов',    src: 'sso',    groups: ['ПО-21', 'ПО-22'] },
  methodist: { id: 'u-m01', name: 'Гульнара Ахметова', src: 'sso' },
  expert:    { id: 'u-e01', name: 'Марат Жунусов',    src: 'sso' },
  admin:     { id: 'u-a01', name: 'IT-администратор', src: 'sso' },
  mentor:    { id: 'u-x01', name: 'Сауле Нурланова',  src: 'invite', org: 'СШ № 12', until: '2027-06-30' },
};

/* Права: что разрешено каждой роли */
const PERMS = {
  case_work: ['student', 'teacher', 'methodist', 'expert', 'admin', 'mentor'],
  ai:        ['student', 'teacher', 'methodist', 'expert', 'mentor'],
  profile:   ['student', 'teacher', 'methodist', 'expert', 'admin', 'mentor'],
  teacher:   ['teacher'],
  editor:    ['methodist'],
  review:    ['expert'],
  admin:     ['admin'],
};
const can = (perm) => !!USER && PERMS[perm].includes(USER.role);
const pseudOf = (id) => 'p-' + Array.from(id).reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16).slice(0, 6);

/* Требования маршрутов */
function routeNeed(route, sub) {
  if (route === 'case' && sub && sub !== 'desc') return 'case_work';
  return { ai: 'ai', profile: 'profile', teacher: 'teacher', editor: 'editor', review: 'review', admin: 'admin' }[route] || null;
}

/* ---------- журнал действий (общий для демо) ---------- */
function audit(action, extra) {
  const log = store.get('audit', []);
  log.unshift({ at: new Date().toISOString(), who: USER ? pseudOf(USER.id) : '—', role: USER?.role || 'guest', action, extra: extra || '' });
  store.set('audit', log.slice(0, 60));
}

/* ---------- строки интерфейса ---------- */
Object.assign(UI.ru, {
  login: 'Войти', logout: 'Выйти',
  login_title: 'Вход в e-book', login_sub: 'Используйте единую учётную запись университета',
  sso_btn: 'Войти через аккаунт университета', sso_note: 'Единый вход (SSO) · Active Directory университета',
  lms_btn: 'Войти через LMS (Moodle)', lms_note: 'Переход из курса — без повторного ввода пароля (LTI 1.3)',
  inv_btn: 'Внешний наставник — вход по приглашению', guest_btn: 'Продолжить как гость',
  no_pw: 'E-book не хранит пароли: вход выполняет сервер авторизации университета (Keycloak).',
  pick_title: 'Демо: под кем войти?', pick_note: 'В рабочей системе роль приходит из каталога университета и Platonus.',
  mfa_title: 'Подтверждение входа', mfa_text: 'Для этой роли нужен второй фактор. Введите 6-значный код из приложения-аутентификатора.',
  mfa_demo: 'Демо: любые 6 цифр', confirm: 'Подтвердить', mfa_bad: 'Нужно 6 цифр',
  inv_title: 'Вход по приглашению', inv_text: 'Введите e-mail, на который пришло приглашение от преподавателя, — мы отправим одноразовый код.',
  get_code: 'Получить код', code_sent: 'Код отправлен на', email_bad: 'Проверьте e-mail',
  consent_title: 'Согласие на обработку персональных данных',
  consent_items: ['Какие данные: ФИО, группа, ваши ответы, решения и диалоги с AI-ассистентом.', 'Зачем: обучение, обратная связь преподавателя, улучшение методических материалов.', 'Где: на серверах университета в Республике Казахстан.', 'AI-ассистент получает только псевдоним — без ФИО и ИИН.', 'В профиле можно выгрузить свои данные и отозвать согласие.'],
  consent_check: 'Я ознакомлен(а) с условиями и даю согласие', consent_ver: 'Версия согласия',
  accept: 'Принять', decline: 'Отказаться', welcome: 'Добро пожаловать,',
  need_login_title: 'Для этого раздела нужен вход',
  need_login_text: 'Анализ кейса, AI-диалог и портфолио доступны после входа: ваши ответы сохраняются, а запросы к AI журналируются.',
  denied_title: 'Нет доступа', denied_text: 'Раздел доступен ролям:', your_role: 'Ваша роль',
  role_switch: 'Сменить роль (демо)', session: 'Сессия',
  src_sso: 'SSO университета', src_lms: 'LMS (LTI 1.3)', src_invite: 'Приглашение + одноразовый код',
  mfa_on: '2FA включена', mfa_off: '2FA не требуется', sess_timeout: 'Завершается после 8 ч бездействия',
  access_until: 'Доступ до', withdraw: 'Отозвать согласие', withdrawn: 'Согласие отозвано, вы вышли из системы.',
  pseud: 'AI видит только псевдоним', nav_editor: 'Редактор кейсов', nav_review: 'Экспертиза', nav_admin: 'Администрирование',
  editor_note: 'Методист работает с контентом, но не видит ответов студентов.',
  new_case: 'Новый кейс', edit: 'Редактировать', status: 'Статус', st_published: 'Опубликован', st_review: 'На экспертизе', st_draft: 'Черновик', langs: 'Языки',
  cms_demo: 'В рабочей системе откроется система управления контентом (демо).',
  review_cases: 'Кейсы на экспертизе', approve: 'Одобрить', send_back: 'Вернуть на доработку',
  approved: 'Кейс одобрен к публикации (демо).', returned: 'Кейс возвращён методисту (демо).',
  reports_title: 'Жалобы на ответы AI', reports_empty: 'Жалоб нет. Нажмите «Сообщить о некорректном ответе» в AI-диалоге.',
  reports_note: 'Эксперт видит только псевдоним, а не ФИО студента.', resolve: 'Разобрано',
  admin_users: 'Пользователи и роли', source: 'Источник', last_login: 'Последний вход',
  admin_note: 'Администратор управляет ролями и настройками, но не имеет доступа к ответам студентов.',
  audit_title: 'Журнал действий', audit_empty: 'Записей пока нет.', when: 'Время', who: 'Кто', action: 'Действие', role_col: 'Роль',
  a_login: 'Вход', a_logout: 'Выход', a_consent: 'Дано согласие', a_withdraw: 'Согласие отозвано', a_export: 'Выгрузка данных',
  a_assign: 'Назначены кейсы', a_report: 'Жалоба на ответ AI', a_role: 'Смена роли (демо)', a_role_set: 'Изменена роль пользователя (демо)',
  teach_own: 'Только ваши группы', user_col: 'Пользователь', role_changed: 'Роль изменена (демо).',
});
Object.assign(UI.kz, {
  login: 'Кіру', logout: 'Шығу',
  login_title: 'E-book-қа кіру', login_sub: 'Университеттің бірыңғай есептік жазбасын пайдаланыңыз',
  sso_btn: 'Университет аккаунты арқылы кіру', sso_note: 'Бірыңғай кіру (SSO) · университеттің Active Directory жүйесі',
  lms_btn: 'LMS (Moodle) арқылы кіру', lms_note: 'Курстан өту — құпиясөзді қайта енгізусіз (LTI 1.3)',
  inv_btn: 'Сыртқы тәлімгер — шақыру арқылы кіру', guest_btn: 'Қонақ ретінде жалғастыру',
  no_pw: 'E-book құпиясөздерді сақтамайды: кіруді университеттің авторизация сервері (Keycloak) орындайды.',
  pick_title: 'Демо: кім ретінде кіресіз?', pick_note: 'Нақты жүйеде рөл университет каталогынан және Platonus-тан алынады.',
  mfa_title: 'Кіруді растау', mfa_text: 'Бұл рөлге екінші фактор қажет. Аутентификатор қосымшасындағы 6 таңбалы кодты енгізіңіз.',
  mfa_demo: 'Демо: кез келген 6 цифр', confirm: 'Растау', mfa_bad: '6 цифр қажет',
  inv_title: 'Шақыру арқылы кіру', inv_text: 'Оқытушыдан шақыру келген e-mail-ді енгізіңіз — біз бір реттік код жібереміз.',
  get_code: 'Код алу', code_sent: 'Код жіберілді:', email_bad: 'E-mail-ді тексеріңіз',
  consent_title: 'Дербес деректерді өңдеуге келісім',
  consent_items: ['Қандай деректер: аты-жөні, тобы, жауаптарыңыз, шешімдеріңіз және AI-көмекшімен диалогтар.', 'Не үшін: оқыту, оқытушының кері байланысы, әдістемелік материалдарды жетілдіру.', 'Қай жерде: Қазақстан Республикасындағы университет серверлерінде.', 'AI-көмекші аты-жөніңізді және ЖСН-ді емес, тек бүркеншік атты алады.', 'Профильде деректеріңізді жүктеп алып, келісімді кері қайтара аласыз.'],
  consent_check: 'Шарттармен таныстым және келісім беремін', consent_ver: 'Келісім нұсқасы',
  accept: 'Қабылдау', decline: 'Бас тарту', welcome: 'Қош келдіңіз,',
  need_login_title: 'Бұл бөлім үшін кіру қажет',
  need_login_text: 'Кейсті талдау, AI-диалог және портфолио кіргеннен кейін қолжетімді: жауаптарыңыз сақталады, ал AI сұраулары тіркеледі.',
  denied_title: 'Қолжетімділік жоқ', denied_text: 'Бөлім мына рөлдерге қолжетімді:', your_role: 'Сіздің рөліңіз',
  role_switch: 'Рөлді ауыстыру (демо)', session: 'Сессия',
  src_sso: 'Университеттің SSO', src_lms: 'LMS (LTI 1.3)', src_invite: 'Шақыру + бір реттік код',
  mfa_on: '2FA қосулы', mfa_off: '2FA талап етілмейді', sess_timeout: '8 сағат әрекетсіздіктен кейін аяқталады',
  access_until: 'Қолжетімділік мерзімі', withdraw: 'Келісімді кері қайтару', withdrawn: 'Келісім кері қайтарылды, сіз жүйеден шықтыңыз.',
  pseud: 'AI тек бүркеншік атты көреді', nav_editor: 'Кейстер редакторы', nav_review: 'Сараптама', nav_admin: 'Әкімшілік',
  editor_note: 'Әдіскер контентпен жұмыс істейді, бірақ студенттердің жауаптарын көрмейді.',
  new_case: 'Жаңа кейс', edit: 'Өңдеу', status: 'Мәртебе', st_published: 'Жарияланған', st_review: 'Сараптамада', st_draft: 'Жоба', langs: 'Тілдер',
  cms_demo: 'Нақты жүйеде контентті басқару жүйесі ашылады (демо).',
  review_cases: 'Сараптамадағы кейстер', approve: 'Мақұлдау', send_back: 'Пысықтауға қайтару',
  approved: 'Кейс жариялауға мақұлданды (демо).', returned: 'Кейс әдіскерге қайтарылды (демо).',
  reports_title: 'AI жауаптарына шағымдар', reports_empty: 'Шағымдар жоқ. AI-диалогта «Қате жауап туралы хабарлау» батырмасын басыңыз.',
  reports_note: 'Сарапшы студенттің аты-жөнін емес, тек бүркеншік атын көреді.', resolve: 'Қаралды',
  admin_users: 'Пайдаланушылар және рөлдер', source: 'Дереккөз', last_login: 'Соңғы кіру',
  admin_note: 'Әкімші рөлдер мен баптауларды басқарады, бірақ студенттердің жауаптарына қолжетімділігі жоқ.',
  audit_title: 'Әрекеттер журналы', audit_empty: 'Әзірге жазбалар жоқ.', when: 'Уақыты', who: 'Кім', action: 'Әрекет', role_col: 'Рөл',
  a_login: 'Кіру', a_logout: 'Шығу', a_consent: 'Келісім берілді', a_withdraw: 'Келісім кері қайтарылды', a_export: 'Деректерді жүктеу',
  a_assign: 'Кейстер тағайындалды', a_report: 'AI жауабына шағым', a_role: 'Рөл ауыстырылды (демо)', a_role_set: 'Пайдаланушы рөлі өзгертілді (демо)',
  teach_own: 'Тек сіздің топтарыңыз', user_col: 'Пайдаланушы', role_changed: 'Рөл өзгертілді (демо).',
});

/* ---------- вход / выход ---------- */
function startLogin(next) { LOGIN = { step: 'start', next: next || LOGIN.next || '' }; }
function finishLogin(role, src) {
  USER = { ...DEMO_USERS[role], role, src: src || DEMO_USERS[role].src, mfa: ROLES[role].mfa, at: new Date().toISOString() };
  store.set('user', USER);
  CHAT = uget('chat', null);
  audit('a_login', t(ROLES[role]));
  if (!store.get('consent.' + USER.id, null)) { LOGIN.step = 'consent'; render(); return; }
  goAfterLogin();
}
function goAfterLogin() {
  const next = LOGIN.next; LOGIN = { step: 'start' };
  toast(`${u('welcome')} ${USER.name}`);
  location.hash = next || '#/' + ROLES[USER.role].home;
  render();
}
function logout(silent) {
  if (USER) audit('a_logout');
  USER = null; store.set('user', null); CHAT = null; LOGIN = { step: 'start' };
  if (!silent) location.hash = '#/home';
  render();
}

/* ---------- экраны входа ---------- */
function pageLogin() {
  const s = LOGIN.step;
  let body = '';
  if (s === 'start') {
    body = `<h1 class="auth-h">${u('login_title')}</h1><p class="muted">${u('login_sub')}</p>
      <button class="auth-opt primary" data-auth="sso">${ic('lock')}<span><b>${u('sso_btn')}</b><small>${u('sso_note')}</small></span>${ic('chev')}</button>
      <button class="auth-opt" data-auth="lms">${ic('cap')}<span><b>${u('lms_btn')}</b><small>${u('lms_note')}</small></span>${ic('chev')}</button>
      <button class="auth-opt" data-auth="invite">${ic('users')}<span><b>${u('inv_btn')}</b></span>${ic('chev')}</button>
      <div class="auth-info">${ic('lock')}<span>${u('no_pw')}</span></div>
      <a class="auth-guest" href="#/home" data-auth="guest">${u('guest_btn')}</a>`;
  } else if (s === 'pick') {
    const roles = Object.keys(ROLES).filter(r => r !== 'mentor');
    body = `<button class="auth-back" data-auth="back">← ${u('back')}</button>
      <h1 class="auth-h">${u('pick_title')}</h1><p class="muted">${u('pick_note')}</p>
      <div class="role-grid">${roles.map(r => `<button class="role-card" data-role="${r}">${ic(ROLES[r].icon)}<b>${t(ROLES[r])}</b><small>${esc(DEMO_USERS[r].name)}</small><em>${t(ROLES[r].d)}</em>${ROLES[r].mfa ? '<span class="chip">2FA</span>' : ''}</button>`).join('')}</div>`;
  } else if (s === 'mfa') {
    body = `<button class="auth-back" data-auth="back">← ${u('back')}</button>
      <div class="auth-badge">${ic('lock')}</div><h1 class="auth-h">${u('mfa_title')}</h1><p class="muted">${u('mfa_text')}</p>
      <form id="mfaf"><input class="code-in" id="mfa" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="${u('mfa_title')}">
      <p class="hint">${u('mfa_demo')}</p><button class="btn btn-p btn-block">${u('confirm')}</button></form>`;
  } else if (s === 'invite') {
    body = `<button class="auth-back" data-auth="back">← ${u('back')}</button>
      <h1 class="auth-h">${u('inv_title')}</h1><p class="muted">${u('inv_text')}</p>
      <form id="invf"><input class="text-in" id="email" type="email" placeholder="name@school.kz" value="${esc(LOGIN.email || '')}" aria-label="E-mail">
      <button class="btn btn-p btn-block" style="margin-top:12px">${u('get_code')}</button></form>`;
  } else if (s === 'code') {
    body = `<button class="auth-back" data-auth="back">← ${u('back')}</button>
      <h1 class="auth-h">${u('inv_title')}</h1><p class="muted">${u('code_sent')} <b>${esc(LOGIN.email)}</b></p>
      <form id="codef"><input class="code-in" id="otp" inputmode="numeric" maxlength="6" placeholder="••••••" aria-label="code">
      <p class="hint">${u('mfa_demo')}</p><button class="btn btn-p btn-block">${u('confirm')}</button></form>`;
  } else if (s === 'consent') {
    body = `<div class="auth-badge">${ic('doc')}</div><h1 class="auth-h">${u('consent_title')}</h1>
      <ul class="ticks consent">${UI[LANG].consent_items.map(x => `<li>${ic('check')}${x}</li>`).join('')}</ul>
      <label class="checkrow"><input type="checkbox" id="cons">${u('consent_check')}</label>
      <p class="hint">${u('consent_ver')}: ${CONSENT_VERSION}</p>
      <div class="auth-row"><button class="btn btn-o" data-auth="decline">${u('decline')}</button><button class="btn btn-p" id="accept" disabled>${u('accept')}</button></div>`;
  }
  return `<div class="auth-wrap"><div class="card auth-card"><div class="auth-logo"><img class="logo-img" src="${LOGO}" alt=""><small>${u('uni')}</small></div>${body}</div></div>`;
}

function pageNeedLogin(next) {
  return `<div class="card gate" style="max-width:560px;margin:20px auto">${ic('lock')}<h3>${u('need_login_title')}</h3><p class="muted">${u('need_login_text')}</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-p" href="#/login" data-next="${esc(next)}">${u('login')}</a><a class="btn btn-o" href="#/catalog">${u('nav_catalog')}</a></div></div>`;
}
function pageDenied(perm) {
  return `<div class="card gate" style="max-width:560px;margin:20px auto">${ic('lock')}<h3>${u('denied_title')}</h3>
    <p class="muted">${u('denied_text')} ${PERMS[perm].map(r => t(ROLES[r])).join(', ')}</p>
    <p>${u('your_role')}: <span class="chip">${t(ROLES[USER.role])}</span></p>
    <a class="btn btn-o" href="#/${ROLES[USER.role].home}">${u('back')}</a></div>`;
}

/* ---------- кабинеты ролей ---------- */
const DEMO_REVIEW = [
  { id: 'PS-091', st: 'review', title: { ru: 'Травля в чате класса', kz: 'Сынып чатындағы қудалау' }, by: 'Гульнара Ахметова' },
  { id: 'PS-094', st: 'review', title: { ru: 'Списывание на пробном тестировании', kz: 'Сынақ тестілеуде көшіру' }, by: 'Гульнара Ахметова' },
  { id: 'PS-097', st: 'draft',  title: { ru: 'Ученик-билингв на уроке казахского языка', kz: 'Қазақ тілі сабағындағы билингв оқушы' }, by: 'Гульнара Ахметова' },
];
const stChip = (st) => ({ published: `<span class="chip oc-good">${u('st_published')}</span>`, review: `<span class="chip oc-risky">${u('st_review')}</span>`, draft: `<span class="chip">${u('st_draft')}</span>` }[st]);

function pageEditor() {
  const rows = [...CASES.map(c => ({ id: c.id, title: c.title, st: 'published' })), ...DEMO_REVIEW];
  return `<div class="page-head"><h2 class="sec-title" style="margin:0">${u('nav_editor')}</h2><button class="btn btn-p" data-cms>${ic('doc')} ${u('new_case')}</button></div>
    <p class="note-line">${ic('lock')} ${u('editor_note')}</p>
    <div class="card pad"><table><tr><th>ID</th><th>${u('nav_catalog')}</th><th>${u('langs')}</th><th>${u('status')}</th><th></th></tr>
    ${rows.map(r => `<tr><td><b>${r.id}</b></td><td>${esc(t(r.title))}</td><td>ҚАЗ · РУС</td><td>${stChip(r.st)}</td><td style="text-align:right"><button class="btn btn-o btn-sm" data-cms>${u('edit')}</button></td></tr>`).join('')}</table></div>`;
}

function pageReview() {
  const reports = store.get('reports', []);
  return `<h2 class="sec-title" style="margin-top:0">${u('nav_review')}</h2>
    <div class="grid2">
      <div class="card pad"><h3 style="margin-bottom:12px">${u('review_cases')}</h3>
        ${DEMO_REVIEW.filter(r => r.st === 'review').map(r => `<div class="rev-item"><div><b>${r.id}</b> ${esc(t(r.title))}<div class="muted" style="font-size:13px">${esc(r.by)}</div></div>
          <div class="rev-act"><button class="btn btn-l btn-sm" data-rev="ok">${u('approve')}</button><button class="btn btn-o btn-sm" data-rev="back">${u('send_back')}</button></div></div>`).join('')}</div>
      <div class="card pad"><h3 style="margin-bottom:6px">${u('reports_title')}</h3><p class="note-line" style="margin:0 0 12px">${ic('lock')} ${u('reports_note')}</p>
        ${reports.length ? reports.map((r, i) => `<div class="rev-item"><div><b>${r.caseId || '—'}</b> · <code>${r.who}</code><div class="muted" style="font-size:13px">${esc(r.text)}</div><div class="muted" style="font-size:12px">${new Date(r.at).toLocaleString('ru-RU')}</div></div>
          <div class="rev-act"><button class="btn btn-o btn-sm" data-resolve="${i}">${u('resolve')}</button></div></div>`).join('') : `<p class="muted">${u('reports_empty')}</p>`}</div>
    </div>`;
}

function pageAdmin() {
  const log = store.get('audit', []);
  const src = { sso: u('src_sso'), lms: u('src_lms'), invite: u('src_invite') };
  return `<h2 class="sec-title" style="margin-top:0">${u('nav_admin')}</h2>
    <p class="note-line">${ic('lock')} ${u('admin_note')}</p>
    <div class="card pad" style="margin-bottom:16px"><h3 style="margin-bottom:12px">${u('admin_users')}</h3>
      <div class="tscroll"><table><tr><th>${u('user_col')}</th><th>${u('role_col')}</th><th>${u('source')}</th><th>2FA</th></tr>
      ${Object.entries(DEMO_USERS).map(([r, d]) => `<tr><td><b>${esc(d.name)}</b><div class="muted" style="font-size:12px">${d.id}</div></td>
        <td><select data-setrole="${d.id}" aria-label="${u('role_col')}">${Object.keys(ROLES).map(k => `<option value="${k}" ${k === r ? 'selected' : ''}>${t(ROLES[k])}</option>`).join('')}</select></td>
        <td>${src[d.src]}</td><td>${ROLES[r].mfa ? '✓' : '—'}</td></tr>`).join('')}</table></div></div>
    <div class="card pad"><h3 style="margin-bottom:12px">${u('audit_title')}</h3>
      ${log.length ? `<div class="tscroll"><table><tr><th>${u('when')}</th><th>${u('who')}</th><th>${u('role_col')}</th><th>${u('action')}</th></tr>
      ${log.slice(0, 25).map(e => `<tr><td>${new Date(e.at).toLocaleString('ru-RU')}</td><td><code>${e.who}</code></td><td>${e.role === 'guest' ? '—' : t(ROLES[e.role])}</td><td>${u(e.action)}${e.extra ? ' · ' + esc(e.extra) : ''}</td></tr>`).join('')}</table></div>` : `<p class="muted">${u('audit_empty')}</p>`}</div>`;
}

/* Блок «Сессия» для профиля */
function sessionCard() {
  const r = ROLES[USER.role];
  const src = { sso: u('src_sso'), lms: u('src_lms'), invite: u('src_invite') }[USER.src];
  const cons = store.get('consent.' + USER.id, null);
  return `<div class="card pad sess">
    <div class="sess-top"><div class="avatar">${esc(USER.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</div>
      <div><b style="font-size:18px">${esc(USER.name)}</b><div><span class="chip">${t(r)}</span>${USER.group ? ` <span class="chip">${USER.group}</span>` : ''}${USER.org ? ` <span class="chip">${esc(USER.org)}</span>` : ''}</div></div></div>
    <ul class="sess-list">
      <li>${ic('lock')}<span>${u('session')}: ${src} · ${USER.mfa ? u('mfa_on') : u('mfa_off')} · ${u('sess_timeout')}</span></li>
      <li>${ic('bot')}<span>${u('pseud')}: <code>${pseudOf(USER.id)}</code></span></li>
      ${cons ? `<li>${ic('doc')}<span>${u('consent_ver')} ${cons.v} · ${new Date(cons.at).toLocaleDateString('ru-RU')}</span></li>` : ''}
      ${USER.until ? `<li>${ic('pin')}<span>${u('access_until')}: ${new Date(USER.until).toLocaleDateString('ru-RU')}</span></li>` : ''}
    </ul>
    <div class="sess-act">
      <label class="role-sw">${u('role_switch')}: <select id="roleswitch">${Object.keys(ROLES).map(k => `<option value="${k}" ${k === USER.role ? 'selected' : ''}>${t(ROLES[k])}</option>`).join('')}</select></label>
      <button class="btn btn-o btn-sm" id="withdraw">${u('withdraw')}</button>
      <button class="btn btn-l btn-sm" id="logout">${u('logout')}</button>
    </div></div>`;
}

/* ---------- обработчики ---------- */
function bindAuth(route) {
  document.querySelectorAll('[data-next]').forEach(a => a.onclick = () => startLogin(a.dataset.next));
  const lo = $('#hdr-login'); if (lo) lo.onclick = () => startLogin(location.hash.includes('login') ? '' : location.hash);

  if (route === 'profile' && USER) {
    $('#logout').onclick = () => logout();
    $('#withdraw').onclick = () => { audit('a_withdraw'); store.set('consent.' + USER.id, null); toast(u('withdrawn')); logout(); };
    $('#roleswitch').onchange = e => { const r = e.target.value; audit('a_role', t(ROLES[r])); finishLogin(r); };
  }
  if (route === 'editor') document.querySelectorAll('[data-cms]').forEach(b => b.onclick = () => toast(u('cms_demo')));
  if (route === 'review') {
    document.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => toast(b.dataset.rev === 'ok' ? u('approved') : u('returned')));
    document.querySelectorAll('[data-resolve]').forEach(b => b.onclick = () => { const r = store.get('reports', []); r.splice(+b.dataset.resolve, 1); store.set('reports', r); render(); });
  }
  if (route === 'admin') document.querySelectorAll('[data-setrole]').forEach(s => s.onchange = () => { audit('a_role_set', `${s.dataset.setrole} → ${t(ROLES[s.value])}`); toast(u('role_changed')); render(); });

  if (route !== 'login') return;
  document.querySelectorAll('[data-auth]').forEach(b => b.onclick = (e) => {
    const k = b.dataset.auth;
    if (k === 'guest') { LOGIN = { step: 'start' }; return; }
    e.preventDefault();
    if (k === 'sso' || k === 'lms') { LOGIN.src = k; LOGIN.step = 'pick'; }
    if (k === 'invite') LOGIN.step = 'invite';
    if (k === 'back') LOGIN.step = LOGIN.step === 'mfa' ? 'pick' : LOGIN.step === 'code' ? 'invite' : 'start';
    if (k === 'decline') { logout(true); LOGIN.step = 'start'; location.hash = '#/home'; return; }
    render();
  });
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => {
    LOGIN.role = b.dataset.role;
    if (ROLES[LOGIN.role].mfa) { LOGIN.step = 'mfa'; render(); $('#mfa')?.focus(); }
    else finishLogin(LOGIN.role, LOGIN.src);
  });
  const mf = $('#mfaf'); if (mf) mf.onsubmit = e => { e.preventDefault(); if (!/^\d{6}$/.test($('#mfa').value)) { toast(u('mfa_bad')); return; } finishLogin(LOGIN.role, LOGIN.src); };
  const inf = $('#invf'); if (inf) inf.onsubmit = e => { e.preventDefault(); const v = $('#email').value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { toast(u('email_bad')); return; } LOGIN.email = v; LOGIN.step = 'code'; render(); $('#otp')?.focus(); };
  const cf = $('#codef'); if (cf) cf.onsubmit = e => { e.preventDefault(); if (!/^\d{6}$/.test($('#otp').value)) { toast(u('mfa_bad')); return; } finishLogin('mentor', 'invite'); };
  const cb = $('#cons'), ac = $('#accept');
  if (cb && ac) { cb.onchange = () => ac.disabled = !cb.checked; ac.onclick = () => { store.set('consent.' + USER.id, { v: CONSENT_VERSION, at: new Date().toISOString() }); audit('a_consent', CONSENT_VERSION); goAfterLogin(); }; }
}
