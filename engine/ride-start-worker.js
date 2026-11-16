// 탑승 시작 엔진 Worker 연결부 — POST /ride/start (engine/ride-start.js 의 rideStart). route-v2 의 handleFetch 에 `if (url.pathname === "/ride/start") return handleRideStart(request, env);` 를 넣는다.
//   본문(JSON 글, Content-Type: text/plain): { cap(12 이상), r:{ data(경로 응답 그대로), tab, a, b, bt, rb, now, tz, th, allowed? } }
//   엔진은 아무것도 저장하지 않는다. 돌려주는 state 는 앱이 그대로 들고 있다가 5초마다 /ride-standby 에 실어 보낸다.
// ★ s456 (YJ: "경로 설정시에는 무조건 시간표 기반으로"): 버스에서 내려 갈아타는 지하철 승차역에 그 역의 공식 시각표(출발 분)를 싣는다 — node.tt = [처음 안내한 열차 뒤 60분 안의 출발 분, 16개까지].
//   앞 구간(버스)이 늦어 처음 안내한 열차를 놓치게 되면 ride-eta 가 '예정 + 늦은 만큼'이 아니라 이 시각표의 다음 열차로 옮긴다(_reTtNext). 폰은 이 뒤로 서버에 묻지 않아도 된다(규칙 4).
//   방향을 알 수 없거나(다음 역이 같은 노선이 아님) 시각표가 없으면 싣지 않는다 — 그때는 예전처럼 '예정 + 늦은 만큼'으로 보이다가 환승역에 닿아 /board-live 답으로 맞춘다.
var RST_TT_SPAN_MIN = 60, RST_TT_MAX = 16;
function rstXferSubIdx(state) {
  var out = [], nodes = state && state.eta && state.eta.nodes, k;
  if (!Array.isArray(nodes)) return out;
  for (k = 2; k + 1 < nodes.length; k++) {
    var nd = nodes[k], pv = nodes[k - 1], nx = nodes[k + 1];
    if (!nd || !pv || !nx || nd.isSub !== true || nd.isBus === true || pv.isBus !== true || pv.isSub === true) continue;
    if (nd.planMin == null || !isFinite(+nd.planMin) || nx.isSub !== true || String(nx.lineName || '') !== String(nd.lineName || '') || !nd.name || !nx.name) continue;
    out.push(k);
  }
  return out;
}
function rstAttachXferTT(state, nt, baseMs) {
  var done = 0;
  try {
    if (!nt || typeof nt.boardTimes !== 'function') return 0;
    var idx = rstXferSubIdx(state), nodes = state.eta.nodes, q, j;
    for (q = 0; q < idx.length; q++) {
      var nd = nodes[idx[q]], nx = nodes[idx[q] + 1], pm = +nd.planMin, tb = null;
      try { tb = nt.boardTimes({ line: String(nd.lineName || ''), from: String(nd.name), to: String(nx.name), baseMs: baseMs }); } catch (e1) { tb = null; }
      var times = tb && Array.isArray(tb.times) ? tb.times : null, tt = [];
      if (!times) continue;
      for (j = 0; j < times.length; j++) {
        var t = +times[j]; if (!isFinite(t)) continue;
        var d = t - pm; d = d - Math.round(d / 1440) * 1440;          // 자정 접힘(ride-eta 의 _reFold 와 같다)
        if (d > 0 && d <= RST_TT_SPAN_MIN) tt.push(pm + d);
      }
      tt.sort(function (a, b) { return a - b; });
      tt = tt.filter(function (v, i2) { return i2 === 0 || v !== tt[i2 - 1]; }).slice(0, RST_TT_MAX);
      if (tt.length) { nd.tt = tt; done++; }
    }
  } catch (e) { }
  return done;
}
async function handleRideStart(request, env) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 3000000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  var out;
  try { out = rideStart({ cap: Number(body.cap) || 0 }, body.r); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2) }), { status: 500, headers: H }); }
  // s456: 버스→지하철 환승이 있는 경로면 그 승차역 시각표를 state 에 싣는다(시각표는 보통 이미 메모리에 있다 — 늦으면 2초에서 끊고 싣지 않는다).
  try {
    if (out && out.ok && out.state && typeof ntEnsure === "function" && rstXferSubIdx(out.state).length) {
      var ttTimer = null, ttCut = new Promise(function (res) { ttTimer = setTimeout(function () { res(null); }, 2000); });
      var nt = await Promise.race([Promise.resolve().then(function () { return ntEnsure(env); }).then(function (v) { return v; }, function () { return null; }), ttCut]);
      if (ttTimer) clearTimeout(ttTimer);
      if (nt) rstAttachXferTT(out.state, nt, isFinite(Number(body.r && body.r.now)) ? Number(body.r.now) : Date.now());
    }
  } catch (e3) { }
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { status: out.ok ? 200 : 400, headers: H });
}

