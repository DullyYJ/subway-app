// 네이티브 캐릭터 장면(혼잡도 카드) 검증 — 2026-10-21 (s100)
//   ① 엔진(sceneDecide)이 만든 장면 JSON 여러 개를 SceneCore(순수 자바)에 먹여 JVM 에서 점검(SceneJvmTest check): 동작·착지·꾹 눌러 옮기기·화면 안 유지·결정성
//   ② 스프라이트 시트 7장이 앱 assets/chars3d 에 있고 ios-reference 원본과 같다
//   ③ 화면 그리개(ScreenView)가 장면 노드를 그리고 손가락을 잇는다 · SceneCore 는 android.* 를 쓰지 않는다
// 실행: node test/scene_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = n => path.join(ROOT, 'native', 'shell', n);
const { sceneDecide } = require('../engine/scene.js');
(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scn-'));
  await t('엔진 장면 JSON → SceneCore 점검(SceneJvmTest)이 모두 통과한다', async () => {
    const dir = path.join(out, 'scn'), cls = path.join(out, 'cls'); fs.mkdirSync(dir); fs.mkdirSync(cls);
    const noon = Date.UTC(2026, 9, 21, 3, 0, 0), w = (o, n) => fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(o));
    const idle = (h, wx, shown) => sceneDecide({ nowMs: Date.UTC(2026, 9, 21, h - 9, 0, 0), tzOffsetMin: 540, locked: false, routeShown: shown }, wx);
    w(idle(12, { temp: 18, rain: 0, txt: '맑음' }, false), 'scn_idle_noon_clear');
    w(idle(23, { temp: 5, rain: 0, txt: '맑음' }, true), 'scn_idle_night_clear');
    w(idle(8, { temp: -2, rain: 90, txt: '눈' }, true), 'scn_idle_morning_snow');
    w(idle(19, { temp: 20, rain: 70, txt: '비' }, true), 'scn_idle_evening_rain');
    const bus = [{ name: '출발', isOrigin: true }, { name: '정류장A', isBus: true, lineName: '6001' }, { name: '정류장B', isBus: true, lineName: '6001' }, { name: '정류장C', isBus: true, lineName: '6001' }, { name: '도착' }];
    w(sceneDecide({ nowMs: noon, tzOffsetMin: 540, locked: true, here: 1, boarded: false, key: 'k', nodes: bus }, { temp: 12, rain: 80, txt: '비' }), 'scn_wait_bus_rain');
    w(sceneDecide({ nowMs: noon, tzOffsetMin: 540, locked: true, here: 2, boarded: true, key: 'k', nodes: bus }, { temp: 12, rain: 0, txt: '맑음' }), 'scn_ride_bus');
    w(sceneDecide({ nowMs: noon, tzOffsetMin: 540, locked: true, here: 0, boarded: false, key: 's', nodes: [{ name: '출발', isOrigin: true }, { name: '강남', isSub: true, lineName: '2호선' }, { name: '역삼', isSub: true, lineName: '2호선' }, { name: '도착' }] }, null), 'scn_wait_sub');
    const files = ['SceneCore', 'SceneActs', 'SceneArt', 'SceneFx', 'ScenePlaces', 'SceneModel', 'SceneUtil', 'SceneHaptics', 'SceneCv'].map(n => N(n + '.java')).concat([path.join(__dirname, 'java', 'AwtCv.java'), path.join(__dirname, 'java', 'SceneJvmTest.java')]);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', cls].concat(files), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Djava.awt.headless=true', '-cp', cls, 'com.dullyyj.subway.SceneJvmTest', 'check', dir], { env: ENV, encoding: 'utf8', timeout: 240000 });
    assert.ok(/ALL OK/.test(r.stdout) && r.status === 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join('\n') + (r.stderr || ''));
  });
  await t('스프라이트 시트 7장이 앱 assets 에 있고 원본과 같다', async () => {
    const ids = ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng', 'dudung_intro'];
    for (const id of ids) {
      const a = path.join(ROOT, 'shell-android/app/src/main/assets/chars3d', id + '.webp'), b = path.join(ROOT, 'ios-reference/chars3d', id + '.webp');
      assert.ok(fs.existsSync(a), id + ' 없음'); assert.ok(Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0, id + ' 원본과 다름');
    }
    const drv = fs.readFileSync(N('SceneDriver.java'), 'utf8');
    assert.ok(/DIR = "chars3d\/"/.test(drv), '읽는 폴더가 assets/chars3d 가 아님');
  });
  await t('자세 시트(s209): 6종 <id>_pose.webp 가 앱 assets 에 있고(4×2 칸), 앱은 없어도 걷기 시트로 그린다 · 날씨 반응 동작 8가지가 등록돼 있다', async () => {
    for (const id of ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng']) {
      const f = path.join(ROOT, 'shell-android/app/src/main/assets/chars3d', id + '_pose.webp'); assert.ok(fs.existsSync(f), id + '_pose 없음');
      const b = fs.readFileSync(f); assert.ok(b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' && b.length > 10000 && b.length < 120000, id + '_pose 크기·형식');
    }
    const drv = fs.readFileSync(N('SceneDriver.java'), 'utf8'), core = fs.readFileSync(N('SceneCore.java'), 'utf8'), acts = fs.readFileSync(N('SceneActs.java'), 'utf8');
    assert.ok(/_pose\.webp/.test(drv) && /catch \(Throwable t2\)/.test(drv), '자세 시트는 읽기에 실패해도 장면이 멈추지 않는다');
    assert.ok(/psh != null/.test(core) && /host\.sheet\(a\.id \+ "_pose"\)/.test(core), '자세 시트가 없으면 걷기 시트');
    for (const n of ['shiver', 'pant', 'squint', 'gust', 'splash', 'shakeoff', 'snowcatch', 'peer']) assert.ok(new RegExp('A_\\(S, "' + n + '"').test(acts), n + ' 동작 등록');
    assert.ok(/wsay\(S, a, "shiver"/.test(acts) && /traits\.get\(a\.id\)/.test(acts), '말은 엔진(traits.say)이 정한 글만 띄운다');
  });
  await t('SceneCore·SceneArt·SceneActs 는 android.* 를 쓰지 않는다(순수 자바)', async () => {
    for (const n of ['SceneCore', 'SceneActs', 'SceneArt', 'SceneFx', 'ScenePlaces', 'SceneModel', 'SceneUtil', 'SceneHaptics', 'SceneCv']) assert.ok(!/import android\./.test(fs.readFileSync(N(n + '.java'), 'utf8')), n + ' 에 android import');
  });
  await t('ScreenView 가 장면 노드를 그리고 · 손가락으로 잡을 수 있고 · 떼면 놓고 · 안 보이면 저절로 멈춘다', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), c = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/case ScreenCore\.K_SCENE: drawScene\(cv, it\)/.test(v) && /"scene"\.equals\(t\)/.test(c) && /K_SCENE = 35/.test(c));
    assert.ok(/scene\.touchDown\(/.test(v) && /scene\.touchMove\(/.test(v) && /scene\.touchUp\(\)/.test(v) && /scene\.isHeld\(\)/.test(v), '손가락 연결');
    assert.ok(/sceneDrawn = false;/.test(v) && /if \(sceneDrawn && scene != null && scene\.isRunning\(\)/.test(v), '보일 때만 프레임을 잇는다');
    assert.ok(/scene\.destroy\(\)/.test(v), '창에서 떨어지면 비트맵을 돌려준다');
  });
  console.log(pass + ' 통과 / ' + fail + ' 실패'); if (fail) process.exit(1);
})();
