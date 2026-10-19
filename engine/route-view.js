// 길동무 — 경로 결과 '정리' 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (s66, 네이티브화 4단계 넷째 조각)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   경로 응답(/route-v2-app)을 받은 앱(웹)이 예전엔 직접 했던 정리 — ① 같은 경로 겹침 정리(_pathSig/_dedupPaths + 소요·환승·종류 같은 것 정리)
//   ② 탭별 대표 경로 정하기 · '왜 이 경로인지' 한두 문장(_routeWhyText) ③ 총 소요를 승차/대기/도보·환승으로 나누기(_routeTimeSplit/_routeSplitText) — 를 엔진이 같은 규칙으로 한다.
//   요청에 &rv=1 이 붙었을 때만 응답 result.rv 를 싣는다(안 붙으면 응답 그대로). 앱은 rv 를 그대로 쓰고, rv 가 없거나 이상하면(옛 엔진) 예전 방식으로 바로 이어간다.
//
// 입력  rvAnnotate(od) — od = buildAppResponse 결과(+ 환승·다음열차 정보가 붙은 뒤). od.result.path[] 의 info/subPath 를 읽기만 한다(고치지 않는다).
// 출력  od.result.rv = { v:1, n:경로 수, keep:[남길 경로 번호…(순서 그대로)], tabs:{번호:[탭…]}, why:{번호:'문장'}, split:{번호:{ride,wait,walk,tot,text}|null} }
'use strict';

var RV_V = 1;

// 경로 서명 — 이용 노선과 승·하차 지점이 같으면 같은 경로로 본다(예전 웹 _pathSig 와 같다)
function rvPathSig(p, idx) {
  try {
    return (p.subPath || []).filter(function (sp) { return sp.trafficType !== 3; })
      .map(function (sp) {
        var lane = (sp.lane && sp.lane[0]) || {};
        var no = lane.busNo || lane.name || lane.subwayCode || '';
        return sp.trafficType + ':' + no + ':' + (sp.startName || '') + '>' + (sp.endName || '');
      }).join('|');
  } catch (e) { return '\u0000' + idx; }
}

// 같은 서명은 하나만(더 짧은 쪽을 남기고 탭 표시는 합친다) → 그 뒤 소요·환승·종류가 같은 것은 먼저 온 것만
function rvDedup(paths) {
  var best = {}, order = [], tabs = {};
  paths.forEach(function (p, i) {
    var sig = rvPathSig(p, i);
    var tb = (p.info || {}).tab;
    if (!Object.prototype.hasOwnProperty.call(best, sig)) {
      best[sig] = i; order.push(sig);
      tabs[i] = tb ? [tb] : [];
      return;
    }
    var keep = best[sig];
    tabs[keep] = tabs[keep] || [];
    if (tb && tabs[keep].indexOf(tb) < 0) tabs[keep].push(tb);
    var t = ((p.info || {}).totalTime != null) ? p.info.totalTime : 9999;
    var bt = ((paths[keep].info || {}).totalTime != null) ? paths[keep].info.totalTime : 9999;
    if (t < bt) { tabs[i] = tabs[keep]; best[sig] = i; }       // 더 짧은 쪽으로 갈아끼우되 탭 표시는 이어받는다
  });
  var keep1 = order.map(function (sig) { return best[sig]; });
  var seen = {}, keep2 = [];
  keep1.forEach(function (i) {
    var inf = paths[i].info || {};
    var key = inf.totalTime + '_' + inf.transferCount + '_' + inf.pathType;
    if (seen[key]) return;
    seen[key] = true; keep2.push(i);
  });
  return { keep: keep2, tabs: tabs };
}

function rvTabsOf(p, tabsMap, i) {
  var inf = p.info || {};
  var tb = tabsMap[i];
  return (tb && tb.length) ? tb : (inf.tab ? [inf.tab] : []);
}

// 총 소요를 승차 / 대기 / 도보·환승으로 나눈다(예전 웹 _routeTimeSplit 와 같다)
function rvSplit(subPath, totalMin) {
  try {
    var ride = 0, wait = 0, walk = 0, n = 0;
    (subPath || []).forEach(function (sp) {
      var t = sp.trafficType, dur = (sp.sectionTime || 0) * 60 / 60;
      var xferWaitSec = sp.xferWaitSec != null ? sp.xferWaitSec : null;
      var startSec = sp.startSec != null ? sp.startSec : null, endSec = sp.endSec != null ? sp.endSec : null;
      var waitSec = sp.waitSec != null ? sp.waitSec : null, xpWaitSec = sp.xpWaitSec != null ? sp.xpWaitSec : null;
      if (t !== 1 && t !== 2 && t !== 4) {
        var xw2 = (xferWaitSec > 0) ? Math.min(dur, xferWaitSec / 60) : 0;
        walk += dur - xw2; wait += xw2; return;
      }
      var r = null;
      if (startSec != null && endSec != null && isFinite(startSec) && isFinite(endSec) && endSec >= startSec) r = (endSec - startSec) / 60;
      if (r == null) r = Math.max(0, dur - ((waitSec || 0) / 60));
      if (r > dur) r = dur;
      var w = Math.max(0, dur - r);
      var xw = (xpWaitSec > 0) ? Math.min(r, xpWaitSec / 60) : 0;
      ride += r - xw; wait += w + xw; n++;
    });
    if (!n) return null;
    var parts = [ride, wait, walk], sum = ride + wait + walk, target = Math.round(sum);
    if (totalMin > 0 && sum > 0 && totalMin - sum > 0.5 && totalMin - sum <= 15) {
      wait += totalMin - sum; parts = [ride, wait, walk]; sum = totalMin; target = totalMin;
    } else if (totalMin > 0 && sum > 0 && Math.abs(totalMin - sum) <= 3) {
      var k = totalMin / sum; parts = parts.map(function (v) { return v * k; }); target = totalMin;
    }
    var fl = parts.map(function (v) { return Math.floor(v); });
    var left = target - fl.reduce(function (a, b) { return a + b; }, 0);
    parts.map(function (v, i) { return [v - Math.floor(v), i]; }).sort(function (a, b) { return b[0] - a[0]; })
      .slice(0, Math.max(0, left)).forEach(function (o) { fl[o[1]]++; });
    return { ride: fl[0], wait: fl[1], walk: fl[2] };
  } catch (e) { return null; }
}
function rvSplitText(sp) {
  if (!sp) return '';
  var a = ['승차 ' + sp.ride + '분'];
  if (sp.wait > 0) a.push('대기 ' + sp.wait + '분');
  if (sp.walk > 0) a.push('도보·환승 ' + sp.walk + '분');
  return a.join(' · ');
}

