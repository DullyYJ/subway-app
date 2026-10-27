// 내 위치 공유 GIF(네이티브) 검증 — 2026-10-27 (s245)
//   ① GifEnc(순수 자바 GIF 인코더)가 만든 파일을 표준 디코더로 다시 읽어 프레임이 복원된다(색 블록 · 투명 · 무작위 · LZW 사전 비움)
//   ② ShareAnim(친구 한 마리 오가기 · 마커 깜박임)이 반복해도 끊기지 않고 순간이동·범위 밖이 없다
//   ③ ShareArt 가 GIF 를 그리고(마커 깜박임 · 친구) ShellActivity 가 GIF 로 보내되 실패하면 PNG 로 보낸다 · 공유 제공자가 .gif 를 연다
// 실행: node test/share_gif.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message || e).split('\n').slice(0, 6).join('\n        ')); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = n => path.join(ROOT, 'native', 'shell', n);
(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gifjvm-'));
  await t('GifEnc · ShareAnim 를 JVM 에서 컴파일하고 자체 점검(ShareGifJvmTest check)이 모두 통과', async () => {
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out, N('GifEnc.java'), N('ShareAnim.java'), N('WidgetSim.java'), N('WidgetGeo.java'), path.join(__dirname, 'java', 'ShareGifJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', out, 'com.dullyyj.subway.ShareGifJvmTest', 'check'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join(' / ').slice(0, 1500));
    assert.ok(/ALL OK/.test(r.stdout), 'ALL OK');
    assert.ok((r.stdout.match(/^ok /gm) || []).length >= 14, '점검 수');
  });
  await t('순수 코드는 안드로이드를 쓰지 않는다', async () => {
    for (const f of ['GifEnc.java', 'ShareAnim.java']) assert.ok(!/import\s+android\./.test(fs.readFileSync(N(f), 'utf8')), f);
  });
  await t('ShareArt.gif: 바탕 + 프레임마다 마커(퍼지는 물결 · 깜박이는 점)와 친구(걷는 시트 한 칸)를 그려 GifEnc 로 넘긴다 — 글·역·시각은 새로 짓지 않는다', async () => {
    const s = fs.readFileSync(N('ShareArt.java'), 'utf8');
    assert.ok(/static byte\[\] gif\(/.test(s) && /new ShareAnim\(/.test(s) && /GifEnc\.encode\(/.test(s) && /chars3d\/" \+ an\.id/.test(s));
    assert.ok(/ShareAnim\.N/.test(s) && /an\.pulse\[i\]/.test(s) && /an\.sheet\[i\]/.test(s) && /an\.face\[i\]/.test(s));
    assert.ok(/draw\(d, pal, mk\)/.test(s) && /mk\[0\] = x; mk\[1\] = ly;/.test(s), '바탕은 마커를 빼고 그 자리만 알려 준다');
  });
  await t('ShellActivity: 공유는 GIF 로 만들어 image/gif 로 보내고, 실패하면 PNG 로 보낸다 · ShareProvider 가 .gif 를 열고 형식을 안다', async () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), p = fs.readFileSync(N('ShareProvider.java'), 'utf8');
    assert.ok(/ShareArt\.gif\(ShellActivity\.this, sh, pal, ts\)/.test(a) && /\.gif"\)/.test(a) && /mime = "image\/gif"/.test(a));
    assert.ok(/ShareArt\.draw\(sh, pal\)/.test(a) && /mime = "image\/png"/.test(a) && /startShare\(sh\.text, fu, fm\)/.test(a));
    assert.ok(/\(png\|gif\)/.test(p) && /image\/gif/.test(p));
  });
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
