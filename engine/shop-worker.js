// 쇼핑 화면 엔진 Worker 연결부 — GET /screen/shop (engine/shop.js 의 shopScreen 을 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/screen/shop") return handleScreenShop(request);` 를 넣는다.
//   · 상품: 쇼핑 서버(gildongmu-shop) /shop 의 data 를 60초 메모리에 둔다. 서버가 잠깐 안 되면 마지막으로 받은 것을 쓴다(없으면 503 — 앱은 저장해 둔 화면 또는 예전 웹 쇼핑으로 간다).
//   · 운영 설정: gildongmu-food /app-config?k=shop (계절 규칙) 10분. 못 받으면 null → 내장 규칙.
//   · 날씨: 장면 엔진과 같은 sceneWeather(lat,lng) (subway-api /weather, 10분 캐시). 위치를 안 주면 날씨 없이 계산한다.
//   쿼리: cat(카테고리, 기본 추천) · lat · lng · now(ms, 시험용) · tz(분, 기본 540) · cap(앱이 그릴 수 있는 화면 규격 수준, 2 이상이면 안내 상자·검색줄 포함)
var SHOP_API_URL = "https://gildongmu-shop.phg0643.workers.dev";
var SHOP_CFG_URL = "https://gildongmu-food.phg0643.workers.dev/app-config?k=shop";
var SHOP_MEM = { data: null, ts: 0, ver: "", cfg: null, cfgTs: 0 };
async function shopFetchJson(u, ms) {
  var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, ms);
  try { var r = await fetch(u, { signal: ac.signal }); clearTimeout(t); return r.ok ? await r.json() : null; }
  catch (e) { clearTimeout(t); return null; }
}
async function shopLoad() {
  var now = Date.now();
  if (!SHOP_MEM.data || now - SHOP_MEM.ts > 60000) {
    var j = await shopFetchJson(SHOP_API_URL + "/shop", 4000);
    if (j && j.ok && j.data && j.data.CATS && j.data.CATS.length && j.data.WEEKDAY && j.data.WEEKDAY.length) { SHOP_MEM.data = j.data; SHOP_MEM.ver = String(j.version || ""); SHOP_MEM.ts = now; }
  }
  if (now - SHOP_MEM.cfgTs > 600000) {
    SHOP_MEM.cfgTs = now;                                   // 실패해도 10분은 다시 묻지 않는다
    var c = await shopFetchJson(SHOP_CFG_URL, 2500);
    if (c && c.ok && c.v && typeof c.v === "object") SHOP_MEM.cfg = c.v;
  }
  return SHOP_MEM;
}
async function handleScreenShop(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  var u = new URL(request.url), q = u.searchParams;
  var mem = await shopLoad();
  if (!mem.data) return new Response(JSON.stringify({ ok: false, error: "no-data" }), { status: 503, headers: H });
  var lat = Number(q.get("lat")), lng = Number(q.get("lng")), wx = null;
  if (q.get("lat") != null && q.get("lng") != null) { try { wx = await sceneWeather(lat, lng); } catch (e) { wx = null; } }
  var inp = { nowMs: q.get("now") ? Number(q.get("now")) : Date.now(), tzOffsetMin: q.get("tz") ? Number(q.get("tz")) : 540, cat: q.get("cat") || "", cap: Number(q.get("cap")) || 0 };
  var out;
  try { out = shopScreen(inp, mem.data, mem.cfg, wx); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2) }), { status: 500, headers: H }); }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 503, headers: H });
  out.ver = ENGINE_VERSION; out.shopVer = mem.ver;
  return new Response(JSON.stringify(out), { headers: H });
}
