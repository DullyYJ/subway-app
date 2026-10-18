// 설정 화면 엔진 Worker 연결부 — GET /screen/settings (engine/settings.js 의 settingsScreen 을 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/screen/settings") return handleScreenSettings(request);` 를 넣는다.
//   쿼리: cap(앱이 그릴 수 있는 화면 규격 수준, 3 이상) · f(앱이 모은 기기 사실 JSON — 길이 3000 자 이하)
//   엔진은 아무것도 저장하지 않는다(이 기기의 사실만 받아 화면을 계산해 돌려준다). 개인 식별 정보는 아이디(이 기기 화면에 되돌려 줄 뿐)만 오간다.
async function handleScreenSettings(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  var q = new URL(request.url).searchParams, facts = null, raw = q.get("f");
  if (raw) {
    if (raw.length > 3000) return new Response(JSON.stringify({ ok: false, error: "facts-too-long" }), { status: 400, headers: H });
    try { facts = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "facts-bad-json" }), { status: 400, headers: H }); }
  }
  var out;
  try { out = settingsScreen({ cap: Number(q.get("cap")) || 0 }, facts); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2) }), { status: 500, headers: H }); }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 400, headers: H });
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}
