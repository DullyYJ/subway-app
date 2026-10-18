// 서버 구동 네이티브 화면(쇼핑 1호) 검증 — 2026-10-18
//   ① 순수 자바 코어(ScreenCore — android.* 없음)를 JVM 에서 컴파일하고 자체 점검(java ScreenJvmTest) 통과: JSON 읽기·검증·배치·눌림·스크롤
//   ② 코어는 안드로이드·네트워크·시계를 쓰지 않는다 (계산은 엔진, 코어는 받은 값으로 자리만 낸다)
//   ③ 안드로이드 계층(ScreenView·ScreenNativePlugin)을 진짜 android.jar 로 컴파일 — jar 가 없으면 건너뜀(CI 러너엔 SDK 가 있다)
//   ④ 뷰: 그릴 때 새 객체를 만들지 않는다 · 화면 박자 · 그림은 뷰 안 백그라운드에서만 받는다 / 플러그인: 검증을 거친다 · 통신이 없다
//   ⑤ CI 워크플로가 파일을 복사하고 MainActivity 에 ScreenNativePlugin 을 등록한다
// 실행: node test/screen_native.test.js   (javac · java 필요)
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scrjvm-'));
  await t('ScreenCore 를 JVM 에서 컴파일하고 자체 점검(ScreenJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), path.join(__dirname, 'java', 'ScreenJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', core, 'com.dullyyj.subway.ScreenJvmTest'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(r.stdout), r.stdout.slice(-300));
    console.log('        ' + (r.stdout.match(/^ok /gm) || []).length + '개 점검');
  });
  await t('코어는 안드로이드·네트워크·시계를 쓰지 않는다(순수 계산)', async () => {
    const src = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(!/import\s+android\.|java\.net|HttpURLConnection|System\.currentTimeMillis|SystemClock|Random/.test(src), '순수 자바여야 한다');
  });
  await t('안드로이드 계층(ScreenView·ScreenNativePlugin)을 진짜 android.jar 로 컴파일', async () => {
    const jar = findAndroidJar(); if (!jar) return 'skip';
    const cap = path.join(out, 'cap'), j = path.join(out, 'j'); fs.mkdirSync(cap); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', cap].concat(walk(path.join(__dirname, 'android-stubs', 'com'), '.java')), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', [jar, cap].join(path.delimiter), '-d', j, N('ScreenCore.java'), N('ScreenView.java'), N('ScreenNativePlugin.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)).join(' / ').slice(0, 1500));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'ScreenNativePlugin.class')));
  });
  await t('뷰: 그릴 때 새 객체를 만들지 않는다 · 화면 박자로 이어 그린다 · 보이는 조각만 그린다', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8');
    const draw = v.slice(v.indexOf('protected void onDraw'), v.indexOf('/** 그림을 받아 두는 곳'));
    assert.ok(!/\bnew\s+[A-Z]/.test(draw), '그리기 구간에 new 가 있다: ' + (draw.match(/\bnew\s+[A-Z]\w*/) || [''])[0]);
    assert.ok(/postInvalidateOnAnimation/.test(draw), '화면 박자');
    assert.ok(/bodyRange\(/.test(draw) && /headRange\(/.test(draw), '보이는 조각만');
    assert.ok(/OverScroller/.test(v) && /VelocityTracker/.test(v), '관성 스크롤');
    assert.ok(/requestDisallowInterceptTouchEvent\(true\)/.test(v), '손가락을 이 뷰가 받는다');
  });
  await t('그림 받기: 백그라운드 스레드 + 메모리/파일 캐시 + 실패 재시도 간격 + 크기 한도', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/newFixedThreadPool/.test(v) && /LruCache/.test(v) && /scr_img/.test(v), '풀·캐시');
    assert.ok(/failed\.put/.test(v) && /60000L/.test(v), '실패 간격');
    assert.ok(/4_000_000L/.test(v) && /inSampleSize/.test(v), '크기 한도·축소 디코드');
    assert.ok(/getResponseCode\(\) != 200/.test(v), '정상 응답만');
  });
  await t('플러그인: JSON 을 검증(ScreenCore.load)한 뒤에만 그린다 · 틀리면 invalid 오류 이벤트 · 통신·계산 없음', async () => {
    const p = fs.readFileSync(N('ScreenNativePlugin.java'), 'utf8');
    assert.ok(/ScreenCore\.load\(/.test(p) && /"invalid"/.test(p), '검증·invalid');
    assert.ok(/notifyListeners\("error"/.test(p) && /notifyListeners\("ready"/.test(p) && /notifyListeners\("action"/.test(p), 'ready·error·action 이벤트');
    assert.ok(!/URL\(|HttpURLConnection|Random/.test(p), '순수 전달');
    for (const m of ['show', 'update', 'setRect', 'hide', 'destroy', 'status']) assert.ok(new RegExp('public void ' + m + '\\(').test(p), m + ' 메서드');
    assert.ok(/@CapacitorPlugin\(name = "ScreenNative"\)/.test(p));
  });
  await t('CI 워크플로가 파일을 복사하고 MainActivity 에 ScreenNativePlugin 을 등록한다', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    for (const f of ['ScreenCore.java', 'ScreenView.java', 'ScreenNativePlugin.java']) assert.ok(y.includes('native/' + f), f + ' 복사');
    assert.ok(/registerPlugin\(ScreenNativePlugin\.class\)/.test(y));
    assert.ok(/screen_native\.test\.js/.test(y) && /screen_native_js\.ui\.test\.js/.test(y) && /shop_engine\.test\.js/.test(y), '시험 목록');
  });
  console.log(`\n${pass} 통과, ${fail} 실패, ${skipped} 건너뜀`); process.exit(fail ? 1 : 0);
})();
