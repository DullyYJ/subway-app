// 오프닝 화면 대본 — 2026-10-29 s299 (YJ: "앱을 처음 킬 때 길동무 친구들이 2초쯤 화면에 뜨면 좋겠어 …")
//   s299-2 (YJ: "움직임이 너무 많아 · 캐릭터가 너무 커(30% 줄여) · 가운데에서 다같이 사용자를 바라보며 시간대별 행동 · 상단에는 '우리들의 길동무' ·
//           오프닝이 사라지면 앱 화면이 그라데이션으로 자연스럽게"):
//     친구 셋은 걸어 들어오지 않고 화면 가운데에 모여 서서 조용히 나타나 인사한다(왼쪽 · 가운데 · 오른쪽 — 가운데 친구가 말풍선으로 인사). 움직임은 작게(콩콩 키의 5% 안쪽).
//
// 앱을 켜면 2초쯤 길동무 친구들이 나와 인사한다. 그동안 앱은 뒤에서 위치·정류장·탭 화면을 받아 두며 안정화한다.
//   시간대 7칸(YJ): 07-09 아침 맞이 · 09-11 오전 일상 · 11-13 점심 · 13-17 오후 일상 · 17-20 퇴근 · 20-23 야간 휴식 · 23-07 잠자기
//   칸마다 하늘·해/달·땅 색, 가운데 친구의 인사 글, 친구 셋의 자세가 다르고, 칸마다 두 가지씩 있어 날마다 번갈아 나온다.
//
// ★ 오프닝은 네트워크를 기다리지 않는다(켜자마자 떠야 한다). 그래서 대본은 이 파일이 만들고, 만든 결과(JSON)를 앱 assets/open.json 에 넣어 둔다
//   (`node tools/engine/gen-open.js` — 시험이 둘이 같은지 본다). 앱은 이 JSON 을 읽어 시계의 시(時)에 맞는 칸을 찾아 그리기만 한다 — 문구·움직임·색은 앱 코드에 없다.
//   Worker 에는 들어가지 않는다(서버가 하는 일이 없다).
//
// 대본 한 칸의 모양:
//   { id, ko, h0, h1,                  // 시각 범위 [h0, h1) — 자정을 넘기면 h0 > h1 (23-07)
//     sky:[위,가운데,아래], ground:"#…", hill:"#…", tc:"#…"(상단 글 색),
//     sun:{x,y0,y1,r,c} | moon:{x,y,r} | stars:n | clouds:n,
//     variants:[ { cast:[ 왼쪽, 가운데, 오른쪽 친구 { id, tr:[ 구간… ] } ] } ×2 ] }
//   구간(tr): { t0, t1, k:"pose"|"sleep"(|"walk"), x0, x1 (화면 폭의 0~1, 발 중심), p:자세 번호(0 앉기·2 신남·6/7 전용),
//               hop:콩콩 높이(키의 배수), hz:콩콩 속도, f:방향(+1 · -1), say:"말풍선", fx:"heart|spark|note|leaf|zzz|food" }
//   시각 t 는 ms(0 = 오프닝이 뜬 순간). 전체 길이는 dur(ms) — 마지막 fade ms 동안 오프닝이 앱 화면으로 서서히 녹아든다(글·친구가 먼저 사라지고 배경이 뒤따른다).

var OPEN_DUR = 2700, OPEN_FADE = 700, OPEN_BRAND = "우리들의 길동무";
var OPEN_CHARS = ["dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng", "juksun", "bbosong"];
var OPEN_X = [0.30, 0.50, 0.70], OPEN_XS = [0.27, 0.50, 0.73];      // 가운데에 모인 자리(잠잘 때는 잠자리가 커서 조금 더 벌린다)

function _p(t0, x, p, o) { var s = { t0: t0, t1: OPEN_DUR, k: "pose", x0: x, x1: x, p: p, f: 1 }; for (var k in (o || {})) s[k] = o[k]; return s; }
function _q(t0, t1, x, p, o) { var s = _p(t0, x, p, o); s.t1 = t1; return s; }
function _s(t0, x, o) { var s = { t0: t0, t1: OPEN_DUR, k: "sleep", x0: x, x1: x, f: 1 }; for (var k in (o || {})) s[k] = o[k]; return s; }
function _a(id, tr) { return { id: id, tr: tr }; }
// 먹는 모습(죽순이): 입을 다물었다 벌렸다를 천천히 되풀이한다
function _munch(t0, x, o) { var out = [], t = t0, i = 0; while (t < OPEN_DUR) { out.push(_q(t, Math.min(OPEN_DUR, t + 700), x, i % 2 ? 7 : 6, i === 0 ? (o || {}) : { fx: (o || {}).fx })); t += 700; i++; } return out; }

