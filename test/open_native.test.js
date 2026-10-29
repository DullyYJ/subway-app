// 오프닝 화면(s299) 점검 — 앱을 켜면 길동무 친구들이 2초쯤 시간대별로 다른 움직임으로 인사한다
//   ① 엔진 대본(engine/open.js)이 사용자가 정한 7칸을 틈·겹침 없이 덮고 · 앱 assets/open.json 이 엔진 출력과 같다
//   ② OpenCore(순수 자바)가 같은 대본을 읽고 · 칸을 고르고 · 시각별 모습을 돌려준다 (OpenJvmTest)
//   ③ ShellActivity 연결: 처음 켤 때만 · 실패해도 앱은 연다 · 누르거나 뒤로 가기로 닫힌다 · 뒤 작업을 기다리지 않는다
// 실행: node test/open_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e && e.message || e).split('\n').slice(0, 8).join('\n        ')); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = f => path.join(ROOT, 'native/shell', f), ASSET = path.join(ROOT, 'shell-android/app/src/main/assets/open.json');
const E = require('../engine/open.js');

t('엔진 대본: 사용자가 정한 7칸(07-09 · 09-11 · 11-13 · 13-17 · 17-20 · 20-23 · 23-07)이 하루 24시간을 틈·겹침 없이 덮는다', () => {
  const want = { greet: [7, 9], morning: [9, 11], lunch: [11, 13], afternoon: [13, 17], evening: [17, 20], night: [20, 23], sleep: [23, 7] };
  assert.deepStrictEqual(E.OPEN_SLOTS.map(s => s.id), Object.keys(want));
  E.OPEN_SLOTS.forEach(s => assert.deepStrictEqual([s.h0, s.h1], want[s.id], s.id));
  for (let m = 0; m < 24 * 60; m += 5) { const h = m / 60, hit = E.OPEN_SLOTS.filter(s => s.h0 < s.h1 ? (h >= s.h0 && h < s.h1) : (h >= s.h0 || h < s.h1)); assert.strictEqual(hit.length, 1, h + ' 시에 칸이 ' + hit.length + '개'); assert.strictEqual(E.OPEN_SLOTS[E.openSlotIndex(h)].id, hit[0].id); }
});
t('엔진 대본: 칸마다 두 가지 · 친구 셋 · 알려진 친구 · 구간이 오프닝 시간 안 · 인사 글이 있다', () => {
  E.OPEN_SLOTS.forEach(s => {
    assert.strictEqual(s.variants.length, 2, s.id); assert.ok(s.title && s.sub && s.sky.length === 3, s.id + ' 글·하늘');
    s.variants.forEach(v => { assert.strictEqual(v.cast.length, 3, s.id); assert.strictEqual(new Set(v.cast.map(a => a.id)).size, 3);
      v.cast.forEach(a => { assert.ok(E.OPEN_CHARS.includes(a.id), a.id); a.tr.forEach(g => assert.ok(g.t0 >= 0 && g.t1 <= E.OPEN_DUR && g.t1 >= g.t0, s.id + ' 구간')); }); });
  });
  assert.ok(E.OPEN_DUR >= 2000 && E.OPEN_DUR <= 3000, '2초 안팎');
});
t('앱 assets/open.json 이 엔진 출력과 같다(고쳤으면 node tools/engine/gen-open.js)', () => {
  assert.strictEqual(fs.readFileSync(ASSET, 'utf8').trim(), JSON.stringify(E.openScript()));
});
t('OpenCore(OpenJvmTest)가 대본을 읽고 · 칸을 고르고 · 시각별 모습을 돌려준다', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'open-'));
  let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out, N('OpenCore.java'), N('SceneModel.java'), N('SceneUtil.java'), N('SceneCv.java'), path.join(ROOT, 'test/java/OpenJvmTest.java')], { env: ENV, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, (r.stderr || r.stdout).slice(0, 1500));
  r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-cp', out, 'com.dullyyj.subway.OpenJvmTest', ASSET], { env: ENV, encoding: 'utf8', timeout: 60000 });
  assert.ok(/ALL OK/.test(r.stdout) && r.status === 0, (r.stdout || '') + (r.stderr || ''));
});
t('OpenCore 는 안드로이드를 쓰지 않는다(순수 계산) · 대본에 없는 글·색은 코드에 없다', () => {
  const c = fs.readFileSync(N('OpenCore.java'), 'utf8'); assert.ok(!/import android\./.test(c));
  const v = fs.readFileSync(N('OpenView.java'), 'utf8');
  for (const s of E.OPEN_SLOTS) { assert.ok(!v.includes(s.title) && !v.includes(s.sub), s.id + ' 인사 글이 뷰 코드에 있다'); }
  assert.ok(!/좋은 아침|수고했어요|푹 자요/.test(v + c));
});
t('ShellActivity: 처음 켤 때만 오프닝을 띄우고 · 실패해도 앱은 열고 · 누르거나 뒤로 가기로 닫는다', () => {
  const a = fs.readFileSync(N('ShellActivity.java'), 'utf8');
  assert.ok(/if \(b == null\) showOpening\(\)/.test(a), '회전 같은 다시 만들기(b != null)에는 안 띄움');
  assert.ok(/getAssets\(\)\.open\("open\.json"\)/.test(a) && /OpenCore\.slotFor\(/.test(a) && /OpenCore\.cast\(/.test(a) && /addContentView\(openV/.test(a), '대본을 읽어 칸·그날 것을 고른다');
  assert.ok(/catch \(Throwable ignored\) \{ openV = null; \}/.test(a), '실패해도 앱은 연다');
  assert.ok(/if \(openV != null\) \{ openV\.finish\(\); return; \}/.test(a), '뒤로 가기는 오프닝만 닫는다');
  const v = fs.readFileSync(N('OpenView.java'), 'utf8');
  assert.ok(/ACTION_UP\) finish\(\)/.test(v) && /OpenCore\.done\(sc, t\)/.test(v), '누르면 닫고 · 시간이 되면 닫는다');
  assert.ok(/Chars\.file\(k\)/.test(v), '뽀송 신발 시트');
  assert.ok(/new Thread\(/.test(v) && !/\.join\(\)/.test(v), '시트는 뒤 스레드에서 읽고 기다리지 않는다');
  // 켜는 준비(위치·정류장·탭 미리 받기)는 오프닝 호출보다 앞에서 이미 시작돼 있다
  const o = a.indexOf('showOpening();'); for (const k of ['launchLocate();', 'prefetchTabs();', 'preloadDisk();', 'preconnectBus();', 'gwSync(false);']) assert.ok(a.indexOf(k) > -1 && a.indexOf(k) < o, k + ' 가 오프닝보다 먼저 시작');
});
console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
