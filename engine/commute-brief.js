// 길동무 — 출퇴근 브리핑 알림 문구 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-21 (s104)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   예전엔 웹(_fireCommuteBriefing · _cmPair · _cmResolvePlace · _cmClosing)이 출발·도착을 정하고(퇴근은 출근의 반대 또는 따로 정한 곳), 날씨를 받고,
//   혼잡도를 계산해 알림 제목·본문을 만들었다. 이 모듈은 같은 규칙으로 제목·본문을 엔진이 만든다(날씨는 Worker 가 받아서 넣어 준다 — 순수 함수는 네트워크를 모른다).
//   앱은 '설정한 장소(이름·좌표·버스 여부)'와 '지금 시각'만 알리고, 돌아온 글을 알림에 띄우기만 한다. 새 글에는 이모지를 쓰지 않는다.
//
// cbPlan({ kind:'morn'|'eve', from, to, eFrom, eTo, gps })
//   place = { nm, lat?, lng?, bus? } (이름이 비면 없는 장소)
//   → { kind, from:place|null, to:place|null, fromStn, toStn, la, ln }  — fromStn/toStn = 지하철역 표에서 찾았거나 버스·좌표로 만든 { name, lat, lng, line, bus }
//     la/ln = 날씨를 물을 좌표(출발지 → 없으면 gps → 인천 기본값)
// cbCompose(plan, ctx, wF, wT)  ctx = { nowMs, tz }  wF/wT = 날씨 { temp, feel, hum, tmin, tmax, rain, uv, wind, txt }|null
//   → { v:1, title, body, route:{ from:{name,lat,lng,bus}, to:{…} }|null }
// cbBrief(inp, wF, wT) = cbPlan + cbCompose 한 번에.
'use strict';

var CB_V = 1;
var CB_DEF_LAT = 37.45, CB_DEF_LNG = 126.70;
var CB_CLOSING = {
  morn: [
    ['일요일 이동, 여유롭게 다녀오세요', '일요일엔 서두르지 않아도 괜찮아요', '한 주 재충전하며 무사히 다녀오세요'],
    ['한 주의 시작, 가볍게 출발해요', '월요일 아침, 커피 한 잔의 여유 챙기세요', '새로운 한 주, 무리하지 말고 차근차근'],
    ['화요일, 리듬 타기 좋은 날이에요', '어제보다 한결 수월할 거예요', '화요일 아침, 오늘 할 일 하나만 확실히'],
    ['벌써 수요일, 반환점이에요', '한 주의 한가운데, 페이스 유지하세요', '수요일, 점심 메뉴 미리 정해두면 기분 좋아요'],
    ['목요일, 내일이면 금요일이에요', '고비만 넘기면 주말이 보여요', '목요일 아침, 조금만 더 힘내요'],
    ['금요일이에요, 마무리 잘하고 즐겨요', '금요일 아침은 발걸음도 가볍죠', '오늘만 지나면 주말, 화이팅'],
    ['토요일에도 나서는 당신, 멋져요', '주말 이동, 오늘은 일찍 마치길', '토요일, 갈 길은 짧게 마음은 가볍게']
  ],
  eve: [
    ['일요일까지 수고했어요, 내일을 위해 일찍 쉬어요', '한 주 잘 마쳤어요', '일요일 저녁, 따뜻하게 마무리하세요'],
    ['월요일 무사히 끝, 푹 쉬세요', '한 주의 첫 고비 통과, 수고했어요', '월요일 퇴근, 저녁은 맛있는 걸로'],
    ['화요일도 클리어, 잘하고 있어요', '오늘 하루도 수고 많았어요', '화요일 저녁, 일찍 쉬어두면 내일이 편해요'],
    ['절반 왔어요, 남은 이틀도 가볍게', '수요일 퇴근, 고생 많았어요', '반환점 통과, 오늘은 좀 쉬세요'],
    ['내일만 버티면 금요일이에요', '목요일까지 달려온 당신, 대단해요', '오늘 저녁은 좋아하는 것 하나 하세요'],
    ['한 주 마무리, 즐거운 주말 보내세요', '금요일 퇴근, 안전하게 들어가세요', '금요일 퇴근길이 제일 가볍죠'],
    ['주말 근무까지 정말 수고했어요', '토요일까지 일한 당신, 내일은 푹 쉬어요', '오늘은 정말 고생 많았어요']
  ]
};

