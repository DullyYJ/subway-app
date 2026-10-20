// 경로 결과 화면 엔진 Worker 연결부 — POST /screen/result (engine/result.js 의 resultScreen 을 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/screen/result") return handleScreenResult(request);` 를 넣는다.
//   본문(JSON 글, Content-Type: text/plain): { cap(12 이상), r:{ data(경로 응답 그대로), tab, a, b, bt, rb, now, tz, th, fav } }
//   엔진은 아무것도 저장하지 않는다. 개인 식별 정보는 오가지 않는다(이름 두 개와 경로 응답뿐).
async function handleScreenResult(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 3000000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  var out;
  try { out = resultScreen({ cap: Number(body.cap) || 0 }, body.r); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2) }), { status: 500, headers: H }); }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 400, headers: H });
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}
