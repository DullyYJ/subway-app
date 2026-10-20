// 경로 카드 버튼 줄(탑승·환승·도착) 네이티브 연출 검증 — 2026-10-16
//   ① 순수 자바 코어(RowCore — android.* 없음)를 JVM 에서 컴파일하고 자체 점검(java RowJvmTest) 통과: 세 버튼 같은 너비 · 밀고 들어옴 · 위/아래 밀기 · 곡선 · 색
//   ② 코어는 안드로이드·네트워크에 손대지 않는다(계산은 엔진, 코어는 받은 kind 와 진행도로 자리만 낸다)
//   ③ 안드로이드 계층(RowOverlayView·RowNativePlugin)을 진짜 android.jar 로 컴파일 — jar 가 없으면 건너뜀(CI 러너엔 SDK 가 있다)
//   ④ CI 워크플로가 파일을 복사하고 MainActivity 에 플러그인을 등록한다
// 실행: node test/row_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { const r = await fn(); if (r === 'skip') { skipped++; console.log('  skip ', name); } else { pass++; console.log('  ok  ', name); } } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = n => path.join(ROOT, 'native', n);
const walk = (d, ext, acc = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, ext, acc); else if (p.endsWith(ext)) acc.push(p); } return acc; };
function findAndroidJar() {
  if (process.env.ANDROID_JAR && fs.existsSync(process.env.ANDROID_JAR)) return process.env.ANDROID_JAR;
  for (const base of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, '/usr/local/lib/android/sdk'].filter(Boolean)) {
    const pl = path.join(base, 'platforms'); if (!fs.existsSync(pl)) continue;
    const vs = fs.readdirSync(pl).filter(x => /^android-\d+$/.test(x)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
    for (const v of vs) { const j = path.join(pl, v, 'android.jar'); if (fs.existsSync(j)) return j; }
  }
  return '';
}
(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rowjvm-'));
  await t('RowCore 를 JVM 에서 컴파일하고 자체 점검(RowJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('RowCore.java'), path.join(__dirname, 'java', 'RowJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-cp', core, 'com.dullyyj.subway.RowJvmTest'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(r.stdout), r.stdout.slice(-300));
    console.log('        ' + (r.stdout.match(/^ok /gm) || []).length + '개 점검');
  });
  await t('코어는 안드로이드·네트워크·시계를 쓰지 않는다(순수 계산)', async () => {
    const src = fs.readFileSync(N('RowCore.java'), 'utf8');
    assert.ok(!/import\s+android\.|java\.net|HttpURLConnection|System\.currentTimeMillis|SystemClock/.test(src), '순수 자바여야 한다');
  });
  await t('안드로이드 계층(RowOverlayView·RowNativePlugin)을 진짜 android.jar 로 컴파일', async () => {
    const jar = findAndroidJar(); if (!jar) return 'skip';
    const cap = path.join(out, 'cap'), j = path.join(out, 'j'); fs.mkdirSync(cap); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', cap].concat(walk(path.join(__dirname, 'android-stubs', 'com'), '.java')), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', [jar, cap].join(path.delimiter), '-d', j, N('RowCore.java'), N('RowOverlayView.java'), N('RowNativePlugin.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 2000));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'RowNativePlugin.class')));
  });
  await t('오버레이는 손가락을 가져가지 않는다(웹 줄이 눌림을 받는다) · 끝나면 스스로 사라진다', async () => {
    const v = fs.readFileSync(N('RowOverlayView.java'), 'utf8');
    assert.ok(/dispatchTouchEvent[\s\S]{0,80}return false/.test(v) && /onTouchEvent[\s\S]{0,80}return false/.test(v));
    assert.ok(/setVisibility\(GONE\)/.test(v) && /postInvalidateOnAnimation/.test(v), 'vsync 마다 그리고 끝나면 숨김');
  });
  await t('CI 워크플로가 파일을 복사하고 MainActivity 에 RowNativePlugin 을 등록한다', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-shell.yml'), 'utf8');
    for (const f of ['RowCore.java', 'RowOverlayView.java', 'RowNativePlugin.java']) assert.ok(y.includes('native/' + f), f + ' 복사');
    assert.ok(/registerPlugin\(RowNativePlugin\.class\)/.test(y));
    assert.ok(/row_native\.test\.js/.test(y) && /route_row\.ui\.test\.js/.test(y), '시험 목록');
  });
  console.log(`\n${pass} 통과, ${fail} 실패, ${skipped} 건너뜀`); process.exit(fail ? 1 : 0);
})();
