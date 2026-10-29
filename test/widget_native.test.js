// 캐릭터 시계 위젯(네이티브) 검증 — 2026-10-21 (s104)
//   ① 안드로이드와 상관없는 부분(WidgetGeo · WidgetSim · WidgetArt)을 JVM 에서 돌려 모든 점검(WidgetJvmTest check)이 통과
//   ② 위젯 4종 · 수신기가 매니페스트에 있고, 위젯 설정 xml · 레이아웃 · 미리보기 그림이 모두 있다
//   ③ 위젯은 엔진 주소와 캐릭터 시트를 앱과 같은 곳에서 쓴다(옛 웹 시절 경로가 남아 있지 않다)
//   ④ 앱 쪽 연결(설정 화면 gw · 핀 추가 · 위젯 누름 처리)이 ShellActivity 에 있다
// 실행: node test/widget_native.test.js   (javac · java 필요)
process.env.TZ = 'Asia/Seoul';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message || e).split('\n').slice(0, 6).join('\n        ')); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const N = n => path.join(ROOT, 'native', 'shell', n);
const RES = path.join(ROOT, 'shell-android', 'app', 'src', 'main', 'res');
(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wgjvm-'));
  await t('WidgetGeo · WidgetSim · WidgetArt 를 JVM 에서 컴파일하고 자체 점검(WidgetJvmTest check)이 모두 통과', async () => {
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out, N('WidgetGeo.java'), N('WidgetSim.java'), N('WidgetArt.java'), path.join(__dirname, 'java', 'WidgetJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', out, 'com.dullyyj.subway.WidgetJvmTest', 'check'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join(' / ').slice(0, 1500));
    assert.ok(/ALL OK/.test(r.stdout), 'ALL OK');
    assert.ok((r.stdout.match(/^ok /gm) || []).length >= 200, '점검 수');
  });
  await t('위젯 출퇴근 장면(s272): 엔진 응답(cmWidgetScenes)을 WidgetSceneCore 가 읽고, 지금이 드는 칸이 예전 위젯 규칙과 같다', async () => {
    const { cmWidgetScenes } = require(path.join(ROOT, 'engine', 'commute-alarm.js'));
    const o = fs.mkdtempSync(path.join(os.tmpdir(), 'wsjvm-'));
    const cfg = { on: true, mOn: true, eOn: true, morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5] };
    const NOW0 = new Date(2026, 9, 28, 6, 0, 0).getTime();
    const resp = Object.assign(cmWidgetScenes(Object.assign({ nowMs: NOW0 }, cfg)), { ok: true });
    fs.writeFileSync(path.join(o, 'plan.json'), JSON.stringify(resp));
    const ref = now => {   // 예전 위젯 규칙: 오늘 시작 ≤ 지금 < 시작+90분(주말 제외), 늦은 시작이 이긴다
      const n = new Date(now), dow = n.getDay(); if (cfg.days.indexOf(dow) < 0) return '-';
      const ymd = n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate(); let best = '-', bs = 0;
      [['morn', 450], ['eve', 1110]].forEach(([k, m]) => { const st = new Date(n.getFullYear(), n.getMonth(), n.getDate(), Math.floor(m / 60), m % 60).getTime(); if (now >= st && now < st + 5400000 && st >= bs) { bs = st; best = ymd + k + m; } });
      return best;
    };
    const args = []; for (let k = 0; k < 6 * 24; k++) { const now = NOW0 + k * 20 * 60000; args.push(now + ':' + ref(now)); }
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', o, N('ScreenCore.java'), N('WidgetSceneCore.java'), path.join(__dirname, 'java', 'WidgetSceneJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', o, 'com.dullyyj.subway.WidgetSceneJvmTest', path.join(o, 'plan.json')].concat(args), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join(' / ').slice(0, 1500));
    assert.ok(/ALL OK/.test(r.stdout), 'ALL OK');
  });
  await t('위젯 자바에는 출퇴근 요일·시각·대기 분·버튼 이름 규칙이 없다(엔진 목록만 따른다)', async () => {
    const wc = fs.readFileSync(N('WidgetCore.java'), 'utf8'), ws = fs.readFileSync(N('WidgetSceneCore.java'), 'utf8');
    assert.ok(!/90L \* 60000L|3L \* 60000L|"출근하기"|"퇴근하기"|오늘도 화이팅|수고 많았어요|DAY_OF_WEEK|HOUR_OF_DAY|Calendar\b/.test(wc), 'WidgetCore: 규칙·문구 없음');
    assert.ok(!/import\s+android\./.test(ws) && !/Calendar|DAY_OF_WEEK|HOUR_OF_DAY/.test(ws), 'WidgetSceneCore: 순수 · 달력 규칙 없음');
    assert.ok(/\/commute-alarm/.test(wc) && /wsPlan/.test(wc), '엔진 목록을 받아 기기에 둔다');
  });
  await t('순수 코드는 안드로이드를 쓰지 않는다', async () => {
    for (const f of ['WidgetGeo.java', 'WidgetSim.java', 'WidgetArt.java', 'GwCore.java']) assert.ok(!/import\s+android\./.test(fs.readFileSync(N(f), 'utf8')), f);
  });
  await t('매니페스트: 위젯 4종(APPWIDGET_UPDATE + provider) · 알람/재부팅 수신기', async () => {
    const m = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    for (const [c, x] of [['GdmWidgetHB', 'hb'], ['GdmWidgetHW', 'hw'], ['GdmWidgetVB', 'vb'], ['GdmWidgetVW', 'vw']]) {
      assert.ok(m.includes('android:name=".' + c + '"'), c);
      assert.ok(m.includes('@xml/gdm_widget_' + x), x);
    }
    assert.ok(m.includes('android:name=".GdmWidgetReceiver"'), '수신기');
    for (const a of ['BOOT_COMPLETED', 'TIME_SET', 'TIMEZONE_CHANGED', 'MY_PACKAGE_REPLACED']) assert.ok(m.includes('android.intent.action.' + a), a);
    assert.ok(m.includes('android.appwidget.action.APPWIDGET_UPDATE') && m.includes('android.appwidget.provider'));
  });
  await t('리소스: 위젯 xml 4 · 레이아웃 4 · 말풍선/버튼 모양 4 · 미리보기 4 · 문구', async () => {
    for (const x of ['hb', 'hw', 'vb', 'vw']) {
      assert.ok(fs.existsSync(path.join(RES, 'xml', 'gdm_widget_' + x + '.xml')), 'xml ' + x);
      assert.ok(fs.existsSync(path.join(RES, 'drawable-nodpi', 'gdm_preview_' + x + '.png')), 'preview ' + x);
    }
    for (const h of ['h', 'v']) for (const c of ['dark', 'light']) {
      const f = path.join(RES, 'layout', 'gdm_widget_' + h + '_' + c + '.xml');
      assert.ok(fs.existsSync(f), f);
      const x = fs.readFileSync(f, 'utf8');
      for (const id of ['gw_root', 'gw_clock', 'gw_overlay', 'gw_cmt', 'gw_bubble', 'gw_btn', 'gw_date']) assert.ok(x.includes('@+id/' + id), h + c + ' ' + id);
      assert.ok(fs.existsSync(path.join(RES, 'drawable', 'gdm_bubble_' + c + '.xml')) && fs.existsSync(path.join(RES, 'drawable', 'gdm_btn_' + c + '.xml')));
    }
    assert.ok(fs.existsSync(path.join(RES, 'values', 'gdm_widget_strings.xml')));
    // 위젯 xml 이 가리키는 @drawable/@layout/@string 이 모두 있다
    const strs = fs.readFileSync(path.join(RES, 'values', 'gdm_widget_strings.xml'), 'utf8');
    for (const x of ['hb', 'hw', 'vb', 'vw']) {
      const w = fs.readFileSync(path.join(RES, 'xml', 'gdm_widget_' + x + '.xml'), 'utf8');
      assert.ok(strs.includes('name="gdm_widget_desc_' + x + '"'), 'desc ' + x);
      const lay = /@layout\/(\w+)/.exec(w)[1]; assert.ok(fs.existsSync(path.join(RES, 'layout', lay + '.xml')), lay);
    }
  });
  await t('캐릭터 시트: 위젯이 읽는 assets/chars3d 에 모든 캐릭터가 있다 · 엔진 주소는 앱과 같은 ShellCore.BASE', async () => {
    const wc = fs.readFileSync(N('WidgetCore.java'), 'utf8');
    assert.ok(/ENGINE = ShellCore\.BASE/.test(wc) && !/workers\.dev/.test(wc), '엔진 주소');
    assert.ok(/getAssets\(\)\.open\("chars3d\/"/.test(wc) && !/public\/chars3d/.test(wc), '시트 경로');
    const sim = fs.readFileSync(N('WidgetSim.java'), 'utf8');
    const ord = /ORDER\s*=\s*\{([^}]*)\}/.exec(sim)[1].match(/"(\w+)"/g).map(x => x.replace(/"/g, ''));
    assert.ok(ord.length >= 6, 'ORDER');
    for (const id of ord) assert.ok(fs.existsSync(path.join(ROOT, 'shell-android', 'app', 'src', 'main', 'assets', 'chars3d', (id === 'bbosong' ? 'bbosong_0' : id) + '.webp')), id);
    assert.ok(!/capacitor|getcapacitor/i.test(wc), 'Capacitor 없음');
  });
  await t('엔진 /widget-say 가 있고 위젯이 부르는 매개변수(kind · baseMs · lat · lng)를 읽는다', async () => {
    const w = fs.readFileSync(path.join(ROOT, 'engine', 'route-v2-worker.ascii.js'), 'utf8');
    assert.ok(w.includes('url.pathname === "/widget-say"'), '경로');
    const wc = fs.readFileSync(N('WidgetCore.java'), 'utf8');
    assert.ok(/\/widget-say\?kind=/.test(wc) && /&baseMs=/.test(wc) && /&lat=/.test(wc) && /&lng=/.test(wc));
  });
  await t('앱 연결: 설정 gw 화면 · 위젯 추가(핀) · 위젯 누름(탭/출퇴근) · 설정 전달이 ShellActivity 에 있다', async () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    assert.ok(/"gw"\.equals\(e\.arg\)/.test(a) && /pageUrlGw\(GwCore\.pageFacts/.test(a), 'gw 화면');
    assert.ok(/PG_GWADD/.test(a) && /WidgetCore\.pin\(/.test(a), '핀 추가');
    assert.ok(/WidgetCore\.captureLaunch\(/.test(a) && /WidgetCore\.takeTab\(\)/.test(a) && /WidgetCore\.takeLaunch\(/.test(a) && /onNewIntent/.test(a), '위젯 누름');
    assert.ok(/WidgetCore\.setConfigJson\(/.test(a) && /WidgetCore\.onAppLeft\(/.test(a), '설정 전달 · 앱 나감');
    const s = fs.readFileSync(N('ShellCore.java'), 'utf8');
    assert.ok(/\\"gw\\",\\"dev\\"\]/.test(s), 'pgs 에 gw · dev');
    assert.ok(/devStart\(DevCore\.mode\(v\)\)/.test(a) && /"dev"\.equals\(e\.arg\)/.test(a) && /pageUrlDev\(DevCore\.withPerf\(DevCore\.pageFacts/.test(a), '개발자 도구 연결');
  });
  console.log(`\n${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
