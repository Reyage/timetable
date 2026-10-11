# 课程表（离线网页 / PWA）

在线使用：https://reyage.github.io/timetable/ （Safari 分享 →「添加到主屏幕」即可像 App 一样离线使用）

## 导入正方教务课表
- **一键导入（推荐）**：在 App「导入 → 一键导入」复制书签代码，添加为 Safari 书签。登录学校正方教务后点这个书签，会自动识别学年学期、读取课表，并跳回 App 一键导入（数据经压缩放在网址 `#import=` 中，不经过任何服务器）。
- **复制粘贴**：在正方「学生课表查询」切换到「列表」显示，全选拷贝，粘贴到 App。也支持旧版正方课表页的文字。
- **高级**：导入课表接口 JSON（kbList）/ 课表页面 HTML / 备份文件；电脑控制台脚本。

数据只保存在本机浏览器（localStorage），可导出备份 JSON 和 .ics 日历。

## 测试
```
npm i jsdom@24 playwright-core        # 放在上级目录即可
node --test tests/parsers.test.js
python3 -m http.server 8765 & node tests/e2e.js   # 需要系统 Chrome（CHROME=路径）
```
