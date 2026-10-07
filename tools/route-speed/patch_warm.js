// s4: /warm 엔드포인트(앱 시작 시 가벼운 검색 1회로 격리 예열) + 진단용 격리 식별자(busDiag.iso/isoN). 기존 경로·응답 본문은 불변(진단 필드만 추가).
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
function rep(a,b,n){const c=s.split(a).length-1;if(c!==(n||1))throw new Error('anchor '+c+' '+a.slice(0,70));s=s.split(a).join(b);}
rep(`var ENGINE_VERSION = `,`var ISO_ID = "";
var ISO_N = 0;
var WARM_AT = 0;
var WARM_BUSY = null;
function isoId() {
  return ISO_ID || (ISO_ID = Math.random().toString(36).slice(2, 8));
}
var ENGINE_VERSION = `);
rep(`    cacheTier: _cached ? "mem" : _kvHit ? _btTier || "kv" : "none",`,`    iso: isoId(),
    isoN: ++ISO_N,
    cacheTier: _cached ? "mem" : _kvHit ? _btTier || "kv" : "none",`);
rep(`  return new Response(
    JSON.stringify({
      ok: true,
      version: ENGINE_VERSION,`,`  if (url.pathname === "/warm") {
    if (rateLimited(request)) return new Response(JSON.stringify({ error: "rate" }), { status: 429, headers: Object.assign({}, CORS_H, { "Retry-After": "5" }) });
    const _wNow = Date.now();
    let _wDid = false, _wErr = null;
    if (WARM_BUSY) {
      try { await WARM_BUSY; } catch (e) {}
    } else if (!WARM_AT || _wNow - WARM_AT > 6e4 || ISO_N === 0) {
      _wDid = true;
      WARM_BUSY = (async function() {
        const wu = new URL(url.origin + "/route-v2-app?SX=126.972836&SY=37.553172&EX=126.999821&EY=37.266162&live=0");
        const wr = await handleRouteV2(new Request(wu.toString()), env, wu, SUBWAY_BUNDLE, ctx);
        await wr.text();
      })();
      try { await WARM_BUSY; } catch (e) { _wErr = String(e && e.message || e).slice(0, 80); }
      WARM_BUSY = null;
      WARM_AT = Date.now();
    }
    return new Response(JSON.stringify({ ok: !_wErr, warmed: _wDid, err: _wErr, iso: isoId(), isoN: ISO_N }), { status: 200, headers: CORS_H });
  }
  return new Response(
    JSON.stringify({
      ok: true,
      version: ENGINE_VERSION,`);
fs.writeFileSync(process.argv[3],s);console.log('ok warm');