var OPEN_SLOTS = [
  // ── 07-09 아침 맞이: 해가 떠오르고, 친구들이 가운데에 모여 아침 인사를 한다 ──
  { id: "greet", ko: "아침 맞이", h0: 7, h1: 9,
    sky: ["#7ab8ff", "#ffd6a5", "#ffb48a"], ground: "#8fd07a", hill: "#79bf68", tc: "#3d2a1e",
    sun: { x: 0.74, y0: 0.46, y1: 0.34, r: 0.085, c: "#ffd36b" }, clouds: 2,
    variants: [
      { cast: [
        _a("juksun", _munch(0, OPEN_X[0], { fx: "leaf" })),
        _a("dolsom", [_p(120, OPEN_X[1], 2, { hop: 0.04, hz: 0.9, say: "좋은 아침이에요!", fx: "spark" })]),
        _a("bbosong", [_q(240, 1300, OPEN_X[2], 0, {}), _p(1300, OPEN_X[2], 6, { fx: "heart" })])
      ] },
      { cast: [
        _a("lovel", [_p(0, OPEN_X[0], 0, { fx: "heart" })]),
        _a("ppopu", [_p(120, OPEN_X[1], 2, { hop: 0.04, hz: 0.9, say: "좋은 아침이에요!", fx: "spark" })]),
        _a("sul", [_p(240, OPEN_X[2], 0, {})])
      ] }
    ] },
  // ── 09-11 오전 일상: 맑은 하늘 아래 가운데에 모여 앉아 하루를 연다 ──
  { id: "morning", ko: "오전 일상", h0: 9, h1: 11,
    sky: ["#6eb6ff", "#aed9ff", "#e4f4ff"], ground: "#86cf72", hill: "#6fbd62", tc: "#17365e",
    sun: { x: 0.80, y0: 0.40, y1: 0.36, r: 0.07, c: "#ffe27a" }, clouds: 3,
    variants: [
      { cast: [
        _a("dudung", [_p(0, OPEN_X[0], 0, {})]),
        _a("chaeng", [_p(120, OPEN_X[1], 0, { say: "활기찬 오전이에요!", fx: "note" })]),
        _a("juksun", [_p(240, OPEN_X[2], 0, {})])
      ] },
      { cast: [
        _a("sul", [_p(0, OPEN_X[0], 0, {})]),
        _a("lovel", [_p(120, OPEN_X[1], 0, { say: "활기찬 오전이에요!", fx: "note" })]),
        _a("bbosong", [_p(240, OPEN_X[2], 0, {})])
      ] }
    ] },
  // ── 11-13 점심: 해가 높이 떠 있고, 가운데에 모여 앉아 맛있게 먹는다 ──
  { id: "lunch", ko: "점심", h0: 11, h1: 13,
    sky: ["#58a9ff", "#9fd2ff", "#eaf7ff"], ground: "#8ad276", hill: "#74c164", tc: "#12345a",
    sun: { x: 0.50, y0: 0.30, y1: 0.28, r: 0.075, c: "#fff0a0" }, clouds: 1,
    variants: [
      { cast: [
        _a("juksun", _munch(0, OPEN_X[0], { fx: "food" })),
        _a("dolsom", [_p(120, OPEN_X[1], 0, { say: "점심 먹을 시간!", fx: "food" })]),
        _a("bbosong", [_p(240, OPEN_X[2], 0, { fx: "food" })])
      ] },
      { cast: [
        _a("ppopu", [_p(0, OPEN_X[0], 0, { fx: "food" })]),
        _a("lovel", [_p(120, OPEN_X[1], 0, { say: "점심 먹을 시간!", fx: "food" })]),
        _a("dudung", [_p(240, OPEN_X[2], 0, { fx: "food" })])
      ] }
    ] },
  // ── 13-17 오후 일상: 포근한 햇살 속에서 살짝 들썩이며 쉰다 ──
  { id: "afternoon", ko: "오후 일상", h0: 13, h1: 17,
    sky: ["#8fc9ff", "#d6ecff", "#fff1c9"], ground: "#9ad475", hill: "#82c263", tc: "#3a3320",
    sun: { x: 0.82, y0: 0.38, y1: 0.42, r: 0.075, c: "#ffd86b" }, clouds: 2,
    variants: [
      { cast: [
        _a("dolsom", [_p(0, OPEN_X[0], 2, { hop: 0.05, hz: 0.8 })]),
        _a("ppopu", [_p(120, OPEN_X[1], 2, { hop: 0.05, hz: 0.8, say: "조금만 더 힘내요!", fx: "note" })]),
        _a("chaeng", [_p(240, OPEN_X[2], 2, { hop: 0.05, hz: 0.8 })])
      ] },
      { cast: [
        _a("bbosong", [_p(0, OPEN_X[0], 7, { fx: "spark" })]),
        _a("juksun", [_p(120, OPEN_X[1], 2, { hop: 0.05, hz: 0.8, say: "조금만 더 힘내요!", fx: "leaf" })]),
        _a("sul", [_p(240, OPEN_X[2], 0, {})])
      ] }
    ] },
  // ── 17-20 퇴근: 노을 속에서 가운데에 모여 수고했다고 인사한다 ──
  { id: "evening", ko: "퇴근", h0: 17, h1: 20,
    sky: ["#5a4a96", "#ff9a6e", "#ffd28a"], ground: "#7fb56a", hill: "#699f58", tc: "#fff3e2",
    sun: { x: 0.26, y0: 0.50, y1: 0.54, r: 0.10, c: "#ffb347" }, clouds: 2,
    variants: [
      { cast: [
        _a("dolsom", [_p(0, OPEN_X[0], 2, { hop: 0.03, hz: 0.7 })]),
        _a("lovel", [_p(120, OPEN_X[1], 2, { hop: 0.03, hz: 0.7, say: "오늘도 수고했어요!", fx: "heart" })]),
        _a("juksun", [_p(240, OPEN_X[2], 2, { hop: 0.03, hz: 0.7 })])
      ] },
      { cast: [
        _a("ppopu", [_p(0, OPEN_X[0], 2, { hop: 0.03, hz: 0.7 })]),
        _a("dudung", [_p(120, OPEN_X[1], 2, { hop: 0.03, hz: 0.7, say: "오늘도 수고했어요!", fx: "heart" })]),
        _a("bbosong", [_p(240, OPEN_X[2], 2, { hop: 0.03, hz: 0.7 })])
      ] }
    ] },
  // ── 20-23 야간 휴식: 달 아래 가운데에 모여 앉아 쉰다 ──
  { id: "night", ko: "야간 휴식", h0: 20, h1: 23,
    sky: ["#0e1a3f", "#243466", "#3d4a85"], ground: "#41614f", hill: "#365543", tc: "#eef2ff",
    moon: { x: 0.78, y: 0.36, r: 0.06 }, stars: 26, clouds: 0,
    variants: [
      { cast: [
        _a("lovel", [_p(0, OPEN_X[0], 0, {})]),
        _a("dolsom", [_p(120, OPEN_X[1], 0, { say: "편안한 밤이에요~", fx: "heart" })]),
        _a("juksun", [_p(240, OPEN_X[2], 0, {})])
      ] },
      { cast: [
        _a("sul", [_p(0, OPEN_X[0], 0, {})]),
        _a("chaeng", [_p(120, OPEN_X[1], 0, { say: "편안한 밤이에요~", fx: "spark" })]),
        _a("bbosong", [_p(240, OPEN_X[2], 0, {})])
      ] }
    ] },
  // ── 23-07 잠자기: 가운데에 모여 곤히 잔다 ──
  { id: "sleep", ko: "잠자기", h0: 23, h1: 7,
    sky: ["#050a1e", "#0f1838", "#1a2650"], ground: "#26394a", hill: "#1f3140", tc: "#dfe6ff",
    moon: { x: 0.24, y: 0.36, r: 0.055 }, stars: 34, clouds: 0,
    variants: [
      { cast: [
        _a("juksun", [_s(0, OPEN_XS[0], { fx: "zzz" })]),
        _a("bbosong", [_s(120, OPEN_XS[1], { fx: "zzz", say: "쿨쿨… 푹 자요" })]),
        _a("dolsom", [_s(240, OPEN_XS[2], { fx: "zzz" })])
      ] },
      { cast: [
        _a("lovel", [_s(0, OPEN_XS[0], { fx: "zzz" })]),
        _a("dudung", [_s(120, OPEN_XS[1], { fx: "zzz", say: "쿨쿨… 푹 자요" })]),
        _a("ppopu", [_s(240, OPEN_XS[2], { fx: "zzz" })])
      ] }
    ] }
];

/** 시(0~24 실수)가 속한 칸의 번호. 칸 범위는 [h0, h1) 이고 자정을 넘기는 칸은 h0 > h1. */
function openSlotIndex(hour) {
  var h = ((hour % 24) + 24) % 24;
  for (var i = 0; i < OPEN_SLOTS.length; i++) {
    var s = OPEN_SLOTS[i];
    if (s.h0 < s.h1 ? (h >= s.h0 && h < s.h1) : (h >= s.h0 || h < s.h1)) return i;
  }
  return 0;
}

/** 앱 assets/open.json 으로 내려보낼 대본 전체. */
function openScript() { return { v: 2, dur: OPEN_DUR, fade: OPEN_FADE, brand: OPEN_BRAND, slots: OPEN_SLOTS }; }

if (typeof module !== 'undefined' && module.exports) module.exports = { openScript: openScript, openSlotIndex: openSlotIndex, OPEN_SLOTS: OPEN_SLOTS, OPEN_DUR: OPEN_DUR, OPEN_FADE: OPEN_FADE, OPEN_BRAND: OPEN_BRAND, OPEN_CHARS: OPEN_CHARS, OPEN_X: OPEN_X, OPEN_XS: OPEN_XS };
