// 장면 엔진 Worker 연결부 — POST /scene (engine/scene.js 의 sceneDecide 를 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/scene") return handleScene(request);` 를 넣는다.
// 날씨는 Open-Meteo 에서 엔진이 직접 받는다(wxMeteo, s218 — 예전 subway-api /weather 는 배포본에 없었다). 10분 캐시.
// ★ s218: 날씨는 Open-Meteo(키 없음)에서 엔진이 직접 받는다. 예전엔 subway-api 워커의 /weather 를 불렀는데 배포된 그 워커에는 그 길이 없어(Not found)
//   홈 AI 브리핑·장면·쇼핑·출퇴근 브리핑의 날씨가 한 번도 안 나왔다. 반환: { temp, feel, hum, wind(km/h), uv, rain(%, 앞으로 3시간 최대), tmin, tmax, txt } | null
var WX_CODES = { 0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개", 51: "이슬비", 53: "이슬비", 55: "이슬비", 56: "어는 비", 57: "어는 비", 61: "비", 63: "비", 65: "강한 비", 66: "어는 비", 67: "어는 비", 71: "눈", 73: "눈", 75: "강한 눈", 77: "눈", 80: "소나기", 81: "소나기", 82: "강한 소나기", 85: "눈", 86: "눈", 95: "천둥번개", 96: "천둥번개", 99: "천둥번개" };
// s251 (YJ: "API 호출량을 다 쓰면 날씨 연동은 하지 마"): Open-Meteo 가 한도 초과(429)를 알리면 10분 동안은 부르지도 않고 날씨를 아예 내지 않는다(옛 캐시도 쓰지 않는다) — 장면·브리핑·위젯은 날씨 없이 그린다.
var WX_COOL_UNTIL = 0;
function wxLimited() { return Date.now() < WX_COOL_UNTIL; }
async function wxMeteo(lat, lng, signal) {
  if (wxLimited()) return null;
  var r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + Number(lat).toFixed(3) + "&longitude=" + Number(lng).toFixed(3) + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&hourly=precipitation_probability&daily=uv_index_max,temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=Asia%2FSeoul&wind_speed_unit=kmh", { signal: signal });
  if (r && r.status === 429) { WX_COOL_UNTIL = Date.now() + 6e5; return null; }
  var j = r.ok ? await r.json() : null, c = j && j.current;
  if (!c || typeof c.temperature_2m !== "number") return null;
  var n = function (v) { return typeof v === "number" && isFinite(v) ? v : null; }, rd = function (v) { v = n(v); return v == null ? null : Math.round(v); };
  var rain = null, hr = j.hourly && Array.isArray(j.hourly.time) && Array.isArray(j.hourly.precipitation_probability) ? j.hourly : null;
  if (hr) { var ix = hr.time.indexOf(String(c.time || "").slice(0, 13) + ":00"); if (ix < 0) ix = 0; for (var q = ix; q < Math.min(hr.time.length, ix + 3); q++) { var pv = n(hr.precipitation_probability[q]); if (pv != null) rain = rain == null ? pv : Math.max(rain, pv); } }
  var d = j.daily || {}, first = function (a) { return Array.isArray(a) ? n(a[0]) : null; };
  return { temp: Math.round(c.temperature_2m), feel: rd(c.apparent_temperature), hum: rd(c.relative_humidity_2m), wind: n(c.wind_speed_10m) == null ? null : Math.round(c.wind_speed_10m * 10) / 10, uv: first(d.uv_index_max) == null ? null : Math.round(first(d.uv_index_max) * 10) / 10, rain: rain == null ? null : Math.round(rain), tmin: rd(first(d.temperature_2m_min)), tmax: rd(first(d.temperature_2m_max)), txt: WX_CODES[c.weather_code] || "구름 조금" };
}
async function sceneWeather(lat, lng) {
  if (!(isFinite(lat) && isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132)) return null;
  if (wxLimited()) return null;
  var key = Math.round(lat * 20) + "," + Math.round(lng * 20), c = SCENE_WX_CACHE[key], now = Date.now();
  if (c && now - c.ts < 6e5) return c.wx;
  try {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 3500);
    var w = await wxMeteo(lat, lng, ac.signal);
    clearTimeout(t);
    if (w) { var wx = { temp: w.temp, rain: w.rain, txt: String(w.txt || "").slice(0, 12), feel: w.feel, wind: w.wind, uv: w.uv, hum: w.hum }; SCENE_WX_CACHE[key] = { ts: now, wx: wx }; return wx; }
  } catch (e) {}
  return c && !wxLimited() ? c.wx : null;
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
