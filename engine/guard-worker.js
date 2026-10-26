// API 남용 방어 Worker 연결부 — route-v2 의 fetch 맨 앞에서 guardEnter 를 부른다(engine/guard.js 의 gdDecide 를 쓴다).
//   guardEnter(request, env) → { res, done } — res 가 있으면 그 응답(429/403/503)을 그대로 돌려주고, 없으면 통과(끝나면 done() 을 부른다).
//   이 연결부는 어떤 오류가 나도 요청을 막지 않는다(통과). 선택: env.GDM_RL(Cloudflare 속도 제한 바인딩, .limit({key}))이 있으면 한 번 더 건다.
var GD_HEAVY_MAX = 64;                   // 한 인스턴스에서 동시에 처리 중인 무거운 조회 상한 — 넘으면 줄 세우지 않고 바로 503
var GD_INFLIGHT = { heavy: 0 };
function gdReject(d) {
  var h = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (d.retryS > 0) h["Retry-After"] = String(d.retryS);
  return new Response(JSON.stringify({ ok: false, error: d.status === 403 ? "forbidden" : d.status === 503 ? "busy" : "rate", retry: d.retryS || 0 }), { status: d.status, headers: h });
}
async function guardEnter(request, env) {
  var none = { res: null, done: function () { } };
  try {
    var url = new URL(request.url), hd = request.headers;
    var adminSet = !!(env && env.ADMIN_KEY && typeof env.ADMIN_KEY === "string");
    var adminOk = adminSet && (hd.get("x-admin-key") === env.ADMIN_KEY || url.searchParams.get("k") === env.ADMIN_KEY);
    var d = gdDecide({ ip: hd.get("CF-Connecting-IP") || hd.get("cf-connecting-ip") || "unknown", iid: hd.get("X-Gdm-Id"), path: url.pathname, method: request.method, now: Date.now(), adminSet: adminSet, adminOk: adminOk });
    if (!d.ok) return { res: gdReject(d), done: none.done };
    if (request.method !== "OPTIONS" && d.cls !== "admin" && env && env.GDM_RL && typeof env.GDM_RL.limit === "function") {
      try {
        var r = await env.GDM_RL.limit({ key: (hd.get("CF-Connecting-IP") || "unknown") + "|" + d.cls });
        if (r && r.success === false) return { res: gdReject({ status: 429, retryS: 10, reason: "rl" }), done: none.done };
      } catch (e2) { }
    }
    if (d.cls === "heavy") {
      if (GD_INFLIGHT.heavy >= GD_HEAVY_MAX) return { res: gdReject({ status: 503, retryS: 2, reason: "busy" }), done: none.done };
      GD_INFLIGHT.heavy++;
      var fin = false;
      return { res: null, done: function () { if (!fin) { fin = true; GD_INFLIGHT.heavy = Math.max(0, GD_INFLIGHT.heavy - 1); } } };
    }
    return none;
  } catch (e) { return none; }
}
