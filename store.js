/* Модель данных, хранение (localStorage) и бизнес-логика жизненного цикла поручений. */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'order_control_v1';
  var C = global.Calendar;

  var state = null;

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function nowISO() { return C.toISO(new Date()); }
  function nowStamp() {
    var d = new Date();
    return C.formatRu(d) + ' ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function regNumberFor(year, seqMap) {
    var n = (seqMap[year] || 0) + 1;
    seqMap[year] = n;
    return 'ПОР-' + year + '-' + (n < 1000 ? ('000' + n).slice(-4) : n);
  }

  // ---------- Seed data ----------
  function seed() {
    var employees = [
      { id: 'e1', name: 'Ургеншбаев Максат', position: 'Начальник отдела', roles: ['руководитель'], email: 'urgenshbaev@dept.kz' },
      { id: 'e2', name: 'Хаджиметов Зохиджан', position: 'Делопроизводитель', roles: ['контролёр'], email: 'hadzhimetov@dept.kz' },
      { id: 'e3', name: 'Атамбай Ерлан', position: 'Ведущий специалист', roles: ['исполнитель'], email: 'atambay@dept.kz' },
      { id: 'e4', name: 'Абдухожаев Талгатбек', position: 'Главный специалист', roles: ['исполнитель'], email: 'abduhozhaev@dept.kz' },
      { id: 'e5', name: 'Сарыбай Серик', position: 'Специалист', roles: ['исполнитель'], email: 'sarybay@dept.kz' },
      { id: 'e6', name: 'Жомарт Ануар', position: 'Заместитель начальника отдела', roles: ['контролёр', 'исполнитель'], email: 'zhomart@dept.kz' }
    ];

    var seqMap = { 2026: 0 };
    function reg() { return regNumberFor(2026, seqMap); }

    function mkHistory(items) { return items.map(function (i) { return Object.assign({ id: uid('h') }, i); }); }
    function mkProgress(items) { return items.map(function (i) { return Object.assign({ id: uid('p') }, i); }); }

    var orders = [];

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'приказ', docNumberDate: '№ 4-12 от 01.09.2026',
      correspondent: 'Внутренний приказ', resolution: 'Обеспечить подготовку годового отчёта по итогам инвентаризации и передать в бухгалтерию.',
      summary: 'Годовой отчёт по инвентаризации', executorId: 'e3', coExecutorIds: [],
      orderDate: '2026-09-01', dueDate: '2026-09-18', priority: 'высокий', recurrence: 'разовое',
      resultRequirements: 'Отчёт в формате Excel с подписью главного специалиста',
      attachments: [{ name: 'приказ_4-12.pdf', addedBy: 'Хаджиметов Зохиджан', date: '2026-09-01' }],
      progressLog: mkProgress([{ date: '2026-09-05', author: 'Атамбай Ерлан', text: 'Запрошены данные у бухгалтерии.' }]),
      history: mkHistory([{ date: '2026-09-01', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' }]),
      status: 'В работе', acceptedDate: null, submittedDates: [], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false, extensionRequests: [], removalReason: null,
      recurringParentId: null, registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-09-01'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'входящий документ', docNumberDate: '№ 12-05/318 от 22.09.2026',
      correspondent: 'Акимат г. Алматы', resolution: 'Подготовить свод предложений и согласовать с юр. отделом.',
      summary: 'Свод предложений по оптимизации процессов', executorId: 'e4', coExecutorIds: ['e5'],
      orderDate: '2026-09-15', dueDate: '2026-09-25', priority: 'срочный', recurrence: 'разовое',
      resultRequirements: 'Письмо-ответ за подписью руководителя',
      attachments: [{ name: 'запрос_акимата.pdf', addedBy: 'Хаджиметов Зохиджан', date: '2026-09-15' }],
      progressLog: mkProgress([
        { date: '2026-09-20', author: 'Абдухожаев Талгатбек', text: 'Проект свода согласован с ПТО.' },
        { date: '2026-09-25', author: 'Абдухожаев Талгатбек', text: 'Результат передан на проверку.' }
      ]),
      history: mkHistory([{ date: '2026-09-15', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' }]),
      status: 'На проверке', acceptedDate: null, submittedDates: ['2026-09-25'], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false, extensionRequests: [], removalReason: null,
      recurringParentId: null, registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-09-15'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'устное указание', docNumberDate: '',
      correspondent: '', resolution: 'Подготовить справку по обращениям граждан за сентябрь.',
      summary: 'Справка по обращениям граждан', executorId: 'e5', coExecutorIds: [],
      orderDate: '2026-09-20', dueDate: '2026-09-26', priority: 'обычный', recurrence: 'разовое',
      resultRequirements: 'Справка в свободной форме, до 2 страниц',
      attachments: [],
      progressLog: mkProgress([{ date: '2026-09-22', author: 'Сарыбай Серик', text: 'Данные собираются по подразделениям.' }]),
      history: mkHistory([{ date: '2026-09-20', author: 'Ургеншбаев Максат', action: 'Регистрация', detail: 'Устное указание зарегистрировано' }]),
      status: 'В работе', acceptedDate: null, submittedDates: [], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false, extensionRequests: [], removalReason: null,
      recurringParentId: null, registeredBy: 'Ургеншбаев Максат', registeredDate: '2026-09-20'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'протокол совещания', docNumberDate: '№ 8 от 18.09.2026',
      correspondent: 'Аппарат акима области', resolution: 'Подготовить предложения в план мероприятий на IV квартал.',
      summary: 'Предложения в план мероприятий Q4', executorId: 'e6', coExecutorIds: [],
      orderDate: '2026-09-18', dueDate: '2026-09-29', priority: 'высокий', recurrence: 'разовое',
      resultRequirements: 'Служебная записка с перечнем мероприятий',
      attachments: [],
      progressLog: mkProgress([{ date: '2026-09-19', author: 'Жомарт Ануар', text: 'Собраны предложения от секторов.' }]),
      history: mkHistory([{ date: '2026-09-18', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' }]),
      status: 'В работе', acceptedDate: null, submittedDates: [], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false,
      extensionRequests: [{ id: uid('ext'), requestedBy: 'Жомарт Ануар', requestedDate: '2026-09-24', newDate: '2026-10-06', reason: 'Требуется дополнительное согласование с смежным отделом.', status: 'ожидает', decidedBy: null, decidedDate: null }],
      removalReason: null, recurringParentId: null, registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-09-18'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'входящий документ', docNumberDate: '№ 3-1/220 от 20.09.2026',
      correspondent: 'Министерство труда', resolution: 'Подготовить ответ по запросу статистических данных.', summary: 'Ответ по статистическим данным',
      executorId: 'e3', coExecutorIds: [], orderDate: '2026-09-21', dueDate: '2026-10-01', priority: 'обычный', recurrence: 'разовое',
      resultRequirements: 'Письмо-ответ с приложением таблиц', attachments: [],
      progressLog: mkProgress([]),
      history: mkHistory([{ date: '2026-09-21', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' }]),
      status: 'Новое', acceptedDate: null, submittedDates: [], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false, extensionRequests: [], removalReason: null,
      recurringParentId: null, registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-09-21'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'приказ', docNumberDate: '№ 4-15 от 10.09.2026',
      correspondent: 'Внутренний приказ', resolution: 'Актуализировать регламент документооборота отдела.', summary: 'Актуализация регламента документооборота',
      executorId: 'e4', coExecutorIds: [], orderDate: '2026-09-10', dueDate: '2026-10-15', priority: 'обычный', recurrence: 'разовое',
      resultRequirements: 'Проект регламента, версия для согласования', attachments: [],
      progressLog: mkProgress([]),
      history: mkHistory([{ date: '2026-09-10', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' }]),
      status: 'В работе', acceptedDate: null, submittedDates: [], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false, extensionRequests: [], removalReason: null,
      recurringParentId: null, registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-09-10'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'протокол совещания', docNumberDate: '№ 5 от 20.08.2026',
      correspondent: 'Аппарат акима области', resolution: 'Подготовить аналитическую записку по обращениям за август.', summary: 'Аналитическая записка по обращениям за август',
      executorId: 'e3', coExecutorIds: [], orderDate: '2026-08-21', dueDate: '2026-09-04', priority: 'высокий', recurrence: 'разовое',
      resultRequirements: 'Записка с приложением диаграмм', attachments: [
        { name: 'записка_август.docx', addedBy: 'Атамбай Ерлан', date: '2026-09-03' }
      ],
      progressLog: mkProgress([
        { date: '2026-09-03', author: 'Атамбай Ерлан', text: 'Результат передан на проверку.' }
      ]),
      history: mkHistory([
        { date: '2026-08-21', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' },
        { date: '2026-09-04', author: 'Ургеншбаев Максат', action: 'Приёмка', detail: 'Принято, оценка 5' }
      ]),
      status: 'Исполнено', acceptedDate: '2026-09-04', submittedDates: ['2026-09-03'], qualityScore: 5,
      managerComment: 'Отлично, без замечаний.', returnsCount: 0, onTimeFlag: true, escalated: false,
      extensionRequests: [], removalReason: null, recurringParentId: null, registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-08-21'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'входящий документ', docNumberDate: '№ 1-4/110 от 05.08.2026',
      correspondent: 'Департамент юстиции', resolution: 'Подготовить заключение по проекту нормативного акта.', summary: 'Заключение по проекту НПА',
      executorId: 'e4', coExecutorIds: [], orderDate: '2026-08-06', dueDate: '2026-08-20', priority: 'высокий', recurrence: 'разовое',
      resultRequirements: 'Заключение с визой юр. отдела', attachments: [
        { name: 'заключение_финал.pdf', addedBy: 'Абдухожаев Талгатбек', date: '2026-08-25' }
      ],
      progressLog: mkProgress([
        { date: '2026-08-19', author: 'Абдухожаев Талгатбек', text: 'Первый вариант передан на проверку.' },
        { date: '2026-08-22', author: 'Ургеншбаев Максат', text: 'Возврат на доработку: требуется уточнить основания.' },
        { date: '2026-08-25', author: 'Абдухожаев Талгатбек', text: 'Доработано и повторно передано на проверку.' }
      ]),
      history: mkHistory([
        { date: '2026-08-06', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' },
        { date: '2026-08-22', author: 'Ургеншбаев Максат', action: 'Возврат на доработку', detail: 'Оценка 2, требуется уточнить основания' },
        { date: '2026-08-25', author: 'Ургеншбаев Максат', action: 'Приёмка', detail: 'Принято, оценка 3' }
      ]),
      status: 'Исполнено', acceptedDate: '2026-08-25', submittedDates: ['2026-08-19', '2026-08-25'], qualityScore: 3,
      managerComment: 'Приняты с учётом исправлений, но со значительным опозданием и после доработки.', returnsCount: 1, onTimeFlag: false, escalated: false,
      extensionRequests: [], removalReason: null, recurringParentId: null, registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-08-06'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'приказ', docNumberDate: '№ 4-9 от 01.09.2026',
      correspondent: 'Внутренний приказ', resolution: 'Подготовить проект приказа о премировании по итогам квартала.', summary: 'Проект приказа о премировании',
      executorId: 'e5', coExecutorIds: [], orderDate: '2026-09-02', dueDate: '2026-09-16', priority: 'обычный', recurrence: 'разовое',
      resultRequirements: 'Проект приказа с листом согласования', attachments: [],
      progressLog: mkProgress([
        { date: '2026-09-15', author: 'Сарыбай Серик', text: 'Первый вариант передан на проверку.' },
        { date: '2026-09-17', author: 'Ургеншбаев Максат', text: 'Возврат: не учтены показатели KPI сотрудников.' }
      ]),
      history: mkHistory([
        { date: '2026-09-02', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' },
        { date: '2026-09-17', author: 'Ургеншбаев Максат', action: 'Возврат на доработку', detail: 'Оценка 2, не учтены показатели KPI' }
      ]),
      status: 'На доработке', acceptedDate: null, submittedDates: ['2026-09-15'], qualityScore: null, managerComment: 'Не учтены показатели KPI сотрудников, требуется пересмотреть проект.',
      returnsCount: 1, onTimeFlag: null, escalated: false, extensionRequests: [], removalReason: null,
      recurringParentId: null, registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-09-02'
    });

    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'входящий документ', docNumberDate: '№ 2-2/070 от 15.07.2026',
      correspondent: 'Общественный совет', resolution: 'Организовать встречу с общественным советом по вопросам ЖКХ.', summary: 'Встреча с общественным советом по ЖКХ',
      executorId: 'e6', coExecutorIds: [], orderDate: '2026-07-16', dueDate: '2026-08-05', priority: 'обычный', recurrence: 'разовое',
      resultRequirements: 'Протокол встречи', attachments: [],
      progressLog: mkProgress([{ date: '2026-07-20', author: 'Жомарт Ануар', text: 'Вопрос утратил актуальность в связи с переносом на следующий год.' }]),
      history: mkHistory([
        { date: '2026-07-16', author: 'Хаджиметов Зохиджан', action: 'Регистрация', detail: 'Поручение зарегистрировано' },
        { date: '2026-07-21', author: 'Ургеншбаев Максат', action: 'Снято с контроля', detail: 'Основание: вопрос перенесён на 2027 год решением акима области' }
      ]),
      status: 'Снято с контроля', acceptedDate: null, submittedDates: [], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false, extensionRequests: [],
      removalReason: 'Вопрос перенесён на 2027 год решением акима области', recurringParentId: null,
      registeredBy: 'Хаджиметов Зохиджан', registeredDate: '2026-07-16'
    });

    // Периодическое поручение — уже исполнен один экземпляр, второй создан автоматически.
    var recParentId = uid('ord');
    orders.push({
      id: recParentId, regNumber: reg(), basisType: 'приказ', docNumberDate: '№ 4-1 от 15.06.2026',
      correspondent: 'Внутренний приказ', resolution: 'Готовить ежемесячный свод исполнительской дисциплины отдела.', summary: 'Ежемесячный свод исполнительской дисциплины',
      executorId: 'e6', coExecutorIds: [], orderDate: '2026-08-01', dueDate: '2026-08-31', priority: 'обычный', recurrence: 'ежемесячное',
      resultRequirements: 'Свод в формате Excel/PDF', attachments: [
        { name: 'свод_август.xlsx', addedBy: 'Жомарт Ануар', date: '2026-08-29' }
      ],
      progressLog: mkProgress([{ date: '2026-08-29', author: 'Жомарт Ануар', text: 'Свод подготовлен и передан на проверку.' }]),
      history: mkHistory([
        { date: '2026-08-01', author: 'Ургеншбаев Максат', action: 'Регистрация', detail: 'Периодическое поручение зарегистрировано' },
        { date: '2026-08-30', author: 'Ургеншбаев Максат', action: 'Приёмка', detail: 'Принято, оценка 4' },
        { date: '2026-08-30', author: 'Система', action: 'Автосоздание', detail: 'Создан следующий экземпляр периодического поручения' }
      ]),
      status: 'Исполнено', acceptedDate: '2026-08-30', submittedDates: ['2026-08-29'], qualityScore: 4,
      managerComment: 'Небольшие правки по оформлению.', returnsCount: 0, onTimeFlag: true, escalated: false,
      extensionRequests: [], removalReason: null, recurringParentId: null, registeredBy: 'Ургеншбаев Максат', registeredDate: '2026-08-01'
    });
    orders.push({
      id: uid('ord'), regNumber: reg(), basisType: 'приказ', docNumberDate: '№ 4-1 от 15.06.2026',
      correspondent: 'Внутренний приказ', resolution: 'Готовить ежемесячный свод исполнительской дисциплины отдела.', summary: 'Ежемесячный свод исполнительской дисциплины',
      executorId: 'e6', coExecutorIds: [], orderDate: '2026-08-31', dueDate: '2026-09-30', priority: 'обычный', recurrence: 'ежемесячное',
      resultRequirements: 'Свод в формате Excel/PDF', attachments: [],
      progressLog: mkProgress([]),
      history: mkHistory([{ date: '2026-08-30', author: 'Система', action: 'Автосоздание', detail: 'Создано автоматически из ' + orders[orders.length - 1].regNumber }]),
      status: 'Новое', acceptedDate: null, submittedDates: [], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false, extensionRequests: [], removalReason: null,
      recurringParentId: recParentId, registeredBy: 'Система', registeredDate: '2026-08-30'
    });

    return {
      employees: employees,
      orders: orders,
      seqMap: seqMap,
      currentUserId: 'e1',
      activeRole: 'руководитель',
      settings: { returnPenalty: 0.5, latePenalty: 1, priorityWeights: { 'срочный': 1.5, 'высокий': 1.2, 'обычный': 1 } },
      notificationsReadAt: null
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = JSON.parse(raw);
        return state;
      }
    } catch (e) { /* ignore parse errors, reseed */ }
    state = seed();
    persist();
    return state;
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/unavailable */ }
  }

  function reset() {
    state = seed();
    persist();
  }

  function getState() { return state; }

  function getEmployee(id) {
    return state.employees.filter(function (e) { return e.id === id; })[0];
  }

  function currentUser() { return getEmployee(state.currentUserId); }

  function setCurrentUser(id) {
    var emp = getEmployee(id);
    state.currentUserId = id;
    state.activeRole = emp.roles[0];
    persist();
  }

  function setActiveRole(role) {
    state.activeRole = role;
    persist();
  }

  function getOrder(id) {
    return state.orders.filter(function (o) { return o.id === id; })[0];
  }

  function visibleOrders(user, role) {
    role = role || state.activeRole;
    if (role === 'руководитель' || role === 'контролёр') return state.orders.slice();
    // исполнитель: только свои и как соисполнитель
    return state.orders.filter(function (o) {
      return o.executorId === user.id || (o.coExecutorIds || []).indexOf(user.id) !== -1;
    });
  }

  function addHistory(order, action, detail) {
    order.history.push({ id: uid('h'), date: nowISO(), author: currentUser().name, action: action, detail: detail, comments: [] });
  }

  function addProgress(order, text) {
    order.progressLog.push({ id: uid('p'), date: nowISO(), author: currentUser().name, text: text, comments: [] });
  }

  function addEntryComment(order, kind, entryId, text) {
    if (!text || !text.trim()) return { ok: false, error: 'Введите текст комментария.' };
    var list = kind === 'history' ? order.history : order.progressLog;
    var entry = list.filter(function (x) { return x.id === entryId; })[0];
    if (!entry) return { ok: false, error: 'Запись не найдена.' };
    if (!entry.comments) entry.comments = [];
    entry.comments.push({ id: uid('c'), date: nowISO(), author: currentUser().name, text: text.trim() });
    persist();
    return { ok: true };
  }

  function validateNewOrder(data) {
    var errors = [];
    if (!data.basisType) errors.push('Укажите вид основания.');
    if (!data.summary || !data.summary.trim()) errors.push('Заполните тему поручения.');
    if (data.summary && data.summary.length > 300) errors.push('Тема не должна превышать 300 символов.');
    if (!data.executorId) errors.push('Укажите ответственного исполнителя.');
    if (!data.dueDate) errors.push('Укажите срок.');
    return errors;
  }

  function toIntOrNull(v) {
    if (v === '' || v == null) return null;
    var n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  function createOrder(data) {
    var errors = validateNewOrder(data);
    if (errors.length) return { ok: false, errors: errors };
    var orderDate = data.orderDate || nowISO();
    var year = C.parseISO(orderDate).getFullYear();
    var order = {
      id: uid('ord'), regNumber: regNumberFor(year, state.seqMap), basisType: data.basisType || 'устное указание',
      docNumberDate: data.docNumberDate || '', correspondent: data.correspondent || '',
      resolution: (data.resolution || data.summary).trim(), summary: data.summary.trim(), executorId: data.executorId,
      coExecutorIds: data.coExecutorIds || [], orderDate: orderDate, dueDate: data.dueDate,
      priority: data.priority || 'обычный', recurrence: data.recurrence || 'разовое',
      resultRequirements: data.resultRequirements || '', attachments: data.attachments || [],
      language: data.language || '', duration: data.duration || '',
      speakersCount: toIntOrNull(data.speakersCount), locationsCount: toIntOrNull(data.locationsCount),
      progressLog: [], history: [], status: 'Новое', acceptedDate: null, submittedDates: [],
      qualityScore: null, managerComment: '', returnsCount: 0, onTimeFlag: null, escalated: false,
      extensionRequests: [], removalReason: null, recurringParentId: data.recurringParentId || null,
      registeredBy: currentUser().name, registeredDate: nowISO()
    };
    addHistory(order, 'Регистрация', 'Поручение зарегистрировано');
    state.orders.push(order);
    persist();
    return { ok: true, order: order };
  }

  function acceptIntoWork(order) {
    order.status = 'В работе';
    addHistory(order, 'Принято в работу', 'Исполнитель принял поручение к исполнению');
    persist();
  }

  function submitForReview(order, note, attachments) {
    order.status = 'На проверке';
    order.submittedDates.push(nowISO());
    if (attachments && attachments.length) order.attachments = order.attachments.concat(attachments);
    if (note) addProgress(order, note);
    addHistory(order, 'Сдано на проверку', 'Результат передан руководителю на проверку');
    persist();
  }

  function computeOnTime(order) {
    var submitDate = order.submittedDates[order.submittedDates.length - 1];
    return !!submitDate && C.parseISO(submitDate).getTime() <= C.parseISO(order.dueDate).getTime();
  }

  function acceptOrder(order, score, comment) {
    if (score < 3 && !comment) return { ok: false, error: 'Комментарий обязателен при оценке 3 и ниже.' };
    if (score >= 3) {
      order.status = 'Исполнено';
      order.acceptedDate = nowISO();
      order.qualityScore = score;
      order.managerComment = comment || '';
      order.onTimeFlag = computeOnTime(order);
      addHistory(order, 'Приёмка', 'Принято, оценка ' + score + (order.onTimeFlag ? ' (в срок)' : ' (с нарушением срока)'));
      if (order.recurrence && order.recurrence !== 'разовое') regenerateRecurring(order);
    } else {
      order.status = 'На доработке';
      order.returnsCount += 1;
      order.managerComment = comment;
      addHistory(order, 'Возврат на доработку', 'Оценка ' + score + ', комментарий: ' + comment);
    }
    persist();
    return { ok: true };
  }

  function returnForRework(order, comment) {
    if (!comment) return { ok: false, error: 'Укажите замечания для возврата на доработку.' };
    order.status = 'На доработке';
    order.returnsCount += 1;
    order.managerComment = comment;
    addHistory(order, 'Возврат на доработку', comment);
    persist();
    return { ok: true };
  }

  function regenerateRecurring(order) {
    var nextOrderDate = C.parseISO(order.dueDate);
    var nextDue;
    if (order.recurrence === 'ежемесячное') nextDue = new Date(nextOrderDate.getFullYear(), nextOrderDate.getMonth() + 1, nextOrderDate.getDate());
    else if (order.recurrence === 'ежеквартальное') nextDue = new Date(nextOrderDate.getFullYear(), nextOrderDate.getMonth() + 3, nextOrderDate.getDate());
    else return;
    var next = {
      id: uid('ord'), regNumber: regNumberFor(nextOrderDate.getFullYear(), state.seqMap), basisType: order.basisType,
      docNumberDate: order.docNumberDate, correspondent: order.correspondent, resolution: order.resolution,
      summary: order.summary, executorId: order.executorId, coExecutorIds: order.coExecutorIds.slice(),
      orderDate: C.toISO(nextOrderDate), dueDate: C.toISO(nextDue), priority: order.priority, recurrence: order.recurrence,
      resultRequirements: order.resultRequirements, attachments: [], progressLog: [], history: [],
      status: 'Новое', acceptedDate: null, submittedDates: [], qualityScore: null, managerComment: '',
      returnsCount: 0, onTimeFlag: null, escalated: false, extensionRequests: [], removalReason: null,
      recurringParentId: order.id, registeredBy: 'Система', registeredDate: nowISO()
    };
    addHistory(next, 'Автосоздание', 'Создано автоматически из ' + order.regNumber + ' (периодичность: ' + order.recurrence + ')');
    state.orders.push(next);
  }

  function requestExtension(order, newDate, reason) {
    var today = C.dateOnly(new Date());
    var due = C.parseISO(order.dueDate);
    var daysToDue = C.businessDaysBetween(today, due);
    if (due.getTime() > today.getTime() && daysToDue < 1) {
      return { ok: false, error: 'Продление можно запросить не позднее чем за 1 рабочий день до срока.' };
    }
    var ext = { id: uid('ext'), requestedBy: currentUser().name, requestedDate: nowISO(), newDate: newDate, reason: reason, status: 'ожидает', decidedBy: null, decidedDate: null };
    order.extensionRequests.push(ext);
    addHistory(order, 'Запрос продления', 'Новый срок: ' + C.formatRu(newDate) + ', основание: ' + reason);
    persist();
    return { ok: true };
  }

  function decideExtension(order, extId, approve, comment) {
    var ext = order.extensionRequests.filter(function (e) { return e.id === extId; })[0];
    if (!ext) return { ok: false, error: 'Запрос не найден.' };
    ext.status = approve ? 'одобрено' : 'отклонено';
    ext.decidedBy = currentUser().name;
    ext.decidedDate = nowISO();
    ext.decisionComment = comment || '';
    if (approve) {
      var oldDate = order.dueDate;
      order.dueDate = ext.newDate;
      addHistory(order, 'Продление срока', 'Срок продлён с ' + C.formatRu(oldDate) + ' на ' + C.formatRu(ext.newDate) + ', основание: ' + ext.reason);
    } else {
      addHistory(order, 'Отклонён запрос продления', 'Основание отказа: ' + (comment || 'не указано'));
    }
    persist();
    return { ok: true };
  }

  function removeFromControl(order, reason) {
    if (!reason) return { ok: false, error: 'Укажите основание снятия с контроля.' };
    order.status = 'Снято с контроля';
    order.removalReason = reason;
    addHistory(order, 'Снято с контроля', 'Основание: ' + reason);
    persist();
    return { ok: true };
  }

  function changeDueDate(order, newDate, reason) {
    if (!reason) return { ok: false, error: 'Укажите причину изменения срока.' };
    var oldDate = order.dueDate;
    order.dueDate = newDate;
    addHistory(order, 'Изменение срока', 'Срок изменён с ' + C.formatRu(oldDate) + ' на ' + C.formatRu(newDate) + ', причина: ' + reason);
    persist();
    return { ok: true };
  }

  function finalScore(order) {
    if (order.qualityScore == null) return null;
    var s = order.settings || state.settings;
    var score = order.qualityScore - s.returnPenalty * order.returnsCount - (order.onTimeFlag === false ? s.latePenalty : 0);
    return Math.max(0, Math.round(score * 100) / 100);
  }

  function priorityWeight(order) {
    return state.settings.priorityWeights[order.priority] || 1;
  }

  global.Store = {
    load: load, persist: persist, reset: reset, getState: getState,
    getEmployee: getEmployee, currentUser: currentUser, setCurrentUser: setCurrentUser, setActiveRole: setActiveRole,
    getOrder: getOrder, visibleOrders: visibleOrders,
    addHistory: addHistory, addProgress: addProgress, addEntryComment: addEntryComment,
    createOrder: createOrder, validateNewOrder: validateNewOrder,
    acceptIntoWork: acceptIntoWork, submitForReview: submitForReview, acceptOrder: acceptOrder,
    returnForRework: returnForRework, requestExtension: requestExtension, decideExtension: decideExtension,
    removeFromControl: removeFromControl, changeDueDate: changeDueDate,
    finalScore: finalScore, priorityWeight: priorityWeight, uid: uid, nowISO: nowISO, nowStamp: nowStamp
  };
})(window);
