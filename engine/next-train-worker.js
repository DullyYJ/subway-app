// 길동무 — '다음 열차' 엔진의 Worker 연결부 (route-v2 Worker 안에서 next-train.js·next-train-data.js 뒤에 붙는다)
//
// ★ 원칙(YJ): "계산은 전부 엔진이 한다. 앱은 그리기만 한다."
//   · 경로 응답(/route-v2-app)의 지하철 구간마다 엔진이 다음 열차까지의 대기(ttWaitMs)와 안내용 정보(nextTrain)를 붙여 준다.
//   · 앱이 승차 시각에 맞춰 다시 물어볼 때는 GET/POST /next-train 으로 묻는다.
//   · 시각표 데이터는 gildongmu-tt 번들(앱이 쓰던 것과 같은 것)을 엔진에 내장해 쓴다(서비스 바인딩 TT_SVC 가 있으면 그쪽 최신본을 KV 에 6시간 두고 우선). 못 불러오면 값을 붙이지 않을 뿐 경로는 그대로 나간다.

var NT_KV_KEY = "nt:bundle:v1";
var NT_TTL_MS = 6 * 3600 * 1000;
var NT_NEAR_SEC = 260;            // s333: 승차역까지 걸어서 이 안(≈250m — 승차 대기 재보정 RS_BL_NEAR_M 과 같다)이면 '역 안에 있다'고 보고 지금 오는 열차부터 후보로 본다(걸음 시간을 먼저 빼지 않는다)
var NT_HURRY_BUF_MS = 30000;      // 앞당겨 탈 때 열차 도착 이만큼(30초) 전에 승강장에 닿는 것으로 그린다
var NT_MAX_WAIT_MIN = 30;         // 앱의 옛 _TT_MAX_WAIT — 대기가 이보다 길면 반영하지 않는다(막차 뒤·시각표 이상)
var _NT = null, _NT_AT = 0, _NT_P = null, _NT_FAIL_AT = 0, _NT_WHY = '', _NT_SRC = '';   // _NT_WHY: 마지막 실패 사유 · _NT_SRC: 지금 쓰는 시각표의 출처(kv|svc|embed) — 진단용

function ntEmbedVer() {
  try { var m = /"version"\s*:\s*"([^"]*)"/.exec(String(NT_TT_EMBED).slice(0, 400)); return m ? m[1] : ''; } catch (e) { return ''; }
}

