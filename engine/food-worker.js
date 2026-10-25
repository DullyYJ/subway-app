// 맛집 화면 엔진 Worker 연결부 — POST /screen/food (engine/food.js 의 foodScreen 을 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/screen/food") return handleScreenFood(request);` 를 넣는다.
//   본문(JSON 글, Content-Type: text/plain 으로 보내 사전 요청을 피한다): { cap(4 이상), f:{stn,st,flt,fail}, c:[가게…], p:[가게…], s:[서버 가게 원자료…], u:[공공데이터 원자료…], alts?:{ 키:{stn,st,flt,fail} } }  가게 = [이름, 업종, 주소, 거리]
//   alts 가 있으면 응답 out.alts[키] 에 그 칩의 화면도 함께 담는다(같은 가게 목록 · 정리는 한 번만 · s67)
//   엔진은 아무것도 저장하지 않는다(이 기기가 보낸 가게 목록으로 화면을 계산해 돌려줄 뿐). 개인 식별 정보는 오가지 않는다.
async function handleScreenFood(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 600000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  if (body.op === "kakaoId") {                                  // 가게 이름+좌표 → 카카오 장소 주소(앱이 가게 정보 단추를 누를 때). 못 찾으면 id:null — 앱이 이름 검색 주소로 연다.
    var kq = foodKakaoQuery(body.name, body.la, body.lo), kid = null;
    try {
      var kc = new AbortController(), kt = setTimeout(function () { kc.abort(); }, 4000);
      var kr = await fetch("https://gentle-lab-7e47subway-api.phg0643.workers.dev/kakao-local?path=" + encodeURIComponent("search/keyword.json") + "&qs=" + encodeURIComponent(kq), { signal: kc.signal });
      clearTimeout(kt);
      if (kr.ok) { var kj = await kr.json(); kid = foodKakaoPick(kj && kj.documents, body.name); }
    } catch (ek) { kid = null; }
    var kl = kid ? foodKakaoLinks(kid) : null;
    return new Response(JSON.stringify({ ok: true, id: kid, app: kl ? kl.app : "", web: kl ? kl.web : "", ver: ENGINE_VERSION }), { headers: H });
  }
  var out;
  try { out = foodScreens({ cap: Number(body.cap) || 0 }, body.f, { c: body.c, p: body.p, s: body.s, u: body.u }, body.alts); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2) }), { status: 500, headers: H }); }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 400, headers: H });
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}

