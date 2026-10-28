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
// s285 (YJ: "매일 출퇴근길 응원 문구를 다 다르게 — 출근길은 힘찬 하루를 응원하는 문장, 퇴근길은 고생한 사용자에게 위로가 되는 말"): 출근 63개(힘찬 응원) · 퇴근 63개(위로)를 날짜 번호로 돌려 쓴다 — 63일 동안 같은 문장이 없다.
var CB_CHEER = {
  morn: [
    '오늘도 힘차게 시작해요, 당신이라면 해낼 수 있어요',
    '좋은 아침이에요, 오늘 하루도 힘껏 응원할게요',
    '씩씩하게 출발해요, 오늘은 좋은 일이 생길 거예요',
    '오늘의 당신은 어제보다 한 걸음 더 멋져요',
    '힘찬 발걸음으로 하루를 열어 볼까요',
    '오늘 하루도 당신 편이에요, 자신 있게 나서요',
    '아침 공기처럼 상쾌한 하루가 되길 바라요',
    '해야 할 일은 하나씩, 오늘도 거뜬히 해낼 거예요',
    '당신의 노력은 오늘도 빛날 거예요',
    '가슴 펴고 출발해요, 오늘의 주인공은 당신이에요',
    '오늘도 멋지게 해내는 당신을 응원해요',
    '힘내요, 오늘 하루가 당신에게 선물이 될 거예요',
    '기분 좋게 시작하면 하루가 달라져요, 파이팅',
    '오늘도 한 번 크게 웃고 출발해요',
    '당신이 가는 길마다 좋은 일이 따라올 거예요',
    '오늘 목표는 하나, 기분 좋게 해내기예요',
    '용기를 내요, 오늘도 당신은 충분히 잘하고 있어요',
    '새로운 하루, 새로운 기회가 기다리고 있어요',
    '오늘도 당당하게, 당신의 하루를 응원합니다',
    '지금 이 발걸음이 오늘의 성과를 만들어요',
    '좋은 일이 가득한 하루가 되길 진심으로 바라요',
    '오늘은 더 잘 풀릴 거예요, 믿고 출발해요',
    '에너지 가득 채우고 씩씩하게 나가 볼까요',
    '오늘 하루도 반짝반짝 빛나길 응원해요',
    '어려운 일도 오늘은 술술 풀릴 거예요',
    '힘차게 한 걸음, 오늘도 멋진 하루 되세요',
    '당신의 오늘이 어제보다 더 환하길 바라요',
    '시작이 좋으면 끝도 좋아요, 활기차게 출발해요',
    '오늘도 당신답게, 자신감 있게 나아가요',
    '아침부터 응원 보내요, 오늘도 화이팅이에요',
    '오늘 하루, 하고 싶은 일 하나는 꼭 해내요',
    '당신은 오늘도 잘 해낼 사람이에요',
    '큰 숨 한 번 쉬고, 힘차게 문을 나서요',
    '오늘의 도전이 내일의 자신감이 될 거예요',
    '기운 내요, 오늘도 당신 곁에서 응원할게요',
    '좋은 하루의 시작은 바로 지금이에요',
    '오늘은 뭐든 해낼 수 있을 것 같은 날이에요',
    '활짝 웃으며 출발해요, 행운이 따라올 거예요',
    '오늘도 최선을 다하는 당신이 참 멋져요',
    '한 걸음씩 꾸준히, 오늘도 앞으로 나아가요',
    '좋은 에너지를 가득 안고 하루를 시작해요',
    '오늘 만나는 모든 순간이 즐거웠으면 해요',
    '힘 있게 시작해요, 오늘의 당신은 든든해요',
    '오늘도 해냈다는 말로 하루를 마무리하길 바라요',
    '기분 좋은 소식이 오늘 당신을 찾아올 거예요',
    '당신의 하루가 따뜻한 성취로 채워지길 바라요',
    '출발이 가벼우면 하루도 가벼워요, 힘내요',
    '오늘도 자신을 믿고 힘차게 걸어가요',
    '작은 일에도 웃을 수 있는 하루가 되길 바라요',
    '오늘 하루도 당신이 주인공이에요, 멋지게 시작해요',
    '어제의 피로는 훌훌 털고 새 마음으로 출발해요',
    '오늘도 힘내서 가요, 당신의 열정을 응원해요',
    '하루의 시작을 응원해요, 오늘도 빛나는 하루예요',
    '오늘은 분명 좋은 일이 있을 거예요, 기대하고 가요',
    '끝까지 해내는 당신, 오늘도 믿고 응원해요',
    '상쾌하게 출발하고 당당하게 마무리해요',
    '오늘의 한 걸음이 큰 변화를 만들 거예요',
    '활기찬 하루 되세요, 당신은 늘 잘해 왔어요',
    '오늘도 멋진 하루를 만들어 가는 당신을 응원해요',
    '힘찬 응원 가득 담아 보내요, 오늘도 파이팅',
    '지금 시작하는 하루가 가장 좋은 하루가 될 거예요',
    '오늘도 당신의 열정이 모두를 환하게 할 거예요',
    '좋은 기운 가득 받아 가세요, 오늘 하루 화이팅'
  ],
  eve: [
    '오늘 하루도 정말 고생 많았어요, 이제 푹 쉬어요',
    '애쓴 당신, 오늘은 충분히 잘했어요',
    '수고했어요, 집에 가면 따뜻하게 쉬세요',
    '오늘도 버텨 낸 당신이 참 대단해요',
    '힘든 하루였죠, 이제 마음 편히 내려놓아요',
    '고생한 만큼 포근한 저녁이 되길 바라요',
    '오늘 하루도 열심히 살아낸 당신께 박수를 보내요',
    '무거웠던 마음은 여기에 두고 가볍게 가요',
    '오늘의 수고, 누군가는 꼭 알아주고 있어요',
    '지친 하루 끝에 따뜻한 위로가 닿길 바라요',
    '정말 수고 많았어요, 오늘은 일찍 쉬어도 괜찮아요',
    '당신이 있어 오늘도 무사히 지나갔어요',
    '오늘도 잘 해냈어요, 스스로를 칭찬해 주세요',
    '힘든 일은 오늘로 끝, 편안한 밤 보내세요',
    '고단했던 어깨를 이제 잠시 내려놓아요',
    '오늘도 애쓰느라 얼마나 힘들었을까요, 수고했어요',
    '맛있는 저녁과 따뜻한 쉼이 기다리고 있어요',
    '오늘은 아무 생각 말고 푹 쉬어 가요',
    '당신의 하루가 헛되지 않았어요, 정말 수고했어요',
    '고생 끝에 오는 저녁, 온전히 당신 것이에요',
    '오늘도 최선을 다한 당신, 이제 쉬어도 돼요',
    '힘겨운 순간도 잘 넘겼어요, 대견해요',
    '집으로 가는 길이 포근하길 바라요',
    '오늘의 피로는 따뜻한 물에 훌훌 풀어 보내요',
    '수고한 나에게 작은 선물 하나 어때요',
    '괜찮아요, 오늘 못 한 일은 내일의 몫으로 남겨 둬요',
    '애쓴 마음 다 알아요, 오늘 밤은 편히 주무세요',
    '오늘도 꿋꿋이 버텨 줘서 고마워요',
    '하루치 고단함은 이제 여기까지, 쉬어 가요',
    '당신은 오늘도 충분히 훌륭했어요',
    '고생했어요, 따뜻한 저녁 한 끼 꼭 챙기세요',
    '힘든 하루 끝에 웃을 일이 하나쯤 생기길 바라요',
    '오늘도 열심히 달려온 당신, 푹 쉴 자격 있어요',
    '지친 마음이 저녁 바람에 조금은 가벼워지길 바라요',
    '수고 많았어요, 이제 온전히 당신만의 시간이에요',
    '오늘의 노력은 반드시 당신을 빛나게 할 거예요',
    '오늘도 무사히 마친 것만으로 충분히 잘한 거예요',
    '퇴근길만큼은 마음 편히, 천천히 걸어가요',
    '고생한 당신에게 포근한 휴식이 찾아가길 바라요',
    '애썼어요, 오늘 하루도 정말 수고했어요',
    '가장 힘든 순간을 지나왔어요, 이제 쉬어도 돼요',
    '당신의 하루에 따뜻한 위로를 보내요',
    '오늘의 걱정은 잠시 접어 두고 푹 쉬어 가요',
    '열심히 한 당신, 오늘은 스스로에게 다정해져요',
    '힘들었던 하루, 이 길 끝에는 편안한 집이 있어요',
    '수고했어요, 오늘 밤은 꿈도 달콤하길 바라요',
    '오늘도 해냈네요, 정말 자랑스러워요',
    '몸도 마음도 지친 날, 이제 천천히 풀어 봐요',
    '당신 덕분에 오늘도 누군가는 웃었을 거예요',
    '오늘의 수고에 마음 깊이 고마움을 전해요',
    '이제 일은 잊고 쉬어요, 충분히 애썼어요',
    '하루 종일 고생한 어깨에 따뜻한 위로를 보내요',
    '힘든 날도 지나가요, 오늘은 편히 쉬어요',
    '오늘 하루도 잘 견뎌 냈어요, 정말 대단해요',
    '집에 도착하면 가장 편한 모습으로 쉬어요',
    '고된 하루 끝, 좋아하는 일 하나로 마무리해요',
    '수고한 당신을 위해 저녁 노을이 예쁘게 물들었어요',
    '오늘도 열심히 산 당신, 따뜻한 밤 되세요',
    '쉬어도 괜찮아요, 당신은 이미 충분히 잘하고 있어요',
    '애쓴 하루를 토닥토닥, 오늘도 수고 많았어요',
    '힘들었던 만큼 오늘 밤은 깊이 잠들길 바라요',
    '오늘도 포기하지 않고 걸어온 당신을 응원해요',
    '수고했어요, 내일은 오늘보다 조금 더 가벼울 거예요'
  ]
};
var CB_CLOSING = CB_CHEER;

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
function cbFindStn(nm, la0, ln0) {
  var S = cbStns();
  if (!nm || !Array.isArray(S)) return null;
  var q = String(nm).replace(/\s+/g, '').replace(/역$/, ''), i, k;
  if (!q) return null;
  var plain = function (s) { return String(s[0]).replace(/\s+/g, ''); };
  var ex = null, exd = 1e12;                                        // s208: 이름이 같은 역이 여러 권역에 있으면(중동 등) 저장된 좌표에 가장 가까운 역 — 좌표가 없으면 처음 만난 역(예전 그대로)
  for (i = 0; i < S.length; i++) {
    if (!(S[i] && typeof S[i][0] === 'string' && plain(S[i]) === q)) continue;
    var dx = (la0 != null && ln0 != null) ? cbHav(la0, ln0, S[i][2], S[i][3]) : 0;
    if (!ex || dx < exd) { ex = S[i]; exd = dx; }
    if (la0 == null || ln0 == null) break;
  }
  if (ex) return { name: ex[0], line: ex[1] || '', lat: ex[2], lng: ex[3], bus: false };
  for (i = 0; i < S.length; i++) if (S[i] && typeof S[i][0] === 'string' && plain(S[i]).indexOf(q) === 0) return { name: S[i][0], line: S[i][1] || '', lat: S[i][2], lng: S[i][3], bus: false };
  for (i = 0; i < S.length; i++) if (S[i] && typeof S[i][0] === 'string' && plain(S[i]).indexOf(q) >= 0) return { name: S[i][0], line: S[i][1] || '', lat: S[i][2], lng: S[i][3], bus: false };
  return null;
}
// 예전 _cmResolvePlace: 지하철역이면 역 표에서, 버스·표에 없으면 저장 좌표로
function cbResolve(p) {
  if (!p || !p.nm) return null;
  if (!p.bus) { var s = cbFindStn(p.nm, p.lat, p.lng); if (s) return s; }
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
  var kind = inp.kind === 'eve' ? 'eve' : (inp.kind === 'auto' ? (cbKst(inp.nowMs).h < 15 ? 'morn' : 'eve') : 'morn');      // 'auto' = 한국 시각 오후 3시 전이면 출근, 아니면 퇴근 브리핑(지금 미리보기 — 앱은 판단하지 않는다, s207)
  var pr = cbPair(kind, cbPlace(inp.from), cbPlace(inp.to), cbPlace(inp.eFrom), cbPlace(inp.eTo));
  var fromStn = cbResolve(pr[0]), toStn = cbResolve(pr[1]);
  var g = (inp.gps && typeof inp.gps === 'object') ? inp.gps : null;
  var gla = g ? cbNum(g.lat) : null, gln = g ? cbNum(g.lng) : null;
  var la = fromStn ? fromStn.lat : (gla != null ? gla : CB_DEF_LAT), ln = fromStn ? fromStn.lng : (gln != null ? gln : CB_DEF_LNG);
  return { kind: kind, from: pr[0], to: pr[1], fromStn: fromStn, toStn: toStn, la: la, ln: ln };
}

