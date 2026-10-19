// 길동무 — 앞 화면 하차·환승 알림 시점 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (5번 4단계: 알림)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   앱을 보고 있는 동안의 하차·환승 알림('환승 2정거장 전' · '환승 준비' · '목적지 2정거장 전' · '곧 하차' · '목적지 도착')은 예전엔 웹(www/index.html)의
//   _buildTransitAlertTargets · _checkTransitAlerts · _fireTransitAlert 가 '어느 역이 알림 대상인가 · 지금 어떤 알림이 걸렸나 · 같은 순간에 걸린 여럿 중 무엇을 울리나 ·
//   제목·본문·진동 무늬는 무엇인가'를 스스로 정했다. 앱을 가렸을 때(대기 모드)는 엔진(ride-standby.js 의 rsAlerts)이 같은 규칙으로 정하고 있었다.
//   이 함수는 앞 화면에서도 같은 규칙을 엔진이 정하게 한다(규칙은 한 곳 — rsAlerts). 앱(웹)은 '지금 몇 번째 노드인가'만 알리고, 돌아온 알림을 그대로 울린다.
//
// 입력  rideAlert({ nodes, cfg, allowed, fired, curIdx, nowMin, eta, jr })
//   nodes   : 경로 노드 [{ k:'s'|'b'|null(지하철·버스·그 밖), l:노선 이름, n:역·정류장 이름 }…] — 주면 엔진이 알림 대상(targets)·교통 순서(seq)를 만든다
//   cfg     : (nodes 가 없을 때) { targets:[{seqPos,nodeIdx,name,kind,nextLine?}…], seq:[노드번호…] } — 앱이 이미 만든 대상
//   allowed : { 종류:false } 사용자가 끈 알림 종류(transfer2·transfer·near_arrive2·near_arrive·arrive) — false 인 것만 막는다
//   fired   : { "노드_남은정거장":1 } 이미 보낸 알림
//   curIdx  : 지금까지 도달한 가장 먼 노드 번호(앱 GPS·시각표 진행)
//   nowMin  : 지금 시각(분, 0~1440, 소수 가능) · eta : { 노드번호:'HH:MM' } 그 노드의 도착 예정 · jr : 여정 전체 남은 분(없으면 null)
// 출력  { v:1, alert:null|{key,type,title,body,vib}, extra:[키…], curPos, nt }
//   alert : 지금 울릴 알림 하나(가장 급한 것) · extra : 같은 순간에 걸려 '보낸 것으로 처리'할 나머지 키 · nt : 알림 대상 수(진단)
//   덧말 '(약 N분 후)' : 그 노드의 도착 예정(eta)까지 0~240분이면 그 분수 · eta 가 없고 jr 이 있으면 jr · 남은 정거장이 0(목적지 도착)이면 없음 — 예전 웹 _fireTransitAlert 와 같다
//
// 이 파일은 ride-standby.js 의 rsAlerts 를 쓴다(Worker 에서는 같은 범위의 함수, Node 시험에서는 require).
'use strict';

var RIDE_ALERT_V = 1;

function raAlertsFn() { return (typeof rsAlerts === 'function') ? rsAlerts : require('./ride-standby').rsAlerts; }

// 경로 노드 → 알림 대상. 교통(지하철·버스) 노드만 순서(seq)에 넣고, 노선이 바뀌는 곳의 앞 노드 = 환승 하차역, 마지막 교통 노드 = 최종 하차.
function raTargets(nodes) {
  var nd = Array.isArray(nodes) ? nodes : [], seq = [], i;
  for (i = 0; i < nd.length; i++) { var x = nd[i]; if (x && (x.k === 's' || x.k === 'b')) seq.push(i); }
  var targets = [];
  for (var s = 1; s < seq.length; s++) {
    var prev = nd[seq[s - 1]], cur = nd[seq[s]];
    if (String(prev.l || '') !== String(cur.l || '')) targets.push({ seqPos: s - 1, nodeIdx: seq[s - 1], name: String(prev.n || ''), kind: 'transfer', nextLine: String(cur.l || '') });
  }
  if (seq.length) targets.push({ seqPos: seq.length - 1, nodeIdx: seq[seq.length - 1], name: String(nd[seq[seq.length - 1]].n || ''), kind: 'dest' });
  return { targets: targets, seq: seq };
}

// 'HH:MM' → 분(0~1439). 못 읽으면 null
function raHm(s) {
  if (typeof s !== 'string') return null;
  var m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function raMinTxtFn(o) {
  var eta = (o.eta && typeof o.eta === 'object') ? o.eta : {}, now = Number(o.nowMin), jr = (o.jr === null || o.jr === undefined) ? null : Number(o.jr);
  return function (tg, remain) {
    var tam = raHm(eta[tg.nodeIdx]);
    if (tam !== null && remain !== 0 && isFinite(now)) {
      var td = tam - now;
      if (td < -720) td += 1440;
      if (td > 720) td -= 1440;
      return (td >= 0 && td < 240) ? ' (약 ' + Math.max(1, Math.round(td)) + '분 후)' : '';
    }
    if (remain !== 0 && jr !== null && isFinite(jr)) return ' (약 ' + jr + '분 후)';
    return '';
  };
}

function rideAlert(o) {
  o = o || {};
  var t, cfg = o.cfg && typeof o.cfg === 'object' ? o.cfg : {};
  if (Array.isArray(o.nodes)) t = raTargets(o.nodes);
  else t = { targets: Array.isArray(cfg.targets) ? cfg.targets : [], seq: Array.isArray(cfg.seq) ? cfg.seq : [] };
  var fired = (o.fired && typeof o.fired === 'object') ? o.fired : {};
  var allowed = (o.allowed && typeof o.allowed === 'object') ? o.allowed : {};
  var cur = Number(o.curIdx); if (!isFinite(cur)) cur = -1;
  var r = raAlertsFn()({ targets: t.targets, seq: t.seq, allowed: allowed }, fired, cur, null, 0, raMinTxtFn(o));
  return { v: RIDE_ALERT_V, alert: r.alert, extra: r.extra, curPos: r.curPos, nt: t.targets.length };
}

// ── Worker 연결부 — POST /ride-alert (handleFetch 에 길을 둔다) ──
function handleRideAlert(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: H }));
  return request.text().then(function (raw) {
    if (raw.length > 200000) return new Response(JSON.stringify({ ok: false, error: 'body-too-long' }), { status: 413, headers: H });
    var body;
    try { body = JSON.parse(raw); } catch (e0) { return new Response(JSON.stringify({ ok: false, error: 'bad-json' }), { status: 400, headers: H }); }
    var out;
    try { out = rideAlert(body); } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
    out.ok = true;
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ ok: false, error: 'read-fail' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { rideAlert: rideAlert, raTargets: raTargets, raHm: raHm, handleRideAlert: handleRideAlert, RIDE_ALERT_V: RIDE_ALERT_V };
