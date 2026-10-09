// 길동무 — '다음 열차' 엔진의 Worker 연결부 (route-v2 Worker 안에서 next-train.js·next-train-data.js 뒤에 붙는다)
//
// ★ 원칙(YJ): "계산은 전부 엔진이 한다. 앱은 그리기만 한다."
//   · 경로 응답(/route-v2-app)의 지하철 구간마다 엔진이 다음 열차까지의 대기(ttWaitMs)와 안내용 정보(nextTrain)를 붙여 준다.
//   · 앱이 승차 시각에 맞춰 다시 물어볼 때는 GET/POST /next-train 으로 묻는다.
//   · 시각표 데이터는 gildongmu-tt 번들(앱이 쓰던 것과 같은 것)을 불러와 KV 에 6시간 둔다. 못 불러오면 값을 붙이지 않을 뿐 경로는 그대로 나간다.

var NT_TT_URL = "https://gildongmu-tt.phg0643.workers.dev/tt";
var NT_KV_KEY = "nt:bundle:v1";
var NT_TTL_MS = 6 * 3600 * 1000;
var NT_MAX_WAIT_MIN = 30;         // 앱의 옛 _TT_MAX_WAIT — 대기가 이보다 길면 반영하지 않는다(막차 뒤·시각표 이상)
var _NT = null, _NT_AT = 0, _NT_P = null, _NT_FAIL_AT = 0;

async function ntEnsure(env) {
  if (_NT && Date.now() - _NT_AT < NT_TTL_MS) return _NT;
  if (_NT_P) return _NT_P;
  if (!_NT && _NT_FAIL_AT && Date.now() - _NT_FAIL_AT < 30000) return null;   // 직전에 실패했으면 30초는 다시 시도하지 않는다
  _NT_P = (async function () {
    var bundle = null, txt = null;
    try { if (env && env.ROWS_KV) txt = await env.ROWS_KV.get(NT_KV_KEY, { cacheTtl: 3600 }); } catch (e) {}
    if (txt) { try { bundle = JSON.parse(txt); } catch (e) { bundle = null; } }
    if (!bundle || !bundle.data) {
      bundle = null;
      try {
        var r = await fetch(NT_TT_URL);
        if (r.ok) {
          txt = await r.text();
          bundle = JSON.parse(txt);
          if (bundle && bundle.data && env && env.ROWS_KV) { try { await env.ROWS_KV.put(NT_KV_KEY, txt, { expirationTtl: NT_TTL_MS / 1000 }); } catch (e) {} }
        }
      } catch (e) { bundle = null; }
    }
    if (!bundle || !bundle.data) { _NT_FAIL_AT = Date.now(); return _NT || null; }   // 실패하면 있던 것을 계속 쓴다
    var d = bundle.data;
    _NT = ntCreate({
      _REAL_TT: d._REAL_TT, _GIMPO_TT: d._GIMPO_TT, _BUILTIN_TT: d._BUILTIN_TT, LINE_SCHEDULE: d.LINE_SCHEDULE,
      _REAL_SEG: d._REAL_SEG, _TT_ORDER_HARD: d._TT_ORDER_HARD, _INCHEON_TT: NT_INCHEON_TT, STNORDER: NT_STNORDER
    });
    _NT.version = bundle.version || null;
    _NT_AT = Date.now(); _NT_FAIL_AT = 0;
    return _NT;
  })();
  try { return await _NT_P; } finally { _NT_P = null; }
}

// 경로 하나(path = { info, subPath })의 지하철 구간마다 nextTrain(안내용)과 ttWaitMs(타임라인 대기)를 붙인다.
//   baseMs: 탐색 기준 시각(요청의 baseMs).  bf: 앱이 '예상 시각 모드'라 운행종료 보정(svcWarn.shift)을 쓰지 않을 때 true.
//   ttWaitMs 의 의미 = 앱의 옛 계산과 같다: 그 구간을 타러 가는 시각(탐색 시각 + 구간 startSec + 앞 구간 대기 누적)에 승차역에 닿으면
//   다음 열차까지 기다리는 시간. 0~30분일 때만 붙는다. 앞 구간의 대기는 뒤 구간 시각에 그대로 이어진다(앱이 합산해 그린다).
function ntAttachPath(nt, path, baseMs, bf) {
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
  var base0 = baseMs + shiftMs, acc = 0, n = 0;
  for (var k = 0; k < sub.length; k++) {
    var leg = sub[k];
    if (!leg || leg.trafficType !== 1) continue;
    delete leg.ttWaitMs; delete leg.nextTrain;          // 캐시된 경로 객체에 남은 이전 요청 값을 지운다
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
    if (dep != null) {
      var w = dep - bm;
      if (w > 0 && w <= NT_MAX_WAIT_MIN) { var wMs = Math.round(w * 60000); leg.ttWaitMs = wMs; acc += wMs; n++; }
    }
  }
  if (path.info) path.info.ttApplied = true;
  return n;
}

