// 길동무 — 도착 전(하차·환승) 알림 · 현재역 표시 실측 시험기 (브라우저 창에서 배포된 엔진을 직접 부른다)
//
// 쓰는 법: route-v2 워커와 같은 출처의 브라우저 탭(예: https://route-v2.phg0643.workers.dev/health)에서 이 파일 내용을 JS 로 실행한다.
//   · 경로: GET /route-v2-app?SX=&SY=&EX=&EY=&SN=&EN=&baseMs=   → 응답 그대로 A.state(j, tab, nowMs) 로 /ride/start 에 넣어 '안내 상태'를 만든다.
//   · 가상 이동: 상태의 정류장 좌표·도착 시각(state.stops)을 따라 사람이(또는 열차가) 움직인다고 보고, 4~12초마다 /ride-standby 를 불러 알림·현재역을 받는다.
//   · 변형: realMove(대기가 긴 구간은 정류장에서 서 있다 마지막에만 움직임) · delaySec(열차가 계획보다 늦음/빠름) · gps('gps' 계속 | 'tunnel' 역 350m 안에서만 | 'none' 없음) · noise(위치 흔들림 m) · allowed(끈 알림) · startMs/now(중간에 시작)
//   · 판정(엔진이 한 말을 '실제로 지난 시각'과 맞춰 본다): 알림 빠짐·중복·엉뚱한 키 · 알림 시각(실제 통과 대비) · 현재역(curIdx)이 앞서거나 뒤처진 정도 ·
//          상주 알림 글(다음 역·남은 정거장) · 오버레이 줄(현재역·도착 시각·남은 시간) · 안내 끝(done) 시각 · 응답 시간 · 상태 크기
//   · 먼저 A.installGuard() — 기기당 요청 한도(초당 2건)에 걸리지 않게 여정마다 따로 줄 세워 보낸다(안 부르면 40건째에 error:rate).
//   엔진을 바꾸지 않는다(읽기 전용 호출만). 서버에 아무것도 저장하지 않는다.
(function () {
  var A = window.__A = window.__A || {};
  var hav = function (a, b, c, d) { var R = 6371000, k = Math.PI / 180, x = (c - a) * k, y = (d - b) * k * Math.cos((a + c) / 2 * k); return Math.sqrt(x * x + y * y) * R; };
  var rng = function (seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  var gauss = function (r) { var u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  var q = function (o) { return Object.keys(o).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); };
  var post = async function (path, body) { var t0 = performance.now(); var res = await fetch(path, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) }); var j = await res.json(); j.__ms = performance.now() - t0; return j; };
  A.q = q; A.hav = hav; A.post = post;

  // 배포 엔진에는 '기기당 요청 한도'(guard: 무거운 요청 버스트 40건, 이후 초당 2건)가 있다. 시험기는 실제 앱보다 훨씬 빠르게 부르므로 그대로 두면 error:rate 로 끊긴다.
  // → 여정마다(= 기기 하나로 보고) 식별번호(X-Gdm-Id)를 따로 붙이고, 한 기기의 호출은 줄 세워 gapMs(기본 700ms) 간격으로 보낸다(실제 앱은 2.5~5초마다 1건). 429 면 Retry-After 만큼 쉬었다 다시.
  // 한도를 피하려는 게 아니라 '기기 여러 대가 각자 정상 속도로 쓰는 상황'을 만드는 것이다. 이 함수를 한 번 부른 뒤 A.trip/A.runAll 을 쓴다.
  A.installGuard = function (gapMs) {
    if (window.__origFetch) { A.gap = gapMs || A.gap; return 'already'; }
    var orig = window.__origFetch = window.fetch.bind(window); A.gap = gapMs || 700; A.guard429 = 0;
    var tails = {}, hashS = function (s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
    var iidOf = function (init) {
      try { if (init && typeof init.body === 'string' && init.body.indexOf('"state"') >= 0) { var b = JSON.parse(init.body), st = b.state; if (st && st.stops && st.eta && st.eta.nodes) { var n = st.eta.nodes; return 'sim' + hashS(n[0].name + '|' + n[n.length - 1].name + '|' + st.stops.length + '|' + (st.rb || '') + '|' + (st.cfg && st.cfg.seq ? st.cfg.seq.join(',') : '')); } } } catch (e) { }
      return 'simmisc';
    };
    window.fetch = function (url, init) {
      init = init ? Object.assign({}, init) : {};
      var u = String(url); if (u.indexOf('/ride-standby') < 0 && u.indexOf('/next-train') < 0 && u.indexOf('/board-live') < 0) return orig(url, init);
      var id = iidOf(init); init.headers = Object.assign({}, init.headers, { 'X-Gdm-Id': id });
      var run = (tails[id] || Promise.resolve()).then(async function () {
        await new Promise(function (r) { setTimeout(r, A.gap); });
        for (var k = 0; k < 6; k++) { var res = await orig(url, init); if (res.status !== 429) return res; var ra = +res.headers.get('Retry-After') || 2; A.guard429++; await new Promise(function (r) { setTimeout(r, Math.min(130, ra) * 1000 + 300); }); }
        return orig(url, init);
      });
      tails[id] = run.catch(function () { });
      return run;
    };
    return 'installed';
  };

  A.route = async function (od, baseMs) {
    return fetch('/route-v2-app?' + q({ SX: od.sx, SY: od.sy, EX: od.ex, EY: od.ey, SN: od.sn, EN: od.en, baseMs: baseMs })).then(function (r) { return r.json(); });
  };
  A.state = async function (j, tab, nowMs, baseMs, od) {
    var r = await post('/ride/start', { cap: 18, r: { data: j, tab: tab, a: od ? od.sn : '출발', b: od ? od.en : '도착', bt: null, rb: baseMs, now: nowMs, tz: 540, th: 'dark' } });
    return r;
  };

  // 한 여정을 가상으로 달려 본다. state0 = /ride/start 가 준 state.
  A.trip = async function (state0, o) {
    o = o || {};
    var D = (o.delaySec || 0) * 1000, mode = o.gps || 'gps', noise = o.noise == null ? 8 : o.noise, rnd = rng(o.seed || 7);
    var st = JSON.parse(JSON.stringify(state0));
    if (o.allowed) st.cfg.allowed = o.allowed;
    var stops = st.stops.slice().sort(function (a, b) { return a.i - b.i; });
    var nodes = st.eta.nodes, seq = st.cfg.seq || [], targets = st.cfg.targets || [], last = stops.length - 1;
    var T = stops.map(function (s) { return s.arrMs + D; });
    var idxOfNode = {}; stops.forEach(function (s, k) { idxOfNode[s.i] = k; });
    var trueK = function (t) { var k = -1; for (var i = 0; i <= last; i++) if (T[i] <= t) k = i; return k; };
    var posAt = function (t) {
      if (t <= T[0]) return [stops[0].lat, stops[0].lng];
      for (var k = 0; k < last; k++) if (t <= T[k + 1]) { var f = T[k + 1] > T[k] ? (t - T[k]) / (T[k + 1] - T[k]) : 1;
        // o.realMove: 계획 시각 사이가 길고 느린 구간(환승 대기 · 긴 도보 — 평균 3m/s 미만, 120초 초과)은 정류장에서 서 있다가 마지막 dist/6 초만 움직인다(안 쓰면 직선으로 천천히 기어간다 — 버스 환승 대기 구간에서 엔진이 '다음 정류장 근처' 라고 일찍 인정하는 것처럼 보임)
        if (o.realMove) { var dd = hav(stops[k].lat, stops[k].lng, stops[k + 1].lat, stops[k + 1].lng), dts = (T[k + 1] - T[k]) / 1000; if (dts > 120 && dd / dts < 3) { var mv = Math.max(20, dd / 6), tl = (T[k + 1] - t) / 1000; f = tl >= mv ? 0 : 1 - tl / mv; } }
        return [stops[k].lat + (stops[k + 1].lat - stops[k].lat) * f, stops[k].lng + (stops[k + 1].lng - stops[k].lng) * f]; }
      return [stops[last].lat, stops[last].lng];
    };
    var nearStop = function (p) { var m = 1e9; for (var i = 0; i < stops.length; i++) { var d = hav(p[0], p[1], stops[i].lat, stops[i].lng); if (d < m) m = d; } return m; };
    var mkFix = function (ts) {
      if (mode === 'none') return null;
      var p = posAt(ts);
      if (mode === 'tunnel' && nearStop(p) > 350) return null;
      var lat = p[0] + gauss(rnd) * noise / 111000, lng = p[1] + gauss(rnd) * noise / (111000 * Math.cos(p[0] * Math.PI / 180));
      return [ts, lat, lng, Math.max(10, Math.round(noise * 1.5))];
    };
    var typeOf = function (tg, R) { return tg.kind === 'transfer' ? (R === 2 ? 'transfer2' : 'transfer') : (R === 2 ? 'near_arrive2' : (R === 1 ? 'near_arrive' : 'arrive')); };
    var allowedNow = st.cfg.allowed || {}, want = {};
    targets.forEach(function (tg) { [2, 1, 0].forEach(function (R) {
      if (R === 0 && tg.kind !== 'dest') return; var p = tg.seqPos - R; if (p < 0) return;
      var k = idxOfNode[seq[p]]; if (k == null) return; var ty = typeOf(tg, R); if (allowedNow[ty] === false) return;
      want[tg.nodeIdx + '_' + R] = { trig: T[k], node: seq[p], type: ty, name: tg.name };
    }); });
    var curPosOf = function (ci) { var p = -1; for (var i = 0; i < seq.length; i++) { if (seq[i] <= ci) p = i; else break; } return p; };

    var t0 = o.startMs != null ? o.startMs : T[0] - 120000, tEnd = T[last] + 420000;
    var t = t0, lastFixT = t0 - 3000, calls = [], alerts = [], seen = {}, doneAt = null, msSum = 0, msMax = 0, stMax = 0, nCall = 0;
    var ongBad = 0, ongFmtOther = {}, line1Bad = 0, ovlBad = 0, ovlSamples = [], line1Samples = [], line2Bad = 0;
    var behindMs = 0, aheadMs = 0, aheadMaxSteps = 0, prevT = null, aheadSamples = [], trace = [], pendingBl = null, nAsk = 0, nAnsOk = 0;
    while (t <= tEnd) {
      var fixes = []; for (var ft = lastFixT + 3000; ft <= t; ft += 3000) { var f = mkFix(ft); if (f) fixes.push(f); lastFixT = ft; }
      var r = await post('/ride-standby', Object.assign({ nowMs: t, fixes: fixes, state: st }, pendingBl ? { bl: pendingBl } : {})); pendingBl = null;
      if (r.error) return { error: r.error, at: t, calls: nCall };
      st = r.state; nCall++;
      // 엔진이 '시각표/실시간을 물어봐 달라'(ask)고 하면 앱이 하는 일을 흉내: /board-live 대신 시각표(/next-train?op=board)로만 답한다(시험은 미래 시각이라 실시간 목록을 쓰면 엉뚱해지고 호출 한도도 쓴다)
      if (r.ask && r.ask.body && !o.noAsk) { var b = r.ask.body; nAsk++; var ans = { ok: true, kind: b.kind, i: b.i, ms: null, src: null, at: b.nowMs, fromMs: b.fromMs, allowEarlier: !!b.allowEarlier, maxWait: b.maxWait };
        if (b.kind === 'sub') { var tz = b.tz || 540, mod = (((b.fromMs / 60000 + tz) % 1440) + 1440) % 1440; try { var nb = await fetch('/next-train?op=board&line=' + encodeURIComponent(b.line) + '&from=' + encodeURIComponent(b.from) + '&to=' + encodeURIComponent(b.to || '') + '&atMin=' + mod + '&baseMs=' + b.fromMs).then(function (x) { return x.json(); }); if (nb.depMin != null && isFinite(nb.depMin)) { ans.ms = Math.round(b.fromMs - mod * 60000 + nb.depMin * 60000); ans.src = 'table'; if (nb.dk) ans.dk = nb.dk; nAnsOk++; } } catch (e5) { } }
        pendingBl = ans; } msSum += r.__ms; if (r.__ms > msMax) msMax = r.__ms;
      var sz = JSON.stringify(st).length; if (sz > stMax) stMax = sz;
      var k = trueK(t), truthI = k >= 0 ? stops[k].i : 0, ci = r.curIdx == null ? -1 : r.curIdx;
      var dt = prevT == null ? 0 : t - prevT; prevT = t;
      if (ci < truthI) behindMs += dt; if (ci > truthI) { aheadMs += dt; aheadMaxSteps = Math.max(aheadMaxSteps, ci - truthI); if (aheadSamples.length < 4) aheadSamples.push({ t: Math.round((t - t0) / 1000), ci: ci, truth: truthI }); }
      stops.forEach(function (s, kk) { if (seen[kk] == null && ci >= s.i) seen[kk] = t; });
      if (r.alert) alerts.push({ t: t, key: r.alert.key, type: r.alert.type, title: r.alert.title, body: r.alert.body, ci: ci, truthI: truthI });
      // 상주 알림 글: '다음 X HH:MM · 도착지까지 N정거장'
      var og = r.ongoing && r.ongoing.text || '', m = /^다음 (.+?)(?: (\d\d:\d\d))? · (.+?)까지 (\d+)정거장$/.exec(og);
      if (m && ci >= 0 && !r.done) {
        var nx = nodes[ci + 1], remN = seq.length - 1 - curPosOf(ci);
        var nameOk = !nx || m[1] === nx.name, nOk = +m[4] === remN;
        if (!(nameOk && nOk)) { ongBad++; if (ovlSamples.length < 6) ovlSamples.push({ t: Math.round((t - t0) / 1000), og: og, want: (nx && nx.name) + '/' + remN, ci: ci, truthI: truthI }); }
      } else if (og) { var key = og.replace(/\d+/g, '#').slice(0, 40); ongFmtOther[key] = (ongFmtOther[key] || 0) + 1; }
      var l1 = r.view && r.view.line1 || (r.overlay && r.overlay.line1) || '';
      if (l1 && ci >= 0 && !r.done) { var n0 = nodes[ci] && nodes[ci].name, n1 = nodes[ci + 1] && nodes[ci + 1].name; if (!((n0 && l1.indexOf(n0) >= 0) || (n1 && l1.indexOf(n1) >= 0))) { line1Bad++; if (line1Samples.length < 6) line1Samples.push({ t: Math.round((t - t0) / 1000), l1: l1, ci: ci, n0: n0, n1: n1 }); } }
      var l2 = r.view && r.view.line2 || (r.overlay && r.overlay.line2) || '';
      var m2 = /남은시간: (\d+)시간 (\d+)분 · (\d\d):(\d\d)도착/.exec(l2);
      if (m2 && !r.done) { var remMin = +m2[1] * 60 + +m2[2], arrMin = +m2[3] * 60 + +m2[4], nowMin = (((t / 60000 + 540) % 1440) + 1440) % 1440; var dd = arrMin - nowMin; if (dd < -720) dd += 1440; if (dd > 720) dd -= 1440; if (Math.abs(dd - remMin) > 2 && !(remMin === 0 && dd <= 0)) { line2Bad++; if (ovlSamples.length < 8) ovlSamples.push({ t: Math.round((t - t0) / 1000), l2: l2, nowMin: Math.round(nowMin), dd: Math.round(dd) }); } }
      if (o.trace && (t - t0) / 1000 >= o.trace[0] && (t - t0) / 1000 <= o.trace[1]) trace.push({ t: Math.round((t - t0) / 1000), k: k, ci: ci, notes: r.notes, og: og, l1: l1, pos: r.pos && { from: r.pos.from, to: r.pos.to, ratio: r.pos.ratio, moving: r.pos.moving }, motion: r.motion, zero: r.zero && r.zero.stops && r.zero.stops.map(function (z) { return z.i + ':' + z.state + ':' + z.distM + (z.apply ? ':apply' : ''); }), nfix: fixes.length, wait: st.wait && st.wait.i, xw: st.xw && { i: st.xw.i, mode: st.xw.mode }, dr: st.dr && 1 });
      calls.push([Math.round((t - t0) / 1000), k, ci, r.alert ? r.alert.key : '', r.nextMs, r.done ? 1 : 0]);
      if (r.done) { doneAt = t; if (!o.pastDone) break; }
      var dmin = 1e12; for (var e = 0; e <= last; e++) dmin = Math.min(dmin, Math.abs(t - T[e]));
      t += (dmin <= 12000 || ci !== truthI) ? 4000 : 12000;
    }
    // ── 판정 ──
    var firedKeys = Object.keys(st.fired || {}), wantKeys = Object.keys(want), alertedKeys = alerts.map(function (a) { return a.key; });
    var missing = wantKeys.filter(function (kk) { return firedKeys.indexOf(kk) < 0; });
    var muted = firedKeys.filter(function (kk) { return alertedKeys.indexOf(kk) < 0; });
    var dup = alertedKeys.filter(function (kk, i) { return alertedKeys.indexOf(kk) !== i; });
    var unexpected = alertedKeys.filter(function (kk) { return !want[kk]; });
    var lat = alerts.filter(function (a) { return want[a.key]; }).map(function (a) { return { key: a.key, type: a.type, name: want[a.key].name, ms: a.t - want[a.key].trig }; });
    var lags = []; stops.forEach(function (s, kk) { if (kk > 0 && seen[kk] != null) lags.push(seen[kk] - T[kk]); });
    lags.sort(function (a, b) { return a - b; });
    var neverSeen = stops.filter(function (s, kk) { return seen[kk] == null; }).length;
    var wrongOrder = 0; for (var i2 = 1; i2 < alerts.length; i2++) if (alerts[i2].t < alerts[i2 - 1].t) wrongOrder++;
    var afterDone = doneAt != null ? alerts.filter(function (a) { return a.t > doneAt; }).length : 0;
    return {
      stops: stops.length, targets: targets.length, calls: nCall, asks: nAsk, asksOk: nAnsOk, secs: Math.round((t - t0) / 1000),
      want: wantKeys.length, alerted: alertedKeys.length, missing: missing, muted: muted, dup: dup, unexpected: unexpected,
      lat: lat.map(function (x) { return x.type + '@' + x.name + ':' + Math.round(x.ms / 1000); }),
      latMin: lat.length ? Math.round(Math.min.apply(null, lat.map(function (x) { return x.ms; })) / 1000) : null,
      latMax: lat.length ? Math.round(Math.max.apply(null, lat.map(function (x) { return x.ms; })) / 1000) : null,
      lagMed: lags.length ? Math.round(lags[Math.floor(lags.length / 2)] / 1000) : null, lagMin: lags.length ? Math.round(lags[0] / 1000) : null, lagMax: lags.length ? Math.round(lags[lags.length - 1] / 1000) : null,
      neverSeen: neverSeen, behindSec: Math.round(behindMs / 1000), aheadSec: Math.round(aheadMs / 1000), aheadMaxSteps: aheadMaxSteps, aheadSamples: aheadSamples,
      ongBad: ongBad, ongFmtOther: ongFmtOther, line1Bad: line1Bad, line2Bad: line2Bad, samples: ovlSamples.concat(line1Samples).slice(0, 8),
      doneSecAfterArr: doneAt != null ? Math.round((doneAt - T[last]) / 1000) : null, afterDone: afterDone, wrongOrder: wrongOrder,
      ms: { avg: Math.round(msSum / Math.max(1, nCall)), max: Math.round(msMax) }, stMax: stMax,
      __calls: calls, __alerts: alerts, __trace: trace
    };
  };

  // 여러 여정을 동시 conc 개씩 달린다. jobs = [{name, state, opt}] → A.res[tag][name]
  A.runAll = async function (tag, jobs, conc) {
    A.res = A.res || {}; A.res[tag] = {}; A.prog = A.prog || {}; A.prog[tag] = { done: 0, total: jobs.length, running: true, t0: Date.now() };
    var next = 0;
    var w = async function () { while (next < jobs.length) { var jb = jobs[next++]; var out; try { out = await A.trip(jb.state, jb.opt); } catch (e) { out = { error: String(e && e.message || e) }; } A.res[tag][jb.name] = out; A.prog[tag].done++; } };
    await Promise.all(Array.from({ length: conc || 4 }, w));
    A.prog[tag].running = false; A.prog[tag].sec = Math.round((Date.now() - A.prog[tag].t0) / 1000);
  };
})();
