// 탑승 시작 엔진 Worker 연결부 — POST /ride/start (engine/ride-start.js 의 rideStart). route-v2 의 handleFetch 에 `if (url.pathname === "/ride/start") return handleRideStart(request);` 를 넣는다.
//   본문(JSON 글, Content-Type: text/plain): { cap(12 이상), r:{ data(경로 응답 그대로), tab, a, b, bt, rb, now, tz, th, allowed? } }
//   엔진은 아무것도 저장하지 않는다. 돌려주는 state 는 앱이 그대로 들고 있다가 5초마다 /ride-standby 에 실어 보낸다.
async function handleRideStart(request) {
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
  var cap = Number(body.cap) || 0, ask = null;
  try { ask = rideBusAsk({ cap: cap }, body.r); } catch (e2) { ask = null; }
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
  if (!items.length) return nil();
  items.forEach(function (it) { var e = ask.ends && ask.ends[it.no]; it.en = (e && e.n) ? e.n : (it.no === ask.no ? ask.end : ''); });      // s293c: 버스마다 한 줄 — '○○에서 내려요'(대체 번호는 그 번호가 내리는 정류장, 내 번호는 계획한 하차 정류장)
  if (items.length === 1) {          // s250 (YJ: "어차피 버스 오는 게 하나뿐이면 묻지 말고 그 버스를 타게"): 하나뿐이면 묻지 않는다 — 그 버스를 따라가도록 도착 시각(ms)만 돌려준다(s265: 번호도)
    return new Response(JSON.stringify({ ok: true, v: 1, ask: false, auto: { ms: items[0].ms, sec: items[0].sec, no: items[0].no }, ver: ENGINE_VERSION }), { headers: H });
  }
  var card;
  try { card = dialogScreen({ cap: cap }, { kind: "bpick", no: ask.no, stop: ask.stop, items: items }); } catch (e4) { card = null; }
  if (!card || !card.ok) return nil();
  card.ask = true; card.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(card), { headers: H });
}
