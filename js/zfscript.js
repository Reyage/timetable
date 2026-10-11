/* 生成在正方教务页面运行的导出脚本（控制台脚本 / 书签） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZfScript = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // 注意：此函数会被 toString() 后注入到正方页面执行，只能使用自身内部变量
  function payload(XNM, XQM) {
    (async function () {
      var m = location.pathname.match(/^(.*?)\/(xtgl|kbcx|xsxxxggl|cjcx|kwgl|xspjgl|xsxk|jxzxjhgl|design|xjyj|xsgrxx)\//i);
      var bases = [];
      if (m) bases.push(m[1]);
      bases.push('/jwglxt', '');
      var paths = ['/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151', '/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151'];
      var data = null, lastErr = '';
      outer: for (var i = 0; i < bases.length; i++) {
        for (var j = 0; j < paths.length; j++) {
          try {
            var r = await fetch(location.origin + bases[i] + paths[j], {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
              body: 'xnm=' + encodeURIComponent(XNM) + '&xqm=' + encodeURIComponent(XQM) + '&kzlx=ck&xsdm=&kclbdm='
            });
            var t = await r.text();
            var j2 = JSON.parse(t);
            if (j2 && Array.isArray(j2.kbList)) { data = j2; break outer; }
          } catch (e) { lastErr = String(e); }
        }
      }
      if (!data) { alert('获取课表失败：请确认已登录正方教务，并在教务系统的页面上运行。\n' + lastErr); return; }
      if (!data.kbList.length) { alert('该学期课表为空（' + XNM + ' 学年，xqm=' + XQM + '），请检查学年/学期'); return; }
      var out = JSON.stringify({ source: 'zfsoft', xnm: XNM, xqm: XQM, exportedAt: new Date().toISOString(), kbList: data.kbList, sjkList: data.sjkList || [] });
      try {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([out], { type: 'application/json' }));
        a.download = '正方课表_' + XNM + '_' + XQM + '.json';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) {}
      var copied = false;
      try { await navigator.clipboard.writeText(out); copied = true; } catch (e) {
        try { var ta = document.createElement('textarea'); ta.value = out; document.body.appendChild(ta); ta.select(); copied = document.execCommand('copy'); ta.remove(); } catch (e2) {}
      }
      alert('已获取 ' + data.kbList.length + ' 条课程记录。\n已下载 JSON 文件' + (copied ? '，并已复制到剪贴板' : '') + '。\n请回到课程表 App 导入。');
    })();
  }
  function consoleScript(xnm, xqm) {
    return '(' + payload.toString() + ')(' + JSON.stringify(String(xnm)) + ',' + JSON.stringify(String(xqm)) + ');';
  }
  function bookmarklet(xnm, xqm) {
    var code = consoleScript(xnm, xqm).replace(/\n\s*/g, ' ');
    return 'javascript:' + encodeURIComponent(code);
  }
  return { consoleScript: consoleScript, bookmarklet: bookmarklet, payload: payload };
});
