# 课程表（离线网页 / PWA）

直接双击 `index.html` 即可使用；放到任意静态服务器（https）上，手机浏览器打开后「添加到主屏幕」即为 PWA，可离线使用。

- 导入：正方新版课表接口 JSON（kbList）、旧版 xskbcx.aspx 课表 HTML、新版课表页 HTML、或用 App 内「一键脚本 / 书签」在已登录的正方页面导出 JSON。
- 数据保存在浏览器 localStorage；可导出备份 JSON、导出 .ics 日历。

测试：`npm i jsdom@24 playwright-core`（在上级目录），`node --test tests/parsers.test.js`
