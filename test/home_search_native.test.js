// 홈 후보 검색(앱 본체·자바) 검증 — 2026-10-19 (5번 2단계: 데이터 계층을 웹뷰 밖으로)
//   ① 순수 자바 코어(HomeSearchCore)를 JVM 에서 컴파일하고 자체 점검(java HomeSearchJvmTest) 통과 — 주소·응답 읽기·후보 뽑기·이벤트 JSON·저장본
//   ② 만든 주소가 웹의 예전 코드(encodeURIComponent 로 만든 /tago · /kakao-local 주소)와 글자 하나까지 같다
//   ③ 코어는 안드로이드·네트워크·시계를 쓰지 않는다 (통신·타이머·저장은 플러그인)
//   ④ 플러그인(HomeSearchPlugin)을 손으로 쓴 최소 android 스텁으로 컴파일(문법·이름·타입) — 진짜 android.jar 가 있으면 그걸로도(CI 러너엔 SDK 가 있다)
//   ⑤ 플러그인 계약: 디바운스 300ms · 최신 검색어만(gen) · 저장본 · 실패는 이벤트로 알림 · 지하철은 안 함 · ScreenNative 와 섞이지 않음
//   ⑥ CI 워크플로가 파일을 복사하고 MainActivity 에 플러그인을 등록한다 · 웹과 같은 서버 주소
// 실행: node test/home_search_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { const r = await fn(); if (r === 'skip') { skipped++; console.log('  skip ', name); } else { pass++; console.log('  ok  ', name); } } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 1500)); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = n => path.join(ROOT, 'native', n);
const rd = f => fs.readFileSync(f, 'utf8');
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hsjvm-'));
  let jvmOut = '';
  await t('HomeSearchCore 를 JVM 에서 컴파일하고 자체 점검(HomeSearchJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), N('HomeSearchCore.java'), path.join(__dirname, 'java', 'HomeSearchJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', core, 'com.dullyyj.subway.HomeSearchJvmTest'], { env: ENV, encoding: 'utf8' });
    jvmOut = r.stdout || '';
    assert.strictEqual(r.status, 0, jvmOut.split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(jvmOut), jvmOut.slice(-300));
    console.log('        ' + (jvmOut.match(/^ok /gm) || []).length + '개 점검');
  });
  await t('만든 주소가 웹의 예전 코드와 글자 하나까지 같다(encodeURIComponent)', async () => {
    const line = k => { const m = jvmOut.split('\n').find(l => l.startsWith(k + ' ')); assert.ok(m, k + ' 줄이 없다'); return m.slice(k.length + 1); };
    const E = encodeURIComponent, TAGO = 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList';
    // 웹: _busStopSearchByName / _kakaoLocal 이 만드는 주소(index.html 의 같은 식)
    const webBus = (base, q) => base + '/tago?url=' + E(TAGO + '?serviceKey=' + E('') + '&nodeNm=' + E(q) + '&_type=json');
    const webPlc = (base, q) => base + '/kakao-local?path=' + E('search/keyword.json') + '&qs=' + E('query=' + E(q) + '&size=5');
    assert.strictEqual(line('URL-ENC'), E('강남 역/a&b=c?d#e+f\'(g)*!~-_.é😀'));
    assert.strictEqual(line('URL-BUS'), webBus('https://srv.example', '강남역 2번'));
    assert.strictEqual(line('URL-BUS2'), webBus('https://gentle-lab-7e47subway-api.phg0643.workers.dev', '서울'));
    assert.strictEqual(line('URL-PLC'), webPlc('https://srv.example', '카페 & 빵'));
  });
  await t('코어는 안드로이드·네트워크·시계를 쓰지 않는다(순수 계산)', async () => {
    const src = rd(N('HomeSearchCore.java'));
    assert.ok(!/import\s+android\.|java\.net|HttpURLConnection|System\.currentTimeMillis|SystemClock|Random|Thread|Handler/.test(src), '순수 자바여야 한다');
  });
  await t('플러그인을 최소 android 스텁(+코어·ScreenCore)으로 컴파일', async () => {
    const o = path.join(out, 'stub'); fs.mkdirSync(o);
    const stubs = walk(path.join(__dirname, 'android-stubs'), '.java');
    const r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', o].concat(stubs, [N('ScreenCore.java'), N('HomeSearchCore.java'), N('HomeSearchPlugin.java')]), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 2000));
  });
  await t('진짜 android.jar 로 플러그인 컴파일(Capacitor 는 CI 에서만 — 없으면 건너뜀)', async () => {
    const jar = findAndroidJar(); if (!jar) return 'skip';
    // Capacitor 라이브러리는 이 환경에 없으니 스텁(com/getcapacitor)만 jar 로 먼저 컴파일하고, 플러그인은 [jar + 그 스텁]으로 컴파일한다(화면 플러그인 시험과 같은 방식).
    const cap = path.join(out, 'cap'), j = path.join(out, 'j'); fs.mkdirSync(cap); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', cap].concat(walk(path.join(__dirname, 'android-stubs', 'com'), '.java')), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', [jar, cap].join(path.delimiter), '-d', j, N('ScreenCore.java'), N('HomeSearchCore.java'), N('HomeSearchPlugin.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)).join(' / ').slice(0, 1500));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'HomeSearchPlugin.class')));
  });
  const P = rd(N('HomeSearchPlugin.java'));
  await t('플러그인 계약: 이름 · 메서드 · 이벤트 · 디바운스 · 최신 것만 · 저장본', async () => {
    assert.ok(/@CapacitorPlugin\(name = "HomeSearch"\)/.test(P) && /public class HomeSearchPlugin extends Plugin/.test(P), '플러그인 이름');
    for (const m of ['query', 'cancel', 'status']) assert.ok(new RegExp('@PluginMethod\\s+public void ' + m + '\\(').test(P), m + ' 메서드');
    assert.ok(/DEFAULT_DELAY_MS = 300/.test(P) && /ui\.postDelayed\(pending, delay\)/.test(P) && /ui\.removeCallbacks\(pending\)/.test(P), '디바운스 300ms · 새 query 가 이전 것을 취소');
    assert.ok(/if \(gen != my\) return;/.test(P) && (P.match(/gen != my/g) || []).length >= 3, '그새 새 검색어가 오면 버린다(gen)');
    assert.ok(/notifyListeners\("cands"/.test(P), "'cands' 이벤트");
    assert.ok(/failEvent\(/.test(P) && /okEvent\(/.test(P), '성공·실패 모두 이벤트로');
    assert.ok(/if \(!raw\.isEmpty\(\)\)/.test(P), '빈 결과는 저장본에 넣지 않는다(예전 웹 규칙)');
    assert.ok(/SharedPreferences/.test(P) && /placeCache\.load\(/.test(P) && /placeCache\.dump\(\)/.test(P), '장소 저장본은 기기에 남는다');
    assert.ok(/setConnectTimeout\(CONNECT_MS\)/.test(P) && /setReadTimeout\(READ_MS\)/.test(P) && /code != 200/.test(P), '통신 제한시간 · 200 이 아니면 실패');
    assert.ok(/synchronized \(lock\)/.test(P), '스레드 안전');
  });
  await t('플러그인은 지하철을 찾지 않고, 다른 화면 플러그인과 섞이지 않는다', async () => {
    const code = P.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/STNDB|HOME_STNS|지하철|station/i.test(code), '지하철 검색 코드가 없다(엔진이 한다)');
    assert.ok(!/ScreenNative|ScreenView|ScreenCore\.(load|Screen)/.test(P.replace(/\/\*[\s\S]*?\*\//g, '')), '화면 플러그인과 섞이지 않는다');
    const S = rd(N('ScreenNativePlugin.java')); assert.ok(!/HomeSearch|HttpURLConnection/.test(S), 'ScreenNativePlugin 은 통신이 없다');
  });
  await t('CI 워크플로가 파일을 복사하고 MainActivity 에 등록한다 · 시험이 CI 에 올라 있다', async () => {
    const wf = rd(path.join(ROOT, '.github/workflows/build-apk.yml'));
    assert.ok(wf.indexOf('"native/HomeSearchCore.java"') > 0 && wf.indexOf('"native/HomeSearchPlugin.java"') > 0, '복사 목록');
    assert.ok(wf.indexOf('"        registerPlugin(HomeSearchPlugin.class);",') > 0, '플러그인 등록');
    for (const f of ['home_search_native.test.js', 'home_cnd.ui.test.js', 'home_stations.ui.test.js']) assert.ok(wf.indexOf('- ' + f) > 0, f + ' 가 CI 시험 목록에 있다');
  });
  await t('웹도 같은 서버 주소(/tago · /kakao-local · search/keyword.json · size=5)를 쓴다 — 예전 방식 폴백이 그대로 있다', async () => {
    const h = rd(path.join(ROOT, 'www/index.html'));
    for (const s of ["'/tago?url='", "'/kakao-local?path='", "'search/keyword.json'", "'&size=5'", 'getSttnNoList']) assert.ok(h.indexOf(s) > 0, s);
    assert.ok(h.indexOf('function webBus(c, q)') > 0 && h.indexOf('function webPlace(c, q)') > 0, '예전 방식 함수(폴백)');
    assert.ok(h.indexOf("C.Plugins.HomeSearch") > 0, '웹이 플러그인을 쓴다');
  });
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { }
  console.log(`home_search_native: ${pass} pass, ${fail} fail${skipped ? ', ' + skipped + ' skip' : ''}`);
  process.exit(fail ? 1 : 0);
})();
