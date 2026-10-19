// 경로 요청(앱 본체·자바) 검증 — 2026-10-19 (5번 3단계: 경로 탐색 요청·결과 상태를 웹뷰 밖으로)
//   ① 순수 자바 코어(RouteFetchCore)를 JVM 에서 컴파일하고 자체 점검(java RouteFetchJvmTest) 통과 — 엔진 follow 지시를 따르는 단계 진행 · follow 읽기 · 진단 줄 · 보관
//   ② 코어는 안드로이드·네트워크·시계·스레드를 직접 쓰지 않는다(통신·시계·낡은 요청 확인은 Env 로 받는다) · 판단 코드(liveStat 읽기)가 없다 — 엔진 몫
//   ③ 플러그인(RouteFetchPlugin)을 손으로 쓴 최소 android 스텁으로 컴파일 — 진짜 android.jar 가 있으면 그걸로도(CI)
//   ④ 플러그인 계약: 이름 · 메서드 · 이벤트 · 낡은 요청 버림 · 경로 주소만 · 제한시간 · 호출은 반드시 끝난다
//   ⑤ CI 워크플로가 파일을 복사하고 MainActivity 에 등록한다 · 웹 연결(RouteFetch · 예전 방식 코드 그대로)
// 실행: node test/route_fetch_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { const r = await fn(); if (r === 'skip') { skipped++; console.log('  skip ', name); } else { pass++; console.log('  ok  ', name); } } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 1500)); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = n => path.join(ROOT, 'native', n);
const rd = f => fs.readFileSync(f, 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rfjvm-'));
  await t('RouteFetchCore 를 JVM 에서 컴파일하고 자체 점검(RouteFetchJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), N('HomeSearchCore.java'), N('RouteFetchCore.java'), path.join(__dirname, 'java', 'RouteFetchJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', core, 'com.dullyyj.subway.RouteFetchJvmTest'], { env: ENV, encoding: 'utf8' });
    const o = r.stdout || '';
    assert.strictEqual(r.status, 0, o.split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(o), o.slice(-300));
    console.log('        ' + (o.match(/^ok /gm) || []).length + '개 점검');
  });
  const C = rd(N('RouteFetchCore.java')), Cc = strip(C);
  await t('코어는 안드로이드·네트워크·시계·스레드를 직접 쓰지 않는다(순수)', async () => {
    assert.ok(!/import\s+android\.|java\.net|HttpURLConnection|System\.currentTimeMillis|nanoTime|SystemClock|Random|new Thread|Handler|Executor/.test(Cc), '순수 자바여야 한다');
  });
  await t('코어는 판단하지 않는다 — liveStat·livePending·ldWait·liveMissing 을 읽는 코드가 없다(엔진 follow 지시만 따른다)', async () => {
    assert.ok(!/liveStat|livePending|ldWait|liveMissing|liveApplied/.test(Cc), '엔진 몫인 판단 코드가 자바에 있다');
    assert.ok(/"next"/.test(Cc) && /"draw"/.test(Cc), 'follow.next / follow.draw 를 따른다');
  });
  const P = rd(N('RouteFetchPlugin.java')), Pc = strip(P);
  await t('플러그인을 최소 android 스텁(+코어·ScreenCore·HomeSearchCore)으로 컴파일', async () => {
    const o = path.join(out, 'stub'); fs.mkdirSync(o);
    const stubs = walk(path.join(__dirname, 'android-stubs'), '.java');
    const r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', o].concat(stubs, [N('ScreenCore.java'), N('HomeSearchCore.java'), N('RouteFetchCore.java'), N('RouteFetchPlugin.java')]), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 2000));
  });
  await t('진짜 android.jar 로 플러그인 컴파일(Capacitor 는 CI 에서만 — 없으면 건너뜀)', async () => {
    const jar = findAndroidJar(); if (!jar) return 'skip';
    const cap = path.join(out, 'cap'), j = path.join(out, 'j'); fs.mkdirSync(cap); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', cap].concat(walk(path.join(__dirname, 'android-stubs', 'com'), '.java')), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', [jar, cap].join(path.delimiter), '-d', j, N('ScreenCore.java'), N('HomeSearchCore.java'), N('RouteFetchCore.java'), N('RouteFetchPlugin.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)).join(' / ').slice(0, 1500));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'RouteFetchPlugin.class')));
  });
  await t('플러그인 계약: 이름 · 메서드 · 이벤트 · 낡은 요청 버림 · 경로 주소만 · 제한시간', async () => {
    assert.ok(/@CapacitorPlugin\(name = "RouteFetch"\)/.test(P) && /public class RouteFetchPlugin extends Plugin/.test(P), '플러그인 이름');
    for (const m of ['request', 'once', 'last', 'cancel', 'status']) assert.ok(new RegExp('@PluginMethod\\s+public void ' + m + '\\(').test(P), m + ' 메서드');
    assert.ok(/notifyListeners\("route"/.test(P), "'route' 이벤트");
    assert.ok((P.match(/isRouteUrl\(url\)/g) || []).length >= 2 && /call\.reject\(/.test(P), '경로 서버 주소가 아니면 거절(request · once 모두)');
    assert.ok(/gen != my/.test(P) && /\+\+gen/.test(P), '새 request 가 오면 이전 것은 낡은 요청(gen)');
    assert.ok(/setConnectTimeout\(/.test(P) && /setReadTimeout\(timeoutMs\)/.test(P) && /code != 200/.test(P) && /MAX_BODY/.test(P), '제한시간 · 200 이 아니면 실패 · 응답 크기 상한');
    assert.ok(/"timeout"/.test(P), '시간초과는 웹이 알아보는 글자(timeout)로');
  });
  await t('호출은 반드시 끝난다 — 예외·실행 실패에도 resolve (웹이 영영 기다리지 않는다)', async () => {
    assert.ok(/AtomicBoolean resolved/.test(P) && (P.match(/resolved\.compareAndSet\(false, true\)/g) || []).length >= 3, 'first 는 한 번만 resolve');
    assert.ok(/catch \(Throwable t\)[\s\S]{0,200}failObj\(id, "first"/.test(P) && /catch \(Throwable t\)[\s\S]{0,200}failObj\(id, "retry"/.test(P), '예외 → 실패 객체로 resolve');
  });
  await t('플러그인은 판단·화면과 섞이지 않는다', async () => {
    assert.ok(!/liveStat|livePending|ldWait|liveMissing/.test(Pc), '판단 코드가 없다(엔진 follow)');
    assert.ok(!/ScreenNative|ScreenView|ScreenCore\.(load|Screen)/.test(Pc), '화면 플러그인과 섞이지 않는다');
    const S = rd(N('ScreenNativePlugin.java')); assert.ok(!/RouteFetch|HttpURLConnection/.test(S), 'ScreenNativePlugin 은 통신이 없다');
  });
  await t('CI 워크플로가 파일을 복사하고 MainActivity 에 등록한다 · 시험이 CI 에 올라 있다', async () => {
    const wf = rd(path.join(ROOT, '.github/workflows/build-apk.yml'));
    assert.ok(wf.indexOf('"native/RouteFetchCore.java"') > 0 && wf.indexOf('"native/RouteFetchPlugin.java"') > 0, '복사 목록');
    assert.ok(wf.indexOf('"        registerPlugin(RouteFetchPlugin.class);",') > 0, '플러그인 등록');
    for (const f of ['route_follow.test.js', 'route_fetch_native.test.js', 'route_rtf.ui.test.js']) assert.ok(wf.indexOf('- ' + f) > 0, f + ' 가 CI 시험 목록에 있다');
    const sc = rd(path.join(__dirname, 'scene_native_java.test.js')); assert.ok(sc.indexOf("'RouteFetchPlugin'") > 0, 'MainActivity 가짜 목록(scene_native_java)에 있다');
  });
  await t('웹: 같은 경로 서버 주소를 자바가 받아들인다 · 예전 방식 코드(_fetchJson · _routeStagedWeb)가 그대로 있다', async () => {
    const h = rd(path.join(ROOT, 'www/index.html'));
    assert.ok(h.indexOf("C.Plugins.RouteFetch") > 0, '웹이 플러그인을 쓴다');
    assert.ok(h.indexOf('var _routeStagedWeb = function()') > 0 && h.indexOf('var _fetchJson = function(url, ms)') > 0, '예전 방식(폴백)');
    assert.ok(/_ROUTE_V2_PATH = '\/route-v2-app'/.test(h), '웹 경로 이름이 /route-v2-app');
    for (const f of ['_ldReselect', '_depCompareStart', '_commutePrefetch']) assert.ok(h.indexOf(f) > 0, f);
    assert.ok((h.match(/_routeGetJson\(/g) || []).length >= 4, '보조 요청이 같은 통로를 쓴다');
    // 웹이 보내는 모양의 주소를 자바 검사기에 통과시켜 본다
    const r = spawnSync('java', ['-cp', path.join(out, 'core'), '-Dfile.encoding=UTF-8', 'com.dullyyj.subway.RouteFetchJvmTest'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0);
  });
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { }
  console.log(`route_fetch_native: ${pass} pass, ${fail} fail${skipped ? ', ' + skipped + ' skip' : ''}`);
  process.exit(fail ? 1 : 0);
})();
