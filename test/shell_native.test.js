// 네이티브 껍데기(ShellActivity — 웹뷰 없는 앱) 검증 — 2026-10-20 (s84)
//   ① 순수 자바 코어(ShellCore)를 JVM 에서 컴파일하고 자체 점검(ShellJvmTest)이 모두 통과
//   ② 코어는 안드로이드·네트워크·시계를 쓰지 않는다
//   ③ 안드로이드 계층(ShellActivity)을 진짜 android.jar 로 컴파일 — jar 가 없으면 건너뜀(CI 러너엔 SDK 가 있다)
//   ④ 껍데기는 웹뷰·글 만들기를 쓰지 않는다(엔진이 준 화면만 올린다)
//   ⑤ 순수 네이티브 프로젝트(shell-android)에 웹뷰·Capacitor·www 흔적이 없다
// 실행: node test/shell_native.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { const r = await fn(); if (r === 'skip') { skipped++; console.log('  skip ', name); } else { pass++; console.log('  ok  ', name); } } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message || e).split('\n').slice(0, 6).join('\n        ')); } };
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
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shjvm-'));
  await t('ShellCore 를 JVM 에서 컴파일하고 자체 점검(ShellJvmTest)이 모두 통과한다', async () => {
    const core = path.join(out, 'core'); fs.mkdirSync(core);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), N('ShellCore.java'), N('HomeSearchCore.java'), N('HomeCore.java'), N('BoardCore.java'), N('ChatCore.java'), N('FoodCore.java'), N('MapCore.java'), N('FavCore.java'), N('HcardsCore.java'), N('RideCore.java'), N('RulesCore.java'), N('LegacyCore.java'), N('CmCore.java'), N('GwCore.java'), N('DevCore.java'), N('ErrCore.java'), N('ShareCore.java'), N('OvCore.java'), N('TileMapCore.java'), N('NetPost.java'), path.join(__dirname, 'java', 'ShellJvmTest.java')], { env: ENV, encoding: 'utf8' });
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
    const j = path.join(out, 'j'); fs.mkdirSync(j);
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', jar, '-d', j, N('ScreenCore.java'), N('NetPost.java'), N('SceneModel.java'), N('SceneUtil.java'), N('SceneHaptics.java'), N('SceneCv.java'), N('SceneArt.java'), N('SceneActs.java'), N('SceneCore.java'), N('AndroidCv.java'), N('SceneDriver.java'), N('ScreenView.java'), N('ShellCore.java'), N('HomeSearchCore.java'), N('RouteFetchCore.java'), N('HomeCore.java'), N('BoardCore.java'), N('ChatCore.java'), N('FoodCore.java'), N('MapCore.java'), N('FavCore.java'), N('HcardsCore.java'), N('RideCore.java'), N('RulesCore.java'), N('LegacyCore.java'), N('RideOverlay.java'), N('PowerInfo.java'), N('RecoNotify.java'), N('CmCore.java'), N('GwCore.java'), N('DevCore.java'), N('ErrCore.java'), N('ErrLog.java'), N('RecoGo.java'), N('ShareCore.java'), N('OvCore.java'), N('ShareArt.java'), N('ShareProvider.java'), N('TileMapCore.java'), N('TileLoader.java'), N('TileMapArt.java'), N('TileMapView.java'), N('WidgetGeo.java'), N('WidgetSim.java'), N('WidgetArt.java'), N('WidgetCore.java'), N('GdmWidgetBase.java'), N('GdmWidgetHB.java'), N('GdmWidgetHW.java'), N('GdmWidgetVB.java'), N('GdmWidgetVW.java'), N('GdmWidgetReceiver.java'), N('CommuteAlarm.java'), N('CommuteReceiver.java'), N('GdmApp.java'), N('RideService.java'), N('RideWidget.java'), N('MetroMapData.java'), N('MetroCamera.java'), N('MetroRenderer.java'), N('MetroMapView.java'), N('ShellActivity.java')], { env: ENV, encoding: 'utf8' });
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
  await t('SWR: 켜기·탭 전환은 디스크/설정 읽기를 주 스레드에서 기다리지 않고, 캐시를 먼저 보이고 같은 글이면 다시 그리지 않는다', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    const oc = v.slice(v.indexOf('protected void onCreate('), v.indexOf('private void autoGps('));
    const pd = v.slice(v.indexOf('private void preloadDisk()'), v.indexOf('private void cachePut('));
    assert.ok(/ioExec\.execute/.test(pd) && /ShellCore\.warmKeys\(/.test(pd), '모든 탭 열쇠를 IO 스레드에서 미리 읽는다');
    assert.ok(oc.indexOf('preloadDisk();') > 0 && oc.indexOf('preloadDisk();') < oc.indexOf('setContentView(root)'), '미리 읽기를 화면 만들기보다 먼저 시작');
    assert.ok(oc.indexOf('setContentView(root)') < oc.indexOf('new BoardCore(store)') && oc.indexOf('setContentView(root)') < oc.indexOf('CmCore.on(store)'), '설정 값이 필요한 준비는 칸을 만든 뒤에');
    assert.ok(oc.indexOf('showTab(ShellCore.currentTab(store))') > oc.indexOf('setContentView(root)'), '캐시 화면 올리기는 칸을 만든 뒤');
    const lt = v.slice(v.indexOf('private void loadTabs('), v.indexOf('// ── 맨 위 흐르는 문구'));
    assert.ok(/present\(tabs, txt, shown\)/.test(lt), '탭바: 캐시를 보였으면 같은 글은 다시 그리지 않는다');
    assert.ok(/diskAsked\.contains\(ck\)/.test(v) && /postDelayed\([\s\S]{0,260}showSkeleton\(v, screen\)/.test(v), '디스크에서 읽는 중이면 뼈대를 미뤄 깜빡임을 없앤다');
    assert.ok(/if \(keep && v != sheetView && json\.equals\(shownJson\.get\(v\)\)\) return;/.test(v), '같은 글이면 다시 읽지도 그리지도 않는다');
    assert.ok(/if \(c != null && showCached\(v, c\)\) \{ keepX = true;/.test(v), '캐시를 먼저 올리고 그 위에 새 글을 갱신(위치 유지)');
    const dg = v.slice(v.indexOf('private String cacheGet('), v.indexOf('private final java.util.concurrent.ExecutorService ioExec'));
    assert.ok(!/diskGet\(/.test(dg), '주 스레드 캐시 읽기는 파일을 열지 않는다');
  });
  await t('주 스레드 잔여 I/O 제거: 설정 · 글꼴은 Application 에서 미리 · 캐시 파일 "있나?" 는 메모리 목록으로 · 위치 읽기는 IO', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), a = fs.readFileSync(N('GdmApp.java'), 'utf8');
    const man = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    assert.ok(/android:name="\.GdmApp"/.test(man), '매니페스트에 Application 등록');
    assert.ok(/new Thread\(/.test(a) && /preloadFaces\(/.test(a) && /getSharedPreferences\(ShellActivity\.PREFS/.test(a) && /getSharedPreferences\(RideService\.PREFS/.test(a), '설정 2개 · 글꼴을 뒤 스레드에서 미리');
    const hc = v.slice(v.indexOf('private boolean haveCached('), v.indexOf('private final java.util.concurrent.ConcurrentHashMap<String, String> delayBodies'));
    assert.ok(!/isFile\(|\.length\(\)|lastModified\(/.test(hc) && /diskMtime\(/.test(hc), 'haveCached 는 파일을 보지 않는다');
    const ca = v.slice(v.indexOf('private long cacheAge('), v.indexOf('private boolean pfNeeds('));
    assert.ok(!/isFile\(|lastModified\(/.test(ca), 'cacheAge 도 파일을 보지 않는다');
    const dm = v.slice(v.indexOf('private long diskMtime('), v.indexOf('private void cachePut('));
    assert.ok(/Looper\.myLooper\(\) != Looper\.getMainLooper\(\)/.test(dm) && /idxReady\.await/.test(dm), '주 스레드는 기다리지 않는다(다른 스레드만 목록 훑기를 기다림)');
    assert.ok(/listFiles\(\)/.test(v.slice(v.indexOf('private void preloadDisk()'), v.indexOf('private final java.util.concurrent.ConcurrentHashMap<String, Long> diskIdx'))), '캐시 폴더 훑기는 IO 스레드 안');
    const cl = v.slice(v.indexOf('private void captureLastLoc()'), v.indexOf('private void captureLastLoc()') + 400);
    assert.ok(/ioExec\.execute/.test(cl), '위치 읽기는 IO 스레드');
    assert.ok(/diskIdx\.put\(diskName\(key\)/.test(v) && /diskIdx\.remove\(diskName\(old\)\)/.test(v), '쓰기 · 지우기가 목록을 맞춘다');
  });
  await t('모든 탭 미리 받기(0초 병렬 · 예외 탭 없음): 지금 칸의 요청 번호를 올리지 않고 캐시에만 넣는다 · 스켈레톤 · 마지막 위치', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    const m = v.slice(v.indexOf('private void prefetchTabs()'), v.indexOf('private void cachePutAsync('));
    assert.ok(m.length > 2000, 'prefetchTabs 있음');
    for (const f of ['/screen/home', '/screen/cchips', '/screen/chat', '/screen/board', '/screen/map', '/screen/food', 'prefetchNews', 'shopCall(', 'S_SETTINGS', 'catValues', 'modeOverride']) assert.ok(m.includes(f), f + ' 미리 받기');
    assert.ok(!/\+\+seq/.test(m) && !/present\(/.test(m), '진행 중인 칸을 건드리지 않는다');
    assert.ok(!/loadFood\(|locateForFood|locateOnce\(/.test(m), '미리 받기가 권한 안내를 띄우지 않는다');
    assert.ok(!/postDelayed\([^)]*prefetchTabs/.test(v) && /captureLastLoc\(\);\s*ioExec\.execute\([^;]*main\.post\([^;]*prefetchTabs\(\);/.test(v), '지연 타이머 없이 켜는 즉시 시작(캐시 파일 목록 훑기 직후)');
    assert.ok(/prefetchPut\(/.test(m) && /expectId\(key\)/.test(v), '받은 글은 화면 이름을 확인하고 캐시에 넣는다');
    assert.ok(/showSkeleton\(v, screen\)/.test(v) && /skeletonScreen/.test(v), '캐시가 없으면 뼈대를 먼저 띄운다');
    assert.ok(/restoreState\(ck, json\)/.test(v) && /diskTtl\(key\)/.test(v), '캐시 화면은 눌림 상태까지 되살리고 모든 화면을 디스크에 둔다');
    assert.ok(/seedMapLoc\(\)/.test(v) && /lastLocGet\(store\)/.test(v) && /locateQuiet\(/.test(v), '지도 · 맛집은 마지막 위치로 먼저 그리고 조용히 새 위치를 받는다');
  });
  await t('고유 id 행동 · 우선순위 큐 · 배치 · 조건부 요청(ETag/304): 앱은 엔진이 준 id/ETag 를 따르기만 한다', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    const pf = v.slice(v.indexOf('private void prefetchTabs()'), v.indexOf('private void cachePutAsync('));
    assert.ok(/PriorityBlockingQueue<PfTask>/.test(v) && /pfAdd\(/.test(pf) && /pfBatch\(/.test(v), '우선순위 큐와 한 번에 묶어 받기');
    assert.ok(/\/screen\/batch/.test(v) && /\/screen\/batch/.test(fs.readFileSync(path.join(ROOT, 'engine', 'screen-cache-worker.js'), 'utf8')), '배치 길은 엔진 쪽에도 있다');
    assert.ok(/pfGap\(\);/.test(v.slice(v.indexOf('private void pfKick'), v.indexOf('private boolean pfNeeds'))) && /Thread\.sleep\(/.test(v.slice(v.indexOf('void pfGap'), v.indexOf('void pfGap') + 600)), '낮은 순위 요청은 100~300ms 간격을 둔다');
    assert.ok(/NOT_MOD/.test(v) && /getCond\(|postCond\(/.test(v) && /If-None-Match/.test(fs.readFileSync(N('NetPost.java'), 'utf8')), 'ETag 를 보내고 304 면 캐시 그대로');
    assert.ok(/openNewsById\(a\.id/.test(v) && /rowJsonById\(/.test(v), '소식은 순번이 아니라 기사 고유 id 로 연다');
    assert.ok(/a\.id/.test(v.slice(v.indexOf('boardAct('))) , '게시판 행동은 글 고유 id 를 쓴다');
    assert.ok(/rowJsonById\(id, title, ix\)/.test(v) && /openNewsById\(a\.id, a\.t, a\.ix\)/.test(v), '같은 링크가 여럿이어도 엔진이 알려 준 원래 위치(ix)로 그 줄을 연다');
    assert.ok(/settingsKey\(store\)/.test(v) && /dropOldSettings\(/.test(v), '설정 화면 캐시는 기기 저장값 지문 열쇠(옛 토글 값이 안 나온다)');
    assert.ok(/retryHint\(/.test(v) && /showDelayed\(/.test(v) && /scheduleRetry\(/.test(v) && /delayBodies/.test(v), '서버 지연 안내(엔진) 그리기 + 뒤에서 재시도');
    assert.ok(!/cachePut\(ck, json\)/.test(v.slice(v.indexOf('private void showDelayed('), v.indexOf('private void scheduleRetry('))), '지연 안내 화면은 캐시에 두지 않는다');
    const sv = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/anchorKey\(/.test(sv) && /ancKey/.test(sv), '목록이 바뀌어도 보던 글 위치를 id 로 붙잡는다');
    const od = sv.slice(sv.indexOf('protected void onDraw'));
    assert.ok(!/anchorKey\(/.test(od.slice(0, 3000)), '그리는 중엔 계산하지 않는다');
  });
  await t('디스크 캐시는 주 스레드에서 열지 않는다: IO 전용 스레드 하나 · 켤 때 미리 읽고 해석(warm) · 메모리 LRU 가 먼저 · 읽히면 빈 칸에 바로 올림', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    const cg = v.slice(v.indexOf('private String cacheGet('), v.indexOf('private final java.util.concurrent.ExecutorService ioExec'));
    assert.ok(/scrCache\.get\(key\)/.test(cg) && /diskPre\.remove\(key\)/.test(cg) && /diskWarmAsync\(key\)/.test(cg) && !/diskGet\(/.test(cg), 'cacheGet: 메모리 → 미리 읽은 것 → IO 에 맡김(파일을 직접 열지 않는다)');
    assert.ok(/newSingleThreadExecutor/.test(v) && /"shell-io"/.test(v), 'IO 전용 스레드 하나(차례 보장)');
    const dw = v.slice(v.indexOf('private void diskWarmAsync('), v.indexOf('private void adoptDisk('));
    assert.ok(/ioExec\.execute/.test(dw) && /diskGet\(key\)/.test(dw) && /warm\(c\)/.test(dw) && /main\.post/.test(dw), '읽기 → 미리 해석 → 주 스레드엔 올리기만');
    const ad = v.slice(v.indexOf('private void adoptDisk('), v.indexOf('private void preloadDisk('));
    assert.ok(/scrCache\.get\(key\) != null\) return/.test(ad) && /itemCount\(\) == 0 \|\| skelViews\.contains\(v\)/.test(ad) && /showCached\(v, c\)/.test(ad), '네트워크 글이 먼저 왔으면 지키고 · 빈 칸/뼈대만 갈아 올린다');
    assert.ok(/preloadDisk\(\);/.test(v.slice(v.indexOf('protected void onCreate'), v.indexOf('protected void onCreate') + 1500)), 'onCreate 에서 바로 미리 읽기');
    const dp = v.slice(v.indexOf('private void diskPut('), v.indexOf('/** 캐시 글을 조용히 올린다'));
    assert.ok(/ioExec\.execute/.test(dp) && !/new Thread/.test(dp), '쓰기도 IO 스레드');
  });
  await t('버스 도착 초 카운트다운(웹 _busFmtCd/_busArrKeep): 1초마다 줄여 그림 · 흐르던 값 이어감 · 캐시 나이 반영 · 돌아오면 바로 갱신 · 켜면 홈부터 · 교환 단추 맨 위 · 키보드 편집을 배치 동기화가 끝내지 않음', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/public static String cdFmt\(/.test(sc) && /it\.bs\[i \* 2 \+ a\] = ar\.val/.test(sc), '남은 초를 항목에 싣는다');
    assert.ok(!/flowed/.test(sv) && /cdState\.put\(it\.ck\[k\], new double\[\] \{ sec, now - age \}\)/.test(sv) && /cdDrawn\) postInvalidateDelayed\(1000L/.test(sv) && /rem <= 60\.0/.test(sv), '새 실시간 값이 오면 옛 카운트다운을 버리고 덮어쓴다 · 초마다 다시 그리고 · 60초 이하는 임박색');
    assert.ok(/setSourceAge\(am > 0L/.test(v) && /diskIdx\.put\(diskName\(key\), System\.currentTimeMillis\(\)\)/.test(v), '캐시 화면은 받은 뒤 흐른 만큼 줄어 있다');
    assert.ok(/private void busResume\(\)/.test(v) && /busResume\(\); brResume\(\); if \(ShellCore\.S_SETPG/.test(v) && /> BUS_POLL_MS/.test(v), '앞으로 돌아오면 8초 넘었을 때 바로 다시 받는다');
    assert.ok(/if \(b == null\) store\.put\(ShellCore\.K_TAB, ShellCore\.DEFAULT_TAB\)/.test(v), '새로 켜면 홈부터');
    assert.ok(/kind != ScreenCore\.K_SWAP\) drawItem/.test(sv) && /kind == ScreenCore\.K_SWAP\) drawItem/.test(sv), '교환 단추는 구분선 위에 그린다');
    const hi = sv.slice(sv.indexOf('private void hideInput()'), sv.indexOf('private void syncInput()'));
    assert.ok(!/endEdit\(\)|blurInput\(\)/.test(hi), '검색칸 숨기기가 글자 입력칸 편집을 끝내지 않는다');
  });
  await t('버스 탭: 8초 자동 새로고침은 지도 탭이 보일 때만 · 도착정보만 비우고 엔진이 다시 계산 · 앱은 시간표/도착 계산 없음', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    const mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    const bt = v.slice(v.indexOf('private boolean busShowing'), v.indexOf('private void startBusTick'));
    assert.ok(/BUS_POLL_MS = 8000L/.test(v) && /postDelayed\(busTick, BUS_POLL_MS\)/.test(v), '8초 간격');
    assert.ok(/resumed/.test(bt) && /currentTab\(store\)/.test(bt) && /S_MAPB/.test(bt) && /dropArrivals\(\)/.test(bt) && /loadMapBodyRound\(/.test(bt), '보일 때만 · 도착정보만 비우고 다시 묻는다');
    // 끊겨도 화면을 멈추거나 에러를 띄우지 않는다: 실패한 갱신은 버리고(옛 값을 섞지 않음) 카운트다운이 이어진다 · 느린 통신이 다음 박자에 끊기지 않는다
    assert.ok(/txt\.length\(\) == 0 && busRefreshing\) \{ busFail\(\); return; \}/.test(v) && /if \(bad\) \{ busFail\(\); return; \}/.test(v) && /private void busFail\(\) \{ map\.restoreArrivals\(\); busEnd\(\); \}/.test(v), '갱신 실패는 조용히 버리고 보던 도착정보를 되돌려 놓는다(비어서 "도착정보 없음"이 되지 않는다)');
    assert.ok(/if \(busRefreshing && System\.currentTimeMillis\(\) - busRefAt < 20000L\) \{ startBusTick\(\); return; \}/.test(bt), '갱신이 오가는 중이면 겹쳐 시작하지 않는다');
    assert.ok(/BUS_FRESH_MS/.test(v) && /BUS_FRESH_MS = 8000L/.test(fs.readFileSync(N('ShellCore.java'), 'utf8')), '8초 지난 버스 캐시 화면은 보이지 않는다');
    assert.ok(/\[af\]\[0-9\]/.test(mc.slice(mc.indexOf('dropArrivals'))), '정류장 목록(tp·gg·tn·d1)은 남기고 도착정보(a·f)만 지운다');
    assert.ok(/mp\.pm\./.test(v) || /mp\.pm/.test(mc), '핀·카드 선택 행동');
    const svw = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/cdFresh = true;/.test(svw) && /if \(fresh \|\| !cdState\.containsKey\(it\.ck\[k\]\)\)/.test(svw), '지도를 만져 다시 배치해도 흐르던 초는 그대로(새 화면일 때만 시작점을 새로 잡는다)');
    assert.ok(/arrAge\(\)/.test(mc) && /setSourceAge\(map\.arrAge\(\)\)/.test(v), '엔진이 옛 도착정보로 다시 그린 화면은 받은 뒤 흐른 만큼 이미 줄어 있다');
  });
  await t('노선 상세: 정류장은 기기에 7일 · 위치는 항상 새로 받은 값 · 8초 갱신은 이 화면이 앞에 있을 때만 · 벗어나면 즉시 멈춤 · 실패해도 화면 유지 · 바뀐 줄만 다시 그림', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    const br = v.slice(v.indexOf('private static final long BR_POLL_MS'), v.indexOf('private void closeSheet()'));
    assert.ok(/BR_POLL_MS = 8000L/.test(br) && /BR_CACHE_MS = 7L \* 24L/.test(br) && /brc_/.test(br), '8초 · 정류장 7일 보관');
    assert.ok(/private boolean brShowing\(\) \{ return resumed && brAlive/.test(br) && /if \(!brShowing\(\)\) return;/.test(br), '앞에 있을 때만 돈다(없으면 다시 걸지 않는다)');
    assert.ok(/private void closeSheet\(\) \{ brStop\(\);/.test(v) && /private void brStop\(\) \{ main\.removeCallbacks\(brTick\)/.test(br) && /onPause\(\) \{ resumed = false; main\.removeCallbacks\(brTick\)/.test(v) && /brResume\(\); if \(ShellCore\.S_SETPG/.test(v), '닫기·뒤로가기·onPause 에서 즉시 멈추고 onResume 에서만 다시');
    assert.ok(/poll && got\.length\(\) == 0\) \{ if \(brFlight\.isEmpty\(\)\) brBusy = false; return; \}/.test(br) && /txt\.length\(\) == 0\) \{ if \(my == brReq/.test(br), '갱신 실패는 버리고 보던 화면을 둔다');
    assert.ok(/for \(String\[\] nd : need\) if \(brFlight\.add\(nd\[0\]\)\) brFetchOne\(/.test(br) && /brFlight\.remove\(k\);[\s\S]*?brRound\(gen, poll\)/.test(br), '주소마다 따로 받아 오는 대로 바로 다시 그린다(목록이 위치를 기다리지 않는다)');
    assert.ok(/a < \(pos \? 5 : 2\)/.test(br) && /Thread\.sleep\(pos \? 800 : 300\)/.test(br), '위치는 실패하면 0.8초 뒤 다시(최대 4번 더)');
    assert.ok(/home\.pickRestore\(map\.pkName\)/.test(br) && /home\.setBusStop\(HomeCore\.START/.test(br) && /home\.setBusStop\(HomeCore\.DEST/.test(br) && /goRoute\(\)/.test(br), '출발지/도착지 고르기 · 나가면 되돌림 · 도착지가 정해지면 경로');
    assert.ok(/dirtyOnly\(partialFrom\)/.test(sv) && /invalidate\(0, Math\.round/.test(sv) && /postInvalidateDelayed\(66L, Math\.round\(brxPing/.test(sv), '바뀐 줄 자리만 invalidate · 마커 맥박도 그 자리만');
    assert.ok(/K_BRX/.test(sc) && /it\.sig = /.test(sc), '줄 지문');
  });
  await t('순수 네이티브 프로젝트: 소스는 native/shell 뿐 · 매니페스트에 ShellActivity 가 런처 · 웹뷰/Capacitor 흔적 없음', async () => {
    const g = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'build.gradle'), 'utf8');
    assert.ok(/srcDirs = \['\.\.\/\.\.\/native\/shell'\]/.test(g), '소스 경로');
    const m = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    assert.ok(/\.ShellActivity/.test(m) && /android\.intent\.category\.LAUNCHER/.test(m), '런처');
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-shell.yml'), 'utf8');
    assert.ok(/shell_native\.test\.js/.test(y) && /assembleDebug/.test(y) && /Bundle Noto Sans KR/.test(y), '워크플로');
    for (const f of [g, m, y].concat(walk(path.join(ROOT, 'native', 'shell'), '.java').map(x => fs.readFileSync(x, 'utf8')))) assert.ok(!/capacitor|WebView|BridgeActivity|webDir/i.test(f), '웹 흔적');
    assert.ok(!fs.existsSync(path.join(ROOT, 'www')), 'www 폴더가 없어야 한다(웹 기준본은 ios-reference/)');
  });
  console.log(`\n${pass} 통과 / ${fail} 실패 / ${skipped} 건너뜀`);
  process.exit(fail ? 1 : 0);
})();
