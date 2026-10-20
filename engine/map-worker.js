// 지도 탭 화면 엔진 Worker 연결부 — POST /screen/map (engine/map.js 의 mapScreen 을 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/screen/map") return handleScreenMap(request);` 를 넣는다.
//   본문(JSON 글, Content-Type: text/plain): { cap(18 이상), f:{ part:'h'|'b'|'stn'|'tt', mode, reg, flt, th, stn, sl, q, gps, tt, bus } }
//   엔진은 아무것도 저장하지 않는다(이 기기가 보낸 사실로 화면을 계산해 돌려줄 뿐).
async function handleScreenMap(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 3000000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  var out;
  try { out = mapScreen({ cap: Number(body.cap) || 0 }, body.f, body.d); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2).slice(0, 120) }), { status: 500, headers: H }); }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 400, headers: H });
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}
