const { chromium } = require('playwright-core');
const fs = require('fs');
const dir = '/workspace/timetable';
const json = fs.readFileSync(dir + '/tests/fixtures/zf_kbList.json', 'utf8');
const oldHtml = fs.readFileSync(dir + '/tests/fixtures/zf_old_xskbcx.html', 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  async function run(name, ctxOpts, base) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      if (!localStorage.getItem('timetable.v1')) localStorage.setItem('timetable.v1', JSON.stringify({ courses: [], settings: { startDate: '2026-09-07', totalWeeks: 18, name: '2026秋 课表' } }));
    });
    await page.goto(base);
    await page.click('#btnImport');
    await page.click('.tab[data-tab="tPaste"]');
    await page.fill('#importText', json);
    await page.waitForTimeout(400);
    const prev = await page.textContent('#iPreview');
    await page.click('#iDo');
    await page.mouse.move(1, 1);
    await page.waitForTimeout(4600);
    const n = await page.evaluate(() => TTApp.state().courses.length);
    const label = await page.textContent('#weekLabel');
    const cards = await page.$$eval('.course:not(.inactive)', els => els.map(e => e.textContent));
    console.log(name, '| preview:', prev, '| courses:', n, '|', label, '| active cards:', cards.length);
    await page.screenshot({ path: `${dir}/screenshots/${name}.png`, fullPage: false });
    return { ctx, page };
  }
  const d = await run('desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, 'http://localhost:8765/index.html');
  // 详情弹窗
  await d.page.click('.course:not(.inactive) >> nth=0');
  await d.page.waitForTimeout(200);
  console.log('detail:', (await d.page.textContent('#dBody')).slice(0, 80));
  await d.page.screenshot({ path: `${dir}/screenshots/desktop-detail.png` });
  await d.page.keyboard.press('Escape');
  // 导入脚本页
  await d.page.click('#btnImport');
  await d.page.click('.tab[data-tab="tScript"]');
  await d.page.waitForTimeout(200);
  await d.page.screenshot({ path: `${dir}/screenshots/desktop-import-script.png` });
  await d.page.keyboard.press('Escape');
  // 旧版 HTML 追加导入
  await d.page.click('#btnImport'); await d.page.click('.tab[data-tab="tPaste"]');
  await d.page.fill('#importText', oldHtml); await d.page.uncheck('#importReplace');
  await d.page.click('#iDo'); await d.page.waitForTimeout(300);
  console.log('after old html append:', await d.page.evaluate(() => TTApp.state().courses.length));
  // ICS 下载
  const [dl] = await Promise.all([d.page.waitForEvent('download'), (async () => { await d.page.click('#btnMore'); await d.page.click('#exportIcs'); })()]);
  const icsPath = '/tmp/test.ics'; await dl.saveAs(icsPath);
  console.log('ics events:', (fs.readFileSync(icsPath, 'utf8').match(/BEGIN:VEVENT/g) || []).length);
  // SW
  const sw = await d.page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
  console.log('service worker registered:', sw);

  const m = await run('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }, 'http://localhost:8765/index.html');
  await m.page.click('.course:not(.inactive) >> nth=2');
  await m.page.waitForTimeout(200);
  await m.page.screenshot({ path: `${dir}/screenshots/mobile-detail.png` });
  await m.page.keyboard.press('Escape');
  await m.page.click('#btnImport'); await m.page.click('.tab[data-tab="tScript"]'); await m.page.waitForTimeout(200);
  await m.page.screenshot({ path: `${dir}/screenshots/mobile-import.png` });
  // file:// 也能用
  const f = await run('file-protocol', { viewport: { width: 390, height: 844 } }, 'file://' + dir + '/index.html');
  await f.ctx.close();
  require('fs').unlinkSync(`${dir}/screenshots/file-protocol.png`);
  // 模拟正方站点，测试一键导出脚本
  {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('dialog', d => { console.log('zf alert:', d.message().split('\n')[0]); d.accept(); });
    let posted = null;
    await page.route('http://jw.example.edu.cn/**', async (route) => {
      const u = route.request().url();
      if (u.includes('xskbcx_cxXsgrkb.html')) { posted = route.request().postData(); return route.fulfill({ contentType: 'application/json', body: json }); }
      return route.fulfill({ contentType: 'text/html', body: '<html><body>正方教务管理系统</body></html>' });
    });
    await page.goto('http://jw.example.edu.cn/jwglxt/xtgl/index_initMenu.html?jsdm=xs');
    const script = require(dir + '/js/zfscript.js').consoleScript('2026', '3');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(script)]);
    const out = '/tmp/zf_export.json'; await dl.saveAs(out);
    const parsed = require(dir + '/js/parsers.js').parseAuto(fs.readFileSync(out, 'utf8'));
    console.log('zf script: posted =', posted, '| file =', dl.suggestedFilename(), '| parsed courses =', parsed.courses.length);
    await ctx.close();
  }
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
