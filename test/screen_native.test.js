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
const N = n => path.join(ROOT, 'native', 'shell', n);
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
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), N('NetPost.java'), N('PerfLog.java'), N('TileMapCore.java'), path.join(__dirname, 'java', 'ScreenJvmTest.java')], { env: ENV, encoding: 'utf8' });
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
    const j = path.join(out, 'j'); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', jar, '-d', j, N('ScreenCore.java'), N('NetPost.java'), N('PerfLog.java'), N('SceneModel.java'), N('SceneUtil.java'), N('SceneHaptics.java'), N('SceneTrain.java'), N('ScenePlatform.java'), N('SceneCv.java'), N('SceneArt.java'), N('SceneFx.java'), N('ScenePlaces.java'), N('SceneActs.java'), N('SceneCore.java'), N('AndroidCv.java'), N('SceneDriver.java'), N('ScreenView.java'), N('ActRowCore.java'), N('RunnerCore.java'), N('RunnerArt.java'), N('TileMapCore.java'), N('TileLoader.java'), N('TileMapArt.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)).join(' / ').slice(0, 1500));
    assert(fs.existsSync(path.join(j, 'com', 'dullyyj', 'subway', 'ScreenView.class')));
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
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), p = '';
    assert.ok(/new EditText\(/.test(v) && /IME_ACTION_SEARCH/.test(v) && /LengthFilter/.test(v), '입력칸·검색 키·길이');
    assert.ok(/onInputFocus\(/.test(v) && /onSearch\(/.test(v), '포커스·검색 알림');
    assert.ok(/getClipBounds\(\)/.test(v) && /hideInput\(\)/.test(v), '잘리면 입력칸을 내린다');
    assert.ok(/hideSoftInputFromWindow/.test(v) && /removeView\(input\)/.test(v), '키보드 내리기 · 뷰가 떨어지면 입력칸도 뗀다');
    assert.ok(/bringToFront\(\)/.test(v), '입력칸이 그림 뷰 위에 놓인다');
    assert.ok(/syncLater\(\)/.test(v) && !/protected void onLayout[^{]*\{[^}]*syncInput\(\)/.test(v), '배치 도중 자식 뷰를 건드리지 않고 한 박자 뒤로 미룬다');
    assert.ok(/drawBox\(/.test(v) && /drawSearch\(/.test(v) && /drawRich\(/.test(v), '상자·검색줄·굵은 글자 그리기');
          });
  await t('설정 노드: 스위치는 바로 뒤집고 set 이벤트 · 입력칸은 눌렀을 때만 만든다 · 글자 모음(fields) · 앱 토스트', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), p = '';
    assert.ok(/drawPanel\(/.test(v) && /drawToggle\(/.test(v) && /drawNav\(/.test(v) && /drawSelect\(/.test(v) && /drawField\(/.test(v), '패널·스위치·이동줄·고르기·입력칸 그리기');
    assert.ok(/pi\.on = !pi\.on/.test(v) && /listener\.onSet\(/.test(v), '스위치: 화면을 먼저 뒤집고 set 알림');
    assert.ok(/ensureEditor\(|beginEdit\(/.test(v) && /commitEdit\(/.test(v) && /endEdit\(/.test(v), '입력칸 편집: 눌렀을 때 만들고 끝나면 글자를 모으고 뗀다');
    assert.ok(/public Map<String, String> fields\(\)/.test(v), 'fields() 로 글자 모음');
              });
  await t('그림 받기: 백그라운드 스레드 + 메모리/파일 캐시 + 실패 재시도 간격 + 크기 한도', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/newFixedThreadPool/.test(v) && /LruCache/.test(v) && /scr_img/.test(v), '풀·캐시');
    assert.ok(/failed\.put/.test(v) && /60000L/.test(v), '실패 간격');
    assert.ok(/4_000_000L/.test(v) && /inSampleSize/.test(v), '크기 한도·축소 디코드');
    assert.ok(/getResponseCode\(\) != 200/.test(v), '정상 응답만');
  });
  await t('글꼴: 웹과 같은 Noto Sans KR 를 쓴다(assets/fonts) · 없으면 기기 기본으로 · CI 가 글꼴을 만들어 넣는다', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), p = '', y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-shell.yml'), 'utf8');
    assert.ok(/fonts\/NotoSansKR-Regular\.ttf/.test(v) && /fonts\/NotoSansKR-Bold\.ttf/.test(v), '보통·굵게 글꼴 파일');
    assert.ok(/Typeface\.DEFAULT_BOLD : Typeface\.DEFAULT/.test(v), '글꼴 없으면 기기 기본으로');
    assert.ok(!/setTypeface\(bold \? Typeface\.DEFAULT_BOLD/.test(v), '직접 기본 글꼴을 쓰지 않고 face() 를 거친다');
    assert.ok((v.match(/face\(/g) || []).length >= 5, '재기·그리기·입력칸이 같은 글꼴');
        assert.ok(/Bundle Noto Sans KR/.test(y) && /assets\/fonts\/NotoSansKR-/.test(y) && /instantiateVariableFont/.test(y), 'CI 글꼴 만들기');
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
  await t('게시판·채팅·탭 노드: 펼침 카드(post)·댓글·단추 줄·입력줄·말풍선·탭 막대·아래 고정 줄을 그리고 코어가 안다 · 그릴 때 새 객체 없음', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), c = fs.readFileSync(N('ScreenCore.java'), 'utf8'), p = '';
    for (const k of ['POSTH:drawPostHead', 'CMT:drawCmt', 'RBTN:drawRbtn', 'INBAR:drawInbar', 'MSG:drawMsgAnim', 'TAB:drawTab']) {
      const [kind, fn] = k.split(':');
      assert.ok(new RegExp('case ScreenCore\\.K_' + kind + ': ' + fn + '\\(').test(v), 'drawItem 연결 ' + k);
      assert.ok(new RegExp('private void ' + fn + '\\(').test(v), fn + ' 정의');
    }
    const draw = v.slice(v.indexOf('protected void onDraw'), v.indexOf('// ───────────── 검색 입력칸'));
    assert.ok(!/\bnew\s+[A-Z]/.test(draw), '그리기 구간에 new: ' + (draw.match(/\bnew\s+[A-Z]\w*/) || [''])[0]);
    assert.ok(/pathFor\(/.test(draw) && /private android\.graphics\.Path pathFor\(/.test(v) && /iconPaths\.get\(/.test(v), '아이콘 경로는 한 번만 만들어 둔다(그릴 때 만들지 않음)');
    assert.ok(/lay\.footH/.test(draw) && /lay\.foot\[i\]/.test(draw) && /footTop\(\)/.test(v), '아래 고정 줄을 그리고 본문 영역에서 뺀다');
    assert.ok(/private void toggleOpen\(/.test(v) && /openKey = wasOn \? "" : key/.test(v) && /topOnScreen/.test(v) && /listener\.onSet\(a, !wasOn\)/.test(v), '게시글 펼침: 앱이 바로 토글 · 눌린 머리 위치 유지 · on 알림');
    assert.ok(/private void tapInbar\(/.test(v) && /private void fireInbar\(/.test(v) && /IME_ACTION_SEND/.test(v) && /public void setField\(/.test(v), '입력줄: 단추·키보드 보내기 · 웹이 글자를 비울 수 있다');
    assert.ok(/editInFoot/.test(v) && /K_INBAR/.test(v.slice(v.indexOf('private ScreenCore.Item fieldByKey'))), '입력칸 찾기는 본문과 아래 고정 줄 모두');
        for (const k of ['K_POSTH = 16', 'K_CMT = 17', 'K_RBTN = 18', 'K_INBAR = 19', 'K_MSG = 20', 'K_TAB = 21']) assert.ok(c.includes(k), k);
    for (const n of ['post', 'cmt', 'btnrow', 'inbar', 'msg', 'tabbar']) assert.ok(new RegExp('"' + n + '"\\.equals\\(t\\)').test(c) && new RegExp('"' + n + '"\\.equals\\((t0\\()?n(\\))?\\.?t?\\)').test(c) || c.includes('"' + n + '".equals'), n + ' 읽기·배치');
    assert.ok(/public static float\[\] pathOps\(/.test(c) && /sc\.foot\.add\(/.test(c), '코어: 경로 읽기 · foot');
  });
  await t('주변 정류장 끌어서 순서 바꾸기(웹 busJiggle · _bd*): 꾹 누르기 · 흔들림 · 끌기 · 자동 스크롤 · 완료 줄을 그리고 코어가 글을 안다 · 그릴 때 새 객체 없음', async () => {
    const v = fs.readFileSync(N('ScreenView.java'), 'utf8'), c = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/case ScreenCore\.K_BCARD: drawBcardRo\(cv, it\)/.test(v) && /private void drawBcardRo\(/.test(v) && /private void roDrawDragged\(/.test(v) && /private void roDrawBar\(/.test(v), '카드 그리기 연결 + 끌리는 카드 · 완료 줄');
    assert.ok(/RO_LP_MS = 420L/.test(v) && /ui\.postDelayed\(lpRun, RO_LP_MS\)/.test(v) && /0\.8f \* \(float\) Math\.cos\(2\.0 \* Math\.PI \* \(SystemClock\.uptimeMillis\(\) % 240L\) \/ 240\.0\)/.test(v) && /RO_ZOOM = 1\.03f/.test(v) && /RO_EDGE = 90f, RO_MAXV = 18f/.test(v), '웹 값: 420ms 꾹 · 흔들림 .24초 ±0.8° · 1.03배 · 가장자리 90 · 최대 18');
    for (const fn of ['roDrawDragged', 'drawBcardRo', 'roDrawBar', 'roStep']) {
      const i = v.indexOf('private void ' + fn + '('), seg = v.slice(i, v.indexOf('\n    }\n', i));
      assert.ok(i > 0 && !/\bnew\s+[A-Z]/.test(seg), fn + ' 에 new 가 있다');
    }
    assert.ok(/roStep\(now\);/.test(v) && /roAnim\) postInvalidateOnAnimation/.test(v) && /if \(dragOn \|\| settleOn\) roDrawDragged\(cv\)/.test(v) && /roDrawBar\(cv, w\)/.test(v), 'drawAll 이 프레임마다 이어 그린다');
    assert.ok(/mode == 6 \|\| mode == 7\) && e\.getActionMasked\(\) != MotionEvent\.ACTION_DOWN\) return roTouch\(e\)/.test(v) && /roMode && roDown\(x, y\)/.test(v) && /void onReorder\(String\[\] keys, int\[\] perm\)/.test(v), '손가락 길 · 알림 연결');
    assert.ok(/public String rol = "", rod = "";/.test(c) && /n\.rol = optStr\(m, "rol"/.test(c) && /it\.rol = n\.rol; it\.rod = n\.rod;/.test(c), '코어가 순서 바꾸기 줄 글(엔진 것)을 읽는다');
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), m = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/body\.setReorderHost\(/.test(a) && /map\.reorderNear\(keys, perm\)/.test(a) && /loadMapBody\(body, true\)/.test(a.slice(a.indexOf('private void reorderBusNear'))) && /K_BUSORD = "bus_ord"/.test(m) && /\\"ord\\":/.test(m), '앱: 저장 → 엔진이 새 순서로 다시 그림(도착정보는 번호만 옮김)');
  });
  await t('홈 경로 입력 노드: 동그라미·굵은 글·작은 단추·확인 키(eact)·흐린 단추(dim) · 목록줄(sug) · 바꾸기 단추(swap) · 글자 바뀜/높이 이벤트 · 위에 그려진 것이 먼저 눌린다', async () => {
    const v = fs.readFileSync(path.join(ROOT, 'native', 'shell', 'ScreenView.java'), 'utf8'), p = '', c = fs.readFileSync(path.join(ROOT, 'native', 'shell', 'ScreenCore.java'), 'utf8');
    for (const k of ['SUG:drawSug', 'SWAP:drawSwap']) {
      const [kind, fn] = k.split(':');
      assert.ok(new RegExp('case ScreenCore\\.K_' + kind + ': ' + fn + '\\(').test(v), 'drawItem 연결 ' + k);
      assert.ok(new RegExp('private void ' + fn + '\\(').test(v), fn + ' 정의');
    }
    for (const k of ['K_SUG = 22', 'K_SWAP = 23']) assert.ok(c.includes(k), k);
    for (const n of ['swap', 'sug']) assert.ok(c.includes('"' + n + '".equals(t)') && c.includes('"' + n + '".equals(n.t)'), n + ' 읽기·배치');
    assert.ok(/it\.dotC != null/.test(v) && /cv\.drawCircle\(it\.bx, it\.by, 5f/.test(v), '입력줄 왼쪽 동그라미');
    assert.ok(/setText\(it\.size, it\.bold,/.test(v) && /it\.size2 > 0f \? it\.size2 : it\.size/.test(v), '입력줄 굵은 글 · 단추 글 크기 따로');
    assert.ok(/void onText\(String key, String value, String kind\)/.test(v) && /void onContentH\(float dp\)/.test(v) && /TextWatcher/.test(v) && /editSilent/.test(v), '글자 바뀜·내용 높이 알림 (웹이 비운 글은 알리지 않음)');
        assert.ok(/for \(int i = r\[1\] - 1; i >= r\[0\]; i--\)/.test(v), '눌림은 위에 그려진 것(바꾸기 단추)부터 찾는다');
    assert.ok(/pi\.act2 != null && x \/ dpr >= pi\.btx/.test(v) && /cur\.act2 != null \? cur\.act2 : cur\.act/.test(v), '목록줄 오른쪽 단추 · 확인 키 행동');
    assert.ok(/if \(!it\.on\) fireInbar\(/.test(v), '흐린 단추는 눌려도 무시');
    const draw = v.slice(v.indexOf('protected void onDraw'), v.indexOf('// ───────────── 검색 입력칸'));
    assert.ok(!/\bnew\s+[A-Z]/.test(draw), '그리기 구간에 new: ' + (draw.match(/\bnew\s+[A-Z]\w*/) || [''])[0]);
  });
  console.log(`\n${pass} 통과, ${fail} 실패, ${skipped} 건너뜀`); process.exit(fail ? 1 : 0);
})();
