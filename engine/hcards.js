// 길동무 — 홈 카드 묶음(AI 승무원 · 혼잡도 · 실시간 대화) 화면 엔진 — 2026-10-20 (s93). POST /screen/hcards.
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   웹에서는 카드마다 데이터 계층(내 경로 구간 모으기 · 가까운 역 · 혼잡 % · 지금 시각 판단)이 사실을 모아 /screen/ai · /screen/cong · /screen/talk 로 보냈다.
//   네이티브에는 웹이 없으니, 앱은 '기기 사실'(보던 경로 응답 · 위치 · 지금 시각 · 받아 둔 대화 · 다음 갱신 시각)만 보내고 이 엔진이 사실을 모아 세 카드를 한 번에 만든다.
//   각 카드의 글·색·막대는 기존 엔진(aicard.js · home-brief.js · cong.js · talkcard.js)이 그대로 정한다.
// 입력  hcardsScreen({ cap(18 이상) }, f)
//   f = { now(ms), tz(동쪽 분), th, hol(주말·공휴일), gps:[위도,경도]|null, rd:{here,boarded,key,nodes[{name,isOrigin,isSub,isBus,lineName}]}|없음(탑승 중일 때만 — 장면이 대기/탑승/하차로 바뀐다),
//         r: { data(경로 응답 그대로), tab, a, b, bt(기준시각 ms|null), rb(탐색한 시각) } | null,
//         ai: { nextAt(ms, 0 이면 없음), busy, rnd(0~1) }, tk: { m:[[닉네임,글,시각ms,내 글0|1]…], fold, tzo } }
// 출력  { ok, v:1, screen:'hcards', cover:'chips', head:[], body:[panel…], info:{ ai:모드, cong:모드, stn } }
//   눌림: ai.refresh · tk.open · tk.send(입력은 fields['talk.in'])
'use strict';
var HC_V = 1;
var hcRes = (typeof resConvertPath === 'function') ? { conv: resConvertPath, rv: resApplyRv, pick: resPickTabs } : (function () { try { var m = require('./result'); return { conv: m.resConvertPath, rv: m.resApplyRv, pick: m.resPickTabs }; } catch (e) { return null; } })();
var hcAi = (typeof aiScreen === 'function') ? aiScreen : (function () { try { return require('./aicard').aiScreen; } catch (e) { return null; } })();
var hcCong = (typeof congScreen === 'function') ? { screen: congScreen, facts: congFacts, pct: congPctSub } : (function () { try { var m = require('./cong'); return { screen: m.congScreen, facts: m.congFacts, pct: m.congPctSub }; } catch (e) { return null; } })();
var hcScene = (typeof sceneDecide === 'function') ? sceneDecide : (function () { try { return require('./scene').sceneDecide; } catch (e) { return null; } })();
var hcTalk = (typeof talkScreen === 'function') ? talkScreen : (function () { try { return require('./talkcard').talkScreen; } catch (e) { return null; } })();
function hcNum(v, d) { v = Number(v); return isFinite(v) ? v : d; }
function hcArr(v) { return Array.isArray(v) ? v : []; }
function hcStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function hcHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function hcStnTable() {
  if (typeof HOME_STNS !== 'undefined' && HOME_STNS) return HOME_STNS;
  try { if (typeof require === 'function') return require('./home-stations').HOME_STNS; } catch (e) { /* 없음 */ }
  return [];
}
function hcHav(la1, lo1, la2, lo2) {
  var t = Math.PI / 180, dLa = (la2 - la1) * t, dLo = (lo2 - lo1) * t;
  var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * t) * Math.cos(la2 * t) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, x))));
}
function hcNearest(la, lo) {                          // 가장 가까운 지하철역 [이름, 노선, 위도, 경도, 거리m] (3km 안), 없으면 null
  var t = hcStnTable(), best = null, bd = 3000;
  for (var i = 0; i < t.length; i++) { var d = hcHav(la, lo, t[i][2], t[i][3]); if (d < bd) { bd = d; best = [t[i][0], t[i][1], t[i][2], t[i][3], Math.round(d)]; } }
  return best;
}
function hcStnByName(nm) {                           // 역 이름 → [위도, 경도] (표에서 처음 만난 것), 없으면 null
  if (!nm) return null;
  var t = hcStnTable(), n = String(nm).replace(/역$/, '');
  for (var i = 0; i < t.length; i++) if (t[i][0] === n || t[i][0] === nm) return [t[i][2], t[i][3]];
  return null;
}
// 날씨를 받아 올 두 지점(웹 _fetchWeather 와 같은 자리): wF = 지금 있는 곳(위치 없으면 경로 출발역·가까운 역), wT = 경로 도착역.
// 날씨 값 자체는 Worker 가 subway-api /weather 에서 받아 f.wx = {wF,wT}({temp,txt,rain}) 로 넣어 준다(엔진은 시계도 네트워크도 모른다).
function hcWxPoints(f) {
  f = (f && typeof f === 'object') ? f : {};
  var now = Math.floor(hcNum(f.now, 0) / 60000) * 60000, tz = hcNum(f.tz, 540);
  var gps = (Array.isArray(f.gps) && isFinite(Number(f.gps[0])) && isFinite(Number(f.gps[1]))) ? [Number(f.gps[0]), Number(f.gps[1])] : null;
  var rt = now > 0 ? hcRoute(f.r, now, tz) : null, out = { wF: null, wT: null };
  if (gps) out.wF = gps;
  else if (rt) out.wF = hcStnByName(rt.segs[0].from);
  if (rt) out.wT = hcStnByName(rt.segs[rt.segs.length - 1].to);
  return out;
}
function hcWx(w) {
  if (!w || typeof w !== 'object') return null;
  var t = Number(w.temp); if (!isFinite(t)) return null;
  return { temp: t, txt: hcStr(w.txt, 12), rain: isFinite(Number(w.rain)) ? Number(w.rain) : 0 };
}
function hcClock(ms, tz) { var d = new Date(Number(ms) + Number(tz) * 60000), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); }
// 보던 경로 → 브리핑 사실. 웹 _briefFromTransitData 와 같은 구간 뽑기.
function hcRoute(r, now, tz) {
  if (!r || typeof r !== 'object' || !hcRes) return null;
  var data = (r.data && typeof r.data === 'object') ? r.data : null;
  if (!data) return null;
  var paths = hcRes.rv(data, hcArr((data.result || {}).path)), pick = hcRes.pick(paths);
  var tab = ['fast', 'less', 'sub', 'bus', 'longdist'].indexOf(r.tab) >= 0 ? r.tab : 'fast';
  var p = pick[tab] || pick.fast, route = p ? hcRes.conv(p) : null;
  if (!route) return null;
  var base = r.bt != null ? hcNum(r.bt, null) : (hcNum(r.rb, 0) || now);
  var segs = [];
  route.sections.forEach(function (sec) {
    var tt = (sec.transportation || {}).type;
    if (tt !== 1 && tt !== 2 && tt !== 4) return;
    var sl = ((sec.passStopList || {}).stationList) || [];
    var s = { type: tt, line: (sec.transportation || {}).name || (tt === 2 ? '버스' : tt === 4 ? '장거리' : '지하철'),
      from: sl.length ? (sl[0].stationName || '') : '', to: sl.length ? (sl[sl.length - 1].stationName || '') : '', stops: Math.max(0, sl.length - 1),
      min: Math.max(1, Math.round((sec.duration || 0) / 60)), nextTrain: tt === 1 ? (sec.nextTrain || null) : null };
    if (tt === 4 && base != null && sec.startSec != null && sec.endSec != null && isFinite(sec.startSec) && isFinite(sec.endSec)) {
      s.depClock = hcClock(base + sec.startSec * 1000, tz); s.arrClock = hcClock(base + sec.endSec * 1000, tz); s.rideMin = Math.round(Math.max(0, sec.endSec - sec.startSec) / 60);
    }
    segs.push(s);
  });
  if (!segs.length) return null;
  var mins = Math.round(hcNum(route.summary.duration, 0) / 60);
  if (!mins) segs.forEach(function (s) { mins += s.min; });
  return { segs: segs, mins: mins, dist: hcNum(route.summary.distance, 0), base: base };
}
// 웹 홈 카드 치수(411 폭에서 잰 값): 카드 좌우 14 · 카드 사이 14 · 제목줄(.sec)과 카드 사이 6 · 맨 아래 22.
//   혼잡도 카드 = 왼쪽 4px 굵은 띠(border-left, 안쪽 여백은 테두리 1px 을 빼고 적는다) · AI 카드 padding 14/16 · 대화 카드 radius 14 padding 10/12.
var HC_GAP = 14, HC_SEC_GAP = 6, HC_BOTTOM = 22, HC_ARROW = '#1d9bf0';
function hcPanel(kids, o) {
  o = o || {};
  var p = { t: 'panel', pad: [14, 0, 14, o.pb != null ? o.pb : HC_GAP], ip: o.ip || [16, 14, 16, 14], r: o.r || 16, kids: kids };
  if (o.lb) { p.lb = o.lb; p.lc = o.lc || HC_ARROW; }
  return p;
}
function hcSec(label, o) {
  o = o || {};
  var n = { t: 'sec', s: label, pad: [14, 0, 14, HC_SEC_GAP] };
  if (o.badge) { n.badge = o.badge; n.bc = o.bc || HC_ARROW; }
  if (o.hint) n.hint = o.hint;
  if (o.btn) { n.btn = o.btn; n.act = o.act; }
  return n;
}
function hcCssColor(c) {                                   // 엔진 색 이름(arex)을 CSS 색으로
  if (typeof c !== 'string' || !c) return HC_ARROW;
  if (c === 'arex') return HC_ARROW;
  return /^#|^rgb/.test(c) ? c : HC_ARROW;
}
function hcKids(sc) {                                  // 카드 화면 하나의 머리·본문·아래 줄을 한 줄로 이어 붙인다(높이 0 빈칸은 뺀다)
  var out = [];
  hcArr(sc.head).concat(hcArr(sc.body)).concat(hcArr(sc.foot)).forEach(function (n) { if (n && !(n.t === 'spacer' && !(n.h > 0))) out.push(n); });
  return out;
}
// 캐릭터 장면: 어떤 장면(시간대·날씨·계절·대표 캐릭터·동작 대본)인지는 장면 엔진(sceneDecide)이 정하고, 앱은 그 값(JSON 글)대로 그리기만 한다.
// 탑승 중 장면(대기·탑승·하차)은 탑승 안내 쪽 사실이 필요해 여기서는 보내지 않는다 — 홈에서는 늘 '대기실(idle)' 장면이다.
function hcRideNodes(rd) {                                  // 앱이 보낸 탑승 중 재료 → sceneDecide 입력(이름·종류만, 80개까지)
  if (!rd || typeof rd !== 'object' || !Array.isArray(rd.nodes) || rd.nodes.length < 2) return null;
  var nodes = rd.nodes.slice(0, 80).map(function (n) {
    n = (n && typeof n === 'object') ? n : {};
    return { name: hcStr(n.name, 24), isOrigin: n.isOrigin === true, isSub: n.isSub === true, isBus: n.isBus === true, lineName: hcStr(n.lineName, 16) };
  });
  return { nodes: nodes, here: Math.max(0, Math.min(nodes.length - 1, Math.floor(hcNum(rd.here, 0)))), boarded: rd.boarded === true, key: hcStr(rd.key, 40) };
}
// 캐릭터 장면: 어떤 장면(시간대·날씨·계절·대표 캐릭터·동작 대본)인지는 장면 엔진(sceneDecide)이 정하고, 앱은 그 값(JSON 글)대로 그리기만 한다.
// 탑승 중(rd 가 있을 때)이면 기다리는 중(wait) · 타고 가는 중(ride · 버스) · 내렸어요(alight) 장면을 보낸다. 지하철을 타고 가는 동안은 장면 대신 혼잡도 카드를 보이므로 장면 노드가 없다(sceneDecide 의 mode 가 null).
function hcSceneNode(now, tz, routeShown, wx, stn, rd) {
  if (!hcScene) return null;
  var sc, rn = hcRideNodes(rd);
  try {
    sc = rn ? hcScene({ nowMs: now, tzOffsetMin: tz, locked: true, here: rn.here, boarded: rn.boarded, key: rn.key, nodes: rn.nodes, routeShown: true }, wx || null)
            : hcScene({ nowMs: now, tzOffsetMin: tz, locked: false, routeShown: routeShown === true, key: stn || '' }, wx || null);
  } catch (e) { return null; }
  if (!sc || sc.ok !== true || !sc.mode) return null;
  var js = JSON.stringify(sc);
  if (js.length >= 6000) return null;
  var node = { t: 'scene', h: 150, r: 12, pad: [0, 0, 0, 0], sc: js };
  if (sc.fill === true) { node.fit = true; node.fmin = 90; node.fmax = 900; node.frh = 26; }      // 웹 _sceneFit: 경로가 없으면 남는 세로를 채운다(최소 90) — 앱은 잰 높이로 뺄셈만 한다
  return node;
}
var HC_SHARE = { a: 'call', v: 'share.loc' };
function hcardsScreen(inp, f) {
  if (!(Number(inp && inp.cap) >= 18)) return { ok: false, error: 'cap' };
  if (!hcAi || !hcCong || !hcTalk) return { ok: false, error: 'engine' };
  f = (f && typeof f === 'object') ? f : {};
  var now = Math.floor(hcNum(f.now, 0) / 60000) * 60000, tz = hcNum(f.tz, 540);
  if (!(now > 0)) return { ok: false, error: 'now' };
  var th = f.th === 'pastel' ? 'pastel' : 'dark', hol = f.hol === true;
  var gps = (Array.isArray(f.gps) && isFinite(Number(f.gps[0])) && isFinite(Number(f.gps[1]))) ? [Number(f.gps[0]), Number(f.gps[1])] : null;
  var rt = hcRoute(f.r, now, tz), near = gps ? hcNearest(gps[0], gps[1]) : null;
  var a = f.r && typeof f.r === 'object' ? hcStr(f.r.a, 40) : '', b = f.r && typeof f.r === 'object' ? hcStr(f.r.b, 40) : '';
  var hour = new Date(now + tz * 60000).getUTCHours(), nowMin = hour * 60 + new Date(now + tz * 60000).getUTCMinutes();
  // 어느 역/정류장의 혼잡도를 보일지: 보던 경로의 처음 대중교통 > 가까운 역
  var cs = { mode: 'none', now: now, tz: tz, th: th, stn: '', line: '', ld: 0, live: null, bus: {} }, stn = '';
  if (rt) {
    var first = rt.segs[0];
    if (first.type === 1 && first.from) { cs.mode = 'sub'; cs.stn = first.from; cs.line = first.line; }
    else if (first.type === 2) { cs.mode = 'bus'; cs.bus = { no: first.line, stop: first.from, none: 1 }; }
  }
  if (cs.mode === 'none' && near) { cs.mode = 'sub'; cs.stn = near[0]; cs.line = near[1]; }
  stn = cs.stn || (cs.bus && cs.bus.stop) || '';
  var CF = hcCong.facts(cs), cong = cs.mode === 'sub' ? hcCong.pct(CF, CF.h) : 40;
  // AI 승무원
  var ai = f.ai && typeof f.ai === 'object' ? f.ai : {};
  var af = { now: now, tz: tz, busy: ai.busy === true, nextAt: hcNum(ai.nextAt, 0), hol: hol, cong: cong, hour: hour, nowMin: nowMin, rnd: Math.max(0, Math.min(1, hcNum(ai.rnd, 0))), metro: false, mode: 'empty', tk: '' };
  if (rt) {
    var rem = rt.mins > 0 ? rt.mins : 0, fromN = a || rt.segs[0].from, toN = b || rt.segs[rt.segs.length - 1].to;
    var preview = f.r.bt != null;
    af.tk = preview ? 'preview' : 'brief'; af.mode = preview ? 'preview' : 'brief';
    af.from = fromN; af.to = toN; af.base = rt.base; af.mins = rt.mins; af.dist = rt.dist; af.segs = rt.segs; af.rem = rem;
    if (preview) af.hour = new Date(rt.base + tz * 60000).getUTCHours();
    af.arrMs = rem > 0 ? Math.floor((now + rem * 60000) / 60000) * 60000 : 0;
    var wxs = f.wx && typeof f.wx === 'object' ? f.wx : {};
    af.wF = hcWx(wxs.wF); af.wT = hcWx(wxs.wT);
    var sub1 = rt.segs.filter(function (s) { return s.type === 1 && s.nextTrain && typeof s.nextTrain === 'object'; })[0];
    if (sub1 && sub1.nextTrain.found !== undefined) af.nt = sub1.nextTrain;
  } else if (near) {
    af.wF = hcWx(f.wx && typeof f.wx === 'object' ? f.wx.wF : null);
    af.tk = 'brief'; af.mode = 'brief'; af.from = near[0]; af.to = ''; af.base = now; af.mins = 0; af.dist = 0; af.segs = null; af.rem = 0;
  }
  var aiS = hcAi({ cap: 14 }, af);
  var congS = hcCong.screen({ cap: 13 }, cs);
  var tkf = f.tk && typeof f.tk === 'object' ? f.tk : {};
  var talkS = hcTalk({ cap: 15 }, { m: hcArr(tkf.m).slice(-8), fold: hcNum(tkf.fold, 0), tzo: hcNum(tkf.tzo, -tz) });
  var body = [];
  // 순서는 웹 홈과 같다: 혼잡도(제목줄 + 캐릭터 장면 카드) → AI 승무원 → 실시간 대화
  if (congS && congS.ok) {
    var ck = hcKids(congS), scn = hcSceneNode(now, tz, !!rt, hcWx(f.wx && typeof f.wx === 'object' ? f.wx.wF : null), stn, f.rd);
    var bar = hcCssColor(congS.info && congS.info.bc), sceneHint = '';
    if (scn) { try { sceneHint = hcStr(JSON.parse(scn.sc).hint, 60); } catch (e) { sceneHint = ''; } }
    var bd = congS.info && typeof congS.info.badge === 'string' ? congS.info.badge : '';
    body.push(hcSec('혼잡도', { badge: scn ? '' : bd, bc: hcCssColor(congS.info && congS.info.bbg), hint: scn ? sceneHint : '', btn: '\uD83D\uDCCD 위치 공유', act: HC_SHARE }));
    if (scn) body.push(hcPanel([scn], { ip: [15, 10, 10, 10], lb: 4, lc: bar }));          // 장면만 보일 땐 안쪽 여백을 줄여 장면에 자리를 더 준다(웹 .cs-on)
    else body.push(hcPanel(ck, { ip: [17, 14, 14, 14], lb: 4, lc: bar }));
  }
  if (aiS && aiS.ok) { body.push(hcSec('AI 승무원')); body.push(hcPanel(hcKids(aiS), { ip: [16, 14, 16, 14] })); }
  if (talkS && talkS.ok) body.push(hcPanel(hcKids(talkS), { ip: [12, 10, 12, 10], r: 14, pb: HC_BOTTOM }));
  var out = { ok: true, v: HC_V, screen: 'hcards', cover: 'chips', head: [], body: body, info: { ai: aiS && aiS.ok ? aiS.info.mode : '', cong: cs.mode, stn: stn, near: near ? near[0] : '' } };
  out.rev = 'h' + HC_V + ':' + hcHash(JSON.stringify(body));
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { hcardsScreen: hcardsScreen, hcSceneNode: hcSceneNode, hcWxPoints: hcWxPoints, hcNearest: hcNearest, hcRoute: hcRoute };
