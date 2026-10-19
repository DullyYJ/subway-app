// 저장값 보관(앱 본체·자바) 검증 — 2026-10-19 (5번 4단계: 저장값·설정을 앱 본체에도)
//   ① 순수 자바 코어(StoreCore)를 JVM 에서 컴파일하고 자체 점검(java StoreJvmTest) 통과 — 키 모양 · 한도 · 적용 · 인코딩 왕복
//   ② 코어는 안드로이드·네트워크·시계·스레드를 직접 쓰지 않는다 · 어떤 키가 설정인지 같은 목록(판단)이 자바에 없다(엔진 몫)
//   ③ 플러그인(StorePlugin)을 손으로 쓴 최소 android 스텁으로 컴파일 — 진짜 android.jar 가 있으면 그걸로도(CI)
//   ④ 플러그인 계약: 이름 · 메서드 · 호출은 반드시 끝난다 · 판단과 섞이지 않는다
//   ⑤ CI 워크플로가 파일을 복사하고 MainActivity 에 등록한다 · 웹 연결
// 실행: node test/store_native.test.js   (javac · java 필요)
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'stjvm-'));
  await t('StoreCore 를 JVM 에서 컴파일하고 자체 점검(StoreJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), N('HomeSearchCore.java'), N('StoreCore.java'), path.join(__dirname, 'java', 'StoreJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', core, 'com.dullyyj.subway.StoreJvmTest'], { env: ENV, encoding: 'utf8' });
    const o = r.stdout || '';
    assert.strictEqual(r.status, 0, o.split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(o), o.slice(-300));
    console.log('        ' + (o.match(/^ok /gm) || []).length + '개 점검');
  });
  const C = rd(N('StoreCore.java')), Cc = strip(C);
  await t('코어는 안드로이드·네트워크·시계·스레드를 직접 쓰지 않는다(순수)', async () => {
    assert.ok(!/import\s+android\.|java\.net|HttpURLConnection|System\.currentTimeMillis|nanoTime|SystemClock|Random|new Thread|Handler|Executor|SharedPreferences/.test(Cc), '순수 자바여야 한다');
  });
  await t('코어·플러그인은 판단하지 않는다 — 어떤 키를 보관할지 같은 목록이 없다(엔진 store-sync 의 정책)', async () => {
    const P0 = strip(rd(N('StorePlugin.java')));
    for (const [n, s0] of [['코어', Cc], ['플러그인', P0]]) {
      const s = s0.replace(/"gdm_store"/g, '""');   // 보관 파일 이름 하나만 예외(정책 목록 아님)
      assert.ok(!/gdm_|app_theme|notifPref|commuteAlarm|mk_favorites|savedBusStops|ovlOn|busProxyUrl|sentinel|denySuffix|prefix/i.test(s), n + ': 키 이름·정책 목록이 자바에 있다');
    }
  });
  const P = rd(N('StorePlugin.java')), Pc = strip(P);
  await t('플러그인을 최소 android 스텁(+코어·ScreenCore·HomeSearchCore)으로 컴파일', async () => {
    const o = path.join(out, 'stub'); fs.mkdirSync(o);
    const stubs = walk(path.join(__dirname, 'android-stubs'), '.java');
    const r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', o].concat(stubs, [N('ScreenCore.java'), N('HomeSearchCore.java'), N('StoreCore.java'), N('StorePlugin.java')]), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 2000));
  });
  await t('진짜 android.jar 로 플러그인 컴파일(Capacitor 는 CI 에서만 — 없으면 건너뜀)', async () => {
    const jar = findAndroidJar(); if (!jar) return 'skip';
    const cap = path.join(out, 'cap'), j = path.join(out, 'j'); fs.mkdirSync(cap); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', cap].concat(walk(path.join(__dirname, 'android-stubs', 'com'), '.java')), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', [jar, cap].join(path.delimiter), '-d', j, N('ScreenCore.java'), N('HomeSearchCore.java'), N('StoreCore.java'), N('StorePlugin.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)).join(' / ').slice(0, 1500));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'StorePlugin.class')));
  });
  await t('플러그인 계약: 이름 · 메서드 · 구조 검사는 코어에 맡긴다 · 다른 자바 기능이 읽을 read()', async () => {
    assert.ok(/@CapacitorPlugin\(name = "Store"\)/.test(P) && /public class StorePlugin extends Plugin/.test(P), '플러그인 이름');
    for (const m of ['snapshot', 'apply', 'get', 'clear', 'status']) assert.ok(new RegExp('@PluginMethod\\s+public void ' + m + '\\(').test(P), m + ' 메서드');
    assert.ok(/StoreCore\.applyJson\(/.test(Pc) && /StoreCore\.encode\(/.test(Pc) && /StoreCore\.decode\(/.test(Pc), '검사·인코딩은 코어');
    assert.ok(/public static String read\(Context c, String key, String def\)/.test(P), '자바 쪽 읽기(read)');
    assert.ok(/"gdm_store"/.test(P), '보관 파일 이름');
  });
  await t('호출은 반드시 끝난다 — 모든 메서드가 예외에도 resolve (웹이 영영 기다리지 않는다)', async () => {
    for (const m of ['snapshot', 'apply', 'get', 'clear', 'status']) {
      const i = Pc.indexOf('public void ' + m + '('); assert.ok(i > 0, m);
      const seg = Pc.slice(i, Pc.indexOf('@PluginMethod', i) > 0 ? Pc.indexOf('@PluginMethod', i) : Pc.length);
      assert.ok(/catch \(Throwable t\)[\s\S]{0,120}call\.resolve\(fail\(/.test(seg), m + ': 예외 → 실패 객체로 resolve');
    }
    assert.ok(!/call\.reject\(/.test(Pc), 'reject 를 쓰지 않는다(항상 resolve)');
  });
  await t('CI 워크플로가 파일을 복사하고 MainActivity 에 등록한다 · 시험이 CI 에 올라 있다', async () => {
    const wf = rd(path.join(ROOT, '.github/workflows/build-apk.yml'));
    assert.ok(wf.indexOf('"native/StoreCore.java"') > 0 && wf.indexOf('"native/StorePlugin.java"') > 0, '복사 목록');
    assert.ok(wf.indexOf('"        registerPlugin(StorePlugin.class);",') > 0, '플러그인 등록');
    for (const f of ['store_sync.test.js', 'store_native.test.js', 'store_sto.ui.test.js']) assert.ok(wf.indexOf('- ' + f) > 0, f + ' 가 CI 시험 목록에 있다');
    const sc = rd(path.join(__dirname, 'scene_native_java.test.js')); assert.ok(sc.indexOf("'StorePlugin'") > 0, 'MainActivity 가짜 목록(scene_native_java)에 있다');
  });
  await t('웹: 같은 플러그인을 쓴다 · 정책은 엔진(/store-policy·/store-merge)에서 받는다 · 저장소는 localStorage 그대로(폴백)', async () => {
    const h = rd(path.join(ROOT, 'www/index.html'));
    assert.ok(h.indexOf('C.Plugins.Store') > 0, '웹이 플러그인을 쓴다');
    assert.ok(/\/store-policy/.test(h) && /\/store-merge/.test(h), '엔진 길');
    assert.ok(h.indexOf("localStorage.getItem('gdm_rtf')") > 0, '예전 localStorage 읽기가 그대로 있다');
  });
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { }
  console.log(`store_native: ${pass} pass, ${fail} fail${skipped ? ', ' + skipped + ' skip' : ''}`);
  process.exit(fail ? 1 : 0);
})();