async function ntEnsure(env) {
  try { if (typeof holEnsure === 'function') await holEnsure(env); } catch (e) { }   // 공휴일(KV)도 같이 최신으로 — 실패해도 지금 가진 것을 쓴다
  if (_NT && Date.now() - _NT_AT < NT_TTL_MS) return _NT;
  if (_NT_P) return _NT_P;
  if (!_NT && _NT_FAIL_AT && Date.now() - _NT_FAIL_AT < 30000) return null;   // 직전에 실패했으면 30초는 다시 시도하지 않는다
  _NT_P = (async function () {
    var bundle = null, txt = null, why = [], src = '';
    // 1) KV 캐시(분기 자동 갱신이 올린 것, 또는 서비스 바인딩으로 받아 둔 것)  2) 서비스 바인딩 env.TT_SVC (대시보드에서 gildongmu-tt 를 TT_SVC 로 연결했을 때)  3) 엔진에 내장된 번들
    //    ※ gildongmu-tt 의 workers.dev 주소를 fetch 로 직접 부르면 같은 계정 워커끼리라 404 가 와서 쓰지 않는다.
    try { if (env && env.ROWS_KV) txt = await env.ROWS_KV.get(NT_KV_KEY, { cacheTtl: 3600 }); } catch (e) { why.push('kvget:' + String(e && e.message || e).slice(0, 80)); }
    if (txt) { try { bundle = JSON.parse(txt); src = 'kv'; } catch (e) { bundle = null; why.push('kvparse'); } }
    if ((!bundle || !bundle.data) && env && env.TT_SVC && typeof env.TT_SVC.fetch === 'function') {
      bundle = null; src = '';
      try {
        var r = await env.TT_SVC.fetch('https://gildongmu-tt/tt');
        if (r.ok) {
          txt = await r.text(); bundle = JSON.parse(txt); src = 'svc';
          if (bundle && bundle.data && env.ROWS_KV) { try { await env.ROWS_KV.put(NT_KV_KEY, txt, { expirationTtl: NT_TTL_MS / 1000 }); } catch (e) { why.push('kvput:' + String(e && e.message || e).slice(0, 80)); } }
        } else { why.push('svc:' + r.status); }
      } catch (e) { bundle = null; why.push('svcx:' + String(e && e.message || e).slice(0, 120)); }
    }
    // 내장본보다 오래된 번들(옛 KV·옛 서비스 응답)은 쓰지 않는다 — 버전 문자열(tt-날짜+tago-날짜)을 사전순으로 비교
    if (bundle && bundle.data) { var ev = ntEmbedVer(); if (ev && String(bundle.version || '') < ev) { why.push('older:' + src + ':' + String(bundle.version || '').slice(0, 40)); bundle = null; src = ''; } }
    if (!bundle || !bundle.data) {
      bundle = null; src = '';
      try { bundle = JSON.parse(NT_TT_EMBED); src = 'embed'; } catch (e) { bundle = null; why.push('embed:' + String(e && e.message || e).slice(0, 80)); }
    }
    if (!bundle || !bundle.data) { _NT_FAIL_AT = Date.now(); _NT_WHY = why.join(' | ') || 'unknown'; return _NT || null; }   // 실패하면 있던 것을 계속 쓴다
    var d = bundle.data;
    _NT = ntCreate({
      _REAL_TT: d._REAL_TT, _GIMPO_TT: d._GIMPO_TT, _BUILTIN_TT: d._BUILTIN_TT, LINE_SCHEDULE: d.LINE_SCHEDULE,
      _REAL_SEG: d._REAL_SEG, _TT_ORDER_HARD: d._TT_ORDER_HARD, _TT_ORIENT: d._TT_ORIENT, _INCHEON_TT: NT_INCHEON_TT, STNORDER: NT_STNORDER
    });
    _NT.version = bundle.version || null; _NT.src = src;
    _NT_AT = Date.now(); _NT_FAIL_AT = 0;
    return _NT;
  })();
  try { return await _NT_P; } finally { _NT_P = null; }
}

