// 길동무 — 저장값 맞추기 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (5번 4단계: 저장값·설정을 앱 본체에도)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   설정 스위치·사용자 설정·즐겨찾기 같은 '저장값'은 예전엔 웹뷰의 localStorage 에만 있었다. 웹뷰 저장소가 지워지면(앱 데이터 삭제·OS 정리) 설정이 통째로 사라지고,
//   자바 쪽(서비스·오버레이·새 네이티브 화면)은 그 값을 읽을 수 없었다. 그래서 같은 값을 앱 본체(자바 Store 플러그인)에도 한 벌 보관한다.
//   '어떤 키를 보관할지 · 크기 한도 · 부팅 때 어느 쪽 값을 따를지'는 엔진이 정한다. 웹은 이 정책을 받아 '그 키면 같이 보관' 하고, 자바는 구조 검사(키 모양·크기)만 한다.
//
// 정책  storePolicy() → { v, exact:[…], prefix:[…], denyExact:[…], denySuffix:[…], maxValue, maxKeys, maxTotal, sentinel }
//   exact/prefix : 보관 대상 키(정확히 같거나 접두어가 같음) · denyExact/denySuffix : 대상에서 뺀다(로그·화면 저장본 등 다시 만들 수 있는 것)
//   maxValue : 값 하나의 최대 글자 수 · maxKeys : 키 최대 개수 · maxTotal : 값 글자 수 합계 한도
//   sentinel : '이 기기 웹 저장소가 지워진 적 없다'는 표시 키 — 이게 웹에 없고 앱 본체에는 있으면 웹 저장소가 지워진 것이다
// 맞추기 storeMerge({ web, nat }) → { v, restore, reload, toWeb:[키…], toNat:[키…], delNat:[키…], skip:[키…], n:{web,nat} }
//   web / nat : 웹 localStorage · 앱 본체 저장소의 {키: {n:글자수, h:지문}} — ★ 값 자체는 서버로 보내지 않는다(지문 = FNV-1a 32비트 16진 8자리, 글자 단위는 UTF-16).
//               글자(문자열)로 오면 엔진이 같은 방식으로 지문을 만든다. 정책 밖 키는 버린다.
//   출력은 '어느 키를 어느 쪽으로 옮길지'만 — 값은 앱이 자기 쪽에서 복사한다(toWeb: 앱 본체 값을 웹으로 · toNat: 웹 값을 앱 본체로 · delNat: 앱 본체에서 지움)
//   규칙
//     ① 웹에 표시(sentinel)가 있다(웹은 살아 있다): 웹이 기준 — 다른 값·웹에만 있는 키는 앱 본체로(toNat), 앱 본체에만 있는 키는 지운다(delNat; 웹에서 일부러 지운 것)
//     ② 웹에 표시가 없고 앱 본체에 있다(웹 저장소가 지워졌다): 앱 본체가 기준 — 앱 본체 값을 웹으로 되돌린다(toWeb, restore=true). 웹에 새로 생긴 키 중 앱 본체에 없는 것만 앱 본체로 올린다
//     ③ 둘 다 표시가 없다(처음): 웹 값을 앱 본체로 올린다
//     어느 경우든 표시는 양쪽에 남긴다(toWeb·toNat 에 표시 키가 들어간다 — 값은 앱이 '1' 로 쓴다). reload = 웹으로 되돌린 값이 있다(웹은 시작할 때 이미 낡은 값을 읽었으므로 한 번 다시 열어야 한다)
//
// 이 파일은 의존성이 없다. 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';

var STORE_SYNC_V = 1;
var STORE_SENTINEL = 'gdm_sto_seen';
var STORE_EXACT = [
  'app_theme', 'notifPref', 'ovlOn', 'commuteAlarm',
  'mk_comm_id', 'mk_favorites', 'mk_radius', 'mk_r', 'mk_pt', 'mk_pts',
  'savedBusStops', 'busStopAlias', 'busNearOrder',
  'postOwnerKey', 'myPosts', 'reportedPosts',
  'gwRoamMin', 'bgPermGuided', 'ovlHint', 'pfLive', 'pfLive2', 'rideLogOff',
  'busProxyUrl', 'shopApiUrl', 'foodServer', 'cellServer'
];
var STORE_PREFIX = ['gdm_'];
var STORE_DENY_EXACT = ['gdm_err_log'];
var STORE_DENY_SUFFIX = ['_c', '_fail', '_why'];   // 'gdm_scr_c' 같은 화면 저장본(크고 다시 받으면 된다) · '문제로 웹으로 돌아갔나'(_fail)·사유(_why) 표시는 이번 실행의 진단이라 되살리지 않는다
var STORE_MAX_VALUE = 20000, STORE_MAX_KEYS = 160, STORE_MAX_TOTAL = 160000;

function storePolicy() {
  return {
    v: STORE_SYNC_V, exact: STORE_EXACT.slice(), prefix: STORE_PREFIX.slice(), denyExact: STORE_DENY_EXACT.slice(), denySuffix: STORE_DENY_SUFFIX.slice(),
    maxValue: STORE_MAX_VALUE, maxKeys: STORE_MAX_KEYS, maxTotal: STORE_MAX_TOTAL, sentinel: STORE_SENTINEL
  };
}

