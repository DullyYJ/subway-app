// 네이티브 껍데기(ShellActivity — 웹뷰 없는 앱) 검증 — 2026-10-20 (s84)
//   ① 순수 자바 코어(ShellCore)를 JVM 에서 컴파일하고 자체 점검(ShellJvmTest)이 모두 통과
//   ② 코어는 안드로이드·네트워크·시계를 쓰지 않는다
//   ③ 안드로이드 계층(ShellActivity)을 진짜 android.jar 로 컴파일 — jar 가 없으면 건너뜀(CI 러너엔 SDK 가 있다)
//   ④ 껍데기는 웹뷰·글 만들기를 쓰지 않는다(엔진이 준 화면만 올린다)
//   ⑤ CI 워크플로가 파일을 복사하고 매니페스트에 ShellActivity 를 올린다
// 실행: node test/shell_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { const r = await fn(); if (r === 'skip') { skipped++; console.log('  skip ', name); } else { pass++; console.log('  ok  ', name); } } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message || e).split('\n').slice(0, 6).join('\n        ')); } };
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shjvm-'));
  await t('ShellCore 를 JVM 에서 컴파일하고 자체 점검(ShellJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), N('ShellCore.java'), path.join(__dirname, 'java', 'ShellJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', core, 'com.dullyyj.subway.ShellJvmTest'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(r.stdout), r.stdout.slice(-300));
    console.log('        ' + (r.stdout.match(/^ok /gm) || []).length + '개 점검');
  });
  await t('코어는 안드로이드·네트워크·시계를 쓰지 않는다(순수 계산)', async () => {
    const src = fs.readFileSync(N('ShellCore.java'), 'utf8');
    assert.ok(!/import\s+android\.|HttpURLConnection|System\.currentTimeMillis|SystemClock|Random|java\.io\.File/.test(src), '순수 자바여야 한다');
  });
  await t('안드로이드 계층(ShellActivity)을 진짜 android.jar 로 컴파일', async () => {
    const jar = findAndroidJar(); if (!jar) return 'skip';
    const cap = path.join(out, 'cap'), j = path.join(out, 'j'); fs.mkdirSync(cap); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', cap].concat(walk(path.join(__dirname, 'android-stubs', 'com'), '.java')), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-Xlint:-serial', '-Xlint:-this-escape', '-cp', [jar, cap].join(path.delimiter), '-d', j, N('ScreenCore.java'), N('NetPost.java'), N('ScreenView.java'), N('ShellCore.java'), N('ShellActivity.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)).join(' / ').slice(0, 1500));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'ShellActivity.class')));
  });
  await t('껍데기는 웹뷰를 쓰지 않고, 화면 글을 스스로 만들지 않는다(엔진이 준 JSON 만 올린다)', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    assert.ok(!/WebView|BridgeActivity|capacitor/i.test(v), '웹뷰 없음');
    assert.ok(/ScreenCore\.load\(/.test(v), '올리기 전에 검증');
    assert.ok(/NetPost\.(post|get)\(/.test(v), '통신은 허용 목록을 지키는 NetPost 로');
    assert.ok(!/HttpURLConnection|new URL\(/.test(v), '직접 통신 없음');
  });
  await t('CI: 파일 복사 · 매니페스트에 ShellActivity(두 번째 아이콘) · 시험 목록', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    assert.ok(/native\/ShellCore\.java/.test(y) && /native\/ShellActivity\.java/.test(y), '복사 목록');
    assert.ok(/\.ShellActivity/.test(y), '매니페스트');
    assert.ok(/shell_native\.test\.js/.test(y), '시험 목록');
  });
  console.log(`\n${pass} 통과 / ${fail} 실패 / ${skipped} 건너뜀`);
  process.exit(fail ? 1 : 0);
})();
