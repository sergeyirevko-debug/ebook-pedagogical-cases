/* ============================================================
   АВТОРИЗАЦИЯ (демо) / АВТОРИЗАЦИЯ (демо)
   Имитирует целевую схему: собственные учётные записи e-book
   (без входа через сторонние сервисы) — импорт списков групп,
   коды активации, e-mail + пароль, второй фактор для сотрудников,
   согласие на обработку ПД, ролевой доступ и журнал действий.
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

/* Демо-учётные записи (вымышленные). Источник: импорт списка группы, создание администратором, приглашение */
const DEMO_USERS = {
  student:   { id: 'u-s01', name: 'Айдана Серикова',   email: 'student@ebook.demo',   src: 'import', group: 'ПО-21' },
  teacher:   { id: 'u-t01', name: 'Ерлан Касымов',     email: 'teacher@ebook.demo',   src: 'admin',  groups: ['ПО-21', 'ПО-22'] },
  methodist: { id: 'u-m01', name: 'Гульнара Ахметова', email: 'methodist@ebook.demo', src: 'admin' },
  expert:    { id: 'u-e01', name: 'Марат Жунусов',     email: 'expert@ebook.demo',    src: 'admin' },
  admin:     { id: 'u-a01', name: 'IT-администратор',  email: 'admin@ebook.demo',     src: 'admin' },
  mentor:    { id: 'u-x01', name: 'Сауле Нурланова',   email: 'mentor@ebook.demo',    src: 'invite', org: 'СШ № 12', until: '2027-06-30' },
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


Object.assign(UI.ru, {
  login_sub: 'Учётную запись выдаёт преподаватель или администратор e-book', email_label: 'E-mail', pw_label: 'Пароль', sign_in: 'Войти',
  forgot: 'Забыли пароль?', activate_link: 'Активировать учётную запись',
  no_pw: 'Вход только по учётной записи e-book — сторонние сервисы не используются. Пароли хранятся в виде стойкого хеша (Argon2id).',
  demo_quick: 'Демо: быстрый вход под ролью', demo_hint: 'или введите, например, student@ebook.demo и любой пароль',
  bad_login: 'Неверный e-mail или пароль. Осталось попыток:', locked: 'Слишком много попыток. Вход временно заблокирован на 15 минут.',
  act_title: 'Активация учётной записи', act_text: 'Введите код активации из письма-приглашения или полученный от преподавателя. Код одноразовый и действует 7 дней.',
  act_demo: 'Демо: STUD-2026 — студент, MENT-2026 — наставник', act_bad: 'Код не найден или срок его действия истёк', next_btn: 'Далее',
  setpw_title: 'Придумайте пароль', pw_repeat: 'Повторите пароль', pw_rules: ['Не короче 10 символов', 'Есть буквы и цифры', 'Пароли совпадают'], pw_save: 'Сохранить и войти',
  forgot_title: 'Восстановление пароля', forgot_text: 'Введите e-mail учётной записи — мы отправим ссылку для смены пароля.', send_link: 'Отправить ссылку',
  sent_title: 'Проверьте почту', sent_text: 'Если такой адрес есть в системе, на него отправлена ссылка для смены пароля. Ссылка действует 30 минут.',
  no_mail: 'Нет доступа к почте? Обратитесь к преподавателю или администратору — они выдадут новый код активации.', back_login: 'Вернуться ко входу',
  src_import: 'Импорт списка группы', src_admin: 'Создан администратором', src_invite: 'Приглашение преподавателя', src_code: 'Код активации',
  acc_title: 'Учётные записи группы', acc_import: 'Импорт списка (Excel/CSV)', acc_codes: 'Выдать коды активации',
  acc_note: 'Список группы загружает преподаватель: ФИО и e-mail (если есть). Студенты без e-mail получают код активации на занятии.',
  acc_on: 'Активирован', acc_wait: 'Ожидает активации', acc_reset: 'Новый код', acc_code_col: 'Код',
  acc_imported: 'Демо: в рабочей системе откроется загрузка файла со списком группы.', acc_codes_done: 'Коды сформированы — распечатайте и раздайте студентам (демо).',
  a_import: 'Импорт списка группы', a_codes: 'Выданы коды активации', a_reset: 'Новый код для студента', a_activate: 'Активация учётной записи',
  a_fail: 'Неудачная попытка входа', a_pwreset: 'Запрос смены пароля',
});
Object.assign(UI.kz, {
  login_sub: 'Есептік жазбаны оқытушы немесе e-book әкімшісі береді', email_label: 'E-mail', pw_label: 'Құпиясөз', sign_in: 'Кіру',
  forgot: 'Құпиясөзді ұмыттыңыз ба?', activate_link: 'Есептік жазбаны белсендіру',
  no_pw: 'Кіру тек e-book есептік жазбасы арқылы — бөгде сервистер қолданылмайды. Құпиясөздер берік хеш (Argon2id) түрінде сақталады.',
  demo_quick: 'Демо: рөл бойынша жылдам кіру', demo_hint: 'немесе, мысалы, student@ebook.demo және кез келген құпиясөзді енгізіңіз',
  bad_login: 'E-mail немесе құпиясөз қате. Қалған әрекеттер:', locked: 'Әрекеттер тым көп. Кіру 15 минутқа уақытша бұғатталды.',
  act_title: 'Есептік жазбаны белсендіру', act_text: 'Шақыру хаттағы немесе оқытушыдан алған белсендіру кодын енгізіңіз. Код бір реттік, 7 күн жарамды.',
  act_demo: 'Демо: STUD-2026 — студент, MENT-2026 — тәлімгер', act_bad: 'Код табылмады немесе мерзімі өтті', next_btn: 'Әрі қарай',
  setpw_title: 'Құпиясөз ойлап табыңыз', pw_repeat: 'Құпиясөзді қайталаңыз', pw_rules: ['Кемінде 10 таңба', 'Әріптер мен цифрлар бар', 'Құпиясөздер сәйкес келеді'], pw_save: 'Сақтау және кіру',
  forgot_title: 'Құпиясөзді қалпына келтіру', forgot_text: 'Есептік жазбаның e-mail-ін енгізіңіз — құпиясөзді ауыстыру сілтемесін жібереміз.', send_link: 'Сілтеме жіберу',
  sent_title: 'Поштаңызды тексеріңіз', sent_text: 'Егер мұндай мекенжай жүйеде болса, оған құпиясөзді ауыстыру сілтемесі жіберілді. Сілтеме 30 минут жарамды.',
  no_mail: 'Поштаға қолжетімділік жоқ па? Оқытушыға немесе әкімшіге хабарласыңыз — олар жаңа белсендіру кодын береді.', back_login: 'Кіруге оралу',
  src_import: 'Топ тізімін импорттау', src_admin: 'Әкімші жасаған', src_invite: 'Оқытушының шақыруы', src_code: 'Белсендіру коды',
  acc_title: 'Топтың есептік жазбалары', acc_import: 'Тізімді импорттау (Excel/CSV)', acc_codes: 'Белсендіру кодтарын беру',
  acc_note: 'Топ тізімін оқытушы жүктейді: аты-жөні және e-mail (бар болса). E-mail-і жоқ студенттер белсендіру кодын сабақта алады.',
  acc_on: 'Белсендірілген', acc_wait: 'Белсендіруді күтуде', acc_reset: 'Жаңа код', acc_code_col: 'Код',
  acc_imported: 'Демо: нақты жүйеде топ тізімі бар файлды жүктеу ашылады.', acc_codes_done: 'Кодтар жасалды — басып шығарып, студенттерге таратыңыз (демо).',
  a_import: 'Топ тізімі импортталды', a_codes: 'Белсендіру кодтары берілді', a_reset: 'Студентке жаңа код', a_activate: 'Есептік жазба белсендірілді',
  a_fail: 'Сәтсіз кіру әрекеті', a_pwreset: 'Құпиясөзді ауыстыру сұрауы',
});
const SRC_LABEL = (k) => u('src_' + k);

/* ---------- вход / выход ---------- */
function startLogin(next) { LOGIN = { step: 'start', next: next || LOGIN.next || '' }; }
function finishLogin(role, src) {
  LOGIN.err = ''; LOGIN.fails = 0;
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
    const err = LOGIN.err ? `<p class="form-err">${LOGIN.err}</p>` : '';
    body = `<h1 class="auth-h">${u('login_title')}</h1><p class="muted">${u('login_sub')}</p>
      <form id="loginf" class="auth-form" novalidate>
        <label>${u('email_label')}<input class="text-in" id="lemail" type="email" autocomplete="username" value="${esc(LOGIN.email || '')}"></label>
        <label>${u('pw_label')}<input class="text-in" id="lpw" type="password" autocomplete="current-password"></label>
        ${err}<button class="btn btn-p btn-block" ${LOGIN.locked ? 'disabled' : ''}>${u('sign_in')}</button></form>
      <div class="auth-links"><a href="#/login" data-auth="forgot">${u('forgot')}</a><a href="#/login" data-auth="activate">${u('activate_link')}</a></div>
      <div class="auth-info">${ic('lock')}<span>${u('no_pw')}</span></div>
      <div class="demo-box"><b>${u('demo_quick')}</b><div class="demo-roles">${Object.keys(ROLES).map(r => `<button class="pchip" data-role="${r}">${t(ROLES[r])}${ROLES[r].mfa ? ' · 2FA' : ''}</button>`).join('')}</div><small>${u('demo_hint')}</small></div>
      <a class="auth-guest" href="#/home" data-auth="guest">${u('guest_btn')}</a>`;
  } else if (s === 'mfa') {
    body = `<button class="auth-back" data-auth="back">← ${u('back')}</button>
      <div class="auth-badge">${ic('lock')}</div><h1 class="auth-h">${u('mfa_title')}</h1><p class="muted">${u('mfa_text')}</p>
      <form id="mfaf"><input class="code-in" id="mfa" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="${u('mfa_title')}">
      <p class="hint">${u('mfa_demo')}</p><button class="btn btn-p btn-block">${u('confirm')}</button></form>`;
  } else if (s === 'activate') {
    body = `<button class="auth-back" data-auth="back">← ${u('back')}</button>
      <div class="auth-badge">${ic('users')}</div><h1 class="auth-h">${u('act_title')}</h1><p class="muted">${u('act_text')}</p>
      <form id="actf"><input class="code-in act" id="actcode" maxlength="9" placeholder="XXXX-0000" autocomplete="one-time-code" aria-label="${u('act_title')}">
      <p class="hint">${u('act_demo')}</p><button class="btn btn-p btn-block">${u('next_btn')}</button></form>`;
  } else if (s === 'setpw') {
    body = `<h1 class="auth-h">${u('setpw_title')}</h1><p class="muted">${esc(DEMO_USERS[LOGIN.actRole].name)} · ${t(ROLES[LOGIN.actRole])}</p>
      <form id="pwf" class="auth-form"><label>${u('pw_label')}<input class="text-in" id="pw1" type="password" autocomplete="new-password"></label>
      <label>${u('pw_repeat')}<input class="text-in" id="pw2" type="password" autocomplete="new-password"></label>
      <ul class="pw-rules">${UI[LANG].pw_rules.map((r, i) => `<li data-rule="${i}">${ic('check')}${r}</li>`).join('')}</ul>
      <button class="btn btn-p btn-block" id="pwsave" disabled>${u('pw_save')}</button></form>`;
  } else if (s === 'forgot') {
    body = `<button class="auth-back" data-auth="back">← ${u('back')}</button>
      <h1 class="auth-h">${u('forgot_title')}</h1><p class="muted">${u('forgot_text')}</p>
      <form id="fgf"><input class="text-in" id="fgemail" type="email" placeholder="name@example.kz" aria-label="E-mail">
      <button class="btn btn-p btn-block" style="margin-top:12px">${u('send_link')}</button></form>
      <p class="hint" style="margin-top:14px">${u('no_mail')}</p>`;
  } else if (s === 'sent') {
    body = `<div class="auth-badge">${ic('check')}</div><h1 class="auth-h">${u('sent_title')}</h1><p class="muted">${u('sent_text')}</p>
      <p class="hint">${u('no_mail')}</p><button class="btn btn-o btn-block" data-auth="back">${u('back_login')}</button>`;
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

/* Жалобы на ответы AI: с сервера тьютора (общая очередь, GET /api/tutor/reports), без сервера — из браузера (демо). */
let SRV_REPORTS = null;
function loadSrvReports() {
  if (!tutorLive()) return;
  tutorFetch('/reports').then(r => r.ok ? r.json() : null).then(list => {
    if (!list) return;
    SRV_REPORTS = list.map(x => ({ id: x.id, caseId: x.caseId, who: x.who, text: (x.reply || '').slice(0, 160), at: x.at * 1000 }));
    if (location.hash.startsWith('#/review')) render();
  }).catch(() => {});
}
function pageReview() {
  if (SRV_REPORTS === null) { SRV_REPORTS = undefined; loadSrvReports(); }
  const reports = SRV_REPORTS || store.get('reports', []);
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
  return `<h2 class="sec-title" style="margin-top:0">${u('nav_admin')}</h2>
    <p class="note-line">${ic('lock')} ${u('admin_note')}</p>
    <div class="card pad" style="margin-bottom:16px"><h3 style="margin-bottom:12px">${u('admin_users')}</h3>
      <div class="tscroll"><table><tr><th>${u('user_col')}</th><th>${u('role_col')}</th><th>${u('source')}</th><th>2FA</th></tr>
      ${Object.entries(DEMO_USERS).map(([r, d]) => `<tr><td><b>${esc(d.name)}</b><div class="muted" style="font-size:12px">${d.id}</div></td>
        <td><select data-setrole="${d.id}" aria-label="${u('role_col')}">${Object.keys(ROLES).map(k => `<option value="${k}" ${k === r ? 'selected' : ''}>${t(ROLES[k])}</option>`).join('')}</select></td>
        <td>${SRC_LABEL(d.src)}</td><td>${ROLES[r].mfa ? '✓' : '—'}</td></tr>`).join('')}</table></div></div>
    <div class="card pad"><h3 style="margin-bottom:12px">${u('audit_title')}</h3>
      ${log.length ? `<div class="tscroll"><table><tr><th>${u('when')}</th><th>${u('who')}</th><th>${u('role_col')}</th><th>${u('action')}</th></tr>
      ${log.slice(0, 25).map(e => `<tr><td>${new Date(e.at).toLocaleString('ru-RU')}</td><td><code>${e.who}</code></td><td>${e.role === 'guest' ? '—' : t(ROLES[e.role])}</td><td>${u(e.action)}${e.extra ? ' · ' + esc(e.extra) : ''}</td></tr>`).join('')}</table></div>` : `<p class="muted">${u('audit_empty')}</p>`}</div>`;
}

/* Блок «Сессия» для профиля */
function sessionCard() {
  const r = ROLES[USER.role];
  const src = SRC_LABEL(USER.src);
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
    $('#withdraw').onclick = () => { audit('a_withdraw'); store.set('consent.' + USER.id, null);
      /* отзыв согласия на сервере тьютора: удаляет сохранённые диалоги, обезличивает жалобы */
      if (tutorLive()) fetch(TUTOR.api.replace(/\/tutor$/, '/consent'), { method: 'DELETE', credentials: 'same-origin', headers: tutorHeaders() }).catch(() => {});
      toast(u('withdrawn')); logout(); };
    $('#roleswitch').onchange = e => { const r = e.target.value; audit('a_role', t(ROLES[r])); finishLogin(r); };
  }
  if (route === 'editor') document.querySelectorAll('[data-cms]').forEach(b => b.onclick = () => toast(u('cms_demo')));
  if (route === 'review') {
    document.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => toast(b.dataset.rev === 'ok' ? u('approved') : u('returned')));
    document.querySelectorAll('[data-resolve]').forEach(b => b.onclick = () => {
      if (SRV_REPORTS) { const it = SRV_REPORTS[+b.dataset.resolve]; tutorFetch(`/reports/${it.id}/resolve`, { method: 'POST', body: '{}' }).then(loadSrvReports); SRV_REPORTS.splice(+b.dataset.resolve, 1); render(); return; }
      const r = store.get('reports', []); r.splice(+b.dataset.resolve, 1); store.set('reports', r); render(); });
  }
  if (route === 'admin') document.querySelectorAll('[data-setrole]').forEach(s => s.onchange = () => { audit('a_role_set', `${s.dataset.setrole} → ${t(ROLES[s.value])}`); toast(u('role_changed')); render(); });

  if (route !== 'login') return;
  document.querySelectorAll('[data-auth]').forEach(b => b.onclick = (e) => {
    const k = b.dataset.auth;
    if (k === 'guest') { LOGIN = { step: 'start' }; return; }
    e.preventDefault();
    if (k === 'forgot' || k === 'activate') LOGIN.step = k;
    if (k === 'back') LOGIN.step = 'start';
    if (k === 'decline') { logout(true); LOGIN.step = 'start'; location.hash = '#/home'; return; }
    render();
  });
  const staffCheck = (role, src) => { LOGIN.role = role; LOGIN.src = src; if (ROLES[role].mfa) { LOGIN.step = 'mfa'; render(); $('#mfa')?.focus(); } else finishLogin(role, src); };
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => staffCheck(b.dataset.role, DEMO_USERS[b.dataset.role].src));
  const lf = $('#loginf'); if (lf) lf.onsubmit = e => {
    e.preventDefault(); if (LOGIN.locked) return;
    const em = $('#lemail').value.trim().toLowerCase(), pw = $('#lpw').value;
    const role = Object.keys(DEMO_USERS).find(r => DEMO_USERS[r].email === em);
    LOGIN.email = em;
    if (!role || !pw) {
      LOGIN.fails = (LOGIN.fails || 0) + 1; audit('a_fail', em ? em.replace(/(.).+@/, '$1***@') : '');
      if (LOGIN.fails >= 5) { LOGIN.locked = true; LOGIN.err = u('locked'); } else LOGIN.err = `${u('bad_login')} ${5 - LOGIN.fails}`;
      render(); return;
    }
    staffCheck(role, DEMO_USERS[role].src);
  };
  const mf = $('#mfaf'); if (mf) mf.onsubmit = e => { e.preventDefault(); if (!/^\d{6}$/.test($('#mfa').value)) { toast(u('mfa_bad')); return; } finishLogin(LOGIN.role, LOGIN.src); };
  const af = $('#actf'); if (af) {
    const inp = $('#actcode'); inp.oninput = () => { inp.value = inp.value.toUpperCase(); };
    af.onsubmit = e => { e.preventDefault(); const v = inp.value.trim().toUpperCase();
      const role = v === 'STUD-2026' ? 'student' : v === 'MENT-2026' ? 'mentor' : null;
      if (!role) { toast(u('act_bad')); return; } LOGIN.actRole = role; LOGIN.step = 'setpw'; render(); $('#pw1')?.focus(); };
  }
  const pf = $('#pwf'); if (pf) {
    const chk = () => { const a = $('#pw1').value, b = $('#pw2').value; const ok = [a.length >= 10, /\p{L}/u.test(a) && /\d/.test(a), a.length > 0 && a === b];
      ok.forEach((v, i) => pf.querySelector(`[data-rule="${i}"]`).classList.toggle('ok', v)); $('#pwsave').disabled = !ok.every(Boolean); };
    $('#pw1').oninput = chk; $('#pw2').oninput = chk;
    pf.onsubmit = e => { e.preventDefault(); const r = LOGIN.actRole; finishLogin(r, 'code'); audit('a_activate', t(ROLES[r])); };
  }
  const ff = $('#fgf'); if (ff) ff.onsubmit = e => { e.preventDefault(); const v = $('#fgemail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { toast(u('email_bad')); return; } audit('a_pwreset'); LOGIN.step = 'sent'; render(); };
  const cb = $('#cons'), ac = $('#accept');
  if (cb && ac) { cb.onchange = () => ac.disabled = !cb.checked; ac.onclick = () => { store.set('consent.' + USER.id, { v: CONSENT_VERSION, at: new Date().toISOString() }); audit('a_consent', CONSENT_VERSION); TUTOR.consentSynced = false; syncConsent(); goAfterLogin(); }; }
}
