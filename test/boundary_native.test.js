// 계산 ↔ 그림 경계 점검(s389): "계산은 엔진, 앱은 그림만" 이 소스에서 지켜지는지 기계가 본다.
//   ① 그림 클래스(뷰·장면 그리기)는 무작위 · 기기 저장소(SharedPreferences) · 직접 네트워크를 쓰지 않는다 — 예외는 아래 ALLOW 에 '이유'와 함께 적는다
//   ② 계산 클래스(*Core · Scene 계산)는 android.* 를 모르고 Handler/Looper 도 안 쓴다(JVM 에서 그대로 시험 가능)
//   ③ 앱 어디서든 시드 없는 무작위(Math.random · new Random())는 ALLOW 에 있는 곳에서만
//   ④ ALLOW 에 적어 둔 것이 이미 사라졌으면(낡은 예외) 실패 — 예외 목록이 거짓말하지 않게 한다. 새 예외는 이유 없이 못 늘린다.
// 실행: node test/boundary_native.test.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'native/shell');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const code = f => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, '')).join('\n');
const all = fs.readdirSync(DIR).filter(f => f.endsWith('.java'));

// 그림 클래스: 손가락·화면 크기·시계만 받아 그린다
const DRAW = ['ScreenView', 'SceneDriver', 'AndroidCv', 'MetroRenderer', 'MetroMapView', 'RunnerArt', 'OpenView', 'PlayView', 'RsSheetView', 'ShareAnim', 'SceneCv'];
const RULES = {
  random: { re: /Math\.random\(|new (java\.util\.)?Random\(\s*\)/g, why: '무작위' },
  prefs: { re: /SharedPreferences/g, why: '기기 저장소' },
  net: { re: /HttpURLConnection|openConnection\(|new URL\(|NetPost\./g, why: '직접 네트워크' },
};
// 예외 — 파일:규칙 → { max: 허용 횟수, why: 이유 }
const ALLOW = {
  'ScreenView:net': { max: 5, why: '이미지(그림 재료) 내려받기: 주소를 받아 비트맵으로 바꿔 그리기만 한다 — 주소·재시도·저장 판단은 엔진/코어가 정한다' },
  'PlayView:random': { max: 1, why: '게임(PlayCore)에 넘겨 줄 난수 공급기 — 규칙·점수는 PlayCore 가 정한다(뷰는 값을 쓰지 않는다)' },
  'SceneDriver:random': { max: 1, why: '장면 장식(구름·반짝임) 난수 공급기를 SceneCore 에 꽂아 준다 — 친구·역·승하차 같은 결정은 전부 엔진이 준 JSON/시드(SceneTrain)' },
};
// 앱 전체에서 시드 없는 무작위를 쓸 수 있는 곳(위 그림 클래스 예외 외)
const ALLOW_RANDOM = {
  'HcardsCore': { max: 1, why: 'AI 브리핑 문구를 고르는 씨앗(aiRnd)을 엔진에 넘겨 줄 뿐 — 문구는 엔진이 정한다' },
  'NetPost': { max: 5, why: '재시도 간격 흔들기 · 캐시 우회 꼬리표 — 화면과 무관' },
  'ShellActivity': { max: 1, why: '전화망 호출 사이의 간격 흔들기 — 화면과 무관' },
};
// 계산 클래스 중 android 를 써도 되는 것
const PURE_OK = { 'WidgetCore': '위젯(AppWidgetManager·PendingIntent)을 붙이는 접착 코드 — 위젯에 보일 값은 WidgetSceneCore 가 계산' };
const PURE = all.filter(f => /Core\.java$/.test(f) || /^(SceneModel|SceneUtil|SceneArt|SceneActs|SceneTrain|SceneFx|SceneHello|ScenePlaces|ScenePlatform|SceneHaptics|Chars)\.java$/.test(f)).map(f => f.replace('.java', ''));

const used = {};
for (const d of DRAW) {
  if (!all.includes(d + '.java')) { ok(false, d + '.java 가 없다 — DRAW 목록을 갱신하라'); continue; }
  const src = code(d + '.java');
  for (const [k, r] of Object.entries(RULES)) {
    const n = (src.match(r.re) || []).length, a = ALLOW[d + ':' + k];
    if (a) used[d + ':' + k] = n;
    ok(n === 0 || (a && n <= a.max), `그림 ${d}: ${r.why} 사용 ${n}곳` + (a ? ` (허용 ≤${a.max}: ${a.why})` : ''));
  }
}
for (const [k, a] of Object.entries(ALLOW)) ok(used[k] > 0, `예외 ${k} 가 아직 쓰인다(낡은 예외 아님) — ${a.why.slice(0, 30)}…`);

const pureBad = [];
for (const c of PURE) {
  if (PURE_OK[c]) continue;
  const src = code(c + '.java');
  if (/^import (android|androidx)\./m.test(src) || /\b(Handler|Looper|Context|SharedPreferences)\b/.test(src.replace(/^import .*$/gm, ''))) pureBad.push(c);
}
ok(pureBad.length === 0, `계산 클래스 ${PURE.length}개는 android·Handler·Looper·Context·SharedPreferences 를 모른다` + (pureBad.length ? ' ← ' + pureBad.join(', ') : ''));
for (const c of Object.keys(PURE_OK)) ok(/^import android\./m.test(code(c + '.java')), `예외 ${c} 가 아직 android 를 쓴다(낡은 예외 아님)`);

const bad = [];
for (const f of all) {
  const c = f.replace('.java', ''), n = (code(f).match(RULES.random.re) || []).length;
  if (!n) continue;
  const a = ALLOW[c + ':random'] ? ALLOW[c + ':random'] : ALLOW_RANDOM[c];
  if (!a || n > a.max) bad.push(c + '(' + n + ')');
}
ok(bad.length === 0, '시드 없는 무작위는 허용 목록의 곳에서만' + (bad.length ? ' ← ' + bad.join(', ') : ''));
for (const [c, a] of Object.entries(ALLOW_RANDOM)) ok((code(c + '.java').match(RULES.random.re) || []).length > 0, `무작위 예외 ${c} 가 아직 쓰인다 — ${a.why.slice(0, 24)}…`);

console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
