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
