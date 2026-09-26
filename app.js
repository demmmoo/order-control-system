(function () {
  'use strict';
  var C = window.Calendar;
  var S = window.Store;
  S.load();

  var OPEN_STATUSES_EXCLUDE = { 'Исполнено': true, 'Снято с контроля': true };
  var COLOR_LABEL = { green: 'Зелёный', yellow: 'Жёлтый', red: 'Красный', overdue: 'Просрочено', closed: 'Закрыто', unknown: '—' };
  var STATUS_SLUG = {
    'Новое': 'new', 'В работе': 'progress', 'На проверке': 'review',
    'На доработке': 'draft', 'Исполнено': 'done', 'Снято с контроля': 'removed'
  };
  var sortState = {};

  // ---------------- utils ----------------
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nl2br(str) { return esc(str).replace(/\n/g, '<br>'); }
  function fmtScore(n) { return n == null ? '—' : (Math.round(n * 100) / 100).toString().replace('.', ','); }
  function fmtPct(n) { return n == null ? '—' : (Math.round(n * 10) / 10) + '%'; }
  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; }
  function byId(arr, id) { return arr.filter(function (x) { return x.id === id; })[0]; }

  function employeeName(id) { var e = S.getEmployee(id); return e ? e.name : '—'; }
  function employeeOptions(selectedId, roleFilter) {
    var st = S.getState();
    return st.employees.filter(function (e) {
      return !roleFilter || e.roles.indexOf(roleFilter) !== -1;
    }).map(function (e) {
      return '<option value="' + e.id + '"' + (e.id === selectedId ? ' selected' : '') + '>' + esc(e.name) + '</option>';
    }).join('');
  }

  function isExecutorOf(order, user) {
    return order.executorId === user.id || (order.coExecutorIds || []).indexOf(user.id) !== -1;
  }

  function priorityBadge(p) { return '<span class="badge badge-priority-' + p + '">' + esc(p) + '</span>'; }
  function statusBadge(status) { return '<span class="badge badge-st-' + (STATUS_SLUG[status] || 'new') + '">' + esc(status) + '</span>'; }
  function lightDot(color) { return '<span class="dot-indicator dot-' + color + '"></span>'; }
  function lightBadge(light) {
    var extra = light.color === 'overdue' ? ' (' + light.businessDaysOverdue + ' раб.дн.)' : '';
    if (light.escalated) extra += ' ⚠ эскалация';
    return '<span class="badge badge-' + light.color + '">' + esc(COLOR_LABEL[light.color]) + extra + '</span>';
  }

  function toast(msg, type) {
    var root = qs('#toastRoot');
    var div = document.createElement('div');
    div.className = 'toast' + (type ? ' ' + type : '');
    div.textContent = msg;
    root.appendChild(div);
    setTimeout(function () { div.remove(); }, 4000);
  }

  // ---------------- modal ----------------
  function openModal(titleHtml, bodyHtml) {
    var root = qs('#modalRoot');
    qs('#modalBox').innerHTML = '<button class="modal-close" data-action="closeModal">✕</button><h2>' + titleHtml + '</h2>' + bodyHtml;
    root.classList.remove('hidden');
  }
  function closeModal() { qs('#modalRoot').classList.add('hidden'); qs('#modalBox').innerHTML = ''; }

  // ---------------- attachments (best-effort inline storage) ----------------
  function readAttachments(fileInput) {
    var files = fileInput && fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
    if (!files.length) return Promise.resolve([]);
    var user = S.currentUser();
    var today = S.nowISO();
    return Promise.all(files.map(function (f) {
      return new Promise(function (resolve) {
        if (f.size > 250000) { resolve({ name: f.name, addedBy: user.name, date: today, dataUrl: null }); return; }
        var reader = new FileReader();
        reader.onload = function () { resolve({ name: f.name, addedBy: user.name, date: today, dataUrl: reader.result }); };
        reader.onerror = function () { resolve({ name: f.name, addedBy: user.name, date: today, dataUrl: null }); };
        reader.readAsDataURL(f);
      });
    }));
  }
  function attachmentListHtml(list) {
    if (!list || !list.length) return '<p class="subtitle">Нет вложений.</p>';
    return '<ul class="attach-list">' + list.map(function (a) {
      var link = a.dataUrl ? '<a href="' + a.dataUrl + '" download="' + esc(a.name) + '">Скачать</a>' : '<span class="subtitle">только запись</span>';
      return '<li><span>📎 ' + esc(a.name) + ' <span class="subtitle">(' + esc(a.addedBy) + ', ' + C.formatRu(a.date) + ')</span></span>' + link + '</li>';
    }).join('') + '</ul>';
  }

  // ---------------- KPI / metrics ----------------
  function computeKpi(orders) {
    var accepted = orders.filter(function (o) { return o.status === 'Исполнено'; });
    var onTime = accepted.filter(function (o) { return o.onTimeFlag; }).length;
    var reworked = accepted.filter(function (o) { return o.returnsCount > 0; }).length;
    var durations = accepted.map(function (o) {
      var last = o.submittedDates[o.submittedDates.length - 1];
      if (!last) return null;
      return (C.parseISO(last) - C.parseISO(o.orderDate)) / 86400000;
    }).filter(function (x) { return x != null; });
    return {
      count: accepted.length,
      disciplinePct: accepted.length ? (onTime / accepted.length * 100) : null,
      avgScore: accepted.length ? avg(accepted.map(function (o) { return o.qualityScore; })) : null,
      reworkPct: accepted.length ? (reworked / accepted.length * 100) : null,
      avgDuration: durations.length ? avg(durations) : null,
      extensions: countApprovedExtensions(orders)
    };
  }
  function countApprovedExtensions(orders) {
    var n = 0;
    orders.forEach(function (o) { (o.extensionRequests || []).forEach(function (e) { if (e.status === 'одобрено') n++; }); });
    return n;
  }
  function overdueNowCount(orders) {
    return orders.filter(function (o) {
      return !OPEN_STATUSES_EXCLUDE[o.status] && C.trafficLight(o).color === 'overdue';
    }).length;
  }
  function ratingRow(emp, orders) {
    var mine = orders.filter(function (o) { return o.executorId === emp.id && o.status === 'Исполнено'; });
    var kpi = computeKpi(mine);
    var wsum = 0, wtot = 0;
    mine.forEach(function (o) {
      var w = S.priorityWeight(o), fs = S.finalScore(o);
      if (fs != null) { wsum += fs * w; wtot += w; }
    });
    kpi.rating = wtot ? (wsum / wtot) : null;
    kpi.employee = emp;
    return kpi;
  }

  function inPeriod(dateStr, from, to) {
    if (!dateStr) return false;
    var d = C.parseISO(dateStr).getTime();
    if (from && d < C.parseISO(from).getTime()) return false;
    if (to && d > C.parseISO(to).getTime()) return false;
    return true;
  }

  function periodBounds(preset) {
    var today = new Date();
    var y = today.getFullYear(), m = today.getMonth();
    if (preset === 'quarter') {
      var qm = Math.floor(m / 3) * 3;
      return { from: C.toISO(new Date(y, qm, 1)), to: C.toISO(today) };
    }
    if (preset === 'all') return { from: '', to: '' };
    return { from: C.toISO(new Date(y, m, 1)), to: C.toISO(today) };
  }

  // ---------------- notifications ----------------
  function buildNotifications() {
    var user = S.currentUser(), role = S.getState().activeRole;
    var orders = S.visibleOrders(user, role);
    var items = [];
    orders.forEach(function (o) {
      var light = C.trafficLight(o);
      var mine = isExecutorOf(o, user);
      if (light.color === 'overdue') {
        if (role === 'исполнитель' && mine) items.push({ order: o, urgency: light.escalated ? 0 : 1, title: 'Просрочено: ' + o.regNumber, sub: o.summary + ' — ' + light.businessDaysOverdue + ' раб.дн. просрочки' });
        if (role === 'руководитель' || role === 'контролёр') items.push({ order: o, urgency: light.escalated ? 0 : 1, title: (light.escalated ? '⚠ Эскалация: ' : 'Просрочено: ') + o.regNumber, sub: employeeName(o.executorId) + ' — ' + o.summary });
      } else if (light.color === 'red') {
        if (mine || role !== 'исполнитель') items.push({ order: o, urgency: 2, title: 'Срок сегодня: ' + o.regNumber, sub: o.summary });
      } else if (light.color === 'yellow' && mine && (light.daysAhead === 1 || light.daysAhead === 3)) {
        items.push({ order: o, urgency: 3, title: 'Срок через ' + light.daysAhead + ' раб.дн.: ' + o.regNumber, sub: o.summary });
      }
      if (o.status === 'На проверке' && (role === 'руководитель' || role === 'контролёр')) {
        items.push({ order: o, urgency: 2, title: 'Ожидает проверки: ' + o.regNumber, sub: employeeName(o.executorId) + ' — ' + o.summary });
      }
      (o.extensionRequests || []).forEach(function (ext) {
        if (ext.status === 'ожидает' && role === 'руководитель') {
          items.push({ order: o, urgency: 1, title: 'Запрос продления: ' + o.regNumber, sub: ext.requestedBy + ' просит перенести на ' + C.formatRu(ext.newDate) });
        }
      });
    });
    items.sort(function (a, b) { return a.urgency - b.urgency; });
    return items.slice(0, 25);
  }

  function renderNotifPanel() {
    var items = buildNotifications();
    var panel = qs('#notifPanel');
    qs('#notifDot').classList.toggle('hidden', items.length === 0);
    if (!items.length) { panel.innerHTML = '<div class="notif-empty">Нет уведомлений</div>'; return; }
    panel.innerHTML = items.map(function (it) {
      return '<div class="notif-item" data-action="goOrder" data-id="' + it.order.id + '"><div class="n-title">' + esc(it.title) + '</div><div class="n-sub">' + esc(it.sub) + '</div></div>';
    }).join('');
  }

  // ---------------- header: user/role switch ----------------
  function renderUserButton() {
    var user = S.currentUser(), role = S.getState().activeRole;
    qs('#userBtn').innerHTML = '👤 ' + esc(user.name.split(' ')[0]) + ' <span class="subtitle">(' + esc(role) + ')</span>';
    qs('#navSettings').classList.toggle('hidden', role !== 'руководитель');
  }
  function renderUserPanel() {
    var st = S.getState();
    var html = '<div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Войти как:</div>';
    html += st.employees.map(function (e) {
      var active = e.id === st.currentUserId ? ' style="font-weight:700;"' : '';
      return '<div data-action="switchUser" data-id="' + e.id + '" style="padding:6px 8px;border-radius:7px;cursor:pointer;"' + active + '>' + esc(e.name) + '<div class="subtitle">' + e.roles.join(', ') + '</div></div>';
    }).join('');
    var user = S.currentUser();
    if (user.roles.length > 1) {
      html += '<div class="role-pick">' + user.roles.map(function (r) {
        return '<button data-action="switchRole" data-role="' + r + '" class="' + (r === st.activeRole ? 'active' : '') + '">' + r + '</button>';
      }).join('') + '</div>';
    }
    qs('#userPanel').innerHTML = html;
  }

  // ---------------- router ----------------
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var qIdx = h.indexOf('?');
    var path = qIdx === -1 ? h : h.slice(0, qIdx);
    var query = {};
    if (qIdx !== -1) {
      h.slice(qIdx + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    var parts = path.split('/').filter(Boolean);
    return { name: parts[0] || 'dashboard', param: parts[1], query: query };
  }

  function navigate(hash) { location.hash = hash; }

  function render() {
    renderUserButton();
    renderUserPanel();
    renderNotifPanel();
    var r = parseHash();
    qsa('.main-nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.route === r.name); });
    var app = qs('#app');
    var user = S.currentUser(), role = S.getState().activeRole;
    if (r.name === 'dashboard') return renderDashboard(app, user, role);
    if (r.name === 'registry') return renderRegistry(app, user, role, r.query);
    if (r.name === 'overdue') return renderOverdueReport(app, user, role);
    if (r.name === 'rating') return renderRating(app, user, role);
    if (r.name === 'discipline') return renderDiscipline(app, user, role);
    if (r.name === 'settings') return renderSettings(app, user, role);
    if (r.name === 'order' && r.param === 'new') return renderOrderForm(app, user, role);
    if (r.name === 'order' && r.param) return renderOrderDetail(app, user, role, r.param);
    app.innerHTML = '<div class="empty-state">Страница не найдена.</div>';
  }

  // ================= DASHBOARD =================
  function renderDashboard(app, user, role) {
    var all = S.visibleOrders(user, role);
    var open = all.filter(function (o) { return !OPEN_STATUSES_EXCLUDE[o.status]; });
    var counts = { green: 0, yellow: 0, red: 0, overdue: 0 };
    var lightsById = {};
    open.forEach(function (o) { var l = C.trafficLight(o); lightsById[o.id] = l; if (counts[l.color] != null) counts[l.color]++; });
    var kpi = computeKpi(all);
    var overdueNow = overdueNowCount(all);
    var hot = open.filter(function (o) { return ['yellow', 'red', 'overdue'].indexOf(lightsById[o.id].color) !== -1; })
      .sort(function (a, b) { var order = { overdue: 0, red: 1, yellow: 2 }; return order[lightsById[a.id].color] - order[lightsById[b.id].color]; })
      .slice(0, 10);
    var dueToday = open.filter(function (o) { return lightsById[o.id].color === 'red'; });
    var overdueList = open.filter(function (o) { return lightsById[o.id].color === 'overdue'; }).slice(0, 8);
    var awaitingReview = all.filter(function (o) { return o.status === 'На проверке'; });
    var pendingExt = [];
    all.forEach(function (o) { (o.extensionRequests || []).forEach(function (e) { if (e.status === 'ожидает') pendingExt.push({ order: o, ext: e }); }); });

    var scopeLabel = role === 'исполнитель' ? 'Мои поручения' : 'Поручения отдела';

    app.innerHTML =
      '<div class="page-header"><div><h1>Дашборд</h1><div class="subtitle">' + esc(scopeLabel) + ' · сегодня ' + C.formatRu(new Date()) + '</div></div></div>' +
      '<div class="grid grid-4">' +
        tile('green', counts.green, 'Зелёный (в норме)') +
        tile('yellow', counts.yellow, 'Жёлтый (срок близко)') +
        tile('red', counts.red, 'Красный (срок сегодня)') +
        tile('overdue', counts.overdue, 'Просрочено') +
      '</div>' +
      '<div class="grid grid-4">' +
        kpiTile(fmtPct(kpi.disciplinePct), 'Исполнительская дисциплина') +
        kpiTile(kpi.avgScore != null ? fmtScore(kpi.avgScore) : '—', 'Средняя оценка качества') +
        kpiTile(overdueNow, 'Просрочено сейчас') +
        kpiTile(kpi.avgDuration != null ? Math.round(kpi.avgDuration) + ' дн.' : '—', 'Среднее время исполнения') +
      '</div>' +
      '<div class="card">' +
        '<h3>Сводка на сегодня</h3>' +
        '<div class="grid grid-3">' +
          summaryCol('Срок сегодня (' + dueToday.length + ')', dueToday) +
          summaryCol('Просрочено (' + overdueList.length + ')', overdueList) +
          summaryCol('Ожидают проверки (' + awaitingReview.length + ')', awaitingReview) +
        '</div>' +
      '</div>' +
      (pendingExt.length && role === 'руководитель' ?
        '<div class="card"><h3>Запросы на продление срока (' + pendingExt.length + ')</h3>' +
        pendingExt.map(function (p) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px;">' +
            '<div><b>' + esc(p.order.regNumber) + '</b> — ' + esc(p.order.summary) + '<div class="subtitle">' + esc(p.ext.requestedBy) + ' просит перенести на ' + C.formatRu(p.ext.newDate) + ': ' + esc(p.ext.reason) + '</div></div>' +
            '<div class="btn-row"><button class="btn btn-ok btn-sm" data-action="quickExt" data-order="' + p.order.id + '" data-ext="' + p.ext.id + '" data-decision="1">Одобрить</button>' +
            '<button class="btn btn-danger btn-sm" data-action="quickExt" data-order="' + p.order.id + '" data-ext="' + p.ext.id + '" data-decision="0">Отклонить</button></div></div>';
        }).join('') + '</div>' : '') +
      '<div class="card">' +
        '<div class="page-header" style="margin-bottom:6px;"><h3 style="margin:0;">Горящие поручения</h3><a href="#/registry" class="btn btn-sm">Открыть реестр →</a></div>' +
        (hot.length ? renderMiniTable(hot, lightsById) : '<p class="subtitle">Нет поручений, требующих внимания.</p>') +
      '</div>';
  }
  function tile(color, num, label) {
    return '<button class="stat-tile tile-' + color + '" data-action="goRegistryColor" data-color="' + color + '"><span class="stat-num">' + num + '</span><span class="stat-label">' + esc(label) + '</span></button>';
  }
  function kpiTile(num, label) { return '<div class="kpi-tile"><div class="kpi-num">' + num + '</div><div class="kpi-label">' + esc(label) + '</div></div>'; }
  function summaryCol(title, list) {
    return '<div><h4 style="font-size:13px;">' + esc(title) + '</h4>' + (list.length ?
      '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">' + list.map(function (o) {
        return '<li style="cursor:pointer;font-size:12.5px;" data-action="goOrder" data-id="' + o.id + '"><b>' + esc(o.regNumber) + '</b> ' + esc(o.summary) + '<div class="subtitle">' + esc(employeeName(o.executorId)) + '</div></li>';
      }).join('') + '</ul>' : '<p class="subtitle">Пусто</p>') + '</div>';
  }
  function renderMiniTable(orders, lightsById) {
    return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Рег.№</th><th>Содержание</th><th>Исполнитель</th><th>Срок</th><th>Светофор</th></tr></thead><tbody>' +
      orders.map(function (o) {
        var l = lightsById ? lightsById[o.id] : C.trafficLight(o);
        return '<tr data-action="goOrder" data-id="' + o.id + '"><td class="reg-link">' + esc(o.regNumber) + '</td><td>' + esc(o.summary) + '</td><td>' + esc(employeeName(o.executorId)) + '</td><td>' + C.formatRu(o.dueDate) + '</td><td>' + lightBadge(l) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ================= REGISTRY =================
  function renderRegistry(app, user, role, query) {
    var all = S.visibleOrders(user, role);
    var employees = S.getState().employees;
    var f = {
      status: query.status || '', executor: query.executor || '', basis: query.basis || '',
      color: query.color || '', from: query.from || '', to: query.to || '', q: query.q || ''
    };
    var rows = all.filter(function (o) {
      if (f.status && o.status !== f.status) return false;
      if (f.executor && o.executorId !== f.executor) return false;
      if (f.basis && o.basisType !== f.basis) return false;
      if (f.color && C.trafficLight(o).color !== f.color) return false;
      if ((f.from || f.to) && !inPeriod(o.orderDate, f.from, f.to)) return false;
      if (f.q) {
        var hay = (o.regNumber + ' ' + o.summary + ' ' + o.resolution).toLowerCase();
        if (hay.indexOf(f.q.toLowerCase()) === -1) return false;
      }
      return true;
    });
    rows = applySort(rows, 'registry');

    app.innerHTML =
      '<div class="page-header"><div><h1>Реестр поручений</h1><div class="subtitle">Найдено: ' + rows.length + '</div></div>' +
      '<div class="btn-row"><button class="btn" data-action="exportExcel" data-target="registryTable" data-name="reestr_porucheniy">Экспорт в Excel</button><button class="btn" data-action="printPage">Печать / PDF</button></div></div>' +
      '<div class="filters card">' +
        filterSelect('status', 'Статус', f.status, Object.keys(STATUS_SLUG)) +
        filterSelect('executor', 'Исполнитель', f.executor, employees.filter(function (e) { return e.roles.indexOf('исполнитель') !== -1; }).map(function (e) { return e.id; }), employees) +
        filterSelect('basis', 'Основание', f.basis, ['входящий документ', 'протокол совещания', 'приказ', 'устное указание']) +
        filterSelect('color', 'Светофор', f.color, ['green', 'yellow', 'red', 'overdue'], null, COLOR_LABEL) +
        '<div class="filter-field"><label>С даты</label><input type="date" id="fFrom" value="' + f.from + '"></div>' +
        '<div class="filter-field"><label>По дату</label><input type="date" id="fTo" value="' + f.to + '"></div>' +
        '<div class="filter-field"><label>Поиск</label><input type="text" id="fQ" placeholder="№, содержание..." value="' + esc(f.q) + '"></div>' +
        '<button class="btn btn-primary btn-sm" data-action="applyFilters">Применить</button>' +
        '<button class="btn btn-sm" data-action="clearFilters">Сбросить</button>' +
      '</div>' +
      '<div class="card table-wrap">' +
      (rows.length ? '<table class="data-table" id="registryTable"><thead><tr>' +
        sortTh('registry', 'regNumber', 'Рег.№') + sortTh('registry', 'basisType', 'Основание') +
        '<th>Содержание</th>' + sortTh('registry', 'executor', 'Исполнитель') + sortTh('registry', 'priority', 'Приоритет') +
        sortTh('registry', 'dueDate', 'Срок') + sortTh('registry', 'status', 'Статус') + '<th>Светофор</th><th>Оценка</th>' +
        '</tr></thead><tbody>' + rows.map(registryRowHtml).join('') + '</tbody></table>' :
        '<div class="empty-state">Поручения не найдены по заданным фильтрам.</div>') +
      '</div>';

    qs('#registryTable') && bindSortHeaders('registry', function () { render(); });
  }
  function registryRowHtml(o) {
    var l = C.trafficLight(o);
    return '<tr data-action="goOrder" data-id="' + o.id + '">' +
      '<td class="reg-link">' + esc(o.regNumber) + '</td><td>' + esc(o.basisType) + '</td>' +
      '<td>' + esc(o.summary) + '</td><td>' + esc(employeeName(o.executorId)) + '</td>' +
      '<td>' + priorityBadge(o.priority) + '</td><td>' + C.formatRu(o.dueDate) + '</td>' +
      '<td>' + statusBadge(o.status) + '</td><td>' + lightBadge(l) + '</td>' +
      '<td>' + (o.qualityScore != null ? o.qualityScore : '—') + '</td></tr>';
  }
  function filterSelect(id, label, value, options, employees, labelMap) {
    var opts = '<option value="">Все</option>' + options.map(function (v) {
      var text = employees ? employeeName(v) : (labelMap ? labelMap[v] : v);
      return '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(text) + '</option>';
    }).join('');
    return '<div class="filter-field"><label>' + esc(label) + '</label><select id="f' + id.charAt(0).toUpperCase() + id.slice(1) + '">' + opts + '</select></div>';
  }
  function sortTh(scope, key, label) {
    var s = sortState[scope];
    var cls = s && s.key === key ? ' sorted' : '';
    return '<th class="' + cls + '" data-sort-key="' + key + '">' + esc(label) + '</th>';
  }
  function bindSortHeaders(scope, cb) {
    qsa('th[data-sort-key]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.sortKey;
        var s = sortState[scope] || { key: null, dir: 1 };
        if (s.key === key) s.dir = -s.dir; else { s.key = key; s.dir = 1; }
        sortState[scope] = s;
        cb();
      });
    });
  }
  function applySort(rows, scope) {
    var s = sortState[scope];
    if (!s || !s.key) return rows;
    var key = s.key, dir = s.dir;
    var copy = rows.slice();
    copy.sort(function (a, b) {
      var va = sortVal(a, key), vb = sortVal(b, key);
      if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0;
    });
    return copy;
  }
  function sortVal(o, key) {
    if (key === 'executor') return employeeName(o.executorId);
    if (key === 'dueDate' || key === 'orderDate' || key === 'acceptedDate') return o[key] || '';
    return (o[key] != null ? o[key] : '');
  }

  // ================= OVERDUE REPORT =================
  function renderOverdueReport(app, user, role) {
    var all = S.visibleOrders(user, role);
    var rows = all.filter(function (o) { return !OPEN_STATUSES_EXCLUDE[o.status] && C.trafficLight(o).color === 'overdue'; });
    rows = applySort(rows, 'overdue');
    app.innerHTML =
      '<div class="page-header"><div><h1>Реестр просроченных поручений</h1><div class="subtitle">Для совещания · найдено ' + rows.length + '</div></div>' +
      '<div class="btn-row"><button class="btn" data-action="exportExcel" data-target="overdueTable" data-name="prosrochennye_porucheniya">Экспорт в Excel</button><button class="btn" data-action="printPage">Печать / PDF</button></div></div>' +
      '<div class="card table-wrap">' +
      (rows.length ? '<table class="data-table" id="overdueTable"><thead><tr>' +
        sortTh('overdue', 'regNumber', 'Рег.№') + '<th>Содержание</th>' + sortTh('overdue', 'executor', 'Исполнитель') +
        sortTh('overdue', 'dueDate', 'Срок') + '<th>Просрочка (раб.дн.)</th><th>Эскалация</th><th>Последний комментарий / причина</th>' +
        '</tr></thead><tbody>' + rows.map(function (o) {
          var l = C.trafficLight(o);
          var last = o.progressLog[o.progressLog.length - 1];
          return '<tr data-action="goOrder" data-id="' + o.id + '">' +
            '<td class="reg-link">' + esc(o.regNumber) + '</td><td>' + esc(o.summary) + '</td><td>' + esc(employeeName(o.executorId)) + '</td>' +
            '<td>' + C.formatRu(o.dueDate) + '</td><td>' + l.businessDaysOverdue + '</td>' +
            '<td>' + (l.escalated ? '<span class="badge badge-overdue">Да</span>' : '—') + '</td>' +
            '<td>' + (last ? esc(last.text) : '<span class="subtitle">нет комментариев</span>') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty-state">Просроченных поручений нет.</div>') +
      '</div>';
    qs('#overdueTable') && bindSortHeaders('overdue', function () { render(); });
  }

  // ================= RATING =================
  function renderRating(app, user, role) {
    var query = parseHash().query;
    var preset = query.period || 'month';
    var bounds = periodBounds(preset);
    var all = S.visibleOrders(user, role);

    if (role === 'исполнитель') {
      var mine = ratingRow(user, all.filter(function (o) { return inPeriod(o.acceptedDate, bounds.from, bounds.to) || !o.acceptedDate; }));
      app.innerHTML = '<div class="page-header"><h1>Мой рейтинг</h1></div>' +
        '<div class="card"><div class="grid grid-4">' +
          kpiTile(mine.count, 'Принято поручений') + kpiTile(fmtPct(mine.disciplinePct), 'Дисциплина') +
          kpiTile(mine.avgScore != null ? fmtScore(mine.avgScore) : '—', 'Средняя оценка') +
          kpiTile(mine.rating != null ? fmtScore(mine.rating) : '—', 'Итоговый рейтинг') +
        '</div></div>' +
        '<p class="help-note">Полная таблица рейтинга по отделу доступна руководителю и контролёру.</p>';
      return;
    }

    var executors = S.getState().employees.filter(function (e) { return e.roles.indexOf('исполнитель') !== -1; });
    var periodOrders = all.filter(function (o) { return inPeriod(o.acceptedDate, bounds.from, bounds.to); });
    var rows = executors.map(function (e) { return ratingRow(e, periodOrders); });
    rows = applySortGeneric(rows, 'rating');

    app.innerHTML =
      '<div class="page-header"><div><h1>Рейтинг исполнителей</h1><div class="subtitle">Период: ' + periodLabel(preset, bounds) + '</div></div>' +
      periodPicker('rating', preset) + '</div>' +
      '<div class="card table-wrap"><table class="data-table" id="ratingTable"><thead><tr>' +
        genTh('rating', 'employee', 'Исполнитель') + genTh('rating', 'count', 'Принято') +
        genTh('rating', 'disciplinePct', 'Дисциплина, %') + genTh('rating', 'avgScore', 'Ср. оценка') +
        genTh('rating', 'reworkPct', 'Возвраты, %') + genTh('rating', 'avgDuration', 'Ср. время, дн.') +
        genTh('rating', 'extensions', 'Продлений') + genTh('rating', 'rating', 'Рейтинг') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td>' + esc(r.employee.name) + '</td><td>' + r.count + '</td><td>' + fmtPct(r.disciplinePct) + '</td>' +
          '<td>' + (r.avgScore != null ? fmtScore(r.avgScore) : '—') + '</td><td>' + fmtPct(r.reworkPct) + '</td>' +
          '<td>' + (r.avgDuration != null ? Math.round(r.avgDuration) : '—') + '</td><td>' + r.extensions + '</td>' +
          '<td><b>' + (r.rating != null ? fmtScore(r.rating) : '—') + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
    bindGenericSortHeaders('rating', rows, function () { render(); });
  }

  function periodPicker(scope, preset) {
    return '<div class="filters" style="margin:0;"><div class="filter-field"><label>Период</label><select data-action="periodChange" data-scope="' + scope + '">' +
      ['month', 'quarter', 'all'].map(function (p) {
        return '<option value="' + p + '"' + (p === preset ? ' selected' : '') + '>' + ({ month: 'Текущий месяц', quarter: 'Текущий квартал', all: 'Всё время' })[p] + '</option>';
      }).join('') + '</select></div></div>';
  }
  function periodLabel(preset, bounds) {
    if (preset === 'all') return 'всё время';
    return C.formatRu(bounds.from) + ' — ' + C.formatRu(bounds.to);
  }
  function genTh(scope, key, label) {
    var s = sortState[scope + '_g'];
    var cls = s && s.key === key ? ' sorted' : '';
    return '<th class="' + cls + '" data-gen-sort-key="' + key + '">' + esc(label) + '</th>';
  }
  function applySortGeneric(rows, scope) {
    var s = sortState[scope + '_g'];
    if (!s || !s.key) return rows;
    var copy = rows.slice();
    copy.sort(function (a, b) {
      var va = s.key === 'employee' ? a.employee.name : a[s.key];
      var vb = s.key === 'employee' ? b.employee.name : b[s.key];
      va = va == null ? -Infinity : va; vb = vb == null ? -Infinity : vb;
      if (va < vb) return -1 * s.dir; if (va > vb) return 1 * s.dir; return 0;
    });
    return copy;
  }
  function bindGenericSortHeaders(scope) {
    qsa('th[data-gen-sort-key]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.genSortKey;
        var s = sortState[scope + '_g'] || { key: null, dir: 1 };
        if (s.key === key) s.dir = -s.dir; else { s.key = key; s.dir = 1; }
        sortState[scope + '_g'] = s;
        render();
      });
    });
  }

  // ================= DISCIPLINE REPORT =================
  function renderDiscipline(app, user, role) {
    if (role === 'исполнитель') { app.innerHTML = '<div class="empty-state">Справка доступна руководителю и контролёру.</div>'; return; }
    var query = parseHash().query;
    var preset = query.period || 'month';
    var bounds = periodBounds(preset);
    var all = S.visibleOrders(user, role);
    var periodOrders = all.filter(function (o) { return inPeriod(o.acceptedDate, bounds.from, bounds.to); });
    var kpi = computeKpi(periodOrders);
    var overdueNow = overdueNowCount(all);
    var executors = S.getState().employees.filter(function (e) { return e.roles.indexOf('исполнитель') !== -1; });
    var rows = executors.map(function (e) { return ratingRow(e, periodOrders); });

    var basisTypes = ['входящий документ', 'протокол совещания', 'приказ', 'устное указание'];
    var basisRows = basisTypes.map(function (bt) {
      var subset = periodOrders.filter(function (o) { return o.basisType === bt; });
      return { basis: bt, count: subset.length, disciplinePct: computeKpi(subset).disciplinePct };
    });

    app.innerHTML =
      '<div class="page-header"><div><h1>Справка об исполнительской дисциплине</h1><div class="subtitle">Период: ' + periodLabel(preset, bounds) + '</div></div>' +
      periodPicker('discipline', preset) +
      '<div class="btn-row"><button class="btn" data-action="exportExcel" data-target="disciplineTable" data-name="spravka_distsiplina">Excel</button><button class="btn" data-action="printPage">Печать / PDF</button></div></div>' +
      '<div class="grid grid-4">' +
        kpiTile(kpi.count, 'Исполнено поручений') + kpiTile(fmtPct(kpi.disciplinePct), 'Исполнительская дисциплина') +
        kpiTile(kpi.avgScore != null ? fmtScore(kpi.avgScore) : '—', 'Средняя оценка качества') +
        kpiTile(overdueNow, 'Просрочено сейчас') +
      '</div>' +
      '<div class="grid grid-2">' + kpiTile(fmtPct(kpi.reworkPct), 'Доля возвратов') + kpiTile(kpi.extensions, 'Продлений одобрено') + '</div>' +
      '<div class="card table-wrap"><h3>По исполнителям</h3><table class="data-table" id="disciplineTable"><thead><tr>' +
        '<th>Исполнитель</th><th>Принято</th><th>Дисциплина, %</th><th>Ср. оценка</th><th>Возвраты, %</th><th>Продлений</th>' +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td>' + esc(r.employee.name) + '</td><td>' + r.count + '</td><td>' + fmtPct(r.disciplinePct) + '</td><td>' + (r.avgScore != null ? fmtScore(r.avgScore) : '—') + '</td><td>' + fmtPct(r.reworkPct) + '</td><td>' + r.extensions + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="card table-wrap"><h3>По видам основания</h3><table class="data-table"><thead><tr><th>Вид основания</th><th>Кол-во</th><th>Дисциплина, %</th></tr></thead><tbody>' +
        basisRows.map(function (b) { return '<tr><td>' + esc(b.basis) + '</td><td>' + b.count + '</td><td>' + fmtPct(b.disciplinePct) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  // ================= SETTINGS =================
  function renderSettings(app, user, role) {
    if (role !== 'руководитель') { app.innerHTML = '<div class="empty-state">Настройки доступны только руководителю.</div>'; return; }
    var st = S.getState();
    app.innerHTML =
      '<div class="page-header"><h1>Настройки</h1></div>' +
      '<div class="card"><h3>Коэффициенты расчёта итогового балла</h3>' +
      '<form id="settingsForm" class="form-grid">' +
        '<div class="field"><label>Штраф за один возврат на доработку</label><input type="number" step="0.1" min="0" id="stReturn" value="' + st.settings.returnPenalty + '"></div>' +
        '<div class="field"><label>Штраф за нарушение срока</label><input type="number" step="0.1" min="0" id="stLate" value="' + st.settings.latePenalty + '"></div>' +
        '<div class="field"><label>Вес приоритета «срочный»</label><input type="number" step="0.1" min="0" id="stW1" value="' + st.settings.priorityWeights['срочный'] + '"></div>' +
        '<div class="field"><label>Вес приоритета «высокий»</label><input type="number" step="0.1" min="0" id="stW2" value="' + st.settings.priorityWeights['высокий'] + '"></div>' +
        '<div class="field"><label>Вес приоритета «обычный»</label><input type="number" step="0.1" min="0" id="stW3" value="' + st.settings.priorityWeights['обычный'] + '"></div>' +
        '<div class="field full"><button type="submit" class="btn btn-primary">Сохранить</button></div>' +
      '</form></div>' +
      '<div class="card"><h3>Сотрудники и роли</h3><table class="data-table"><thead><tr><th>Сотрудник</th><th>Должность</th><th>Роли</th></tr></thead><tbody>' +
        st.employees.map(function (e) { return '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.position) + '</td><td>' + e.roles.join(', ') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<div class="card"><h3>Демо-данные</h3><p class="subtitle">Сбросить все поручения и настройки к исходному демонстрационному набору.</p>' +
      '<button class="btn btn-danger" data-action="resetDemo">Сбросить демо-данные</button></div>' +
      '<div class="card"><h3>О системе</h3><p class="subtitle">Каналы уведомлений в приложении реализованы (колокольчик наверху). Отправка e-mail и Telegram-бот — этапы 2–3 по ТЗ, требуют backend-интеграции и здесь не подключены. Производственный календарь РК задан статическим списком праздников (2025–2027) в calendar.js.</p></div>';

    qs('#settingsForm').addEventListener('submit', function (e) {
      e.preventDefault();
      st.settings.returnPenalty = parseFloat(qs('#stReturn').value) || 0;
      st.settings.latePenalty = parseFloat(qs('#stLate').value) || 0;
      st.settings.priorityWeights['срочный'] = parseFloat(qs('#stW1').value) || 1;
      st.settings.priorityWeights['высокий'] = parseFloat(qs('#stW2').value) || 1;
      st.settings.priorityWeights['обычный'] = parseFloat(qs('#stW3').value) || 1;
      S.persist();
      toast('Настройки сохранены', 'success');
    });
  }

  // ================= ORDER FORM (create) =================
  function renderOrderForm(app, user, role) {
    if (role === 'исполнитель') { app.innerHTML = '<div class="empty-state">Регистрировать поручения могут руководитель и контролёр.</div>'; return; }
    app.innerHTML =
      '<div class="page-header"><h1>Новое поручение</h1></div>' +
      '<div class="card"><div id="formErrors"></div>' +
      '<form id="orderForm" class="form-grid">' +
        '<div class="field full"><label>Тема <span class="req">*</span> <span class="hint" id="summaryCount">0/300</span></label><textarea id="fSummary" maxlength="300"></textarea></div>' +
        '<div class="field"><label>Вид основания <span class="req">*</span></label><select id="fBasisType">' +
          ['входящий документ', 'протокол совещания', 'приказ', 'устное указание'].map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>Язык</label><input type="text" id="fLanguage" placeholder="напр. русский / казахский"></div>' +
        '<div class="field"><label>Хронометраж</label><input type="text" id="fDuration" placeholder="напр. 15 мин или 00:12:30"></div>' +
        '<div class="field"><label>Количество спикеров</label><input type="number" min="0" id="fSpeakers"></div>' +
        '<div class="field"><label>Количество локаций</label><input type="number" min="0" id="fLocations"></div>' +
        '<div class="field"><label>Ответственный исполнитель <span class="req">*</span></label><select id="fExecutor"><option value="">— выбрать —</option>' + employeeOptions(null, 'исполнитель') + '</select></div>' +
        '<div class="field"><label>Срок <span class="req">*</span></label><input type="date" id="fDueDate"><div id="weekendWarn" class="hint"></div></div>' +
        '<div class="field full"><button type="submit" class="btn btn-primary">Зарегистрировать поручение</button> <a href="#/registry" class="btn btn-ghost">Отмена</a></div>' +
      '</form></div>';

    var summaryEl = qs('#fSummary');
    summaryEl.addEventListener('input', function () { qs('#summaryCount').textContent = summaryEl.value.length + '/300'; });
    var dueEl = qs('#fDueDate');
    dueEl.addEventListener('change', function () {
      if (!dueEl.value) return;
      var d = C.parseISO(dueEl.value);
      if (!C.isBusinessDay(d)) {
        var prev = C.previousBusinessDay(d);
        qs('#weekendWarn').innerHTML = '⚠ Срок выпадает на выходной/праздник. <button type="button" class="btn btn-sm" data-action="useDate" data-date="' + C.toISO(prev) + '">Использовать ' + C.formatRu(prev) + '</button>';
      } else {
        qs('#weekendWarn').innerHTML = '';
      }
    });

    qs('#orderForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var res = S.createOrder({
        summary: qs('#fSummary').value, basisType: qs('#fBasisType').value,
        language: qs('#fLanguage').value.trim(), duration: qs('#fDuration').value.trim(),
        speakersCount: qs('#fSpeakers').value, locationsCount: qs('#fLocations').value,
        executorId: qs('#fExecutor').value, dueDate: qs('#fDueDate').value
      });
      if (!res.ok) {
        qs('#formErrors').innerHTML = '<div class="form-errors"><b>Поручение не сохранено:</b><ul>' + res.errors.map(function (er) { return '<li>' + esc(er) + '</li>'; }).join('') + '</ul></div>';
        return;
      }
      toast('Поручение ' + res.order.regNumber + ' зарегистрировано', 'success');
      navigate('#/order/' + res.order.id);
    });
  }

  // ================= ORDER DETAIL =================
  var orderTab = {};
  var openReplyEntry = null;
  function renderOrderDetail(app, user, role, id) {
    var o = S.getOrder(id);
    if (!o) { app.innerHTML = '<div class="empty-state">Поручение не найдено.</div>'; return; }
    var mine = isExecutorOf(o, user);
    var light = C.trafficLight(o);
    var finalScore = S.finalScore(o);
    var tab = orderTab[id] || 'progress';

    var canAccept = mine && role === 'исполнитель' && o.status === 'Новое';
    var canSubmit = mine && role === 'исполнитель' && (o.status === 'В работе' || o.status === 'На доработке');
    var canRequestExt = mine && role === 'исполнитель' && (o.status === 'В работе' || o.status === 'На доработке');
    var canScore = role === 'руководитель' && o.status === 'На проверке';
    var canRemove = role === 'руководитель' && !OPEN_STATUSES_EXCLUDE[o.status];
    var canChangeDue = role === 'руководитель' && !OPEN_STATUSES_EXCLUDE[o.status];
    var canAddProgress = (role === 'руководитель' || role === 'контролёр' || mine);
    var pendingExt = o.extensionRequests.filter(function (e) { return e.status === 'ожидает'; });

    app.innerHTML =
      '<div class="page-header"><div>' +
        '<div class="order-reg">' + esc(o.regNumber) + '</div>' +
        '<h1 class="order-title">' + esc(o.summary) + '</h1>' +
        '<div class="btn-row" style="margin-top:6px;">' + statusBadge(o.status) + lightBadge(light) + (finalScore != null ? '<span class="badge badge-status">Итоговый балл: ' + fmtScore(finalScore) + '</span>' : '') + '</div>' +
      '</div><a href="#/registry" class="btn">← К реестру</a></div>' +

      '<div class="card"><dl class="kv-grid">' +
        '<dt>Вид основания</dt><dd>' + esc(o.basisType) + '</dd>' +
        '<dt>Ответственный исполнитель</dt><dd>' + esc(employeeName(o.executorId)) + '</dd>' +
        '<dt>Язык</dt><dd>' + esc(o.language || '—') + '</dd>' +
        '<dt>Хронометраж</dt><dd>' + esc(o.duration || '—') + '</dd>' +
        '<dt>Количество спикеров</dt><dd>' + (o.speakersCount != null ? o.speakersCount : '—') + '</dd>' +
        '<dt>Количество локаций</dt><dd>' + (o.locationsCount != null ? o.locationsCount : '—') + '</dd>' +
        '<dt>Дата поручения</dt><dd>' + C.formatRu(o.orderDate) + '</dd>' +
        '<dt>Срок</dt><dd>' + C.formatRu(o.dueDate) + '</dd>' +
        '<dt>Зарегистрировал</dt><dd>' + esc(o.registeredBy) + ', ' + C.formatRu(o.registeredDate) + '</dd>' +
        (o.status === 'Исполнено' ? '<dt>Приёмка</dt><dd>' + C.formatRu(o.acceptedDate) + ', оценка ' + o.qualityScore + (o.managerComment ? ' — «' + esc(o.managerComment) + '»' : '') + '</dd>' : '') +
        (o.status === 'Снято с контроля' ? '<dt>Основание снятия</dt><dd>' + esc(o.removalReason) + '</dd>' : '') +
      '</dl></div>' +

      '<div class="card"><h3>Вложения</h3>' + attachmentListHtml(o.attachments) + '</div>' +

      '<div class="card">' +
        '<div class="btn-row">' +
          (canAccept ? '<button class="btn btn-primary" data-action="acceptIntoWork" data-id="' + o.id + '">Принять в работу</button>' : '') +
          (canSubmit ? '<button class="btn btn-primary" data-action="openSubmitModal" data-id="' + o.id + '">Сдать на проверку</button>' : '') +
          (canRequestExt ? '<button class="btn" data-action="openExtModal" data-id="' + o.id + '">Запросить продление</button>' : '') +
          (canScore ? '<button class="btn btn-ok" data-action="openScoreModal" data-id="' + o.id + '">Принять и оценить</button>' : '') +
          (canScore ? '<button class="btn btn-danger" data-action="openReworkModal" data-id="' + o.id + '">Вернуть на доработку</button>' : '') +
          (canChangeDue ? '<button class="btn" data-action="openDueDateModal" data-id="' + o.id + '">Изменить срок</button>' : '') +
          (canRemove ? '<button class="btn btn-danger" data-action="openRemoveModal" data-id="' + o.id + '">Снять с контроля</button>' : '') +
        '</div>' +
        (!canAccept && !canSubmit && !canScore && !canRemove && !canChangeDue && !canRequestExt ? '<p class="subtitle">Нет доступных действий для вашей роли на текущем статусе.</p>' : '') +
      '</div>' +

      '<div class="card">' +
        '<div class="tabs">' +
          '<button class="' + (tab === 'progress' ? 'active' : '') + '" data-action="setTab" data-tab="progress" data-id="' + o.id + '">Ход исполнения</button>' +
          '<button class="' + (tab === 'history' ? 'active' : '') + '" data-action="setTab" data-tab="history" data-id="' + o.id + '">История изменений</button>' +
          '<button class="' + (tab === 'ext' ? 'active' : '') + '" data-action="setTab" data-tab="ext" data-id="' + o.id + '">Продления' + (pendingExt.length ? ' (' + pendingExt.length + ')' : '') + '</button>' +
        '</div>' +
        (tab === 'progress' ? renderProgressTab(o, canAddProgress) : tab === 'history' ? renderHistoryTab(o, canAddProgress) : renderExtTab(o, role)) +
      '</div>';

    if (tab === 'progress' && canAddProgress) {
      qs('#progressForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var input = qs('#progressInput');
        if (!input.value.trim()) return;
        S.addProgress(o, input.value.trim());
        S.persist();
        render();
      });
    }
    if ((tab === 'progress' || tab === 'history') && canAddProgress) {
      qsa('.entry-reply-form').forEach(function (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = form.querySelector('.entry-reply-input');
          var res = S.addEntryComment(o, form.dataset.kind, form.dataset.entry, input.value);
          if (!res.ok) { toast(res.error, 'error'); return; }
          openReplyEntry = null;
          render();
        });
      });
    }
  }

  function renderEntryComments(entry, orderId, kind, canAdd) {
    var comments = entry.comments || [];
    var html = comments.length ? '<ul class="entry-comments">' + comments.map(function (c) {
      return '<li><div class="t-date">' + C.formatRu(c.date) + '</div><div class="t-author">' + esc(c.author) + '</div><div class="t-text">' + esc(c.text) + '</div></li>';
    }).join('') + '</ul>' : '';
    if (!canAdd) return html;
    var isOpen = openReplyEntry === entry.id;
    html += '<button type="button" class="btn btn-ghost btn-sm" data-action="toggleComment" data-entry="' + entry.id + '">' + (comments.length ? '💬 Комментарии (' + comments.length + ')' : '💬 Комментировать') + '</button>';
    if (isOpen) {
      html += '<form class="progress-form entry-reply-form" data-order="' + orderId + '" data-kind="' + kind + '" data-entry="' + entry.id + '">' +
        '<input type="text" class="entry-reply-input" placeholder="Комментарий к записи..."><button class="btn btn-primary btn-sm" type="submit">Отправить</button></form>';
    }
    return html;
  }
  function renderProgressTab(o, canAdd) {
    var html = o.progressLog.length ? '<ul class="timeline">' + o.progressLog.slice().reverse().map(function (p) {
      return '<li><div class="t-date">' + C.formatRu(p.date) + '</div><div class="t-author">' + esc(p.author) + '</div><div class="t-text">' + esc(p.text) + '</div>' + renderEntryComments(p, o.id, 'progress', canAdd) + '</li>';
    }).join('') + '</ul>' : '<p class="subtitle">Записей пока нет.</p>';
    if (canAdd) html += '<form id="progressForm" class="progress-form"><input type="text" id="progressInput" placeholder="Добавить запись о ходе исполнения..."><button class="btn btn-primary" type="submit">Добавить</button></form>';
    return html;
  }
  function renderHistoryTab(o, canAdd) {
    if (!o.history.length) return '<p class="subtitle">История пуста.</p>';
    return '<ul class="timeline">' + o.history.slice().reverse().map(function (h) {
      return '<li><div class="t-date">' + C.formatRu(h.date) + '</div><div class="t-author">' + esc(h.author) + ' — ' + esc(h.action) + '</div><div class="t-text">' + esc(h.detail) + '</div>' + renderEntryComments(h, o.id, 'history', canAdd) + '</li>';
    }).join('') + '</ul>';
  }
  function renderExtTab(o, role) {
    if (!o.extensionRequests.length) return '<p class="subtitle">Запросов на продление не было.</p>';
    return '<ul class="timeline">' + o.extensionRequests.slice().reverse().map(function (e) {
      var actions = (role === 'руководитель' && e.status === 'ожидает') ?
        '<div class="btn-row"><button class="btn btn-ok btn-sm" data-action="decideExt" data-order="' + o.id + '" data-ext="' + e.id + '" data-decision="1">Одобрить</button><button class="btn btn-danger btn-sm" data-action="decideExt" data-order="' + o.id + '" data-ext="' + e.id + '" data-decision="0">Отклонить</button></div>' : '';
      var statusCls = e.status === 'одобрено' ? 'badge-green' : e.status === 'отклонено' ? 'badge-red' : 'badge-yellow';
      return '<li><div class="t-date">' + C.formatRu(e.requestedDate) + '</div><div class="t-author">' + esc(e.requestedBy) + ' <span class="badge ' + statusCls + '">' + esc(e.status) + '</span></div>' +
        '<div class="t-text">Новый срок: ' + C.formatRu(e.newDate) + '. Основание: ' + esc(e.reason) + (e.decidedBy ? '<br><span class="subtitle">Решение: ' + esc(e.decidedBy) + ', ' + C.formatRu(e.decidedDate) + '</span>' : '') + '</div>' + actions + '</li>';
    }).join('') + '</ul>';
  }

  // ================= global click/action delegation =================
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (!t) {
      if (!e.target.closest('#notifPanel') && !e.target.closest('#notifBtn')) qs('#notifPanel').classList.add('hidden');
      if (!e.target.closest('#userPanel') && !e.target.closest('#userBtn')) qs('#userPanel').classList.add('hidden');
      return;
    }
    var action = t.dataset.action;
    switch (action) {
      case 'closeModal': closeModal(); break;
      case 'goOrder': navigate('#/order/' + t.dataset.id); break;
      case 'goRegistryColor': navigate('#/registry?color=' + t.dataset.color); break;
      case 'switchUser': S.setCurrentUser(t.dataset.id); toast('Вход выполнен: ' + S.currentUser().name); render(); break;
      case 'switchRole': S.setActiveRole(t.dataset.role); render(); break;
      case 'setTab': orderTab[t.dataset.id] = t.dataset.tab; render(); break;
      case 'toggleComment': openReplyEntry = (openReplyEntry === t.dataset.entry) ? null : t.dataset.entry; render(); break;
      case 'resetDemo':
        if (confirm('Сбросить все данные к демонстрационному набору? Изменения будут потеряны.')) { S.reset(); toast('Демо-данные восстановлены', 'success'); navigate('#/dashboard'); render(); }
        break;
      case 'useDate': qs('#fDueDate').value = t.dataset.date; qs('#weekendWarn').innerHTML = ''; break;
      case 'acceptIntoWork': {
        var o1 = S.getOrder(t.dataset.id); S.acceptIntoWork(o1); toast('Поручение принято в работу', 'success'); render(); break;
      }
      case 'openSubmitModal': openSubmitModal(t.dataset.id); break;
      case 'openExtModal': openExtModal(t.dataset.id); break;
      case 'openScoreModal': openScoreModal(t.dataset.id); break;
      case 'openReworkModal': openReworkModal(t.dataset.id); break;
      case 'openDueDateModal': openDueDateModal(t.dataset.id); break;
      case 'openRemoveModal': openRemoveModal(t.dataset.id); break;
      case 'decideExt': {
        var oe = S.getOrder(t.dataset.order);
        var res = S.decideExtension(oe, t.dataset.ext, t.dataset.decision === '1');
        if (!res.ok) toast(res.error, 'error'); else toast('Решение по продлению сохранено', 'success');
        render(); break;
      }
      case 'quickExt': {
        var oq = S.getOrder(t.dataset.order);
        var resq = S.decideExtension(oq, t.dataset.ext, t.dataset.decision === '1');
        if (!resq.ok) toast(resq.error, 'error'); else toast('Решение по продлению сохранено', 'success');
        render(); break;
      }
      case 'applyFilters': applyRegistryFilters(); break;
      case 'clearFilters': navigate('#/registry'); render(); break;
      case 'periodChange': break; // handled on change event below
      case 'exportExcel': exportTableToExcel(t.dataset.target, t.dataset.name); break;
      case 'printPage': window.print(); break;
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.dataset && e.target.dataset.action === 'periodChange') {
      var scope = e.target.dataset.scope;
      navigate('#/' + scope + '?period=' + e.target.value);
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target.id === 'notifBtn') { qs('#notifPanel').classList.toggle('hidden'); qs('#userPanel').classList.add('hidden'); }
    if (e.target.id === 'userBtn') { qs('#userPanel').classList.toggle('hidden'); qs('#notifPanel').classList.add('hidden'); }
    if (e.target.id === 'navToggle') qs('#mainNav').classList.toggle('open');
    if (e.target.closest('#mainNav a')) qs('#mainNav').classList.remove('open');
    if (e.target.id === 'newOrderBtn') navigate('#/order/new');
    if (e.target.id === 'modalBackdrop') closeModal();
  });

  qs('#modalRoot') && document.body.addEventListener('click', function (e) {
    if (e.target.closest('#modalBackdrop')) closeModal();
  });

  function applyRegistryFilters() {
    var params = {
      status: qs('#fStatus').value, executor: qs('#fExecutor').value, basis: qs('#fBasis').value,
      color: qs('#fColor').value, from: qs('#fFrom').value, to: qs('#fTo').value, q: qs('#fQ').value
    };
    var qstr = Object.keys(params).filter(function (k) { return params[k]; }).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    navigate('#/registry' + (qstr ? '?' + qstr : ''));
    render();
  }

  // ---------- action modals ----------
  function openSubmitModal(id) {
    openModal('Сдать на проверку', '<form id="mForm">' +
      '<div class="field"><label>Комментарий к результату</label><textarea id="mNote" placeholder="Что сделано..."></textarea></div>' +
      '<div class="field"><label>Файл результата</label><input type="file" id="mFiles" multiple></div>' +
      '<div class="btn-row"><button type="submit" class="btn btn-primary">Отправить на проверку</button></div></form>');
    qs('#mForm').addEventListener('submit', function (e) {
      e.preventDefault();
      readAttachments(qs('#mFiles')).then(function (files) {
        var o = S.getOrder(id);
        S.submitForReview(o, qs('#mNote').value.trim(), files);
        closeModal(); toast('Отправлено на проверку', 'success'); render();
      });
    });
  }
  function openExtModal(id) {
    var o = S.getOrder(id);
    openModal('Запрос продления срока', '<form id="mForm">' +
      '<div class="field"><label>Текущий срок</label><input type="text" value="' + C.formatRu(o.dueDate) + '" disabled></div>' +
      '<div class="field"><label>Новый срок <span class="req">*</span></label><input type="date" id="mNewDate" required></div>' +
      '<div class="field"><label>Обоснование <span class="req">*</span></label><textarea id="mReason" required></textarea></div>' +
      '<div class="btn-row"><button type="submit" class="btn btn-primary">Отправить запрос</button></div></form>');
    qs('#mForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var res = S.requestExtension(o, qs('#mNewDate').value, qs('#mReason').value.trim());
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); toast('Запрос на продление отправлен', 'success'); render();
    });
  }
  function openScoreModal(id) {
    openModal('Приёмка и оценка качества', '<form id="mForm">' +
      '<div class="field"><label>Оценка (1–5) <span class="req">*</span></label><select id="mScore">' +
        [5, 4, 3, 2, 1].map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Комментарий руководителя <span class="hint">(обязателен при оценке 3 и ниже)</span></label><textarea id="mComment"></textarea></div>' +
      '<div class="help-note">Оценка ниже 3 автоматически вернёт поручение на доработку.</div>' +
      '<div class="btn-row"><button type="submit" class="btn btn-ok">Сохранить</button></div></form>');
    qs('#mForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var o = S.getOrder(id);
      var score = parseInt(qs('#mScore').value, 10);
      var res = S.acceptOrder(o, score, qs('#mComment').value.trim());
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); toast(score >= 3 ? 'Поручение принято, оценка ' + score : 'Поручение возвращено на доработку', 'success'); render();
    });
  }
  function openReworkModal(id) {
    openModal('Вернуть на доработку', '<form id="mForm">' +
      '<div class="field"><label>Замечания <span class="req">*</span></label><textarea id="mComment" required></textarea></div>' +
      '<div class="btn-row"><button type="submit" class="btn btn-danger">Вернуть на доработку</button></div></form>');
    qs('#mForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var o = S.getOrder(id);
      var res = S.returnForRework(o, qs('#mComment').value.trim());
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); toast('Возвращено на доработку', 'success'); render();
    });
  }
  function openDueDateModal(id) {
    var o = S.getOrder(id);
    openModal('Изменить контрольный срок', '<form id="mForm">' +
      '<div class="field"><label>Текущий срок</label><input type="text" value="' + C.formatRu(o.dueDate) + '" disabled></div>' +
      '<div class="field"><label>Новый срок <span class="req">*</span></label><input type="date" id="mNewDate" value="' + o.dueDate + '" required></div>' +
      '<div class="field"><label>Причина <span class="req">*</span></label><textarea id="mReason" required></textarea></div>' +
      '<div class="btn-row"><button type="submit" class="btn btn-primary">Сохранить</button></div></form>');
    qs('#mForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var res = S.changeDueDate(o, qs('#mNewDate').value, qs('#mReason').value.trim());
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); toast('Срок изменён', 'success'); render();
    });
  }
  function openRemoveModal(id) {
    openModal('Снять с контроля', '<form id="mForm">' +
      '<div class="field"><label>Основание снятия <span class="req">*</span></label><textarea id="mReason" required></textarea></div>' +
      '<div class="help-note">Удаление поручений запрещено — только снятие с контроля с указанием основания.</div>' +
      '<div class="btn-row"><button type="submit" class="btn btn-danger">Снять с контроля</button></div></form>');
    qs('#mForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var o = S.getOrder(id);
      var res = S.removeFromControl(o, qs('#mReason').value.trim());
      if (!res.ok) { toast(res.error, 'error'); return; }
      closeModal(); toast('Поручение снято с контроля', 'success'); render();
    });
  }

  // ---------- Excel export ----------
  function exportTableToExcel(tableId, filename) {
    var table = qs('#' + tableId);
    if (!table) { toast('Нет данных для экспорта', 'error'); return; }
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"></head><body>' + table.outerHTML + '</body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename + '.xls';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Файл ' + filename + '.xls сохранён', 'success');
  }

  // ---------- boot ----------
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', function () {
    if (!location.hash) location.hash = '#/dashboard';
    render();
  });
  if (document.readyState !== 'loading') {
    if (!location.hash) location.hash = '#/dashboard';
    render();
  }
})();
