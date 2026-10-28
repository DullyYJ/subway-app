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
// s286 (YJ: "출퇴근 응원문구를 날씨 · 요일에 따라 매일 다르게 — 서버가 매달 다른 문구를 만들어 두고 앱은 알림 때마다 가져온다"): 문구를 통째로 외워 두지 않고 조각을 맞춰 만든다.
//   한 달 치(cbCheerMonth): 달 풍경(12달 × 3) + 소원(14개, 달 씨앗으로 순서가 섞인다) → 날짜마다 한 줄 꼬리. 같은 달 안에서 겹치지 않고, 달마다(그리고 해마다) 다르다. 서버는 달이 바뀔 때 cron 으로 만들어 KV 에 두고(cheerCron), 없으면 그 자리에서 만든다(같은 결과).
//   하루 치(cbClosing): [날씨 머리말(출발지 실시간) + 요일 + 아침/저녁, 요일 응원(주마다 번갈아)] + 그날의 꼬리. 출근=힘찬 응원 · 퇴근=수고 · 위로.
var CB_IMG = {'morn': [['차가운 1월 아침 공기처럼', '새해의 맑은 새벽처럼', '눈 덮인 겨울 아침처럼'], ['입춘을 앞둔 2월 아침처럼', '겨울 끝자락의 맑은 공기처럼', '봄이 가까워지는 2월 햇살처럼'], ['새싹 돋는 3월 아침처럼', '봄을 알리는 3월 햇살처럼', '꽃샘바람 지나는 3월 아침처럼'], ['벚꽃 날리는 4월 아침처럼', '봄꽃 가득한 4월 햇살처럼', '연둣빛 4월 아침처럼'], ['푸르른 5월 아침처럼', '싱그러운 5월 햇살처럼', '초록이 짙어가는 5월 아침처럼'], ['초여름 6월 아침처럼', '눈부신 6월 햇살처럼', '푸른 6월 아침 공기처럼'], ['뜨거운 7월 햇살처럼', '한여름 7월 아침처럼', '7월의 시원한 아침 바람처럼'], ['쨍한 8월 햇살처럼', '한여름 8월 아침처럼', '8월의 푸른 하늘처럼'], ['높아진 9월 하늘처럼', '선선해진 9월 아침처럼', '가을 문턱 9월 햇살처럼'], ['선선한 10월 아침 공기처럼', '단풍 물든 10월 아침처럼', '청명한 10월 하늘처럼'], ['단풍 지는 11월 아침처럼', '늦가을 11월 햇살처럼', '바스락거리는 11월 아침처럼'], ['한 해의 끝 12월 아침처럼', '반짝이는 12월 아침처럼', '연말 12월의 맑은 공기처럼']], 'eve': [['고요한 1월 저녁처럼', '따뜻한 겨울 저녁 불빛처럼', '눈 내리는 1월 밤처럼'], ['2월의 포근한 저녁처럼', '겨울 끝자락의 저녁노을처럼', '봄이 오는 2월 밤처럼'], ['3월의 따스한 저녁 바람처럼', '봄밤 3월의 노을처럼', '새싹 깃든 3월 저녁처럼'], ['벚꽃 흩날리는 4월 저녁처럼', '4월 봄밤의 노을처럼', '꽃향기 번지는 4월 밤처럼'], ['5월의 싱그러운 저녁 바람처럼', '초록빛 5월 노을처럼', '5월의 포근한 밤공기처럼'], ['6월의 긴 저녁노을처럼', '초여름 6월 밤바람처럼', '6월 저녁의 푸른 하늘처럼'], ['7월의 시원한 저녁 바람처럼', '한여름 7월 밤처럼', '7월의 붉은 노을처럼'], ['8월의 선선한 밤바람처럼', '한여름 8월 노을처럼', '8월 저녁의 느긋한 공기처럼'], ['9월의 선선한 저녁 바람처럼', '높고 깊은 9월 밤하늘처럼', '가을 문턱 9월 노을처럼'], ['10월의 노을 진 저녁처럼', '단풍빛 10월 저녁처럼', '가을밤 10월 바람처럼'], ['11월의 고요한 저녁처럼', '늦가을 11월 노을처럼', '11월 밤의 따뜻한 불빛처럼'], ['12월의 반짝이는 저녁처럼', '한 해를 닫는 12월 밤처럼', '12월의 포근한 불빛처럼']]};
var CB_WISH = {'morn': ['오늘도 가벼운 걸음으로 출발해요', '당신의 하루가 환하게 열리길 응원해요', '오늘 하루도 당당하게 해내요', '좋은 일이 가득한 하루 되세요', '힘찬 첫걸음, 오늘도 응원할게요', '오늘의 도전이 멋진 결과로 돌아오길 바라요', '한 걸음씩 차근차근, 오늘도 잘될 거예요', '기운 내서 오늘도 파이팅이에요', '당신이라면 오늘도 충분히 해낼 수 있어요', '활짝 웃으며 하루를 시작해요', '오늘도 당신의 노력이 빛나는 하루예요', '가슴 펴고 씩씩하게 나서요', '좋은 에너지 가득 채우고 출발해요', '오늘 만나는 모든 순간이 응원이 되길 바라요'], 'eve': ['오늘도 정말 고생 많았어요', '무거운 하루는 여기서 내려놓아요', '수고한 당신, 이제 푹 쉬어요', '오늘 하루도 잘 버텨 줘서 고마워요', '애쓴 만큼 오늘 밤은 편안하길 바라요', '힘든 하루였어도 괜찮아요, 충분히 잘했어요', '집에 가는 길만큼은 마음 편히 쉬어가요', '오늘의 수고가 따뜻한 쉼으로 돌아오길 바라요', '고단함은 털어내고 포근한 저녁 보내요', '당신의 하루를 토닥토닥 위로해요', '오늘도 해낸 당신이 참 대단해요', '돌아가는 길, 좋아하는 것 하나로 마음을 채워요', '수고 많았어요, 오늘 밤은 푹 자요', '당신은 오늘도 충분히 잘했어요']};
var CB_DOW = {'morn': [['쉬는 날에도 일하는 당신을 응원해요', '주말 출근길도 힘차게 가요'], ['새로운 한 주를 힘차게 열어요', '한 주의 시작, 가장 멋진 출발이에요'], ['한 주의 리듬이 붙는 날이에요', '어제보다 한 걸음 더 힘차게 가요'], ['한 주의 정중앙, 힘내서 달려요', '반환점을 돌아요, 기운 내요'], ['주말이 한 발 더 가까워졌어요', '조금만 더, 오늘도 힘차게 가요'], ['마지막까지 힘내요, 주말이 코앞이에요', '금요일이에요, 오늘만 힘차게 가요'], ['주말에도 나선 당신을 응원해요', '토요일 출근길, 가볍게 출발해요']], 'eve': [['주말에도 애쓴 당신, 푹 쉬어요', '내일을 위해 마음 편히 쉬어요'], ['한 주의 첫날을 잘 버텼어요', '월요일을 무사히 넘긴 당신이 대단해요'], ['화요일도 고생 많았어요', '벌써 한 주의 한 고비를 넘겼어요'], ['한 주의 반을 지나왔어요, 수고했어요', '잠깐 숨 돌려도 괜찮아요'], ['내일이 금요일이에요, 조금만 더 힘내요', '여기까지 오느라 정말 수고했어요'], ['한 주 동안 정말 고생 많았어요', '푹 쉬고 마음껏 즐겨요'], ['주말에도 일한 당신, 정말 고생했어요', '오늘은 편히 쉬어요']]};
var CB_DOWNM = ['일', '월', '화', '수', '목', '금', '토'];

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
function cbCheerMonth(nowMs) {                                    // 한 달 치 꼬리 — { ym:'2026-10', morn:[31], eve:[31] } (날짜 1~31 순서). 순수 계산: 같은 달이면 늘 같은 결과.
  var d = new Date((Number(nowMs) || 0) + 9 * 3600000), y = d.getUTCFullYear(), mo = d.getUTCMonth(), seed = y * 12 + mo, out = { ym: y + '-' + (mo < 9 ? '0' : '') + (mo + 1), morn: [], eve: [] };
  ['morn', 'eve'].forEach(function (kd) {
    var W = CB_WISH[kd], n = W.length, perm = [], x = seed * 2654435761 % 4294967296, i, j, t;
    for (i = 0; i < n; i++) perm.push(i);
    for (i = n - 1; i > 0; i--) { x = (x * 1664525 + 1013904223) % 4294967296; j = x % (i + 1); t = perm[i]; perm[i] = perm[j]; perm[j] = t; }        // 달 씨앗으로 소원 순서를 섞는다(Fisher–Yates)
    for (var k = 0; k < 31; k++) out[kd].push(CB_IMG[kd][mo][(k % n + Math.floor(k / n)) % 3] + ' ' + W[perm[k % n]] + '.');      // (소원, 풍경) 짝이 31일 동안 겹치지 않는다
  });
  return out;
}
function cbCheerValidate(o) {                                     // s286: 서버 AI(Gemini)가 쓴 한 달 치 검사 — { morn:[…], eve:[…] } 각 31개 이상 · 한 줄 6~60자 · 서로 다름 · 이모지·줄바꿈 없음. 하나라도 어긋나면 null(조각 조합으로 대신한다).
  if (!o || typeof o !== 'object') return null;
  var out = {};
  for (var q = 0; q < 2; q++) {
    var kd = q ? 'eve' : 'morn', a = o[kd], seen = {}, r = [];
    if (!Array.isArray(a) || a.length < 31) return null;
    for (var i = 0; i < 31; i++) {
      var t = typeof a[i] === 'string' ? a[i].replace(/\s+/g, ' ').trim() : '';
      if (t.length < 6 || t.length > 60 || seen[t] || /[\ud800-\udfff\u2600-\u27bf]/.test(t)) return null;
      seen[t] = 1; r.push(/[.!?요]$/.test(t) ? t : t + '.');
    }
    out[kd] = r;
  }
  return out;
}
function cbCheerWx(w) {                                           // 날씨 머리말 — 눈 > 비 > 무더위 > 추위 > 바람 > 맑음 > 흐림 순으로 하나
  if (!w) return '';
  var t = w.txt || '', f = w.feel != null ? w.feel : w.temp;
  if (/눈/.test(t)) return '눈 내리는 ';
  if (/비|소나기|뇌우/.test(t) || w.rain >= 60) return '비 오는 ';
  if (f >= 30) return '무더운 ';
  if (f <= 0) return '추운 ';
  if (w.wind != null && w.wind >= 30) return '바람 부는 ';
  if (/맑/.test(t)) return '맑은 ';
  if (/흐|구름|안개/.test(t)) return '흐린 ';
  return '';
}
function cbClosing(kind, nowMs, wx, month) {                      // month: 서버가 만들어 둔 그 달 치(cbCheerMonth 결과) — 없거나 달이 다르면 그 자리에서 만든다
  var kd = kind === 'eve' ? 'eve' : 'morn', ms = Number(nowMs) || 0, day = Math.floor((ms + 9 * 3600000) / 86400000);
  var d = new Date(ms + 9 * 3600000), dom = d.getUTCDate(), dow = d.getUTCDay();
  var ym = d.getUTCFullYear() + '-' + (d.getUTCMonth() < 9 ? '0' : '') + (d.getUTCMonth() + 1);
  if (!month || month.ym !== ym || !month[kd] || month[kd].length < 31) month = cbCheerMonth(ms);
  var wy = CB_DOW[kd][dow][Math.floor(day / 7) % 2];
  return cbCheerWx(wx) + CB_DOWNM[dow] + '요일 ' + (kd === 'eve' ? '저녁' : '아침') + ', ' + wy + '. ' + month[kd][dom - 1];
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
  lines.push(cbClosing(plan.kind, nowMs, wF, ctx.cheer));
  var title = (isMorn ? '출근길 브리핑' : '퇴근길 브리핑') + (fromStn && toStn ? ' · ' + fromStn.name + '→' + toStn.name : '');
  var route = (fromStn && toStn) ? { from: { name: fromStn.name, lat: fromStn.lat, lng: fromStn.lng, bus: !!fromStn.bus }, to: { name: toStn.name, lat: toStn.lat, lng: toStn.lng, bus: !!toStn.bus } } : null;
  return { v: CB_V, kind: plan.kind, title: title, body: lines.join('\n'), route: route };
}
function cbBrief(inp, wF, wT) {
  var plan = cbPlan(inp);
  return cbCompose(plan, { nowMs: inp && inp.nowMs }, wF, wT);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { cbPlan: cbPlan, cbCompose: cbCompose, cbBrief: cbBrief, cbFindStn: cbFindStn, cbResolve: cbResolve, cbPair: cbPair, cbClosing: cbClosing, cbCheerMonth: cbCheerMonth, cbCheerValidate: cbCheerValidate, CB_V: CB_V, CB_IMG: CB_IMG, CB_WISH: CB_WISH, CB_DOW: CB_DOW };
