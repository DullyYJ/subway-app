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
  return { slot: slot, slotKo: SCENE_SLOT_KO[slot], wk: wk, wxKo: known ? SCENE_WX_KO[wk] : "", wxKnown: known, temp: wx && typeof wx.temp === "number" ? Math.round(wx.temp) : null, season: season, night: slot === "night", lit: slot === "night" || slot === "evening" || slot === "dawn", hidesSun: wk === "overcast" || wk === "rain" || wk === "snow" || wk === "fog", emo: emo };
}
// 캐릭터별 동작 대본: 전용 동작을 시드로 섞고 사이사이 기본 동작(걷기·콩콩·돌기·쉬기)을 끼운다. 낙엽 더미 다이빙(dive)은 가을·눈 올 때만.
function sceneTraits(look, seed, nowMs) {
  var out = {}, bucket = Math.floor(nowMs / 6e5);
  SCENE_CHARS.forEach(function (id) {
    var sp = SCENE_ACTS[id].filter(function (x) { return x !== "dive" || look.season === "autumn" || look.wk === "snow"; });
    sp = sceneShuffle(sp, sceneHash(seed + "/A" + id + "/" + bucket));
    var h = sceneHash(seed + "/B" + id), seq = [];
    sp.forEach(function (x, i) { seq.push(x); seq.push(i % 2 === 0 ? "walk" : SCENE_BASE[(h + i) % SCENE_BASE.length]); });
    out[id] = { land: SCENE_LAND[id], acts: seq };
  });
  return out;
}
function sceneIsTr(n) { return !!(n && (n.isSub || n.isBus) && n.name); }
// 지금 위치(here)에서 '타고 있거나 곧 탈' 구간의 노드: here 가 탈것이면 그것, 도보·출발이면 다음 탈것, 없으면 마지막으로 지난 탈것
function sceneLegNode(nodes, here) {
  var j, k, n = nodes[here];
  if (sceneIsTr(n)) return { i: here, n: n };
  for (j = here + 1; j < nodes.length; j++) if (sceneIsTr(nodes[j])) return { i: j, n: nodes[j] };
  for (k = here - 1; k >= 0; k--) if (sceneIsTr(nodes[k])) return { i: k, n: nodes[k] };
  return null;
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
  if (!locked) { out.mode = "idle"; out.tag = idleTag; out.fill = inp.routeShown !== true; out.hint = SCENE_HINT_BUS; return out; }
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
  if (!bus && phase === "ride") { out.cong = { kind: "sub", idx: leg.i === here ? here : leg.i, sig: "s|" + (n.lineName || "") + "|" + (nodes[here] && nodes[here].name || n.name) }; if (nodes[here] && nodes[here].isSub) out.cong.idx = here; return out; }   // 지하철 탑승 확정 → 혼잡도
  out.mode = phase; out.venue = bus ? "bus" : "sub"; out.line = sceneLineLabel(n); out.hint = SCENE_HINT_BUS;
  out.nearEnd = bus && phase === "ride" && here === last - 1;
  var who = bus ? "\uD83D\uDE8C " + out.line + " \uBC84\uC2A4\uB97C" : "\uD83D\uDE87 " + (n.lineName || "\uC9C0\uD558\uCCA0") + " \uC5F4\uCC28\uB97C";
  out.tag = phase === "wait" ? who + " \uAE30\uB2E4\uB9AC\uB294 \uC911" : phase === "ride" ? (out.nearEnd ? "\uD83D\uDD14 \uACE7 \uB0B4\uB824\uC694!" : "\uD83D\uDE8C \uBC84\uC2A4 \uD0C0\uACE0 \uAC00\uB294 \uC911") : "\uD83D\uDC4B \uB0B4\uB838\uC5B4\uC694, \uCE5C\uAD6C\uB4E4\uACFC \uB180\uC544\uC694";
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { sceneDecide: sceneDecide, sceneSlot: sceneSlot, sceneLineLabel: sceneLineLabel, sceneWxKind: sceneWxKind, sceneLook: sceneLook, SCENE_CHARS: SCENE_CHARS, SCENE_HINT_BUS: SCENE_HINT_BUS };
