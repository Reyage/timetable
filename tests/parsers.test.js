const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../js/parsers.js');
const Z = require('../js/zfscript.js');
const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const range = (a, b, step = 1) => { const r = []; for (let i = a; i <= b; i += step) r.push(i); return r; };

test('parseWeeks: 各种周次格式', () => {
  assert.deepEqual(P.parseWeeks('1-16周'), range(1, 16));
  assert.deepEqual(P.parseWeeks('1-8周,10-16周'), [...range(1, 8), ...range(10, 16)]);
  assert.deepEqual(P.parseWeeks('1-15周(单)'), range(1, 15, 2));
  assert.deepEqual(P.parseWeeks('2-16周(双)'), range(2, 16, 2));
  assert.deepEqual(P.parseWeeks('1-16周(双)'), range(2, 16, 2));
  assert.deepEqual(P.parseWeeks('1-9周(单),11-17周'), [1, 3, 5, 7, 9, ...range(11, 17)]);
  assert.deepEqual(P.parseWeeks('3周,5周,7周'), [3, 5, 7]);
  assert.deepEqual(P.parseWeeks('1-16周,18周(双)'), [...range(1, 16), 18]);
  assert.deepEqual(P.parseWeeks('第1-15周|单周'), range(1, 15, 2));
  assert.deepEqual(P.parseWeeks('第2-16周|双周'), range(2, 16, 2));
  assert.deepEqual(P.parseWeeks('第1-8周|2节/周'), range(1, 8));
  assert.deepEqual(P.parseWeeks('1－16周（单周）'), range(1, 15, 2));
  assert.deepEqual(P.parseWeeks('1,3,5'), [1, 3, 5]);
  assert.deepEqual(P.parseWeeks(''), []);
  assert.deepEqual(P.parseWeeks('无'), []);
});

test('formatWeeks 往返', () => {
  assert.equal(P.formatWeeks(range(1, 16)), '1-16周');
  assert.equal(P.formatWeeks(range(1, 15, 2)), '1-15周(单)');
  assert.equal(P.formatWeeks([1, 2, 3, 5, 7, 8]), '1-3,5,7-8周');
  for (const s of ['1-8周,10-16周', '2-16周(双)', '3周,5周,7周', '1-9周(单),11-17周']) {
    assert.deepEqual(P.parseWeeks(P.formatWeeks(P.parseWeeks(s))), P.parseWeeks(s), s);
  }
});

test('parseSections / parseDay', () => {
  assert.deepEqual(P.parseSections('1-2'), { start: 1, end: 2 });
  assert.deepEqual(P.parseSections('5-7节'), { start: 5, end: 7 });
  assert.deepEqual(P.parseSections('第3,4,5节'), { start: 3, end: 5 });
  assert.deepEqual(P.parseSections('11'), { start: 11, end: 11 });
  assert.equal(P.parseDay('3'), 3);
  assert.equal(P.parseDay('星期日'), 7);
  assert.equal(P.parseDay('周六'), 6);
  assert.equal(P.parseDay(''), 0);
});

test('正方新版 JSON (kbList)', () => {
  const r = P.parseZfJson(fx('zf_kbList.json'));
  assert.equal(r.courses.length, 9);
  assert.equal(r.skipped.length, 1); // 军事理论 无时间
  assert.deepEqual(r.others, ['创新创业实践 王老师(共16周)/第1-16周']);
  const math = r.courses.find(c => c.name === '高等数学A(一)' && c.day === 1);
  assert.deepEqual([math.teacher, math.location, math.start, math.end], ['王建国', '教1-101', 1, 2]);
  assert.deepEqual(math.weeks, range(1, 16));
  assert.match(math.note, /学分：5.0/);
  const eng = r.courses.find(c => c.name === '大学英语(一)');
  assert.ok(!eng.weeks.includes(9) && eng.weeks.includes(10));
  const lab = r.courses.find(c => c.name === '大学物理实验');
  assert.deepEqual([lab.day, lab.start, lab.end], [4, 5, 7]);
  assert.deepEqual(lab.weeks, range(2, 16, 2));
  const prog = r.courses.find(c => c.name === '程序设计基础');
  assert.deepEqual(prog.weeks, [1, 3, 5, 7, 9, 11, 12, 13, 14, 15, 16, 17]);
  // 直接传数组 / 书签导出格式
  assert.equal(P.parseZfJson(JSON.parse(fx('zf_kbList.json')).kbList).courses.length, 9);
  assert.equal(P.parseAuto(JSON.stringify({ source: 'zfsoft', kbList: JSON.parse(fx('zf_kbList.json')).kbList })).courses.length, 9);
  assert.throws(() => P.parseZfJson('{"foo":1}'), /kbList/);
});

