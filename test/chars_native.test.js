// 캐릭터 시트 규칙(Chars) + 새 친구(죽순이·뽀송) 자산 점검 — 2026-10-29 s298
//   ① Chars.java(순수 자바) 점검: 신발은 20분 칸마다 바뀌고 이어지는 칸은 서로 다르다 · 파일 이름 규칙
//   ② 새 시트가 앱 assets 에 있고 형식이 맞다(걷기 1024², 자세 1024×512, 잠 1024²) · 뽀송 신발 4종
//   ③ 시트를 읽는 모든 곳이 Chars.file 을 거친다(신발이 한 곳만 안 바뀌는 일이 없게)
// 실행: node test/chars_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const A = f => path.join(ROOT, 'shell-android/app/src/main/assets/chars3d', f);
const R = f => fs.readFileSync(path.join(ROOT, 'native/shell', f), 'utf8');
function webpSize(f) { const b = fs.readFileSync(f); assert.ok(b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP', f + ' 형식'); const k = b.toString('latin1', 12, 16); if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3), b.length]; if (k === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff), b.length]; } const w = b.readUInt16LE(26) & 0x3fff, h = b.readUInt16LE(28) & 0x3fff; return [w, h, b.length]; }

t('Chars 점검(CharsJvmTest)이 모두 통과한다', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'chars-'));
  let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out, path.join(ROOT, 'native/shell/Chars.java'), path.join(ROOT, 'test/java/CharsJvmTest.java')], { env: ENV, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-cp', out, 'com.dullyyj.subway.CharsJvmTest'], { env: ENV, encoding: 'utf8', timeout: 60000 });
  assert.ok(/ALL OK/.test(r.stdout) && r.status === 0, (r.stdout || '') + (r.stderr || ''));
});
t('새 친구 시트가 앱 assets 에 있고 형식·크기가 맞다', () => {
  const walks = ['juksun', 'bbosong_0', 'bbosong_1', 'bbosong_2', 'bbosong_3'];
  for (const n of walks) { const [w, h, len] = webpSize(A(n + '.webp')); assert.ok(w === 1024 && h === 1024 && len > 40000 && len < 220000, n + ' 걷기 시트 ' + [w, h, len]); }
  for (const n of walks) { const [w, h, len] = webpSize(A(n + '_pose.webp')); assert.ok(w === 1024 && h === 512 && len > 15000 && len < 120000, n + ' 자세 시트 ' + [w, h, len]); }
  for (const n of ['juksun_sleep', 'bbosong_sleep']) { const [w, h, len] = webpSize(A(n + '.webp')); assert.ok(w === 1024 && h === 1024 && len > 40000 && len < 260000, n + ' 잠 시트 ' + [w, h, len]); }
});
t('캐릭터 목록 — 모든 곳이 같은 여덟 마리를 끝에 덧붙인 순서로 안다', () => {
  const ids = ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng', 'juksun', 'bbosong'];
  const list = s => (s.match(/"(dolsom|lovel|dudung|sul|ppopu|chaeng|juksun|bbosong)"/g) || []).map(x => x.slice(1, -1));
  for (const [f, re] of [['SceneModel.java', /ORDER = \{([^}]*)\}/], ['RunnerCore.java', /ORDER = \{([^}]*)\}/], ['WidgetSim.java', /ORDER = \{([^}]*)\}/], ['RideStandbyJ.java', /RS_CHARS = \{([^}]*)\}/]]) {
    const m = R(f).match(re); assert.ok(m, f); assert.deepStrictEqual(list(m[1]), ids, f + ' 순서');
  }
  const sc = require('../engine/scene.js'); assert.deepStrictEqual(sc.SCENE_CHARS, ids, '엔진 SCENE_CHARS');
  assert.ok(/chId\(Object o\)[\s\S]{0,400}"juksun"[\s\S]{0,60}"bbosong"/.test(R('OvCore.java')), 'OvCore 가 새 이름을 안다');
  const rs = fs.readFileSync(path.join(ROOT, 'engine/ride-standby.js'), 'utf8'); assert.ok(/RS_CHARS = \['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng', 'juksun', 'bbosong'\]/.test(rs), '엔진 RS_CHARS');
});
t('시트를 읽는 곳은 모두 Chars.file 을 거친다(뽀송 신발)', () => {
  for (const f of ['SceneDriver.java', 'RideOverlay.java', 'RunnerArt.java', 'ShareArt.java', 'WidgetCore.java']) assert.ok(/Chars\.file\(/.test(R(f)), f);
  for (const f of ['RideOverlay.java', 'RunnerArt.java', 'ShareArt.java', 'WidgetCore.java', 'SceneDriver.java']) assert.ok(!/open\("chars3d\/" \+ (id|key|an\.id) \+ "\.webp"\)/.test(R(f)), f + ' 가 id 로 바로 연다');
});
t('엔진 새 동작 이름을 앱이 모두 그린다 + 날씨 말풍선 문구가 새 친구에게도 있다', () => {
  const sc = require('../engine/scene.js'), acts = R('SceneActs.java');
  for (const a of ['munch', 'snooze', 'hooray', 'roll', 'twirl', 'peek', 'bellypat', 'yawn', 'kungfu', 'sneeze', 'sniff', 'shoeshow', 'sparkle', 'fountain', 'tapdance', 'blowbub', 'gape', 'shoeswap', 'polish', 'flower', 'L_tumble', 'search', 'L_hose', 'squirt', 'flee']) assert.ok(new RegExp('A_\\(S, "' + a + '"').test(acts), a + ' 동작');
  for (const k of Object.keys(sc.SCENE_SAY)) for (const id of ['juksun', 'bbosong']) assert.ok(sc.SCENE_SAY[k][id] && sc.SCENE_SAY[k][id].length >= 2, k + '/' + id);
  const r = sc.sceneDecide({ nowMs: Date.UTC(2026, 9, 29, 3, 0, 0), tzOffsetMin: 540, locked: false, routeShown: false }, { temp: 2, rain: 0, txt: '맑음', wind: 30 });
  assert.ok(r.traits.juksun && r.traits.juksun.land === 'tumble' && r.traits.bbosong.land === 'hose', 'traits');
  assert.ok(r.traits.juksun.acts.some(a => ['munch', 'snooze', 'hooray'].includes(a)) && r.traits.bbosong.acts.some(a => ['sniff', 'shoeshow', 'sparkle'].includes(a)), '전용 동작이 대본에 들어간다');
});
console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