// ── s197: 경로 목록의 지하철 첫 구간 대기를 서울 실시간 도착정보로 조용히 바꾼다 (웹 _boardNextDep 와 같은 규칙) ──
//   웹: 승차역 실시간 목록에서 호선(subwayId)·내 방향(forward)·내가 닿은 뒤(+30초)에 오는 가장 빠른 차를 고르고,
//       시각표의 같은 차와 4분 안이면 실시간을, 아니면 시각표를 쓴다. 이 규칙은 승차 대기 재보정(/board-live)과 같은 함수를 쓴다.
//   범위: 경로의 '첫 대중교통'이 서울권 지하철(실시간 도착 제공 노선)일 때만. 실시간은 '지금부터 N분 뒤' 정보라 20분 넘게 먼 승차는 시각표.
//   못 받으면(중계가 비었거나 2.8초 안에 못 옴) 아무것도 바꾸지 않는다 — 시각표 대기(ttWaitMs)가 그대로 간다.
function ntNz(x) { return String(x || '').replace(/역$/, '').trim(); }
function ntLiveKey(line, from, to, offSec) { return String(line || '') + '|' + ntNz(from) + '|' + ntNz(to) + '|' + Math.round(+offSec || 0); }
// 경로 계산 결과(out)에서 '첫 대중교통이 지하철'인 것들의 대상 목록 — { key, line, from, to, offSec }
function ntLiveTargets(out, id) {
  var res = [], seen = {}, k, r, i, L, sl, key, off;
  for (k in out) {
    r = out[k]; if (!r || !r.legs) continue;
    L = null; for (i = 0; i < r.legs.length; i++) { var m = r.legs[i] && r.legs[i].mode; if (m === 'subway' || m === 'bus' || m === 'longdist') { L = r.legs[i]; break; } }
    if (!L || L.mode !== 'subway') continue;
    sl = L.stopList || []; if (sl.length < 2 || !L.line || !id(L.line)) continue;
    off = (r.accessWalkMin || 0) * 60;                                     // 첫 구간에 닿는 시각 = 탐색 시각 + 접근 도보(legsToSubPath 의 arriveSec 와 같다)
    key = ntLiveKey(L.line, sl[0], sl[1], off);
    if (seen[key]) continue; seen[key] = 1;
    res.push({ key: key, line: String(L.line), from: String(sl[0]), to: String(sl[1]), offSec: off, near: off <= NT_NEAR_SEC });
  }
  return res;
}
// 대상별로 실시간 열차 시각(ms)을 가린다 → { key: { ms, src:'realtime' } } (시각표로 가려진 것·못 받은 것은 넣지 않는다)
//   d = { fetch, id, pick, table, rec, aheadMax } — 기본은 ride-standby 모듈의 같은 함수들. baseMs: 탐색 기준 시각, nowMs: 지금.
async function ntLiveFirst(env, out, baseMs, nowMs, d) {
  var res = {}, miss = 0;
  try {
    d = d || (typeof rsBlLivePick === 'function' ? { fetch: rsFetchSeoulPath, id: rsSubwayId, pick: rsBlLivePick, table: rsBlTable, rec: rsBlReconcile, aheadMax: RS_BL_AHEAD_MAX_MIN, ms: RS_LIVE_MS } : null);
    if (!d) return res;
    nowMs = nowMs != null ? nowMs : Date.now();
    if (Math.abs(baseMs - nowMs) > 10 * 60000) return res;                                   // 지금 탐색이 아니면(예상 시각) 실시간은 의미가 없다
    var tg = ntLiveTargets(out, d.id), stns = [], by = {}, j;
    for (j = 0; j < tg.length; j++) { var f = tg[j].from; if (!by[f]) { by[f] = 1; stns.push(f); } }
    if (!stns.length) return res;
    var got = await Promise.all([
      ntEnsure(env),
      Promise.all(stns.map(function (s) { return d.fetch(env, 'realtimeStationArrival/1/20/' + encodeURIComponent(ntNz(s)), d.ms || 2800).then(function (l) { return [s, l]; }, function () { return [s, null]; }); }))
    ]);
    var nt = got[0], lists = {}, e;
    for (j = 0; j < got[1].length; j++) lists[got[1][j][0]] = got[1][j][1];
    for (j = 0; j < tg.length; j++) {
      e = tg[j];
      var list = lists[e.from];
      if (!list) { if ((Math.round(baseMs + (e.near ? 0 : e.offSec) * 1000) - nowMs) / 60000 <= d.aheadMax) miss++; continue; }      // s332: 못 받음(중계 준비 중 · 시간 초과) — 앱이 3·6·10·15초 뒤 다시 묻는다(liveMissing)
      var q = { line: e.line, from: e.from, to: e.to, nowMs: nowMs, fromMs: Math.round(baseMs + (e.near ? 0 : e.offSec) * 1000), tz: 540 };      // s333: 역 가까이(near)면 지금부터 — 앞 열차(연착)를 걸음 시간 때문에 건너뛰지 않는다
      if ((q.fromMs - nowMs) / 60000 > d.aheadMax) continue;                                // 20분 넘게 먼 승차는 시각표
      var live = d.pick(list, q, nt); if (live == null) continue;
      var rc = d.rec(live, d.table(q, nt));
      if (rc && rc.src === 'realtime') res[e.key] = { ms: Math.round(rc.ms), src: 'realtime' };
    }
  } catch (err) {}
  try { Object.defineProperty(res, 'miss', { value: miss, enumerable: false }); } catch (e2) { }      // 열쇠로 세지지 않게 — 실시간을 못 받은 첫 지하철 구간 수
  return res;
}

