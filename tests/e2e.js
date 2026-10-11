/* 端到端测试：node tests/e2e.js（需先在仓库目录运行 python3 -m http.server 8765；依赖 playwright-core + 系统 Chrome） */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const dir = path.join(__dirname, '..');
const APP = 'http://localhost:8765/';
const json = fs.readFileSync(dir + '/tests/fixtures/zf_kbList.json', 'utf8');
const listText = fs.readFileSync(dir + '/tests/fixtures/zf_text_list.txt', 'utf8');
const Z = require(dir + '/js/zfscript.js');
const SHOT = dir + '/screenshots/';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const IPAD = { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const SETTINGS = { startDate: '2026-09-07', totalWeeks: 18, name: '2026秋 课表' };
const results = [];
const ok = (name) => { results.push(name); console.log('✓', name); };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const errors = [];
  async function newPage(opts, seed = true) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    if (seed) await page.addInitScript((s) => { if (!localStorage.getItem('timetable.v1')) localStorage.setItem('timetable.v1', JSON.stringify({ courses: [], settings: s })); }, SETTINGS);
    return { ctx, page };
  }
  // 模拟正方站点
  async function mockZf(page, mode, captured) {
    await page.route('http://jw.example.edu.cn/**', async (route) => {
      const u = route.request().url();
      if (route.request().method() === 'POST' && u.includes('/kbcx/xskbcx_cx')) {
        captured.push(route.request().postData());
        if (mode === 'login') return route.fulfill({ contentType: 'text/html', body: '<html><h5>用户登录</h5><input id="yhm"></html>' });
        if (mode === 'empty') return route.fulfill({ contentType: 'application/json', body: '{"kbList":[]}' });
        return route.fulfill({ contentType: 'application/json', body: json });
      }
      const withSelect = u.includes('kbcx/xskbcx_cxXskbcxIndex');
      return route.fulfill({ contentType: 'text/html', body: '<html><body><h3>正方教务管理系统</h3>' + (withSelect ? '<select id="xnm"><option value="2025" selected>2025-2026</option></select><select id="xqm"><option value="12" selected>2</option></select>' : '') + '</body></html>' });
    });
  }
  const code = decodeURIComponent(Z.bookmarklet(APP).slice('javascript:'.length));

  // 1. 书签完整流程：正方页面 → 跳转 App #import → 一键导入
  {
    const { ctx, page } = await newPage(IPAD);
    const posted = [], dialogs = [];
    await mockZf(page, 'ok', posted);
    page.on('dialog', d => { dialogs.push(d.type() + ':' + d.message()); d.accept(); });
    await page.goto('http://jw.example.edu.cn/jwglxt/xtgl/index_initMenu.html?jsdm=xs');
    await Promise.all([page.waitForURL(/localhost:8765/), page.evaluate(code)]);
    assert.match(posted[0], /^xnm=2026&xqm=3&/); // 2026 年 10 月 → 2026 学年第一学期
    assert.ok(dialogs.some(d => /confirm:已读取 2026-2027 学年第一学期 的课表：8 门课程/.test(d)), dialogs.join('|'));
    await page.waitForSelector('#dlgConfirm[open]');
    assert.equal(await page.evaluate(() => location.hash), '');
    const summary = await page.textContent('#cSummary');
    assert.match(summary, /来自教务系统：2026-2027 学年第一学期/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT + 'ipad-confirm.png' });
    await page.click('#cReplace'); await page.waitForTimeout(200);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => TTApp.state().courses.length), 9);
    ok('书签：自动识别学期(按日期) → 跳转 #import → 一键导入 9 条，hash 已清除');
    await page.waitForTimeout(3200);
    await page.screenshot({ path: SHOT + 'ipad-timetable.png' });
    await ctx.close();
  }
  // 2. 从页面下拉框识别学期
  {
    const { ctx, page } = await newPage(PHONE);
    const posted = [];
    await mockZf(page, 'ok', posted);
    page.on('dialog', d => d.accept());
    await page.goto('http://jw.example.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default');
    await Promise.all([page.waitForURL(/localhost:8765/), page.evaluate(code)]);
    assert.match(posted[0], /^xnm=2025&xqm=12&/);
    await page.waitForSelector('#dlgConfirm[open]');
    assert.match(await page.textContent('#cSummary'), /2025-2026 学年第二学期/);
    ok('书签：从课表页下拉框识别学年学期 (2025, 12)');
    await ctx.close();
  }
  // 3. 错误提示
  for (const [mode, re] of [['login', /还没有登录/], ['empty', /课表是空的/]]) {
    const { ctx, page } = await newPage(PHONE);
    await mockZf(page, mode, []);
    const msg = new Promise(r => page.on('dialog', d => { r(d.message()); d.accept(); }));
    await page.goto('http://jw.example.edu.cn/jwglxt/xtgl/index_initMenu.html');
    await page.evaluate(code);
    assert.match(await msg, re);
    assert.match(page.url(), /jw\.example\.edu\.cn/);
    ok('书签错误提示：' + mode);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(PHONE);
    const msg = new Promise(r => page.on('dialog', d => { r(d.message()); d.accept(); }));
    await page.route('http://other.example.com/**', r => r.fulfill({ contentType: 'text/html', body: '<p>not zf</p>', status: 200 }));
    await page.goto('http://other.example.com/');
    await page.evaluate(code);
    assert.match(await msg, /没能读取到课表/);
    ok('书签错误提示：不是正方页面');
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(PHONE);
    const msg = new Promise(r => page.on('dialog', d => { r(d.message()); d.accept(); }));
    await page.goto(APP);
    await page.evaluate(code);
    assert.match(await msg, /请先在 Safari 打开学校的正方教务系统/);
    ok('书签错误提示：在 App 页面上点了书签');
    await ctx.close();
  }
  // 4. postMessage 备用通道
  {
    const { ctx, page } = await newPage(PHONE);
    await page.goto(APP + '#listen');
    const P = require(dir + '/js/parsers.js');
    const compact = P.compactKb(JSON.parse(json), '2026', '3');
    const ack = await page.evaluate((c) => new Promise(res => { window.addEventListener('message', e => { if (e.data && e.data.type === 'tt-ack') res(true); }); window.postMessage({ type: 'tt-import', data: c }, '*'); }), compact);
    assert.ok(ack);
    await page.waitForSelector('#dlgConfirm[open]');
    await page.click('#cReplace'); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => TTApp.state().courses.length), 9);
    ok('postMessage 备用通道：收到数据并回复 ack');
    await ctx.close();
  }
  // 5. 首次使用 + 导入界面截图 + 复制粘贴流程
  for (const [name, opts] of [['ipad', IPAD], ['mobile', PHONE]]) {
    const { ctx, page } = await newPage(opts);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP.slice(0, -1) });
    await page.goto(APP);
    assert.ok(await page.isVisible('#emptyImport'));
    await page.screenshot({ path: SHOT + name + '-first-run.png' });
    await page.click('#emptyImport');
    await page.waitForTimeout(250);
    await page.screenshot({ path: SHOT + name + '-import.png' });
    await page.click('#goBm'); await page.waitForTimeout(200);
    await page.screenshot({ path: SHOT + name + '-import-bookmark.png' });
    await page.click('#copyBm'); await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(clip.startsWith('javascript:') && clip.includes(encodeURIComponent('http://localhost:8765/')));
    await page.click('#iBack'); await page.click('#goPaste'); await page.waitForTimeout(200);
    await page.screenshot({ path: SHOT + name + '-import-paste.png' });
    await page.evaluate((t) => navigator.clipboard.writeText(t), listText);
    await page.click('#pasteBtn');
    await page.waitForSelector('#dlgConfirm[open]');
    assert.match(await page.textContent('#cSummary'), /8.*门课程/);
    await page.click('#cReplace'); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => TTApp.state().courses.length), 8);
    ok(name + '：首次提示 → 导入首页 → 复制书签代码 → 粘贴列表文字导入 8 条');
    if (name === 'mobile') {
      await page.mouse.move(1, 1); await page.waitForTimeout(3200);
      await page.screenshot({ path: SHOT + 'mobile.png' });
    }
    await ctx.close();
  }
  // 6. 表格视图文字 → 友好提示；追加模式
  {
    const { ctx, page } = await newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(APP);
    await page.click('#emptyImport'); await page.click('#goPaste');
    await page.fill('#importText', fs.readFileSync(dir + '/tests/fixtures/zf_text_grid.txt', 'utf8'));
    await page.click('#iDo');
    assert.match(await page.textContent('#iErr'), /切换到「列表」/);
    await page.fill('#importText', json); await page.click('#iDo');
    await page.click('#cReplace'); await page.waitForTimeout(200);
    await page.click('#btnImport'); await page.click('#goPaste');
    await page.fill('#importText', fs.readFileSync(dir + '/tests/fixtures/zf_text_old.txt', 'utf8')); await page.click('#iDo');
    assert.ok(await page.isVisible('#cAppend'));
    await page.click('#cAppend'); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => TTApp.state().courses.length), 16);
    ok('桌面：表格视图文字给出提示；JSON 导入后追加旧版文字共 16 条');
    await page.mouse.move(1, 1); await page.waitForTimeout(3200);
    await page.screenshot({ path: SHOT + 'desktop.png' });
    // 服务工作线程
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
    assert.ok(sw);
    ok('Service Worker 已激活');
    await ctx.close();
  }
  await browser.close();
  assert.deepEqual(errors, [], 'page errors: ' + errors.join('\n'));
  console.log(`\nE2E: ${results.length} 项通过，页面错误 0`);
})().catch(e => { console.error('E2E FAILED:', e); process.exit(1); });
