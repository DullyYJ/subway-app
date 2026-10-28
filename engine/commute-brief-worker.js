// 출퇴근 브리핑 Worker 연결부 — POST /commute-brief (engine/commute-brief.js 의 cbPlan · cbCompose 를 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/commute-brief") return handleCommuteBrief(request, env, ctx);` 를 넣는다.
//   본문: { kind:'morn'|'eve', nowMs, from, to, eFrom, eTo (각 {nm,lat?,lng?,bus?}), gps?:{lat,lng} }  → { ok, v, title, body, route }
//   날씨(온도·체감·습도·최저최고·강수·자외선·바람)는 Open-Meteo(wxMeteo, scene-worker.js)에서 출발지·도착지 좌표로 받는다(2.5초 · 10분 캐시). 못 받으면 날씨 줄만 빠진다.
var CB_WX_CACHE = {};
async function cbWeather(lat, lng) {
  if (!(isFinite(lat) && isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132)) return null;
  if (typeof wxLimited === "function" && wxLimited()) return null;          // s251: 날씨 API 한도를 다 썼으면 날씨 없이
  var key = Math.round(lat * 20) + "," + Math.round(lng * 20), c = CB_WX_CACHE[key], now = Date.now();
  if (c && now - c.ts < 6e5) return c.wx;
  try {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 3500);
    var j = typeof wxMeteo === "function" ? await wxMeteo(lat, lng, ac.signal) : null;      // s218: Open-Meteo 직접(예전 subway-api /weather 는 배포본에 없었다)
    clearTimeout(t);
    if (j && typeof j.temp === "number") { if (Object.keys(CB_WX_CACHE).length > 60) CB_WX_CACHE = {}; CB_WX_CACHE[key] = { ts: now, wx: j }; return j; }
  } catch (e) {}
  return c && !(typeof wxLimited === "function" && wxLimited()) ? c.wx : null;
}
// s285: 가장 빠른 경로의 소요(분) · 환승 — 경로 탐색(handleRouteV2, 같은 Worker 안)을 2.8초 안에. 못 구하면 null(줄만 빠진다). 알림이 요청할 때만(eta:1) — 위젯 좌표 갱신 같은 호출마다 경로 탐색을 하지 않는다.
async function cbEta(plan, nowMs, env, ctx) {
  try {
    var a = plan.fromStn, b = plan.toStn;
    if (!a || !b || a.lat == null || b.lat == null || typeof handleRouteV2 !== "function" || typeof SUBWAY_BUNDLE === "undefined") return null;
    var qs = "SX=" + a.lng + "&SY=" + a.lat + "&EX=" + b.lng + "&EY=" + b.lat + "&baseMs=" + nowMs + "&SN=" + encodeURIComponent(a.name) + "&EN=" + encodeURIComponent(b.name);
    var u = new URL("https://route.internal/route-v2-app?" + qs), rq = new Request(u.toString(), { method: "GET" });
    var res = await Promise.race([handleRouteV2(rq, env, u, SUBWAY_BUNDLE, ctx), new Promise(function (r) { setTimeout(function () { r(null); }, 2800); })]);
    if (!res || !res.ok) return null;
    var j = await res.json(), ps = j && j.result && j.result.path, best = null;
    if (!Array.isArray(ps)) return null;
    ps.forEach(function (p) { var t = p && p.info && p.info.totalTime; if (typeof t === "number" && t > 0 && (!best || t < best.min)) best = { min: t, xfer: typeof p.info.transferCount === "number" ? p.info.transferCount : null }; });
    return best;
  } catch (e) { return null; }
}
async function handleCommuteBrief(request, env, ctx) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "POST only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 6000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e0) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  var out;
  try {
    var plan = cbPlan(body);
    var nowMs = Number(body.nowMs) || Date.now();
    var got = await Promise.all([cbWeather(plan.la, plan.ln), (plan.toStn && plan.toStn.lat != null) ? cbWeather(plan.toStn.lat, plan.toStn.lng) : null, body.eta === 1 ? cbEta(plan, nowMs, env, ctx) : null]);      // 날씨 둘 · 경로 소요를 동시에(알림은 8초 안에 받아야 한다)
    out = cbCompose(plan, { nowMs: nowMs, eta: got[2] }, got[0], got[1]);
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
  out.ok = true;
  return new Response(JSON.stringify(out), { headers: H });
}