async function ntAttachAll(env, od, baseMs, bf) {
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
    for (var p = 0; p < paths.length; p++) ntAttachPath(nt, paths[p], baseMs, bf);
    od.ntVer = nt.version || null;
  } catch (e) {}
}

// /next-train — 앱이 승차 시각에 맞춰 다시 묻는 용도.
//   GET  ?op=board&line=1호선&from=서울역&to=남영&atMin=480.5&baseMs=…   → { dk:'상'|'하', depMin }
//        ?op=times (같은 인자)                                            → { dk, times:[…]|null }
//        ?op=info  (같은 인자, atMin 없음; 기준 시각 = baseMs)             → { info:{found,depMin,firstMin,dir} }
//        ?op=fwd&line=…&from=내다음역&to=내릴역&term=열차종착역            → { fwd:true|false|null }  (실시간 도착정보 열차가 내 진행 방향인지)
//   POST { items:[{ id, op, … }] } → { items:[{ id, … }] }  (한 번에 여러 개)
function ntAnswer(nt, q) {
  var baseMs = q.baseMs != null && isFinite(+q.baseMs) && +q.baseMs > 0 ? +q.baseMs : Date.now();
  var line = String(q.line || ''), from = String(q.from || ''), to = q.to ? String(q.to) : '';
  if (!line || !from) return { error: 'line, from 필요' };
  if (q.op === 'fwd') return { fwd: nt.forward(line, from, to, q.term) };      // from=내 다음 역, to=내릴 역, term=열차 종착역
  var op = q.op || 'board';
  if (op === 'times') { var t = nt.boardTimes({ line: line, from: from, to: to, baseMs: baseMs }); return { dk: t.dk, times: t.times }; }
  if (op === 'info') { return { info: nt.metroInfo({ line: line, from: from, to: to, baseMs: baseMs, mins: 0 }) }; }
  var atMin = q.atMin != null && isFinite(+q.atMin) ? +q.atMin : null;
  if (atMin == null) return { error: 'atMin 필요' };
  var b = nt.boardTable({ line: line, from: from, to: to, atMin: atMin, baseMs: baseMs });
  return { dk: b.dk, depMin: b.depMin };
}

async function handleNextTrain(request, env) {
  var H = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  var nt = await ntEnsure(env);
  if (!nt) return new Response(JSON.stringify({ error: '시각표를 불러오지 못했습니다' }), { status: 503, headers: H });
  try {
    if (request.method === 'POST') {
      var body = await request.json();
      var items = (body && body.items || []).slice(0, 20);
      var outs = items.map(function (q) { var a = ntAnswer(nt, q || {}); a.id = q && q.id != null ? q.id : null; return a; });
      return new Response(JSON.stringify({ ver: nt.version || null, items: outs }), { headers: H });
    }
    var u = new URL(request.url), g = function (k) { return u.searchParams.get(k); };
    var a = ntAnswer(nt, { op: g('op'), line: g('line'), from: g('from'), to: g('to'), term: g('term'), atMin: g('atMin'), baseMs: g('baseMs') });
    if (a.error) return new Response(JSON.stringify(a), { status: 400, headers: H });
    a.ver = nt.version || null;
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

if (typeof module !== 'undefined' && module.exports) module.exports = { ntEnsure: ntEnsure, ntAttachPath: ntAttachPath, ntAttachAll: ntAttachAll, ntAnswer: ntAnswer, handleNextTrain: handleNextTrain, handleRideEtaNT: handleRideEtaNT, _ntReset: function () { _NT = null; _NT_AT = 0; _NT_P = null; _NT_FAIL_AT = 0; } };
