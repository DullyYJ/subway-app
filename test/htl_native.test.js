// 홈 경로 화면 가로 타임라인 네이티브(P1) 검증 — 2026-10-17
//   ① 순수 자바 코어(HtlCore — android.* 없음)를 JVM 에서 컴파일하고 자체 점검(java HtlJvmTest) 통과: 칸 놓기 · 스크롤 한계 · 보이는 칸 · 마커 선형 이동 · CSS 색 읽기
//   ② 코어는 안드로이드·네트워크·시계를 쓰지 않는다(계산은 웹/엔진, 코어는 받은 값으로 자리만 낸다)
//   ③ 안드로이드 계층(HtlView·HtlNativePlugin)을 진짜 android.jar 로 컴파일 — jar 가 없으면 건너뜀(CI 러너엔 SDK 가 있다)
//   ④ 뷰는 손가락을 가져가지 않는다(웹뷰가 스크롤) · 플러그인은 계산을 하지 않는다
//   ⑤ CI 워크플로가 파일을 복사하고 MainActivity 에 플러그인을 등록한다
// 실행: node test/htl_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { const r = await fn(); if (r === 'skip') { skipped++; console.log('  skip ', name); } else { pass++; console.log('  ok  ', name); } } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'htljvm-'));
  await t('HtlCore 를 JVM 에서 컴파일하고 자체 점검(HtlJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('HtlCore.java'), path.join(__dirname, 'java', 'HtlJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-cp', core, 'com.dullyyj.subway.HtlJvmTest'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(r.stdout), r.stdout.slice(-300));
    console.log('        ' + (r.stdout.match(/^ok /gm) || []).length + '개 점검');
  });
  await t('코어는 안드로이드·네트워크·시계를 쓰지 않는다(순수 계산)', async () => {
    const src = fs.readFileSync(N('HtlCore.java'), 'utf8');
    assert.ok(!/import\s+android\.|java\.net|HttpURLConnection|System\.currentTimeMillis|SystemClock/.test(src), '순수 자바여야 한다');
  });
  await t('안드로이드 계층(HtlView·HtlNativePlugin)을 진짜 android.jar 로 컴파일', async () => {
    const jar = findAndroidJar(); if (!jar) return 'skip';
    const cap = path.join(out, 'cap'), j = path.join(out, 'j'); fs.mkdirSync(cap); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', cap].concat(walk(path.join(__dirname, 'android-stubs', 'com'), '.java')), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', [jar, cap].join(path.delimiter), '-d', j, N('HtlCore.java'), N('HtlView.java'), N('HtlNativePlugin.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)).join(' / ').slice(0, 1500));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'HtlNativePlugin.class')));
  });
  await t('뷰는 손가락을 가져가지 않는다(웹뷰가 스크롤) · 숨는 동안은 다시 그리지 않는다 · 마커가 있을 때만 화면 박자로 그린다', async () => {
    const v = fs.readFileSync(N('HtlView.java'), 'utf8');
    assert.ok(/dispatchTouchEvent[\s\S]{0,80}return false/.test(v) && /onTouchEvent[\s\S]{0,80}return false/.test(v), '손가락을 삼킨다');
    assert.ok(/if \(mk\.on\)[\s\S]{0,2000}postInvalidateOnAnimation/.test(v), '마커가 있을 때만 박자 그리기');
    assert.ok(!/Random|Math\.random|URL\(|http/i.test(v), '뷰에는 계산·통신이 없어야 한다');
  });
  await t('플러그인은 계산·통신을 하지 않고, 실패하면 error 이벤트로 알린다', async () => {
    const p = fs.readFileSync(N('HtlNativePlugin.java'), 'utf8');
    assert.ok(/notifyListeners\("error"/.test(p) && /notifyListeners\("ready"/.test(p), 'ready·error 이벤트');
    assert.ok(!/URL\(|HttpURLConnection|Random/.test(p), '순수 전달');
    for (const m of ['show', 'setRect', 'update', 'scroll', 'marker', 'hide', 'destroy', 'status']) assert.ok(new RegExp('public void ' + m + '\\(').test(p), m + ' 메서드');
  });
  await t('영역(id)마다 뷰가 따로고, 글자 덩어리(runs)는 웹이 정한 자리에 그대로 그린다(줄바꿈·배치 계산 없음)', async () => {
    const p = fs.readFileSync(N('HtlNativePlugin.java'), 'utf8'), v = fs.readFileSync(N('HtlView.java'), 'utf8');
    assert.ok(/Map<String, HtlView> views/.test(p) && /idOf\(call\)/.test(p), '영역별 뷰');
    assert.ok(/optJSONArray\("runs"\)/.test(p) && /setRuns\(/.test(p), 'runs 적용');
    assert.ok(/runs != null[\s\S]{0,1500}HtlCore\.baseline/.test(v), '기준선은 코어 계산');
    assert.ok(!/StaticLayout|breakText|measureText[\s\S]{0,40}split/.test(v.split('runs != null')[1].split('cv.save();')[0] + ''), '줄바꿈 금지');
  });
  await t('CI 워크플로가 파일을 복사하고 MainActivity 에 HtlNativePlugin 을 등록한다', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    for (const f of ['HtlCore.java', 'HtlView.java', 'HtlNativePlugin.java']) assert.ok(y.includes('native/' + f), f + ' 복사');
    assert.ok(/registerPlugin\(HtlNativePlugin\.class\)/.test(y));
    assert.ok(/htl_native\.test\.js/.test(y), '시험 목록');
  });
  console.log(`\n${pass} 통과, ${fail} 실패, ${skipped} 건너뜀`); process.exit(fail ? 1 : 0);
})();
