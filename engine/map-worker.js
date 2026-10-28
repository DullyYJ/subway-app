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
function mapSvAttempts(env, url, seq) {                    // → [() => Promise<Response>|null] 시도 순서
  var out = [];
  if (typeof tagoAttempts === 'function' && env && /^https?:\/\/apis\.data\.go\.kr\//.test(url)) {
    var inner = url.replace(/([?&])serviceKey=[^&]*&?/, '$1').replace(/[?&]$/, '');
    var ks = tagoAttempts(env).filter(function (x) { return x.via === 'env-key' || x.via === 'env-key2' || x.via === 'default-key'; });
    if (ks.length > 1 && seq % 2 === 1) ks = ks.slice(1).concat(ks.slice(0, 1));
    ks.slice(0, 2).forEach(function (x) { out.push(function () { return x.run(inner); }); });
  }
  if (env && env.BUSAPI && typeof env.BUSAPI.fetch === 'function') out.push(function () { return mapSvViaBinding(env, url); });
  return out;
}
async function mapSvOne0(env, k, url) {                    // → 본문 글(실패는 '')
  var cacheable = k === 'tp' || k === 'gg' || k === 'tn' || k === 'd1', cache = null, ck = null;
  if (cacheable) {
    try {
      if (typeof caches !== 'undefined' && caches.default) {
        cache = caches.default; ck = new Request('https://map-sv-cache.internal/s?k=' + k + '&u=' + encodeURIComponent(url));
        var hit = await cache.match(ck);
        if (hit) { var ht = await hit.text(); if (mapSvOkBody(k, ht)) return ht; }
      }
    } catch (e0) { cache = null; }
    var kvb = await mapSvKvGet(env, k, url);                                                   // s290: 이 데이터센터 캐시에 없으면 전국 공용 저장소(KV)에서 — 다른 곳에서 한 번이라도 받았으면 바로 나온다
    if (kvb) {
      if (cache && ck) { try { await cache.put(ck, new Response(kvb, { headers: { 'Cache-Control': 'public, max-age=43200', 'Content-Type': 'text/plain; charset=utf-8' } })); } catch (eK) { /* 무시 */ } }
      return kvb;
    }
  }
  var atts = mapSvAttempts(env, url, parseInt(String(k).replace(/\D/g, ''), 10) || 0);          // 공공데이터 키가 둘이면 정류장을 반반씩(짝수 번째는 키1 먼저 · 홀수 번째는 키2 먼저) 나눠 묻고, 한쪽이 오류면 바로 다른 쪽 · 마지막은 BUSAPI 바인딩
  if (!atts.length) return '';
  if (atts.length === 1) atts.push(atts[0]);                                                  // 길이 하나뿐이면 한 번 더
  // s174: 헤지 — 첫 시도가 0.7초 안에 안 오면 기다리지 않고 다음 길(다른 키)을 동시에 띄워 먼저 온 정상 본문을 쓴다. 빨리 실패(오류 봉투)하면 즉시 다음 길. 최대 3번.
  var max = Math.min(atts.length, 3), launched = 0, inflight = [];
  function start() {
    var o = {};
    o.p = (async function () {
      try {
        var p = atts[launched - 1]();
        if (!p) return '';
        var res = await Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 3000); })]);
        if (res && res.status === 200) { var tx = await res.text(); return mapArrErr(tx) ? '' : tx; }          // 공공 API 오류 봉투(200)는 받지 못한 것
      } catch (e1) { /* 실패 */ }
      return '';
    })().then(function (b) { o.b = b; return o; });
    inflight.push(o);
  }
  launched++; start();
  while (inflight.length) {
    var waiters = inflight.map(function (o) { return o.p; });
    if (launched < max) waiters.push(new Promise(function (r) { setTimeout(function () { r(null); }, 700); }));
    var w = await Promise.race(waiters);
    if (w === null) { launched++; start(); continue; }                                         // 느리다 — 다른 길을 동시에
    inflight.splice(inflight.indexOf(w), 1);
    if (w.b) {
      if (cache && ck && mapSvOkBody(k, w.b)) { try { await cache.put(ck, new Response(w.b, { headers: { 'Cache-Control': 'public, max-age=43200', 'Content-Type': 'text/plain; charset=utf-8' } })); } catch (e2) { /* 캐시 실패는 무시 */ } }
      if (cacheable && mapSvOkBody(k, w.b)) mapSvKvPut(env, k, url, w.b);                       // s290: 전국 공용 저장소에도(응답을 붙잡지 않고 뒤에서)
      return w.b;
    }
    if (!inflight.length && launched < max) { launched++; start(); }                           // 빨리 실패했다 — 곧바로 다음 길
  }
  return '';
}
// ★ s290 — 버스 서버 쪽 빠르게 (YJ: "버스 탭 들어가면 정류장이 너무 늦게 떠")
//   ① 정류장 목록(tp·gg·tn·d1)은 데이터센터 캐시(12시간)에 더해 전국 공용 저장소 KV 에도 14일 둔다 — 처음 가는 데이터센터·캐시가 비워진 뒤에도 공공 API 를 다시 기다리지 않는다.
//      받은 주소는 'bsreg' 목록에 기억해 두고, 알림 시각(cron)마다 오래된 것부터 몇 개씩 다시 받아 둔다 → 자주 가는 동네는 늘 따뜻하다.
//   ② 도착정보(a·f·g·h·t·u)는 같은 주소를 동시에 부르면 하나로 합치고(앱이 '정류장만 먼저'와 '한 번에'를 같이 보낸다), 5초 안 다시 부르면 방금 받은 것을 쓴다.
//      도착정보의 원천 갱신이 수십 초 단위라 5초는 화면에 보이는 차이가 없고, 빈 값·오류는 기억하지 않는다.
var MAPSV_CTX = null;
var MAPSV_MEMO = {}, MAPSV_MEMO_N = 0, MAPSV_MEMO_MS = 5000;
var MAPSV_KV_TTL = 14 * 86400, MAPSV_REG = 'bsreg', MAPSV_REG_MAX = 240, MAPSV_WARM_AGE = 6 * 86400000, MAPSV_WARM_N = 8;
function mapSvHash(s) {                                     // 32비트 두 개(서로 다른 시작값) → 16글자. 저장 값에 원본 주소를 같이 넣어 확인하므로 겹쳐도 틀린 본문은 쓰지 않는다
  var h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995, i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ c, 2246822519) + 374761393) >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}
