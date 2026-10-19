// 길동무 — 경로 요청 후속 지시 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (5번 3단계)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   경로 응답(/route-v2-app)을 받은 뒤 '다음에 무엇을 다시 물을지'(빠른 응답은 그리지 말고 전체를 기다릴지 · 전체 응답을 뒤따라 받을지 ·
//   '예상' 버스를 몇 초 뒤에 다시 조회할지 · 다시 받은 응답이 나아졌는지)를 예전엔 웹(www/index.html)이 응답의 liveStat 를 읽고 스스로 정했다.
//   그 판단을 이 함수로 옮긴다. 응답 맨 앞에 `follow` 로 실어 보내고, 앱 본체(자바 RouteFetchPlugin)와 웹은 이 지시를 그대로 따를 뿐이다.
//
// 입력  { liveStat, n, bf, ver, pm, pa }
//   liveStat : 엔진이 만든 실시간 반영 현황({ ldWait, livePending, liveMissing, liveApplied … })
//   n        : 이 응답의 경로 개수
//   bf       : 사용자가 기준시각을 직접 골랐나(요청의 bf=1) — 실시간 도착을 못 쓰므로 다시 조회하지 않는다
//   ver      : 엔진 버전 문자열(진단용)
//   pm, pa   : (재조회 요청일 때만) 직전에 화면에 그린 응답의 miss·applied — 이번 응답이 나아졌는지 엔진이 가린다
// 출력  { v, ver, n, draw, next, miss, applied, retry, better? }
//   draw   : false 면 이 응답은 그리지 않는다(80km 이상인데 빠른 응답엔 장거리 후보가 아직 없음) — next 로 전체를 받아 그린다
//   next   : 'full' 이면 같은 요청을 live=0 없이 한 번 더 보낸다(없으면 null)
//   miss   : 실시간 조회를 시도했는데 못 받은(그래서 '예상'인) 버스 구간 수(liveMissing 이 없으면 livePending 이면 1)
//   applied: 실시간 값을 실제로 반영한 구간 수
//   retry  : '예상' 구간이 남았으면 다시 조회할 간격(밀리초) 목록, 아니면 null
//   better : pm 이 있을 때만 — 이번 응답이 직전보다 나아졌나(miss 가 줄었거나, 같은데 applied 가 늘었다)
//
// 이 파일은 의존성이 없다. 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';

var ROUTE_FOLLOW_V = 1;
var ROUTE_FOLLOW_RETRY_MS = [12000, 16000, 20000];

function _rfInt(x) { var v = Number(x); return isFinite(v) && v > 0 ? Math.floor(v) : 0; }

function routeFollow(o) {
  o = o || {};
  var ls = (o.liveStat && typeof o.liveStat === 'object') ? o.liveStat : {};
  var ldWait = !!ls.ldWait, pending = !!ls.livePending;
  var miss = (typeof ls.liveMissing === 'number' && isFinite(ls.liveMissing)) ? Math.max(0, Math.floor(ls.liveMissing)) : (pending ? 1 : 0);
  var applied = _rfInt(ls.liveApplied);
  var f = {
    v: ROUTE_FOLLOW_V,
    ver: o.ver ? String(o.ver) : '',
    n: _rfInt(o.n),
    draw: !ldWait,
    next: (ldWait || pending) ? 'full' : null,
    miss: miss,
    applied: applied,
    retry: (!o.bf && miss > 0) ? ROUTE_FOLLOW_RETRY_MS.slice() : null
  };
  if (o.pm !== undefined && o.pm !== null && o.pm !== '') {
    var pm = Number(o.pm), pa = Number(o.pa);
    if (isFinite(pm)) {
      if (!isFinite(pa)) pa = 0;
      f.better = miss < pm || (miss === pm && applied > pa);
    }
  }
  return f;
}

if (typeof module !== 'undefined') module.exports = { routeFollow: routeFollow, ROUTE_FOLLOW_V: ROUTE_FOLLOW_V, ROUTE_FOLLOW_RETRY_MS: ROUTE_FOLLOW_RETRY_MS };
