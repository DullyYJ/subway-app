// 서버 구동 네이티브 화면(쇼핑 1호) 검증 — 2026-10-18
//   ① 순수 자바 코어(ScreenCore — android.* 없음)를 JVM 에서 컴파일하고 자체 점검(java ScreenJvmTest) 통과: JSON 읽기·검증·배치·눌림·스크롤
//   ② 코어는 안드로이드·네트워크·시계를 쓰지 않는다 (계산은 엔진, 코어는 받은 값으로 자리만 낸다)
//   ③ 안드로이드 계층(ScreenView·ScreenNativePlugin)을 진짜 android.jar 로 컴파일 — jar 가 없으면 건너뜀(CI 러너엔 SDK 가 있다)
//   ④ 뷰: 그릴 때 새 객체를 만들지 않는다 · 화면 박자 · 그림은 뷰 안 백그라운드에서만 받는다 / 플러그인: 검증을 거친다 · 통신이 없다
//   ⑤ CI 워크플로가 파일을 복사하고 MainActivity 에 ScreenNativePlugin 을 등록한다
// 실행: node test/screen_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { const r = await fn(); if (r === 'skip') { skipped++; console.log('  skip ', name); } else { pass++; console.log('  ok  ', name); } } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scrjvm-'));
  await t('ScreenCore 를 JVM 에서 컴파일하고 자체 점검(ScreenJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), path.join(__dirname, 'java', 'ScreenJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', core, 'com.dullyyj.subway.ScreenJvmTest'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(r.stdout), r.stdout.slice(-300));
    console.log('        ' + (r.stdout.match(/^ok /gm) || []).length + '개 점검');
  });
  await t('코어는 안드로이드·네트워크·시계를 쓰지 않는다(순수 계산)', async () => {
    const src = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(!/import\s+android\.|java\.net|HttpURLConnection|System\.currentTimeMillis|SystemClock|Random/.test(src), '순수 자바여야 한다');
  });
  await t('안드로이드 계층(ScreenView·ScreenNativePlugin)을 진짜 android.jar 로 컴파일', async () => {
    const jar = findAndroidJar(); if (!jar) return 'skip';
    const cap = path.join(out, 'cap'), j = path.join(out, 'j'); fs.mkdirSync(cap); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', cap].concat(walk(path.join(__dirname, 'android-stubs', 'com'), '.java')), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', [jar, cap].join(path.delimiter), '-d', j, N('ScreenCore.java'), N('ScreenView.java'), N('ScreenNativePlugin.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)).join(' / ').slice(0, 1500));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'ScreenNativePlugin.class')));
  });
  await t('뷰: 그릴 때 새 객체를 만들지 않는다 · 화면 박자로 이어 그린다 · 보이는 조각만 그린다', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8');
    const draw = v.slice(v.indexOf('protected void onDraw'), v.indexOf('// ───────────── 검색 입력칸'));
    assert.ok(!/\bnew\s+[A-Z]/.test(draw), '그리기 구간에 new 가 있다: ' + (draw.match(/\bnew\s+[A-Z]\w*/) || [''])[0]);
    assert.ok(/postInvalidateOnAnimation/.test(draw), '화면 박자');
    assert.ok(/bodyRange\(/.test(draw) && /it\.fixed/.test(draw) && /x0/.test(draw), '보이는 조각만(본문 이진 탐색 · 머리는 화면 안의 칩만)');
    assert.ok(/OverScroller/.test(v) && /VelocityTracker/.test(v), '관성 스크롤');
    assert.ok(/requestDisallowInterceptTouchEvent\(true\)/.test(v), '손가락을 이 뷰가 받는다');
  });
  await t('검색줄: 진짜 입력칸(EditText) · 검색 키 · 길이 제한 · 포커스 알림 · 잘리면 숨김 · 키보드 내리기', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), p = fs.readFileSync(N('ScreenNativePlugin.java'), 'utf8');
    assert.ok(/new EditText\(/.test(v) && /IME_ACTION_SEARCH/.test(v) && /LengthFilter/.test(v), '입력칸·검색 키·길이');
    assert.ok(/onInputFocus\(/.test(v) && /onSearch\(/.test(v), '포커스·검색 알림');
    assert.ok(/getClipBounds\(\)/.test(v) && /hideInput\(\)/.test(v), '잘리면 입력칸을 내린다');
    assert.ok(/hideSoftInputFromWindow/.test(v) && /removeView\(input\)/.test(v), '키보드 내리기 · 뷰가 떨어지면 입력칸도 뗀다');
    assert.ok(/bringToFront\(\)/.test(v), '입력칸이 그림 뷰 위에 놓인다');
    assert.ok(/syncLater\(\)/.test(v) && !/protected void onLayout[^{]*\{[^}]*syncInput\(\)/.test(v), '배치 도중 자식 뷰를 건드리지 않고 한 박자 뒤로 미룬다');
    assert.ok(/drawBox\(/.test(v) && /drawSearch\(/.test(v) && /drawRich\(/.test(v), '상자·검색줄·굵은 글자 그리기');
    assert.ok(/notifyListeners\("input"/.test(p) && /put\("empty", a\.empty\)/.test(p) && /put\("url", a\.tpl\)/.test(p), '플러그인: input 이벤트 · 검색 행동에 tpl/empty 를 실어 보냄');
    assert.ok(/resyncInput\(\)/.test(p), '자리/잘림이 바뀌면 입력칸도 맞춘다');
  });
  await t('설정 노드: 스위치는 바로 뒤집고 set 이벤트 · 입력칸은 눌렀을 때만 만든다 · 글자 모음(fields) · 앱 토스트', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), p = fs.readFileSync(N('ScreenNativePlugin.java'), 'utf8');
    assert.ok(/drawPanel\(/.test(v) && /drawToggle\(/.test(v) && /drawNav\(/.test(v) && /drawSelect\(/.test(v) && /drawField\(/.test(v), '패널·스위치·이동줄·고르기·입력칸 그리기');
    assert.ok(/pi\.on = !pi\.on/.test(v) && /listener\.onSet\(/.test(v), '스위치: 화면을 먼저 뒤집고 set 알림');
    assert.ok(/ensureEditor\(|beginEdit\(/.test(v) && /commitEdit\(/.test(v) && /endEdit\(/.test(v), '입력칸 편집: 눌렀을 때 만들고 끝나면 글자를 모으고 뗀다');
    assert.ok(/public Map<String, String> fields\(\)/.test(v), 'fields() 로 글자 모음');
    assert.ok(/R_BORDER2/.test(v) && /new int\[10\]/.test(p) && /"border2"/.test(p), '두 번째 테두리색 팔레트');
    assert.ok(/onSet\(ScreenCore\.Act a, boolean on\)/.test(p) && /put\("on", on\)/.test(p) && /put\("fields", fo\)/.test(p), '플러그인: set 이벤트에 on · 모든 행동에 fields');
    assert.ok(/public void toast\(/.test(p) && /Toast\.makeText/.test(p), '앱이 직접 띄우는 토스트');
  });
  await t('그림 받기: 백그라운드 스레드 + 메모리/파일 캐시 + 실패 재시도 간격 + 크기 한도', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/newFixedThreadPool/.test(v) && /LruCache/.test(v) && /scr_img/.test(v), '풀·캐시');
    assert.ok(/failed\.put/.test(v) && /60000L/.test(v), '실패 간격');
    assert.ok(/4_000_000L/.test(v) && /inSampleSize/.test(v), '크기 한도·축소 디코드');
    assert.ok(/getResponseCode\(\) != 200/.test(v), '정상 응답만');
  });
  await t('플러그인: JSON 을 검증(ScreenCore.load)한 뒤에만 그린다 · 틀리면 invalid 오류 이벤트 · 통신·계산 없음', async () => {
    const p = fs.readFileSync(N('ScreenNativePlugin.java'), 'utf8');
    assert.ok(/ScreenCore\.load\(/.test(p) && /"invalid"/.test(p), '검증·invalid');
    assert.ok(/notifyListeners\("error"/.test(p) && /notifyListeners\("ready"/.test(p) && /notifyListeners\("action"/.test(p), 'ready·error·action 이벤트');
    assert.ok(!/URL\(|HttpURLConnection|Random/.test(p), '순수 전달');
    for (const m of ['show', 'update', 'setRect', 'hide', 'destroy', 'status']) assert.ok(new RegExp('public void ' + m + '\\(').test(p), m + ' 메서드');
    assert.ok(/@CapacitorPlugin\(name = "ScreenNative"\)/.test(p));
  });
  await t('글꼴: 웹과 같은 Noto Sans KR 를 쓴다(assets/fonts) · 없으면 기기 기본으로 · CI 가 글꼴을 만들어 넣는다', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), p = fs.readFileSync(N('ScreenNativePlugin.java'), 'utf8'), y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    assert.ok(/fonts\/NotoSansKR-Regular\.ttf/.test(v) && /fonts\/NotoSansKR-Bold\.ttf/.test(v), '보통·굵게 글꼴 파일');
    assert.ok(/Typeface\.DEFAULT_BOLD : Typeface\.DEFAULT/.test(v), '글꼴 없으면 기기 기본으로');
    assert.ok(!/setTypeface\(bold \? Typeface\.DEFAULT_BOLD/.test(v), '직접 기본 글꼴을 쓰지 않고 face() 를 거친다');
    assert.ok((v.match(/face\(/g) || []).length >= 5, '재기·그리기·입력칸이 같은 글꼴');
    assert.ok(/preloadFaces/.test(p) && /public void load\(\)/.test(p), '앱이 뜰 때 뒤에서 미리 읽는다');
    assert.ok(/Bundle Noto Sans KR/.test(y) && /assets\/fonts\/NotoSansKR-/.test(y) && /instantiateVariableFont/.test(y), 'CI 글꼴 만들기');
    assert.ok(y.indexOf('Bundle Noto Sans KR') < y.indexOf('Generate launcher icons'), '안드로이드 폴더가 만들어진 뒤');
  });
  await t('맛집 노드: 머리줄(bar)·장소 카드(place)·구분선(divider)을 그리고 눌린 칩 색을 엔진 글대로 칠한다 · 그릴 때 새 객체 없음', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/drawBar\(/.test(v) && /drawPlace\(/.test(v) && /drawDivider\(/.test(v), '머리줄·장소 카드·구분선 그리기');
    assert.ok(/case ScreenCore\.K_BAR: drawBar/.test(v) && /case ScreenCore\.K_PLACE: drawPlace/.test(v) && /case ScreenCore\.K_DIV: drawDivider/.test(v), 'drawItem 에 연결');
    const seg = v.slice(v.indexOf('private void drawBar'), v.indexOf('private void drawCard'));
    assert.ok(seg.length > 500 && !/\bnew\s+[A-Z]/.test(seg), '맛집 그리기 구간에 new 가 있다');
    assert.ok(/cc\(it\.ac, pal\[R_ORANGE\]\)/.test(v) && /cc\(it\.tc, pal\[R_WHITE\]\)/.test(v), '켜진 칩 색은 엔진 글(onc/onfg) 대로, 없으면 예전 주황');
    const c = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/K_BAR = 12, K_PLACE = 13, K_DIV = 14/.test(c) && /"bar"\.equals\(t\)/.test(c) && /"place"\.equals\(t\)/.test(c) && /"divider"\.equals\(t\)/.test(c), '코어가 세 노드를 안다');
  });
  await t('뉴스 노드: 뉴스 줄(news)을 그리고(금색 막대·제목·작은 글·›·아래 선) 코어가 안다 · 그릴 때 새 객체 없음', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/drawNews\(/.test(v) && /case ScreenCore\.K_NEWS: drawNews/.test(v), '뉴스 줄 그리기 + drawItem 연결');
    const seg = v.slice(v.indexOf('private void drawNews'), v.indexOf('private void drawDivider'));
    assert.ok(seg.length > 300 && !/\bnew\s+[A-Z]/.test(seg), '뉴스 그리기 구간에 new 가 있다');
    const c = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/K_NEWS = 15/.test(c) && /"news"\.equals\(t\)/.test(c) && /"news"\.equals\(n\.t\)/.test(c), '코어가 뉴스 줄을 안다(읽기 + 배치)');
  });
  await t('CI 워크플로가 파일을 복사하고 MainActivity 에 ScreenNativePlugin 을 등록한다', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    for (const f of ['ScreenCore.java', 'ScreenView.java', 'ScreenNativePlugin.java']) assert.ok(y.includes('native/' + f), f + ' 복사');
    assert.ok(/registerPlugin\(ScreenNativePlugin\.class\)/.test(y));
    assert.ok(/screen_native\.test\.js/.test(y) && /screen_native_js\.ui\.test\.js/.test(y) && /shop_engine\.test\.js/.test(y), '시험 목록');
  });
  console.log(`\n${pass} 통과, ${fail} 실패, ${skipped} 건너뜀`); process.exit(fail ? 1 : 0);
})();
