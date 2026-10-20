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
