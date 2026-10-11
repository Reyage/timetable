/* 生成在正方教务页面运行的导入脚本（书签 / 控制台）。
 * 书签会：识别当前学年学期 → 读取课表 kbList → 精简压缩 → 跳转到课程表 App 的 #import=… */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZfScript = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DEFAULT_APP = 'https://reyage.github.io/timetable/';
  // 注意：此函数会被 toString() 后注入到正方页面执行，只能使用自身内部变量，且不能含 // 注释
  function payload(APP, FX, FQ) {
    (async function () {
      var T = '课程表导入：\n\n';
      if (location.href.indexOf(APP) === 0) { alert(T + '请先在 Safari 打开学校的正方教务系统并登录，然后在教务系统的页面上点这个书签。'); return; }
      var xnm = FX || '', xqm = FQ || '';
      if (!xnm) {
        var docs = [document];
        try { Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {} }); } catch (e) {}
        for (var d = 0; d < docs.length; d++) {
          var a = docs[d].getElementById('xnm'), b = docs[d].getElementById('xqm');
          if (a && b && a.value && b.value) { xnm = a.value; xqm = b.value; break; }
        }
      }
      if (!xnm) {
        var now = new Date(), mo = now.getMonth(), y = now.getFullYear();
        if (mo >= 7) { xnm = y; xqm = 3; } else if (mo === 0) { xnm = y - 1; xqm = 3; } else { xnm = y - 1; xqm = 12; }
      }
      xnm = String(xnm); xqm = String(xqm);
      var term = xnm + '-' + (+xnm + 1) + ' 学年' + ({ '3': '第一学期', '12': '第二学期', '16': '第三学期' }[xqm] || '学期 ' + xqm);
      var m = location.pathname.match(/^(.*?)\/(xtgl|kbcx|xsxxxggl|cjcx|kwgl|xspjgl|xsxk|jxzxjhgl|design|xjyj|xsgrxx|zftal-ui)\//i);
      var bases = [];
      if (m) bases.push(m[1]);
      if (bases.indexOf('/jwglxt') < 0) bases.push('/jwglxt');
      if (bases.indexOf('') < 0) bases.push('');
      var paths = ['/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151', '/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151'];
      var data = null, login = false;
      outer: for (var i = 0; i < bases.length; i++) {
        for (var j = 0; j < paths.length; j++) {
          try {
            var r = await fetch(location.origin + bases[i] + paths[j], {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
              body: 'xnm=' + encodeURIComponent(xnm) + '&xqm=' + encodeURIComponent(xqm) + '&kzlx=ck&xsdm=&kclbdm='
            });
            var t = await r.text();
            if (/登录|login|yhm|用户名/i.test(t) && t.trim().charAt(0) !== '{') login = true;
            var js = JSON.parse(t);
            if (js && Array.isArray(js.kbList)) { data = js; break outer; }
          } catch (e) {}
        }
      }
      if (!data) {
        alert(T + (login ? '还没有登录，或者登录已过期。\n请先登录正方教务系统，然后在教务系统的页面上再点一次这个书签。'
          : '没能读取到课表。\n请确认当前打开的是学校的「正方教务系统」网页（并且已经登录），再点一次这个书签。'));
        return;
      }
      if (!data.kbList.length) {
        alert(T + term + '的课表是空的。\n\n如果要导入其他学期：在教务系统打开「学生课表查询」，选好学年和学期，然后在那个页面再点一次书签。');
        return;
      }
      var c = { v: 1, x: xnm, q: xqm, k: data.kbList.map(function (k) { return [k.kcmc || '', k.xm || '', k.cdmc || '', k.xqj || '', k.jcs || k.jc || '', k.zcd || '', k.xqmc || '']; }),
        o: (data.sjkList || []).map(function (x) { return x.qtkcgs || x.kcmc || ''; }).filter(Boolean) };
      var raw = new TextEncoder().encode(JSON.stringify(c));
      var b64 = function (u8) { var s = ''; for (var n = 0; n < u8.length; n += 32768) s += String.fromCharCode.apply(null, u8.subarray(n, n + 32768)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
      var enc = 'j' + b64(raw);
      try {
        if (typeof CompressionStream === 'function') {
          var z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
          enc = 'z' + b64(z);
        }
      } catch (e) {}
      var names = {};
      data.kbList.forEach(function (k) { if (k.xqj) names[k.kcmc] = 1; });
      var n = Object.keys(names).length;
      if (!confirm('已读取 ' + term + ' 的课表：' + n + ' 门课程。\n\n点「好」打开课程表完成导入。')) return;
      var url = APP + '#import=' + enc;
      if (url.length < 60000) { location.href = url; return; }
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
      var btn = document.createElement('button');
      btn.textContent = '点这里打开课程表并导入';
      btn.style.cssText = 'font-size:20px;padding:18px 28px;border-radius:14px;border:0;background:#4f6bed;color:#fff';
      box.appendChild(btn); document.body.appendChild(box);
      btn.onclick = function () {
        var w = window.open(APP + '#listen'), origin = new URL(APP).origin, done = false, tries = 0;
        var timer = setInterval(function () { if (done || ++tries > 60) { clearInterval(timer); return; } try { w.postMessage({ type: 'tt-import', data: c }, origin); } catch (e) {} }, 500);
        window.addEventListener('message', function (ev) { if (ev.origin === origin && ev.data && ev.data.type === 'tt-ack') { done = true; box.remove(); } });
      };
    })();
  }
  function minify(src) { return src.replace(/\n\s*/g, ' '); }
  /** 控制台脚本（xnm/xqm 留空则自动识别） */
  function consoleScript(appUrl, xnm, xqm) {
    return minify('(' + payload.toString() + ')(' + JSON.stringify(appUrl || DEFAULT_APP) + ',' + JSON.stringify(xnm ? String(xnm) : '') + ',' + JSON.stringify(xqm ? String(xqm) : '') + ');');
  }
  /** 书签网址 */
  function bookmarklet(appUrl, xnm, xqm) {
    return 'javascript:' + encodeURIComponent(consoleScript(appUrl, xnm, xqm));
  }
  return { consoleScript: consoleScript, bookmarklet: bookmarklet, payload: payload, DEFAULT_APP: DEFAULT_APP };
});
