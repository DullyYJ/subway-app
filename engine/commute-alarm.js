// 길동무 — 출퇴근 브리핑 '언제 울릴까' 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (5번 5단계 셋째 조각: 판단)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   출퇴근 브리핑 알림의 '시각 판단' — ① 앱이 켜져 있을 때 지금이 보낼 분인가(_cmTick: 설정한 요일 · 출근/퇴근 시각과 같은 분 · 같은 분에 한 번만)
//   ② 앞으로 4주치 예약 알림을 몇 월 며칠 몇 시에 걸까(_cmOccurrences) — 는 예전엔 웹이 정했다. 이 함수는 같은 규칙을 엔진이 정하게 한다.
//   앱(웹)은 '지금 시각 · 켜짐 · 출근/퇴근 시각 · 요일 · 지난번 보낸 기록'만 알리고, 돌아온 판정을 그대로 따른다.
//   ★ 장소(집·회사 이름·좌표)·알림 내용(날씨·혼잡도)은 엔진에 보내지 않는다 — 시각만 다룬다. (경로 미리 받기·브리핑 문구는 이 조각 밖)
//   시각은 한국시간 기준(예전 웹은 기기 시간대; 한국 앱이라 같다).
//
// cmDue({ nowMs, on, osOk, morn, eve, days, lastKey })
//   → { v:1, fire:null|'morn'|'eve', key, askMs }
//   fire : 지금 브리핑을 보낼까(앱이 직접) · key : 보낸 기록으로 남길 키('Mon Oct 19 2026|07:30' — 예전 toDateString()|HH:MM 과 같은 글자) · askMs : 다음에 물을 때까지 기다릴 ms(0~600000)
//   osOk : OS 예약 알림이 걸려 있으면 앱이 또 보내지 않는다(두 번 울림 방지)
// cmOccurrences({ nowMs, morn, eve, days })
//   → { v:1, morn:[ms…], eve:[ms…] }   앞으로 28일치(선택한 요일만, 지금보다 2초 넘게 뒤인 시각만)
'use strict';

var CM_ALARM_V = 1;
var CM_OS_DAYS = 28;
var CM_KST = 9 * 3600000;
var CM_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var CM_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cmParts(ms) {            // 한국시간의 달력 값
  var d = new Date(Number(ms) + CM_KST);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds() };
}
function cm2(n) { return (n < 10 ? '0' : '') + n; }
function cmDateStr(p) { return CM_DOW[p.dow] + ' ' + CM_MON[p.mo] + ' ' + cm2(p.d) + ' ' + p.y; }   // toDateString() 과 같은 글자
function cmDaysOf(days) { return (Array.isArray(days) && days.length) ? days : [0, 1, 2, 3, 4, 5, 6]; }
function cmDayOn(days, dow) { if (!Array.isArray(days) || !days.length) return true; return days.indexOf(dow) >= 0; }

function cmDue(o) {
  o = o || {};
  var r = { v: CM_ALARM_V, fire: null, key: '', askMs: 60000 };
  var now = Number(o.nowMs);
  if (!isFinite(now)) return r;
  if (o.on !== true) { r.askMs = 600000; return r; }
  if (o.osOk === true) { r.askMs = 600000; return r; }
  var morn = String(o.morn == null ? '' : o.morn), eve = String(o.eve == null ? '' : o.eve);
  var p = cmParts(now), cur = cm2(p.h) + ':' + cm2(p.mi);
  r.key = cmDateStr(p) + '|' + cur;
  // 다음 대상 분까지(HH:MM 두 자리로 쓴 시각만 같은 분으로 맞을 수 있다)
  var best = 600000;
  [morn, eve].forEach(function (s) {
    var m = /^(\d{2}):(\d{2})$/.exec(s); if (!m) return;
    var t = (+m[1]) * 60 + (+m[2]), nowMin = p.h * 60 + p.mi, dm = t - nowMin; if (dm < 0) dm += 1440;
    var ms = dm * 60000 - (p.s * 1000 + p.ms);
    if (ms < 0) ms = 0;
    if (ms < best) best = ms;
  });
  r.askMs = best > 90000 ? Math.min(600000, best - 60000) : 0;          // 대상 분이 1분 반 안으로 다가오면 매번 묻는다
  if (String(o.lastKey == null ? '' : o.lastKey) === r.key) return r;   // 같은 분에 한 번만
  if (!cmDayOn(o.days, p.dow)) return r;                                // 설정한 요일에만
  if (cur === morn) r.fire = 'morn';
  else if (cur === eve) r.fire = 'eve';
  return r;
}

function cmOne(nowMs, str, days) {
  var parts = String(str == null ? '' : str).split(':');
  var hh = parseInt(parts[0]), mi = parseInt(parts[1]);
  var out = [];
  if (!isFinite(hh) || !isFinite(mi)) return out;
  var p = cmParts(nowMs);
  for (var i = 0; i <= CM_OS_DAYS + 7 && out.length < CM_OS_DAYS; i++) {
    var t = Date.UTC(p.y, p.mo, p.d + i, hh, mi, 0, 0) - CM_KST;        // 한국시간 그날 hh:mi
    var dow = new Date(Date.UTC(p.y, p.mo, p.d + i, 12, 0, 0, 0)).getUTCDay();
    if (t > nowMs + 2000 && days.indexOf(dow) >= 0) out.push(t);
  }
  return out;
}
function cmOccurrences(o) {
  o = o || {};
  var now = Number(o.nowMs);
  if (!isFinite(now)) return { v: CM_ALARM_V, morn: [], eve: [] };
  var days = cmDaysOf(o.days);
  return { v: CM_ALARM_V, morn: cmOne(now, o.morn, days), eve: cmOne(now, o.eve, days) };
}

// ── Worker 연결부 — POST /commute-alarm {op:'due'|'occ', …} (handleFetch 에 길을 둔다) ──
function handleCommuteAlarm(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: H }));
  return request.text().then(function (raw) {
    if (raw.length > 4000) return new Response(JSON.stringify({ ok: false, error: 'body-too-long' }), { status: 413, headers: H });
    var body;
    try { body = JSON.parse(raw); } catch (e0) { return new Response(JSON.stringify({ ok: false, error: 'bad-json' }), { status: 400, headers: H }); }
    var out;
    try { out = (body && body.op === 'occ') ? cmOccurrences(body) : cmDue(body); } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
    out.ok = true;
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ ok: false, error: 'read-fail' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { cmDue: cmDue, cmOccurrences: cmOccurrences, handleCommuteAlarm: handleCommuteAlarm, CM_ALARM_V: CM_ALARM_V, CM_OS_DAYS: CM_OS_DAYS };
