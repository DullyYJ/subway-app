// 화면 캐시 · 묶음 요청 Worker 연결부 — 모든 /screen/* 응답에 ETag · Cache-Control: max-age 를 붙이고(If-None-Match 가 같으면 304),
//   POST /screen/batch 로 여러 화면 요청을 한 번에 받는다. route-v2 의 fetch 가 handleFetchCond 를 부른다.
//   묶음 본문: { r:[ { k:열쇠, u:"/screen/…(쿼리 포함)", m:"POST"|"GET", b:본문 글(POST), t:앱이 가진 ETag(있으면) } ] }  (최대 16개)
//   묶음 응답: { ok:true, res:{ 열쇠:{ s:상태(200|304|오류), e:ETag, m:max-age(초), b:응답 글(200 일 때) } } }
//   안쪽 요청은 보통 요청과 같은 길(handleFetch)로 처리하므로 글자 하나까지 같은 화면이다. 묶음 안의 묶음은 거절한다.
async function handleFetchCond(request, env, ctx) {
  var res = await handleFetch(request, env, ctx);
  var path;
  try { path = new URL(request.url).pathname; } catch (e) { return res; }
  if (path.indexOf("/screen/") !== 0 || path === "/screen/batch" || res.status !== 200 || request.method === "OPTIONS") return res;
  var text = await res.text();
  var c = scCond(path, text, request.headers.get("If-None-Match"));
  var h = new Headers(res.headers);
  h.set("ETag", c.etag); h.set("Cache-Control", "private, max-age=" + c.maxAge);
  h.set("Access-Control-Expose-Headers", "ETag, Cache-Control"); h.set("Access-Control-Allow-Headers", "content-type, if-none-match");
  if (c.notModified) return new Response(null, { status: 304, headers: h });
  return new Response(text, { status: 200, headers: h });
}
async function handleScreenBatch(request) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, if-none-match", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 400000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  var reqs = body && Array.isArray(body.r) ? body.r.slice(0, 16) : null;
  if (!reqs) return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  var origin = new URL(request.url).origin, out = {};
  await Promise.all(reqs.map(async function (q) {
    var k = q && typeof q.k === "string" ? q.k.slice(0, 80) : "";
    if (!k) return;
    var u = typeof q.u === "string" ? q.u : "";
    if (u.indexOf("/screen/") !== 0 || u.indexOf("/screen/batch") === 0 || u.length > 600) { out[k] = { s: 400 }; return; }
    var method = q.m === "GET" ? "GET" : "POST";
    try {
      var init = { method: method, headers: {} };
      if (typeof q.t === "string" && q.t) init.headers["If-None-Match"] = q.t.slice(0, 80);
      if (method === "POST") init.body = typeof q.b === "string" ? q.b : JSON.stringify(q.b == null ? {} : q.b);
      var r = await handleFetchCond(new Request(origin + u, init));
      var e = r.headers.get("ETag") || "", ma = /max-age=(\d+)/.exec(r.headers.get("Cache-Control") || "");
      var o = { s: r.status, e: e, m: ma ? Number(ma[1]) : 0 };
      if (r.status === 200) o.b = await r.text();
      out[k] = o;
    } catch (err) { out[k] = { s: 500 }; }
  }));
  return new Response(JSON.stringify({ ok: true, res: out }), { headers: H });
}
