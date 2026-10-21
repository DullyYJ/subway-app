// 맨 위 감성 문구 엔진 Worker 연결부 — GET|POST /screen/hdr (engine/hdr.js 의 hdrScreen 을 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/screen/hdr") return handleScreenHdr(request);` 를 넣는다.
//   쿼리: tz(분, 동쪽 +, 기본 540) · now(ms, 시험용). 저장하는 것도 개인 정보도 없다.
async function handleScreenHdr(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  var q = new URL(request.url).searchParams;
  var out;
  try { out = hdrScreen({ nowMs: q.get("now") ? Number(q.get("now")) : Date.now(), tzOffsetMin: q.get("tz") ? Number(q.get("tz")) : 540 }); } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}
