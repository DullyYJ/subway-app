// 지도 탭 화면 엔진 Worker 연결부 — POST /screen/map (engine/map.js 의 mapScreen 을 부른다). route-v2 의 handleFetch 에 `if (url.pathname === "/screen/map") return handleScreenMap(request, env);` 를 넣는다.
//   본문(JSON 글, Content-Type: text/plain): { cap(18 이상), f:{ part:'h'|'b'|'stn'|'tt', mode, reg, flt, th, stn, sl, q, gps, tt, bus } }
//   엔진은 아무것도 저장하지 않는다(이 기기가 보낸 사실로 화면을 계산해 돌려줄 뿐).
//
// ★ s148 — 버스 '한 번에 받기'(f.bus.sv === 1, cap 23 이상): 엔진이 "이 주소들을 받아 와라(info.bus.need)" 하면 지금까진 기기가 받아 다시 물었다(기기 → 서버 → 공공 API → 기기 → 서버 …, 왕복 3번).
//   이제는 이 서버가 gentle-lab(BUSAPI 바인딩)로 주소들을 동시에 받아 엔진에 다시 넣는다 — 기기는 한 번만 묻고 완성된 화면을 받는다.
//   · 정류장 목록(tp·gg·tn·d1)은 0.001° 칸마다 엣지 캐시에 12시간 둔다(조회 좌표가 칸 가운데라 같은 칸이면 바로 맞는다). 도착정보는 캐시하지 않는다.
//   · 받은 본문은 info.bres({ 열쇠: 본문 }) 로 함께 돌려준다(기기가 다음 갱신·즐겨찾기에 그대로 쓴다). 받지 못한 도착정보 수는 info.svf.
//   · 바인딩이 없거나 못 받으면 그냥 need 가 남은 화면을 돌려준다 — 기기가 예전 방식(직접 받아 다시 묻기)으로 이어 간다.
var MAPSV_HOSTS = /^https?:\/\/(apis\.data\.go\.kr|ws\.bus\.go\.kr)\//;
var MAPSV_D1 = /^https:\/\/gentle-lab-7e47subway-api\.phg0643\.workers\.dev(\/bus-stops\?[A-Za-z0-9=&._-]{1,80})$/;
function mapSvOkBody(k, t) {                              // 캐시에 둘 만한 정상 본문인가(정류장 목록만)
  if (typeof t !== 'string' || t.length < 40) return false;
  if (k === 'tp') return t.indexOf('<itemList>') >= 0 && !/Key인증실패|SERVICE\s*KEY\s*IS\s*NOT\s*REGISTERED/i.test(t) && !/<headerCd>\s*[1-9]/.test(t);
  if (k === 'gg') return t.indexOf('busStationAroundList') >= 0;
  if (k === 'tn') { try { var o = JSON.parse(t); var it = o.response.body.items; return !!(it && it.item); } catch (e) { return false; } }
  if (k === 'd1') return t.indexOf('"stops":[{') >= 0 || t.indexOf('"stops": [{') >= 0;
  return false;
}
function mapSvViaBinding(env, url) {                       // → Promise<Response> 또는 null(허용하지 않는 주소 · 바인딩 없음)
  if (!env || !env.BUSAPI || typeof env.BUSAPI.fetch !== 'function') return null;
  var u = String(url || ''), m;
  if (u.length > 700) return null;
  if (MAPSV_HOSTS.test(u)) return env.BUSAPI.fetch(new Request('https://busapi.internal/tago?url=' + encodeURIComponent(u)));
  if ((m = MAPSV_D1.exec(u))) return env.BUSAPI.fetch(new Request('https://busapi.internal' + m[1]));
  return null;
}
async function mapSvOne(env, k, url) {                     // → 본문 글(실패는 '')
  var cacheable = k === 'tp' || k === 'gg' || k === 'tn' || k === 'd1', cache = null, ck = null;
  if (cacheable) {
    try {
      if (typeof caches !== 'undefined' && caches.default) {
        cache = caches.default; ck = new Request('https://map-sv-cache.internal/s?k=' + k + '&u=' + encodeURIComponent(url));
        var hit = await cache.match(ck);
        if (hit) { var ht = await hit.text(); if (mapSvOkBody(k, ht)) return ht; }
      }
    } catch (e0) { cache = null; }
  }
  for (var a = 0; a < 2; a++) {
    var t0 = Date.now(), body = '';
    try {
      var p = mapSvViaBinding(env, url);
      if (!p) return '';
      var res = await Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, a === 0 ? 3500 : 2500); })]);
      if (res && res.status === 200) body = await res.text();
    } catch (e1) { body = ''; }
    if (body) {
      if (cache && ck && mapSvOkBody(k, body)) { try { await cache.put(ck, new Response(body, { headers: { 'Cache-Control': 'public, max-age=43200', 'Content-Type': 'text/plain; charset=utf-8' } })); } catch (e2) { /* 캐시 실패는 무시 */ } }
      return body;
    }
    if (Date.now() - t0 > 1500) break;                      // 느린 서버에 또 매달리지 않는다(빨리 실패했을 때만 한 번 더)
  }
  return '';
}
var MAPSV_ARR_MS = 2200, MAPSV_ARR_MIN = 300, MAPSV_ARR_MAX = 3500;                                   // 도착정보는 이 시간 안에 온 것만 싣는다 — 늦거나 못 받은 정류장은 비워 두어(= need 로 남겨) 기기가 직접 받게 한다
async function mapSvResolve(env, cap, body, out) {
  var svb = Number(body.f && body.f.bus && body.f.bus.svb), budget = isFinite(svb) && svb > 0 ? Math.max(MAPSV_ARR_MIN, Math.min(MAPSV_ARR_MAX, Math.floor(svb))) : MAPSV_ARR_MS;       // 기기가 정한 기다림(처음 그리기는 짧게 — 정류장부터 먼저 보이고 도착정보는 이어서 채운다)          // need 를 서버가 받아 채운다(최대 3바퀴: 정류장 → 도착정보 …)
  var f = body.f, b = f.bus, res = (b.res && typeof b.res === 'object') ? b.res : (b.res = {}), got = {}, failA = 0, anyEver = false, round, ib;
  for (round = 0; round < 3; round++) {
    ib = out && out.info && out.info.bus;
    if (!ib || ib.st !== 'need' || !Array.isArray(ib.need) || !ib.need.length) break;
    var need = ib.need.slice(0, 60);
    var arrWave = need.every(function (n) { return /^[af][0-9]{1,3}$/.test(String(n.k || '')); });
    var slot = new Array(need.length);
    var ps = need.map(function (n, i) { return mapSvOne(env, String(n.k || ''), String(n.url || '')).then(function (t) { slot[i] = t; return t; }); });
    if (arrWave) await Promise.race([Promise.all(ps), new Promise(function (r) { setTimeout(r, budget); })]);
    else await Promise.all(ps);
    var any = false;
    failA = 0;
    need.forEach(function (n, i) {
      var k = String(n.k || ''), t = slot[i] || '';
      if (arrWave) {                                          // 도착정보: 받은 것만 넣고, 못 받았거나 늦은 곳은 아예 두지 않는다 → 엔진이 다시 need 로 알려 기기가 받는다('도착정보 없음'으로 굳지 않는다)
        if (t) { any = true; res[k] = t; got[k] = t.length > 120000 ? t.slice(0, 120000) : t; } else failA++;
        return;
      }
      if (t) any = true;
      res[k] = t; got[k] = t.length > 120000 ? t.slice(0, 120000) : t;
    });
    if (any) anyEver = true;
    if (!any) break;                                        // 아무것도 못 받았다 — 그대로 돌려줘 기기가 예전 방식으로 이어 간다
    out = mapScreen({ cap: cap }, f, body.d);
    if (!out || !out.ok) return out;
    if (arrWave) break;                                     // 도착정보는 한 번만(못 받은 곳은 기기가 이어 받는다)
  }
  if (anyEver && out && out.info) { out.info.bres = got; out.info.svf = failA; }
  return out;
}
async function handleScreenMap(request, env) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  var raw = await request.text();
  if (raw.length > 3000000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  var out, cap = Number(body.cap) || 0;
  try { out = mapScreen({ cap: cap }, body.f, body.d); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2).slice(0, 120) }), { status: 500, headers: H }); }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 400, headers: H });
  try {
    var bf = body.f && body.f.bus;
    if (cap >= 23 && bf && bf.sv === 1 && out.info && out.info.bus && out.info.bus.st === 'need') {
      var o2 = await mapSvResolve(env, cap, body, out);
      if (o2 && o2.ok) out = o2;
    }
  } catch (e3) { /* 서버가 못 받으면 need 가 남은 첫 화면 그대로 — 기기가 이어 간다 */ }
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}
