// 출퇴근 브리핑 Worker 연결부 — POST /commute-brief (engine/commute-brief.js 의 cbPlan · cbCompose 를 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/commute-brief") return handleCommuteBrief(request);` 를 넣는다.
//   본문: { kind:'morn'|'eve', nowMs, from, to, eFrom, eTo (각 {nm,lat?,lng?,bus?}), gps?:{lat,lng} }  → { ok, v, title, body, route }
//   날씨(온도·체감·습도·최저최고·강수·자외선·바람)는 subway-api /weather(WSAY_WX_URL)에서 출발지·도착지 좌표로 받는다(2.5초 · 10분 캐시). 못 받으면 날씨 줄만 빠진다.
var CB_WX_CACHE = {};
async function cbWeather(lat, lng) {
  if (!(isFinite(lat) && isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132)) return null;
  var key = Math.round(lat * 20) + "," + Math.round(lng * 20), c = CB_WX_CACHE[key], now = Date.now();
  if (c && now - c.ts < 6e5) return c.wx;
  try {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 2500);
    var r = await fetch(WSAY_WX_URL + "?lat=" + lat + "&lng=" + lng, { signal: ac.signal });
    clearTimeout(t);
    var j = r.ok ? await r.json() : null;
    if (j && j.ok !== false && typeof j.temp === "number") { if (Object.keys(CB_WX_CACHE).length > 60) CB_WX_CACHE = {}; CB_WX_CACHE[key] = { ts: now, wx: j }; return j; }
  } catch (e) {}
  return c ? c.wx : null;
}
async function handleCommuteBrief(request) {
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
    var wF = await cbWeather(plan.la, plan.ln);
    var wT = (plan.toStn && plan.toStn.lat != null) ? await cbWeather(plan.toStn.lat, plan.toStn.lng) : null;
    out = cbCompose(plan, { nowMs: Number(body.nowMs) || Date.now() }, wF, wT);
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
  out.ok = true;
  return new Response(JSON.stringify(out), { headers: H });
}
