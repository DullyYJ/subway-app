// 길동무 — 알림 정책 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (5번 5단계 첫 조각: 판단)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   '어떤 알림을 상단(시스템) 알림으로 보낼까 · 어떤 알림에 진동을 줄까 · 어떤 기능(오버레이 하단 추천·앱 안 팝업)을 켤까'는 예전엔 웹(www/index.html)의
//   _NOTIF_ALLOW · _VIBE_ALLOW · _NOTIF_TOP · _notifPrefGroup · _notifAllowed · _vibeAllowed · _featureAllowed 가 정했다.
//   이 함수는 같은 규칙을 엔진이 정하게 한다. 앱(웹)은 '사용자가 켜 둔 상태(종류별 스위치·출퇴근 브리핑 켬·예전 모드 여부)'만 알리고,
//   돌아온 표(종류마다 상단 알림 n · 진동 v · 기능 f 가 허용인지)를 그대로 따른다.
//
// 입력  notifPolicy({ prefs, legacy, cm })
//   prefs  : { arrive, transfer, proximity, arrive_reco } 사용자가 설정에서 끈 큰 분류(0 이면 끔, 그 밖은 켬 — 값이 없으면 켬)
//   legacy : 예전 동작 모드(window._notifLegacy) — 상단 알림·진동을 세 가지로 좁히는 2026-10-12 규칙을 풀고 예전 정책 표 전체를 쓴다
//   cm     : 출퇴근 브리핑을 사용자가 켰나(그 종류만 정책 표가 아니라 이 토글을 따른다)
// 출력  { v:1, types:{ 종류: { n:상단 알림 0|1, v:진동 0|1, f:기능 0|1 } }, groups:{ 종류: 큰 분류 }, top:[…] }
//   표에 없는 종류는 셋 다 허용 안 함(예전과 같다).
'use strict';

var NOTIF_POLICY_V = 1;

// 알림 종류별 정책 표 — 예전 웹 상수와 똑같다.
var NP_ALLOW = { arrive_reco: 1, commute_brief: 0, fg_service: 1, arrive: 1, near_arrive: 1, near_arrive2: 1, transfer: 1, transfer2: 1, arrival: 1, proximity: 1 };
var NP_VIBE = { transfer: 1, transfer2: 1, arrive: 1, arrival: 1, near_arrive: 1, near_arrive2: 1, arrive_reco: 0, commute_brief: 0, fg_service: 0, proximity: 1 };
// 2026-10-12(YJ): 상단 알림과 진동은 이 세 가지만 나간다(예전 모드가 아닐 때).
var NP_TOP = { transfer: 1, near_arrive2: 1, near_arrive: 1 };

function npGroup(type) {
  var t = String(type || '');
  if (t === 'near_arrive' || t === 'near_arrive2' || t === 'arrive' || t === 'arrival') return 'arrive';
  if (t === 'transfer' || t === 'transfer2') return 'transfer';
  if (t === 'proximity') return 'proximity';
  if (t === 'arrive_reco') return 'arrive_reco';
  return null;
}

function npOff(prefs, g) { return !!g && prefs[g] === 0; }

function npFeature(t, prefs, cm) {
  if (t === 'commute_brief') return !!cm;
  if (!NP_ALLOW[t]) return false;
  return !npOff(prefs, npGroup(t));
}
function npNotif(t, prefs, legacy, cm) {
  if (!legacy && !NP_TOP[t]) return false;
  return npFeature(t, prefs, cm);
}
function npVibe(t, prefs, legacy, cm) {
  if (!legacy && !NP_TOP[t]) return false;
  if (t === 'commute_brief') return !!cm;
  if (!NP_VIBE[t]) return false;
  return !npOff(prefs, npGroup(t));
}

function notifPolicy(o) {
  o = o || {};
  var prefs = (o.prefs && typeof o.prefs === 'object') ? o.prefs : {};
  var legacy = o.legacy === true, cm = o.cm === true;
  var seen = {}, k;
  for (k in NP_ALLOW) seen[k] = 1;
  for (k in NP_VIBE) seen[k] = 1;
  var types = {}, groups = {};
  Object.keys(seen).sort().forEach(function (t) {
    types[t] = { n: npNotif(t, prefs, legacy, cm) ? 1 : 0, v: npVibe(t, prefs, legacy, cm) ? 1 : 0, f: npFeature(t, prefs, cm) ? 1 : 0 };
    var g = npGroup(t); if (g) groups[t] = g;
  });
  return { v: NOTIF_POLICY_V, types: types, groups: groups, top: Object.keys(NP_TOP).sort() };
}

// ── Worker 연결부 — POST /notif-policy (handleFetch 에 길을 둔다) ──
function handleNotifPolicy(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: H }));
  return request.text().then(function (raw) {
    if (raw.length > 4000) return new Response(JSON.stringify({ ok: false, error: 'body-too-long' }), { status: 413, headers: H });
    var body;
    try { body = JSON.parse(raw); } catch (e0) { return new Response(JSON.stringify({ ok: false, error: 'bad-json' }), { status: 400, headers: H }); }
    var out;
    try { out = notifPolicy(body); } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
    out.ok = true;
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ ok: false, error: 'read-fail' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { notifPolicy: notifPolicy, npGroup: npGroup, handleNotifPolicy: handleNotifPolicy, NOTIF_POLICY_V: NOTIF_POLICY_V };
