// 폰 안의 승차 엔진(RideLocal) 검증 — 2026-10-22
//   YJ 핵심 규칙: "탑승이 확정된 이후에는 외부 서버 요청을 일체 발생시키지 않는다."
//   ① 서버 엔진(ride-standby · ride-eta · ride-track · posfusion)을 옮긴 자바가 서버 JS 가 낸 답(녹화본)과 같은 값을 낸다
//   ② 순수 자바 — 안드로이드·네트워크·시계를 쓰지 않는다
//   ③ RideService 의 5초 걸음은 서버를 부르지 않는다(시각표가 필요한 [탑승] 한 번만 예외) · 추천 문구는 탑승 전에 받아 둔 글만 쓴다
// 실행: node test/ride_local.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message || e).split('\n').slice(0, 8).join('\n        ')); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = n => path.join(ROOT, 'native', 'shell', n);
const CORE = ['ScreenCore', 'ShellCore', 'HomeSearchCore', 'HomeCore', 'WalkCore', 'BoardCore', 'ChatCore', 'FoodCore', 'MapCore', 'FavCore', 'HcardsCore', 'RideCore', 'RulesCore', 'LegacyCore', 'CmCore', 'GwCore', 'DevCore', 'ErrCore', 'ShareCore', 'OvCore', 'RsCore', 'ActRowCore', 'TileMapCore', 'NetPost', 'PerfLog', 'Latest', 'Debounce', 'Swr', 'RunnerCore', 'SceneModel'];
const RIDE = ['RideJs', 'RideTrackJ', 'RideEtaJ', 'RideStandbyJ', 'RidePosFusionJ', 'RideLocal'];
(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rlocal-'));
  await t('폰 안 엔진이 서버 엔진의 녹화된 답(eta · standby · track)과 모두 같다', async () => {
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out].concat(CORE.concat(RIDE).map(c => N(c + '.java')), [path.join(__dirname, 'java', 'RideLocalJvmTest.java')]), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', path.join(__dirname, 'fixtures', 'ride_corpus.jsonl')], { env: ENV, encoding: 'utf8' });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1200) + (r.stderr || '').slice(-300));
    assert.ok(+/ALL OK \((\d+)\)/.exec(r.stdout)[1] >= 40, '녹화본이 너무 적다');
    assert.ok(!/FAIL/.test(r.stdout), r.stdout.slice(-800));
    console.log('        ' + r.stdout.split('\n').filter(l => /같음|RideLocal:|ALL OK/.test(l)).join(' / '));
    // s336: 새 규칙(승강장 신호 끊김 승차 · 거리 트리거+버스트 · 종착 고정)을 시뮬레이션에서 녹화한 답 — 새 상태 키도 빠짐없이(-Dstrict=1) 비교한다
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstrict=1', '-cp', out, 'com.dullyyj.subway.RideLocalJvmTest', path.join(__dirname, 'fixtures', 'ride_corpus_s336.jsonl')], { env: ENV, encoding: 'utf8' });
    assert.ok(/ALL OK \((\d+)\)/.test(r.stdout), (r.stdout || '').slice(-1500) + (r.stderr || '').slice(-300));
    assert.ok(+/ALL OK \((\d+)\)/.exec(r.stdout)[1] >= 30, 's336 녹화본이 너무 적다');
    console.log('        s336: ' + r.stdout.split('\n').filter(l => /같음|ALL OK/.test(l)).join(' / '));
  });
  await t('계산 코어는 안드로이드·네트워크·시계를 쓰지 않는다(순수 자바)', async () => {
    for (const c of RIDE) {
      const src = fs.readFileSync(N(c + '.java'), 'utf8').replace(/System\.currentTimeMillis\(\)/g, '0');   // 서버 JS 의 'nowMs 없으면 Date.now()' 대비 줄만 허용(승차 엔진은 늘 nowMs 를 준다)
      assert.ok(!/import\s+android\.|HttpURLConnection|NetPost|System\.currentTimeMillis|SystemClock|new Random|java\.io\.File|java\.net\./.test(src), c + ' 는 순수 계산이어야 한다');
    }
  });
  await t('탑승 서비스: 5초 걸음은 폰 안에서 계산하고, 서버는 [탑승] 시각표 한 번만 부른다', async () => {
    const s = fs.readFileSync(N('RideService.java'), 'utf8');
    const posts = s.match(/NetPost\.post\([^;]*\);/g) || [];
    assert.strictEqual(posts.length, 3, '서버 호출은 시각표 한 번 + 승차 대기 중 실시간 다음 차(/board-live) + 추천 문구 미리 받기 한 번뿐이어야 한다: ' + posts.join(' | '));
    // 승차 대기 중 실시간 재보정(s196): 엔진이 ask 를 낼 때만(= 승차 대기 st.wait 중에만) 부른다 — 탑승이 확정되면 엔진이 묻지 않으므로 요청 0
    assert.ok(/s\.askBody\.length\(\) > 0\) fetchBoardLive\(s\.askBody\)/.test(s) && /NetPost\.post\(ShellCore\.BASE \+ "\/board-live"/.test(s), '/board-live 는 엔진의 ask 로만');
    assert.ok(!/fetchBoardLive\([^)]*\)[\s\S]{0,40}(RideLocal\.step)/.test(s), '걸음 계산과 섞이지 않는다');
    assert.ok(/RideLocal\.needsTable\(body\)[\s\S]{0,200}NetPost\.post\(ShellCore\.BASE \+ "\/ride-standby"/.test(s), '/ride-standby 는 needsTable 일 때만');
    assert.ok(/if \(resp == null\) resp = RideLocal\.step\(body\)/.test(s), '나머지는 로컬 엔진');
    const i = s.indexOf('private void fireReco');
    const fr = s.slice(i, s.indexOf('private void fireAlert'));
    assert.ok(i > 0 && !/NetPost/.test(fr) && /RecoNotify\.sendCached\(/.test(fr), '추천 알림은 받아 둔 문구로 띄운다(서버 요청 없음)');
    // s237: 받아 둔 글이 없거나 시간대가 달라진 때만(한 여정에 한 번뿐인 추천이 사라지지 않게) 바로 한 번 받는다
    assert.ok(/if \(ok \|\| recoLive\) return;[\s\S]*RecoNotify\.send\(app, body, core\)/.test(fr), '받아 둔 문구가 없을 때만 바로 받는다');
    assert.ok(/prefetchReco\(body, resp\)/.test(s) && /RideLocal\.prefetchBody/.test(s), '추천 문구는 탑승 전에 미리 받는다');
    const n = fs.readFileSync(N('RecoNotify.java'), 'utf8');
    assert.ok(/static boolean sendCached\(/.test(n), '받아 둔 글로 알림');
  });
  console.log(`\n${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