function storeEligible(k, p) {
  p = p || storePolicy();
  if (typeof k !== 'string' || !k || k.length > 64 || !/^[A-Za-z0-9_:.\-]+$/.test(k)) return false;
  var i;
  for (i = 0; i < p.denyExact.length; i++) if (k === p.denyExact[i]) return false;
  for (i = 0; i < p.denySuffix.length; i++) { var s = p.denySuffix[i]; if (k.length > s.length && k.slice(-s.length) === s) return false; }
  for (i = 0; i < p.exact.length; i++) if (k === p.exact[i]) return true;
  for (i = 0; i < p.prefix.length; i++) if (k.indexOf(p.prefix[i]) === 0) return true;
  return false;
}

// 지문 — 앱(웹·자바)이 값에서 같은 식으로 만든다. FNV-1a 32비트, UTF-16 글자 단위, 16진 8자리.
function storeHash(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  var x = h.toString(16); while (x.length < 8) x = '0' + x;
  return x;
}
function storeSig(v) {
  if (v && typeof v === 'object') {
    var n = Number(v.n);
    if (isFinite(n) && n >= 0 && typeof v.h === 'string' && /^[0-9a-f]{1,8}$/.test(v.h)) return { n: Math.floor(n), h: v.h };
    return null;
  }
  if (v === null || v === undefined) return null;
  var s = typeof v === 'string' ? v : String(v);
  return { n: s.length, h: storeHash(s) };
}
function storeSame(a, b) { return !!a && !!b && a.n === b.n && a.h === b.h; }

// 정책에 맞는 항목만 {키:{n,h}} 로, 한도 안에서(키 이름 순으로 채운다 — 같은 입력이면 같은 결과)
function storePick(obj, p, skip) {
  var out = {}, keys = [], k, total = 0, n = 0;
  if (!obj || typeof obj !== 'object') return out;
  for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) keys.push(k);
  keys.sort();
  for (var i = 0; i < keys.length; i++) {
    k = keys[i];
    if (!storeEligible(k, p)) continue;
    var g = storeSig(obj[k]);
    if (!g) continue;
    if (k === p.sentinel) { out[k] = g; continue; }
    if (g.n > p.maxValue || n >= p.maxKeys || total + g.n > p.maxTotal) { if (skip) skip.push(k); continue; }
    out[k] = g; n++; total += g.n;
  }
  return out;
}

function storeMerge(o) {
  o = o || {};
  var p = storePolicy(), skip = [];
  var W = storePick(o.web, p, skip), N = storePick(o.nat, p, null);
  var S = p.sentinel, toWeb = [], toNat = [], delNat = [], restore = false, k;
  var has = function (m, key) { return Object.prototype.hasOwnProperty.call(m, key); };
  var webAlive = has(W, S), natHas = has(N, S);
  if (webAlive) {
    for (k in W) if (!storeSame(W[k], N[k])) toNat.push(k);
    for (k in N) if (!has(W, k)) delNat.push(k);
  } else if (natHas) {
    restore = true;
    for (k in N) if (k !== S) toWeb.push(k);
    for (k in W) if (!has(N, k)) toNat.push(k);
  } else {
    for (k in W) toNat.push(k);
  }
  if (!webAlive) toWeb.push(S);
  if (!natHas && toNat.indexOf(S) < 0) toNat.push(S);
  var restored = 0;
  for (var i = 0; i < toWeb.length; i++) if (toWeb[i] !== S) restored++;
  toWeb.sort(); toNat.sort(); delNat.sort();
  return { v: STORE_SYNC_V, restore: restore, reload: restore && restored > 0, toWeb: toWeb, toNat: toNat, delNat: delNat, skip: skip, n: { web: Object.keys(W).length, nat: Object.keys(N).length } };
}

// ── Worker 연결부 — GET /store-policy · POST /store-merge (handleFetch 에 길을 둔다) ──
function handleStorePolicy(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  if (request.method !== 'GET') return new Response(JSON.stringify({ ok: false, error: 'GET only' }), { status: 405, headers: H });
  var out = storePolicy(); out.ok = true;
  return new Response(JSON.stringify(out), { headers: H });
}
async function handleStoreMerge(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: H });
  var raw = '';
  try { raw = await request.text(); } catch (e) { return new Response(JSON.stringify({ ok: false, error: 'read-fail' }), { status: 400, headers: H }); }
  if (raw.length > 100000) return new Response(JSON.stringify({ ok: false, error: 'body-too-long' }), { status: 413, headers: H });
  var body;
  try { body = JSON.parse(raw); } catch (e2) { return new Response(JSON.stringify({ ok: false, error: 'bad-json' }), { status: 400, headers: H }); }
  var out;
  try { out = storeMerge(body); } catch (e3) { return new Response(JSON.stringify({ ok: false, error: String(e3 && e3.message || e3) }), { status: 500, headers: H }); }
  out.ok = true;
  return new Response(JSON.stringify(out), { headers: H });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { storeHash: storeHash, storeSig: storeSig, handleStorePolicy: handleStorePolicy, handleStoreMerge: handleStoreMerge, storePolicy: storePolicy, storeEligible: storeEligible, storeMerge: storeMerge, STORE_SYNC_V: STORE_SYNC_V, STORE_SENTINEL: STORE_SENTINEL };
