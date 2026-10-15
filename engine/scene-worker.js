// 장면 엔진 Worker 연결부 — POST /scene (engine/scene.js 의 sceneDecide 를 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/scene") return handleScene(request);` 를 넣는다.
// 날씨는 subway-api 워커(/weather)에서 엔진이 직접 받는다(WSAY_WX_URL — 위젯 응원 멘트와 같은 값). 10분 캐시.
async function sceneWeather(lat, lng) {
  if (!(isFinite(lat) && isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132)) return null;
  var key = Math.round(lat * 20) + "," + Math.round(lng * 20), c = SCENE_WX_CACHE[key], now = Date.now();
  if (c && now - c.ts < 6e5) return c.wx;
  try {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 2500);
    var r = await fetch(WSAY_WX_URL + "?lat=" + lat + "&lng=" + lng, { signal: ac.signal });
    clearTimeout(t);
    var j = r.ok ? await r.json() : null;
    if (j && j.ok !== false && typeof j.temp === "number") { var wx = { temp: j.temp, rain: typeof j.rain === "number" ? j.rain : null, txt: String(j.txt || "").slice(0, 12) }; SCENE_WX_CACHE[key] = { ts: now, wx: wx }; return wx; }
  } catch (e) {}
  return c ? c.wx : null;
}
async function handleScene(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: H });
  var body;
  try { body = await request.json(); } catch (e) { return new Response(JSON.stringify({ error: "JSON 아님" }), { status: 400, headers: H }); }
  var wx = await sceneWeather(Number(body && body.lat), Number(body && body.lng)), out;
  try { out = sceneDecide(body, wx); } catch (e2) { return new Response(JSON.stringify({ error: String(e2 && e2.message || e2) }), { status: 500, headers: H }); }
  out.v = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}