// 경로 하나(path = { info, subPath })의 지하철 구간마다 nextTrain(안내용)과 ttWaitMs(타임라인 대기)를 붙인다.
//   baseMs: 탐색 기준 시각(요청의 baseMs).  bf: 앱이 '예상 시각 모드'라 운행종료 보정(svcWarn.shift)을 쓰지 않을 때 true.
//   ttWaitMs 의 의미 = 앱의 옛 계산과 같다: 그 구간을 타러 가는 시각(탐색 시각 + 구간 startSec + 앞 구간 대기 누적)에 승차역에 닿으면
//   다음 열차까지 기다리는 시간. 0~30분일 때만 붙는다. 앞 구간의 대기는 뒤 구간 시각에 그대로 이어진다(앱이 합산해 그린다).
// s333: 첫 구간 앞의 걸음을 shSec 초 줄이고(마지막 도보의 끝) 그 뒤 모든 구간의 시각(startSec·arriveSec·endSec·stopSec)과 총 시간을 같은 만큼 당긴다. 앞 구간이 전부 도보일 때만.
function ntHurry(path, sub, k, shSec) {
  var j, w = sub[k - 1];
  for (j = 0; j < k; j++) if (!sub[j] || sub[j].trafficType !== 3) return false;
  if (!w || w.endSec == null || w.startSec == null || w.endSec - shSec < w.startSec) return false;
  w.endSec -= shSec; if (w.arriveSec != null && w.arriveSec > w.endSec) w.arriveSec = w.endSec;
  w.sectionTime = Math.max(0, Math.round((w.endSec - w.startSec) / 60));
  for (j = k; j < sub.length; j++) {
    var g = sub[j]; if (!g) continue;
    if (g.startSec != null) g.startSec -= shSec;
    if (g.arriveSec != null) g.arriveSec -= shSec;
    if (g.endSec != null) g.endSec -= shSec;
    if (Array.isArray(g.stopSec)) g.stopSec = g.stopSec.map(function (x) { return x - shSec; });
  }
  var inf = path.info;
  if (inf) {
    if (typeof inf.totalTime === 'number') inf.totalTime = Math.max(1, inf.totalTime - Math.round(shSec / 60));
    if (inf.trip && typeof inf.trip.arrSec === 'number') inf.trip.arrSec -= shSec;
    inf.ttHurry = (inf.ttHurry || 0) + 1;
  }
  return true;
}
function ntAttachPath(nt, path, baseMs, bf, live) {
  var sub = path && path.subPath;
  if (!nt || !sub || !sub.length) return 0;
  var shiftMs = 0;
  if (!bf) {
    var sw = path.info && path.info.svcWarn;
    if (sw && sw.length) for (var i = 0; i < sw.length; i++) {
      var v = sw[i] && sw[i].shift;
      if (typeof v === 'number' && isFinite(v) && v > 0 && v < 1440) { shiftMs = v * 60000; break; }
    }
  }
  var base0 = baseMs + shiftMs, acc = 0, n = 0, firstT = -1;
  for (var f0 = 0; f0 < sub.length; f0++) { var tt0 = sub[f0] && sub[f0].trafficType; if (tt0 === 1 || tt0 === 2 || tt0 === 4) { firstT = f0; break; } }      // 첫 대중교통 구간 자리
  for (var k = 0; k < sub.length; k++) {
    var leg = sub[k];
    if (!leg || leg.trafficType !== 1) continue;
    delete leg.ttWaitMs; delete leg.nextTrain; delete leg.ttLive;          // 캐시된 경로 객체에 남은 이전 요청 값을 지운다
    var st = (leg.passStopList && leg.passStopList.stations) || [];
    var line = (leg.lane && leg.lane[0] && leg.lane[0].name) || '';
    if (!line || !st.length) continue;
    var info = null;
    try { info = nt.metroInfo({ line: line, from: st[0].stationName || '', to: st[st.length - 1].stationName || '', baseMs: baseMs, mins: 0 }); } catch (e) {}
    if (info) leg.nextTrain = { found: info.found, depMin: info.depMin, firstMin: info.firstMin, dir: info.dir };
    if (leg.startSec == null || leg.endSec == null || !isFinite(leg.startSec) || !isFinite(leg.endSec)) continue;
    var t = base0 + leg.startSec * 1000 + acc;
    var sod = (((Math.floor(t / 1000) + 32400) % 86400) + 86400) % 86400;          // KST 하루 안의 초
    var bm = Math.floor(sod / 3600) * 60 + Math.floor((sod % 3600) / 60) + (sod % 60) / 60;
    var dep = null;
    try { dep = nt.segNextDepAt({ type: 1, name: line, stops: st }, baseMs, bm); } catch (e) {}
    // s197: 첫 대중교통이 서울 지하철이고 실시간 열차가 가려졌으면 시각표 대기 대신 그 열차까지의 대기(조용한 교체)
    if (live && k === firstT && shiftMs === 0 && st.length > 1) {
      var lv = live[ntLiveKey(line, st[0].stationName, st[1].stationName, leg.arriveSec)];
      if (lv && lv.ms != null) {
        if (lv.ms < t && leg.arriveSec != null && leg.arriveSec <= NT_NEAR_SEC && k === firstT && k > 0) {      // s333: 걸어서 닿는 시각(t)보다 앞서 오는 열차 — 역 가까이에 있으면 서둘러 그 차를 탄다: 걸음 시간을 줄여 승강장에 도착 30초 전에 닿는 것으로 그린다
          var tNew = Math.max(base0 + leg.startSec * 1000 - Math.round(leg.arriveSec * 1000), lv.ms - NT_HURRY_BUF_MS);
          var shSec = Math.round((t - tNew) / 1000);
          if (shSec > 0 && ntHurry(path, sub, k, shSec)) { t = tNew; }
        }
        var wl = (lv.ms - t) / 60000;
        if (wl > 0 && wl <= NT_MAX_WAIT_MIN) { var wlMs = Math.round(wl * 60000); leg.ttWaitMs = wlMs; leg.ttLive = true; acc += wlMs; n++; if (path.info) path.info.ttLive = (path.info.ttLive || 0) + 1; continue; }
      }
    }
    if (dep != null) {
      var w = dep - bm;
      if (w > 0 && w <= NT_MAX_WAIT_MIN) { var wMs = Math.round(w * 60000); leg.ttWaitMs = wMs; acc += wMs; n++; }
    }
  }
  if (path.info) path.info.ttApplied = true;
  return n;
}

