// 캐릭터 시계 위젯 네이티브 코드 검증 — 2026-10-15
//   ① 순수 자바(WidgetGeo·WidgetSim·WidgetArt)를 이 PC 의 JVM 에서 컴파일하고 자체 점검(java WidgetJvmTest check) 통과
//   ② 안드로이드에 닿는 부분(WidgetCore·GdmWidget*)을 손으로 쓴 최소 android 스텁(test/android-stubs)으로 컴파일 — 문법·이름·타입 오류를 잡는다
//      (진짜 android.jar 컴파일은 CI 의 gradle 단계가 한다. 이 시험은 그 전에 잡는 1차 그물이다)
//   ③ 리소스 XML 이 올바른 XML 이고, 위젯 정의·레이아웃이 서로 가리키는 이름이 다 있다
//   ④ CI 워크플로가 위젯 파일·리소스를 복사하고 MainActivity·매니페스트에 연결한다
// 실행: node test/widget_native_java.test.js   (javac · java · python3 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const JAVA = ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Djava.awt.headless=true'];
const walk = (d, ext, acc = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, ext, acc); else if (p.endsWith(ext)) acc.push(p); } return acc; };

(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdm-wj-'));
  const cls = path.join(out, 'cls'), cls2 = path.join(out, 'cls2');
  fs.mkdirSync(cls); fs.mkdirSync(cls2);
  const N = n => path.join(ROOT, 'native', n + '.java');

  await t('순수 자바 컴파일(WidgetGeo·WidgetSim·WidgetArt)', async () => {
    execFileSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-d', cls, N('WidgetGeo'), N('WidgetSim'), N('WidgetArt'), path.join(__dirname, 'java', 'WidgetJvmTest.java')], { env: ENV, stdio: 'pipe' });
  });
  await t('자바 자체 점검 전부 통과(움직임·경계·출퇴근 줄서기·시계 축소·결정성)', async () => {
    let o; try { o = execFileSync('java', JAVA.concat(['-cp', cls, 'com.dullyyj.subway.WidgetJvmTest', 'check']), { env: ENV, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { o = String(e.stdout || '') + String(e.stderr || ''); }
    const bad = o.split('\n').filter(l => /^FAIL/.test(l) || /Exception/.test(l));
    assert(!bad.length && /ALL OK/.test(o), bad.join(' | ') || o.slice(-300));
  });
  await t('안드로이드 부분 스텁 컴파일(WidgetCore·GdmWidget*·플러그인)', async () => {
    const stubs = walk(path.join(__dirname, 'android-stubs'), '.java');
    assert(stubs.length > 20, '스텁이 너무 적다: ' + stubs.length);
    const srcs = fs.readdirSync(path.join(ROOT, 'native')).filter(f => /^(Widget|GdmWidget|GdmShare).*\.java$/.test(f)).map(f => path.join(ROOT, 'native', f));
    execFileSync('javac', ['-encoding', 'UTF-8', '-d', cls2].concat(stubs, srcs), { env: ENV, stdio: 'pipe' });
  });
  await t('리소스 XML 이 올바르다 + 이름 연결(레이아웃 id·위젯 정의·배경·문구)', async () => {
    const res = path.join(ROOT, 'native', 'res');
    const py = `
import sys, os, re
from xml.dom import minidom
res = sys.argv[1]; bad = []; names = set(); ids = set(); refs = set()
for r, d, fs in os.walk(res):
    for f in fs:
        p = os.path.join(r, f)
        if f.endswith('.png'):
            if os.path.basename(r).startswith('drawable'): names.add('drawable/' + f.rsplit('.', 1)[0])
            continue
        try: minidom.parse(p)
        except Exception as e: bad.append(f + ': ' + str(e))
        t = open(p, encoding='utf-8').read()
        kind = os.path.basename(r)
        if kind in ('layout', 'drawable', 'xml'): names.add(kind + '/' + f.rsplit('.', 1)[0])
        for m in re.finditer(r'@\\+id/(\\w+)', t): ids.add(m.group(1))
        for m in re.finditer(r'@(drawable|xml|layout|string)/(\\w+)', t): refs.add((m.group(1), m.group(2)))
        if kind == 'values':
            for m in re.finditer(r'<string name="(\\w+)"', t): names.add('string/' + m.group(1))
miss = [k + '/' + n for k, n in refs if (k + '/' + n) not in names]
need = ['gw_root', 'gw_clock', 'gw_date', 'gw_overlay', 'gw_cmt', 'gw_bubble', 'gw_btn', 'gw_clock_m']
miss += ['id/' + i for i in need if i not in ids]
print('BAD', bad); print('MISS', miss)
`;
    const o = execFileSync('python3', ['-I', '-c', py, res], { encoding: 'utf8' });
    assert(/BAD \[\]/.test(o) && /MISS \[\]/.test(o), o);
    // 진짜 빌드(aapt)에서만 드러나던 오타 — 속성 이름을 알려진 목록과 대조한다
    const OK = new Set('layout_width layout_height id textSize textColor singleLine layout_gravity background includeFontPadding format24Hour format12Hour textStyle gravity color shape radius fontFamily widgetCategory visibility updatePeriodMillis targetCellWidth targetCellHeight scaleType resizeMode paddingRight paddingLeft padding orientation minWidth minResizeWidth minResizeHeight minHeight layout_weight layout_marginBottom layout_marginTop layout_marginLeft layout_marginRight initialLayout description contentDescription width previewImage previewLayout configure label shadowColor shadowDx shadowDy shadowRadius'.split(' '));
    const bad = [];
    for (const f of walk(res, '.xml')) for (const m of fs.readFileSync(f, 'utf8').matchAll(/android:([A-Za-z0-9_]+)=/g)) if (!OK.has(m[1])) bad.push(path.basename(f) + ':' + m[1]);
    assert(!bad.length, '알 수 없는 속성(오타?): ' + bad.join(', '));
    // 배경은 투명: 루트 배경 그림이 없어야 한다
    for (const f of walk(path.join(res, 'layout'), '.xml')) assert(!/gdm_bg_/.test(fs.readFileSync(f, 'utf8')), path.basename(f) + ' 에 배경이 남아 있다');
    for (const n of ['hb', 'hw', 'vb', 'vw']) {
      assert(fs.existsSync(path.join(res, 'xml', 'gdm_widget_' + n + '.xml')), n + ' 위젯 정의 없음');
      assert(fs.statSync(path.join(res, 'drawable-nodpi', 'gdm_preview_' + n + '.png')).size > 5000, n + ' 미리보기 그림 없음(위젯 고르는 화면에 시계가 안 보인다)');
      assert(fs.readFileSync(path.join(res, 'xml', 'gdm_widget_' + n + '.xml'), 'utf8').includes('android:previewImage="@drawable/gdm_preview_' + n + '"'), n + ' 위젯 정의가 미리보기를 안 가리킨다');
    }
  });
  await t('CI 워크플로가 위젯 파일·리소스를 복사하고 MainActivity·매니페스트에 연결한다', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    for (const f of ['WidgetGeo', 'WidgetSim', 'WidgetArt', 'WidgetCore', 'GdmWidgetBase', 'GdmWidgetHB', 'GdmWidgetHW', 'GdmWidgetVB', 'GdmWidgetVW', 'GdmWidgetReceiver', 'GdmWidgetPlugin']) {
      assert(y.includes('native/' + f + '.java'), f + ' 복사 누락');
      assert(fs.existsSync(N(f)), f + ' 파일 없음');
    }
    assert(y.includes('native/res'), '리소스 복사 누락');
    assert(y.includes('registerPlugin(GdmWidgetPlugin.class)'), 'GdmWidgetPlugin 등록 누락');
    assert(y.includes('native/GdmSharePlugin.java') && y.includes('registerPlugin(GdmSharePlugin.class)') && fs.existsSync(N('GdmSharePlugin')) && fs.existsSync(path.join(ROOT, 'native', 'res', 'xml', 'gdm_share_paths.xml')), '위치 공유 플러그인 복사·등록·경로 정의 누락');
    assert(y.includes('WidgetCore.captureLaunch(getIntent())') && y.includes('onNewIntent'), '위젯에서 앱 열림 처리 누락');
    for (const c of ['GdmWidgetHB', 'GdmWidgetHW', 'GdmWidgetVB', 'GdmWidgetVW', 'GdmWidgetReceiver']) assert(y.includes('".' + c + '"') || y.includes("prov(\"" + c + "\""), c + ' 매니페스트 누락');
    assert(y.includes('public void onStop()') && y.includes('WidgetCore.onAppLeft(this)'), '앱을 닫을 때(onStop) 위젯을 깨우는 연결 누락');
    assert(y.includes('android.appwidget.action.APPWIDGET_UPDATE') && y.includes('android.appwidget.provider'), '위젯 intent-filter/meta-data 누락');
  });
  await t('매니페스트 패치 파이썬을 실제로 돌려도 위젯 수신기가 들어간다', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    const i = y.indexOf('# 2026-10-15: 캐릭터 시계 위젯 4종'), j = y.indexOf('open(M, "w", encoding="utf-8").write(s)', i);
    assert(i > 0 && j > i);
    const body = y.slice(i, j).split('\n').map(l => l.replace(/^ {10}/, '')).join('\n');
    const py = 's = """<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application>\n</application></manifest>"""\n' + body + '\nprint(s)\n';
    const o = execFileSync('python3', ['-I', '-c', py], { encoding: 'utf8' });
    for (const c of ['.GdmWidgetHB', '.GdmWidgetHW', '.GdmWidgetVB', '.GdmWidgetVW', '.GdmWidgetReceiver']) assert(o.includes('android:name="' + c + '"'), c);
    assert((o.match(/@xml\/gdm_widget_/g) || []).length === 4);
    assert(o.includes('androidx.core.content.FileProvider') && o.includes('${applicationId}.gdmshare') && o.includes('@xml/gdm_share_paths') && o.includes('android:grantUriPermissions="true"') && o.includes('android:exported="false"'), '위치 공유 FileProvider 가 매니페스트에 안 들어갔다');
    assert(o.includes('android:exported="true"') && o.includes('BOOT_COMPLETED'));
    execFileSync('python3', ['-I', '-c', 'import sys;from xml.dom import minidom;minidom.parseString(sys.stdin.read().encode())'], { input: o });
  });
  await t('강아지(돌솜·뽀푸) 시트에 꼬리가 있다 — 몸·머리보다 왼쪽으로 꼬리 털뭉치가 나와 있고 칸 밖으로 안 잘린다', async () => {
    // 브라우저(Chromium)로 webp 를 풀어 칸마다 알파가 있는 가장 왼쪽 열을 잰다(CI 에 PIL 이 없어도 되게)
    const { chromium } = require('./helpers/pw');
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
    try {
      const pg = await b.newPage(); await pg.setContent('<canvas id=c width=1024 height=1024></canvas>');
      const bad = [];
      for (const n of ['dolsom', 'ppopu']) {
        const url = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'www', 'chars3d', n + '.webp')).toString('base64');
        const mins = await pg.evaluate(async u => {
          const im = new Image(); im.src = u; await im.decode();
          const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, 1024, 1024); x.drawImage(im, 0, 0);
          const out = [];
          for (let i = 0; i < 16; i++) {
            const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 256, d = x.getImageData(cx, cy, 256, 256).data; let lo = 999, hi = -1;
            for (let yy = 0; yy < 256; yy++) for (let xx = 0; xx < 256; xx++) if (d[(yy * 256 + xx) * 4 + 3] > 24) { if (xx < lo) lo = xx; if (xx > hi) hi = xx; }
            out.push([lo, hi]);
          }
          return out;
        }, url);
        mins.forEach((m, i) => { if (m[0] < 3 || m[1] > 252) bad.push(n + '#' + i + ' 칸 가장자리에 닿음 ' + m); });
        // 꼬리가 없던 때는 몸·머리 털의 왼쪽 끝이 36~48px 이었다. 꼬리가 있으면 16프레임 중 절반 이상에서 그보다 왼쪽(<=34px)에 털뭉치가 나온다
        if (mins.filter(m => m[0] <= 34).length < 8) bad.push(n + ' 꼬리가 안 보인다(왼쪽 끝 ' + mins.map(m => m[0]).join(',') + ')');
      }
      assert(!bad.length, bad.join(' | '));
    } finally { await b.close(); }
  });
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