// 왜 이 경로인지 한두 문장(예전 웹 _routeWhyText 와 같다) — R = { fast, less } 탭 대표 경로
function rvWhy(path, tabs, R) {
  try {
    var info = (path && path.info) || {};
    R = R || {};
    var has = function (t) { return tabs.indexOf(t) >= 0; };
    var tot = info.totalTime, xf = info.transferCount || 0;
    var ti = function (p) { return (p && p.info && p.info.totalTime != null) ? p.info.totalTime : null; };
    var xi = function (p) { return (p && p.info && p.info.transferCount != null) ? p.info.transferCount : null; };
    var out = [];
    if (info.longDist) {
      out.push('기다리는 시간까지 합쳐 가장 일찍 도착하는 ' + (info.ldGrade || '장거리') + ' 편이에요.');
      var fr = info.ldFastRide;
      if (fr && fr.rideMin != null && fr.depTs != null && info.ldDepTs != null && fr.depTs > info.ldDepTs)
        out.push('이동 시간만 가장 짧은 편은 ' + (fr.depLabel || '') + ' 출발(' + fr.rideMin + '분)이지만 기다리는 시간이 길어 도착은 더 늦어요.');
    } else if (has('fast') && has('less')) {
      out.push('가장 빨리 도착하면서 환승도 가장 적은 경로예요.');
    } else if (has('fast')) {
      out.push('가장 빨리 도착하는 경로예요.');
      var L = R.less;
      if (L && xi(L) != null && xi(L) < xf && ti(L) != null && tot != null && ti(L) > tot) out.push('환승 ' + xi(L) + '회로 가는 경로는 ' + (ti(L) - tot) + '분 더 걸려요.');
    } else if (has('less')) {
      out.push('환승이 가장 적은 경로예요' + (xf === 0 ? '(환승 없음).' : '(환승 ' + xf + '회).'));
      var F = R.fast;
      if (F && ti(F) != null && tot != null && tot > ti(F)) out.push('가장 빠른 경로보다 ' + (tot - ti(F)) + '분 더 걸려요.');
    } else if (has('walk')) {
      out.push('걷는 시간이 가장 짧은 경로예요.');
    } else if (has('sub')) {
      out.push('지하철 위주로 이동하는 경로예요.');
    } else if (has('bus')) {
      out.push('버스 위주로 이동하는 경로예요.');
    }
    return out.join(' ');
  } catch (e) { return ''; }
}

function rvAnnotate(od) {
  var paths = (od && od.result && od.result.path) || [];
  var n = paths.length;
  var dd = rvDedup(paths);
  var kept = dd.keep;                                    // 번호들
  // 탭별 대표 경로(엔진이 준 탭 그대로, 먼저 나온 것) — 예전 웹 _parseRouteOptions 의 byEngine 와 같다
  var byTab = {}, firstKept = kept.length ? kept[0] : null;
  kept.forEach(function (i) { rvTabsOf(paths[i], dd.tabs, i).forEach(function (tb) { if (byTab[tb] == null) byTab[tb] = i; }); });
  var R = {}, why = {}, split = {}, tabsOut = {};
  var haveTab = byTab.fast != null || byTab.less != null || byTab.sub != null || byTab.bus != null;
  if (haveTab && firstKept != null) {
    var fi = byTab.fast != null ? byTab.fast : (byTab.less != null ? byTab.less : firstKept);
    var li = byTab.less != null ? byTab.less : (byTab.direct != null ? byTab.direct : (byTab.fast != null ? byTab.fast : firstKept));
    R.fast = paths[fi]; R.less = paths[li];
  }
  kept.forEach(function (i) {
    var p = paths[i], tabs = rvTabsOf(p, dd.tabs, i);
    tabsOut[i] = (dd.tabs[i] || []).slice();
    why[i] = rvWhy(p, tabs, R);
    var tot = Math.round(((p.info && p.info.totalTime) || 0));
    var sp = rvSplit(p.subPath || [], tot);
    split[i] = sp ? { ride: sp.ride, wait: sp.wait, walk: sp.walk, tot: tot, text: rvSplitText(sp) } : null;
  });
  var rv = { v: RV_V, n: n, keep: kept, tabs: tabsOut, why: why, split: split };
  if (od && od.result) od.result.rv = rv;
  return rv;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { rvAnnotate: rvAnnotate, rvDedup: rvDedup, rvSplit: rvSplit, rvSplitText: rvSplitText, rvWhy: rvWhy, rvPathSig: rvPathSig, RV_V: RV_V };