async function ntAttachAll(env, od, baseMs, bf, live) {
  try {
    var paths = od && od.result && od.result.path;
    if (!paths || !paths.length) return;
    var any = false;
    for (var i = 0; i < paths.length && !any; i++) {
      var sp = paths[i] && paths[i].subPath;
      if (sp) for (var j = 0; j < sp.length; j++) if (sp[j] && sp[j].trafficType === 1) { any = true; break; }
    }
    if (!any) return;                                  // 지하철 구간이 없는 응답은 시각표를 불러오지도 않는다
    var nt = await ntEnsure(env);
    if (!nt) return;
    for (var p = 0; p < paths.length; p++) ntAttachPath(nt, paths[p], baseMs, bf, live);
    od.ntVer = nt.version || null;
  } catch (e) {}
}

// /next-train — 앱이 승차 시각에 맞춰 다시 묻는 용도.
//   GET  ?op=board&line=1호선&from=서울역&to=남영&atMin=480.5&baseMs=…   → { dk:'상'|'하', depMin }
//        ?op=times (같은 인자)                                            → { dk, times:[…]|null }
//        ?op=info  (같은 인자, atMin 없음; 기준 시각 = baseMs)             → { info:{found,depMin,firstMin,dir} }
//        ?op=late&line=…&from=…&to=…&atMin=지금(분)&back=1&baseMs=…         → { dk, depMin, late:출발분|null }  (탑승을 늦게 눌렀을 때: backMin 분 전까지 이미 떠난 차가 있는가)
//        ?op=fwd&line=…&from=내다음역&to=내릴역&term=열차종착역            → { fwd:true|false|null }  (실시간 도착정보 열차가 내 진행 방향인지)
//        ?op=timetable&line=2호선&from=시청[&day=DAY|SAT|SUN][&baseMs=…]   → { dayCode, today, days, nowMin, dirs:[{dk,toward,times,first,last,nextMin,tomorrow}], noData }  (역 시간표)
//   POST { items:[{ id, op, … }] } → { items:[{ id, … }] }  (한 번에 여러 개)
function ntAnswer(nt, q) {
  var baseMs = q.baseMs != null && isFinite(+q.baseMs) && +q.baseMs > 0 ? +q.baseMs : Date.now();
  var line = String(q.line || ''), from = String(q.from || ''), to = q.to ? String(q.to) : '';
  if (!line || !from) return { error: 'line, from 필요' };
  if (q.op === 'fwd') return { fwd: nt.forward(line, from, to, q.term) };      // from=내 다음 역, to=내릴 역, term=열차 종착역
  if (q.op === 'timetable') return nt.timetable({ line: line, from: from, baseMs: baseMs, day: q.day });   // 역 시간표(노선도에서 역을 눌렀을 때) — 앱은 그리기만
  var op = q.op || 'board';
  if (op === 'times') { var t = nt.boardTimes({ line: line, from: from, to: to, baseMs: baseMs }); return { dk: t.dk, times: t.times }; }
  if (op === 'info') { return { info: nt.metroInfo({ line: line, from: from, to: to, baseMs: baseMs, mins: 0 }) }; }
  var atMin = q.atMin != null && isFinite(+q.atMin) ? +q.atMin : null;
  if (atMin == null) return { error: 'atMin 필요' };
  // op=late — '탑승을 늦게 눌렀다' 판정: atMin(지금, 분·소수 가능) 기준 시각표상 backMin(기본 1)분 전까지 이미 떠난 차가 있는가.
  //   분 단위로 본다 — 지금 분이나 backMin 분 전에 출발한 차면 late=그 출발 분(자정 넘으면 1440 이상), 아니면 late=null. (앱은 이 답만 따른다)
  if (op === 'late') {
    var back = q.back != null && isFinite(+q.back) ? Math.max(0, Math.min(3, Math.floor(+q.back))) : 1;
    var nowM = Math.floor(atMin), bl = nt.boardTable({ line: line, from: from, to: to, atMin: nowM - back, baseMs: baseMs });
    var dep = bl.depMin, ok = dep != null && isFinite(dep) && dep <= nowM && dep >= nowM - back;
    return { dk: bl.dk, depMin: dep, late: ok ? dep : null };
  }
  var b = nt.boardTable({ line: line, from: from, to: to, atMin: atMin, baseMs: baseMs });
  return { dk: b.dk, depMin: b.depMin };
}

