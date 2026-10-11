/* 课程表 - 解析与工具函数（浏览器 + Node 通用） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TTParsers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CN_DAY = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7, '七': 7 };

  function toHalf(s) {
    return String(s == null ? '' : s)
      .replace(/[\uff01-\uff5e]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/\u3000/g, ' ')
      .replace(/[—–～~至]/g, '-');
  }

  /**
   * 解析周次字符串 → 升序去重的周数组。
   * 支持："1-16周" "1-8周,10-16周" "1-15周(单)" "2-16周(双)" "3周" "第1-16周|单周"
   *       "1-9周(单),11-16周" "1,3,5周" "1-16" "第2-16周|双周" "1-16周(单周)"
   */
  function parseWeeks(str) {
    var s = toHalf(str).replace(/\s+/g, '');
    if (!s) return [];
    // 全局单双周标记（老系统 "{第1-16周|单周}" 这种写法）
    var globalParity = 0;
    var gm = s.match(/\|([单双])周?/);
    if (gm) { globalParity = gm[1] === '单' ? 1 : 2; s = s.replace(/\|[单双]周?/, ''); }
    s = s.replace(/[{}]/g, '').replace(/\|.*$/, '');
    var out = {};
    var segs = s.split(/[,，、;；]/);
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (!seg) continue;
      var parity = globalParity;
      var pm = seg.match(/[(（]?([单双])周?[)）]?/);
      if (pm) parity = pm[1] === '单' ? 1 : 2;
      var nums = seg.replace(/[(（][^)）]*[)）]/g, '').match(/(\d+)\s*(?:-\s*(\d+))?/);
      if (!nums) continue;
      var a = parseInt(nums[1], 10), b = nums[2] ? parseInt(nums[2], 10) : a;
      if (b < a) { var t = a; a = b; b = t; }
      for (var w = a; w <= b && w <= 60; w++) {
        if (parity === 1 && w % 2 === 0) continue;
        if (parity === 2 && w % 2 === 1) continue;
        out[w] = true;
      }
    }
    return Object.keys(out).map(Number).sort(function (x, y) { return x - y; });
  }

  /** 周数组 → 紧凑文字，如 [1,3,5,7] → "1-7周(单)" ; [1,2,3,5] → "1-3,5周" */
  function formatWeeks(weeks) {
    if (!weeks || !weeks.length) return '';
    var w = weeks.slice().sort(function (a, b) { return a - b; });
    var allOdd = w.every(function (x) { return x % 2 === 1; });
    var allEven = w.every(function (x) { return x % 2 === 0; });
    if (w.length > 2 && (allOdd || allEven)) {
      var ok = true;
      for (var i = 1; i < w.length; i++) if (w[i] - w[i - 1] !== 2) { ok = false; break; }
      if (ok) return w[0] + '-' + w[w.length - 1] + '周(' + (allOdd ? '单' : '双') + ')';
    }
    var parts = [], s = w[0], p = w[0];
    for (var j = 1; j <= w.length; j++) {
      if (j < w.length && w[j] === p + 1) { p = w[j]; continue; }
      parts.push(s === p ? String(s) : s + '-' + p);
      if (j < w.length) { s = p = w[j]; }
    }
    return parts.join(',') + '周';
  }

  /** 解析节次："1-2" "1-2节" "第1,2节" "3,4,5" "11" → {start,end} */
  function parseSections(str) {
    var s = toHalf(str);
    var nums = (s.match(/\d+/g) || []).map(Number);
    if (!nums.length) return null;
    return { start: Math.min.apply(null, nums), end: Math.max.apply(null, nums) };
  }

  function parseDay(v) {
    if (v == null) return 0;
    var s = toHalf(v).trim();
    if (/^\d+$/.test(s)) { var n = parseInt(s, 10); return n >= 1 && n <= 7 ? n : 0; }
    var m = s.match(/(?:星期|周|礼拜)([一二三四五六日天七])/);
    if (m) return CN_DAY[m[1]];
    if (s.length === 1 && CN_DAY[s]) return CN_DAY[s];
    return 0;
  }

  function clean(s) { return toHalf(s).replace(/\s+/g, ' ').trim(); }

  function mkCourse(o) {
    return {
      name: clean(o.name) || '未命名课程',
      teacher: clean(o.teacher),
      location: clean(o.location),
      day: o.day,
      start: o.start,
      end: o.end,
      weeks: o.weeks,
      weeksText: o.weeksText || formatWeeks(o.weeks),
      note: String(o.note || '').replace(/\s+/g, ' ').trim()
    };
  }

  /** 去重：同名同时间同地点同周次 */
  function dedupe(list) {
    var seen = {}, out = [];
    list.forEach(function (c) {
      var k = [c.name, c.day, c.start, c.end, c.location, c.teacher, c.weeks.join('.')].join('|');
      if (!seen[k]) { seen[k] = 1; out.push(c); }
    });
    return out;
  }

  /* ---------------- 新版正方 JSON（kbList） ---------------- */
  /**
   * 输入：JSON 字符串或对象。可以是完整响应 {kbList:[...], sjkList:[...]}、
   * 书签脚本导出的 {source:'zfsoft', kbList}、或直接是 kbList 数组。
   * 返回 {courses, skipped, others}
   */
  function parseZfJson(input) {
    var data = input;
    if (typeof input === 'string') {
      var txt = input.trim().replace(/^\uFEFF/, '');
      data = JSON.parse(txt);
    }
    var list = Array.isArray(data) ? data : (data && (data.kbList || (data.data && data.data.kbList)));
    if (!Array.isArray(list)) throw new Error('未找到 kbList 字段，请确认粘贴的是课表接口返回的 JSON');
    var courses = [], skipped = [];
    list.forEach(function (it) {
      var day = parseDay(it.xqj != null ? it.xqj : it.xqjmc);
      var sec = parseSections(it.jcs || it.jc || it.jcor || '');
      var weeks = parseWeeks(it.zcd || it.zcmc || '');
      if (!day || !sec || !weeks.length) { skipped.push(it.kcmc || JSON.stringify(it).slice(0, 60)); return; }
      var noteParts = [];
      if (it.xqmc) noteParts.push('校区：' + it.xqmc);
      if (it.xf) noteParts.push('学分：' + it.xf);
      if (it.khfsmc) noteParts.push('考核：' + it.khfsmc);
      if (it.jxbmc) noteParts.push('教学班：' + it.jxbmc);
      courses.push(mkCourse({
        name: it.kcmc, teacher: it.xm || it.jsxm, location: it.cdmc || it.cdbh,
        day: day, start: sec.start, end: sec.end, weeks: weeks,
        weeksText: clean(it.zcd || ''), note: noteParts.join('；')
      }));
    });
    var others = (data && Array.isArray(data.sjkList)) ? data.sjkList.map(function (x) { return clean(x.qtkcgs || x.kcmc || x.sjkcgs || ''); }).filter(Boolean) : [];
    return { courses: dedupe(courses), skipped: skipped, others: others };
  }

  /* ---------------- HTML（旧版 xskbcx.aspx / 新版 kbgrid / kblist） ---------------- */
  function getDOMParser() {
    if (typeof DOMParser !== 'undefined') return new DOMParser();
    try { var JSDOM = require('jsdom').JSDOM; return new (new JSDOM('')).window.DOMParser(); }
    catch (e) { throw new Error('当前环境没有 DOMParser'); }
  }

  function textOf(el) { return el ? clean(el.textContent || '') : ''; }

  // 把 HTML 片段按 <br> 拆成文字行
  function brLines(html) {
    return html.split(/<br\s*\/?>/i).map(function (h) {
      return clean(h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    });
  }

  // 旧版时间行："周一第1,2节{第1-16周}" / "周二第3,4节{第2-16周|双周}" / "周三第5,6,7节{第1-8周|2节/周}"
  var OLD_TIME_RE = /(?:周|星期)([一二三四五六日天])第([\d,，\-]+)节\s*\{([^}]*)\}/;
  var OLD_TIME_RE2 = /^\{?第?([\d\-,，]+周[^}]*)\}?$/; // 只有周次的变体

  function parseOldTable(doc) {
    var courses = [];
    var tables = Array.prototype.slice.call(doc.querySelectorAll('table'));
    // 选包含 "{第" 或 "节{" 文字最多的表格
    var table = doc.getElementById('Table1') || doc.getElementById('table1');
    if (!table) {
      var best = null, bestN = 0;
      tables.forEach(function (t) {
        var n = (t.innerHTML.match(/节\s*\{|\{第/g) || []).length;
        if (n > bestN) { bestN = n; best = t; }
      });
      table = best;
    }
    if (!table) return courses;

    // 构造考虑 rowspan/colspan 的矩阵，用于列 → 星期、行 → 节次的兜底推断
    var rows = Array.prototype.slice.call(table.rows || table.querySelectorAll('tr'));
    var grid = [], colDay = {}, rowSec = {};
    rows.forEach(function (tr, r) {
      grid[r] = grid[r] || [];
      var c = 0;
      Array.prototype.slice.call(tr.cells || tr.children).forEach(function (td) {
        while (grid[r][c]) c++;
        var rs = parseInt(td.getAttribute('rowspan') || '1', 10) || 1;
        var cs = parseInt(td.getAttribute('colspan') || '1', 10) || 1;
        for (var i = 0; i < rs; i++) for (var j = 0; j < cs; j++) {
          grid[r + i] = grid[r + i] || [];
          grid[r + i][c + j] = { td: td, r0: r, c0: c, rs: rs };
        }
        var t = textOf(td);
        var d = t.match(/^(?:星期|周)([一二三四五六日天])$/);
        if (d) colDay[c] = CN_DAY[d[1]];
        var sm = t.match(/^第\s*(\d+)\s*节$/);
        if (sm) rowSec[r] = parseInt(sm[1], 10);
        c += cs;
      });
    });

    var seenTd = [];
    grid.forEach(function (row, r) {
      (row || []).forEach(function (cell, c) {
        if (!cell || cell.r0 !== r || cell.c0 !== c || seenTd.indexOf(cell.td) >= 0) return;
        seenTd.push(cell.td);
        var lines = brLines(cell.td.innerHTML);
        if (!lines.some(function (l) { return OLD_TIME_RE.test(l) || /\{第?[\d\-,]+周/.test(l); })) return;
        for (var i = 0; i < lines.length; i++) {
          var m = lines[i].match(OLD_TIME_RE);
          var day, sec, wk;
          if (m) {
            day = CN_DAY[m[1]]; sec = parseSections(m[2]); wk = m[3];
          } else if (OLD_TIME_RE2.test(lines[i]) && /周/.test(lines[i])) {
            day = colDay[c]; wk = lines[i].replace(/[{}]/g, '');
            var s0 = rowSec[r], s1 = rowSec[r + cell.rs - 1];
            sec = s0 ? { start: s0, end: s1 || s0 + cell.rs - 1 } : null;
          } else continue;
          if (!day || !sec) continue;
          var name = lines[i - 1] || '';
          var teacher = lines[i + 1] || '';
          var loc = lines[i + 2] || '';
          // 下一行若是另一门课的时间行，说明缺省了地点
          if (lines[i + 3] !== undefined && OLD_TIME_RE.test(lines[i + 3])) loc = '';
          if (OLD_TIME_RE.test(teacher)) { teacher = ''; loc = ''; }
          if (OLD_TIME_RE.test(loc)) loc = '';
          var weeks = parseWeeks(wk);
          if (!weeks.length) continue;
          courses.push(mkCourse({ name: name, teacher: teacher, location: loc, day: day, start: sec.start, end: sec.end, weeks: weeks, weeksText: wk.replace(/^第/, '') }));
        }
      });
    });
    return courses;
  }

  // 新版正方 HTML：div.timetable_con 里有 .title 课程名 + 若干 <p><span title="节/周|上课地点|教师|...">
  function parseNewHtml(doc) {
    var courses = [];
    var cons = Array.prototype.slice.call(doc.querySelectorAll('.timetable_con'));
    cons.forEach(function (con) {
      var titleEl = con.querySelector('.title');
      var name = textOf(titleEl).replace(/[★☆◆◇●○■□▲△]+$/, '').trim();
      var info = {};
      Array.prototype.slice.call(con.querySelectorAll('[title]')).forEach(function (sp) {
        var key = sp.getAttribute('title');
        if (!key || sp === titleEl) return;
        var holder = sp.tagName === 'P' ? sp : (sp.parentElement && sp.parentElement.tagName === 'P' ? sp.parentElement : sp);
        var val = textOf(holder);
        // 去掉 "节/周" 等标签图标残留文字
        val = val.replace(new RegExp('^' + key.replace(/[\/\\^$*+?.()|[\]{}]/g, '\\$&') + '[:：]?'), '').trim();
        if (!info[key]) info[key] = val;
      });
      var jz = info['节/周'] || info['周/节'] || info['节次/周次'] || '';
      var secM = jz.match(/[(（]\s*([\d\-,]+)\s*节\s*[)）]/);
      var sec = secM ? parseSections(secM[1]) : null;
      var wkText = jz.replace(/[(（]\s*[\d\-,]+\s*节\s*[)）]/, '').trim();
      // 星期：kbgrid 的 td id="星期-节次"，kblist 的 tbody id="xq_星期"
      var day = 0, node = con;
      while (node && node.nodeType === 1) {
        var id = node.getAttribute && node.getAttribute('id') || '';
        var m1 = id.match(/^(\d)-(\d+)$/);
        if (m1 && node.tagName === 'TD') { day = +m1[1]; if (!sec) sec = { start: +m1[2], end: +m1[2] }; break; }
        var m2 = id.match(/^xq_(\d)$/);
        if (m2) { day = +m2[1]; break; }
        node = node.parentElement;
      }
      if (!day) {
        // kblist 表格：同一行 td 里可能有 "星期一"
        var tr = con.closest ? con.closest('tr') : null;
        if (tr) day = parseDay(textOf(tr));
      }
      if (!sec && con.closest) {
        var tr2 = con.closest('tr');
        if (tr2) { var jm = textOf(tr2).match(/(\d+)\s*-\s*(\d+)\s*节?/); if (jm) sec = parseSections(jm[0]); }
      }
      var weeks = parseWeeks(wkText);
      if (!name || !day || !sec || !weeks.length) return;
      courses.push(mkCourse({
        name: name, teacher: info['教师'] || info['任课教师'] || '', location: info['上课地点'] || info['教学地点'] || '',
        day: day, start: sec.start, end: sec.end, weeks: weeks, weeksText: wkText,
        note: [info['校区'] ? '校区：' + info['校区'] : '', info['教学班名称'] ? '教学班：' + info['教学班名称'] : '', info['学分'] ? '学分：' + info['学分'] : ''].filter(Boolean).join('；')
      }));
    });
    return courses;
  }

  function parseZfHtml(html) {
    if (/^\s*[\[{]/.test(html)) return parseZfJson(html); // 用户误把 JSON 粘到 HTML 框
    var doc = getDOMParser().parseFromString(html, 'text/html');
    var courses = parseNewHtml(doc);
    var kind = 'new';
    if (!courses.length) { courses = parseOldTable(doc); kind = 'old'; }
    return { courses: dedupe(courses), skipped: [], others: [], kind: kind };
  }

  /** 自动识别 JSON / HTML */
  function parseAuto(text) {
    var t = String(text || '').trim().replace(/^\uFEFF/, '');
    if (!t) throw new Error('内容为空');
    if (t[0] === '{' || t[0] === '[') {
      var obj = JSON.parse(t);
      if (obj && obj.app === 'timetable-backup') return { backup: obj };
      return parseZfJson(obj);
    }
    return parseZfHtml(t);
  }

  /* ---------------- 周次 / 日期 ---------------- */
  function mondayOf(dateStr) {
    var p = String(dateStr).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var wd = d.getDay() || 7;
    d.setDate(d.getDate() - (wd - 1));
    return d;
  }
  function weekNumber(startDateStr, today) {
    var m = mondayOf(startDateStr);
    var t = today ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : new Date(new Date().setHours(0, 0, 0, 0));
    var diff = Math.round((t - m) / 86400000);
    return Math.floor(diff / 7) + 1;
  }
  function dateOf(startDateStr, week, day) {
    var d = mondayOf(startDateStr);
    d.setDate(d.getDate() + (week - 1) * 7 + (day - 1));
    return d;
  }

  /* ---------------- ICS ---------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    // 按 75 字节折行（UTF-8）
    var out = [], cur = '', bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], cp = line.codePointAt(i);
      if (cp > 0xffff) { ch = line.slice(i, i + 2); i++; }
      var b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function buildIcs(courses, settings, nowDate) {
    var times = settings.sectionTimes || [];
    var now = nowDate || new Date();
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//timetable//CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsEsc(settings.name || '课程表'), 'X-WR-TIMEZONE:' + (settings.timezone || 'Asia/Shanghai')];
    var tz = settings.timezone || 'Asia/Shanghai';
    if (tz === 'Asia/Shanghai') L.push('BEGIN:VTIMEZONE', 'TZID:Asia/Shanghai', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0800', 'TZOFFSETTO:+0800', 'TZNAME:CST', 'END:STANDARD', 'END:VTIMEZONE');
    var count = 0;
    courses.forEach(function (c, ci) {
      var st = times[c.start - 1], en = times[c.end - 1];
      if (!st || !en) return;
      c.weeks.forEach(function (w) {
        if (settings.totalWeeks && w > settings.totalWeeks) return;
        var d = dateOf(settings.startDate, w, c.day);
        var ds = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
        var s = st.start.replace(':', '') + '00', e = en.end.replace(':', '') + '00';
        L.push('BEGIN:VEVENT',
          'UID:' + (c.id || 'c' + ci) + '-w' + w + '@timetable',
          'DTSTAMP:' + stamp,
          'DTSTART;TZID=' + tz + ':' + ds + 'T' + s,
          'DTEND;TZID=' + tz + ':' + ds + 'T' + e,
          'SUMMARY:' + icsEsc(c.name),
          'LOCATION:' + icsEsc(c.location),
          'DESCRIPTION:' + icsEsc(['教师：' + (c.teacher || '-'), '第' + w + '周 第' + c.start + '-' + c.end + '节', c.note].filter(Boolean).join('\n')),
          'END:VEVENT');
        count++;
      });
    });
    L.push('END:VCALENDAR');
    return { text: L.map(fold).join('\r\n') + '\r\n', count: count };
  }

  return {
    parseWeeks: parseWeeks, formatWeeks: formatWeeks, parseSections: parseSections, parseDay: parseDay,
    parseZfJson: parseZfJson, parseZfHtml: parseZfHtml, parseAuto: parseAuto,
    mondayOf: mondayOf, weekNumber: weekNumber, dateOf: dateOf, buildIcs: buildIcs
  };
});