function mapSvKvKey(k, url) { return 'bs:' + mapSvHash(String(k) + '|' + String(url)); }
async function mapSvKvGet(env, k, url) {                    // → 본문 글 또는 ''
  try {
    if (!env || !env.ROWS_KV || typeof env.ROWS_KV.get !== 'function') return '';
    var v = await env.ROWS_KV.get(mapSvKvKey(k, url), { type: 'json', cacheTtl: 300 });
    if (v && v.u === url && mapSvOkBody(k, v.b)) return v.b;
  } catch (e) { /* 저장소 실패는 없는 것으로 */ }
  return '';
}
function mapSvKvPut(env, k, url, body) {                    // 응답을 붙잡지 않는다(waitUntil)
  try {
    if (!env || !env.ROWS_KV || typeof env.ROWS_KV.put !== 'function' || typeof body !== 'string' || body.length > 200000) return;
    var run = (async function () {
      await env.ROWS_KV.put(mapSvKvKey(k, url), JSON.stringify({ u: url, b: body, at: Date.now() }), { expirationTtl: MAPSV_KV_TTL });
      await mapSvRegAdd(env, k, url);
    })().catch(function () { /* 무시 */ });
    if (MAPSV_CTX && typeof MAPSV_CTX.waitUntil === 'function') MAPSV_CTX.waitUntil(run);
  } catch (e) { /* 무시 */ }
}
async function mapSvRegAdd(env, k, url) {
  var reg = await env.ROWS_KV.get(MAPSV_REG, { type: 'json' });
  if (!Array.isArray(reg)) reg = [];
  var now = Date.now(), i;
  for (i = 0; i < reg.length; i++) if (reg[i] && reg[i].k === k && reg[i].u === url) { reg[i].at = now; return env.ROWS_KV.put(MAPSV_REG, JSON.stringify(reg), { expirationTtl: MAPSV_KV_TTL }); }
  reg.push({ k: k, u: url, at: now });
  if (reg.length > MAPSV_REG_MAX) reg = reg.slice(reg.length - MAPSV_REG_MAX);
  return env.ROWS_KV.put(MAPSV_REG, JSON.stringify(reg), { expirationTtl: MAPSV_KV_TTL });
}
/** 알림 시각(cron)마다: 기억해 둔 정류장 주소 중 6일 넘게 안 받은 것을 오래된 순으로 몇 개 다시 받아 저장소에 둔다. 받은 개수를 돌려준다. */
async function mapBusWarmCron(env, nowMs) {
  if (!env || !env.ROWS_KV) return 0;
  var reg = await env.ROWS_KV.get(MAPSV_REG, { type: 'json' });
  if (!Array.isArray(reg) || !reg.length) return 0;
  var now = Number(nowMs) || Date.now();
  var due = reg.filter(function (e) { return e && e.k && e.u && now - Number(e.at || 0) >= MAPSV_WARM_AGE; }).sort(function (a, b) { return a.at - b.at; }).slice(0, MAPSV_WARM_N);
  var n = 0, i;
  for (i = 0; i < due.length; i++) {
    var e = due[i], body = '';
    try {
      var atts = mapSvAttempts(env, e.u, i);
      for (var a = 0; a < atts.length && !body; a++) {
        var p = atts[a](); if (!p) continue;
        var res = await Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 6000); })]);
        if (res && res.status === 200) { var tx = await res.text(); if (!mapArrErr(tx) && mapSvOkBody(e.k, tx)) body = tx; }
      }
    } catch (e1) { body = ''; }
    if (!body) continue;
    try { await env.ROWS_KV.put(mapSvKvKey(e.k, e.u), JSON.stringify({ u: e.u, b: body, at: now }), { expirationTtl: MAPSV_KV_TTL }); n++; e.at = now; } catch (e2) { /* 다음에 */ }
  }
  if (n > 0) { try { await env.ROWS_KV.put(MAPSV_REG, JSON.stringify(reg), { expirationTtl: MAPSV_KV_TTL }); } catch (e3) { /* 다음에 */ } }
  return n;
}
function mapSvOne(env, k, url) {                            // → Promise<본문 글> (정류장 목록은 mapSvOne0 의 캐시 · 도착정보는 합치기 + 5초 기억)
  if (k === 'tp' || k === 'gg' || k === 'tn' || k === 'd1') return mapSvOne0(env, k, url);
  var now = Date.now(), e = MAPSV_MEMO[url];
  if (e && now - e.t < MAPSV_MEMO_MS) return e.p;
  var ent = { t: now, p: null };
  ent.p = mapSvOne0(env, k, url).then(function (b) { if (!b && MAPSV_MEMO[url] === ent) delete MAPSV_MEMO[url]; return b; }, function () { if (MAPSV_MEMO[url] === ent) delete MAPSV_MEMO[url]; return ''; });
  if (++MAPSV_MEMO_N > 300) { MAPSV_MEMO = {}; MAPSV_MEMO_N = 0; }
  MAPSV_MEMO[url] = ent;
  return ent.p;
}
var MAPSV_ARR_MS = 2200, MAPSV_ARR_MIN = 300, MAPSV_ARR_MAX = 3500;                                   // 도착정보는 이 시간 안에 온 것만 싣는다 — 늦거나 못 받은 정류장은 비워 두어(= need 로 남겨) 기기가 직접 받게 한다
async function mapSvResolve(env, cap, body, out) {
  var svb = Number(body.f && body.f.bus && body.f.bus.svb), budget = isFinite(svb) && svb > 0 ? Math.max(MAPSV_ARR_MIN, Math.min(MAPSV_ARR_MAX, Math.floor(svb))) : MAPSV_ARR_MS;       // 기기가 정한 기다림(처음 그리기는 짧게 — 정류장부터 먼저 보이고 도착정보는 이어서 채운다)          // need 를 서버가 받아 채운다(최대 3바퀴: 정류장 → 도착정보 …)
  var f = body.f, b = f.bus, res = (b.res && typeof b.res === 'object') ? b.res : (b.res = {}), got = {}, failA = 0, anyEver = false, round, ib;
  for (round = 0; round < 3; round++) {
    ib = out && out.info && out.info.bus;
    if (!ib || ib.st !== 'need' || !Array.isArray(ib.need) || !ib.need.length) break;
    var need = ib.need.slice(0, 60);
    if (need.some(function (n) { return /^r[0-9]/.test(String(n.k || '')); })) break;                       // s199: 노선 경유 정류장 목록(방면 이름용 · 큰 본문)은 기기가 천천히 받는다 — 서버가 기다리지 않는다
    var arrWave = need.every(function (n) { return /^[afghtu][0-9]{1,3}$/.test(String(n.k || '')); });
    var slot = new Array(need.length);
    var done = new Array(need.length);
    var ps = need.map(function (n, i) { return mapSvOne(env, String(n.k || ''), String(n.url || '')).then(function (t) { slot[i] = t; done[i] = true; return t; }); });
    var stopWave = !arrWave && typeof mapBusReady === 'function' && b.vw !== 'fav' && isFinite(Number(b.lat)) && isFinite(Number(b.lng)) && need.every(function (n) { return /^(tp|gg|tn|d1)$/.test(String(n.k || '')); });
    if (arrWave) await Promise.race([Promise.all(ps), new Promise(function (r) { setTimeout(r, budget); })]);
    else if (stopWave) {                                    // s177: 정류장 목록 — 우선순위 앞 출처가 정류장을 주면 나머지(느린 TAGO)는 기다리지 않고 도착정보로 넘어간다. 못 기다린 출처는 빈 값으로 둔다.
      for (;;) {
        var tmp = {}, pend = [];
        Object.keys(res).forEach(function (rk) { tmp[rk] = res[rk]; });
        need.forEach(function (n, i) { if (done[i]) tmp[String(n.k)] = slot[i] || ''; else pend.push(ps[i]); });
        var rdy = false;
        try { rdy = !!mapBusReady({ bus: { lat: b.lat, lng: b.lng, res: tmp } }); } catch (eR) { rdy = false; }
        if (rdy || !pend.length) break;
        await Promise.race(pend);
      }
    }
    else await Promise.all(ps);
    var any = false;
    failA = 0;
    need.forEach(function (n, i) {
      var k = String(n.k || ''), t = slot[i] || '';
      if (arrWave) {                                          // 도착정보: 받은 것만 넣고, 못 받았거나 늦은 곳은 아예 두지 않는다 → 엔진이 다시 need 로 알려 기기가 받는다('도착정보 없음'으로 굳지 않는다)
        if (t) { any = true; res[k] = t; got[k] = t.length > 120000 ? t.slice(0, 120000) : t; } else if (/^[af]/.test(k)) failA++;       // 이웃·바꾼 ID·경유노선(g·h·t·u)은 덤 — 못 받아도 실패로 세지 않는다
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
  var out, cap = Number(body.cap) || 0, ttFill = null;
  try { if (body.f && body.f.part === 'tt') ttFill = await mapTtFill(env, body.f); } catch (eT) { ttFill = null; }          // s248: 시간표는 서버가 직접 채운다(기기는 한 번만 묻는다) — 못 채우면 예전처럼 need 가 남아 기기가 /next-train 으로 받는다
  try { out = mapScreen({ cap: cap }, body.f, body.d); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2).slice(0, 120) }), { status: 500, headers: H }); }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 400, headers: H });
  try {
    var bf = body.f && body.f.bus;
    if (cap >= 23 && bf && bf.sv === 1 && out.info && out.info.bus && out.info.bus.st === 'need') {
      var o2 = await mapSvResolve(env, cap, body, out);
      if (o2 && o2.ok) out = o2;
    }
  } catch (e3) { /* 서버가 못 받으면 need 가 남은 첫 화면 그대로 — 기기가 이어 간다 */ }
  if (ttFill && out.info) { for (var kf in ttFill) { out.info.fill = ttFill; break; } }
  out.ver = ENGINE_VERSION;
  return new Response(JSON.stringify(out), { headers: H });
}
// ═══ s248 역 시간표 서버 채우기 — (YJ: "시간표가 안 나와. 미리 다 받아놔야 해") ═══
//   f.tt.sv === 1 이면 이 역의 모든 노선(요일 미정)과 고른 노선·요일의 시간표를 서버(다음 열차 엔진)가 바로 채워 한 번에 완성된 화면을 준다.
//   채운 것은 info.fill({ '노선|-' 또는 '노선|요일': 시간표 }) 로도 돌려줘 기기가 모아 두고, 다음 요청에는 res 로 다시 보낸다(그러면 다시 채우지 않는다).
async function mapTtFill(env, f) {
  var T = f && f.tt;
  if (!T || T.sv !== 1 || typeof ntEnsure !== 'function') return null;
  var name = f.stn;
  if (!mapIsStationLabel(name)) return null;
  var nt = await ntEnsure(env);
  if (!nt || typeof nt.timetable !== 'function') return null;
  var lines = mapLinesOf(name, mapRegOf(f)).slice(0, 20);
  if (!T.res || typeof T.res !== 'object') T.res = {};
  var res = T.res, fill = {}, baseMs = Date.now();
  var put = function (key, line, day) {
    if (res[key]) return;
    var a = nt.timetable({ line: line, from: name, baseMs: baseMs, day: day });
    if (a && typeof a === 'object' && !a.error) { res[key] = a; fill[key] = a; }
  };
  for (var i = 0; i < lines.length; i++) put(lines[i] + '|-', lines[i], undefined);
  var sel = (T.sel && typeof T.sel === 'object') ? T.sel : {};
  if (sel.line && lines.indexOf(sel.line) >= 0 && /^(DAY|SAT|SUN)$/.test(String(sel.day || ''))) put(sel.line + '|' + sel.day, sel.line, sel.day);
  return fill;
}
// 도착정보 분산 호출 실측(GET /bus-split-test?n=8&mode=single|split): 같은 정류장들을 동시에 n번 불러 키 하나로만 vs 키 둘로 반반 나눴을 때 오류(HTTP_ERROR)·시간을 비교한다. 키 값은 나오지 않는다.
async function handleBusSplitTest(request, env) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  var u = new URL(request.url), n = Math.max(1, Math.min(12, parseInt(u.searchParams.get('n') || '8', 10) || 8)), mode = u.searchParams.get('mode') === 'split' ? 'split' : 'single';
  var ids = String(u.searchParams.get('nodes') || 'ICB368000436,ICB368000437,ICB368000438,ICB368000439,ICB368000440,ICB368000441,ICB368000442,ICB368000443').split(',').filter(function (x) { return /^[A-Za-z0-9]{6,20}$/.test(x); }).slice(0, 12);
  var city = /^[0-9]{1,3}$/.test(u.searchParams.get('city') || '') ? u.searchParams.get('city') : '23';
  var ks = typeof tagoAttempts === 'function' ? tagoAttempts(env).filter(function (x) { return x.via === 'env-key' || x.via === 'env-key2'; }) : [];
  if (!ks.length || !ids.length) return new Response(JSON.stringify({ ok: false, error: 'no-key' }), { status: 200, headers: H });
  var t00 = Date.now();
  var rows = await Promise.all(Array.from({ length: n }, function (_, i) {
    var a = mode === 'split' && ks.length > 1 ? ks[i % 2] : ks[0], t0 = Date.now();
    var inner = MAP_TAGO_BASE + 'ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?cityCode=' + city + '&nodeId=' + ids[i % ids.length] + '&_type=json';
    return Promise.race([a.run(inner).then(function (r) { return r.text(); }), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 8000); })])
      .then(function (t) { return { via: a.via, ok: !mapArrErr(t) && t.length > 40, ms: Date.now() - t0 }; }, function () { return { via: a.via, ok: false, ms: Date.now() - t0 }; });
  }));
  var by = {}; rows.forEach(function (r) { var b = by[r.via] || (by[r.via] = { n: 0, ok: 0, ms: 0 }); b.n++; if (r.ok) b.ok++; b.ms += r.ms; });
  Object.keys(by).forEach(function (v) { by[v].avgMs = Math.round(by[v].ms / by[v].n); delete by[v].ms; });
  return new Response(JSON.stringify({ ok: true, mode: mode, n: n, keys: ks.length, okN: rows.filter(function (r) { return r.ok; }).length, totalMs: Date.now() - t00, by: by }), { headers: H });
}
// ═══ 기기 직접 받기용 공공 API 중계(GET /bus-tago?url=<인코딩된 원본 주소>) — 공공데이터 키 2개를 번갈아 쓴다 ═══
//   기기는 버스 서버(gildongmu-bus · 키 1개)와 이 주소(키 1·2)를 반반 나눠 동시에 부른다 → 같은 키에 몰리지 않아 오류(HTTP_ERROR)가 줄고 빨라진다.
//   키가 하나뿐이거나 한쪽이 오류 봉투(200)·키 오류면 바로 다른 키로. 둘 다 못 받으면 502(기기가 다른 길로 다시 받는다). 허용: apis.data.go.kr · ws.bus.go.kr 만. 키 값은 내보내지 않는다.
var MAPBT_RR = 0;
function mapKeyList(env) {
  var out = [], c = [env && (env.TAGO_KEY || env.DATA_GO_KR_KEY), env && env.TAGO_KEY2];
  c.forEach(function (k) {
    k = String(k || '');
    if (/%[0-9A-Fa-f]{2}/.test(k)) { try { k = decodeURIComponent(k); } catch (e) { /* 원본 사용 */ } }
    if (k && out.indexOf(k) < 0) out.push(k);
  });
  return out;
}
function mapKeyUrl(url, key) {
  var base = String(url).replace(/([?&])(serviceKey|ServiceKey)=[^&]*&?/g, '$1').replace(/[?&]$/, '');
  var sep = base.indexOf('?') >= 0 ? '&' : '?', k = encodeURIComponent(key);
  if (/^https?:\/\/ws\.bus\.go\.kr\//.test(base)) return base + sep + 'serviceKey=' + k + '&ServiceKey=' + k;
  return base + sep + 'serviceKey=' + k;
}
function mapBtBad(t) { return !t || mapArrErr(t) || /Key\uc778\uc99d\uc2e4\ud328|SERVICE\s*KEY\s*IS\s*NOT\s*REGISTERED|<headerCd>\s*[1-9]/i.test(t.slice(0, 4000)); }
async function handleBusTago(request, env) {
  var H = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  var raw = new URL(request.url).searchParams.get('url') || '';
  if (raw.length === 0 || raw.length > 1500 || !/^https?:\/\/(apis\.data\.go\.kr|ws\.bus\.go\.kr)\//.test(raw)) return new Response('bad-url', { status: 400, headers: H });
  var keys = mapKeyList(env);
  if (!keys.length) return new Response('no-key', { status: 500, headers: H });
  var first = (MAPBT_RR++) % keys.length;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[(first + i) % keys.length], tgt = mapKeyUrl(raw, key);
    for (var pr = 0; pr < 2; pr++) {                                                           // ws.bus.go.kr 는 http 만 받는 때가 있어 프로토콜을 바꿔 한 번 더
      try {
        var u2 = pr === 0 ? tgt : tgt.replace(/^https?:/, /^https:/.test(tgt) ? 'http:' : 'https:');
        var res = await Promise.race([fetch(u2, { headers: { 'Accept': '*/*', 'User-Agent': 'gildongmu/1.0' } }), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 3500); })]);
        var txt = await res.text();
        if (res.status === 200 && !mapBtBad(txt)) return new Response(txt, { status: 200, headers: Object.assign({ "Content-Type": res.headers.get('Content-Type') || 'text/plain; charset=utf-8' }, H) });
        if (res.status === 200 || pr === 1) break;
      } catch (e) { /* 다음 시도 */ }
    }
  }
  return new Response('bus-bad', { status: 502, headers: H });
}