async function handleNextTrain(request, env) {
  var H = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  var nt = await ntEnsure(env);
  if (!nt) return new Response(JSON.stringify({ error: '시각표를 불러오지 못했습니다', why: _NT_WHY }), { status: 503, headers: H });
  try {
    if (request.method === 'POST') {
      var body = await request.json();
      var items = (body && body.items || []).slice(0, 20);
      var outs = items.map(function (q) { var a = ntAnswer(nt, q || {}); a.id = q && q.id != null ? q.id : null; return a; });
      return new Response(JSON.stringify({ ver: nt.version || null, items: outs }), { headers: H });
    }
    var u = new URL(request.url), g = function (k) { return u.searchParams.get(k); };
    var a = ntAnswer(nt, { op: g('op'), line: g('line'), from: g('from'), to: g('to'), term: g('term'), atMin: g('atMin'), baseMs: g('baseMs'), day: g('day') });
    if (a.error) return new Response(JSON.stringify(a), { status: 400, headers: H });
    a.ver = nt.version || null; a.src = nt.src || null;
    return new Response(JSON.stringify(a), { headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: H });
  }
}

// /ride-eta 에 승차역 정보(boardInfo)가 오면 시각표(timetable)를 엔진이 채워 넣는다 — 앱은 시각표를 들고 있지 않는다.
//   boardInfo = { boardIdx, line, from, to }   (기존 timetable 이 같이 오면 그것을 우선한다)
async function handleRideEtaNT(request, env) {
  if (request.method === 'POST') {
    try {
      var body = await request.clone().json();
      if (body && body.boardInfo && !body.timetable) {
        var nt = await ntEnsure(env);
        if (nt) {
          var bi = body.boardInfo;
          var tb = nt.boardTimes({ line: String(bi.line || ''), from: String(bi.from || ''), to: bi.to ? String(bi.to) : '', baseMs: body.nowMs != null && isFinite(+body.nowMs) ? +body.nowMs : Date.now() });
          if (tb && tb.times) body.timetable = { boardIdx: bi.boardIdx, times: tb.times };
        }
        delete body.boardInfo;
        return handleRideEta(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body) }));
      }
    } catch (e) { /* 아래에서 원본 그대로 처리 */ }
  }
  return handleRideEta(request);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { ntLiveFirst: ntLiveFirst, ntLiveTargets: ntLiveTargets, ntLiveKey: ntLiveKey, ntEnsure: ntEnsure, ntAttachPath: ntAttachPath, ntAttachAll: ntAttachAll, ntAnswer: ntAnswer, handleNextTrain: handleNextTrain, handleRideEtaNT: handleRideEtaNT, _ntReset: function () { _NT = null; _NT_AT = 0; _NT_P = null; _NT_FAIL_AT = 0; _NT_WHY = ''; _NT_SRC = ''; } };