// ★ s200 POST /ride/buspick — 첫 구간이 버스면 정류장 도착정보에서 10분 안에 오는 버스를 골라 보여 줄 안내창(kind:bpick)을 만든다. route-v2 의 handleFetch 에 `if (url.pathname === "/ride/buspick") return handleRideBusPick(request, env);` 를 넣는다.
//   본문은 /ride/start 와 같다({ cap, r }). 답: { ok:true, ask:false } (고를 것이 없다 — 그냥 시작) | 안내창 화면(dialogScreen) + ask:true + info.items:[{ sec, ms }]. 앱은 단추 dl.bp.N 의 N 번째 ms 를 /ride/start 의 r.pick.ms 로 보낸다.
async function handleRideBusPick(request, env) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 3000000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  var nil = function () { return new Response(JSON.stringify({ ok: true, v: 1, ask: false, ver: ENGINE_VERSION }), { headers: H }); };
  var cap = Number(body.cap) || 0, ask = null, legMode = !!(body.r && typeof body.r === 'object' && body.r.leg != null);      // s319: r.leg = 중간에 갈아타는 버스 구간(0부터) — 없으면 첫 구간 버스(시작 때)
  try { ask = legMode ? rideBusLegAsk({ cap: cap }, body.r) : rideBusAsk({ cap: cap }, body.r); } catch (e2) { ask = null; }
  if (!ask) return nil();
  var m = null;
  try {
    if (typeof liveCityOk === "function" && !liveCityOk(env, ask.cc, ask.sid)) return nil();
    var timer = null, cut = new Promise(function (res) { timer = setTimeout(function () { res(null); }, 3800); });
    m = await Promise.race([Promise.resolve().then(function () { return fetchStopArrivalsAny(ask.cc, ask.sid, env, Date.now() + 3500, typeof LIVE_BUDGET_REF !== "undefined" ? LIVE_BUDGET_REF : { used: 0 }, null); }), cut]);
    if (timer) clearTimeout(timer);
  } catch (e3) { m = null; }
  var items = [];
  try { items = rideBusItemsMulti(m, [ask.no].concat(ask.alts || []), body.r && body.r.now, typeof noKey === "function" ? noKey : null); } catch (e5) { items = []; }
  if (legMode) { try { items = rideBusLegItems(items, ask, body.r && body.r.now); } catch (e6) { items = []; } }      // s319: 계획 번호와 5분 안에 오는 다른 번호가 있을 때만 묻는다
  if (!items.length) return nil();
  items.forEach(function (it) { var e = ask.ends && ask.ends[it.no]; it.en = (e && e.n) ? e.n : (it.no === ask.no ? ask.end : ''); });      // s293c: 버스마다 한 줄 — '○○에서 내려요'(대체 번호는 그 번호가 내리는 정류장, 내 번호는 계획한 하차 정류장)
  if (items.length === 1 && !legMode) {          // s250 (YJ: "어차피 버스 오는 게 하나뿐이면 묻지 말고 그 버스를 타게"): 하나뿐이면 묻지 않는다 — 그 버스를 따라가도록 도착 시각(ms)만 돌려준다(s265: 번호도)
    return new Response(JSON.stringify({ ok: true, v: 1, ask: false, auto: { ms: items[0].ms, sec: items[0].sec, no: items[0].no }, ver: ENGINE_VERSION }), { headers: H });
  }
  var card;
  try { card = dialogScreen({ cap: cap }, { kind: "bpick", no: ask.no, stop: ask.stop, items: items, mid: legMode ? 1 : 0 }); } catch (e4) { card = null; }
  if (!card || !card.ok) return nil();
  card.ask = true; card.ver = ENGINE_VERSION;
  if (legMode) card.leg = { j: ask.leg, i: ask.i, ek: ask.ek, cc: ask.cc, sid: ask.sid, no: ask.no, end: ask.end, ends: ask.ends, patch: ask.patch };      // 앱이 고른 번호를 달리는 안내(state)에 옮길 때 쓴다
  return new Response(JSON.stringify(card), { headers: H });
}
