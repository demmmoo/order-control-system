/* Производственный календарь РК (упрощённо, для целей MVP) и работа с рабочими днями.
   На этапе 3 по ТЗ (п.8) предполагается интеграция с официальным производственным
   календарём РК — здесь список праздников задан статически и может быть
   отредактирован в HOLIDAYS ниже. */
(function (global) {
  'use strict';

  // Праздничные/выходные дни РК (гос. праздники), формат 'YYYY-MM-DD'.
  // Заполнено на 2025-2027 гг. для корректных расчётов около границ года.
  var HOLIDAYS = [
    // 2025
    '2025-01-01', '2025-01-02', '2025-01-07', '2025-03-08',
    '2025-03-21', '2025-03-22', '2025-03-23', '2025-03-24',
    '2025-05-01', '2025-05-07', '2025-05-09', '2025-07-06',
    '2025-08-30', '2025-10-25', '2025-12-16', '2025-12-17',
    // 2026
    '2026-01-01', '2026-01-02', '2026-01-07', '2026-03-08',
    '2026-03-09', '2026-03-21', '2026-03-22', '2026-03-23',
    '2026-05-01', '2026-05-07', '2026-05-08', '2026-05-09',
    '2026-07-06', '2026-08-30', '2026-08-31', '2026-10-25',
    '2026-10-26', '2026-12-16', '2026-12-17',
    // 2027
    '2027-01-01', '2027-01-02', '2027-01-07', '2027-03-08',
    '2027-03-21', '2027-03-22', '2027-03-23', '2027-05-01',
    '2027-05-07', '2027-05-09', '2027-05-10', '2027-07-06',
    '2027-08-30', '2027-10-25', '2027-12-16', '2027-12-17'
  ];
  var holidaySet = HOLIDAYS.reduce(function (acc, d) { acc[d] = true; return acc; }, {});

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toISO(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseISO(str) {
    if (!str) return null;
    var parts = str.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function dateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isWeekend(date) {
    var d = date.getDay();
    return d === 0 || d === 6;
  }

  function isHoliday(date) {
    return !!holidaySet[toISO(date)];
  }

  function isBusinessDay(date) {
    return !isWeekend(date) && !isHoliday(date);
  }

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function previousBusinessDay(date) {
    var d = dateOnly(date);
    while (!isBusinessDay(d)) d = addDays(d, -1);
    return d;
  }

  function nextBusinessDay(date) {
    var d = dateOnly(date);
    while (!isBusinessDay(d)) d = addDays(d, 1);
    return d;
  }

  // Число рабочих дней строго между двумя датами (exclusive-start, inclusive-end),
  // предполагается from <= to по датам без времени.
  function businessDaysBetween(fromExclusive, toInclusive) {
    var from = dateOnly(fromExclusive);
    var to = dateOnly(toInclusive);
    if (to.getTime() <= from.getTime()) return 0;
    var count = 0;
    var d = addDays(from, 1);
    var guard = 0;
    while (d.getTime() <= to.getTime() && guard < 5000) {
      if (isBusinessDay(d)) count++;
      d = addDays(d, 1);
      guard++;
    }
    return count;
  }

  function addBusinessDays(date, n) {
    var d = dateOnly(date);
    var count = 0;
    var guard = 0;
    while (count < n && guard < 5000) {
      d = addDays(d, 1);
      if (isBusinessDay(d)) count++;
      guard++;
    }
    return d;
  }

  function formatRu(dateOrStr) {
    var d = typeof dateOrStr === 'string' ? parseISO(dateOrStr) : dateOrStr;
    if (!d) return '';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  // Светофор поручения. order.dueDate, order.status; today опционален.
  function trafficLight(order, today) {
    var closedStatuses = { 'Исполнено': true, 'Снято с контроля': true };
    if (closedStatuses[order.status]) return { color: 'closed' };
    var now = dateOnly(today || new Date());
    var due = parseISO(order.dueDate);
    if (!due) return { color: 'unknown' };
    if (due.getTime() < now.getTime()) {
      var overdueDays = businessDaysBetween(due, now);
      return { color: 'overdue', businessDaysOverdue: overdueDays, escalated: overdueDays >= 3 };
    }
    if (due.getTime() === now.getTime()) {
      return { color: 'red', daysAhead: 0 };
    }
    var ahead = businessDaysBetween(now, due);
    if (ahead <= 3) return { color: 'yellow', daysAhead: ahead };
    return { color: 'green', daysAhead: ahead };
  }

  global.Calendar = {
    toISO: toISO,
    parseISO: parseISO,
    dateOnly: dateOnly,
    isWeekend: isWeekend,
    isHoliday: isHoliday,
    isBusinessDay: isBusinessDay,
    addDays: addDays,
    previousBusinessDay: previousBusinessDay,
    nextBusinessDay: nextBusinessDay,
    businessDaysBetween: businessDaysBetween,
    addBusinessDays: addBusinessDays,
    formatRu: formatRu,
    trafficLight: trafficLight
  };
})(window);
