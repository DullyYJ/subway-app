// 공개 방침 페이지 Worker 연결부 — GET /legal/privacy (engine/legal.js 의 legalHtml). route-v2 의 handleFetch 에 `if (url.pathname === "/legal/privacy") return handleLegal(request);` 를 넣는다.
//   ?doc=privacy(기본) | terms | open. 글은 SETTINGS_POL(engine/settings.js) 하나를 그대로 쓴다. 아무것도 저장하지 않는다.
function handleLegal(request) {
  var u = new URL(request.url);
  var H = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600", "X-Content-Type-Options": "nosniff" };
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("method not allowed", { status: 405, headers: H });
  return new Response(legalHtml(u.searchParams.get("doc") || "privacy", SETTINGS_POL, SETTINGS_POL_UPDATED), { status: 200, headers: H });
}
