/* 课程表 App 主逻辑 */
(function () {
  'use strict';
  var P = window.TTParsers;
  var KEY = 'timetable.v1';
  var DAYS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var PALETTE = ['#4f6bed', '#e8615a', '#2bb673', '#f2a33a', '#9b59d0', '#17a2b8', '#e05297', '#7a8b2b', '#d9822b', '#3f8fd8', '#b0533f', '#5a6fd6', '#16a085', '#c0392b', '#8e6c3a'];
  var DEFAULT_TIMES = [['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'], ['14:00', '14:45'], ['14:55', '15:40'], ['16:00', '16:45'], ['16:55', '17:40'], ['19:00', '19:45'], ['19:55', '20:40'], ['20:50', '21:35'], ['21:45', '22:30']];

  function defaultStart() {
    var d = new Date(), y = d.getFullYear(), mth = d.getMonth();
    // 粗略：8-1 月为秋季学期，开学约 9 月第一周；2-7 月为春季学期，约 2 月下旬
    var s = mth >= 7 ? new Date(y, 8, 1) : mth === 0 ? new Date(y - 1, 8, 1) : new Date(y, 1, 24);
    return fmtDate(P.mondayOf(fmtDate(s)));
  }
  function fmtDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  var state = load();
  var viewWeek = clampWeek(currentWeek());

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    s = s || {};
    s.courses = Array.isArray(s.courses) ? s.courses : [];
    s.settings = Object.assign({
      name: '我的课表', startDate: defaultStart(), totalWeeks: 20, sectionCount: 12,
      showWeekend: true, showInactive: true, timezone: 'Asia/Shanghai'
    }, s.settings || {});
    var st = s.settings;
    if (!Array.isArray(st.sectionTimes)) st.sectionTimes = DEFAULT_TIMES.map(function (t) { return { start: t[0], end: t[1] }; });
    while (st.sectionTimes.length < st.sectionCount) {
      var last = st.sectionTimes[st.sectionTimes.length - 1] || { end: '07:15' };
      var a = addMin(last.end, 10); st.sectionTimes.push({ start: a, end: addMin(a, 45) });
    }
    return s;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function addMin(hm, n) { var p = hm.split(':').map(Number), t = p[0] * 60 + p[1] + n; t = ((t % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function currentWeek() { return P.weekNumber(state.settings.startDate); }
  function clampWeek(w) { return Math.max(1, Math.min(state.settings.totalWeeks, w)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, ms || 2200); }

  function colorFor(name) {
    var used = {};
    state.courses.forEach(function (c) { if (c.name === name && c.color) used.c = c.color; });
    if (used.c) return used.c;
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    var taken = {}; state.courses.forEach(function (c) { taken[c.color] = 1; });
    for (var k = 0; k < PALETTE.length; k++) { var col = PALETTE[(h + k) % PALETTE.length]; if (!taken[col]) return col; }
    return PALETTE[h % PALETTE.length];
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var st = state.settings, cw = currentWeek();
    var wl = $('weekLabel');
    wl.textContent = '第 ' + viewWeek + ' 周' + (viewWeek === cw ? '' : '');
    wl.classList.toggle('not-current', viewWeek !== cw);
    var sub = cw < 1 ? '尚未开学（距开学 ' + (1 - cw) * 7 + ' 天内）' : cw > st.totalWeeks ? '本学期已结束' : '本周是第 ' + cw + ' 周';
    $('subLabel').textContent = (st.name ? st.name + ' · ' : '') + sub + (viewWeek !== cw && cw >= 1 && cw <= st.totalWeeks ? ' · 点击周数回到本周' : '');
    $('prevWeek').disabled = viewWeek <= 1;
    $('nextWeek').disabled = viewWeek >= st.totalWeeks;

    var days = st.showWeekend ? 7 : 5;
    // 若周末有课但被隐藏，仍显示
    if (!st.showWeekend && state.courses.some(function (c) { return c.day > 5 && c.weeks.indexOf(viewWeek) >= 0; })) days = 7;
    var grid = $('grid');
    grid.style.setProperty('--days', days);
    grid.style.setProperty('--rows', st.sectionCount);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var html = '<div class="corner"><span>' + (P.dateOf(st.startDate, viewWeek, 1).getMonth() + 1) + '</span>月</div>';
    for (var d = 1; d <= days; d++) {
      var dt = P.dateOf(st.startDate, viewWeek, d);
      var isToday = dt.getTime() === today.getTime();
      html += '<div class="dayhead' + (isToday ? ' today' : '') + '" style="grid-column:' + (d + 1) + '">' + DAYS[d] + '<small>' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</small></div>';
    }
    for (var s = 1; s <= st.sectionCount; s++) {
      var tm = st.sectionTimes[s - 1] || {};
      html += '<div class="sechead" style="grid-row:' + (s + 1) + '"><b>' + s + '</b><small>' + esc(tm.start || '') + '<br>' + esc(tm.end || '') + '</small></div>';
      for (var d2 = 1; d2 <= days; d2++) html += '<div class="cellbg' + (s % 4 === 0 ? ' sep' : '') + '" style="grid-row:' + (s + 1) + ';grid-column:' + (d2 + 1) + '"></div>';
    }
    // 课程卡片：按天分组，处理同时段冲突
    for (var day = 1; day <= days; day++) {
      var list = state.courses.filter(function (c) { return c.day === day && c.start <= st.sectionCount; });
      var active = list.filter(function (c) { return c.weeks.indexOf(viewWeek) >= 0; });
      var inactive = st.showInactive ? list.filter(function (c) { return c.weeks.indexOf(viewWeek) < 0 && !active.some(function (a) { return overlap(a, c); }); }) : [];
      // 非本周课程之间也可能重叠，取最近要上的一门
      var shownInactive = [];
      inactive.sort(function (a, b) { return nextWeekOf(a) - nextWeekOf(b); }).forEach(function (c) {
        if (!shownInactive.some(function (x) { return overlap(x, c); })) shownInactive.push(c);
      });
      var groups = clusters(active);
      groups.forEach(function (g) {
        g.forEach(function (c, i) { html += card(c, day, true, g.length > 1 ? { idx: i, n: g.length, ids: g.map(function (x) { return x.id; }) } : null); });
      });
      shownInactive.forEach(function (c) { html += card(c, day, false, null); });
    }
    grid.innerHTML = html;
    $('empty').classList.toggle('hidden', state.courses.length > 0);
  }
  function overlap(a, b) { return a.start <= b.end && b.start <= a.end; }
  function nextWeekOf(c) { for (var i = 0; i < c.weeks.length; i++) if (c.weeks[i] > viewWeek) return c.weeks[i]; return 999; }
  function clusters(list) {
    var out = [];
    list.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (c) {
      var g = out.find(function (gr) { return gr.some(function (x) { return overlap(x, c); }); });
      if (g) g.push(c); else out.push([c]);
    });
    return out;
  }
  function card(c, day, active, conflict) {
    var end = Math.min(c.end, state.settings.sectionCount);
    var style = 'grid-column:' + (day + 1) + ';grid-row:' + (c.start + 1) + '/' + (end + 2) + ';--c:' + (c.color || '#4f6bed');
    if (conflict) style += ';width:calc(' + (100 / conflict.n) + '% - 2px);margin-left:calc(' + (100 * conflict.idx / conflict.n) + '%)';
    return '<button class="course' + (active ? '' : ' inactive') + (conflict ? ' conflict' : '') + '" data-id="' + c.id + '" style="' + style + '">' +
      '<span class="cn">' + (active ? '' : '[非本周]') + esc(c.name) + '</span>' +
      (c.location ? '<span class="cl">@' + esc(c.location) + '</span>' : '') +
      (c.teacher && c.end - c.start >= 1 ? '<span class="ct">' + esc(c.teacher) + '</span>' : '') + '</button>';
  }

  /* ---------------- 详情 ---------------- */
  var detailId = null;
  function showDetail(id) {
    var c = state.courses.find(function (x) { return x.id === id; }); if (!c) return;
    detailId = id;
    var tm = state.settings.sectionTimes, st = tm[c.start - 1], en = tm[c.end - 1];
    $('dName').textContent = c.name;
    $('dName').style.borderColor = c.color;
    var rows = [['教师', c.teacher || '—'], ['地点', c.location || '—'], ['时间', DAYS[c.day] + ' 第 ' + c.start + (c.end > c.start ? '-' + c.end : '') + ' 节' + (st && en ? '（' + st.start + '-' + en.end + '）' : '')],
      ['周次', (c.weeksText || P.formatWeeks(c.weeks)) + (c.weeks.indexOf(viewWeek) >= 0 ? '' : '（本周无课）')], ['共', c.weeks.length + ' 周']];
    if (c.note) rows.push(['备注', c.note]);
    $('dBody').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    var same = state.courses.filter(function (x) { return x.id !== c.id && x.day === c.day && overlap(x, c) && x.weeks.indexOf(viewWeek) >= 0; });
    $('dOthers').innerHTML = same.length ? '<p class="muted">同时段还有：' + same.map(function (x) { return '<a href="#" data-id="' + x.id + '">' + esc(x.name) + '</a>'; }).join('、') + '</p>' : '';
    $('dlgDetail').showModal();
  }

  /* ---------------- 编辑 ---------------- */
  var editId = null;
  function fillSelect(sel, from, to, labeler) { sel.innerHTML = ''; for (var i = from; i <= to; i++) { var o = document.createElement('option'); o.value = i; o.textContent = labeler ? labeler(i) : i; sel.appendChild(o); } }
  function openEdit(c, preset) {
    editId = c ? c.id : null;
    var f = $('editForm');
    $('eTitle').textContent = c ? '编辑课程' : '添加课程';
    fillSelect(f.day, 1, 7, function (i) { return DAYS[i]; });
    fillSelect(f.start, 1, state.settings.sectionCount, function (i) { return '第' + i + '节'; });
    fillSelect(f.end, 1, state.settings.sectionCount, function (i) { return '第' + i + '节'; });
    var d = c || Object.assign({ name: '', teacher: '', location: '', day: 1, start: 1, end: 2, weeksText: '1-' + state.settings.totalWeeks + '周', note: '' }, preset || {});
    f.name.value = d.name; f.teacher.value = d.teacher; f.location.value = d.location;
    f.day.value = d.day; f.start.value = d.start; f.end.value = Math.max(d.start, d.end);
    f.weeks.value = d.weeksText || P.formatWeeks(d.weeks);
    f.color.value = d.color || colorFor(d.name || String(Math.random()));
    f.note.value = d.note || '';
    $('eErr').textContent = '';
    $('dlgEdit').showModal();
  }
  function saveEdit() {
    var f = $('editForm');
    var weeks = P.parseWeeks(f.weeks.value);
    var start = +f.start.value, end = +f.end.value;
    if (!f.name.value.trim()) return '请填写课程名称';
    if (!weeks.length) return '周次格式不正确';
    if (end < start) return '结束节不能早于开始节';
    var data = { name: f.name.value.trim(), teacher: f.teacher.value.trim(), location: f.location.value.trim(), day: +f.day.value, start: start, end: end, weeks: weeks, weeksText: P.formatWeeks(weeks), color: f.color.value, note: f.note.value.trim() };
    if (editId) {
      var c = state.courses.find(function (x) { return x.id === editId; });
      var oldName = c.name; Object.assign(c, data);
      // 同名课程统一颜色
      state.courses.forEach(function (x) { if (x.name === data.name || x.name === oldName && oldName === data.name) x.color = data.color; });
    } else {
      data.id = uid(); state.courses.push(data);
      state.courses.forEach(function (x) { if (x.name === data.name) x.color = data.color; });
    }
    save(); render(); return null;
  }

  /* ---------------- 导入 ---------------- */
  function applyImport(courses, replace) {
    if (replace) state.courses = [];
    courses.forEach(function (c) {
      c.id = uid();
      c.color = c.color || colorFor(c.name);
      state.courses.push(c);
    });
    // 自动扩展节数 / 周数
    var maxSec = Math.max.apply(null, [state.settings.sectionCount].concat(courses.map(function (c) { return c.end; })));
    if (maxSec > state.settings.sectionCount) { state.settings.sectionCount = Math.min(16, maxSec); state = Object.assign(state, { settings: state.settings }); ensureTimes(); }
    var maxW = Math.max.apply(null, [0].concat(courses.map(function (c) { return c.weeks[c.weeks.length - 1]; })));
    if (maxW > state.settings.totalWeeks) state.settings.totalWeeks = Math.min(30, maxW);
    save();
  }
  function ensureTimes() {
    var st = state.settings;
    while (st.sectionTimes.length < st.sectionCount) { var l = st.sectionTimes[st.sectionTimes.length - 1]; var a = addMin(l.end, 10); st.sectionTimes.push({ start: a, end: addMin(a, 45) }); }
  }
  function doImport() {
    var txt = $('importText').value;
    $('iErr').textContent = '';
    var res;
    try { res = P.parseAuto(txt); } catch (e) { $('iErr').textContent = '解析失败：' + e.message; return; }
    if (res.backup) { restoreBackup(res.backup); $('dlgImport').close(); return; }
    if (!res.courses.length) { $('iErr').textContent = '没有识别到课程。请确认内容是正方课表 JSON 或课表页面 HTML。'; return; }
    applyImport(res.courses, $('importReplace').checked);
    viewWeek = clampWeek(currentWeek());
    render();
    $('dlgImport').close();
    var msg = '已导入 ' + res.courses.length + ' 条课程安排';
    if (res.skipped.length) msg += '，' + res.skipped.length + ' 条无时间信息已跳过';
    if (res.others.length) msg += '；另有 ' + res.others.length + ' 门无固定时间课程';
    toast(msg, 4000);
    if (res.others.length) setTimeout(function () { alert('以下课程没有固定上课时间，未放入课表：\n\n' + res.others.join('\n')); }, 300);
  }
  function restoreBackup(b) {
    if (!b || !Array.isArray(b.courses)) { toast('备份文件格式不正确'); return; }
    if (!confirm('将用备份覆盖当前所有课程和设置，确定吗？')) return;
    state = { courses: b.courses, settings: Object.assign({}, state.settings, b.settings || {}) };
    state.courses.forEach(function (c) { c.id = c.id || uid(); c.weeks = c.weeks || P.parseWeeks(c.weeksText); c.color = c.color || colorFor(c.name); });
    ensureTimes(); save(); viewWeek = clampWeek(currentWeek()); render(); toast('已恢复备份（' + state.courses.length + ' 条课程）');
  }

  /* ---------------- 设置 ---------------- */
  function openSettings() {
    var f = $('setForm'), st = state.settings;
    f.startDate.value = st.startDate; f.totalWeeks.value = st.totalWeeks; f.sectionCount.value = st.sectionCount; f.name.value = st.name || '';
    f.showWeekend.checked = !!st.showWeekend; f.showInactive.checked = !!st.showInactive;
    renderTimes(st.sectionCount);
    $('dlgMore').showModal();
  }
  function renderTimes(n) {
    var box = $('timesBox'), st = state.settings, cur = readTimes();
    var html = '';
    for (var i = 0; i < n; i++) {
      var t = cur[i] || st.sectionTimes[i] || { start: '', end: '' };
      html += '<div class="trow"><span>第' + (i + 1) + '节</span><input type="time" data-i="' + i + '" data-k="start" value="' + t.start + '"><span>-</span><input type="time" data-i="' + i + '" data-k="end" value="' + t.end + '"></div>';
    }
    box.innerHTML = html;
  }
  function readTimes() {
    var out = [];
    document.querySelectorAll('#timesBox input').forEach(function (inp) { var i = +inp.dataset.i; out[i] = out[i] || {}; out[i][inp.dataset.k] = inp.value; });
    return out;
  }
  function saveSettings() {
    var f = $('setForm'), st = state.settings;
    st.startDate = f.startDate.value || st.startDate;
    st.totalWeeks = Math.max(1, Math.min(30, +f.totalWeeks.value || 20));
    st.sectionCount = Math.max(1, Math.min(16, +f.sectionCount.value || 12));
    st.name = f.name.value.trim();
    st.showWeekend = f.showWeekend.checked; st.showInactive = f.showInactive.checked;
    var t = readTimes();
    t.forEach(function (x, i) { if (x && x.start && x.end) st.sectionTimes[i] = { start: x.start, end: x.end }; });
    ensureTimes(); save(); viewWeek = clampWeek(currentWeek()); render(); toast('设置已保存');
  }

  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  /* ---------------- 导入脚本区 ---------------- */
  function initScriptTab() {
    var sel = $('sXnm'), d = new Date(), y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    for (var i = y + 1; i >= y - 5; i--) { var o = document.createElement('option'); o.value = i; o.textContent = i + '-' + (i + 1) + ' 学年'; sel.appendChild(o); }
    sel.value = y;
    $('sXqm').value = d.getMonth() >= 7 || d.getMonth() === 0 ? '3' : '12';
    function upd() {
      var s = window.ZfScript.consoleScript(sel.value, $('sXqm').value);
      $('scriptBox').textContent = s;
      $('bmLink').href = window.ZfScript.bookmarklet(sel.value, $('sXqm').value);
    }
    sel.onchange = upd; $('sXqm').onchange = upd; upd();
  }
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(function () { toast('已复制'); }, fallback);
    fallback();
    function fallback() { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败，请手动选择复制'); } ta.remove(); }
  }

  /* ---------------- 事件 ---------------- */
  $('prevWeek').onclick = function () { viewWeek = clampWeek(viewWeek - 1); render(); };
  $('nextWeek').onclick = function () { viewWeek = clampWeek(viewWeek + 1); render(); };
  $('weekLabel').onclick = function () { viewWeek = clampWeek(currentWeek()); render(); };
  $('grid').addEventListener('click', function (e) {
    var b = e.target.closest('.course'); if (b) { showDetail(b.dataset.id); return; }
    var cell = e.target.closest('.cellbg');
    if (cell) {
      var gr = cell.style.gridRow.split('/')[0].trim(), gc = cell.style.gridColumn.split('/')[0].trim();
      openEdit(null, { day: +gc - 1, start: +gr - 1, end: Math.min(+gr, state.settings.sectionCount), weeksText: viewWeek + '-' + state.settings.totalWeeks + '周' });
    }
  });
  // 左右滑动切换周
  (function () {
    var x0 = null, y0 = null;
    $('grid').addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('grid').addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { viewWeek = clampWeek(viewWeek + (dx < 0 ? 1 : -1)); render(); }
      x0 = null;
    });
  })();
  $('dOthers').addEventListener('click', function (e) { var a = e.target.closest('a'); if (a) { e.preventDefault(); $('dlgDetail').close(); showDetail(a.dataset.id); } });
  $('dlgDetail').addEventListener('close', function () {
    var v = $('dlgDetail').returnValue; $('dlgDetail').returnValue = '';
    var c = state.courses.find(function (x) { return x.id === detailId; });
    if (!c) return;
    if (v === 'edit') openEdit(c);
    if (v === 'delete' && confirm('删除「' + c.name + '」' + DAYS[c.day] + '第' + c.start + '-' + c.end + '节这条安排？')) {
      state.courses = state.courses.filter(function (x) { return x.id !== c.id; }); save(); render(); toast('已删除');
    }
  });
  $('btnAdd').onclick = function () { openEdit(null); };
  $('eSave').addEventListener('click', function (e) {
    var err = saveEdit();
    if (err) { e.preventDefault(); $('eErr').textContent = err; }
  });
  document.querySelector('.quick-weeks').addEventListener('click', function (e) {
    var q = e.target.dataset.q; if (!q) return;
    var n = state.settings.totalWeeks, f = $('editForm');
    f.weeks.value = q === 'all' ? '1-' + n + '周' : q === 'odd' ? '1-' + (n % 2 ? n : n - 1) + '周(单)' : '2-' + (n % 2 ? n - 1 : n) + '周(双)';
  });
  $('editForm').start.addEventListener('change', function () { var f = $('editForm'); if (+f.end.value < +f.start.value) f.end.value = f.start.value; });

  $('btnImport').onclick = function () { $('iErr').textContent = ''; $('dlgImport').showModal(); };
  $('iClose').onclick = function () { $('dlgImport').close(); };
  $('iDo').onclick = function () {
    if ($('tPaste').classList.contains('hidden')) { switchTab('tPaste'); return; }
    doImport();
  };
  function switchTab(id) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === id); });
    document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.toggle('hidden', p.id !== id); });
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { switchTab(t.dataset.tab); }; });
  $('importFile').onchange = function (e) {
    var file = e.target.files[0]; if (!file) return;
    readFileText(file, function (txt) { $('importText').value = txt; preview(); });
  };
  function readFileText(file, cb) {
    var r = new FileReader();
    r.onload = function () {
      var t = r.result;
      // 旧版正方页面常为 GBK 编码：若出现大量乱码，尝试用 GBK 重新解码
      if (/\uFFFD/.test(t) && window.TextDecoder) {
        var r2 = new FileReader();
        r2.onload = function () { try { cb(new TextDecoder('gbk').decode(r2.result)); } catch (e) { cb(t); } };
        r2.readAsArrayBuffer(file); return;
      }
      cb(t);
    };
    r.readAsText(file, 'utf-8');
  }
  $('importText').addEventListener('input', function () { clearTimeout(this._t); this._t = setTimeout(preview, 300); });
  function preview() {
    var box = $('iPreview'); box.textContent = ''; $('iErr').textContent = '';
    var t = $('importText').value.trim(); if (!t) return;
    try {
      var r = P.parseAuto(t);
      if (r.backup) { box.textContent = '识别为备份文件：' + (r.backup.courses || []).length + ' 条课程'; return; }
      var names = {}; r.courses.forEach(function (c) { names[c.name] = 1; });
      box.textContent = '识别到 ' + r.courses.length + ' 条安排，' + Object.keys(names).length + ' 门课程：' + Object.keys(names).slice(0, 12).join('、') + (Object.keys(names).length > 12 ? ' …' : '');
    } catch (e) { $('iErr').textContent = '暂时无法解析：' + e.message; }
  }
  $('copyScript').onclick = function () { copyText($('scriptBox').textContent); };
  $('copyBm').onclick = function () { copyText($('bmLink').href); };
  $('bmLink').onclick = function (e) { e.preventDefault(); toast('请把它拖到书签栏，在正方教务页面点击'); };

  $('btnMore').onclick = openSettings;
  $('setForm').sectionCount.addEventListener('change', function () { renderTimes(Math.max(1, Math.min(16, +this.value || 12))); });
  $('autoTimes').onclick = function () {
    var ins = document.querySelectorAll('#timesBox input'); var t = readTimes(); if (!t[0] || !t[0].start) return;
    var len = 45, gap = 10, cur = t[0].start;
    for (var i = 0; i < t.length; i++) {
      if (i === 4) cur = cur < '14:00' ? '14:00' : cur; if (i === 8) cur = cur < '19:00' ? '19:00' : cur;
      ins[i * 2].value = cur; ins[i * 2 + 1].value = addMin(cur, len); cur = addMin(cur, len + gap);
    }
  };
  $('dlgMore').addEventListener('close', function () { if ($('dlgMore').returnValue === 'save') saveSettings(); $('dlgMore').returnValue = ''; });
  $('exportIcs').onclick = function () {
    if (!state.courses.length) { toast('没有课程可导出'); return; }
    var r = P.buildIcs(state.courses, state.settings);
    download((state.settings.name || '课程表') + '.ics', r.text, 'text/calendar;charset=utf-8');
    toast('已导出 ' + r.count + ' 个日历事件');
  };
  $('exportBackup').onclick = function () {
    download('课程表备份_' + fmtDate(new Date()) + '.json', JSON.stringify({ app: 'timetable-backup', version: 1, exportedAt: new Date().toISOString(), settings: state.settings, courses: state.courses }, null, 1), 'application/json');
  };
  $('importBackup').onclick = function () { $('backupFile').click(); };
  $('backupFile').onchange = function (e) {
    var f = e.target.files[0]; if (!f) return;
    readFileText(f, function (t) { try { restoreBackup(JSON.parse(t)); $('dlgMore').close(); } catch (err) { toast('备份文件无法读取'); } });
    e.target.value = '';
  };
  $('clearAll').onclick = function () { if (confirm('确定清空全部课程？（设置会保留）')) { state.courses = []; save(); render(); $('dlgMore').close(); } };

  // 点击遮罩关闭对话框
  document.querySelectorAll('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
  });

  initScriptTab();
  render();
  window.TTApp = { state: function () { return state; }, render: render, applyImport: applyImport, setWeek: function (w) { viewWeek = clampWeek(w); render(); } };

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
