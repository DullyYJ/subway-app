// 길동무 — 하차 전 추천 '언제 보낼까' 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (5번 5단계 둘째 조각: 판단)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   '하차 전 추천(카페·점심·저녁·야식·쇼핑)을 지금 보낼까'는 예전엔 웹(www/index.html)의 _arrCheckPreAlert · _arrSlot · _arrIsDinner · _arrRemainMin 이 정했다.
//   이 함수는 같은 규칙을 엔진이 정하게 한다. 앱(웹)은 '마지막 대중교통 하차까지 남은 초 · 도착 시각 · 목적지 이름 · 지난번 보낸 기록'만 알리고,
//   돌아온 판정(보낼까 · 시간대 · 저녁 여부 · 남은 분 · 다음에 언제 다시 물을까)을 그대로 따른다.
//   (추천 문구·가게 고르기·날씨 문구는 이 조각 밖 — 웹/서버에 남는다.)
//
// 입력  arrRecoWhen({ arrMs, remSec, dest, lastKey, lastAt, nowMs })
//   arrMs   : 마지막 대중교통 하차 예정 시각(ms) · remSec : 거기까지 남은 초 · dest : 추천 가게를 고를 곳 이름('' 가능)
//   lastKey : 이번 여정에서 이미 보낸 추천의 키(없으면 '') · lastAt : 그때 시각(ms, 없으면 0) · nowMs : 지금(ms)
// 출력  { v:1, fire:true|false, why:'ok'|'input'|'window'|'dup'|'recent', key, slot, dinner, remMin, pre, askMs }
//   fire    : 지금 보낼까(추천 본문을 만들어 알림·작은 화면으로) · key : 보낸 기록으로 남길 키 · slot : 'morning'|'lunch'|'night'|'shop'|'none'(도착 시각의 한국시간 기준)
//   dinner  : 17~19시 도착이면 true('야식'이 아니라 '저녁 식사') · remMin : 문구에 쓸 '남은 분'(1~pre) · pre : 추천 시작 분(하차 몇 분 전부터)
//   askMs   : 다시 물을 때까지 기다릴 ms(5초~60초) — 앱이 20초마다 물어도 대부분 건너뛰게 한다(남은 시간이 많으면 길게)
'use strict';

var ARR_RECO_V = 1;
var ARR_PRE_MIN = 7;                       // 마지막 대중교통을 내리기 몇 분 전부터 추천을 보일지(2026-10-17 YJ: 5→7)
var ARR_RECENT_MS = 30 * 60 * 1000;        // 30분 안에 이미 보냈으면 같은 여정으로 본다(재동기화로 도착 시각이 바뀌어도 두 번 안 뜨게)

function arKstMin(ms) { var m = Math.floor(Number(ms) / 60000) + 540; return ((m % 1440) + 1440) % 1440; }   // 도착 시각의 한국시간(분, 0~1439)

// 도착 시각 → 시간대. 17~21시 야식·저녁, 21시 넘으면 쇼핑, 7~10시 아침, 10~17시 점심, 심야(0~7시)는 없음 — 예전 웹 _arrSlot 과 같다.
function arrSlot(arrMs) {
  var m = arKstMin(arrMs);
  if (m >= 17 * 60 && m <= 21 * 60) return 'night';
  if (m >= 21 * 60 + 1) return 'shop';
  if (m >= 7 * 60 + 1 && m <= 10 * 60) return 'morning';
  if (m >= 10 * 60 + 1 && m <= 16 * 60 + 59) return 'lunch';
  return 'none';
}
// 17~19시 도착은 '야식'이 아니라 '저녁 식사'
function arrIsDinner(arrMs) { var m = arKstMin(arrMs); return m >= 17 * 60 && m < 19 * 60; }
// 문구에 쓸 남은 분 — 예전 웹 _arrRemainMin 과 같다
function arrRemainMin(arrMs, nowMs) {
  var m = Math.round((Number(arrMs) - Number(nowMs)) / 60000);
  if (!isFinite(m) || m < 1 || m > ARR_PRE_MIN + 2) return ARR_PRE_MIN;
  return Math.min(ARR_PRE_MIN, m);
}

function arrRecoWhen(o) {
  o = o || {};
  var arrMs = Number(o.arrMs), rem = (o.remSec === null || o.remSec === undefined || o.remSec === '') ? null : Number(o.remSec);
  var nowMs = Number(o.nowMs); if (!isFinite(nowMs)) nowMs = 0;
  var dest = (o.dest === null || o.dest === undefined) ? '' : String(o.dest);
  var lastKey = (o.lastKey === null || o.lastKey === undefined) ? '' : String(o.lastKey), lastAt = Number(o.lastAt); if (!isFinite(lastAt)) lastAt = 0;
  var r = { v: ARR_RECO_V, fire: false, why: 'input', key: '', slot: 'none', dinner: false, remMin: ARR_PRE_MIN, pre: ARR_PRE_MIN, askMs: 60000 };
  if (!arrMs || !isFinite(arrMs) || rem === null || !isFinite(rem)) return r;
  r.slot = arrSlot(arrMs); r.dinner = arrIsDinner(arrMs); r.remMin = arrRemainMin(arrMs, nowMs);
  if (rem > ARR_PRE_MIN * 60 || rem < 60) {                              // 7분~1분 구간에서만
    r.why = 'window';
    r.askMs = rem > ARR_PRE_MIN * 60 ? Math.max(5000, Math.min(60000, Math.round((rem - ARR_PRE_MIN * 60 - 5) * 1000))) : 60000;
    return r;
  }
  r.key = String(o.arrMs) + '|' + dest;
  if (lastKey === r.key) { r.why = 'dup'; return r; }                    // 이번 여정 1회
  if (lastAt && (nowMs - lastAt) < ARR_RECENT_MS) { r.why = 'recent'; return r; }
  r.fire = true; r.why = 'ok'; r.askMs = 60000;
  return r;
}

// ── Worker 연결부 — POST /arrive-reco (handleFetch 에 길을 둔다) ──
function handleArriveReco(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: H }));
  return request.text().then(function (raw) {
    if (raw.length > 4000) return new Response(JSON.stringify({ ok: false, error: 'body-too-long' }), { status: 413, headers: H });
    var body;
    try { body = JSON.parse(raw); } catch (e0) { return new Response(JSON.stringify({ ok: false, error: 'bad-json' }), { status: 400, headers: H }); }
    var out;
    try { out = arrRecoWhen(body); } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
    out.ok = true;
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ ok: false, error: 'read-fail' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { arrRecoWhen: arrRecoWhen, arrSlot: arrSlot, arrIsDinner: arrIsDinner, arrRemainMin: arrRemainMin, handleArriveReco: handleArriveReco, ARR_PRE_MIN: ARR_PRE_MIN, ARR_RECO_V: ARR_RECO_V };
