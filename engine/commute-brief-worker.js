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
// s286: 응원 문구 한 달 치 — 서버가 달마다 만들어 KV(ROWS_KV "cheer:YYYY-MM")에 둔다. 알림 때 읽고(없으면 조각 조합으로 그 자리에서 만든다), cron(scheduled)이 달 바뀔 때·25일 이후 다음 달 것을 미리 만든다.
function cbCheerKey(ms) { var d = new Date(ms + 9 * 3600000); return "cheer:" + d.getUTCFullYear() + "-" + (d.getUTCMonth() < 9 ? "0" : "") + (d.getUTCMonth() + 1); }
async function cbCheerLoad(env, nowMs, ctx) {
  var key = cbCheerKey(nowMs), got = null;
  try { if (env && env.ROWS_KV) got = await env.ROWS_KV.get(key, { type: "json", cacheTtl: 3600 }); } catch (e) {}
  if (got && got.ym && got.morn && got.eve) return got;
  var built = cbCheerMonth(nowMs);                                  // KV 에 아직 없으면(cron 이 못 돌았으면) 조각 조합으로 — 저장은 cron 만 한다(AI 문구를 덮어쓰지 않게)
  return built;
}
// Gemini 로 한 달 치를 쓴다 — 서버 비밀값 GEMINI_API_KEY 가 있을 때만(없거나 실패하면 null → 조각 조합). cron 에서만 부른다(달마다 한 번).
async function cbCheerGen(env, nowMs) {
  var key = env && env.GEMINI_API_KEY;
  if (!key || typeof fetch !== "function") return null;
  var mo = new Date(nowMs + 9 * 3600000).getUTCMonth() + 1;
  var prompt = "한국 수도권 대중교통 출퇴근 이용자에게 보내는 " + mo + "월의 응원 문구를 쓰세요. JSON 으로만 출력: {\"morn\":[31개],\"eve\":[31개]}\n조건:\n- morn 은 출근길: 오늘 하루를 힘차게 시작하도록 북돋는 말. eve 는 퇴근길: 하루 고생한 사용자를 따뜻하게 위로하는 말.\n- 각각 31개, 서로 모두 다른 문장, 한 문장 12~40자, 부드러운 ~해요 체, 마침표로 끝낼 것.\n- " + mo + "월의 계절감(날씨 · 풍경 · 분위기)을 자연스럽게 담되 요일 · 날짜 · 구체적 날씨(비, 눈 등)는 쓰지 말 것(앞에 따로 붙는다).\n- 이모지 · 정치 · 종교 · 광고 금지.";
  var models = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  for (var i = 0; i < models.length; i++) {
    try {
      var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 20000);
      var res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + models[i] + ":generateContent?key=" + encodeURIComponent(key), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 1 } }), signal: ac.signal });
      clearTimeout(t);
      var j = await res.json();
      var txt = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
      if (!txt) continue;
      var ok = cbCheerValidate(JSON.parse(String(txt).replace(/^```(?:json)?\s*|\s*```$/g, "")));
      if (ok) return ok;
    } catch (e) {}
  }
  return null;
}
async function cbCheerCron(env) {
  if (!env || !env.ROWS_KV) return { skipped: "no-kv" };
  var now = Date.now(), d = new Date(now + 9 * 3600000), ms = [now];
  if (d.getUTCDate() >= 25) ms.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15) - 9 * 3600000);       // 25일부터 다음 달 것도
  var made = [];
  for (var i = 0; i < ms.length; i++) {
    var key = cbCheerKey(ms[i]), have = null;
    try { have = await env.ROWS_KV.get(key, "json"); } catch (e) {}
    if (have && (have.src !== "macro" || !env.GEMINI_API_KEY || Date.now() - (have.at || 0) < 20 * 3600000)) continue;      // 있으면 그대로 · AI 키가 있는데 조각 조합으로 만들어졌으면 하루 한 번 다시 시도
    var m = cbCheerMonth(ms[i]), g = await cbCheerGen(env, ms[i]);          // AI 가 쓴 것이 검사를 통과하면 그것을, 아니면 조각 조합을
    if (g) { m.morn = g.morn; m.eve = g.eve; m.src = "gemini"; } else m.src = "macro";
    m.at = Date.now();
    await env.ROWS_KV.put(key, JSON.stringify(m), { expirationTtl: 50 * 24 * 3600 });
    made.push(key);
  }
  return { made: made };
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
    var got = await Promise.all([cbWeather(plan.la, plan.ln), (plan.toStn && plan.toStn.lat != null) ? cbWeather(plan.toStn.lat, plan.toStn.lng) : null, body.eta === 1 ? cbEta(plan, nowMs, env, ctx) : null, cbCheerLoad(env, nowMs, ctx)]);      // 날씨 둘 · 경로 소요 · 이달 응원 문구를 동시에(알림은 8초 안에 받아야 한다)
    out = cbCompose(plan, { nowMs: nowMs, eta: got[2], cheer: got[3] }, got[0], got[1]);
  } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
  out.ok = true;
  return new Response(JSON.stringify(out), { headers: H });
}