function cbKst(ms) { var d = new Date(Number(ms) + 9 * 3600000); return { y: d.getUTCFullYear(), dow: d.getUTCDay(), h: d.getUTCHours(), yday: Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) }; }
function cbClosing(kind, nowMs) {
  var pool = CB_CHEER[kind === 'eve' ? 'eve' : 'morn'], day = Math.floor((Number(nowMs) + 9 * 3600000) / 86400000);      // 한국 날짜 번호 — 하루에 한 문장, 날마다 다르다
  return pool[((day % pool.length) + pool.length) % pool.length];
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
  var eta = ctx.eta;                                                // s285 (YJ: 경로 예상 시간 · 도착시각): 워커가 경로 탐색으로 구한 가장 빠른 경로의 소요(분) · 환승 횟수 — 도착시각은 지금(알림 시각)에 소요를 더한 한국 시각
  if (eta && typeof eta.min === 'number' && isFinite(eta.min) && eta.min > 0 && nowMs) {
    var am = Math.round(eta.min), ad = new Date(nowMs + am * 60000 + 9 * 3600000), ah = ad.getUTCHours(), amin = ad.getUTCMinutes();
    lines.push('예상 ' + (am >= 60 ? Math.floor(am / 60) + '시간' + (am % 60 ? ' ' + am % 60 + '분' : '') : am + '분') + ' 소요 · ' + (ah < 10 ? '0' : '') + ah + ':' + (amin < 10 ? '0' : '') + amin + '경 도착' + (typeof eta.xfer === 'number' ? (eta.xfer > 0 ? ' · 환승 ' + eta.xfer + '회' : ' · 환승 없음') : ''));
  }
  if (wF) {
    var wl = (fromStn ? fromStn.name + ' ' : '') + wF.temp + '° ' + wF.txt;
    if (wF.feel != null && Math.abs(wF.feel - wF.temp) >= 2) wl += ' · 체감 ' + wF.feel + '°';
    if (wF.hum != null) wl += ' · 습도 ' + wF.hum + '%';
    lines.push(wl.replace(/\s+$/, ''));
  }
  if (wT && toStn) {                                                // s281: 도착지 날씨는 출발지와 비슷해도 늘 보인다(YJ: 출발지·도착지 날씨)
    var tl = toStn.name + ' ' + wT.temp + '° ' + wT.txt;
    if (wT.feel != null && Math.abs(wT.feel - wT.temp) >= 2) tl += ' · 체감 ' + wT.feel + '°';
    if (wT.rain >= 20) tl += ' · 강수 ' + wT.rain + '%';
    lines.push(tl.replace(/\s+$/, ''));
  }
  if (!(fromStn && fromStn.bus)) lines.push(stnNm + ' 혼잡도 ' + pct + '% (' + congTxt + ')');
  var recs = [];
  if (wF) {
    var rainX = Math.max(wF.rain || 0, wT ? (wT.rain || 0) : 0);                 // 옷차림 · 우산은 출발지와 도착지 중 나쁜 쪽에 맞춘다
    var ft = wF.feel != null ? wF.feel : wF.temp, ftT = wT ? (wT.feel != null ? wT.feel : wT.temp) : ft;
    var ftHi = Math.max(ft, ftT), ftLo = Math.min(ft, ftT);
    if (rainX >= 40) recs.push('우산 꼭 챙기세요');
    else if (rainX >= 20) recs.push('접이식 우산 있으면 안심이에요');
    if (ftHi >= 33) recs.push('무더위예요, 시원한 옷차림에 수분 챙기세요');
    else if (ftHi >= 28) recs.push('더워요, 시원한 옷차림 추천');
    else if (ftLo <= 0) recs.push('강추위예요, 목도리·장갑 필수');
    else if (ftLo <= 5) recs.push('추워요, 두꺼운 외투 입으세요');
    else if (ftLo <= 11) recs.push('쌀쌀해요, 겉옷 챙기세요');
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
  return { v: CB_V, kind: plan.kind, title: title, body: lines.join('\n'), route: route };
}
function cbBrief(inp, wF, wT) {
  var plan = cbPlan(inp);
  return cbCompose(plan, { nowMs: inp && inp.nowMs }, wF, wT);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { cbPlan: cbPlan, cbCompose: cbCompose, cbBrief: cbBrief, cbFindStn: cbFindStn, cbResolve: cbResolve, cbPair: cbPair, cbClosing: cbClosing, CB_V: CB_V, CB_CLOSING: CB_CLOSING, CB_CHEER: CB_CHEER };
