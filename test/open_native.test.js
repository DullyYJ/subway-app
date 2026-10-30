// 오프닝 화면(s299) 점검 — 앱을 켜면 길동무 친구들이 2초쯤 시간대별로 다른 움직임으로 인사한다
//   ① 엔진 대본(engine/open.js)이 사용자가 정한 7칸을 틈·겹침 없이 덮고 · 앱 assets/open.json 이 엔진 출력과 같다
//   ② OpenCore(순수 자바)가 같은 대본을 읽고 · 칸을 고르고 · 시각별 모습을 돌려준다 (OpenJvmTest)
//   ③ ShellActivity 연결: 처음 켤 때만 · 실패해도 앱은 연다 · 누르거나 뒤로 가기로 닫힌다 · 뒤 작업을 기다리지 않는다
// 실행: node test/open_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e && e.message || e).split('\n').slice(0, 8).join('\n        ')); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = f => path.join(ROOT, 'native/shell', f), ASSET = path.join(ROOT, 'shell-android/app/src/main/assets/open.json');
const E = require('../engine/open.js');

t('엔진 대본: 사용자가 정한 7칸(07-09 · 09-11 · 11-13 · 13-17 · 17-20 · 20-23 · 23-07)이 하루 24시간을 틈·겹침 없이 덮는다', () => {
  const want = { greet: [7, 9], morning: [9, 11], lunch: [11, 13], afternoon: [13, 17], evening: [17, 20], night: [20, 23], sleep: [23, 7] };
  assert.deepStrictEqual(E.OPEN_SLOTS.map(s => s.id), Object.keys(want));
  E.OPEN_SLOTS.forEach(s => assert.deepStrictEqual([s.h0, s.h1], want[s.id], s.id));
  for (let m = 0; m < 24 * 60; m += 5) { const h = m / 60, hit = E.OPEN_SLOTS.filter(s => s.h0 < s.h1 ? (h >= s.h0 && h < s.h1) : (h >= s.h0 || h < s.h1)); assert.strictEqual(hit.length, 1, h + ' 시에 칸이 ' + hit.length + '개'); assert.strictEqual(E.OPEN_SLOTS[E.openSlotIndex(h)].id, hit[0].id); }
});
t('엔진 대본: 칸마다 자리 셋의 연기 · 가운데 자리만 인사 · 제자리·콩콩 5% 안쪽 · 친구는 8마리(나올 사람은 앱이 무작위로 고른다)', () => {
  assert.deepStrictEqual(E.OPEN_CHARS, ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng', 'juksun', 'bbosong']);
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(E.OPEN_BG) && /^#[0-9A-Fa-f]{6}$/.test(E.OPEN_INK));
  const lum = c => { const n = parseInt(c.slice(1), 16); return ((n >> 16) & 255) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114; };
  assert.ok(lum(E.OPEN_BG) > 235 && lum(E.OPEN_INK) < 100, '파스텔 화이트 바탕 + 어두운 글');
  E.OPEN_SLOTS.forEach(s => {
    assert.ok(s.sky.length === 3 && (s.sun || s.moon) && !(s.sun && s.moon), s.id + ' 하늘 · 해 또는 달');
    assert.strictEqual(s.roles.length, 3, s.id); assert.ok(!s.variants && !s.cast, s.id + ' 옛 고정 출연진은 없다');
    assert.strictEqual(s.roles.filter(r => r.say).length, 1, s.id + ' 말풍선은 하나'); assert.ok(s.roles[1].say, s.id + ' 가운데 자리가 인사');
    s.roles.forEach(r => assert.ok((r.hop || 0) <= 0.05 && r.p <= 2, s.id + ' 콩콩 5% 안쪽 · 기본 자세 0~2'));
    assert.strictEqual(s.kind, s.id === 'sleep' ? 'sleep' : 'pose');
    Object.keys(s.special).forEach(id => { assert.ok(['juksun', 'bbosong'].includes(id)); s.special[id].forEach(g => assert.ok(g.t0 >= 0 && g.t1 <= E.OPEN_DUR && g.k !== 'walk', s.id + ' 전용 구간')); });
  });
  ['greet', 'lunch'].forEach(id => assert.ok(E.OPEN_SLOTS.find(s => s.id === id).special.juksun, id + ': 죽순이는 먹는다'));
  assert.ok(E.OPEN_SLOTS.find(s => s.id === 'afternoon').special.bbosong && E.OPEN_SLOTS.find(s => s.id === 'greet').special.bbosong, '뽀송 전용 동작');
  assert.ok(E.OPEN_DUR - E.OPEN_FADE >= 2000 && E.OPEN_DUR <= 3000, '또렷이 2초 + 녹아듦');
  assert.strictEqual(E.OPEN_BRAND, '우리들의 길동무');
});
t('이름표: 사용자가 정한 이름(두덩 · 독슐 · 둘숑 · 뽀푸 · 챙챙 · 쮸르 · 베비히포 + 고양이는 기존 러블)이 대본에 있고 앱 코드에는 없다', () => {
  const want = { dudung: '두덩', sul: '독슐', dolsom: '둘숑', ppopu: '뽀푸', chaeng: '챙챙', juksun: '쮸르', bbosong: '베비히포', lovel: '러블' };
  assert.deepStrictEqual(E.OPEN_NAMES, want); assert.deepStrictEqual(Object.keys(E.OPEN_NAMES).sort(), E.OPEN_CHARS.slice().sort());
  const code = fs.readFileSync(N('OpenView.java'), 'utf8') + fs.readFileSync(N('OpenCore.java'), 'utf8');
  Object.values(want).forEach(n => assert.ok(!code.includes(n), n + ' 은 대본에만'));
});
t('날씨 연동: 대본(wx)이 날씨 종류별 색·효과를 정하고 · 앱은 장면을 받을 때 날씨를 적어 두었다가 오프닝이 읽는다(6시간 · 없으면 맑음)', () => {
  const WK = ['cloudy', 'overcast', 'rain', 'snow', 'fog'];
  assert.deepStrictEqual(Object.keys(E.OPEN_WX).sort(), WK.slice().sort(), '엔진 장면의 날씨 종류(맑음 제외)와 같다');
  assert.ok(E.OPEN_WX.rain.fx === 'rain' && E.OPEN_WX.snow.fx === 'snow' && E.OPEN_WX.fog.fx === 'fog' && E.OPEN_WX.snow.ground && !E.OPEN_WX.rain.sun, '비·눈·안개 효과 · 눈은 하얀 땅 · 비엔 해가 없다');
  ['sleep', 'night'].forEach(id => assert.ok(E.OPEN_SLOTS.find(x => x.id === id).dark, id + ' 은 어두운 칸'));
  const w = fs.readFileSync(N('OpenWx.java'), 'utf8'), d = fs.readFileSync(N('SceneDriver.java'), 'utf8'), a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), v = fs.readFileSync(N('OpenView.java'), 'utf8');
  assert.ok(/MAX_AGE_MS = 6L \* 3600_000L/.test(w) && /wxKnown/.test(d) && /OpenWx\.save\(ctx, r\.look\.wk\)/.test(d), '엔진이 날씨를 확실히 알 때만(wxKnown) 적어 둔다');
  assert.ok(/OpenCore\.withWeather\(sc, OpenCore\.slotFor\(sc, hour\), OpenWx\.read\(this\)\)/.test(a), '켤 때 읽어 입힌다');
  assert.ok(/weatherFx\(cv, W, H, tt\)/.test(v) && /slot\.fx/.test(v) && !/"rain"\.equals\(wk|"snow"\.equals\(wk/.test(v), '효과는 대본의 fx 글을 그린다');
  assert.ok(!/import android\./.test(fs.readFileSync(N('OpenCore.java'), 'utf8')));
});
t('앱 assets/open.json 이 엔진 출력과 같다(고쳤으면 node tools/engine/gen-open.js)', () => {
  assert.strictEqual(fs.readFileSync(ASSET, 'utf8').trim(), JSON.stringify(E.openScript()));
});
t('OpenCore(OpenJvmTest)가 대본을 읽고 · 칸을 고르고 · 시각별 모습을 돌려준다', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'open-'));
  let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out, N('OpenCore.java'), N('SceneHello.java'), N('SceneModel.java'), N('SceneUtil.java'), N('SceneCv.java'), path.join(ROOT, 'test/java/OpenJvmTest.java')], { env: ENV, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, (r.stderr || r.stdout).slice(0, 1500));
  r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-cp', out, 'com.dullyyj.subway.OpenJvmTest', ASSET], { env: ENV, encoding: 'utf8', timeout: 60000 });
  assert.ok(/ALL OK/.test(r.stdout) && r.status === 0, (r.stdout || '') + (r.stderr || ''));
});
t('OpenCore 는 안드로이드를 쓰지 않는다(순수 계산) · 대본에 없는 글·색은 코드에 없다', () => {
  const c = fs.readFileSync(N('OpenCore.java'), 'utf8'); assert.ok(!/import android\./.test(c));
  const v = fs.readFileSync(N('OpenView.java'), 'utf8');
  assert.ok(!v.includes(E.OPEN_BRAND) && !/좋은 아침|수고했어요|푹 자요|편안한 밤|점심 먹을/.test(v + c), '글은 대본에만');
  E.OPEN_SLOTS.forEach(s => s.roles.forEach(r => r.say && assert.ok(!(v + c).includes(r.say), r.say)));
});
t('ShellActivity: 처음 켤 때만 오프닝을 띄우고 · 실패해도 앱은 열고 · 누르거나 뒤로 가기로 닫는다', () => {
  const a = fs.readFileSync(N('ShellActivity.java'), 'utf8');
  assert.ok(/if \(b == null\) showOpening\(\)/.test(a), '회전 같은 다시 만들기(b != null)에는 안 띄움');
  assert.ok(/getAssets\(\)\.open\("open\.json"\)/.test(a) && /OpenCore\.slotFor\(/.test(a) && /OpenCore\.cast\(sc, sl, ids\)/.test(a) && /OpenCore\.pickIds\(/.test(a) && /"open_last"/.test(a) && /addContentView\(openV/.test(a), '대본을 읽어 칸을 고르고 · 친구 셋은 켤 때마다 무작위(방금 조합 기억)');
  assert.ok(/catch \(Throwable ignored\) \{ openV = null; \}/.test(a), '실패해도 앱은 연다');
  assert.ok(/if \(openV != null\) \{ openV\.finish\(\); return; \}/.test(a), '뒤로 가기는 오프닝만 닫는다');
  const v = fs.readFileSync(N('OpenView.java'), 'utf8'), c0 = fs.readFileSync(N('OpenCore.java'), 'utf8');
  assert.ok(/ACTION_UP\) finish\(\)/.test(v) && /OpenCore\.done\(sc, t\)/.test(v), '누르면 닫고 · 시간이 되면 닫는다');
  assert.ok(/Chars\.file\(k\)/.test(v), '뽀송 신발 시트');
  assert.ok(/new Thread\(/.test(v) && !/\.join\(\)/.test(v), '시트는 뒤 스레드에서 읽고 기다리지 않는다');
  assert.ok(/\* 0\.70f/.test(v), '친구 키는 처음보다 30% 작게(0.70배)');
  assert.ok(/saveLayerAlpha\(0, 0, W, H, bgA\)/.test(v) && /saveLayerAlpha\(0, 0, W, H, fgA\)/.test(v) && !/setAlpha\(\(float\)/.test(v), '배경과 글·친구를 따로 흐리게(앱 화면으로 녹아듦)');
  assert.ok(/sc\.brand/.test(v) && /H \* 0\.35f \+ tp\.getTextSize\(\) \* 0\.35f/.test(v) && /Align\.CENTER/.test(v), '제목은 대본의 brand · 가로 가운데 · 바닥에서 65% 높이(위에서 35%)');
  assert.ok(/drawRect\(0, 0, W, H, p\)/.test(v) && /sc\.bg/.test(v) && /clipRect\(0, 0, pw, ph\)/.test(v) && /float pw = W,/.test(v) && !/drawRoundRect\(rf, 22f/.test(v) && !/setStrokeWidth\(1f \* dp\)/.test(v), '화면 전체는 불투명 파스텔 화이트 · 배경 그림은 가로 꽉 찬 띠 안에만(둥근 모서리·윤곽선 없음)');
  const ds = v.slice(v.indexOf('private void drawSky'), v.indexOf('p.setShader(sky)'));
  assert.ok(/p\.setColor\(0xFF000000\); p\.setAlpha\(255\)/.test(ds), '하늘 셰이더를 그리기 전에 붓 투명도를 되돌린다(앱 화면이 비치던 문제)');
  assert.ok(/private int pageBg\(\) \{ return slot\.bg != 0 \? slot\.bg : sc\.bg; \}/.test(v) && /p\.setColor\(pageBg\(\)\); cv\.drawRect\(0, 0, W, H, p\)/.test(v) && /tp\.setColor\(slot\.ink != 0 \? slot\.ink : sc\.ink\)/.test(v), 's326: 밤에는 바탕이 칸의 어두운 색 · 제목은 칸의 밝은 글 색');
  assert.ok(/private void feather\(/.test(v) && /pageBg\(\) & 0x00FFFFFF/.test(v) && /feather\(cv, pw, ph, fh\)/.test(v), '띠의 위·아래 가장자리가 바탕색으로 번진다');
  assert.ok(/float pt = H - ph;/.test(v) && !/fadeB/.test(v), '띠는 화면 맨 아래 바닥에 닿는다(아래쪽 번짐 없음)');
  assert.ok(/ph = H \* 0\.40f/.test(v) && /gy = ph - 106f \* dp/.test(v), '띠는 화면 아래 40%까지(하늘을 위로 늘림) · 친구 발 자리는 바닥에서 고정(크기·자리 그대로)');
  assert.ok(/private void nameTag\(/.test(v) && /sc\.names\.get\(id\)/.test(v) && (v.match(/nameTag\(cv, a\.id/g) || []).length === 2, '자는 모습·깬 모습 모두 이름표');
  assert.ok(!/slot\.tc/.test(v + c0), '옛 상단 글 색(tc) 없음');
  // 켜는 준비(위치·정류장·탭 미리 받기)는 오프닝 호출보다 앞에서 이미 시작돼 있다
  const o = a.indexOf('showOpening();'); for (const k of ['launchLocate();', 'prefetchTabs();', 'preloadDisk();', 'preconnectBus();', 'gwSync(false);']) assert.ok(a.indexOf(k) > -1 && a.indexOf(k) < o, k + ' 가 오프닝보다 먼저 시작');
});
t('카드 확장 인사(s340): 엔진이 대본(시간 · 자리 · 차례 · 칸별 인사 글)을 주고, 앱은 늘어난 카드에 그리기만 한다 · 옛 전체 화면 인사는 없다', () => {
  const sc = JSON.parse(fs.readFileSync(ASSET, 'utf8')), eg = E.openScript();
  assert.deepStrictEqual(sc.hello, eg.hello, '앱 assets 대본이 엔진과 같다(gen-open)');
  assert.ok(sc.hello.seats.length === 8 && sc.hello.order.length === 8 && sc.hello.t.expand > 0 && sc.hello.t.collapse > sc.hello.t.leave, '엔진 대본: 8자리 · 8차례 · 시간');
  for (const sl of sc.slots) { assert.ok(sl.hello && sl.hello.say && Object.keys(sl.hello.say).length === 8, sl.id + ' 칸별 인사 8마리'); }
  const rd = f => fs.readFileSync(N(f), 'utf8'), scr = rd('ScreenView.java'), sd = rd('SceneDriver.java'), sa = rd('ShellActivity.java'), sh = rd('SceneHello.java'), sco = rd('SceneCore.java'), ov = rd('OpenView.java');
  assert.ok(!/all-mode|allMode|helloAll|showAll/.test(ov) && !/OpenView[^;]*all/i.test(sa), '옛 전체 화면 인사(OpenView all 모드)가 없다');
  for (const k of ['setHelloFeed', 'HELLO_LP_MS', 'HELLO_PREP_MS', 'helloEnd()', 'helloGh', 'SceneHello.ext', 'SceneHello.mix']) assert.ok(scr.indexOf(k) > -1, 'ScreenView: ' + k);
  assert.ok(/3000L/.test(scr) && /sdy \+= hExt/.test(scr) && /gh \+= hExt/.test(scr), '3초 꾹 · 아래 카드들이 같이 밀린다(슬라이드)');
  for (const k of ['helloPrepare', 'helloStart', 'drawHello', 'helloSkip', 'forceK']) assert.ok(sd.indexOf(k) > -1 || sco.indexOf(k) > -1, 'SceneDriver/SceneCore: ' + k);
  assert.ok(/helloFor\(/.test(sa) && /open\.json/.test(sa) && /catch \(Throwable/.test(sa), 'ShellActivity 는 엔진 대본을 읽어 넘길 뿐(실패하면 아무것도 안 한다)');
  const txt = (sc.slots.flatMap(sl => Object.values(sl.hello.say)));
  for (const line of txt) for (const f of [scr, sd, sa, sh, sco]) assert.ok(f.indexOf(line) < 0, '인사 글이 앱 코드에 없다: ' + line);
  assert.ok(!/Thread|new Handler|runOnUiThread|synchronized/.test(sh), '순수 계산이라 스레드 없음');
});
console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