function cbStns() {
  if (typeof HOME_STNS !== 'undefined' && HOME_STNS) return HOME_STNS;
  try { if (typeof require === 'function') return require('./home-stations').HOME_STNS; } catch (e) {}
  return null;
}
function cbStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function cbNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function cbPlace(p) {                                              // 입력 다듬기
  if (!p || typeof p !== 'object') return null;
  var nm = cbStr(p.nm, 40).trim();
  if (!nm) return null;
  var la = cbNum(p.lat), ln = cbNum(p.lng);
  return { nm: nm, lat: la, lng: ln, bus: p.bus === true || p.bus === 1 };
}
// 예전 _cmFindStn: 이름(공백·'역' 뺀 것)이 같은 역 → 앞이 같은 역 → 들어 있는 역
function cbFindStn(nm) {
  var S = cbStns();
  if (!nm || !Array.isArray(S)) return null;
  var q = String(nm).replace(/\s+/g, '').replace(/역$/, ''), i, k;
  if (!q) return null;
  var plain = function (s) { return String(s[0]).replace(/\s+/g, ''); };
  for (i = 0; i < S.length; i++) if (S[i] && typeof S[i][0] === 'string' && plain(S[i]) === q) return { name: S[i][0], line: S[i][1] || '', lat: S[i][2], lng: S[i][3], bus: false };
  for (i = 0; i < S.length; i++) if (S[i] && typeof S[i][0] === 'string' && plain(S[i]).indexOf(q) === 0) return { name: S[i][0], line: S[i][1] || '', lat: S[i][2], lng: S[i][3], bus: false };
  for (i = 0; i < S.length; i++) if (S[i] && typeof S[i][0] === 'string' && plain(S[i]).indexOf(q) >= 0) return { name: S[i][0], line: S[i][1] || '', lat: S[i][2], lng: S[i][3], bus: false };
  return null;
}
// 예전 _cmResolvePlace: 지하철역이면 역 표에서, 버스·표에 없으면 저장 좌표로
function cbResolve(p) {
  if (!p || !p.nm) return null;
  if (!p.bus) { var s = cbFindStn(p.nm); if (s) return s; }
  if (p.lat != null && p.lng != null) return { name: p.nm, lat: p.lat, lng: p.lng, line: '', bus: !!p.bus };
  return cbFindStn(p.nm);
}
// 예전 _cmPair: 출근 = 출발→도착, 퇴근 = 따로 정한 곳(한쪽만 채우면 나머지는 출근의 반대편) 없으면 출근의 반대
function cbPair(kind, F, T, eF, eT) {
  if (kind === 'morn') return [F, T];
  if (eF || eT) return [eF || T, eT || F];
  return [T, F];
}
function cbHav(a1, o1, a2, o2) {
  var R = 6371000, dLa = (a2 - a1) * Math.PI / 180, dLo = (o2 - o1) * Math.PI / 180;
  var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function cbNearStn(la, ln) {                                       // 출발지가 없을 때 '내 주변' 역(3km 안)
  var S = cbStns(), best = null, bd = 3000, i, d;
  if (!Array.isArray(S)) return null;
  for (i = 0; i < S.length; i++) { if (!S[i] || typeof S[i][2] !== 'number') continue; d = cbHav(la, ln, S[i][2], S[i][3]); if (d < bd) { bd = d; best = { name: S[i][0], line: S[i][1] || '', lat: S[i][2], lng: S[i][3], bus: false }; } }
  return best;
}

function cbPlan(inp) {
  inp = (inp && typeof inp === 'object') ? inp : {};
  var kind = inp.kind === 'eve' ? 'eve' : 'morn';
  var pr = cbPair(kind, cbPlace(inp.from), cbPlace(inp.to), cbPlace(inp.eFrom), cbPlace(inp.eTo));
  var fromStn = cbResolve(pr[0]), toStn = cbResolve(pr[1]);
  var g = (inp.gps && typeof inp.gps === 'object') ? inp.gps : null;
  var gla = g ? cbNum(g.lat) : null, gln = g ? cbNum(g.lng) : null;
  var la = fromStn ? fromStn.lat : (gla != null ? gla : CB_DEF_LAT), ln = fromStn ? fromStn.lng : (gln != null ? gln : CB_DEF_LNG);
  return { kind: kind, from: pr[0], to: pr[1], fromStn: fromStn, toStn: toStn, la: la, ln: ln };
}

function cbKst(ms) { var d = new Date(Number(ms) + 9 * 3600000); return { y: d.getUTCFullYear(), dow: d.getUTCDay(), h: d.getUTCHours(), yday: Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) }; }
function cbClosing(kind, nowMs) {
  var k = cbKst(nowMs), pool = CB_CLOSING[kind][k.dow] || [];
  if (!pool.length) return kind === 'morn' ? '좋은 하루 되세요' : '편안한 저녁 되세요';
  return pool[Math.floor(k.yday / 7) % pool.length];             // 연중 주차 번호 → 매주 다른 멘트
}
function cbFx(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function cbWx(w) {
  if (!w || typeof w !== 'object' || typeof w.temp !== 'number') return null;
  return { temp: w.temp, feel: cbFx(w.feel), hum: cbFx(w.hum), tmin: cbFx(w.tmin), tmax: cbFx(w.tmax), rain: cbFx(w.rain) || 0, uv: cbFx(w.uv), wind: cbFx(w.wind), txt: cbStr(w.txt, 12) };
}
function cbCongFn() { return (typeof congPctSub === 'function') ? congPctSub : (function () { try { return require('./cong').congPctSub; } catch (e) { return null; } })(); }
function cbCongPct(stn, line, h, wk) {
  var f = cbCongFn();
  if (!f) return 50;
  try { return f({ stn: stn, line: line, ld: 0, live: null, wk: wk }, h); } catch (e) { return 50; }
}

function cbCompose(plan, ctx, wF0, wT0) {
  ctx = (ctx && typeof ctx === 'object') ? ctx : {};
  var nowMs = Number(ctx.nowMs) || 0, isMorn = plan.kind === 'morn', fromStn = plan.fromStn, toStn = plan.toStn;
  var wF = cbWx(wF0), wT = cbWx(wT0), k = cbKst(nowMs), h = k.h;
  var peak = (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
  var near = fromStn ? null : cbNearStn(plan.la, plan.ln);
  var stnObj = fromStn || near;
  var stnNm = stnObj ? stnObj.name : '내 주변';
  var wk = k.dow === 0 || k.dow === 6;
  var pct = cbCongPct(stnNm, stnObj ? stnObj.line : '', h, wk);
  var congTxt = pct < 40 ? '여유' : pct < 65 ? '보통' : '혼잡';
  var lines = [];
  if (fromStn && toStn) lines.push(fromStn.name + ' → ' + toStn.name);
  if (wF) {
    var wl = (fromStn ? fromStn.name + ' ' : '') + wF.temp + '° ' + wF.txt;
    if (wF.feel != null && Math.abs(wF.feel - wF.temp) >= 2) wl += ' · 체감 ' + wF.feel + '°';
    if (wF.hum != null) wl += ' · 습도 ' + wF.hum + '%';
    lines.push(wl.replace(/\s+$/, ''));
    if (wF.tmax != null && wF.tmin != null) lines.push('오늘 ' + wF.tmin + '°~' + wF.tmax + '°' + (wF.rain > 0 ? ' · 강수 ' + wF.rain + '%' : ''));
    else if (wF.rain >= 20) lines.push('강수확률 ' + wF.rain + '%');
  }
  if (wT && wF && toStn && (Math.abs(wT.temp - wF.temp) >= 2 || Math.abs((wT.rain || 0) - (wF.rain || 0)) >= 20 || wT.txt !== wF.txt)) {
    lines.push((toStn.name + ' ' + wT.temp + '° ' + wT.txt + (wT.rain >= 40 ? ' · 강수 ' + wT.rain + '%' : '')).replace(/\s+$/, ''));
  }
  if (!(fromStn && fromStn.bus)) lines.push(stnNm + ' 혼잡도 ' + pct + '% (' + congTxt + ')');
  var recs = [];
  if (wF) {
    if (wF.rain >= 40) recs.push('우산 꼭 챙기세요');
    else if (wF.rain >= 20) recs.push('접이식 우산 있으면 안심이에요');
    var ft = wF.feel != null ? wF.feel : wF.temp;
    if (ft >= 33) recs.push('무더위예요, 시원한 옷차림에 수분 챙기세요');
    else if (ft >= 28) recs.push('더워요, 시원한 옷차림 추천');
    else if (ft <= 0) recs.push('강추위예요, 목도리·장갑 필수');
    else if (ft <= 5) recs.push('추워요, 두꺼운 외투 입으세요');
    else if (ft <= 11) recs.push('쌀쌀해요, 겉옷 챙기세요');
    if (isMorn && wF.tmax != null && wF.tmin != null && (wF.tmax - wF.tmin) >= 10) recs.push('일교차 ' + (wF.tmax - wF.tmin) + '°, 겉옷 하나 챙기면 좋아요');
    if (wF.hum != null && wF.hum >= 80 && wF.temp >= 24) recs.push('습도 높아 후텁지근해요');
    if (isMorn && wF.uv != null && wF.uv >= 8) recs.push('자외선 강해요, 선크림 잊지 마세요');
    if (wF.wind != null && wF.wind >= 30) recs.push('바람 강해요, 우산·모자 주의');
  }
  if (peak) recs.push(isMorn ? '피크 시간이에요, 5분만 일찍 나서면 여유로워요' : '퇴근 피크예요, 한 정거장 늦은 열차가 한산할 수 있어요');
  recs.slice(0, 3).forEach(function (r) { lines.push('· ' + r); });
  lines.push(cbClosing(plan.kind, nowMs));
  var title = (isMorn ? '출근길 브리핑' : '퇴근길 브리핑') + (fromStn && toStn ? ' · ' + fromStn.name + '→' + toStn.name : '');
  var route = (fromStn && toStn) ? { from: { name: fromStn.name, lat: fromStn.lat, lng: fromStn.lng, bus: !!fromStn.bus }, to: { name: toStn.name, lat: toStn.lat, lng: toStn.lng, bus: !!toStn.bus } } : null;
  return { v: CB_V, title: title, body: lines.join('\n'), route: route };
}
function cbBrief(inp, wF, wT) {
  var plan = cbPlan(inp);
  return cbCompose(plan, { nowMs: inp && inp.nowMs }, wF, wT);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { cbPlan: cbPlan, cbCompose: cbCompose, cbBrief: cbBrief, cbFindStn: cbFindStn, cbResolve: cbResolve, cbPair: cbPair, cbClosing: cbClosing, CB_V: CB_V, CB_CLOSING: CB_CLOSING };