// ── 맛집 공공데이터 공유 저장소 — GET /food-pub?lat=&lng= (s206) ──
// 도착지(또는 내 위치) 근처 음식점(소상공인 상가 정보)을 칸(약 200m)으로 묶어 ROWS_KV 에 계속 저장해 두고, 다음에 같은 칸을 누르는 다른 사람에게 그대로 나눠 준다.
// 저장한 지 30일이 지난 칸은 요청이 올 때 다시 받아 덮어쓴다(요청이 없으면 아무것도 안 한다). 새로 받다가 실패하면 묵은 것이라도 준다. 둘 다 없으면 502 — 앱이 예전 방식(직접 3쪽)으로 받는다.
// 응답은 공공데이터 원래 모양({response:{body:{items:[…]}}}) 그대로라 앱의 FoodCore.rows 가 그대로 읽는다. 개인 식별 정보는 오가지 않는다(칸 번호만 저장).
var FOODPUB_CELL = 0.002, FOODPUB_FRESH_MS = 30 * 86400000, FOODPUB_KEEP_S = 400 * 86400, FOODPUB_PAGE = 200, FOODPUB_PAGES = 3, FOODPUB_RADIUS = 1500;
var FOODPUB_URL = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius";
var FOODPUB_NEWS = "https://gentle-lab-7e47subway-api.phg0643.workers.dev";
var FOODPUB_INFLIGHT = new Map();
function foodPubParse(txt) {
  var j;
  try { j = JSON.parse(txt); } catch (e) { return { ok: false, why: "not json: " + String(txt).slice(0, 60) }; }
  var cm = j && j.OpenAPI_ServiceResponse && j.OpenAPI_ServiceResponse.cmmMsgHeader;
  if (cm) return { ok: false, why: (cm.errMsg || "") + " / " + (cm.returnAuthMsg || "") };
  var body = j && (j.response && j.response.body || j.body);
  if (!body) return { ok: false, why: "no body" };
  var it = body.items, list = [];
  if (Array.isArray(it)) list = it;
  else if (it && Array.isArray(it.item)) list = it.item;
  else if (it && it.item) list = [it.item];
  else if (it && typeof it === "object") list = [it];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i] || {};
    out.push({ bizesNm: r.bizesNm || "", indsMclsNm: r.indsMclsNm || "", indsSclsNm: r.indsSclsNm || "", rdnmAdr: r.rdnmAdr || "", lnoAdr: r.lnoAdr || "", lat: r.lat, lon: r.lon });
  }
  return { ok: true, items: out };
}
async function foodPubPage(env, la, lo, page) {
  var qs = "radius=" + FOODPUB_RADIUS + "&cx=" + lo + "&cy=" + la + "&indsLclsCd=I2&type=json&numOfRows=" + FOODPUB_PAGE + "&pageNo=" + page;
  try {
    var r = await tagoFetch(env, qs, FOODPUB_URL, foodPubParse, 2500);
    return r.items;
  } catch (e1) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 9000);
    try {
      var res = await fetch(FOODPUB_NEWS + "/tago?url=" + encodeURIComponent(FOODPUB_URL + "?serviceKey=&" + qs), { signal: c.signal });
      var p = foodPubParse(await res.text());
      if (p.ok) return p.items;
    } catch (e2) { /* 아래에서 던진다 */ } finally { clearTimeout(t); }
    throw new Error("food-pub upstream");
  }
}
async function foodPubFetch(env, la, lo) {
  var all = await foodPubPage(env, la, lo, 1);
  if (all.length >= FOODPUB_PAGE) {
    var rest = [];
    for (var p = 2; p <= FOODPUB_PAGES; p++) rest.push(foodPubPage(env, la, lo, p).catch(function () { return []; }));
    var got = await Promise.all(rest);
    for (var g = 0; g < got.length; g++) all = all.concat(got[g]);
  }
  return all;
}
async function handleFoodPub(request, env, ctx) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "public, max-age=600" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "GET") return new Response(JSON.stringify({ ok: false, error: "get-only" }), { status: 405, headers: H });
  var u = new URL(request.url), la = parseFloat(u.searchParams.get("lat")), lo = parseFloat(u.searchParams.get("lng"));
  if (!(la > 32.5 && la < 39.5 && lo > 123.5 && lo < 132.5)) return new Response(JSON.stringify({ ok: false, error: "bad-latlng" }), { status: 400, headers: H });
  if (!env || !env.ROWS_KV) return new Response(JSON.stringify({ ok: false, error: "no-kv" }), { status: 503, headers: { "Content-Type": H["Content-Type"], "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  var li = Math.round(la / FOODPUB_CELL), gi = Math.round(lo / FOODPUB_CELL), key = "fpub:v1:" + li + ":" + gi;
  var cla = Number((li * FOODPUB_CELL).toFixed(6)), clo = Number((gi * FOODPUB_CELL).toFixed(6));
  var rec = null;
  try { rec = await env.ROWS_KV.get(key, "json"); } catch (e) { rec = null; }
  var now = Date.now(), fresh = rec && Array.isArray(rec.items) && typeof rec.at === "number" && now - rec.at < FOODPUB_FRESH_MS;
  var src = "hit";
  if (!fresh) {
    var job = FOODPUB_INFLIGHT.get(key);
    if (!job) {
      job = foodPubFetch(env, cla, clo).then(async function (items) {
        var nr = { at: Date.now(), n: items.length, items: items };
        try { await env.ROWS_KV.put(key, JSON.stringify(nr), { expirationTtl: FOODPUB_KEEP_S }); } catch (ew) { /* 저장 실패해도 이번 응답은 준다 */ }
        return nr;
      });
      FOODPUB_INFLIGHT.set(key, job);
      var clear = function () { FOODPUB_INFLIGHT.delete(key); };
      job.then(clear, clear);
    }
    try { rec = await job; src = "fresh"; }
    catch (ef) {
      if (rec && Array.isArray(rec.items)) src = "stale";
      else return new Response(JSON.stringify({ ok: false, error: "upstream" }), { status: 502, headers: { "Content-Type": H["Content-Type"], "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
    }
  }
  var hh = src === "stale" ? { "Content-Type": H["Content-Type"], "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } : H;
  return new Response(JSON.stringify({ response: { body: { items: rec.items } }, ok: true, src: src, at: rec.at, cell: [cla, clo], ver: ENGINE_VERSION }), { headers: hh });
}
