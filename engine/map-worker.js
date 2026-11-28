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
// ★ s462 (YJ: "카카오는 바로 뜨는데 우리는 바로 안 뜨는 게 너무 많다 — 적어도 3초 안에 다 나오게") — 거의 안 바뀌는 조회는 한 번 받으면 데이터센터 캐시에 12시간 둔다.
//   경유노선 목록(getSttnThrghRouteList · 열쇠 t/u) · 좌표로 다시 찾은 정류장 목록(getCrdntPrxmtSttnList · t100+) · 노선 정류장 목록(getRouteAcctoThrghSttnList · r) 은 예전엔 매번 공공 API 를 불러
//   2~21초씩 걸렸다(도착정보 8곳 + 경유노선 8곳을 한꺼번에 불러 서로 느려지기도 했다). 이제 두 번째부터는 즉시. 도착정보(실시간)는 그대로 캐시하지 않는다.
var MAPSV_STATIC_OP = /\/(getSttnThrghRouteList|getRouteAcctoThrghSttnList|getCrdntPrxmtSttnList)\?/;
function mapSvStaticCls(url) {                            // 캐시 종류: 'tl'(경유노선 · 좌표 정류장 목록) · 'rl'(노선 정류장 목록) · ''(캐시하지 않는다)
  var m = MAPSV_STATIC_OP.exec(String(url || ''));
  if (!m || !/^https?:\/\/apis\.data\.go\.kr\//.test(String(url)) || !/[?&]serviceKey=(&|$)/i.test(String(url))) return '';
  return m[1] === 'getRouteAcctoThrghSttnList' ? 'rl' : 'tl';
}
function mapSvOkBody(k, t) {                              // 캐시에 둘 만한 정상 본문인가(정류장 목록 · 경유노선 · 노선 정류장 목록)
  if (typeof t !== 'string' || t.length < 40) return false;
  if (k === 'tl' || k === 'rl') { try { var o2 = JSON.parse(t), it2 = o2.response.body.items; if (!it2 || !it2.item) return false; return !Array.isArray(it2.item) || it2.item.length > 0; } catch (e2) { return false; } }          // 빈 목록 · 오류 봉투는 캐시하지 않는다(잠깐의 빈 응답이 12시간 굳지 않게)
  if (k === 'tp') return (t.indexOf('<itemList>') >= 0 || /"itemList"\s*:\s*[\[{]/.test(t)) && !/Key인증실패|SERVICE\s*KEY\s*IS\s*NOT\s*REGISTERED/i.test(t) && !/<headerCd>\s*[1-9]/.test(t) && !/"headerCd"\s*:\s*"?[1-9]/.test(t.slice(0, 600));
  if (k === 'gg') return t.indexOf('busStationAroundList') >= 0;
  if (k === 'tn') { try { var o = JSON.parse(t); var it = o.response.body.items; return !!(it && it.item); } catch (e) { return false; } }
  if (k === 'd1') return t.indexOf('"stops":[{') >= 0 || t.indexOf('"stops": [{') >= 0;
  return false;
}
function mapSvViaBinding(env, url, sig) {                  // → Promise<Response> 또는 null(허용하지 않는 주소 · 바인딩 없음) · s467: sig — 취소 신호(지거나 늦은 호출을 끊어 Cloudflare 동시 연결 6칸을 비운다)
  if (!env || !env.BUSAPI || typeof env.BUSAPI.fetch !== 'function') return null;
  var u = String(url || ''), m, init = sig ? { signal: sig } : undefined;
  if (u.length > 700) return null;
  if (MAPSV_HOSTS.test(u)) return env.BUSAPI.fetch(new Request('https://busapi.internal/tago?url=' + encodeURIComponent(u), init));
  if ((m = MAPSV_D1.exec(u))) return env.BUSAPI.fetch(new Request('https://busapi.internal' + m[1], init));
  return null;
}
function mapSvAttempts(env, url, seq) {                    // → [(sig?) => Promise<Response>|null] 시도 순서 · s467: sig 가 있으면 그 호출을 끊을 수 있다(run 이 두 번째 인자를 받지 않는 옛 번들은 그냥 무시)
  var out = [];
  if (typeof tagoAttempts === 'function' && env && /^https?:\/\/apis\.data\.go\.kr\//.test(url)) {
    var inner = url.replace(/([?&])serviceKey=[^&]*&?/, '$1').replace(/[?&]$/, '');
    var ks = tagoAttempts(env).filter(function (x) { return x.via === 'env-key' || x.via === 'env-key2' || x.via === 'default-key'; });
    if (ks.length > 1 && seq % 2 === 1) ks = ks.slice(1).concat(ks.slice(0, 1));
    ks.slice(0, 2).forEach(function (x) { out.push(function (sig) { return x.run(inner, sig); }); });
  }
  if (env && env.BUSAPI && typeof env.BUSAPI.fetch === 'function') out.push(function (sig) { return mapSvViaBinding(env, url, sig); });
  return out;
}
async function mapSvOne0(env, k, url, fresh, ops) {                    // → 본문 글(실패는 ''). s463: ops — 이 요청이 지금까지 쓴 하위 요청(fetch · Cache API · KV) 수({n}) · 무료 요금제 50개 한도를 넘기지 않으려고 세어 둔다
  var stopK = k === 'tp' || k === 'gg' || k === 'tn' || k === 'd1', sc = stopK ? '' : mapSvStaticCls(url), kc = sc || k;          // s462: sc — 경유노선 · 노선 정류장 목록(거의 안 바뀜)도 데이터센터 캐시에(KV 는 쓰지 않는다 — 쓰기 한도 보호)
  var cacheable = stopK || !!sc, cache = null, ck = null;
  if (cacheable) {
    try {
      if (typeof caches !== 'undefined' && caches.default) {
        cache = caches.default; ck = new Request('https://map-sv-cache.internal/s?v=2&k=' + kc + '&u=' + encodeURIComponent(url));          // s451: v=2 — 역 출구 정류장이 빠진 채 보관된 옛 정류장 목록(데이터센터 12시간 · KV 14일)을 버리고 새로 받는다
        if (ops) ops.n++;
        var hit = fresh ? null : await cache.match(ck);                                          // s383: 새로고침(fresh)은 보관본을 건너뛰고 공공 API 에서 새로 — 받은 뒤 보관본은 새것으로 덮는다
        if (hit) { var ht = await hit.text(); if (mapSvOkBody(kc, ht)) return ht; }
      }
    } catch (e0) { cache = null; }
    if (ops && !(fresh || sc)) ops.n++;
    var kvb = (fresh || sc) ? '' : await mapSvKvGet(env, k, url);                                                   // s290: 이 데이터센터 캐시에 없으면 전국 공용 저장소(KV)에서 — 다른 곳에서 한 번이라도 받았으면 바로 나온다
    if (kvb) {
      if (cache && ck) { try { await cache.put(ck, new Response(kvb, { headers: { 'Cache-Control': 'public, max-age=43200', 'Content-Type': 'text/plain; charset=utf-8' } })); } catch (eK) { /* 무시 */ } }
      return kvb;
    }
  }
  var af = cacheable ? '' : mapSvArrFam(url), tStart = Date.now();                                    // s463: 도착정보는 이 데이터센터 공유 캐시(받은 지 5초 안 · saver 9초 · critical 15초)에 있으면 공공 API 를 부르지 않는다
  if (af) { var ab = await mapSvArrGet(url, ops); if (ab) { mapSvUse('map.arr.saved'); return ab; } }
  var atts = mapSvAttempts(env, url, parseInt(String(k).replace(/\D/g, ''), 10) || 0);          // 공공데이터 키가 둘이면 정류장을 반반씩(짝수 번째는 키1 먼저 · 홀수 번째는 키2 먼저) 나눠 묻고, 한쪽이 오류면 바로 다른 쪽 · 마지막은 BUSAPI 바인딩
  if (!atts.length) return '';
  if (atts.length === 1) atts.push(atts[0]);                                                  // 길이 하나뿐이면 한 번 더
  // s174: 헤지 — 첫 시도가 0.7초 안에 안 오면 기다리지 않고 다음 길(다른 키)을 동시에 띄워 먼저 온 정상 본문을 쓴다. 빨리 실패(오류 봉투)하면 즉시 다음 길. 최대 3번.
  var bm = af ? mapSvBudMode(af) : 'normal', max = Math.min(atts.length, bm === 'normal' ? 3 : 2), gap = (ops && ops.gap) || MAPSV_HEDGE_GAP[bm] || 700, launched = 0, inflight = [];          // s463: 아낌 모드는 '동시에 한 번 더'를 늦추고 세 번째 길은 띄우지 않는다
  var g1 = (af && bm === 'normal' && /^[af][0-2]$/.test(String(k))) ? ((ops && ops.near !== undefined) ? ops.near : MAPSV_NEAR_GAP) : gap;      // s464: 가장 가까운 정류장 셋(a0~a2 · 즐겨찾기 f0~f2)의 도착정보는 처음부터 두 길을 동시에 — 공공 API 의 느린 꼬리(2~5초)를 피한다. 아낌·절약 모드(70%+)는 예전 간격 그대로
  function start() {
    var o = {};
    mapSvUse(af ? 'map.arr.' + af : (cacheable ? 'map.st' : 'map.etc')); if (launched > 1) mapSvUse('map.hedge'); if (ops) ops.n++;          // s463: 실제로 나가는 호출을 센다
    var ac = null, att = atts[launched - 1];
    try { ac = (typeof AbortController === 'function') ? new AbortController() : null; } catch (eAc) { ac = null; }
    o.ac = ac;                                                                                   // s467: 이 시도의 취소 손잡이 — 시간 제한을 넘기거나 다른 길이 먼저 정상 본문을 주면 끊는다(예전엔 안 끊어 멈춘 호출이 동시 연결 6칸을 오래 잡았다)
    o.p = (async function () {
      var tmo = null;
      try {
        var work = (async function () {
          var p = att(ac ? ac.signal : undefined);
          if (!p) return '';
          var res = await p;
          if (res && res.status === 200) { var tx = await res.text(); return mapArrErr(tx) ? '' : tx; }          // 공공 API 오류 봉투(200)는 받지 못한 것
          return '';
        })();
        work.catch(function () { /* 끊긴 시도의 거절은 여기서 삼킨다 */ });
        return await Promise.race([work, new Promise(function (_, rej) { tmo = setTimeout(function () { try { if (ac) ac.abort(); } catch (eA) { /* 무시 */ } rej(new Error('timeout')); }, (ops && ops.to) || 3000); })]);          // s467: 시간 제한은 본문 읽기까지(머리만 오고 본문이 멈추는 경우도)
      } catch (e1) { /* 실패 */ } finally { if (tmo) clearTimeout(tmo); }
      return '';
    })().then(function (b) { o.b = b; return o; });
    inflight.push(o);
  }
  launched++; start();
  while (inflight.length) {
    var waiters = inflight.map(function (o) { return o.p; });
    if (launched < max) waiters.push(new Promise(function (r) { setTimeout(function () { r(null); }, launched === 1 ? g1 : gap); }));
    var w = await Promise.race(waiters);
    if (w === null) { launched++; start(); continue; }                                         // 느리다 — 다른 길을 동시에
    inflight.splice(inflight.indexOf(w), 1);
    if (w.b) {
      inflight.forEach(function (o2) { try { if (o2.ac) o2.ac.abort(); } catch (eB) { /* 무시 */ } });          // s467: 먼저 온 정상 본문이 있으니 아직 가는 다른 길은 끊는다(공공 API 에 쓸데없이 매달리지 않게)
      if (af) mapSvArrPut(url, w.b, tStart, ops);                                              // s463: 받은 도착정보는 같은 데이터센터의 다른 요청도 쓰게(뒤에서)
      if (cache && ck && mapSvOkBody(kc, w.b)) { if (ops) ops.n++; try { await cache.put(ck, new Response(w.b, { headers: { 'Cache-Control': 'public, max-age=43200', 'Content-Type': 'text/plain; charset=utf-8' } })); } catch (e2) { /* 캐시 실패는 무시 */ } }
      if (stopK && mapSvOkBody(k, w.b)) { if (ops) ops.n += 3; mapSvKvPut(env, k, url, w.b); }                           // s290: 전국 공용 저장소에도(응답을 붙잡지 않고 뒤에서)
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
// ★ s463 (YJ: "API 호출량 조절 · 기술적으로 최대한 카카오처럼 — 클라우드플레어만으로") — 호출 세기 · 하루 예산 조절기 · 같은 데이터센터 안 도착정보 공유
//   ① 세기: 이 서버가 공공 API 로 내보내는 호출을 live_usage 에 센다(map.arr.tago|seoul|gbis = 실제 나간 호출 · map.hedge = 그중 '느려서 동시에 한 번 더 띄운' 호출 · map.arr.saved = 기억·공유 캐시로 아낀 호출 · map.st = 정류장·노선 목록 호출).
//      예전엔 이 길(지도 서버 · /bus-tago)의 호출이 아예 세어지지 않아 하루 사용량이 실제보다 적게 보였다.
//   ② 조절기: 오늘(한국 날짜) TAGO 도착정보(500,000/일) · 서울 도착정보(10,000/일) 사용량을 D1 live_usage 에서 1분에 한 번만(요청을 막지 않고 뒤에서) 읽어 모드를 정한다 — 70% 이상 'saver' · 90% 이상 'critical'.
//      saver/critical 에서는 같은 정류장 도착정보를 5초 → 9초/15초 동안 다시 부르지 않고 쓰며, 느린 호출에 '동시에 한 번 더'(헤지)를 늦추고(0.7초 → 1.2/1.8초) 세 번째 길은 띄우지 않는다. 화면의 도착정보는 그래도 15초를 넘지 않는다.
//   ③ 공유: 도착정보를 이 데이터센터의 Cache API 에 짧게 둔다(받은 시각을 함께 적어 TTL 안에서만 쓴다 · 빈 목록 · 오류 봉투는 두지 않는다) → 같은 곳을 여러 기기가 부르면 공공 API 는 한 번만 나간다.
//      무료 요금제는 요청 하나당 하위 요청(fetch · Cache API · KV · D1)이 50개까지라, 한 요청 안에서 이미 많이 썼으면(MAPSV_OPS_SOFT) 이 공유 캐시는 건너뛴다(없어도 화면은 같다).
var MAPSV_LIMIT_DEF = { tago: 500000, seoul: 10000 };
var MAPSV_BUD = { t: 0, busy: false, modes: { tago: 'normal', seoul: 'normal' }, used: { tago: 0, seoul: 0 }, limit: { tago: 500000, seoul: 10000 }, day: '', err: '', at: 0 };
var MAPSV_BUD_MS = 60000, MAPSV_BUD_SAVER = 0.7, MAPSV_BUD_CRIT = 0.9;
var MAPSV_BUD_KEYS = { tago: ['bus.tago.arr', 'map.arr.tago', 'tago.env-key', 'tago.env-key2'], seoul: ['bus.seoul.arr', 'map.arr.seoul'] };
var MAPSV_ARR_TTL = { normal: 5000, saver: 9000, critical: 15000 };
var MAPSV_HEDGE_GAP = { normal: 700, saver: 1200, critical: 1800 };
var MAPSV_OPS_SOFT = 32;
var MAPSV_NEAR_GAP = 0;                                     // s464: 가까운 정류장 도착정보의 '두 번째 길' 동시 시작 간격(ms) — normal 모드에서만
function mapSvUse(k) { try { if (typeof usageAdd === 'function') usageAdd(k); } catch (e) { /* 세기 실패는 무시 */ } }
function mapSvArrFam(url) {                                // 도착정보 주소의 종류: 'tago' · 'gbis' · 'seoul' · ''(도착정보가 아니거나 열쇠가 들어 있다 — 캐시하지 않는다)
  var u = String(url || '');
  if (/[?&]serviceKey=[^&]/i.test(u)) return '';
  if (/^https?:\/\/apis\.data\.go\.kr\/1613000\/ArvlInfoInqireService\/getSttnAcctoArvlPrearngeInfoList\?/.test(u)) return 'tago';
  if (/^https?:\/\/apis\.data\.go\.kr\/6410000\/busarrivalservice\/v2\/getBusArrivalListv2\?/.test(u)) return 'gbis';
  if (/^https?:\/\/ws\.bus\.go\.kr\/api\/rest\/stationinfo\/getStationByUid\?/.test(u)) return 'seoul';
  return '';
}
function mapSvArrOk(t) {                                   // 공유 캐시에 둘 만한 도착정보인가: 오류 봉투가 아니고 정류장에 버스가 한 대라도 있다(빈 목록은 잠깐의 빈 응답일 수 있어 두지 않는다)
  return typeof t === 'string' && t.length > 60 && !mapArrErr(t) && /"item"\s*:\s*[\[{]|<itemList>|"itemList"\s*:\s*[\[{]|"busArrivalList"\s*:\s*[\[{]|<busArrivalList>/.test(t);
}
function mapSvBudMode(fam) { return (fam && MAPSV_BUD.modes[fam]) || 'normal'; }
function mapSvArrTtl(url) { return MAPSV_ARR_TTL[mapSvBudMode(mapSvArrFam(url))] || MAPSV_ARR_TTL.normal; }
function mapSvBudEval(rows, pend, limit) {                 // 순수 계산: live_usage 행 + 이 isolate 에 아직 못 올린 세기 → 종류별 사용량 · 모드
  var by = {}, used = { tago: 0, seoul: 0 }, modes = {}, lim = {}, worst = 0;
  (rows || []).forEach(function (r) { if (r && r.k != null) by[String(r.k)] = (by[String(r.k)] || 0) + (Number(r.n) || 0); });
  Object.keys(MAPSV_BUD_KEYS).forEach(function (f) {
    MAPSV_BUD_KEYS[f].forEach(function (k) { used[f] += (by[k] || 0) + ((pend && Number(pend[k])) || 0); });
    lim[f] = (limit && Number(limit[f]) > 0) ? Number(limit[f]) : MAPSV_LIMIT_DEF[f];
    var ratio = used[f] / lim[f];
    modes[f] = ratio >= MAPSV_BUD_CRIT ? 'critical' : ratio >= MAPSV_BUD_SAVER ? 'saver' : 'normal';
    if (ratio > worst) worst = ratio;
  });
  return { modes: modes, used: used, limit: lim, ratio: worst };
}
function mapSvBudRefresh(env, force) {                     // 1분에 한 번 뒤에서 읽는다(응답을 막지 않는다 — 처음 요청은 'normal'로 가고 읽은 뒤부터 반영). 못 읽으면 지난 모드 그대로
  var now = Date.now();
  if (MAPSV_BUD.busy || (!force && now - MAPSV_BUD.t < MAPSV_BUD_MS)) return null;
  if (!env || !env.DB || typeof env.DB.prepare !== 'function') return null;
  MAPSV_BUD.busy = true; MAPSV_BUD.t = now;
  var run = (async function () {
    try {
      var day = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
      var rs = await Promise.race([env.DB.prepare('SELECT k, n FROM live_usage WHERE day = ?').bind(day).all(), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 1500); })]);
      var ev = mapSvBudEval(rs && rs.results, (typeof USAGE !== 'undefined' && USAGE) ? USAGE.n : null, { tago: Number(env.TAGO_ARR_LIMIT), seoul: Number(env.SEOUL_ARR_LIMIT) });
      MAPSV_BUD.modes = ev.modes; MAPSV_BUD.used = ev.used; MAPSV_BUD.limit = ev.limit; MAPSV_BUD.day = day; MAPSV_BUD.err = ''; MAPSV_BUD.at = Date.now();
    } catch (e) { MAPSV_BUD.err = String(e && e.message || e).slice(0, 80); }
    MAPSV_BUD.busy = false;
  })();
  if (MAPSV_CTX && typeof MAPSV_CTX.waitUntil === 'function') { try { MAPSV_CTX.waitUntil(run); } catch (e0) { /* 무시 */ } }
  return run;
}
function mapSvArrReq(url) { return new Request('https://map-sv-cache.internal/a?v=1&u=' + encodeURIComponent(url)); }
async function mapSvArrGet(url, ops) {                     // → 공유 캐시의 도착정보 본문(받은 지 TTL 안인 것만) 또는 ''
  try {
    if (!mapSvArrFam(url) || typeof caches === 'undefined' || !caches.default) return '';
    if (ops && ops.n >= MAPSV_OPS_SOFT) return '';
    if (ops) ops.n++;
    var h = await caches.default.match(mapSvArrReq(url));
    if (!h) return '';
    var at = Number(h.headers.get('x-at')) || 0, now = Date.now();
    if (!at || at > now + 1000 || now - at >= mapSvArrTtl(url)) return '';
    var t = await h.text();
    return mapSvArrOk(t) ? t : '';
  } catch (e) { return ''; }
}
function mapSvArrPut(url, body, at, ops) {                 // 받은 뒤 뒤에서(waitUntil) — 받기 시작한 시각(at)을 적어 둔다(느리게 받았어도 그만큼 오래된 것으로 친다)
  try {
    if (!mapSvArrFam(url) || !mapSvArrOk(body) || typeof caches === 'undefined' || !caches.default) return;
    if (ops && ops.n >= MAPSV_OPS_SOFT) return;
    if (ops) ops.n++;
    var p = caches.default.put(mapSvArrReq(url), new Response(body, { headers: { 'Cache-Control': 'public, max-age=30', 'Content-Type': 'text/plain; charset=utf-8', 'x-at': String(at || Date.now()) } })).catch(function () { /* 캐시 실패는 무시 */ });
    if (MAPSV_CTX && typeof MAPSV_CTX.waitUntil === 'function') MAPSV_CTX.waitUntil(p);
  } catch (e) { /* 무시 */ }
}
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
function mapSvKvKey(k, url) { return 'bs2:' + mapSvHash(String(k) + '|' + String(url)); }                // s451: bs → bs2 (옛 보관본을 쓰지 않는다)
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
function mapSvOne(env, k, url, fresh, ops) {                       // → Promise<본문 글> (정류장 목록은 mapSvOne0 의 캐시 · 도착정보는 합치기 + 5초 기억 — s463: 아낌 모드면 9초 · 15초)
  if (k === 'tp' || k === 'gg' || k === 'tn' || k === 'd1') return mapSvOne0(env, k, url, fresh, ops);
  var now = Date.now(), e = MAPSV_MEMO[url], ttl = mapSvArrTtl(url);
  if (e && now - e.t < ttl) { mapSvUse('map.arr.saved'); return e.p; }
  var ent = { t: now, p: null };
  ent.p = mapSvOne0(env, k, url, undefined, ops).then(function (b) { if (!b && MAPSV_MEMO[url] === ent) delete MAPSV_MEMO[url]; return b; }, function () { if (MAPSV_MEMO[url] === ent) delete MAPSV_MEMO[url]; return ''; });
  if (++MAPSV_MEMO_N > 300) { MAPSV_MEMO = {}; MAPSV_MEMO_N = 0; }
  MAPSV_MEMO[url] = ent;
  return ent.p;
}
var MAPSV_D1_WAIT_MS = 1500;                                                                              // s458: 정류장 목록 단계에서 우리 정류장 표(D1)를 기다리는 한도
var MAPSV_TN_CAP_MS = 1200; /* s482: stop-list stage - after this long, if only a slow TAGO (tn) is still pending and the stops already received give a nearest-stop list, draw without it (the late TAGO still fills the cache) */ var MAPSV_D1_AGAIN_MS = 600;                                                                              // s459: 정류장 단계에서 못 기다린 D1(우리 정류장 표)을 도착정보 단계에서 되받을 때 더 기다리는 한도 — 도착정보가 다 온 뒤부터 · 예산 안에서
// ★ s462 — 열쇠의 무게: 'core'(도착정보 a·f·g·h · 좌표로 다시 찾은 정류장 목록 t·u 100+ — 곧 도착정보로 이어진다) 는 기다리고, 'opt'(경유노선 t·u 0~99 · 방면 r)는 화면을 막지 않는다.
function mapSvTier(k) {
  k = String(k || '');
  if (/^[tu][0-9]{1,2}$/.test(k) || /^r[0-9]{1,3}$/.test(k)) return 'opt';
  return 'core';
}
var MAPSV_OPT_GATE_MS = 500, MAPSV_OPT_GRACE_MS = 250, MAPSV_SVO_ROUNDS = 5, MAPSV_SVO_WAVES = 3;
// ★ s464 (YJ: "순서대로 해줘" — 첫 도착정보 3초 안) — ① 새 앱(svo)은 가장 느린 정류장을 예산 끝(≈3.1초)까지 기다리지 않는다: 쓸 만한 도착정보가 하나라도 오면 0.4초(받기를 시작한 지 0.6초는 지난 뒤)만 더 기다리고 돌려준다.
//   못 받은 정류장은 응답 뒤에서 계속 받아(waitUntil) 기기의 다음 요청이 캐시에서 바로 가져간다. 같은 요청 안의 추가 바퀴도 건너뛴다(예전엔 남은 정류장을 다시 붙잡아 결국 예산 끝까지 갔다).
var MAPSV_EARLY_GRACE_MS = 400, MAPSV_EARLY_MIN_MS = 600;
// ★ s467 (YJ: "2번 먼저") — 쓸 만한 도착정보가 한 건도 없는데(밤 · 오류 · 빈 본문) 도착정보(core) 대부분이 이미 끝났고 몇 곳만 멈춰 있으면, 그 몇 곳 때문에 마감(≈3.1초)까지 붙잡지 않는다.
//   받기를 시작한 지 1초가 지났고 core 의 75% 이상이 끝났으면 일찍 돌려준다(남은 곳은 응답 뒤에서 계속 받고 · 기기가 이어 받는다). 요청 f.bus.dbg=1 + f.bus.tune.nosettle=1 이면 예전 동작(시험 비교용).
var MAPSV_SETTLE_MS = 1000, MAPSV_SETTLE_FRAC = 0.75;
// ★ s467 (YJ: "3번 먼저") — 방향 이름('→ ○○방향') 재요청: 도착정보는 이미 화면에 있고 남은 것이 노선 정류장 목록(r · 큰 본문)뿐인 요청이면, 서버가 그 목록을 직접(12시간 캐시 · 동시 · 한도 안에서) 받아 방향 이름을 채워 돌려준다.
//   기기가 4노선씩 여러 바퀴 도는 대신 한 번에 끝난다. 도착정보를 막 받은 첫 응답(arrWaves > 0)은 이 일로 늦추지 않는다. 못 끝낸 것은 응답 뒤에서 계속(캐시를 채움) · 기기가 예전처럼 이어 받는다. f.bus.dbg=1 + tune.nonx=1 이면 끈다.
var MAPSV_NX_MS = 1800, MAPSV_NX_ROUNDS = 3, MAPSV_NX_MAX = 12;
// ★ s466 (YJ: "병목부분 찾고" — 낮 실측: 같은 요청 안 두 번째 도착정보 바퀴(좌표로 다시 찾은 정류장 t100+ · 바꾼 ID 도착정보)가 끝날 때까지 붙잡혀, 첫 바퀴에서 도착정보를 이미 받고도 응답이 예산 끝(≈3.1초)까지 늦던 곳이 12%(부산 동래 · 서면 · 순천 …)).
//   쓸 만한 도착정보를 처음 받은 때부터 추가 바퀴들은 합쳐서 W2 한도(0.7초)까지만 기다리고 돌려준다(빠르면 예전처럼 한 요청에서 끝까지). 못 끝낸 것은 응답 뒤에서 계속 받고(waitUntil) 기기가 이어 받는다. 요청 f.bus.dbg=1 + f.bus.tune.old=1 이면 예전 동작(시험 비교용).
var MAPSV_W2_CAP_MS = 700;
function mapSvHasUseful(got) {                              // 이 요청에서 쓸 만한(버스가 있는) 정류장 도착정보(a·f)를 이미 받았나
  for (var k in got) if (Object.prototype.hasOwnProperty.call(got, k) && /^[af][0-9]{1,3}$/.test(k) && mapSvArrOk(got[k])) return true;
  return false;
}
// → true 면 '일찍 돌려준다'(core 가 아직 덜 왔다) — 호출한 쪽은 추가 바퀴를 돌지 않는다
async function mapSvArrWait(ps, need, done, budget, svo, wi) {            // s467: wi — 호출한 쪽이 '왜 돌려줬나'(wi.why)를 진단에 쓰려고 넘기는 빈 객체(선택) · wi.nosettle 이면 '대부분 끝났는데 일부만 멈춘' 조기 반환을 끈다
  var dIx = -1; need.forEach(function (n, i) { if (String(n.k || '') === 'd1') dIx = i; });
  var tW = Date.now(), early = false;
  if (svo) {                                                // s462: f.bus.svo=1(새 앱) — 도착정보(core)가 다 오면 경유노선(덤)은 0.25초만 더 기다리고 돌려준다(예전엔 가장 느린 덤까지 예산 끝까지 붙잡혔다)
    var coreP = ps.filter(function (p, i) { return i !== dIx && mapSvTier(need[i].k) === 'core'; });
    var allCore = Promise.all(coreP), tmo = null, stl = null, over = false;
    var firstP = new Promise(function (r) {                 // s464: 쓸 만한(버스가 있는) 정류장 도착정보(a·f)가 처음 오는 순간
      need.forEach(function (n, i) {
        var k = String(n.k || '');
        if (i === dIx || !/^[af][0-9]{1,3}$/.test(k) || mapSvTier(k) !== 'core') return;
        ps[i].then(function (t) { if (t && mapSvArrOk(t)) r(true); }, function () { /* 무시 */ });
      });
    });
    var settleP = new Promise(function (r) {                // s467: 쓸 만한 도착정보는 없는데 core 의 75%+ 가 끝났고 몇 곳만 멈춘 채 1초가 지남 → 그 몇 곳 때문에 마감까지 붙잡지 않는다
      if (wi && wi.nosettle) return;
      var coreIx = []; need.forEach(function (n, i) { if (i !== dIx && mapSvTier(n.k) === 'core') coreIx.push(i); });
      var chk = function () {
        if (over) return;
        var nd = 0; coreIx.forEach(function (i) { if (done[i]) nd++; });
        if (nd > 0 && nd < coreIx.length && nd >= Math.ceil(coreIx.length * MAPSV_SETTLE_FRAC)) { r(true); return; }
        stl = setTimeout(chk, 100);
      };
      stl = setTimeout(chk, Math.max(0, Math.min(MAPSV_SETTLE_MS, budget - 100)));
    });
    var why = await Promise.race([allCore.then(function () { return 'all'; }), new Promise(function (r) { tmo = setTimeout(function () { r('to'); }, budget); }), firstP.then(function () { return 'first'; }), settleP.then(function () { return 'settled'; })]);
    over = true; if (stl) clearTimeout(stl);
    if (tmo) clearTimeout(tmo);
    if (wi) wi.why = why;
    if (why === 'settled') early = true;
    if (why === 'first') {
      var more = Math.min(Math.max(MAPSV_EARLY_GRACE_MS, MAPSV_EARLY_MIN_MS - (Date.now() - tW)), budget - (Date.now() - tW));
      if (more > 0) await Promise.race([allCore, new Promise(function (r) { setTimeout(r, more); })]);
      early = need.some(function (n, i) { return i !== dIx && mapSvTier(n.k) === 'core' && !done[i]; });
    }
    var gl = Math.min(MAPSV_OPT_GRACE_MS, budget - (Date.now() - tW));
    if (!early && gl > 0) await Promise.race([Promise.all(ps.filter(function (p, i) { return i !== dIx; })), new Promise(function (r) { setTimeout(r, gl); })]);
  }
  else await Promise.race([Promise.all(ps.filter(function (p, i) { return i !== dIx; })), new Promise(function (r) { setTimeout(r, budget); })]);
  if (dIx >= 0 && !done[dIx]) { var left = Math.min(MAPSV_D1_AGAIN_MS, budget) - (Date.now() - tW); if (left > 0) await Promise.race([ps[dIx], new Promise(function (r) { setTimeout(r, left); })]); }
  return early;
}
// ★ s468 (YJ: "너가 진짜 사용자라고 생각하고 카카오랑 비교했을때, 카카오만큼은 할 수 있게") — 방향 이름 저장소.
//   카카오는 노선·정류장 자료를 자기 서버에 두고 있어 '→ ○○방면'이 처음부터 붙는다. 우리는 공공 API 의 노선 정류장 목록(15KB · 콜드일 때 1~6초)에서 매번 뽑아 새 기기·새 동네는 방향 이름이 2~29초 늦게 채워졌다.
//   이름은 '정류장+노선 → 다음 정류장'이라 거의 안 바뀌는 사실이다 → 한 번 알아낸 것은 D1 표(bus_nx1)에 모아 두고(정류장 ID 로 한 번에 읽는다), 정류장을 알게 된 즉시 도착정보 받기와 나란히 읽어 첫 응답에 바로 넣는다.
//   · 읽기: 정류장 단계가 끝나면(도착정보 받기와 동시에) 그 정류장들의 항목을 한 번에 읽어 f.bus.nx 에 합친다(기기가 가진 같은 열쇠가 우선). 합쳐진 열쇠는 엔진이 r(노선 목록)을 부탁하지 않는다.
//   · 쓰기: 이 요청에서 엔진이 새로 뽑은 항목(info.nx 중 기기·저장소에 없던 것 · 지금 화면의 정류장 것만 · 빈 값 제외)만 응답 뒤에서(waitUntil) 올린다. 같은 열쇠가 20일 안이면 덮어쓰지 않는다(엉뚱한 본문이 굳는 것 방지). 읽을 때는 60일 넘은 항목을 버린다.
//   · 표가 없으면 스스로 만든다(CREATE TABLE IF NOT EXISTS — 이 워커의 다른 표들과 같은 방식). D1 이 느리거나 막히면 없던 것처럼(예전 동작) 간다. 요청 f.bus.dbg=1 + tune.nonxdb=1 이면 끈다.
var MAPSV_NXDB_TBL = 'bus_nx1', MAPSV_NXDB_TTL_MS = 60 * 86400000, MAPSV_NXDB_REWRITE_MS = 20 * 86400000, MAPSV_NXDB_WAIT_MS = 500, MAPSV_NXDB_READ_MS = 1500, MAPSV_NXDB_IDS = 24, MAPSV_NXDB_WRITE = 120, MAPSV_NXDB_OPS = 40;
var MAPSV_NXDB = { mk: false };
function mapSvNxSid(k) {                                    // nx 열쇠 → 정류장 ID (모르는 모양이면 '') — 'ID|노선' · 'lm|ID' · 'fx|ID' · 'od|ID|노선'
  var p = String(k || '').split('|');
  if (p[0] === 'lm' || p[0] === 'fx') return p.length === 2 ? p[1] : '';
  if (p[0] === 'od') return p.length === 3 ? p[1] : '';
  return p.length === 2 ? p[0] : '';
}
var MAPSV_NXDB_EMPTY = '~';                                  // 이름 옆 방향(lm)의 '찾았지만 해당 역 · 시청이 없음'(빈 값)을 저장소에서 구분하는 표시 — 엔진은 빈 값도 '이미 물었다'로 쓴다(다시 안 묻는다)
function mapSvNxEnc(k, v) {                                  // 저장할 값 또는 null — 방향 이름(빈 값은 목록을 못 읽은 일시 오류일 수 있다) 은 빈 값 · 너무 긴 값 · 제어문자/태그를 저장하지 않는다
  if (typeof v !== 'string' || v.length > 40 || /[\u0000-\u001f<>]/.test(v)) return null;
  if (!v) return /^lm\|/.test(k) ? MAPSV_NXDB_EMPTY : null;
  return v;
}
function mapSvNxDec(k, v) { return (/^lm\|/.test(k) && v === MAPSV_NXDB_EMPTY) ? '' : v; }
async function mapSvNxEnsure(env) {
  if (MAPSV_NXDB.mk) return true;
  try {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS ' + MAPSV_NXDB_TBL + ' (sid TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (sid, k))').run();
    MAPSV_NXDB.mk = true; return true;
  } catch (e) { return false; }
}
async function mapSvNxLoad(env, ids, ops) {                  // → { 열쇠: 이름 } 또는 null(못 읽음)
  try {
    if (!env || !env.DB || typeof env.DB.prepare !== 'function' || !ids || !ids.length) return null;
    if (ops) ops.n++;
    var qs = ids.map(function () { return '?'; }).join(','), stmt = env.DB.prepare('SELECT k, v FROM ' + MAPSV_NXDB_TBL + ' WHERE sid IN (' + qs + ') AND ts > ?');
    stmt = stmt.bind.apply(stmt, ids.concat([Date.now() - MAPSV_NXDB_TTL_MS]));
    var tm = null, rs = await Promise.race([stmt.all(), new Promise(function (_, rej) { tm = setTimeout(function () { rej(new Error('timeout')); }, MAPSV_NXDB_READ_MS); })]);
    if (tm) clearTimeout(tm);
    var out = {}, rows = (rs && rs.results) || [];
    rows.forEach(function (r) { if (r && typeof r.k === 'string' && mapSvNxEnc(r.k, r.v === MAPSV_NXDB_EMPTY ? '' : r.v) !== null) out[r.k] = mapSvNxDec(r.k, r.v); });
    return out;
  } catch (e) {
    if (/no such table/i.test(String(e && e.message || e))) { await mapSvNxEnsure(env); return {}; }          // 처음 — 표가 없다: 만들어 두고 빈 값으로(다음 요청부터 읽는다)
    return null;
  }
}
function mapSvNxMerge(b, loaded) {                            // 저장소 항목을 f.bus.nx 에 합친다 — 저장소 것을 앞에(엔진이 800개까지만 읽으므로) · 기기가 보낸 같은 열쇠가 우선
  var cur = (b.nx && typeof b.nx === 'object' && !Array.isArray(b.nx)) ? b.nx : {}, o = {};
  Object.keys(loaded).forEach(function (k) { if (cur[k] === undefined) o[k] = loaded[k]; });
  Object.keys(cur).forEach(function (k) { o[k] = cur[k]; });
  b.nx = o;
}
function mapSvNxSave(env, out, nxs, ops) {                    // 응답을 붙잡지 않는다(waitUntil)
  try {
    if (!env || !env.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function' || !out || !out.info || !out.info.nx || !Array.isArray(out.info.stops)) return;
    if (ops && ops.n >= 46) return;
    var ids = {}, base = (nxs && nxs.base0) || {}, ld = (nxs && nxs.loaded) || {}, ents = [], now = Date.now();
    out.info.stops.forEach(function (s) { if (s && s.id) ids[String(s.id)] = 1; });
    Object.keys(out.info.nx).forEach(function (k) {
      var v = out.info.nx[k], sid = mapSvNxSid(k), ev = mapSvNxEnc(k, v);
      if (ents.length >= MAPSV_NXDB_WRITE || base[k] === v || ld[k] === v || !sid || !ids[sid] || ev === null) return;
      ents.push([sid, k, ev]);
    });
    if (!ents.length) return;
    if (ops) ops.n++;
    var sql = 'INSERT INTO ' + MAPSV_NXDB_TBL + ' (sid, k, v, ts) VALUES (?, ?, ?, ?) ON CONFLICT(sid, k) DO UPDATE SET v = excluded.v, ts = excluded.ts WHERE ' + MAPSV_NXDB_TBL + '.ts < excluded.ts - ' + MAPSV_NXDB_REWRITE_MS;
    var run = (async function () {
      if (!(await mapSvNxEnsure(env))) return;
      await env.DB.batch(ents.map(function (e) { return env.DB.prepare(sql).bind(e[0], e[1], e[2], now); }));
      mapSvUse('map.nx.save');
    })().catch(function (e) { mapSvNote('nxsave', e, '', ''); });
    if (MAPSV_CTX && typeof MAPSV_CTX.waitUntil === 'function') MAPSV_CTX.waitUntil(run);
    if (nxs) nxs.saved = (nxs.saved || 0) + ents.length;
  } catch (e0) { /* 저장 실패는 화면에 영향이 없다 */ }
}
// s467: 방향 이름 — 남은 노선 정류장 목록(r)만 필요한 재요청을 서버가 끝낸다. 한 바퀴에 모두 동시에(최대 MAPSV_NX_MAX · 정적 목록은 데이터센터 12시간 캐시) · 최대 MAPSV_NX_ROUNDS 바퀴 · 전체 MAPSV_NX_MS 안에서.
//   받은 큰 본문은 res 에만 넣고(응답의 bres 에는 싣지 않는다 — 기기에 두지 않는다) 엔진이 뽑은 이름은 info.nx 로 돌아간다. 하위 요청은 ops 로 센다(무료 요금제 50개 한도).
async function mapSvNxFill(env, cap, body, out, ops, tReq0, trace, nxs) {
  var f = body.f, b = f.bus, res = b.res, dl = Date.now() + MAPSV_NX_MS, round, late = [], lateK = [];
  for (round = 0; round < MAPSV_NX_ROUNDS; round++) {
    var ib = out && out.info && out.info.bus;
    if (!ib || ib.st !== 'need' || !Array.isArray(ib.need) || !ib.need.length) break;
    var need = ib.need.slice(0, MAPSV_NX_MAX);
    if (!need.every(function (n) { return /^r[0-9]/.test(String(n.k || '')); })) break;
    var left = dl - Date.now();
    if (left < 250) break;
    var slot = new Array(need.length), done = new Array(need.length), tm = new Array(need.length), tw0 = Date.now() - tReq0, tmr = null;
    var ps = need.map(function (n, i) { return mapSvOne(env, String(n.k || ''), String(n.url || ''), false, ops).then(function (t) { slot[i] = t; done[i] = true; if (trace) tm[i] = Date.now() - tReq0; return t; }, function () { done[i] = true; return ''; }); });
    await Promise.race([Promise.all(ps), new Promise(function (r) { tmr = setTimeout(r, left); })]);
    if (tmr) clearTimeout(tmr);
    var any = false;
    need.forEach(function (n, i) { if (done[i] && slot[i]) { res[String(n.k || '')] = slot[i]; any = true; } });
    ps.forEach(function (p, i) { if (!done[i]) { late.push(p); lateK.push(String(need[i].k || '')); } });
    if (trace) trace.push({ r: round, w: 'n', t0: tw0, t1: Date.now() - tReq0, wb: left, early: false, why: '', cap: false, ks: need.map(function (n, i) { return [String(n.k || ''), done[i] ? tm[i] : -1]; }) });
    if (!any) break;
    var o2 = mapScreen({ cap: cap }, f, body.d);
    if (!o2 || !o2.ok) break;
    out = o2;
  }
  if (late.length && MAPSV_CTX && typeof MAPSV_CTX.waitUntil === 'function') MAPSV_CTX.waitUntil(Promise.all(late).then(function (txs) {          // 못 끝낸 목록은 응답 뒤에서 계속 — 데이터센터 캐시가 채워져 기기의 다음 요청이 바로 받는다 · s468: 끝난 뒤 이름을 뽑아 저장소에도 올린다(다음 사람은 기다리지 않는다)
    var any2 = false;
    txs.forEach(function (t, j) { if (t) { res[lateK[j]] = t; any2 = true; } });
    if (!any2 || !nxs) return;
    var o9 = mapScreen({ cap: cap }, f, body.d);
    if (o9 && o9.ok) mapSvNxSave(env, o9, nxs, ops);
  }).catch(function () { /* 무시 */ }));
  return out;
}
var MAPSV_ARR_MS = 2200, MAPSV_ARR_MIN = 300, MAPSV_ARR_MAX = 3500;                                  // 도착정보는 이 시간 안에 온 것만 싣는다 — 늦거나 못 받은 정류장은 비워 두어(= need 로 남겨) 기기가 직접 받게 한다
async function mapSvResolve(env, cap, body, out) {
  var svb = Number(body.f && body.f.bus && body.f.bus.svb), budget = isFinite(svb) && svb > 0 ? Math.max(MAPSV_ARR_MIN, Math.min(MAPSV_ARR_MAX, Math.floor(svb))) : MAPSV_ARR_MS;       // 기기가 정한 기다림(처음 그리기는 짧게 — 정류장부터 먼저 보이고 도착정보는 이어서 채운다)          // need 를 서버가 받아 채운다(최대 3바퀴: 정류장 → 도착정보 …)
  var f = body.f, b = f.bus, fresh = !!(b && b.nf), res = (b.res && typeof b.res === 'object') ? b.res : (b.res = {}), got = {}, failA = 0, anyEver = false, round, ib;
  var svo = !!(b && Number(b.svo) === 1), tReq0 = Date.now(), svoEnd = tReq0 + budget + 600, arrWaves = 0, ops = { n: 0 }, earlyRet = false;
  var tUseful = 0, dbg = !!(b && Number(b.dbg) === 1), TUNE = (dbg && b.tune && typeof b.tune === 'object') ? b.tune : {}, trace = dbg ? [] : null;          // s466: 진단(dbg=1) — 단계별 시간(info.svt) · 시험용 조절(tune: old · w2 · to)은 이 요청에만 · 값은 범위 안으로
  if (TUNE.to) ops.to = Math.max(500, Math.min(6000, Number(TUNE.to) || 3000));
  if (TUNE.gap) ops.gap = Math.max(100, Math.min(3000, Number(TUNE.gap) || 700));                      // 시험용: 느린 도착정보에 '동시에 한 번 더'를 띄우는 간격(ms)
  if (TUNE.near !== undefined) ops.near = Math.max(0, Math.min(3000, Number(TUNE.near) || 0));         // 시험용: 가까운 셋 두 번째 길 간격(ms)          // s462: svo — 새 앱이 "경유노선 같은 덤은 기다리지 않고, 도착정보가 오면 바로 · 못 받은 정류장이 생기면 같은 요청 안에서 한 번 더" 를 원한다(전체 약 budget+0.6초)
  var stopsOnly = svo && budget <= MAPSV_ARR_MIN && !(res.tp || res.gg || res.tn || res.d1);            // s464: 처음 그리기의 '정류장만 먼저'(svb 300 · 아직 정류장 본문이 없다) 요청 — 도착정보는 동시에 간 전체 요청(svb 2200)이 받는다. 여기서도 받으면 같은 곳을 두 번 부르고 정류장도 0.6초 늦게 뜬다. 정류장을 이미 받은 뒤 바퀴(svb 300)는 예전 그대로
  var nxs = { p: null, loaded: null, merged: false, base0: null, t0: 0, ms: -1, n: 0, saved: 0 };          // s468: 방향 이름 저장소(D1) 읽기 상태
  var nxKick = function (o, force) {                                                                       // 정류장을 알게 되면 곧바로 그 정류장들의 저장된 방향 이름을 읽기 시작한다(도착정보 받기와 나란히 — 기다리지 않는다)
    if (nxs.p || TUNE.nonxdb || stopsOnly || !o || !o.info || !Array.isArray(o.info.stops) || ops.n > MAPSV_NXDB_OPS) return;
    var ids = [], seen = {};
    o.info.stops.forEach(function (s) { if (s && s.id && (s.src === 'tago' || s.src === 'd1') && !seen[s.id] && ids.length < MAPSV_NXDB_IDS) { seen[s.id] = 1; ids.push(String(s.id)); } });
    if (!ids.length) return;
    if (!force && b.nx && typeof b.nx === 'object' && ids.every(function (id) { return b.nx['lm|' + id] !== undefined; })) return;          // 기기가 이 정류장들의 이름을 이미 다 안다(8초 갱신 등) — 저장소를 읽지 않는다(읽기 한도 아낌). 모자라면 r 이 필요해질 때 읽는다
    nxs.base0 = {}; if (b.nx && typeof b.nx === 'object' && !Array.isArray(b.nx)) Object.keys(b.nx).forEach(function (k) { nxs.base0[k] = b.nx[k]; });
    nxs.t0 = Date.now();
    nxs.p = mapSvNxLoad(env, ids, ops).then(function (r) { nxs.ms = Date.now() - nxs.t0; nxs.loaded = r; return r || {}; });
  };
  var nxApply = async function (wait) {                                                                    // → true 면 f.bus.nx 에 합쳤다(호출한 쪽이 엔진을 다시 돌린다)
    if (!nxs.p || nxs.merged) return false;
    var tmr = null, r = await Promise.race([nxs.p, new Promise(function (res2) { tmr = setTimeout(function () { res2(null); }, Math.max(30, wait)); })]);
    if (tmr) clearTimeout(tmr);
    if (!r) return false;
    nxs.merged = true;
    var n = 0, k; for (k in r) if (Object.prototype.hasOwnProperty.call(r, k)) n++;
    nxs.n = n;
    if (!n) return false;
    mapSvNxMerge(b, r); mapSvUse('map.nx.hit');
    return true;
  };
  nxKick(out);                                                                                              // 재요청처럼 정류장을 이미 아는 요청은 시작하자마자
  for (round = 0; round < (svo ? MAPSV_SVO_ROUNDS : 3); round++) {
    ib = out && out.info && out.info.bus;
    if (!ib || ib.st !== 'need' || !Array.isArray(ib.need) || !ib.need.length) break;
    var need = ib.need.slice(0, 60);
    if (need.some(function (n) { return /^r[0-9]/.test(String(n.k || '')); })) {                             // s199: 노선 경유 정류장 목록(방면 이름용 · 큰 본문)은 도착정보를 막 받은 응답에서는 기다리지 않는다 — 기기가 천천히 받는다
      if (svo && arrWaves === 0 && !stopsOnly && !TUNE.nonx && need.every(function (n) { return /^r[0-9]/.test(String(n.k || '')); })) {          // s467: 도착정보는 이미 화면에 있는 재요청 — 방향 이름은 서버가 남은 목록을 한 번에 받아 채운다
        nxKick(out, true);
        if (await nxApply(MAPSV_NXDB_WAIT_MS)) {                                                            // s468: 먼저 저장소에 있는 이름을 합쳐 다시 그린다 — 그만큼 받을 목록이 줄거나 없어진다
          var o5 = mapScreen({ cap: cap }, f, body.d);
          if (o5 && o5.ok) { out = o5; ib = out.info && out.info.bus; need = (ib && ib.st === 'need' && Array.isArray(ib.need)) ? ib.need.slice(0, 60) : []; }
        }
        if (need.length && need.every(function (n) { return /^r[0-9]/.test(String(n.k || '')); })) {
          var o4 = await mapSvNxFill(env, cap, body, out, ops, tReq0, trace, nxs);
          if (o4 && o4.ok) out = o4;
        }
      }
      break;
    }
    if (typeof mapBusWantD1 === 'function' && mapBusWantD1(f)) {                                            // s459: 우리 정류장 표(D1)를 아직 못 받은 채 TAGO 만으로 그렸다 — 이번 바퀴에 D1 도 같이 받아 둔다(도착정보 바퀴에 끼워서 · 다음 그리기에 역 출구가 채워진다). 예전엔 한 번 놓치면 그 요청에서는 끝까지 안 받았다
      var cD = mapBusCenter(b);
      if (isFinite(cD.la) && isFinite(cD.lo) && !need.some(function (n) { return String(n.k || '') === 'd1'; })) need = need.concat(mapBusNeedStops(cD.la, cD.lo).filter(function (n) { return n.k === 'd1'; }));
    }
    var arrWave = need.every(function (n) { return /^([afghtu][0-9]{1,3}|d1)$/.test(String(n.k || '')); }) && need.some(function (n) { return /^[afghtu][0-9]{1,3}$/.test(String(n.k || '')); });   // s459: 도착정보 바퀴에 D1 되받기가 끼어 있어도 함께 받는다(D1 만 남은 것은 정류장 바퀴)
    if (stopsOnly && arrWave) break;                                                                      // s464: 정류장만 먼저 — 도착정보 받기는 건너뛰고 need 로 남겨 둔다(전체 요청 · 기기가 받는다)
    if (svo && arrWaves > 0 && (svoEnd - Date.now() < 400 || !need.some(function (n) { return /^[afghtu]/.test(String(n.k || '')) && mapSvTier(n.k) === 'core'; }))) break;          // s462: 같은 요청 안의 두 번째 도착정보 바퀴는 시간이 남고 받을 core(바꾼 ID · 좌표 정류장 → 도착정보)가 있을 때만
    var wb = svo ? Math.max(Math.min(budget, 1200), svoEnd - Date.now()) : budget;
    var useful2 = svo && arrWaves > 0 && !TUNE.old && tUseful > 0;                                          // s466: 쓸 만한 도착정보를 이미 받은 뒤의 추가 바퀴 — 받은 때부터 합쳐서 W2 한도까지만
    if (useful2) { wb = Math.min(wb, tUseful + (TUNE.w2 !== undefined ? Math.max(0, Math.min(4000, Number(TUNE.w2) || 0)) : MAPSV_W2_CAP_MS) - Date.now()); if (wb < 80) break; }
    var tm = new Array(need.length), tw0 = Date.now() - tReq0;         // 이번 바퀴가 기다릴 시간: 새 앱은 전체 약 budget+0.6초 안에서(정류장이 늦어도 도착정보에 최소 1.2초)
    var slot = new Array(need.length);
    var done = new Array(need.length);
    var mkP = function (n, i) { return mapSvOne(env, String(n.k || ''), String(n.url || ''), fresh, ops).then(function (t) { slot[i] = t; done[i] = true; if (trace) tm[i] = Date.now() - tReq0; return t; }); };
    var ps = new Array(need.length);
    if (arrWave && svo) {                                   // s462: 새 앱 — 도착정보(core)를 먼저 띄우고 경유노선(덤)은 도착정보가 오거나 0.5초가 지난 뒤에 — 공공 API 에 한꺼번에 몰려 도착정보까지 느려지던 것을 막는다(둘 다 캐시되면 이 지연도 없다). 예전 앱은 예전 그대로(동시에)
      var coreAll = [], gtm = null;
      need.forEach(function (n, i) { if (mapSvTier(n.k) === 'core') { ps[i] = mkP(n, i); if (String(n.k || '') !== 'd1') coreAll.push(ps[i]); } });
      var gate = Promise.race([Promise.all(coreAll), new Promise(function (r) { gtm = setTimeout(r, MAPSV_OPT_GATE_MS); })]).then(function () { if (gtm) clearTimeout(gtm); });
      need.forEach(function (n, i) { if (!ps[i]) ps[i] = gate.then(function () { return mkP(n, i); }); });
    } else ps = need.map(mkP);
    var stopWave = !arrWave && typeof mapBusReady === 'function' && b.vw !== 'fav' && ((isFinite(Number(b.lat)) && isFinite(Number(b.lng))) || mapBusCenter(b).pin) && need.every(function (n) { return /^(tp|gg|tn|d1)$/.test(String(n.k || '')); });
    var capCut = false; earlyRet = false; var wi = { nosettle: !!TUNE.nosettle };
    if (arrWave) {
      earlyRet = await mapSvArrWait(ps, need, done, wb, svo, wi);
      if (MAPSV_CTX && typeof MAPSV_CTX.waitUntil === 'function') {                                         // s462: 응답을 돌려준 뒤에도 못 끝낸 받기(경유노선 · 느린 도착정보)는 끝까지 — 캐시 · 5초 기억에 채워져 기기의 다음 요청이 즉시 받는다(예전엔 응답과 함께 끊길 수 있었다)
        var lf = ps.filter(function (p, i) { return !done[i]; });
        if (lf.length) MAPSV_CTX.waitUntil(Promise.all(lf).catch(function () { /* 무시 */ }));
      }
    }
    else if (stopWave) {                                    // s177: 정류장 목록 — 우선순위 앞 출처가 정류장을 주면 나머지(느린 TAGO)는 기다리지 않고 도착정보로 넘어간다. 못 기다린 출처는 빈 값으로 둔다.
      var d1Dead = Date.now() + MAPSV_D1_WAIT_MS, d1Tick = null, capAt = Date.now() + MAPSV_TN_CAP_MS; capCut = false;      // s458: TAGO 가 먼저 와도 우리 정류장 표(D1)는 이 시간까지 기다린다(역 출구가 빠지지 않게) — 넘으면 없는 것으로 치고 그린다
      for (;;) {
        var tmp = {}, pend = [];
        Object.keys(res).forEach(function (rk) { tmp[rk] = res[rk]; });
        need.forEach(function (n, i) { if (done[i]) tmp[String(n.k)] = slot[i] || ''; else pend.push(ps[i]); });
        if (tmp.d1 === undefined && Date.now() >= d1Dead) tmp.d1 = '';
        var rdy = false;
        try { rdy = !!mapBusReady({ bus: { lat: b.lat, lng: b.lng, pin: b.pin, res: tmp } }) && !(typeof mapBusWantD1 === 'function' && mapBusWantD1({ bus: { lat: b.lat, lng: b.lng, pin: b.pin, res: tmp } })); } catch (eR) { rdy = false; }
        if (rdy || !pend.length) break; if (Date.now() >= capAt && !TUNE.nocap && tmp.tn === undefined && typeof mapBusCapOk === 'function' && need.every(function (n, i) { return done[i] || String(n.k) === 'tn'; })) { var okC = false; try { okC = !!mapBusCapOk({ bus: { lat: b.lat, lng: b.lng, pin: b.pin, res: tmp } }); } catch (eC) { okC = false; } if (okC) { capCut = true; break; } }
        var nowT = Date.now(), wt = -1; if (d1Dead > nowT) wt = d1Dead - nowT + 5; if (capAt > nowT && (wt < 0 || capAt - nowT + 5 < wt)) wt = capAt - nowT + 5; await Promise.race(pend.concat(wt < 0 ? [] : [new Promise(function (r) { d1Tick = setTimeout(r, Math.max(20, wt)); })]));
        if (d1Tick) { clearTimeout(d1Tick); d1Tick = null; }
      }
    }
    else await Promise.all(ps); if (capCut) { b.cut = 1; mapSvUse('map.tn.cut'); if (MAPSV_CTX && typeof MAPSV_CTX.waitUntil === 'function') { var lt = ps.filter(function (p, i) { return !done[i]; }); if (lt.length) MAPSV_CTX.waitUntil(Promise.all(lt).catch(function () { /* ignore */ })); } }          // s482: cut - the late TAGO keeps going after the response (cache + KV get filled) so the next request finds it at once
    if (trace) trace.push({ r: round, w: arrWave ? 'a' : (stopWave ? 's' : 'x'), t0: tw0, t1: Date.now() - tReq0, wb: wb, early: earlyRet, cut: capCut, why: wi.why || '', cap: useful2, ks: need.map(function (n, i) { return [String(n.k || ''), done[i] ? tm[i] : -1]; }) });
    var any = false;
    failA = 0;
    need.forEach(function (n, i) {
      var k = String(n.k || ''), t = slot[i] || '';
      if (arrWave) {                                          // 도착정보: 받은 것만 넣고, 못 받았거나 늦은 곳은 아예 두지 않는다 → 엔진이 다시 need 로 알려 기기가 받는다('도착정보 없음'으로 굳지 않는다)
        if (t) { any = true; res[k] = t; got[k] = t.length > 120000 ? t.slice(0, 120000) : t; } else if (/^[af]/.test(k)) failA++;       // 이웃·바꾼 ID·경유노선(g·h·t·u)은 덤 — 못 받아도 실패로 세지 않는다
        return;
      }
      if (t) any = true; if (k === 'd1' && !t) return; if (k === 'tn' && capCut && !t) { res[k] = ''; return; }                           // s459: D1 을 못 받았으면(한도 넘김·실패) 빈 값으로 굳히지 않는다 — 기기도 빈 값을 안 받으니 다음 요청에 다시 받는다(예전엔 res.d1='' 가 그 자리에 남아 그 뒤로는 영영 안 받았다)
      res[k] = t; got[k] = t.length > 120000 ? t.slice(0, 120000) : t;
    });
    if (any) anyEver = true;
    if (!any) break;                                        // 아무것도 못 받았다 — 그대로 돌려줘 기기가 예전 방식으로 이어 간다
    if (arrWave && nxs.p) await nxApply(Math.max(50, Math.min(MAPSV_NXDB_WAIT_MS, svoEnd - Date.now())));          // s468: 도착정보 받기와 나란히 읽어 둔 저장된 방향 이름을 합친 뒤 그린다(첫 응답에 바로 들어간다)
    out = mapScreen({ cap: cap }, f, body.d);
    if (!out || !out.ok) return out;
    nxKick(out);                                                                                            // s468: 정류장 단계가 끝났다 — 이제 정류장 ID 를 안다(다음 도착정보 바퀴와 나란히 읽는다)
    if (arrWave) { arrWaves++; if (!tUseful && mapSvHasUseful(got)) tUseful = Date.now(); if (!svo || earlyRet || arrWaves >= MAPSV_SVO_WAVES || svoEnd - Date.now() < 400) break; }          // s464: earlyRet — 일찍 돌려주기로 했으면 남은 정류장을 다시 붙잡는 추가 바퀴는 돌지 않는다          // 도착정보는 예전 앱은 한 번만(못 받은 곳은 기기가 이어 받는다) · 새 앱(svo)은 시간이 남으면 같은 요청 안에서 최대 3바퀴(바꾼 ID · 좌표로 다시 찾은 정류장)
  }
  if (anyEver && out && out.info) { out.info.bres = got; out.info.svf = failA; }
  if (out && out.info) mapSvNxSave(env, out, nxs, ops);                                                    // s468: 이 요청에서 새로 뽑은 방향 이름을 저장소에(응답 뒤에서)
  if (trace && out && out.info) { out.info.svt = { v: 1, ms: Date.now() - tReq0, budget: budget, waves: arrWaves, tune: TUNE, r: trace, nxdb: { n: nxs.n, ms: nxs.ms, merged: nxs.merged, saved: nxs.saved } }; }
  return out;
}
async function handleScreenMap(request, env) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "post-only" }), { status: 405, headers: H });
  mapSvLive(env); H["X-Bus-Mode"] = mapSvBudMode('tago') + '/' + mapSvBudMode('seoul'); H["Access-Control-Expose-Headers"] = "X-Bus-Mode";          // s463: 세기를 올릴 수 있게 · 하루 예산 모드를 뒤에서 갱신 · 현재 모드를 응답 머리에(진단용)
  var raw = await request.text();
  if (raw.length > 3000000) return new Response(JSON.stringify({ ok: false, error: "body-too-long" }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e) { return new Response(JSON.stringify({ ok: false, error: "bad-json" }), { status: 400, headers: H }); }
  if (!body || typeof body !== "object") return new Response(JSON.stringify({ ok: false, error: "bad-body" }), { status: 400, headers: H });
  var out, cap = Number(body.cap) || 0, ttFill = null;
  try { if (body.f && body.f.part === 'tt') ttFill = await mapTtFill(env, body.f); } catch (eT) { ttFill = null; }          // s248: 시간표는 서버가 직접 채운다(기기는 한 번만 묻는다) — 못 채우면 예전처럼 need 가 남아 기기가 /next-train 으로 받는다
  try { out = mapScreen({ cap: cap }, body.f, body.d); } catch (e2) {
    out = mapSvSalvage(cap, body, e2);                                                                    // s464: 기기가 보낸 받은 본문 하나가 엔진을 터뜨렸다 — 그 본문만 빼고 다시 그린다(빠진 곳은 '불러오는 중'으로 남아 기기가 다시 받는다). 그래도 안 되면 예전처럼 500
    if (!out) return new Response(JSON.stringify({ ok: false, error: String(e2 && e2.message || e2).slice(0, 120) }), { status: 500, headers: H });
  }
  if (!out || !out.ok) return new Response(JSON.stringify(out || { ok: false, error: "fail" }), { status: 400, headers: H });
  try {
    var bf = body.f && body.f.bus;
    if (cap >= 23 && bf && bf.sv === 1 && out.info && out.info.bus && out.info.bus.st === 'need') {
      var tSv = Date.now();
      var o2 = await mapSvResolve(env, cap, body, out);
      if (o2 && o2.ok) out = o2;
      if (out.info && out.info.bus && out.info.bus.st === 'empty' && !bf.pin && Date.now() - tSv < 1500) {          // s464: 정류장 '0건' — 공공 API · 서버 정류장 표가 잠깐 빈 값을 준 것일 수 있다(청라: 같은 자리가 어떤 때는 0건 · 곧바로는 20곳). 요청이 아직 짧으면 캐시를 건너뛰고 한 번만 새로 받아 본다
        try {
          var body2 = JSON.parse(raw), bf2 = body2.f.bus; bf2.nf = 1; if (!bf2.res || typeof bf2.res !== 'object') bf2.res = {};
          ['tp', 'gg', 'tn', 'd1'].forEach(function (rk) { delete bf2.res[rk]; });
          mapSvUse('map.empty.retry');
          var out2 = mapScreen({ cap: cap }, body2.f, body2.d);
          if (out2 && out2.ok && out2.info && out2.info.bus && out2.info.bus.st === 'need') {
            var o3 = await mapSvResolve(env, cap, body2, out2);
            if (o3 && o3.ok && o3.info && o3.info.bus && o3.info.bus.st !== 'empty') { out = o3; mapSvUse('map.empty.fix'); }
          }
        } catch (eR) { /* 다시 받기 실패는 처음 결과 그대로 */ }
      }
    }
  } catch (e3) { /* 서버가 못 받으면 need 가 남은 첫 화면 그대로 — 기기가 이어 간다 */ }
  if (ttFill && out.info) { for (var kf in ttFill) { out.info.fill = ttFill; break; } }
  out.ver = ENGINE_VERSION;
  if (typeof usageFlush === 'function') { try { usageFlush(env); } catch (eU) { /* 무시 */ } }          // s463: 센 호출을 1분에 한 번 D1 에 올린다(응답 뒤에서)
  return new Response(JSON.stringify(out), { headers: H });
}
// ★ s464 — 엔진이 기기가 보낸 받은 본문(f.bus.res) 때문에 터졌을 때: 터뜨린 본문 하나를 찾아 빼고 다시 그린다. 마지막에 일어난 일은 /bus-budget 의 lastErr 에 남긴다(Cloudflare 로그를 안 봐도 원인을 알 수 있게).
var MAPSV_ERR = null;
function mapSvNote(stage, e, key, txt) {
  MAPSV_ERR = { at: new Date().toISOString(), stage: stage, msg: String(e && e.message || e || '').slice(0, 160), key: key || '', head: typeof txt === 'string' ? txt.slice(0, 160) : '' };
  mapSvUse('map.err.' + stage);
}
function mapSvSalvage(cap, body, err) {                                                                  // → 다시 그린 화면 또는 null
  try {
    var f = body && body.f, b = f && f.bus, res = b && b.res;
    if (!res || typeof res !== 'object') { mapSvNote('500', err, '', ''); return null; }
    var keys = Object.keys(res), i, saved, out;
    var order = keys.filter(function (k) { return !/^(tp|gg|tn|d1)$/.test(k); }).concat(keys.filter(function (k) { return /^(tp|gg|tn|d1)$/.test(k); }));      // 도착정보 · 경유노선 본문부터 의심한다
    for (i = 0; i < order.length; i++) {
      saved = res[order[i]]; delete res[order[i]];
      try { out = mapScreen({ cap: cap }, f, body.d); if (out && out.ok) { mapSvNote('salvage', err, order[i], saved); return out; } } catch (e1) { /* 이 본문이 범인이 아니다 */ }
      res[order[i]] = saved;
    }
    for (i = 0; i < order.length; i++) delete res[order[i]];                                              // 하나만 빼서는 안 된다 — 받은 것을 모두 비우고 처음 화면으로
    try { out = mapScreen({ cap: cap }, f, body.d); if (out && out.ok) { mapSvNote('salvage-all', err, '', ''); return out; } } catch (e2) { /* 아래 */ }
  } catch (e0) { /* 아래 */ }
  mapSvNote('500', err, '', '');
  return null;
}
// s463: 이 요청이 센 호출을 올릴 수 있게 실행 맥락을 알려 주고, 하루 예산 모드를 뒤에서 갱신한다
function mapSvLive(env) {
  try { if (typeof _liveCtx !== 'undefined' && MAPSV_CTX) _liveCtx = MAPSV_CTX; } catch (e) { /* 무시 */ }
  mapSvBudRefresh(env);
}
// GET /bus-budget — 하루 예산 모드 · 오늘 사용량(진단). ?refresh=1 은 바로 다시 읽는다 · ?probe=1 은 하위 요청 한도(무료 50 · 유료 1000)를 Cache API 호출로 재 본다(요금제 확인용 · 60번만 부른다)
async function handleBusBudget(request, env) {
  var H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  var u = new URL(request.url), out = {};
  if (u.searchParams.get('refresh') === '1') { var rp = mapSvBudRefresh(env, true); if (rp) await rp; }
  else mapSvLive(env);
  var ratio = {}; Object.keys(MAPSV_BUD.used).forEach(function (f) { ratio[f] = Math.round(MAPSV_BUD.used[f] / MAPSV_BUD.limit[f] * 10000) / 10000; });
  out = { ok: true, ver: ENGINE_VERSION, day: MAPSV_BUD.day, modes: MAPSV_BUD.modes, used: MAPSV_BUD.used, limit: MAPSV_BUD.limit, ratio: ratio, saver: MAPSV_BUD_SAVER, critical: MAPSV_BUD_CRIT, ttlMs: { tago: mapSvArrTtl('https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?'), seoul: mapSvArrTtl('http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?') }, readAt: MAPSV_BUD.at, ageMs: MAPSV_BUD.at ? Date.now() - MAPSV_BUD.at : null, err: MAPSV_BUD.err, hasDb: !!(env && env.DB), lastErr: MAPSV_ERR };
  if (u.searchParams.get('probe') === '1') {
    var okN = 0, errMsg = '';
    try {
      var pk = new Request('https://map-sv-cache.internal/probe?v=1');
      for (var i = 0; i < 60; i++) { await caches.default.match(pk); okN++; }
    } catch (e) { errMsg = String(e && e.message || e).slice(0, 100); }
    out.probe = { cacheCallsOk: okN, error: errMsg, plan: okN >= 60 ? 'paid(하위 요청 50 초과 가능)' : 'free(50개 한도)' };
  }
  return new Response(JSON.stringify(out), { status: 200, headers: H });
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
  var sc = mapSvStaticCls(raw), cache = null, ck = null;                                       // s462: 경유노선 · 노선 정류장 목록(거의 안 바뀜)은 서버가 받을 때와 같은 데이터센터 캐시를 쓴다 — 기기가 직접 받는 길도 두 번째부터 즉시
  if (sc) {
    try {
      if (typeof caches !== 'undefined' && caches.default) {
        cache = caches.default; ck = new Request('https://map-sv-cache.internal/s?v=2&k=' + sc + '&u=' + encodeURIComponent(raw));
        var hit = await cache.match(ck);
        if (hit) { var ht = await hit.text(); if (mapSvOkBody(sc, ht)) return new Response(ht, { status: 200, headers: Object.assign({ "Content-Type": 'text/plain; charset=utf-8' }, H) }); }
      }
    } catch (eC) { cache = null; }
  }
  mapSvLive(env);
  var af = mapSvArrFam(raw), tStart = Date.now();                                              // s463: 도착정보는 같은 데이터센터 공유 캐시(받은 지 5초 안 · 아낌 모드 9초 · 15초)를 먼저 — 여러 기기가 같은 정류장을 부르면 공공 API 는 한 번만
  if (af) { var ab = await mapSvArrGet(raw, null); if (ab) { mapSvUse('map.arr.saved'); return new Response(ab, { status: 200, headers: Object.assign({ "Content-Type": 'text/plain; charset=utf-8', "X-Cache": "HIT-A" }, H) }); } }
  var keys = mapKeyList(env);
  if (!keys.length) return new Response('no-key', { status: 500, headers: H });
  var first = (MAPBT_RR++) % keys.length;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[(first + i) % keys.length], tgt = mapKeyUrl(raw, key);
    for (var pr = 0; pr < 2; pr++) {                                                           // ws.bus.go.kr 는 http 만 받는 때가 있어 프로토콜을 바꿔 한 번 더
      try {
        var u2 = pr === 0 ? tgt : tgt.replace(/^https?:/, /^https:/.test(tgt) ? 'http:' : 'https:');
        mapSvUse(af ? 'map.arr.' + af : (sc ? 'map.st' : 'map.etc'));                               // s463: 실제로 나가는 호출을 센다
        var res = await Promise.race([fetch(u2, { headers: { 'Accept': '*/*', 'User-Agent': 'gildongmu/1.0' } }), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 3500); })]);
        var txt = await res.text();
        if (res.status === 200 && !mapBtBad(txt)) {
          if (af) mapSvArrPut(raw, txt, tStart, null);
          if (typeof usageFlush === 'function') { try { usageFlush(env); } catch (eU) { /* 무시 */ } }
          if (cache && ck && mapSvOkBody(sc, txt)) { try { await cache.put(ck, new Response(txt, { headers: { 'Cache-Control': 'public, max-age=43200', 'Content-Type': 'text/plain; charset=utf-8' } })); } catch (eP) { /* 캐시 실패는 무시 */ } }
          return new Response(txt, { status: 200, headers: Object.assign({ "Content-Type": res.headers.get('Content-Type') || 'text/plain; charset=utf-8' }, H) });
        }
        if (res.status === 200 || pr === 1) break;
      } catch (e) { /* 다음 시도 */ }
    }
  }
  return new Response('bus-bad', { status: 502, headers: H });
}
