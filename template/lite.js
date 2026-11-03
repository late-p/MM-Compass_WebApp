(function () {
  'use strict';
  var SCHEMA = 1, AUTO_MIN = 5, POLL_MIN = 15;
  var D = null, META = null, WEEKS = null;
  var curLabel = 'latest', lastCheck = 0, offline = false;
  var tab = 0, sortMode = 'base', trendSel = 'all', trendMonth = null, idleAll = false, hrAll = false;
  var LS = 'mmc:' + location.pathname;

  /* ---------- 유틸 ---------- */
  function $(s, e) { return (e || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(v, k) { return (v == null || isNaN(v)) ? '–' : (+v).toFixed(k == null ? 1 : k); }
  function sg(d) { return d > 0.004 ? 'up' : d < -0.004 ? 'dn' : 'fl'; }
  function chip(d, unit, k) {
    if (d == null || isNaN(d)) return '';
    var c = sg(d), a = c === 'up' ? '▲' : c === 'dn' ? '▼' : '–';
    return '<span class="chip ' + c + '">' + a + ' ' + Math.abs(d).toFixed(k == null ? 2 : k) + (unit || '') + '</span>';
  }
  function T() { return (D && D.target) || 80; }
  function st(g) { return g >= T() ? 'ok' : g >= T() - 10 ? 'mid' : 'lo'; }
  function cshort(c) { c = String(c || ''); var s = D && D.strip; return s && c.indexOf(s) === 0 && c.length > s.length ? c.slice(s.length) : c; }
  function cleanName(s) { return String(s || '').replace(/\s*\(사업부 소속\)/, ' 직속'); }
  function byId(id) { for (var i = 0; i < D.nodes.length; i++) if (D.nodes[i].id === id) return D.nodes[i]; return null; }
  function dd(a, b) { return (a == null || b == null) ? null : a - b; }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }
  function hhmm(ts) { var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  /* ---------- 데이터 로딩 / 갱신 ---------- */
  function fetchJson(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var fromCache = r.headers.get('x-mmc-cache') === '1';
      return r.json().then(function (j) { if (j && fromCache) j.__cache = true; return j; });
    }).then(function (j) { if (!j || !j.schema) throw new Error('empty'); return j; });
  }
  function readCache() { try { var s = localStorage.getItem(LS); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function writeCache(p) { try { localStorage.setItem(LS, JSON.stringify(p)); } catch (e) { } }

  function apply(p, opts) {
    opts = opts || {};
    if (p.schema > SCHEMA) {
      toast('앱 업데이트가 필요합니다. 잠시 후 다시 열어 주세요');
      if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update(); });
      return false;
    }
    var changed = !META || META.rev !== p.rev || META.week.label !== p.week.label;
    META = p; D = p.d; offline = !!opts.offline;
    if (changed || opts.force) render();
    else renderTop();
    return changed;
  }

  // 최신 확인. manual=true 면 결과를 토스트로 알림
  function refresh(manual) {
    var btn = $('#top .rf'), ptr = $('#ptr');
    if (btn) btn.classList.add('spin'); if (ptr) ptr.classList.add('spin');
    var wasLabel = META && META.week.label, wasRev = META && META.rev;
    return fetchJson('data/latest.json').then(function (p) {
      if (p.__cache) throw new Error('offline');  // 서비스워커가 저장본을 돌려준 것 = 실제로는 연결 안 됨
      lastCheck = Date.now(); curLabel = 'latest';
      writeCache(p);
      var changed = apply(p, { force: curLabel === 'latest' && META && META.week.label !== p.week.label });
      loadWeeks();
      if (manual) toast(changed && wasRev ? (wasLabel !== p.week.label ? p.week.title + ' 데이터로 갱신했어요' : '새 데이터로 갱신했어요') : '이미 최신입니다 · ' + hhmm(Date.now()));
      else if (changed && wasRev) toast('새 데이터로 갱신했어요');
    }).catch(function () {
      if (manual) toast(D ? '연결할 수 없어요 · 저장된 데이터(기준 ' + D.asof + ')를 보여드려요' : '데이터를 불러오지 못했어요');
      if (D) { offline = true; renderTop(); }
      else { var c = readCache(); if (c && c.schema <= SCHEMA) apply(c, { force: true, offline: true }); else showError(); }
    }).then(function () {
      if (btn) btn.classList.remove('spin'); if (ptr) ptr.classList.remove('spin');
      if (navigator.serviceWorker && manual) navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update().catch(function () { }); });
    });
  }
  function loadWeeks() {
    fetchJson('data/weeks.json').then(function (w) { WEEKS = w; }).catch(function () { });
  }
  function openWeek(label) {
    closeSheet();
    if (label === 'latest' || (WEEKS && label === WEEKS.latest)) { curLabel = 'latest'; refresh(true); return; }
    fetchJson('data/' + label + '.json').then(function (p) {
      curLabel = label; apply(p, { force: true }); window.scrollTo(0, 0);
    }).catch(function () { toast('해당 주차를 불러오지 못했어요'); });
  }
  function showError() {
    $('#main').innerHTML = '<div class="err"><b>데이터를 불러오지 못했어요</b>네트워크 연결을 확인한 뒤 다시 시도해 주세요.<br><button id="retry">다시 시도</button></div>';
    var b = $('#retry'); if (b) b.onclick = function () { refresh(true); };
  }

  /* ---------- 공통 조각 ---------- */
  var ICON = {
    home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    org: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    trend: '<path d="M3 17l5-6 4 3 8-9"/><path d="M15 5h5v5"/>',
    idle: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    hr: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 010 5.6M18 14.3c2 .8 3.5 2.8 3.5 5.7"/>'
  };
  var TABS = [['home', '요약'], ['org', '조직'], ['trend', '추이'], ['idle', '대기'], ['hr', '인사']];
  var CAR = '<svg class="car" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>';

  function buildTabs() {
    var nav = $('#tabs'); nav.innerHTML = '';
    TABS.forEach(function (t, i) {
      var b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[t[0]] + '</svg><span>' + t[1] + '</span>';
      b.onclick = function () { go(i); };
      nav.appendChild(b);
    });
  }
  function go(i, quiet) {
    tab = Math.max(0, Math.min(TABS.length - 1, i));
    [].forEach.call(document.querySelectorAll('.pg'), function (p, k) { p.classList.toggle('on', k === tab); });
    [].forEach.call(document.querySelectorAll('#tabs button'), function (b, k) { if (k === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (!quiet) { window.scrollTo(0, 0); try { history.replaceState(null, '', '#s' + (tab + 1)); } catch (e) { } }
  }

  function renderTop() {
    if (!META) return;
    var h = $('#top');
    var stale = offline ? '<span class="stale">오프라인</span>' : '';
    h.innerHTML = '<img class="lg" src="icon-192.png" alt="">' +
      '<div class="tt" id="wk"><div class="t1">' + esc(D.week) + '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 4l4 4 4-4"/></svg></div>' +
      '<div class="t2">MM-Compass · 기준 ' + esc(D.asof) + (D.meet ? ' · ' + esc(D.meet) : '') + stale + '</div></div>' +
      '<button class="rf" id="rf" type="button" aria-label="최신 데이터로 새로고침"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v5h-5"/></svg></button>';
    $('#rf').onclick = function () { refresh(true); };
    $('#wk').onclick = openSheet;
  }
  function openSheet() {
    var sh = $('#sheet'); if (!WEEKS) { toast('주차 목록을 불러오는 중이에요'); loadWeeks(); return; }
    var cur = META.week.label;
    sh.innerHTML = '<div class="sh"><h3>주차 선택</h3>' + WEEKS.weeks.map(function (w) {
      return '<button class="wi' + (w.label === cur ? ' on' : '') + '" data-l="' + esc(w.label) + '"><span><b>' + esc(w.title) + '</b><br><small>기준 ' + esc(w.asof) + ' · ' + esc(w.meet) + '</small></span>' + (w.label === WEEKS.latest ? '<em>최신</em>' : '') + '</button>';
    }).join('') + '</div>';
    sh.hidden = false;
    sh.onclick = function (e) { if (e.target === sh) closeSheet(); };
    [].forEach.call(sh.querySelectorAll('.wi'), function (b) { b.onclick = function () { openWeek(b.getAttribute('data-l')); }; });
  }
  function closeSheet() { var s = $('#sheet'); s.hidden = true; s.innerHTML = ''; }

  /* ---------- 1 요약 ---------- */
  // 포털 나침반(gauge.py) 이식: 반원 3색 구간 + 바늘 + 큰 숫자. 눈금 60~100, 구간 경계 = (목표-10), 목표
  var GC = '#C77B2B', UC = '#2A5A9B', ZC = ['#F0A39A', '#F6D77A', '#8FD8AE'];
  function gth(v) { v = Math.min(Math.max(v, 60), 100); return (180 - (v - 60) / 40 * 180) * Math.PI / 180; }
  function gp(cx, cy, r, th) { return [cx + r * Math.cos(th), cy - r * Math.sin(th)]; }
  function dial(cx, cy, R, v, col, mini) {
    var o = '', e = [60, T() - 10, T(), 100], k, a, b, pa, pb;
    for (k = 0; k < 3; k++) {
      pa = gp(cx, cy, R, gth(e[k])); pb = gp(cx, cy, R, gth(e[k + 1]));
      o += '<path d="M' + pa[0].toFixed(1) + ',' + pa[1].toFixed(1) + ' A' + R + ',' + R + ' 0 0 1 ' + pb[0].toFixed(1) + ',' + pb[1].toFixed(1) + '" fill="none" stroke="' + ZC[k] + '" stroke-width="18"/>';
    }
    if (!mini) e.forEach(function (sv, i) {
      var lx, ly; if (i === 0 || i === 3) { lx = gp(cx, cy, R, gth(sv))[0]; ly = cy + 22; } else { var q = gp(cx, cy, R + 22, gth(sv)); lx = q[0]; ly = q[1] + 5; }
      o += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" font-size="14" font-weight="600" fill="#7B8AA0" text-anchor="middle">' + (+sv) + '</text>';
    });
    var th = gth(v), tp = gp(cx, cy, R - 1, th), b1 = gp(cx, cy, 9, th + Math.PI / 2), b2 = gp(cx, cy, 9, th - Math.PI / 2);
    o += '<polygon points="' + tp[0].toFixed(1) + ',' + tp[1].toFixed(1) + ' ' + b1[0].toFixed(1) + ',' + b1[1].toFixed(1) + ' ' + b2[0].toFixed(1) + ',' + b2[1].toFixed(1) + '" fill="' + col + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="' + col + '"/><circle cx="' + cx + '" cy="' + cy + '" r="3.4" fill="#fff"/>';
    if (v < 60) { col = '#C0392B'; o += '<text x="' + cx + '" y="' + (cy - 30) + '" font-size="14" font-weight="700" fill="#C0392B" text-anchor="middle">60% 미만</text>'; }
    o += '<text x="' + cx + '" y="' + (cy + 46) + '" font-size="40" font-weight="800" fill="' + col + '" text-anchor="middle">' + v.toFixed(2) + '<tspan font-size="20" font-weight="700">%</tspan></text>';
    return o;
  }
  function gaugePair(g, u) {   // 왼쪽 = 가득률, 오른쪽 = 가동률 (포털과 같은 배치)
    return '<svg class="gp" viewBox="10 -14 440 188" role="img" aria-label="가득률 ' + n(g, 2) + '%, 가동률 ' + n(u, 2) + '%">' + dial(120, 118, 92, g, GC) + dial(340, 118, 92, u, UC) + '</svg>';
  }
  function gstat(lab, col, x) {
    return '<div class="gs"><div class="l" style="color:' + col + '">' + lab + '</div>' + chip(x.d, '%p') + '<div class="pv">' + esc(x.label) + ' ' + n(x.prev, 2) + '</div></div>';
  }
  function p1() {
    var a = D.all, k = D.kpi || {}, nk = null, i;
    for (var key in k) if (key.indexOf('비매출') >= 0) nk = k[key];
    var idle = k['대기 MM'], inp = k['투입 MM'];
    var h = (D.demo ? '<div class="demo">가상의 샘플 데이터로 만든 <b>체험용 화면</b>입니다. 실제 회사 데이터가 아니에요.</div>' : '') + '<h2>전사 MM 나침반 · ' + esc(a.g.label) + ' 대비</h2><div class="card gcard">' + gaugePair(a.g.v, a.u.v) +
      '<div class="gst">' + gstat('가득률', GC, a.g) + gstat('가동률', UC, a.u) + '</div></div>';
    h += '<div class="tiles">';
    h += '<div class="tile"><div class="l">대기 MM</div><div class="v">' + (idle ? n(idle.v, 1) : '–') + '<small> MM</small></div><div class="s">' + (idle ? chip(idle.d, '', 2) : '') + '</div></div>';
    h += '<div class="tile"><div class="l">투입 / 가동대상</div><div class="v">' + (inp ? n(inp.v, 0) : '–') + '<small> / ' + n(D.T, 0) + '</small></div><div class="s">' + (inp ? chip(inp.d, '', 1) : '') + '</div></div>';
    h += '<div class="tile"><div class="l">가득률 (비매출 모수 제외)</div><div class="v">' + (nk ? n(nk.v, 1) : '–') + '<small>%</small></div><div class="s">' + (nk ? chip(nk.d, '%p', 2) : '') + '</div></div>';
    h += '</div>';
    h += '<h2>법인별</h2><div class="card">' + D.corps.map(function (c) {
      return '<div class="corp"><b>' + esc(c.name) + '</b><span class="muted" style="font-size:12.5px">대기 ' + n(c.idle, 1) + 'MM</span>' +
        '<div class="sub"><span class="g"><b>' + n(c.g.v, 2) + '%</b>' + chip(c.g.d, '%p') + '</span><span class="u"><b>' + n(c.u.v, 2) + '%</b>' + chip(c.u.d, '%p') + '</span></div></div>';
    }).join('') + '</div>';
    // 눈에 띄는 변화: 본부·사업부 카드 중 가득률 증감 큰 곳
    var cs = [];
    (D.cards || []).forEach(function (id) {
      var x = byId(id); if (!x || x.g == null || x.pg == null) return;
      cs.push({ x: x, d: x.g - x.pg });
    });
    cs.sort(function (p, q) { return p.d - q.d; });
    var falls = cs.filter(function (c) { return c.d < -0.004; }).slice(0, 2);
    var rises = cs.filter(function (c) { return c.d > 0.004; }).reverse().slice(0, 2);
    var rows = falls.concat(rises);
    h += '<h2>눈에 띄는 변화 · 가득률 (' + esc(a.g.label) + ' 대비)</h2><div class="card">';
    h += rows.length ? rows.map(function (c) {
      var x = c.x;
      return '<div class="chg"><div class="n"><b>' + esc(cleanName(x.name)) + '</b><em>' + esc(cshort(x.cn)) + ' · 대기 ' + n(x.idle, 1) + 'MM</em></div><div class="r"><b style="color:var(--brown)">' + n(x.g, 1) + '%</b>' + chip(c.d, '%p') + '</div></div>';
    }).join('') : '<div class="empty">비교할 변화가 없어요</div>';
    h += '</div>';
    return h;
  }

  /* ---------- 2 조직 ---------- */
  function spark(g, u, cm, w, h) {
    var W = w || 300, H = h || 64, L = 6, R = 6, Tp = 6, B = 6, vals = g.concat(u).filter(function (v) { return v != null; });
    if (!vals.length) return '';
    var lo = Math.min.apply(0, vals), hi = Math.max.apply(0, vals); if (hi - lo < 8) { lo -= 4; hi += 4; }
    function X(i) { return L + (W - L - R) * i / 11; }
    function Y(v) { return Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo)); }
    function path(a, col) {
      var s = '', d = '';
      for (var i = 0; i < a.length; i++) {
        if (a[i] == null) continue;
        var seg = (i <= cm) ? 's' : 'd';
        d += (d ? ' L' : 'M') + X(i).toFixed(1) + ',' + Y(a[i]).toFixed(1);
        if (i === cm) { s += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linejoin="round"/>'; d = 'M' + X(i).toFixed(1) + ',' + Y(a[i]).toFixed(1); }
      }
      if (cm >= a.length - 1) return s || '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.2"/>';
      return s + '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-dasharray="3 3"/>';
    }
    var dot = function (a, col) { return a[cm] != null ? '<circle cx="' + X(cm).toFixed(1) + '" cy="' + Y(a[cm]).toFixed(1) + '" r="3.6" fill="' + col + '"/>' : ''; };
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="월별 추이">' + path(u, '#2A5A9B') + path(g, '#B8691A') + dot(u, '#2A5A9B') + dot(g, '#B8691A') + '</svg>';
  }
  function sortKids(arr) {
    var a = arr.slice();
    if (sortMode === 'low') a.sort(function (p, q) { return (p.g == null ? 999 : p.g) - (q.g == null ? 999 : q.g); });
    else if (sortMode === 'idle') a.sort(function (p, q) { return (q.idle || 0) - (p.idle || 0); });
    return a;
  }
  function teamRows(div) {
    var ts = D.nodes.filter(function (t) { return t.tm === 1 && t.dv === div.id; });
    ts = sortKids(ts);
    return ts.map(function (t) {
      return '<div class="sr"><div class="nm"><span>' + esc(cleanName(t.name)) + '</span></div><div class="pc g">' + n(t.g, 1) + '%</div><div class="pc u">' + n(t.u, 1) + '%</div><div class="ix">대기 ' + n(t.idle, 1) + 'MM · 가동대상 ' + n(t.T, 1) + 'MM</div></div>';
    }).join('');
  }
  function divRows(hq) {
    var ds = D.nodes.filter(function (x) { return x.tm === 0 && x.id.indexOf(hq.id + '#') === 0; });
    ds = sortKids(ds);
    return ds.map(function (c) {
      var teams = D.nodes.some(function (t) { return t.tm === 1 && t.dv === c.id; });
      var core = '<div class="nm"><span>' + esc(cleanName(c.name)) + '</span></div><div class="pc g">' + n(c.g, 1) + '%</div><div class="pc u">' + n(c.u, 1) + '%</div><div class="ix">대기 ' + n(c.idle, 1) + 'MM ' + chip(dd(c.g, c.pg), '%p') + '</div>';
      if (!teams) return '<div class="sr" style="padding-left:0">' + core + '</div>';
      return '<details class="s"><summary>' + core + '</summary><div class="teams">' + teamRows(c) + '</div></details>';
    }).join('');
  }
  function hqRow(x) {
    var d = dd(x.g, x.pg);
    return '<details class="o"><summary><div class="on1">' + CAR + '<b>' + esc(cleanName(x.name)) + '</b></div>' +
      '<div class="sp2">' + spark(x.mg || [], x.mu || [], D.cm == null ? 10 : D.cm, 120, 64) + '</div>' +
      '<div class="m1"><span class="gn">' + n(x.g, 1) + '<small>%</small></span>' + chip(d, '%p') + '</div>' +
      '<div class="m2"><span class="u">가동 <b>' + n(x.u, 1) + '%</b></span><span>대기 <b>' + n(x.idle, 1) + '</b>MM</span></div></summary>' +
      '<div class="ob"><div class="sr hd"><span></span><span class="pc g">가득률</span><span class="pc u">가동률</span></div>' + divRows(x) + '</div></details>';
  }
  function p2() {
    var tops = D.nodes.filter(function (x) { return x.id.indexOf('#') < 0; });
    var corps = []; tops.forEach(function (x) { if (corps.indexOf(x.cn) < 0) corps.push(x.cn); });
    var h = '<div class="seg" id="sortseg">' + [['base', '기본'], ['low', '가득률 낮은순'], ['idle', '대기 많은순']].map(function (s) {
      return '<button data-m="' + s[0] + '" class="' + (sortMode === s[0] ? 'on' : '') + '">' + s[1] + '</button>';
    }).join('') + '</div>';
    corps.forEach(function (c) {
      var hs = sortKids(tops.filter(function (x) { return x.cn === c; }));
      var cc = null; D.corps.forEach(function (k) { if (k.name === c) cc = k; });
      h += '<div class="cg">' + esc(c) + (cc ? '<small>가득 ' + n(cc.g.v, 1) + '% · 가동 ' + n(cc.u.v, 1) + '%</small>' : '') + '</div>';
      h += hs.map(hqRow).join('');
    });
    h += '<p class="foot">본부를 누르면 사업부 → 팀 순으로 펼쳐져요</p>';
    return h;
  }

  /* ---------- 3 추이 ---------- */
  function trendSeries() {
    var cm = D.cm == null ? 10 : D.cm;
    if (trendSel === 'all') {
      return { g: D.trend.map(function (t) { return t.g; }), u: D.trend.map(function (t) { return t.u; }), t: D.trend.map(function (t) { return t.t; }),
        idle: D.trend.map(function (t) { return t.idle; }), kind: D.trend.map(function (t) { return t.k; }), cm: cm, full: true };
    }
    var x = byId(trendSel) || {};
    var g = x.mg || [], kind = g.map(function (_, i) { return i < cm ? '실적' : i === cm ? '당월' : '예상'; });
    return { g: g, u: x.mu || [], kind: kind, cm: cm };
  }
  function chart(S, sel) {
    var W = 340, H = 210, L = 34, R = 12, Tp = 12, B = 26, N = S.g.length;
    var vals = S.g.concat(S.u).filter(function (v) { return v != null; });
    var lo = Math.floor((Math.min.apply(0, vals) - 3) / 5) * 5, hi = Math.ceil((Math.max.apply(0, vals) + 2) / 5) * 5;
    if (hi > 100) hi = 100; if (lo < 0) lo = 0; if (hi - lo < 15) lo = Math.max(0, hi - 15);
    function X(i) { return L + (W - L - R) * i / (N - 1); }
    function Y(v) { return Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo)); }
    var s = '<svg id="cv" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="월별 가득률·가동률 추이">';
    if (sel != null) s += '<rect x="' + (X(sel) - (W - L - R) / (N - 1) / 2).toFixed(1) + '" y="' + Tp + '" width="' + ((W - L - R) / (N - 1)).toFixed(1) + '" height="' + (H - Tp - B) + '" fill="#E9F0FA" rx="4"/>';
    for (var v = lo; v <= hi; v += 5) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="#E3E8EF" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="#8A94A4">' + v + '</text>';
    var t = T(); if (t > lo && t < hi) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" stroke="#1F2937" stroke-width="1" stroke-dasharray="4 3" opacity=".45"/><text x="' + (W - R) + '" y="' + (Y(t) - 4).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#6B7280">목표 ' + t + '</text>';
    for (var i = 0; i < N; i++) s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="' + (i === sel ? '#0F2942' : '#8A94A4') + '" font-weight="' + (i === sel ? 800 : 500) + '">' + (i + 1) + '</text>';
    function line(a, col) {
      var solid = '', dash = '', i;
      for (i = 0; i < N; i++) { if (a[i] == null) continue; var p = X(i).toFixed(1) + ',' + Y(a[i]).toFixed(1); if (i <= S.cm) solid += (solid ? ' L' : 'M') + p; if (i >= S.cm) dash += (dash ? ' L' : 'M') + p; }
      return (solid ? '<path d="' + solid + '" fill="none" stroke="' + col + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>' : '') +
        (dash && S.cm < N - 1 ? '<path d="' + dash + '" fill="none" stroke="' + col + '" stroke-width="2.6" stroke-dasharray="4 4" stroke-linecap="round"/>' : '');
    }
    s += line(S.u, '#2A5A9B') + line(S.g, '#B8691A');
    function dots(a, col) {
      var o = '';
      for (var i = 0; i < N; i++) if (a[i] != null) o += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(a[i]).toFixed(1) + '" r="' + (i === sel ? 5 : 2.6) + '" fill="' + (i > S.cm ? '#fff' : col) + '" stroke="' + col + '" stroke-width="' + (i > S.cm ? 1.6 : 0) + '"/>';
      return o;
    }
    s += dots(S.u, '#2A5A9B') + dots(S.g, '#B8691A');
    if (sel != null) {
      var ga = S.g[sel], ua = S.u[sel];
      if (ga != null && ua != null) {
        var up = ua >= ga; // 위 점 위쪽, 아래 점 아래쪽에 라벨
        var anch = sel > N - 3 ? 'end' : sel < 1 ? 'start' : 'middle', dx = sel > N - 3 ? -6 : sel < 1 ? 6 : 0;
        s += '<text x="' + (X(sel) + dx).toFixed(1) + '" y="' + (Y(up ? ua : ga) - 9).toFixed(1) + '" text-anchor="' + anch + '" font-size="11.5" font-weight="800" fill="' + (up ? '#2A5A9B' : '#B8691A') + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + n(up ? ua : ga, 1) + '</text>' +
          '<text x="' + (X(sel) + dx).toFixed(1) + '" y="' + (Y(up ? ga : ua) + 17).toFixed(1) + '" text-anchor="' + anch + '" font-size="11.5" font-weight="800" fill="' + (up ? '#B8691A' : '#2A5A9B') + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + n(up ? ga : ua, 1) + '</text>';
      }
    }
    return s + '</svg>';
  }
  function yearHtml() {
    if (!D.year) return '';
    return '<h2>연간 추정 · 전사 (실적 + 예상)</h2><div class="card gcard">' + gaugePair(D.year.g, D.year.u) +
      '<div class="gst"><div class="gs"><div class="l" style="color:' + GC + '">가득률</div></div><div class="gs"><div class="l" style="color:' + UC + '">가동률</div></div></div>' +
      (D.year.gn != null ? '<div class="kv" style="margin-top:10px"><span>가득률 (비매출 모수 제외)</span><b>' + n(D.year.gn, 2) + '%</b></div>' : '') + '</div>';
  }
  function p3() {
    var h = yearHtml() + '<h2>월별 추이</h2><select class="sel" id="tsel" aria-label="조직 선택"><option value="all">전사</option>';
    D.nodes.filter(function (x) { return x.id.indexOf('#') < 0; }).forEach(function (x) {
      h += '<option value="' + esc(x.id) + '"' + (trendSel === x.id ? ' selected' : '') + '>' + esc(cshort(x.cn)) + ' · ' + esc(cleanName(x.name)) + '</option>';
    });
    h += '</select><div class="card ch"><div class="lgd"><span class="g"><i style="background:var(--brown)"></i>가득률</span><span class="u"><i style="background:var(--steel)"></i>가동률</span></div><div id="chart"></div></div>';
    h += '<div id="tdet"></div>';
    return h;
  }
  function drawTrend() {
    var S = trendSeries(), N = S.g.length;
    if (!S.g.length) { $('#chart').innerHTML = '<div class="empty">추이 데이터가 없어요</div>'; $('#tdet').innerHTML = ''; return; }
    if (trendMonth == null || trendMonth >= N || S.g[trendMonth] == null) trendMonth = Math.min(S.cm, N - 1);
    $('#chart').innerHTML = chart(S, trendMonth);
    var m = trendMonth, pm = m > 0 ? m - 1 : null;
    var kd = S.kind[m] || '';
    var det = '<div class="det"><div class="c g"><div class="l">가득률 · ' + (m + 1) + '월<span class="kind ' + (kd === '당월' ? 'cur' : kd === '예상' ? 'est' : '') + '">' + kd + '</span></div><div class="v">' + n(S.g[m], 2) + '<small style="font-size:14px">%</small></div>' + (pm != null ? chip(dd(S.g[m], S.g[pm]), '%p') + ' <span class="muted" style="font-size:11px">전월</span>' : '') + '</div>' +
      '<div class="c u"><div class="l">가동률 · ' + (m + 1) + '월</div><div class="v">' + n(S.u[m], 2) + '<small style="font-size:14px">%</small></div>' + (pm != null ? chip(dd(S.u[m], S.u[pm]), '%p') + ' <span class="muted" style="font-size:11px">전월</span>' : '') + '</div></div>';
    if (S.full) {
      det += '<div class="card" style="margin-top:10px"><div class="kv"><span>가동대상</span><b>' + n(S.t[m], 1) + ' MM ' + (pm != null ? chip(dd(S.t[m], S.t[pm]), '', 1) : '') + '</b></div><div class="kv"><span>대기</span><b>' + n(S.idle[m], 1) + ' MM ' + (pm != null ? chip(dd(S.idle[m], S.idle[pm]), '', 1) : '') + '</b></div></div>';
    }
    $('#tdet').innerHTML = det;
    var cv = $('#cv');
    if (cv) {
      var pick = function (e) {
        var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 340, i = Math.round((x - 34) / ((340 - 34 - 12) / (N - 1)));
        i = Math.max(0, Math.min(N - 1, i)); if (S.g[i] != null && i !== trendMonth) { trendMonth = i; drawTrend(); }
      };
      cv.onpointerdown = pick; cv.onpointermove = function (e) { if (e.buttons || e.pointerType === 'touch') pick(e); };
    }
  }

  /* ---------- 4 대기 ---------- */
  function p4() {
    var k = (D.kpi || {})['대기 MM'] || {}, tot = k.v, cs = D.corps;
    var sum = cs.reduce(function (a, c) { return a + c.idle; }, 0) || 1;
    var h = '<h2>전사 대기 · ' + esc(D.all.g.label) + ' 대비</h2><div class="card"><div class="big">' + n(tot, 1) + '<small> MM</small></div><div style="margin-top:4px">' + chip(k.d, ' MM', 2) + ' <span class="muted" style="font-size:12.5px">' + esc(k.label || '') + ' ' + n(k.prev, 1) + ' · 대기율 ' + n(D.T ? tot / D.T * 100 : null, 1) + '%</span></div>';
    h += '<div class="split">' + cs.map(function (c) { return '<i style="width:' + (c.idle / sum * 100).toFixed(1) + '%"></i>'; }).join('') + '</div>';
    h += '<div class="lg2">' + cs.map(function (c, i) { return '<span><i style="background:' + (i ? '#7FA8DA' : 'var(--steel)') + '"></i>' + esc(cshort(c.name)) + ' <b>' + n(c.idle, 1) + '</b>MM</span>'; }).join('') + '</div></div>';
    var I = D.idle || { divs: [], prev: '' };
    var us = I.divs.filter(function (x) { return (x.mm || 0) > 0; }).sort(function (p, q) { return q.mm - p.mm; });
    var N0 = 3, show = idleAll ? us : us.slice(0, N0);
    h += '<h2>대기 많은 조직 TOP ' + (idleAll ? us.length : Math.min(N0, us.length)) + ' · ' + esc(I.prev || '전월') + ' 대비 (누르면 팀·인원)</h2><div class="card" style="padding-top:6px;padding-bottom:6px">';
    h += show.length ? show.map(idleRow).join('') : '<div class="empty">대기 인력이 없어요</div>';
    h += '</div>' + (us.length > N0 ? '<button class="more" id="idlemore">' + (idleAll ? '상위 ' + N0 + '개만 보기' : '전체 ' + us.length + '개 보기') + '</button>' : '');
    h += '<p class="foot">대기 인원은 이름과 MM만 보여줘요 · 투입 프로젝트 등 상세는 PC 포털 회의용 화면에서 확인하세요</p>';
    return h;
  }
  function idleRow(x, i) {
    var mis = false, body = x.teams.map(function (t) {
      var bad = Math.abs(t.diff || 0) > 0.05; if (bad) mis = true;
      return '<div class="tm"><b>' + esc(cleanName(t.team)) + '</b><span>' + n(t.mm, 2) + ' MM' + (bad ? ' *' : '') + '</span></div>' +
        (t.people.length ? t.people.map(function (p) { return '<div class="pp"><span>' + esc(p.n) + '</span><b>' + n(p.mm, 2) + '</b></div>'; }).join('') : '<div class="pp"><span class="muted">대기 인원 없음</span></div>');
    }).join('');
    return '<details class="rk2"><summary class="rk"><div class="no' + (i < 3 ? ' t' : '') + '">' + (i + 1) + '</div><div class="n"><b>' + esc(cleanName(x.div)) + '</b><em>' + esc(cshort(x.corp)) + (x.hq ? ' · ' + esc(x.hq) : '') + '</em></div>' +
      '<div class="v">' + n(x.mm, 2) + '<small> MM</small><div style="margin-top:2px">' + chip(dd(x.mm, x.prev), '', 1) + '</div></div></summary>' +
      '<div class="rb">' + body + (mis ? '<div class="nt">* 팀 합계는 조직 단위 계산값이라 개인 값의 합과 다를 수 있어요</div>' : '') + '</div></details>';
  }

  /* ---------- 5 인사 ---------- */
  function tcls(t) { return /입사|복직/.test(t) ? 't0' : /전배/.test(t) ? 't1' : /휴직/.test(t) ? 't2' : 't3'; }
  function p5() {
    var lv = D.leave || {}, ln = 0, lk;
    for (lk in lv) ln += lv[lk];
    var h = '<h2>이번 주 인사 변동</h2><div class="tiles" style="grid-template-columns:1fr 1fr;margin-top:0"><div class="tile"><div class="l">변동 인원</div><div class="v">' + (D.hr_n || 0) + '<small> 건</small></div><div class="s muted">' + esc(D.hr_txt || '변동 없음') + '</div></div>' +
      '<div class="tile"><div class="l">휴직 중</div><div class="v">' + ln + '<small> 명</small></div><div class="s muted">' + Object.keys(lv).map(function (c) { return esc(cshort(c)) + ' ' + lv[c]; }).join(' · ') + '</div></div></div>';
    var list = D.hr || [], show = hrAll ? list : list.slice(0, 10);
    h += '<h2>변동 내역 (성명 제외)</h2><div class="card">';
    h += show.length ? show.map(function (x) {
      var parts = String(x.org).split(' · '), corp = cshort(parts.shift()), em = /^([+\-−][\d.]+\s*MM)\s*(.*)$/.exec(x.eff || '');
      return '<div class="hr"><span class="tag ' + tcls(x.type) + '">' + esc(x.type) + '</span><div class="o">' + esc(parts.join(' › ') || '–') + '<small>' + esc(corp) + '</small></div><div class="e">' + (em ? esc(em[1]) + '<small>' + esc(em[2]) + '</small>' : esc(x.eff)) + '<small>적용 ' + esc(x.date) + '</small></div></div>';
    }).join('') : '<div class="empty">이번 주 인사 변동이 없어요</div>';
    h += '</div>' + (list.length > 10 ? '<button class="more" id="hrmore">' + (hrAll ? '접기' : '전체 ' + list.length + '건 보기') + '</button>' : '');
    h += '<p class="foot">개인별 명단·휴직자 상세는 PC 포털 회의용 화면에서 확인하세요</p>';
    return h;
  }

  /* ---------- 렌더 ---------- */
  function render() {
    var y = window.scrollY;
    renderTop();
    var past = (curLabel !== 'latest' && WEEKS && META.week.label !== WEEKS.latest)
      ? '<div class="past"><span>지난 주차를 보고 있어요</span><button id="tolatest">최신 보기</button></div>' : '';
    var pages = [p1, p2, p3, p4, p5];
    $('#main').innerHTML = pages.map(function (f, i) {
      var html = ''; try { html = f(); } catch (e) { html = '<div class="err"><b>이 화면을 표시하지 못했어요</b>' + esc(e.message) + '</div>'; if (window.console) console.error(e); }
      return '<section class="pg" data-i="' + i + '">' + (i === 0 ? past : '') + html + '</section>';
    }).join('');
    go(tab, true);
    bind();
    window.scrollTo(0, y);
  }
  function bind() {
    var tl = $('#tolatest'); if (tl) tl.onclick = function () { curLabel = 'latest'; refresh(true); };
    [].forEach.call(document.querySelectorAll('#sortseg button'), function (b) {
      b.onclick = function () { sortMode = b.getAttribute('data-m'); var y = window.scrollY; $('.pg[data-i="1"]').innerHTML = p2(); bind(); window.scrollTo(0, y); };
    });
    var ts = $('#tsel'); if (ts) { ts.value = trendSel; ts.onchange = function () { trendSel = ts.value; trendMonth = null; drawTrend(); }; drawTrend(); }
    var im = $('#idlemore'); if (im) im.onclick = function () { idleAll = !idleAll; var y = window.scrollY; $('.pg[data-i="3"]').innerHTML = p4(); bind(); window.scrollTo(0, y); };
    var hm = $('#hrmore'); if (hm) hm.onclick = function () { hrAll = !hrAll; var y = window.scrollY; $('.pg[data-i="4"]').innerHTML = p5(); bind(); window.scrollTo(0, y); };
  }

  /* ---------- 당겨서 새로고침 ---------- */
  (function () {
    var y0 = null, dy = 0, ptr = $('#ptr'), armed = false;
    document.addEventListener('touchstart', function (e) { if (window.scrollY <= 0 && e.touches.length === 1 && !$('#sheet').hidden === false) { y0 = e.touches[0].clientY; dy = 0; armed = false; } else y0 = null; }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (y0 == null) return; dy = e.touches[0].clientY - y0;
      if (dy <= 0 || window.scrollY > 0) { ptr.style.opacity = 0; return; }
      var p = Math.min(dy, 110); armed = dy > 80;
      ptr.style.opacity = Math.min(1, dy / 60); ptr.style.transform = 'translateY(' + (p * .75 - 10) + 'px) rotate(' + (p * 3) + 'deg)';
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (y0 == null) return; y0 = null;
      if (armed) { ptr.style.transform = 'translateY(' + (50) + 'px)'; refresh(true).then(function () { ptr.style.opacity = 0; ptr.style.transform = ''; }); }
      else { ptr.style.opacity = 0; ptr.style.transform = ''; }
      armed = false;
    });
  })();

  /* ---------- 자동 갱신 ---------- */
  function maybeRefresh() { if (curLabel === 'latest' && Date.now() - lastCheck > AUTO_MIN * 60000) refresh(false); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') maybeRefresh(); });
  window.addEventListener('online', function () { if (curLabel === 'latest') refresh(false); });
  window.addEventListener('offline', function () { offline = true; if (META) renderTop(); });
  setInterval(function () { if (document.visibilityState === 'visible' && curLabel === 'latest') refresh(false); }, POLL_MIN * 60000);

  /* ---------- 설치 안내 + 서비스워커 ---------- */
  (function () {
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    var KEY = 'mmc-install-dismissed';
    function dismissed() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
    function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) { } }
    function banner(html, onInstall) {
      if (standalone || dismissed() || $('#inst')) return;
      var d = document.createElement('div'); d.id = 'inst';
      d.innerHTML = '<div class="it">' + html + '</div>' + (onInstall ? '<button type="button" class="ib1">설치</button>' : '') + '<button type="button" class="ib2" aria-label="닫기">✕</button>';
      document.body.appendChild(d);
      d.querySelector('.ib2').onclick = function () { remember(); d.remove(); };
      if (onInstall) d.querySelector('.ib1').onclick = function () { onInstall(); d.remove(); };
    }
    var dp = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); dp = e;
      banner('<b>홈 화면에 설치</b>하면 앱처럼 바로 열려요', function () { dp.prompt(); dp.userChoice.then(remember); });
    });
    window.addEventListener('appinstalled', function () { remember(); var d = $('#inst'); if (d) d.remove(); });
    var ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (ios && !standalone) banner('<b>앱처럼 쓰려면</b> 하단 <span class="sh">공유 ⎋</span> → <b>홈 화면에 추가</b>');
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      var had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(function () { });
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (had && !window.__reloading) { window.__reloading = true; location.reload(); } });
    }
  })();

  /* ---------- 시작 ---------- */
  buildTabs();
  var h0 = parseInt((location.hash || '').replace('#s', ''), 10); tab = isNaN(h0) ? 0 : Math.max(0, Math.min(4, h0 - 1));
  var cached = readCache();
  if (cached && cached.schema <= SCHEMA) { apply(cached, { force: true }); }  // 저장된 데이터로 즉시 표시 → 뒤에서 최신 확인
  else $('#main').innerHTML = '<div class="skel"></div><div class="skel" style="height:90px"></div><div class="skel" style="height:150px"></div>';
  go(tab, true);
  refresh(false);
  window.__mmc = { refresh: refresh, go: go };
})();