test('正方旧版 HTML (xskbcx.aspx)', () => {
  const r = P.parseZfHtml(fx('zf_old_xskbcx.html'));
  assert.equal(r.kind, 'old');
  const by = n => r.courses.find(c => c.name === n);
  assert.equal(r.courses.length, 7);
  assert.deepEqual([by('高等数学').day, by('高等数学').start, by('高等数学').end, by('高等数学').teacher, by('高等数学').location], [1, 1, 2, '张三', 'A101']);
  assert.deepEqual(by('大学英语').weeks, range(1, 15, 2));
  assert.deepEqual(by('英语听说').weeks, range(2, 16, 2));
  assert.equal(by('英语听说').location, '语音室3');
  assert.deepEqual([by('大学物理').day, by('大学物理').start, by('大学物理').end], [3, 3, 5]);
  assert.deepEqual(by('大学物理').weeks, range(3, 18));
  assert.deepEqual([by('选修:电影赏析').day, by('选修:电影赏析').teacher, by('选修:电影赏析').location], [7, '孙八', '']);
});

test('正方新版 HTML (kbgrid + kblist)', () => {
  const r = P.parseZfHtml(fx('zf_new_kbgrid.html'));
  assert.equal(r.kind, 'new');
  const by = n => r.courses.find(c => c.name === n);
  assert.equal(r.courses.length, 5);
  assert.deepEqual([by('数据结构').day, by('数据结构').start, by('数据结构').end, by('数据结构').location, by('数据结构').teacher], [1, 1, 2, '信息楼A305', '黄蓉']);
  assert.match(by('数据结构').note, /主校区/);
  assert.deepEqual(by('概率论与数理统计').weeks, [1, 3, 5, 7, 9, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual([by('体育(三)').day, by('体育(三)').weeks], [2, range(2, 16, 2)]);
  assert.deepEqual([by('计算机组成原理').day, by('计算机组成原理').start, by('计算机组成原理').end], [3, 3, 5]);
  assert.deepEqual([by('操作系统').day, by('操作系统').start, by('操作系统').end], [5, 7, 8]);
});

test('parseAuto 自动识别', () => {
  assert.equal(P.parseAuto(fx('zf_old_xskbcx.html')).kind, 'old');
  assert.equal(P.parseAuto(fx('zf_kbList.json')).courses.length, 9);
  assert.ok(P.parseAuto('{"app":"timetable-backup","courses":[]}').backup);
  assert.throws(() => P.parseAuto('  '));
});

test('周次计算与日期', () => {
  // 2026-09-07 是周一
  assert.equal(P.weekNumber('2026-09-07', new Date(2026, 8, 7)), 1);
  assert.equal(P.weekNumber('2026-09-09', new Date(2026, 8, 13)), 1); // 开学日期任意填本周某天
  assert.equal(P.weekNumber('2026-09-07', new Date(2026, 8, 14)), 2);
  assert.equal(P.weekNumber('2026-09-07', new Date(2026, 9, 11)), 5);
  assert.equal(P.weekNumber('2026-09-07', new Date(2026, 8, 1)), 0);
  const d = P.dateOf('2026-09-07', 3, 5);
  assert.deepEqual([d.getFullYear(), d.getMonth() + 1, d.getDate()], [2026, 9, 25]);
});

test('ICS 导出', () => {
  const { courses } = P.parseZfJson(fx('zf_kbList.json'));
  const times = Array.from({ length: 12 }, (_, i) => ({ start: '08:00', end: '08:45' }));
  times[0] = { start: '08:00', end: '08:45' }; times[1] = { start: '08:55', end: '09:40' };
  const r = P.buildIcs(courses, { startDate: '2026-09-07', totalWeeks: 20, sectionTimes: times, name: '测试课表' }, new Date(Date.UTC(2026, 9, 11)));
  const expected = courses.reduce((n, c) => n + c.weeks.filter(w => w <= 20).length, 0);
  assert.equal(r.count, expected);
  assert.match(r.text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(r.text, /DTSTART;TZID=Asia\/Shanghai:20260907T080000/);
  assert.match(r.text, /DTEND;TZID=Asia\/Shanghai:20260907T094000/);
  assert.equal((r.text.match(/BEGIN:VEVENT/g) || []).length, expected);
  for (const line of r.text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'line too long: ' + line);
});

test('书签 / 控制台脚本生成', () => {
  const s = Z.consoleScript('https://reyage.github.io/timetable/', '2026', '3');
  assert.match(s, /xskbcx_cxXsgrkb\.html/);
  assert.match(s, /\("https:\/\/reyage\.github\.io\/timetable\/","2026","3"\);$/);
  new Function(s); // 语法正确
  const b = Z.bookmarklet();
  assert.ok(b.startsWith('javascript:'));
  assert.ok(!/\s/.test(b), '书签里不应有空白');
  assert.ok(b.length < 12000, 'bookmarklet length ' + b.length);
  const code = decodeURIComponent(b.slice(11));
  new Function(code);
  assert.match(code, /"https:\/\/reyage\.github\.io\/timetable\/","",""\);$/); // 默认自动识别学期
});

test('纯文字：新版「列表」视图全选复制', () => {
  const r = P.parseAuto(fx('zf_text_list.txt'));
  assert.equal(r.kind, 'text');
  assert.equal(r.courses.length, 8);
  const by = n => r.courses.find(c => c.name === n);
  assert.deepEqual([by('数据结构').day, by('数据结构').start, by('数据结构').end, by('数据结构').location, by('数据结构').teacher], [1, 1, 2, '信息楼A305', '黄蓉']);
  assert.deepEqual(by('数据结构').weeks, range(1, 16));
  assert.match(by('数据结构').note, /主校区/);
  assert.deepEqual([by('大学英语(三)').day, by('大学英语(三)').start, by('大学英语(三)').end], [1, 3, 4]);
  assert.ok(!by('大学英语(三)').weeks.includes(9));
  assert.deepEqual([by('大学物理实验').start, by('大学物理实验').end, by('大学物理实验').weeks], [5, 7, range(2, 16, 2)]);
  assert.deepEqual([by('概率论与数理统计').day, by('概率论与数理统计').weeks], [2, [1, 3, 5, 7, 9, 11, 12, 13, 14, 15, 16, 17]]);
  assert.deepEqual([by('体育(三)').day, by('体育(三)').teacher], [2, '杨过']); // 去掉【调】
  assert.deepEqual([by('计算机组成原理').day, by('计算机组成原理').start, by('计算机组成原理').end], [3, 3, 5]);
  assert.deepEqual([by('形势与政策').day, by('形势与政策').weeks], [5, [3, 5, 7]]);
  assert.deepEqual([by('选修:电影赏析').day, by('选修:电影赏析').location], [7, '']);
});

test('纯文字：旧版正方课表全选复制', () => {
  const r = P.parseAuto(fx('zf_text_old.txt'));
  assert.equal(r.courses.length, 7);
  const by = n => r.courses.find(c => c.name === n);
  assert.deepEqual([by('高等数学').day, by('高等数学').teacher, by('高等数学').location], [1, '张三', 'A101']);
  assert.deepEqual([by('大学英语').weeks, by('大学英语').weeksText], [range(1, 15, 2), '1-15周(单)']);
  assert.deepEqual([by('英语听说').teacher, by('英语听说').location, by('英语听说').weeks], ['Smith', '语音室3', range(2, 16, 2)]);
  assert.deepEqual([by('大学物理').day, by('大学物理').start, by('大学物理').end], [3, 3, 5]);
  assert.deepEqual([by('选修:电影赏析').day, by('选修:电影赏析').teacher, by('选修:电影赏析').location], [7, '孙八', '']);
});

test('纯文字：「表格」视图看不出星期 → 提示改用列表', () => {
  const r = P.parseAuto(fx('zf_text_grid.txt'));
  assert.equal(r.courses.length, 0);
  assert.equal(r.noDay, 2);
});

test('纯文字：带「星期/节次」标签的简单格式', () => {
  const r = P.parseText('课程名称：操作系统\n星期：星期四\n节次：3-4节\n周次：1-16周(双)\n地点：B101\n教师：令狐冲\n课程名称：编译原理\n上课时间：星期二第5-6节{1-8周}\n教室：C202');
  assert.equal(r.courses.length, 2);
  const os = r.courses[0], cp = r.courses[1];
  assert.deepEqual([os.name, os.day, os.start, os.end, os.location, os.teacher, os.weeks], ['操作系统', 4, 3, 4, 'B101', '令狐冲', range(2, 16, 2)]);
  assert.deepEqual([cp.name, cp.day, cp.start, cp.end, cp.location, cp.weeks], ['编译原理', 2, 5, 6, 'C202', range(1, 8)]);
});

test('新版 HTML 列表视图（文字标签，无 title 属性）', () => {
  const r = P.parseZfHtml(fx('zf_new_list_text_labels.html'));
  assert.equal(r.courses.length, 2);
  const ds = r.courses.find(c => c.name === '数据结构');
  assert.deepEqual([ds.day, ds.start, ds.end, ds.location, ds.teacher, ds.weeks.length], [1, 1, 2, '信息楼A305', '黄蓉', 16]);
  const en = r.courses.find(c => c.name === '大学英语(三)');
  assert.deepEqual([en.start, en.end, en.weeks], [3, 4, range(1, 15, 2)]);
});

test('书签传输格式：精简 + 压缩往返', async () => {
  const data = JSON.parse(fx('zf_kbList.json'));
  const c = P.compactKb(data, '2026', '3');
  const enc = await P.encodeTransfer(c);
  assert.equal(enc[0], 'z');
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.ok(enc.length < JSON.stringify(data).length / 2, 'compressed ' + enc.length);
  const back = P.expandCompact(await P.decodeTransfer(enc));
  assert.equal(back.xnm, '2026');
  const r = P.parseZfJson(back);
  assert.equal(r.courses.length, 9);
  assert.deepEqual(r.others, ['创新创业实践 王老师(共16周)/第1-16周']);
  // 未压缩的 j 前缀
  const plain = 'j' + Buffer.from(JSON.stringify(c)).toString('base64url');
  assert.equal(P.parseZfJson(P.expandCompact(await P.decodeTransfer(plain))).courses.length, 9);
  await assert.rejects(P.decodeTransfer('x123'));
  await assert.rejects(P.decodeTransfer('z!!!'));
});
