// 오프닝 화면 대본 — 2026-10-29 s299 (YJ: "앱을 처음 킬 때 길동무 친구들이 2초쯤 화면에 뜨면 좋겠어 …")
//   s299-2 (YJ: "움직임이 너무 많아 · 캐릭터가 너무 커(30% 줄여) · 가운데에서 다같이 사용자를 바라보며 시간대별 행동 · 상단에는 '우리들의 길동무' ·
//           오프닝이 사라지면 앱 화면이 그라데이션으로 자연스럽게"):
//   s299-3 (YJ: "제목을 화살표 방향(친구들 위)으로 · 동물들이 있는 곳만 배경 · 나머지는 파스텔 화이트 · 앱 화면이 오프닝에 보이면 안 돼 · 시간 규칙은 지키되 친구들은 랜덤으로"):
//     ① 화면 전체는 불투명 파스텔 화이트, 하늘·땅 배경은 친구들이 서 있는 둥근 판 안에만 ② 제목은 그 판 바로 위 ③ 시간대 규칙(하늘·인사·자세·효과)은 칸이 정하고,
//     누가 나올지는 켤 때마다 8마리 중에서 무작위(앱이 고른다 — 방금 나온 조합은 피한다). 죽순이·뽀송만 하는 전용 동작(먹기·냄새 맡기·신발 자랑)은 `special` 로 칸이 정해 둔다.
//   s299-4 (YJ: "위치 이동(아래로) · 가로로 여백없이 · 테두리는 그라데이션으로 배경과 분리됐다는 느낌 최소화 · 캐릭터 아래 이름표"):
//     배경 판은 화면 가로를 꽉 채우고(둥근 모서리·윤곽선 없음) 위·아래 가장자리가 바탕색으로 서서히 번져 경계가 안 보인다. 판은 화면 아래쪽으로 내렸고, 친구 발밑에 이름표(OPEN_NAMES)가 붙는다.
//   s299-6 (YJ: "이미지는 하단 끝 바닥에 닿도록 · 제목은 바닥에서 65% 높이 · 배경도 날씨 연동"): 띠는 화면 맨 아래에 닿고(아래 번짐 없음) 제목은 바닥에서 65% 높이, 배경은 마지막으로 받은 날씨(OPEN_WX)로 바뀐다.
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
//     sky:[위,가운데,아래], ground:"#…", hill:"#…", ink:"#…"(제목 글 색 — 없으면 대본의 ink),
//     bg:"#…"(화면 바탕 색 — 없으면 대본의 bg. 밤 칸은 하늘 맨 위 색과 같게 해서 띠와 바탕이 이어진다),
//     sun:{x,y0,y1,r,c} | moon:{x,y,r} | stars:n | clouds:n,
//     (해/달/구름/별의 x·y 는 배경 판 안의 비율 0~1),
//     kind:"pose"|"sleep", roles:[ 왼쪽, 가운데, 오른쪽 자리마다 { t0, p, hop, hz, fx, say } ],
//     special:{ 친구id:[ 구간… ] } }      // 그 친구가 나오면 자기 자리의 자세를 이 구간들로 바꾼다(x 는 자리에서 채운다)
//   구간(special 의 tr): { t0, t1, k:"pose"|"sleep"(|"walk"), x0, x1 (화면 폭의 0~1, 발 중심), p:자세 번호(0 앉기·2 신남·6/7 전용),
//               hop:콩콩 높이(키의 배수), hz:콩콩 속도, f:방향(+1 · -1), say:"말풍선", fx:"heart|spark|note|leaf|zzz|food" }
//   시각 t 는 ms(0 = 오프닝이 뜬 순간). 전체 길이는 dur(ms) — 마지막 fade ms 동안 오프닝이 앱 화면으로 서서히 녹아든다(글·친구가 먼저 사라지고 배경이 뒤따른다).

