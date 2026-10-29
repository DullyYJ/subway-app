// 홈 카드 묶음 화면 엔진 Worker 연결부 — POST /screen/hcards (engine/hcards.js 의 hcardsScreen 을 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/screen/hcards") return handleScreenHcards(request);` 를 넣는다.
//   본문(JSON 글, Content-Type: text/plain): { cap(18 이상), f:{ now, tz, th, hol, gps, r, ai, tk } } — 날씨(f.wx)는 Worker 가 채운다
//   alts(선택, s311): 같은 사실로 함께 받을 다른 탭 이름들 → 응답의 alts[탭] 에 그 탭의 홈 카드 화면
//   엔진은 아무것도 저장하지 않는다(이 기기가 보낸 사실로 화면을 계산해 돌려줄 뿐).
async function handleScreenHcards(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 12000000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  // 날씨: 두 지점의 날씨를 Worker 가 subway-api /weather 에서 받아 f.wx 로 넣는다(10분 캐시 · 못 받으면 비워 둠 — 날씨를 지어내지 않는다)
  try {
    if (body.f && typeof body.f === "object" && typeof sceneWeather === "function") {
      var wp = hcWxPoints(body.f), wk = ["wF", "wT"], wr = await Promise.all(wk.map(function (k) { return wp[k] ? sceneWeather(wp[k][0], wp[k][1]) : Promise.resolve(null); }));
      body.f.wx = {}; wk.forEach(function (k, i) { if (wr[i]) body.f.wx[k] = wr[i]; });
    }
  } catch (eWx) { /* 날씨 없이 계산 */ }
  var out;
  try { out = hcardsScreens({ cap: Number(body.cap) || 0 }, body.f, body.alts); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2).slice(0, 120) }), { status: 500, headers: H }); }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 400, headers: H });
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}
