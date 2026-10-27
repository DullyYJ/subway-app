// 길동무 — 장면 엔진(혼잡도 카드 창의 3D 캐릭터 장면) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."
//   어떤 장면(idle·wait·ride·alight·없음=지하철 혼잡도)을 보일지 · 혼잡도 카드가 어느 구간(지하철 역·버스 정류장 목록)을 보일지 · 시간대·날씨 종류·계절 ·
//   대표 캐릭터·등장 순서 · 안내 문구는 전부 여기서 정한다. 앱(www/index.html)은 엔진이 준 값을 그리기만 한다.
// 입력  sceneDecide({ nowMs, tzOffsetMin, locked, routeShown, key, here, boarded, nodes:[{name,isSub,isBus,isWalk,isOrigin,lineName,hasLoc}] }, wx|null)
//        wx = { temp, rain, txt } (Worker 가 subway-api /weather 에서 받는다. 못 받으면 null — 날씨를 지어내지 않는다)
// 출력  { ok, fill(idle 이고 경로 결과가 아직 없으면 true), mode:'idle'|'wait'|'ride'|'alight'|null, nearEnd, hint, tag, look:{slot,slotKo,wk,wxKo,wxKnown,temp,season,night,lit,hidesSun,emo}, hero, cast[], traits{id:{land,acts[]}},
//         venue:'bus'|'sub'|'street', line(짧은 노선 이름), cong:{ kind:'sub'|null, idx, sig } }   ★ 혼잡도(cong)는 지하철 탑승 확정 뒤(mode:null)에만
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var SCENE_CHARS = ["dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng"];
// ★ 캐릭터 특성(YJ 2026-10-16): 어떤 동작을 어떤 순서로 하는지 · 잡았다 놓았을 때 어떤 연출을 하는지는 엔진이 정한다. 앱은 이 이름대로 그리기만 한다.
//   land: cotton(솜사탕처럼 부풀어 안전 착륙+하트) | pose(두 발 착지 멋진 포즈+씨익 웃음) | dig(땅속으로 숨었다 2초 뒤 나와 화냄) | flip(공중 앞 한 바퀴 안전 착지)
//         | fly(날개를 펴 날아가 다른 곳에 착지) | puddle(웅덩이가 생기고 첨벙)
//   acts: 기본(walk·hop·spin·rest)과 캐릭터 전용 동작 이름. 앱은 순서대로 한 동작씩 그린다(끝나면 다음).
var SCENE_LAND = { dolsom: "cotton", ppopu: "pose", dudung: "dig", lovel: "flip", sul: "fly", chaeng: "puddle" };
var SCENE_ACTS = {
  dolsom: ["shake", "tailchase", "loaf", "ball", "mirror"],
  ppopu: ["dig", "bone", "dance", "slide", "dive"],
  lovel: ["punch", "box", "stretch", "melt", "pounce"],
  dudung: ["shades", "flag", "lens", "dust", "vanish"],
  sul: ["glasses", "stumble", "feather", "binoc", "hover"],
  chaeng: ["dash", "flop", "hide", "bubbles", "dew"]
};
var SCENE_BASE = ["walk", "hop", "spin", "rest"];
// ★ 장소(YJ 2026-10-25 "홈 화면 주변 배경도 다양한 장소를 랜덤으로"): 경로가 없을 때(idle)만 바뀐다. 정류장·역 입구가 있는 장면(wait·alight)은 늘 street.
var SCENE_PLACES = ["street", "park", "river", "school", "market", "beach", "trail"];
var SCENE_PLACE_KO = { street: "거리", park: "공원", river: "강변", school: "학교 앞", market: "시장 골목", beach: "바닷가", trail: "산길" };
// ★ 날씨 반응(YJ 2026-10-25 "날씨에 맞춰 비·눈·햇빛·바람 연출, 길동무 친구들 리액션도 달라져야"): 어떤 날씨에 어떤 동작을 끼울지 · 무슨 말을 할지는 엔진이 정한다.
//   shiver 추위 · pant 더위 · squint 햇빛 · gust 바람 · splash/shakeoff 비 · snowcatch 눈 · peer 안개. 앱은 이 이름대로 그리고 say[동작] 글을 말풍선에 띄운다.
var SCENE_SAY = {
  shiver: { dolsom: ["덜덜… 너무 추워요", "으으 추워!"], lovel: ["…춥다냥", "발이 시려워냥"], ppopu: ["으으 꽁꽁!", "추워요!"], chaeng: ["부르르…", "차가워…"], sul: ["바람이 차군…", "으슬으슬…"], dudung: ["굴로 돌아갈까…", "발이 얼겠다"] },
  pant: { dolsom: ["헥헥… 더워요", "물 마시고 싶어요"], lovel: ["녹는다…", "더워냥…"], ppopu: ["헥헥헥!", "더워요!"], chaeng: ["물… 물 주세요", "마른다…"], sul: ["태양이 뜨겁군", "그늘이 필요하군"], dudung: ["땀이 줄줄…", "헬멧이 뜨거워"] },
  squint: { dolsom: ["눈부셔요!", "햇빛 좋다!"], lovel: ["눈이 부시다냥", "따뜻하다냥"], ppopu: ["햇빛 최고!", "눈부신 날!"], chaeng: ["반짝반짝!", "눈부신데요"], sul: ["눈부신 날이군", "좋은 하늘이군"], dudung: ["선글라스 어디 갔지", "눈부시네"] },
  gust: { dolsom: ["으앗 바람!", "날아가겠어요!"], lovel: ["털이 다 날려냥!", "바람 싫다냥"], ppopu: ["날아가겠어요!", "휘이이잉!"], chaeng: ["휘잉~", "날아간다아!"], sul: ["순풍이다!", "바람을 타자"], dudung: ["모자 날아간다!", "단단히 잡아!"] },
  splash: { dolsom: ["첨벙첨벙!", "물웅덩이다!"], lovel: ["발 젖는다…", "피해 간다냥"], ppopu: ["물웅덩이다!", "첨벙!"], chaeng: ["물이다 야호!", "첨벙첨벙~"], sul: ["비 맞기 싫군", "푸드덕"], dudung: ["장화가 필요해", "질척질척하네"] },
  shakeoff: { dolsom: ["부르르르!", "털어야지!"], lovel: ["털 말려야지", "털이 젖었냥"], ppopu: ["부르르!", "물 털기!"], chaeng: ["탈탈!", "물방울 탈탈"], sul: ["푸드덕!", "날개를 말려야지"], dudung: ["털어야지…", "후두두두"] },
  snowcatch: { dolsom: ["눈이다 눈!", "눈 내려요!"], lovel: ["차가워…", "눈이 내린다냥"], ppopu: ["눈 먹어볼까?", "눈이다!"], chaeng: ["눈송이다!", "차갑다!"], sul: ["눈이 내리는군", "하얗게 덮였군"], dudung: ["눈사람 만들자", "눈 시원하네"] },
  peer: { dolsom: ["앞이 안 보여요", "어디 있어요~?"], lovel: ["안개 속이다냥", "뿌옇다냥"], ppopu: ["어디 있어요~?", "보이지 않아요"], chaeng: ["뿌옜다…", "안개다…"], sul: ["시야가 흐리군", "조심히 날아야지"], dudung: ["랜턴 켜야겠다", "안개가 짙네"] }
};
var SCENE_HINT_BUS = "지하철을 타면 혼잡도가 표시돼요";
var SCENE_SLOT_KO = { dawn: "새벽", morning: "아침", noon: "점심", afternoon: "오후", evening: "저녁", night: "밤" };
var SCENE_WX_KO = { clear: "맑음", cloudy: "구름", overcast: "흐림", rain: "비", snow: "눈", fog: "안개" };
var SCENE_WX_CACHE = {};
function sceneHash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function sceneShuffle(list, seed) {
  var a = list.slice(), s = seed >>> 0 || 1;
  for (var i = a.length - 1; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; var j = (s >>> 8) % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function sceneSlot(h) { return h >= 4 && h < 7 ? "dawn" : h >= 7 && h < 11 ? "morning" : h >= 11 && h < 14 ? "noon" : h >= 14 && h < 18 ? "afternoon" : h >= 18 && h < 21 ? "evening" : "night"; }
function sceneWxKind(wx) {
  if (!wx) return "clear";
  var t = String(wx.txt || ""), r = typeof wx.rain === "number" ? wx.rain : -1;
  if (/눈|진눈/.test(t)) return "snow";
  if (/비|소나기|뇌우|천둥|우박/.test(t) || (!t && r >= 60)) return "rain";
  if (/안개|박무|연무/.test(t)) return "fog";
  if (/흐림/.test(t)) return "overcast";
  if (/구름/.test(t)) return "cloudy";
  return "clear";
}
function sceneLook(nowMs, tz, wx) {
  var kd = new Date(nowMs + tz * 6e4), slot = sceneSlot(kd.getUTCHours()), wk = sceneWxKind(wx), mo = kd.getUTCMonth();
  var season = mo >= 2 && mo <= 4 ? "spring" : mo >= 5 && mo <= 7 ? "summer" : mo >= 8 && mo <= 10 ? "autumn" : "winter";
  var emo = wk === "snow" ? "❄️" : wk === "rain" ? "🌧️" : wk === "overcast" ? "☁️" : wk === "cloudy" ? "⛅" : wk === "fog" ? "🌫️" : slot === "night" ? "🌙" : slot === "dawn" ? "🌅" : slot === "evening" ? "🌇" : "☀️";
  var known = !!wx;
  var temp = wx && typeof wx.temp === "number" ? wx.temp : null, feel = wx && typeof wx.feel === "number" ? wx.feel : temp;
  var wsp = wx && typeof wx.wind === "number" ? wx.wind : -1, txt = String((wx && wx.txt) || "");
  var wind = /강풍|태풍/.test(txt) || wsp >= 28 ? 2 : wsp >= 14 ? 1 : 0;                  // 바람: 0 없음 · 1 산들 · 2 센 바람 — wx.wind 는 km/h (s246: 날씨 받는 쪽이 m/s 로 주고 있어 바람 효과가 거의 안 났다 → 받는 쪽을 km/h 로 맞췄다)
  var day = slot === "morning" || slot === "noon" || slot === "afternoon";
  return { slot: slot, slotKo: SCENE_SLOT_KO[slot], wk: wk, wxKo: known ? SCENE_WX_KO[wk] : "", wxKnown: known, temp: temp != null ? Math.round(temp) : null, season: season, night: slot === "night", lit: slot === "night" || slot === "evening" || slot === "dawn", hidesSun: wk === "overcast" || wk === "rain" || wk === "snow" || wk === "fog", emo: emo,
    place: "street", placeKo: SCENE_PLACE_KO.street, wind: wind,
    hot: known && feel != null && feel >= 28, cold: known && feel != null && feel <= 2,                  // 체감온도 기준(없으면 기온)
    sun: known && wk === "clear" && day, bright: known && wk === "clear" && day && wx && typeof wx.uv === "number" && wx.uv >= 6 };
}
// 캐릭터별 동작 대본: 전용 동작을 시드로 섞고 사이사이 기본 동작(걷기·콩콩·돌기·쉬기)을 끼운다. 낙엽 더미 다이빙(dive)은 가을·눈 올 때만.
function sceneTraits(look, seed, nowMs) {
  var out = {}, bucket = Math.floor(nowMs / 6e5), wa = sceneWxActs(look, seed + "/W/" + bucket);
  SCENE_CHARS.forEach(function (id) {
    var sp = SCENE_ACTS[id].filter(function (x) { return x !== "dive" || look.season === "autumn" || look.wk === "snow"; });
    sp = sceneShuffle(sp, sceneHash(seed + "/A" + id + "/" + bucket));
    var h = sceneHash(seed + "/B" + id), seq = [];
    sp.forEach(function (x, i) { seq.push(x); seq.push(i % 2 === 0 ? "walk" : SCENE_BASE[(h + i) % SCENE_BASE.length]); });
    var say = {};
    if (wa.length) {                                                                          // 날씨 반응: 전용 동작 사이사이에 두 번씩 끼운다(반응이 자주 보이게)
      var half = Math.floor(seq.length / 2);
      wa.forEach(function (w, j) {
        var lines = SCENE_SAY[w] && SCENE_SAY[w][id];
        if (lines && lines.length) say[w] = lines[sceneHash(seed + "/S" + id + w + "/" + bucket) % lines.length];
        seq.splice(Math.min(seq.length, 2 * j + 1), 0, w);
        seq.splice(Math.min(seq.length, half + 2 * j + 2), 0, w);
      });
    }
    out[id] = { land: SCENE_LAND[id], acts: seq, say: say };
  });
  return out;
}
// 지금 날씨에 어울리는 반응 동작(최대 3개, 시드로 순서). 날씨를 못 받았으면(wxKnown false) 없다 — 날씨를 지어내지 않는다.
function sceneWxActs(look, seed) {
  var a = [];
  if (!look.wxKnown) return a;
  if (look.cold) a.push("shiver");
  if (look.hot) a.push("pant");
  if (look.sun) a.push("squint");
  if (look.wind >= 1) a.push("gust");
  if (look.wk === "rain") { a.push("splash"); a.push("shakeoff"); }
  if (look.wk === "snow") { a.push("snowcatch"); if (look.cold && a.indexOf("shiver") < 0) a.push("shiver"); }
  if (look.wk === "fog") a.push("peer");
  return sceneShuffle(a, sceneHash(seed)).slice(0, 3);
}
// 장소 고르기: 20분마다 바뀐다(같은 키·같은 시간대면 같다). 겨울·추울 땐 바닷가를 빼고, 정류장·역이 있는 장면은 늘 거리.
function scenePlace(look, seedStr, nowMs) {
  var pool = SCENE_PLACES.filter(function (p) { return !(p === "beach" && (look.season === "winter" || look.cold)); });
  return pool[sceneHash(seedStr + "/P/" + Math.floor(nowMs / 12e5)) % pool.length];
}
// s246 (YJ: 배경이 바뀔 때 캐릭터들이 좌우로 걸어 나가며 배경이 이어져 바뀌게): 장소가 바뀔 때 어느 쪽으로 걸어 나갈지는 엔진이 정한다(+1 오른쪽 · -1 왼쪽, 장소 칸마다 고정).
function scenePanDir(seedStr, nowMs) { return sceneHash(seedStr + "/D/" + Math.floor(nowMs / 12e5)) % 2 ? 1 : -1; }
function sceneIsTr(n) { return !!(n && (n.isSub || n.isBus) && n.name); }
// 지금 위치(here)에서 '타고 있거나 곧 탈' 구간의 노드: here 가 탈것이면 그것, 도보·출발이면 다음 탈것, 없으면 마지막으로 지난 탈것
function sceneLegNode(nodes, here) {
  var j, k, n = nodes[here];
  if (sceneIsTr(n)) return { i: here, n: n };
  for (j = here + 1; j < nodes.length; j++) if (sceneIsTr(nodes[j])) return { i: j, n: nodes[j] };
  for (k = here - 1; k >= 0; k--) if (sceneIsTr(nodes[k])) return { i: k, n: nodes[k] };
  return null;
}
// ★ 2026-10-26 (YJ: "혼잡도를 좌우로 슬라이드하면 길동무 친구들이 지하철을 타고 이동하는 장면 … 정지하면 일부가 랜덤으로 내리고 타는 애니메이션"):
//   지하철 객실 장면의 재료. 누가 타고 있다가 어느 역에서 내리고 타는지는 여기서 정한다(앱은 받은 대로 그리기만 한다).
//   이동 중인지 정차 중인지·언제 닿는지는 탑승 엔진(ride-eta 의 pos.segs 시각표)이 정하고, 앱은 그 시각표를 받아 그린다.
//   names[k]  = 이 구간 k 번째 역 이름(k=0 이 첫 탑승역, 노드 번호는 first+k)
//   stops[k]  = [on, out, in] — k 번째 역에 닿기 직전 객실에 있던 친구들 · 그 역에서 내리는 친구들 · 그 역에서 타는 친구들 (비트: SCENE_CHARS 순서의 자리)
//   마지막 역에서는 모두 내린다. 대표 캐릭터(hero)는 마지막 역까지 타고 간다.
function sceneTrain(nodes, first, last, hero, cast, seed) {
  var cnt = Math.max(0, Math.min(last - first + 1, 60)), names = [], stops = [], k, c;
  var bit = function (id) { var i = SCENE_CHARS.indexOf(id); return i < 0 ? 0 : (1 << i); };
  var hb = bit(hero), on = hb, order = (cast && cast.length ? cast : SCENE_CHARS).filter(function (id) { return id !== hero; });
  var h0 = sceneHash(seed + "/T0"), nStart = 1 + (h0 % 3);                                 // 처음엔 대표 + 1~3 명
  for (c = 0; c < order.length && c < nStart; c++) on |= bit(order[c]);
  var init = on;
  for (k = 0; k < cnt; k++) {
    var nd = nodes[first + k], isLast = k === cnt - 1, h = sceneHash(seed + "/T" + (k + 1) + "|" + (nd && nd.name || ""));
    var before = on, out = 0, inn = 0, i;
    if (isLast) out = on;
    else if (k > 0) {                                                                      // 첫 역은 타는 역이라 내리고 타는 일이 없다
      var ids = sceneShuffle(SCENE_CHARS.filter(function (x) { return x !== hero && (on & bit(x)) !== 0; }), h);
      var rest = sceneShuffle(SCENE_CHARS.filter(function (x) { return (on & bit(x)) === 0; }), h ^ 0x9e3779b9);
      var nOut = (h >>> 3) % 100 < 58 ? 1 + ((h >>> 11) % 100 < 28 ? 1 : 0) : 0, nIn = (h >>> 5) % 100 < 58 ? 1 + ((h >>> 13) % 100 < 28 ? 1 : 0) : 0;
      for (i = 0; i < nOut && i < ids.length; i++) out |= bit(ids[i]);
      for (i = 0; i < nIn && i < rest.length; i++) inn |= bit(rest[i]);
    }
    names.push(String(nd && nd.name || "").slice(0, 12));
    stops.push([before, out, inn]);
    on = (on & ~out) | inn;
  }
  return { first: first, init: init, names: names, stops: stops, line: nodes[first] ? sceneLineLabel(nodes[first]) : "",
    say: { out: ["안녕~", "먼저 내릴게!", "내일 봐!", "다녀올게요"], "in": ["타요~", "안녕!", "같이 가요", "자리 있나?"] }, lb: ["다음 역", "이번 역"] };
}

function sceneBounds(nodes, i) {
  var bus = !!nodes[i].isBus, ln = nodes[i].lineName || "", a = i, b = i;
  function same(n) { return n && (bus ? n.isBus : n.isSub) && (n.lineName || "") === ln; }
  while (a - 1 >= 0 && same(nodes[a - 1])) a--;
  while (b + 1 < nodes.length && same(nodes[b + 1])) b++;
  return [a, b];
}
// 장면에 쓸 짧은 노선 이름: 지하철 '9호선' → '9', 그 밖의 노선은 앞 2글자, 버스는 번호 그대로
function sceneLineLabel(n) {
  var ln = String((n && n.lineName) || "");
  if (n && n.isBus) return ln.slice(0, 6);
  var m = /^(\d+)\uD638\uC120/.exec(ln);
  return m ? m[1] : ln.slice(0, 2);
}
// ★ 2026-10-15 (YJ 재지시): 혼잡도는 '지하철 탑승 확정' 뒤에만 보인다. 타기를 기다리는 동안(버스·지하철 모두)·버스를 타고 가는 동안·내린 뒤에는 혼잡도 없이 장면(애니메이션)만 보인다.
//   · mode: idle(경로 없음) | wait(타기 전) | ride(버스 안) | alight(내림) | null(지하철 타고 가는 중 → 혼잡도)
//   · venue: 'bus'(정류장·버스) | 'sub'(지하철역 입구) | 'street'(idle)
function sceneDecide(inp, wx) {
  inp = inp || {};
  var nowMs = isFinite(inp.nowMs) ? +inp.nowMs : Date.now(), tz = isFinite(inp.tzOffsetMin) ? +inp.tzOffsetMin : 540;
  var nodes = Array.isArray(inp.nodes) ? inp.nodes.slice(0, 200) : [], locked = inp.locked === true;
  var look = sceneLook(nowMs, tz, wx || null);
  var sigBase = nodes.map(function (n) { return (n.isBus ? "b" : n.isSub ? "s" : n.isWalk ? "w" : "o") + (n.lineName || "") + "|" + (n.name || ""); }).join(">");
  var day = Math.floor((nowMs + tz * 6e4) / 864e5), seedStr = String(inp.key || sigBase) + "#" + day;
  var out = { ok: true, fill: false, mode: null, venue: "street", line: "", nearEnd: false, hint: null, tag: "", look: look, hero: SCENE_CHARS[sceneHash(seedStr) % SCENE_CHARS.length], cast: sceneShuffle(SCENE_CHARS, sceneHash(seedStr + "/" + Math.floor(nowMs / 6e5))), traits: sceneTraits(look, seedStr, nowMs), cong: { kind: null, idx: -1, sig: "" } };
  var idleTag = look.emo + " " + look.slotKo + (look.wxKnown ? " \u00B7 " + look.wxKo + (look.temp != null ? " " + look.temp + "\u00B0" : "") : "");
  // fill: 경로가 없고(경로 결과도 안 나온 때) 홈 화면을 한 화면에 꽉 채워 보일 때만 true. 경로 결과가 나오기 시작하면(확정 전이라도) false → 앱은 평소 크기로 돌린다
  if (!locked) { out.mode = "idle"; look.place = scenePlace(look, seedStr, nowMs); look.placeKo = SCENE_PLACE_KO[look.place]; look.pdir = scenePanDir(seedStr, nowMs); out.tag = idleTag; out.fill = inp.routeShown !== true; out.hint = SCENE_HINT_BUS; return out; }
  if (!nodes.length) return out;
  var here = Math.max(0, Math.min(isFinite(inp.here) ? inp.here | 0 : 0, nodes.length - 1)), leg = sceneLegNode(nodes, here), j;
  if (!leg) return out;
  var n = leg.n, bb = sceneBounds(nodes, leg.i), first = bb[0], last = bb[1], firstTr = -1, bus = !!n.isBus;
  for (j = 0; j < nodes.length; j++) if (!nodes[j].isOrigin && !nodes[j].isWalk && (nodes[j].isBus || nodes[j].isSub)) { firstTr = j; break; }
  // (YJ 10:23) 대표 캐릭터는 경로를 확정할 때마다, 그리고 탈것 구간(leg)마다 새로 뽑는다 — 같은 경로라도 구간이 바뀌면 다른 캐릭터가 기다린다
  var seedL = seedStr + "/L" + first;
  out.hero = SCENE_CHARS[(sceneHash(seedL) >>> 8) % SCENE_CHARS.length];
  out.cast = sceneShuffle(SCENE_CHARS, sceneHash(seedL + "/" + Math.floor(nowMs / 6e5)));
  var phase;
  if (leg.i > here) phase = "wait";                                                        // 타러 가는 중(도보·환승 이동)
  else if (leg.i < here) phase = "alight";                                                 // 내려서 목적지로 가는 중
  else if (bus && here === last && last > first) phase = "alight";                          // 버스: 내릴 정류장에 닿음
  else if (here === first && !(first === firstTr && inp.boarded === true)) phase = "wait";  // 첫 탈것이면 승차 확정 뒤에만 탄 것으로 본다
  else phase = "ride";
  if (!bus && phase === "ride") {                                                          // 지하철 탑승 확정 → 혼잡도 (+ 옆으로 밀면 보이는 객실 장면 재료)
    out.cong = { kind: "sub", idx: leg.i === here ? here : leg.i, sig: "s|" + (n.lineName || "") + "|" + (nodes[here] && nodes[here].name || n.name) };
    if (nodes[here] && nodes[here].isSub) out.cong.idx = here;
    out.line = sceneLineLabel(n); out.venue = "sub";
    out.train = sceneTrain(nodes, first, last, out.hero, out.cast, seedL);
    return out;
  }
  out.mode = phase; out.venue = bus ? "bus" : "sub"; out.line = sceneLineLabel(n); out.hint = SCENE_HINT_BUS;
  out.nearEnd = bus && phase === "ride" && here === last - 1;
  var who = bus ? "\uD83D\uDE8C " + out.line + " \uBC84\uC2A4\uB97C" : "\uD83D\uDE87 " + (n.lineName || "\uC9C0\uD558\uCCA0") + " \uC5F4\uCC28\uB97C";
  out.tag = phase === "wait" ? who + " \uAE30\uB2E4\uB9AC\uB294 \uC911" : phase === "ride" ? (out.nearEnd ? "\uD83D\uDD14 \uACE7 \uB0B4\uB824\uC694!" : "\uD83D\uDE8C \uBC84\uC2A4 \uD0C0\uACE0 \uAC00\uB294 \uC911") : "\uD83D\uDC4B \uB0B4\uB838\uC5B4\uC694, \uCE5C\uAD6C\uB4E4\uACFC \uB180\uC544\uC694";
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { sceneDecide: sceneDecide, sceneTrain: sceneTrain, sceneSlot: sceneSlot, sceneLineLabel: sceneLineLabel, sceneWxKind: sceneWxKind, sceneLook: sceneLook, SCENE_CHARS: SCENE_CHARS, SCENE_HINT_BUS: SCENE_HINT_BUS, SCENE_PLACES: SCENE_PLACES, SCENE_SAY: SCENE_SAY, sceneWxActs: sceneWxActs, scenePlace: scenePlace };