var OPEN_DUR = 2700, OPEN_FADE = 700, OPEN_BRAND = "우리들의 길동무", OPEN_BG = "#FAF9F7", OPEN_INK = "#2B2F4A";      // 화면 바탕은 파스텔 화이트(불투명) · 글 색
var OPEN_CHARS = ["dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng", "juksun", "bbosong"];
// 친구 이름표(YJ 가 정한 이름 — 두더지 두덩 · 독수리 독슐 · 비숑 둘숑 · 푸들 뽀푸 · 올챙이 챙챙 · 판다 쮸르 · 하마 베비히포 · 고양이는 말씀이 없어 기존 이름 러블)
var OPEN_NAMES = { dolsom: "둘숑", lovel: "러블", dudung: "두덩", sul: "독슐", ppopu: "뽀푸", chaeng: "챙챙", juksun: "쮸르", bbosong: "베비히포" };
// 날씨(YJ: "배경도 날씨 연동되는지 확인하고 가능하면 연동") — 엔진 장면(/scene)이 정한 날씨 종류(clear·cloudy·overcast·rain·snow·fog, engine/scene.js sceneWxKind)를 앱이 마지막으로 받은 값으로 쓴다.
// 오프닝은 네트워크를 기다리지 않으므로 '방금 받아 둔 값'(앱이 장면을 받을 때 저장, 6시간 안)만 쓰고, 없으면 맑음(날씨를 지어내지 않는다).
// 종류마다: tint=[낮, 밤] 하늘·땅에 섞을 색 · a=섞는 정도 · sun=false 면 해·달·별을 가린다 · clouds=구름 수 · fx=비·눈·안개 효과 · ground/hill/ga=땅 색을 바꿀 때(눈) 색과 정도
var OPEN_WX = {
  cloudy:   { tint: ["#c4d1e2", "#2a3558"], a: 0.28, sun: true,  clouds: 5, fx: "" },
  overcast: { tint: ["#a9b3bf", "#222b45"], a: 0.58, sun: false, clouds: 6, fx: "" },
  rain:     { tint: ["#8794a6", "#1e2740"], a: 0.62, sun: false, clouds: 6, fx: "rain" },
  snow:     { tint: ["#d6e0ec", "#2c3656"], a: 0.55, sun: false, clouds: 5, fx: "snow", ground: "#eef3f8", hill: "#dfe8f1", ga: 0.88 },
  fog:      { tint: ["#cdd5dc", "#2b3350"], a: 0.62, sun: false, clouds: 3, fx: "fog" }
};
var OPEN_X = [0.30, 0.50, 0.70], OPEN_XS = [0.27, 0.50, 0.73];      // 판 안에서 모인 자리(잠잘 때는 잠자리가 커서 조금 더 벌린다)

function _r(t0, p, o) { var r = { t0: t0, p: p }; for (var k in (o || {})) r[k] = o[k]; return r; }
function _g(t0, t1, p, o) { var s = { t0: t0, t1: t1, k: "pose", p: p, f: 1 }; for (var k in (o || {})) s[k] = o[k]; return s; }
// 먹는 모습(죽순이): 입을 다물었다 벌렸다를 천천히 되풀이한다
function _munch(fx) { var out = [], t = 0, i = 0; while (t < OPEN_DUR) { out.push(_g(t, Math.min(OPEN_DUR, t + 700), i % 2 ? 7 : 6, { fx: fx })); t += 700; i++; } return out; }

var OPEN_SLOTS = [
  // ── 07-09 아침 맞이: 해가 떠오르고, 가운데에 모여 아침 인사를 한다 ──
  { id: "greet", ko: "아침 맞이", h0: 7, h1: 9, kind: "pose",
    sky: ["#7ab8ff", "#ffd6a5", "#ffb48a"], ground: "#8fd07a", hill: "#79bf68",
    sun: { x: 0.74, y0: 0.66, y1: 0.34, r: 0.11, c: "#ffd36b" }, clouds: 2,
    roles: [_r(0, 0, {}), _r(120, 2, { hop: 0.04, hz: 0.9, say: "좋은 아침이에요!", fx: "spark" }), _r(240, 0, { fx: "heart" })],
    special: { juksun: _munch("leaf"), bbosong: [_g(0, 1300, 0, {}), _g(1300, OPEN_DUR, 6, { fx: "heart" })] } },
  // ── 09-11 오전 일상: 맑은 하늘 아래 가운데에 모여 앉아 하루를 연다 ──
  { id: "morning", ko: "오전 일상", h0: 9, h1: 11, kind: "pose",
    sky: ["#6eb6ff", "#aed9ff", "#e4f4ff"], ground: "#86cf72", hill: "#6fbd62",
    sun: { x: 0.82, y0: 0.26, y1: 0.22, r: 0.09, c: "#ffe27a" }, clouds: 3,
    roles: [_r(0, 0, {}), _r(120, 0, { say: "활기찬 오전이에요!", fx: "note" }), _r(240, 0, {})], special: {} },
  // ── 11-13 점심: 해가 높이 떠 있고, 가운데에 모여 앉아 맛있게 먹는다 ──
  { id: "lunch", ko: "점심", h0: 11, h1: 13, kind: "pose",
    sky: ["#58a9ff", "#9fd2ff", "#eaf7ff"], ground: "#8ad276", hill: "#74c164",
    sun: { x: 0.84, y0: 0.22, y1: 0.20, r: 0.09, c: "#fff0a0" }, clouds: 1,
    roles: [_r(0, 0, { fx: "food" }), _r(120, 0, { say: "점심 먹을 시간!", fx: "food" }), _r(240, 0, { fx: "food" })],
    special: { juksun: _munch("food") } },
  // ── 13-17 오후 일상: 포근한 햇살 속에서 살짝 들썩이며 쉰다 ──
  { id: "afternoon", ko: "오후 일상", h0: 13, h1: 17, kind: "pose",
    sky: ["#8fc9ff", "#d6ecff", "#fff1c9"], ground: "#9ad475", hill: "#82c263",
    sun: { x: 0.82, y0: 0.26, y1: 0.30, r: 0.09, c: "#ffd86b" }, clouds: 2,
    roles: [_r(0, 2, { hop: 0.05, hz: 0.8 }), _r(120, 2, { hop: 0.05, hz: 0.8, say: "조금만 더 힘내요!", fx: "note" }), _r(240, 2, { hop: 0.05, hz: 0.8 })],
    special: { bbosong: [_g(0, OPEN_DUR, 7, { fx: "spark" })] } },
  // ── 17-20 퇴근: 노을 속에서 가운데에 모여 수고했다고 인사한다 ──
  { id: "evening", ko: "퇴근", h0: 17, h1: 20, kind: "pose",
    sky: ["#5a4a96", "#ff9a6e", "#ffd28a"], ground: "#7fb56a", hill: "#699f58",
    sun: { x: 0.26, y0: 0.60, y1: 0.66, r: 0.13, c: "#ffb347" }, clouds: 2,
    roles: [_r(0, 2, { hop: 0.03, hz: 0.7 }), _r(120, 2, { hop: 0.03, hz: 0.7, say: "오늘도 수고했어요!", fx: "heart" }), _r(240, 2, { hop: 0.03, hz: 0.7 })], special: {} },
  // ── 20-23 야간 휴식: 달 아래 가운데에 모여 앉아 쉰다 ──
  { id: "night", ko: "야간 휴식", h0: 20, h1: 23, kind: "pose", dark: true,
    sky: ["#0e1a3f", "#243466", "#3d4a85"], ground: "#41614f", hill: "#365543", bg: "#0e1a3f", ink: "#F4F6FF",
    moon: { x: 0.80, y: 0.24, r: 0.07 }, stars: 22, clouds: 0,
    roles: [_r(0, 0, {}), _r(120, 0, { say: "편안한 밤이에요~", fx: "heart" }), _r(240, 0, {})], special: {} },
  // ── 23-07 잠자기: 가운데에 모여 곤히 잔다 ──
  { id: "sleep", ko: "잠자기", h0: 23, h1: 7, kind: "sleep", dark: true,
    sky: ["#050a1e", "#0f1838", "#1a2650"], ground: "#26394a", hill: "#1f3140", bg: "#050a1e", ink: "#F4F6FF",
    moon: { x: 0.22, y: 0.24, r: 0.065 }, stars: 28, clouds: 0,
    roles: [_r(0, 0, { fx: "zzz" }), _r(120, 0, { fx: "zzz", say: "쿨쿨… 푹 자요" }), _r(240, 0, { fx: "zzz" })], special: {} }
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

/** 앱 assets/open.json 으로 내려보낼 대본 전체. chars = 나올 수 있는 친구(켤 때마다 이 중 셋이 무작위로), x/xs = 자리. */

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// s340 (YJ: "홈 '길동무 친구들' 카드를 3초 꾹 누르면 그 화면이 배경을 유지한 채 세로로 2배 슬라이드로 늘어나고, 나머지 친구들이 나와 3초쯤 시간대별 인사를 한 뒤,
//        남을 친구들만 남고 들어가며 카드가 다시 슬라이드로 줄어든다"): 카드 자체가 늘어난다(전체 화면을 덮는 장면이 아니다).
//   카드가 지금 보여 주는 친구(엔진 /scene 의 cast)는 그대로 남고, 나머지 친구가 양쪽 가장자리에서 걸어/날아/솟아 들어와 8마리가 3줄로 서서 한 마리씩 인사한다.
//   이 대본은 그 순서·자리·시간·인사 글만 정한다 — 누가 남고 누가 들어오는지는 지금 카드의 친구가 정한다(앱은 그리기만).
//   시간 t 는 모두 눌림이 확정된 순간부터의 ms:
//     expand: 카드가 2배로 늘어나는 시간 · greet: 첫 인사 시각 · step: 인사 간격 · bubble: 말풍선이 떠 있는 시간
//     leave: 손님 친구가 나가기 시작 · collapse: 카드가 줄기 시작 · end: 끝(이 뒤에 평소 카드로 돌아간다) · boost: 걸음 빠르기 배수
//   seats: 3줄(뒤 3 · 가운데 2 · 앞 3, 엇갈림) 자리 { x: 카드 폭의 0~1, z: 길의 깊이 0(멀다)~1(가깝다) } · order: 인사 차례(자리 번호) — 같은 시각에 뜨는 말풍선이 안 닿게 떨어진 자리끼리 이어 놓았다.
//   칸마다 say(친구별 인사 글 8개 · 열 글자 안쪽)와 rest(true 면 앉아 쉬며 — 잠자는 칸).
var HELLO_T = { expand: 650, greet: 2300, step: 380, bubble: 900, leave: 5900, collapse: 6150, end: 6800, boost: 2.2 };
var HELLO_SEATS = [
  { x: 0.20, z: 0.12 }, { x: 0.50, z: 0.12 }, { x: 0.80, z: 0.12 },       // 0~2 뒤 줄
  { x: 0.35, z: 0.50 }, { x: 0.65, z: 0.50 },                             // 3~4 가운데 줄
  { x: 0.20, z: 0.90 }, { x: 0.50, z: 0.90 }, { x: 0.80, z: 0.90 }        // 5~7 앞 줄
];
var HELLO_ORDER = [5, 2, 3, 7, 0, 4, 6, 1];
// 칸 × 친구 인사(말풍선 한 줄). 성격: 둘숑 씩씩 · 러블 느긋한 고양이 · 두덩 부지런한 두더지 · 독슐 멋진 독수리 · 뽀푸 우아 · 챙챙 통통 · 쮸르 먹보 판다 · 베비히포 아기 하마
var HELLO_SAY = {
  greet:     { dolsom: "굿모닝! 멍멍!", lovel: "좋은 아침이냥~", dudung: "일찍 일어났다!", sul: "아침 하늘 최고!", ppopu: "상쾌한 아침~", chaeng: "으쌰! 아침이다!", juksun: "아침 대나무 냠", bbosong: "아함~ 좋은 아침" },
  morning:   { dolsom: "오늘도 힘차게!", lovel: "느긋한 오전이냥", dudung: "열심히 파는 중!", sul: "높이 날아볼까?", ppopu: "활기찬 오전~", chaeng: "첨벙! 신나는 오전", juksun: "느긋느긋 오전", bbosong: "오늘도 방긋~" },
  lunch:     { dolsom: "점심 뭐 먹지?", lovel: "참치가 좋겠다냥", dudung: "지렁이 도시락!", sul: "내 점심은 생선!", ppopu: "맛있게 먹어요~", chaeng: "냠냠 점심 시간!", juksun: "대나무 점심 냠냠", bbosong: "밥 먹자 밥~" },
  afternoon: { dolsom: "조금만 더 힘내!", lovel: "낮잠 자고 싶냥", dudung: "땅 팔 힘이 나요", sul: "바람이 좋은 오후", ppopu: "간식 타임이에요", chaeng: "물장구 치고 싶어", juksun: "나른한 오후야~", bbosong: "졸려도 힘내요" },
  evening:   { dolsom: "오늘도 수고했어!", lovel: "수고했다냥~", dudung: "고생 많았어요", sul: "노을이 멋지네", ppopu: "수고 많으셨어요", chaeng: "퇴근이다 야호!", juksun: "푹 쉬어요~", bbosong: "토닥토닥 수고!" },
  night:     { dolsom: "편안한 밤이야~", lovel: "달이 예쁘다냥", dudung: "별이 반짝반짝", sul: "밤하늘 구경 중", ppopu: "좋은 저녁이에요", chaeng: "달님 안녕~", juksun: "포근한 밤이야", bbosong: "굿나잇 준비~" },
  sleep:     { dolsom: "쿨쿨… 잘 자요", lovel: "그르릉… 잘 자냥", dudung: "음냐… 잘 자요", sul: "푸드덕… 굿나잇", ppopu: "새근… 잘 자요", chaeng: "뽀글… 잘 자요", juksun: "대나무 꿈… 쿨", bbosong: "으음… 굿나잇" }
};
function helloScript() { return { t: HELLO_T, seats: HELLO_SEATS, order: HELLO_ORDER }; }
OPEN_SLOTS.forEach(function (s) { s.hello = { say: HELLO_SAY[s.id], rest: s.kind === "sleep" }; });

function openScript() { return { v: 5, hello: helloScript(), dur: OPEN_DUR, fade: OPEN_FADE, brand: OPEN_BRAND, bg: OPEN_BG, ink: OPEN_INK, chars: OPEN_CHARS, names: OPEN_NAMES, wx: OPEN_WX, x: OPEN_X, xs: OPEN_XS, slots: OPEN_SLOTS }; }

if (typeof module !== 'undefined' && module.exports) module.exports = { openScript: openScript, helloScript: helloScript, HELLO_SAY: HELLO_SAY, HELLO_SEATS: HELLO_SEATS, HELLO_ORDER: HELLO_ORDER, HELLO_T: HELLO_T, openSlotIndex: openSlotIndex, OPEN_SLOTS: OPEN_SLOTS, OPEN_DUR: OPEN_DUR, OPEN_FADE: OPEN_FADE, OPEN_BRAND: OPEN_BRAND, OPEN_BG: OPEN_BG, OPEN_INK: OPEN_INK, OPEN_CHARS: OPEN_CHARS, OPEN_NAMES: OPEN_NAMES, OPEN_WX: OPEN_WX, OPEN_X: OPEN_X, OPEN_XS: OPEN_XS };
