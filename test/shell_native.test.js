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
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', core, N('ScreenCore.java'), N('ShellCore.java'), N('HomeSearchCore.java'), N('HomeCore.java'), N('WalkCore.java'), N('BoardCore.java'), N('ChatCore.java'), N('FoodCore.java'), N('MapCore.java'), N('FavCore.java'), N('HcardsCore.java'), N('RideCore.java'), N('RulesCore.java'), N('LegacyCore.java'), N('CmCore.java'), N('GwCore.java'), N('DevCore.java'), N('ErrCore.java'), N('ShareCore.java'), N('OvCore.java'), N('RsCore.java'), N('ActRowCore.java'), N('TileMapCore.java'), N('NetPost.java'), N('Debounce.java'), N('Swr.java'), N('RunnerCore.java'), N('SceneModel.java'), path.join(__dirname, 'java', 'ShellJvmTest.java')], { env: ENV, encoding: 'utf8' });
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
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', jar, '-d', j, N('ScreenCore.java'), N('NetPost.java'), N('SceneModel.java'), N('SceneUtil.java'), N('SceneHaptics.java'), N('SceneCv.java'), N('SceneArt.java'), N('SceneActs.java'), N('SceneCore.java'), N('AndroidCv.java'), N('SceneDriver.java'), N('ScreenView.java'), N('RunnerCore.java'), N('RunnerArt.java'), N('PlayCore.java'), N('PlayView.java'), N('ShellCore.java'), N('HomeSearchCore.java'), N('RouteFetchCore.java'), N('HomeCore.java'), N('WalkCore.java'), N('BoardCore.java'), N('ChatCore.java'), N('FoodCore.java'), N('MapCore.java'), N('FavCore.java'), N('HcardsCore.java'), N('RideCore.java'), N('RideJs.java'), N('RideTrackJ.java'), N('RideEtaJ.java'), N('RideStandbyJ.java'), N('RidePosFusionJ.java'), N('RideLocal.java'), N('RulesCore.java'), N('LegacyCore.java'), N('RideOverlay.java'), N('PowerInfo.java'), N('RecoNotify.java'), N('CmCore.java'), N('GwCore.java'), N('DevCore.java'), N('ErrCore.java'), N('ErrLog.java'), N('RecoGo.java'), N('ShareCore.java'), N('OvCore.java'), N('ShareArt.java'), N('ShareProvider.java'), N('RsCore.java'), N('ActRowCore.java'), N('RsSheetView.java'), N('TileMapCore.java'), N('TileLoader.java'), N('TileMapArt.java'), N('TileMapView.java'), N('WidgetGeo.java'), N('WidgetSim.java'), N('WidgetArt.java'), N('WidgetCore.java'), N('GdmWidgetBase.java'), N('GdmWidgetHB.java'), N('GdmWidgetHW.java'), N('GdmWidgetVB.java'), N('GdmWidgetVW.java'), N('GdmWidgetReceiver.java'), N('CommuteAlarm.java'), N('CommuteReceiver.java'), N('GdmApp.java'), N('RideService.java'), N('RideWidget.java'), N('MetroMapData.java'), N('MetroCamera.java'), N('MetroRenderer.java'), N('MetroMapView.java'), N('VecMap.java'), N('LocFused.java'), N('Debounce.java'), N('Swr.java'), N('ShellActivity.java')].concat(walk(path.join(__dirname, 'java', 'maplibre-stubs'), '.java')), { env: ENV, encoding: 'utf8' });
    const jl = (r.stderr || '').split('\n').filter(l => !/^Picked up/.test(l)), je = [];   // 경고(-Xlint)에 오류가 묻히지 않게 오류 줄과 뒤 3줄을 앞에 보인다
    jl.forEach((l, i) => { if (/: error:/.test(l)) je.push(jl.slice(i, i + 4).join(' ')); });
    assert.strictEqual(r.status, 0, (je.length ? je.join(' / ') : jl.join(' / ')).slice(0, 1500));
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
    assert.ok(/seedMapLoc\(\)/.test(v) && !/lastLocGet\(store\)/.test(v) && /liveLL\(\)/.test(v) && /locateQuiet\(/.test(v), '지도 · 맛집은 방금 받은 현재 위치(20~60초 안)로만 먼저 그리고(옛 위치는 쓰지 않는다) 조용히 새 위치를 받는다');
    const lf = fs.readFileSync(N('LocFused.java'), 'utf8');
    assert.ok(/lastLocFresh\(store, 30L \* 60000L/.test(v) && /locf\.lastKnown\(5L \* 60000L/.test(v) && /void lastKnown\(final long maxAgeMs/.test(fs.readFileSync(N('LocFused.java'), 'utf8')) && /getLastLocation\(\)/.test(fs.readFileSync(N('LocFused.java'), 'utf8')) && /BUS_MOVE_DEG = 0\.0005/.test(v), 's148: 버스 첫 화면은 방금 안 위치(30분 안 저장값 · Fused 마지막 위치 5분 안)로 위치 대기 없이 그리고, 새 위치가 55m 넘게 다르면 바로잡는다');
    assert.ok(/map\.svFail > 0 && round == 0 && map\.fillFromStash\(\) > 0/.test(v) && /spec\.isEmpty\(\) \|\| map\.svServer/.test(v) && /"bus"\.equals\(modeNow\) \? 12000 : 8000/.test(v), 's148: 서버가 한 번에 받아 주면 기기가 따로 받지 않고 · 못 받은 곳만 보던 값으로 채워 갱신이 막히지 않는다');
    assert.ok(/getCurrentLocation\(/.test(lf) && /PRIORITY_HIGH_ACCURACY/.test(lf) && /setMaxUpdateAgeMillis\(0L\)/.test(lf) && /setDurationMillis\(fastMs\)/.test(lf) && /NETWORK_PROVIDER/.test(lf) && !/getLastKnownLocation/.test(lf), '고정밀 현재 위치(캐시 0 · 제한 시간) + 네트워크 위치 동시 · 마지막 알려진 위치는 쓰지 않는다');
    assert.ok(/void untrack\(\)/.test(lf) && /removeLocationUpdates\(trackCb\)/.test(lf) && /trackStop\(\); if \(vec != null\) vec\.onPause\(\)/.test(v) && /trackStart\(\); refreshPower/.test(v), '화면이 켜진 동안만 연속 위치 · 벗어나면 즉시 해제');
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
    assert.ok(/kind == ScreenCore\.K_SWAP\) continue;/.test(sv) && /kind == ScreenCore\.K_SWAP\) drawItem/.test(sv), '교환 단추는 구분선 위에 그린다');
    const hi = sv.slice(sv.indexOf('private void hideInput()'), sv.indexOf('private void syncInput()'));
    assert.ok(!/endEdit\(\)|blurInput\(\)/.test(hi), '검색칸 숨기기가 글자 입력칸 편집을 끝내지 않는다');
  });
  await t('버스 탭: 8초 자동 새로고침은 지도 탭이 보일 때만 · 도착정보만 비우고 엔진이 다시 계산 · 앱은 시간표/도착 계산 없음', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    const mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    const bt = v.slice(v.indexOf('private boolean busShowing'), v.indexOf('private void startBusTick'));
    assert.ok(/BUS_POLL_MS = 60000L/.test(v) && /postDelayed\(busTick, BUS_POLL_MS\)/.test(v), '1분 간격(그 사이 초는 기기에서 줄어든다)');
    assert.ok(/resumed/.test(bt) && /currentTab\(store\)/.test(bt) && /S_MAPB/.test(bt) && /dropArrivals\(\)/.test(bt) && /loadMapBodyRound\(/.test(bt), '보일 때만 · 도착정보만 비우고 다시 묻는다');
    // 끊겨도 화면을 멈추거나 에러를 띄우지 않는다: 실패한 갱신은 버리고(옛 값을 섞지 않음) 카운트다운이 이어진다 · 느린 통신이 다음 박자에 끊기지 않는다
    assert.ok(/txt\.length\(\) == 0 && busRefreshing\) \{ busFail\(\); return; \}/.test(v) && /if \(bad\) \{ busFail\(\); return; \}/.test(v) && /private void busFail\(\) \{ map\.restoreArrivals\(\); busEnd\(\); \}/.test(v), '갱신 실패는 조용히 버리고 보던 도착정보를 되돌려 놓는다(비어서 "도착정보 없음"이 되지 않는다)');
    assert.ok(/if \(busRefreshing && System\.currentTimeMillis\(\) - busRefAt < 20000L\) \{ startBusTick\(\); return; \}/.test(bt), '갱신이 오가는 중이면 겹쳐 시작하지 않는다');
    assert.ok(/BUS_STALE_MS/.test(v) && /BUS_FRESH_MS = 8000L/.test(fs.readFileSync(N('ShellCore.java'), 'utf8')) && /BUS_STALE_MS = 90000L/.test(fs.readFileSync(N('ShellCore.java'), 'utf8')), '버스 캐시 화면: 8초 신선 · 90초까지는 먼저 보이고(SWR) 뒤에서 새로 받음 · 그보다 오래면 뼈대');
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
    assert.ok(/private void closeSheet\(\) \{ if \(mapView != null\) mapView\.setCover\(0f\); detLoading = null; brStop\(\);/.test(v) && /private void brStop\(\) \{ main\.removeCallbacks\(brTick\)/.test(br) && /onPause\(\) \{ resumed = false; trackStop\(\); if \(vec != null\) vec\.onPause\(\); main\.removeCallbacks\(brTick\)/.test(v) && /brResume\(\); if \(ShellCore\.S_SETPG/.test(v), '닫기·뒤로가기·onPause 에서 즉시 멈추고 onResume 에서만 다시');
    assert.ok(/poll && got\.length\(\) == 0\) \{ if \(brFlight\.isEmpty\(\)\) brBusy = false; return; \}/.test(br) && /txt\.length\(\) == 0\) \{\s*if \(my == brReq/.test(br), '갱신 실패는 버리고 보던 화면을 둔다');
    assert.ok(/for \(String\[\] nd : need\) if \(brFlight\.add\(nd\[0\]\)\) brFetchOne\(/.test(br) && /brFlight\.remove\(k\);[\s\S]*?brRound\(gen, poll\)/.test(br), '주소마다 따로 받아 오는 대로 바로 다시 그린다(목록이 위치를 기다리지 않는다)');
    assert.ok(/brPrefetch\(\)/.test(v) && /routeClone\(0, ri\)/.test(v) && /nd\[0\]\.endsWith\("s"\)/.test(v), '도착정보가 뜬 가까운 정류장의 앞 노선은 목록을 미리 받아 둔다(위치는 열 때 새로)');
    assert.ok(/a < \(pos \? 5 : 2\)/.test(br) && /Thread\.sleep\(pos \? 800 : 300\)/.test(br), '위치는 실패하면 0.8초 뒤 다시(최대 4번 더)');
    assert.ok(/home\.pickRestore\(map\.pkName\)/.test(br) && /home\.setBusStop\(HomeCore\.START/.test(br) && /home\.setBusStop\(HomeCore\.DEST/.test(br) && /goRoute\(\)/.test(br), '출발지/도착지 고르기 · 나가면 되돌림 · 도착지가 정해지면 경로');
    assert.ok(/dirtyOnly\(partialFrom\)/.test(sv) && /invalidate\(0, Math\.round/.test(sv) && /postInvalidateDelayed\(66L, Math\.round\(brxPing/.test(sv), '바뀐 줄 자리만 invalidate · 마커 맥박도 그 자리만');
    assert.ok(/K_BRX/.test(sc) && /it\.sig = /.test(sc), '줄 지문');
  });
  await t('맛집 가게 지도 펼침(웹 _foodShowMap): 가게를 누르면 팝업 대신 카드 바로 아래 펼침 · 경로 주소는 엔진이 정하고 앱은 받아 오기만 · 같은 카드를 또 누르면 접음 · 목록 캐시에는 펼침을 넣지 않음', async () => {
    const sa = fs.readFileSync(N('ShellActivity.java'), 'utf8'), fc = fs.readFileSync(N('FoodCore.java'), 'utf8'), ta = fs.readFileSync(N('TileMapArt.java'), 'utf8');
    assert.ok(/case FoodCore\.R_PANEL: foodPanelRound\(\)/.test(sa) && !/case FoodCore\.R_SHEET: openFoodSheet/.test(sa), '가게 누름은 펼침(팝업 아님)');
    assert.ok(/R_UNPANEL/.test(sa) && /k\.equals\(openKey\)/.test(fc), '같은 카드를 또 누르면 접는다');
    assert.ok(/food\.panelNeed/.test(sa) && /NetPost\.get\(nd\[1\]/.test(sa) && /u\.startsWith\("https:\/\/"\)/.test(fc), '경로 주소는 엔진이 준 https 만 받아 온다');
    assert.ok(!/valhalla|osrm/i.test(sa + fc), '앱에는 경로 서버 주소·계산이 없다(엔진이 정한다)');
    assert.ok(/foodBase = txt/.test(sa) && /shownJson\.put\(v, withP\)/.test(sa) && !/cachePut\([^)]*withP/.test(sa), '펼친 글은 보이기만 하고 캐시에는 펼침 없는 목록만');
    assert.ok(/static void drawPath/.test(ta) && /DashPathEffect/.test(ta) && /C_ROUTE = 0xFFF07830/.test(ta) && /C_FROM = 0xFF2B7CFF/.test(ta) && /C_TO = 0xFFE8482E/.test(ta), '웹 경로 주황 점선 · 출발 파랑 · 도착 빨강');
  });
  await t('0초 체감: 켜자마자 현재 위치 · 위치감지 1초 · 누르는 즉시 스피너 · 무거운 준비물은 켠 직후 미리 · 맛집 큰 목록은 주 스레드에서 읽지 않음', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), vm = fs.readFileSync(N('VecMap.java'), 'utf8'), fc = fs.readFileSync(N('FoodCore.java'), 'utf8');
    assert.ok(/launchLocate\(\);/.test(v.slice(v.indexOf('captureLastLoc();') - 900, v.indexOf('captureLastLoc();') + 20)) && /locateNow\(10000L, 1000L, 0L, 120000L/.test(v), '켜는 순간 캐시 없이(maxAge 0) 현재 위치를 요청');
    const ll = v.slice(v.indexOf('private void launchLocate()'), v.indexOf('private void launchLocate()') + 1400);
    assert.ok(/map\.setBusLoc/.test(ll) && /pfBusRun\(ll, theme\)/.test(ll), '위치가 오면 정류장 기준을 잡고 주변 버스를 뒤에서 미리 받는다');
    assert.ok(/brPrefetch\(pfMap\)/.test(v) && /private boolean pfBusRun\(double\[\] ll/.test(v), '가까운 정류장의 노선 목록까지 미리');
    assert.ok(/locBatch/.test(v) && /locateNow\(12000L, 1000L, 2500L/.test(v) && /Location recent = liveRecent\(30000L\);\s*if \(recent != null\) gotGps\(recent\)/.test(v), '위치감지: 방금 받은 위치를 0초에 먼저 · 새 위치는 1초 제한 · 겹친 요청은 하나로');
    assert.ok(/hintAct/.test(sv) && /cv\.drawArc\(rf2/.test(sv) && /0\.94f, 0\.94f/.test(sv) && /inbarBusy\) postInvalidateOnAnimation/.test(sv), '위치 버튼: 누르면 작아지고 즉시 도는 스피너(엔진 답을 기다리지 않는다)');
    assert.ok(/addIdleHandler/.test(v) && /VecMap\.warmUp/.test(v) && /ensureMetro\(\);/.test(v) && /static void warmUp/.test(vm), '지도 엔진 · 노선도 자료를 켠 직후 한가할 때 미리');
    assert.ok(/h\.post\(new Runnable\(\) \{ @Override public void run\(\) \{ if \(!destroyed && box == null\) create\(\)/.test(vm), '지도 뷰는 그리는 도중이 아니라 다음 박자에 만든다');
    assert.ok(/mapView\.setVisibility\(View\.INVISIBLE\)/.test(v) && !/mapView\.setVisibility\(View\.GONE\)/.test(v), '노선도는 숨겨도 그림을 쥔다(다시 열면 바로)');
    assert.ok(/FoodCore\.parseScreen\(txt\)/.test(v) && /FoodCore\.parseScreen\(txt2\)/.test(v) && !/food\.onScreen\(/.test(v.slice(v.indexOf('private void loadFood('), v.indexOf('private void reloadFood()'))), '맛집 큰 화면 읽기는 통신 스레드');
    assert.ok(/srvJ/.test(fc) && /d\.srvJ = HomeSearchCore\.toJson/.test(fc), '엔진에 보낼 글은 받을 때 미리 만든다');
  });
  await t('SWR · 디바운스(s132): 탭은 캐시를 0초에 올리고 새로 받기는 연타 중 미룸 · 입력 300ms 디바운스 · 위치 이동은 멈춘 뒤 한 번 · 버튼 연타 막기 · 경로 결과 SWR · 뒤에서 받다 실패해도 옛 화면 유지(알림 없음)', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), d = fs.readFileSync(N('Debounce.java'), 'utf8'), w = fs.readFileSync(N('Swr.java'), 'utf8');
    assert.ok(!/import\s+android\.|System\.currentTimeMillis|SystemClock|Handler/.test(d + w), 'Debounce · Swr 는 순수 자바(시계는 Clock 으로 받는다)');
    assert.ok(/TYPE_MS = 300L/.test(d) && /TAP_MS = 350L/.test(d) && /void trailing\(/.test(d) && /boolean gate\(/.test(d), '디바운스 300ms · 연타 350ms');
    const ls = v.slice(v.indexOf('private void loadSlotX('), v.indexOf('/** 상태 없이 엔진에서 한 번에 받는 화면'));
    assert.ok(/!keep0 && keep\) deb\.trailing\("slot" \+ si, Debounce\.TAB_GAP_MS, go\); else \{ deb\.cancel\("slot" \+ si\); go\.run\(\); \}/.test(ls) && /if \(my != seq\[si\]\) return;/.test(ls), '탭: 캐시 화면을 올린 뒤에만 새로 받기를 미루고, 그 사이 다른 탭으로 가면 보내지 않는다(캐시가 없으면 곧장)');
    assert.ok(/cacheGet\(ck, ShellCore\.diskCacheable\(screen\)\);\s*if \(c != null && showCached\(v, c\)\)/.test(ls) && ls.indexOf('showCached(v, c)') < ls.indexOf('deb.trailing("slot"'), '캐시 화면이 먼저(0초) · 새로 받기는 그 뒤');
    const ht = v.slice(v.indexOf('private void homeText('), v.indexOf('private void fetchCands()'));
    assert.ok(/"edit"\.equals\(kind\)\) \{[^}]*deb\.trailing\("homeq", Debounce\.TYPE_MS/.test(ht), '홈 입력: 글자를 칠 때마다가 아니라 멈춘 뒤 한 번 후보를 받는다');
    assert.ok(/private void homeAct\([^)]*\) \{\s*deb\.cancel\("homeq"\)/.test(v), '후보를 고르면 기다리던 입력 갱신은 취소');
    assert.ok(/deb\.trailing\("favq", Debounce\.TYPE_MS/.test(v) && /deb\.trailing\("cmq", Debounce\.TYPE_MS/.test(v), '즐겨찾기 · 설정 검색 입력도 디바운스');
    const ts = v.slice(v.indexOf('private void trackStart()'), v.indexOf('private void trackStop()'));
    assert.ok(/deb\.trailing\("busloc", Debounce\.TYPE_MS/.test(ts) && /busMove\(la, lo\);/.test(ts), '위치가 연달아 와도 멈춘 뒤 한 번만 새 자리의 정류장(보던 화면은 두고 뒤에서 받아 한 번에 바꿔 끼운다)');
    assert.ok(/which == 2 && !deb\.gate\("tab:"/.test(v) && /deb\.gate\("retry"/.test(v) && /deb\.gate\("gps", 1200L\)/.test(v) && /deb\.gate\("route", 800L\)/.test(v), '탭 · 다시 시도 · 내 위치 · 경로 검색 버튼 연타 막기');
    assert.ok(v.indexOf('requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION', v.indexOf('private void startGps()')) < v.indexOf('deb.gate("gps"'), '내 위치: 권한을 받는 순간은 막지 않는다(권한 뒤에 연타를 센다)');
    const gr = v.slice(v.indexOf('private void goRoute()'), v.indexOf('/** \'예상\'으로 남은 버스 구간'));
    assert.ok(/routeSwr\.get\(sk, rb, ROUTE_FRESH_MS, ROUTE_STALE_MS\)/.test(gr) && /hit\.state == Swr\.FRESH\) \{[^}]*return;/.test(gr) && /postFail\(my, shown\)/.test(gr), '경로: 지난 결과를 0초에 먼저 · 신선하면 통신 없음 · 실패해도 옛 결과 유지');
    assert.ok(/if \(draw && \(full1 \|\| !shown\)\) postRoute/.test(gr), '옛 결과가 떠 있으면 근사 결과로 덮지 않는다');
    assert.ok(/routeSwr\.put\(sk, rb \+ "\\n" \+ raw/.test(v) && /if \(keep && v\.itemCount\(\) > 0\) return;/.test(v) && /!\(keep && v\.itemCount\(\) > 0\)\) toast\("맛집 화면을 받지 못했어요"\)/.test(v), '읽을 수 있는 결과만 보관 · 뒤에서 받다 실패해도 옛 화면은 그대로(알림 없음)');
  });
  await t('경로 탐색 로딩(s133): 카드는 엔진(rload)이 그리고 앱은 보이고 숨기기만 · 새 통신이 있고 옛 결과가 없을 때만 · 어떤 끝이든 닫힘(50초 안전) · 캐릭터는 순수 장식', () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), rc = fs.readFileSync(N('RunnerCore.java'), 'utf8'), ra = fs.readFileSync(N('RunnerArt.java'), 'utf8');
    assert.ok(/kind\\":\\"rload\\"/.test(v) && /private void rloadShow\(\)/.test(v) && /private void rloadHide\(\)/.test(v), 'rload 화면은 엔진에서 받는다');
    assert.ok(/if \(!shown\) \{[^}]*rloadShow\(\);/.test(v), '보여 줄 옛 결과가 없을 때만 카드를 띄운다(SWR 로 이미 보이면 안 띄움)');
    const pr = v.slice(v.indexOf('private void postRoute('), v.indexOf('private void openLink('));
    assert.ok(/rloadHide\(\);/.test(pr.slice(0, pr.indexOf('private void postFail'))) && /my != seqRoute\) return; rloadHide\(\)/.test(pr), '결과가 오든 실패하든 카드를 닫는다');
    assert.ok(/postDelayed\(rloadSafety, 50000L\)/.test(v) && /void onDestroy\(\) \{[^}]*rloadHide\(\)/.test(v) && /setCancelable\(false\)/.test(v), '50초 안전 닫기 · 끝날 때 닫기');
    assert.ok(/setDimAmount\(0\.7f\)/.test(v) && /setCornerRadius\(20f \* dpr\)/.test(v), '웹과 같은 70% 어둡게 · 모서리 20');
    assert.ok(/rloadFetch\(\); \} \}\);\s*\/\/ 경로 탐색 로딩 카드/.test(v) || /return rloadFetch\(\);/.test(v), '켜자마자 미리 받아 둔다(탐색 때 기다리지 않게)');
    assert.ok(/case ScreenCore\.K_RUNNER: drawRunner/.test(sv) && /runDrawn/.test(sv) && !/new Paint|new RectF|new Rect\(|new android\.graphics\.DashPathEffect/.test(sv.slice(sv.indexOf('private void drawRunner('), sv.indexOf('private boolean skelDrawn;'))), '캐릭터를 그리고 그리는 동안 새 그림 도구를 만들지 않는다');
    assert.ok(/private float mqOff\(ScreenCore\.Item it\)/.test(sv) && /mqDrawn = true/.test(sv) && /\|\| mqDrawn/.test(sv) && /it\.mq && it\.lines\.length > 0/.test(sv) && /clipRect\(it\.x, it\.y, it\.x \+ it\.mqVis/.test(sv) && /it\.mqVis > 0f \? Math\.min\(it\.mqVis, it\.mqW\)/.test(sv) && !/new Paint|new RectF|new Rect\(/.test(sv.slice(sv.indexOf('private float mqOff('), sv.indexOf('private void drawTextBlock('))), '긴 이름은 놀이터 칸만 남기고 좌우로 흐른다(mqOff · 그리는 동안 새 도구 없음 · 놀이터 칸은 흐르는 칸 기준)');
    const rssv = fs.readFileSync(N('RsSheetView.java'), 'utf8'), rscore = fs.readFileSync(N('RsCore.java'), 'utf8'), rsvc = fs.readFileSync(N('RideService.java'), 'utf8');
    assert.ok(!/import\s+android\./.test(rscore) && /RsCore\.heightDp/.test(rssv) && /RsCore\.tap/.test(rssv) && /RsCore\.swipe/.test(rssv) && /RsCore\.tabSwipe\(RideService\.liveOv/.test(v) && /RideService\.rsAct/.test(v) && /RideService\.rsListener = rsApply/.test(v) && /root\.addView\(rs,/.test(v) && /static void rsAct/.test(rsvc) && /liveOv = core\.ov; liveRev\+\+; rsNotify\(\)/.test(rsvc) && !/new Paint|new RectF|new Path|new Rect\(/.test(rssv.slice(rssv.indexOf('protected void onDraw'), rssv.indexOf('private String ell('))), '탑승 시트(s143): 칸 계산(RsCore)은 순수 · 뷰는 엔진 값을 그리고 손짓을 서비스로 보낸다 · 그릴 때 새 도구 없음 · 오버레이가 켜져 있으면 겹치지 않는다');
    assert.ok(!/import\s+android\./.test(rc) && /sheet|Sheet/.test(ra) && /SoftReference/.test(ra) && /new Thread\(/.test(ra), 'RunnerCore 는 순수 · 시트는 뒤 스레드에서 읽고 메모리가 모자라면 시스템이 버릴 수 있게 쥔다');
  });
  await t('엔진 안내 카드 호스트(s134): 종료 · 신고 · 권한 · 작은 알림 카드는 엔진이 그리고 앱은 띄우고 단추만 되돌려 준다 · 미리 받아 두고 못 받았으면 이전 방식으로 대신', () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    assert.ok(/private boolean dlgOpen\(/.test(v) && /private boolean dlgKind\(/.test(v) && /private void dlgAct\(/.test(v) && /private void dlgPopSh\(/.test(v), '카드 호스트');
    assert.ok(/dlgFetch\("exit"\)/.test(v) && /dlgFetch\("report"\)/.test(v) && /dlgFetch\("perm"\)/.test(v), '고정 카드는 켜자마자 미리 받아 둔다');
    assert.ok(/!dlgKind\("exit", new Runnable\(\) \{ @Override public void run\(\) \{ finish\(\); \} \}, null\)\) super\.onBackPressed\(\)/.test(v), '홈에서 뒤로 가기: 종료 확인 카드(못 받았으면 바로 닫기)');
    assert.ok(/dlgKind\("report", doReport, null\)/.test(v) && /dlgKind\("perm", openSet, null\)/.test(v) && /dlgPopSh\("경로를 먼저 탐색해 주세요"/.test(v), '신고 · 권한 · 공유 안내가 엔진 카드를 쓴다');
    assert.ok(/"dl\.ok"\.equals\(v\)/.test(v) && /setOnCancelListener/.test(v) && /dg\.tap != null \|\| autoMs > 0L/.test(v) && /dg\.fit && v\.fitWidthDp\(\)/.test(v), '단추 · 바깥/뒤로 취소 · 카드가 정한 바깥 누름 · 글에 맞춘 너비');
  });
  await t('타임라인 지나간 칸 흐림 · 지금 칸 강조(s137): 칸 그리기에서 알파만 바꾸고 · 지금 칸 점의 고리가 숨 쉰다 · 그릴 때 새 객체 없음', () => {
    const sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), d = sv.slice(sv.indexOf('private void drawTrk('), sv.indexOf('// ───────────── 혼잡도 카드'));
    assert.ok(/it\.ps \? alpha\(cc\(it\.nc/.test(d) && /it\.ps \? alpha\(cc\(it\.lc, 0\), 0\.3f\)/.test(d) && /it\.hr/.test(d) && /% 1500L/.test(d) && /hrDrawn = true/.test(d), '그리기 · 1.5초 고리');
    assert.ok(!/new Paint|new RectF|new Rect\(|new Path|new int\[|new String/.test(d), '그릴 때 새 객체 없음');
    assert.ok(/else if \(pulsing \|\| hrDrawn\) postInvalidateDelayed/.test(sv), '보이는 동안만 다시 그린다');
  });
  await t('무지개 테두리 카드(s136): 스윕 그라데이션을 한 번만 만들고 행렬로 돌린다 · 카드 자리만 다시 그린다 · 그릴 때 새 객체 없음', () => {
    const sv = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/case ScreenCore\.K_PANEL: drawPanel\(cv, it\); if \(it\.pub\) drawGlow\(cv, it\)/.test(sv) && /glowSh\.setLocalMatrix\(glowMx\)/.test(sv) && /% 3000L/.test(sv), '그리기 · 3초 한 바퀴');
    assert.ok(!/new Paint|new RectF|new Rect\(|new Path|new SweepGradient|new Matrix|new int\[/.test(sv.slice(sv.indexOf('private void drawGlow('), sv.indexOf('private void drawTopLine('))), '그릴 때 새 객체 없음');
    assert.ok(/if \(glowDrawn && isShown\(\)\)[^\n]*postInvalidateOnAnimation\(Math\.round\(glX0/.test(sv), '보이는 동안 그 카드 자리만 화면 박자로');
  });
  await t('버튼 줄 칸(s146): 칸·전환은 엔진이 정하고 앱은 덮개로 그리기만 · 눌림은 단추가 받는다 · 그릴 때 새 객체 없음 · 도착은 안내 종료, 탑승·환승은 탑승 시트와 같은 확정', () => {
    const sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8'), ar = fs.readFileSync(N('ActRowCore.java'), 'utf8'), v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), rc = fs.readFileSync(N('RideCore.java'), 'utf8'), hc = fs.readFileSync(N('HomeCore.java'), 'utf8');
    const body = sv.slice(sv.indexOf('private void drawRowAnim('), sv.indexOf('private void drawButton('));
    assert.ok(!/import\s+android\./.test(ar) && /case ScreenCore\.K_ROWANIM: drawRowAnim/.test(sv) && /ActRowCore\.frame\(/.test(body) && /ActRowCore\.fresh\(/.test(body) && /arAnim/.test(sv) && !/new Paint|new RectF|new Rect\(|new Path|new String|new float\[|new int\[/.test(body), '덮개 그리기: 수식은 순수 · 방금 일어난 전환만 · 그릴 때 새 객체 없음');
    assert.ok(/K_ROWANIM = 47/.test(sc) && /"push_in"\.equals\(ak\)/.test(sc) && /\.longValue\(\)/.test(sc.slice(sc.indexOf('n.asq ='), sc.indexOf('n.asq =') + 120)), 'row.an 파싱(시각은 long 그대로)');
    assert.ok(/R_SLOT = 13/.test(hc) && /R_CONFIRM = 14/.test(hc) && /"rh\.confirm"\.equals\(v\)\) return hasRoute\(\) && !riding\(\) \? R_CONFIRM/.test(hc) && /case HomeCore\.R_CONFIRM: startRide\(\)/.test(v) && /"rh\.slot"\.equals\(v\)\) return riding\(\) \? R_SLOT/.test(hc) && /case HomeCore\.R_SLOT: rideSlot\(\)/.test(v) && /"arrive"\.equals\(sl\)\) \{ stopRide\(\)/.test(v) && /RideService\.rsAct\("press"\)/.test(v.slice(v.indexOf('private void rideSlot('))) && /m\.get\("row"\)/.test(rc) && /"row\\":" \+ rowJson/.test(rc), '연결: 칸 누름 → 도착은 안내 종료 · 탑승/환승은 시트와 같은 press · 엔진 row 를 결과 카드로');
  });
  await t('세부경로 줄(s135): 레일 · 현재위치 점 · 뱃지 · 펼침을 ScreenView 가 그리고 · 보이는 동안에만 다시 그린다 · 그릴 때 새 객체 없음', () => {
    const sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/case ScreenCore\.K_TDROW: drawTdrow/.test(sv) && /tdDrawn/.test(sv) && /tdAct/.test(sv) && /System\.currentTimeMillis\(\)/.test(sv.slice(sv.indexOf('private void drawTdrow('), sv.indexOf('private String ellipsizeTd('))), '그리기 · 지금 시각으로 진행 비율');
    assert.ok(!/new Paint|new RectF|new Rect\(|new Path|new String|new int\[/.test(sv.slice(sv.indexOf('private void tdIcon('), sv.indexOf('private String ellipsizeTd('))), '그릴 때 새 객체 없음');
    assert.ok(/if \(tdAct \|\| tdAnim\) postInvalidateOnAnimation\(\); else if \(tdDrawn\) postInvalidateDelayed\(2000L\)/.test(sv), '지금 가는 구간이 보이면 화면 박자 · 아니면 2초마다');
    assert.ok(/CAP = 24/.test(fs.readFileSync(N('ShellCore.java'), 'utf8')) && /K_TDROW = 45/.test(sc) && /"tdrow"\.equals\(t\)/.test(sc), 'cap 21 · tdrow 파싱');
  });
  await t('세부경로 시트 웹 맞춤(s153): 머리(shd)·손잡이·× · 구간은 서버 없이 바로 펼침(▾ 0.2초) · 배경 0.82·탭바 위·끌어 닫기 120dp/.25초 · 확정 토스트·0.6초 뒤 닫힘·오버레이 안내 한 번', () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8'), hm = fs.readFileSync(N('HomeCore.java'), 'utf8');
    assert.ok(/K_SHD = 48/.test(sc) && /"shd"\.equals\(t\)/.test(sc) && /case ScreenCore\.K_SHD: drawShd/.test(sv) && /m\.kind == K_SHD\) return m\.sw > 0f/.test(sc), 'shd 노드: 파싱 · 배치 · 그리기 · × 자리만 눌림');
    assert.ok(/sc\.fl = /.test(sc) && /if \(lay\.fl\)/.test(sv), '아래 고정 줄 맨 위 선은 엔진이 끌 수 있다(fl)');
    const td = sv.slice(sv.indexOf('private void toggleTd('), sv.indexOf('private void toggleOpen('));
    assert.ok(/openKey = "td:" \+ b/.test(td) && /relayout\(\)/.test(td) && /listener\.onSet\(a, !wasOn\)/.test(td) && !/listener\.onAction/.test(td) && /K_TDROW && pi\.key\.length\(\) > 0\) toggleTd\(pi\)/.test(sv), '구간 펼침: 서버 왕복 없이 바로 다시 배치 · 알림은 onSet');
    const dt = sv.slice(sv.indexOf('private void drawTdrow('), sv.indexOf('private String ellipsizeTd('));
    assert.ok(/cv\.rotate\(ang, it\.ix, it\.iy\)/.test(dt) && /\/ 200f/.test(dt) && /final String bt = ellipsizeTd/.test(dt) && dt.indexOf('final String bt = ellipsizeTd') < dt.indexOf('setText(ScreenCore.TD_BADGE_TXT'), '▾ 는 0.2초 돌고 · 뱃지 글은 색을 정하기 전에 줄여서 보인다');
    const op = v.slice(v.indexOf('private void openDetailSheet()'), v.indexOf('private void loadDetail()'));
    assert.ok(/setDimAmount\(0\.82f\)/.test(op) && /520f \* dpr/.test(op) && /20f \* dpr/.test(op) && /tabs\.getLocationOnScreen/.test(op) && /120f \* dpr/.test(op) && /PathInterpolator\(0\.25f, 0\.1f, 0\.25f, 1f\)/.test(op) && /setDuration\(250L\)/.test(op) && /root\.setOnClickListener/.test(op) && /경로를 불러오는 중/.test(op), '웹 틀: 어둡기 .82 · 너비 520 · 위 모서리 20 · 탭바 위 · 끌어 닫기 120dp .25초 ease · 바깥 누르면 닫힘 · 불러오는 중 글');
    assert.ok(/HomeCore\.optName\(home\.resTab\) \+ " 경로로 확정했어요"/.test(v) && /postDelayed\([\s\S]{0,160}closeSheet\(\)[\s\S]{0,40}600L/.test(v) && /ovlHintOnce\(\)/.test(v) && /K_OVLHINT/.test(v) && /RideOverlay\.supported\(\) && !RideOverlay\.allowed\(this\)/.test(v) && /optName\(String tab\)/.test(hm), '확정: 토스트(옵션 이름) · 초록 단추 다시 받기 · 0.6초 뒤 닫힘 · 오버레이 권한 안내는 한 번만');
  });
  await t('홈·시간표·버스 보정(s150): 단추 스피너는 spin 만 · 경로 찾는 동안만 · 시간표 머리 놀이터가 스크롤을 따라감 · 다음 열차 줄로 한 번 내려감 · 위치는 저장값→마지막 위치→새 위치', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8'), hm = fs.readFileSync(N('HomeCore.java'), 'utf8');
    assert.ok(/boolean spinOn = \(it\.spin && it\.on\)/.test(sv) && /if \(spinOn && it\.sw/.test(sv) && !/if \(busy && it\.sw/.test(sv), '흐린 단추(dim)는 돌지 않고 spin 일 때만 돈다');
    assert.ok(/n\.spin = optBool\(m, "spin"/.test(sc) && /public volatile boolean routing/.test(hm) && /\\"rs\\":/.test(hm), '엔진의 spin · 앱의 경로 찾는 중(rs) 사실');
    assert.ok(/home\.routing = true;/.test(v) && /home\.routing = false;/.test(v), '경로를 찾는 동안만 켜지고 끝나면 꺼진다');
    assert.ok(/setScrollHook\(new Runnable/.test(v) && /setTranslationY\(playScrollY > 0f \? -sv\.scrollPos\(\) \* dpr : 0f\)/.test(v) && /scrollHook != null && scrollY != hookY/.test(sv), '시간표 머리 놀이터가 스크롤과 함께 움직인다');
    assert.ok(/private void applyFocus\(\)/.test(sv) && /fcDone/.test(sv) && /optStr\(m, "fc"/.test(sc), '엔진이 표시한 줄(fc)로 새 열쇠일 때 한 번 스크롤');
    assert.ok(/private void hcFixFrom\(/.test(v) && /lastLocFresh\(store, 6L \* 3600000L/.test(v) && /locf\.lastKnown\(lkMs/.test(v) && /staleCards/.test(v), '위치 3단(저장값 → 기기가 아는 위치 → 새 위치) · 지난 홈 카드를 먼저 그림(SWR)');
  });
  await t('탭 이동·버스 복귀(s151): 탭 막대는 10분 안이면 다시 안 받음 · 새 화면이 살짝 떠올라 자리잡음 · 버스 탭 복귀는 도착정보만 조용히 · 새 버스 줄은 스프링', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/tabsAt\.get\(ck\)/.test(v) && /< 600000L\) return;/.test(v), '하단 탭 막대 재요청 생략');
    assert.ok(/private void tabSettle\(\)/.test(v) && /loadSlot\(i, false\);\s*tabSettle\(\);/.test(v), '탭 전환 정착 연출');
    assert.ok(/private boolean busReturnQuiet\(\)/.test(v) && /keep && !keep0 && busReturnQuiet\(\)/.test(v) && /map\.speculativeNeed\(\)\.isEmpty\(\)/.test(v), '버스 탭 복귀: 정류장 · 엔진 왕복 없이 도착정보만');
    assert.ok(/private static float spring\(float f\)/.test(sv) && /ROW_SPRING_MS/.test(sv) && /spring\(f\)/.test(sv), '새 버스 줄 스프링');
  });
  await t('역 시트·맛집·전환(s152): 시트는 내용이 찬 채 올라옴 · 위로 쓸면 시간표/아래로 쓸면 닫힘(시간표 맨 위 포함) · 맛집 원자료는 병렬·서버 먼저 · 전환 곡선', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    assert.ok(/stnCache\.get\(json\)/.test(v) && /private void stnCachePut/.test(v) && /main\.postDelayed\(startSlide, 450L\)/.test(v), '역 시트: 본 역은 먼저 채우고, 처음 보는 역은 내용이 올 때까지 잠깐 기다렸다 올린다');
    assert.ok(/tt && top0 && dy > 0f/.test(v) && /curH - from >= 28f \* dpr/.test(v) && /ty >= \(tt \? 56f : 40f\) \* dpr/.test(v), '시간표 맨 위에서 아래로 끌면 닫힘 · 위로 끌면 시간표(손가락을 따라가다 놓으면 마무리)');
    assert.ok(/private void foodStage\(/.test(v) && /if \(food\.ctr != null && food\.needData\(\)\) fetchFoodData\(my, v\);/.test(v) && /FoodCore\.parseData\(res\[0\]\.body, new ArrayList<String>\(\)\)/.test(v), '맛집: 중심을 알면 엔진 왕복과 동시에 · 서버 가게 먼저 그린 뒤 공공데이터까지');
    assert.ok(/PathInterpolator\(0\.32f, 0\.72f, 0f, 1f\)/.test(v) && /ValueAnimator\.ofInt\(a, b\)/.test(v), '아이폰 곡선 · 시간표 시트가 자란다');
  });
  await t('순수 네이티브 프로젝트: 소스는 native/shell 뿐 · 매니페스트에 ShellActivity 가 런처 · 웹뷰/Capacitor 흔적 없음', async () => {
    const g = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'build.gradle'), 'utf8');
    assert.ok(/srcDirs = \['\.\.\/\.\.\/native\/shell'\]/.test(g), '소스 경로');
    assert.ok(/org\.maplibre\.gl:android-sdk:\d+\.\d+\.\d+/.test(g) && !/webkit|androidx\.webkit|cordova|capacitor/i.test(g), '지도는 MapLibre Native 하나만 더한다(웹 부품 없음)');
    const vm = fs.readFileSync(N('VecMap.java'), 'utf8');
    assert.ok(/tiles\.openfreemap\.org\/styles\/liberty/.test(vm) && /textureMode\(true\)/.test(vm) && /giveUp/.test(vm), '웹과 같은 Liberty 스타일 · 못 받으면 타일 그림으로 남는다');
    const m = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    assert.ok(/\.ShellActivity/.test(m) && /android\.intent\.category\.LAUNCHER/.test(m), '런처');
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-shell.yml'), 'utf8');
    assert.ok(/shell_native\.test\.js/.test(y) && /assembleRelease/.test(y) && /assembleDebug/.test(y) && /Bundle Noto Sans KR/.test(y), '워크플로');
    for (const f of [g, m, y].concat(walk(path.join(ROOT, 'native', 'shell'), '.java').map(x => fs.readFileSync(x, 'utf8')))) assert.ok(!/capacitor|WebView|BridgeActivity|webDir/i.test(f), '웹 흔적');
    assert.ok(!fs.existsSync(path.join(ROOT, 'www')), 'www 폴더가 없어야 한다(웹 기준본은 ios-reference/)');
  });
  await t('노선 알약 숫자 동그라미(s138): 엔진이 알약 + 숫자를 주고 · 앱은 색 알약 안에 반투명 동그라미를 그린다 · 그릴 때 새 객체 없음', () => {
    const sc = fs.readFileSync(N('ScreenCore.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8');
    assert.ok(/K_LPILL = 46/.test(sc) && /"lpills"\.equals\(t\)/.test(sc) && /"lpills"\.equals\(n\.t\)/.test(sc), '파싱 · 배치');
    const d = sv.slice(sv.indexOf('private void drawLpill('), sv.indexOf('private void drawPill('));
    assert.ok(/case ScreenCore\.K_LPILL: drawLpill/.test(sv) && /0x47FFFFFF/.test(d) && /drawCircle/.test(d) && /it\.t1\.length\(\) > 0/.test(d), '그리기 · 동그라미 알파 .28');
    assert.ok(!/new Paint|new RectF|new Rect\(|new Path|new int\[|new String/.test(d), '그릴 때 새 객체 없음');
  });
  await t('역 팝업 위로 끌면 시간표 · 아래로 끌면 닫힘(s140): 박스가 끌기가 확정된 순간에만 가로채고 한 번만 반응한다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), d = a.slice(a.indexOf('private android.view.View stnSheetBox('), a.indexOf('private void mapSheetAct('));
    assert.ok(/onInterceptTouchEvent/.test(d) && /10f \* dpr/.test(d) && /Math\.abs\(dy\) > Math\.abs\(dx\) \* 1\.2f/.test(d) && /openTimetable\(curH,/.test(d) && /setTranslationY\(Math\.max\(0f, d - swapOff\)\)/.test(d), '위/아래 끌기 규칙(10dp · 1.2배) + 손가락을 따라가기(창 높이 · 창 이동)');
    assert.ok(/ShellCore\.S_MAPSTN\.equals\(sheetName\)/.test(d) && /fired = true/.test(d) && /return false;/.test(d), '역 팝업일 때만 · 한 번만 · 평소엔 가로채지 않는다');
  });
  await t('시간표를 내리면 역 팝업이 되돌아옴 · 지도는 시트가 덮은 만큼을 빼고 역을 맞춤(s155)', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), m = fs.readFileSync(N('MetroMapView.java'), 'utf8');
    const b = a.slice(a.indexOf('private void backToStation('), a.indexOf('private void animSheetH('));
    assert.ok(/stnCache\.get\(json\)/.test(b) && /cached == null[\s\S]*openMapSheet\(S_STN_H\)/.test(b) && /map\.ttSeq\+\+/.test(b) && /sheetName = ShellCore\.S_MAPSTN/.test(b) && /setLayout\(ViewGroup\.LayoutParams\.MATCH_PARENT, from\)/.test(b) && /alpha\(0f\)\.setDuration\(200L\)/.test(b), '캐시된 역 화면으로 되돌아오고 없으면 새로 연다');
    assert.ok(/tt && \(ty >= 56f \* dpr[\s\S]*backToStation\(dv/.test(a), '시간표를 놓을 때 내려갔으면 역 팝업으로');
    assert.ok(/public void setCover\(float px\)/.test(m) && /cam\.viewH - cover - m/.test(m) && /\(cam\.viewH - cover\) \/ 2f/.test(m), '지도: 덮인 높이를 뺀 영역에 역을 맞춘다');
    assert.ok(/mapView\.setCover\(hpx\)/.test(a) && /mapView\.setCover\(to\)/.test(a) && /mapView\.setCover\(0f\)/.test(a), '열 때 · 시간표로 커질 때 · 닫을 때 덮개 높이');
  });
  await t('실기기 3건(s156): 시트는 아무 데나 잡고 끌어도 · 버스 탭 즉시 뼈대 + 90초 SWR · 노선 상세 · 도착정보 자동 재시도', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/!parentMayIntercept && getParent\(\) != null\) getParent\(\)\.requestDisallowInterceptTouchEvent\(true\)/.test(sv) && /public void setParentIntercept\(boolean on\)/.test(sv), '화면 뷰가 부모의 가로채기를 막지 않을 수 있다');
    assert.ok((a.match(/sv\.setParentIntercept\(true\)/g) || []).length >= 2, '역 시트 · 세부경로 시트는 가로채기를 허용');
    assert.ok(/atTop = e\.getY\(\) < 64f \* dpr \|\| sv\.scrollPos\(\) <= 0\.5f/.test(a), '세부경로: 목록이 맨 위면 어디를 잡아도 아래로 끌어 닫는다');
    assert.ok(/if \(!shown\) showSkeleton\(body, ShellCore\.S_MAPB\);\s*\/\/[^\n]*\n\s*syncMapView\(\);/.test(a) && /view = "bus"\.equals\(mode\(\)\) \? "bus" : ""/.test(mc), '탭을 누르면 뼈대 · 노선도 뷰는 바로 내림');
    assert.ok(/brRetryN < 3/.test(a) && /busRetryN < 3/.test(a) && /busBadFetch = badN/.test(a), '노선 상세 · 도착정보는 비면 세 번까지 조용히 다시');
  });
  await t('실기기 4건(s157): 경로 카드 안 타임라인(가로 밀림 · 내 위치 점) · 시간표를 내리면 그 높이에서 역 팝업 재생성 · 정류장 도착정보 병렬 · 먼저 온 곳부터', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/if \("trk"\.equals\(n\.t\)\) \{\s*\/\/[^\n]*\n\s*float tx = ox/.test(sc) && /it\.band = true; it\.cl = x0; it\.cr = x0 \+ width/.test(sc) && /L\.mkBody = true/.test(sc), '본문(카드) 안 타임라인 칸을 배치한다(예전엔 통째로 빠졌다)');
    assert.ok(/mode = 8/.test(sv) && /bandX = ScreenCore\.clamp\(bandX - dx \/ dpr, lay\.bandMax\(\)\)/.test(sv) && /cv\.clipRect\(bit\.cl, bit\.y - 4f, bit\.cr/.test(sv) && /pulsing = lay\.mkBody \? pulsingB : drawMk/.test(sv), '그 줄만 가로로 밀고(세로로 쓸면 목록) 틀 안에 자르고 마커도 같이 민다');
    assert.ok(/private boolean stationNow\(float tr\)/.test(a) && /d >= to - from && stationNow\(d - \(to - from\)\)\) swapOff = to - from/.test(a) && /swapOff = 0f; top0/.test(a), '시간표가 팝업 높이까지 내려오면 그 자리에서 역 팝업을 다시 만들어 손가락을 이어 따라간다');
    assert.ok(/private void busPaint\(/.test(a) && /fetchBusNeed\(v, keep, round, my, shownNow && !busRefreshing\)/.test(a) && /if \(partial && body\.length\(\) > 0\) main\.post/.test(a) && /a < 3 && u\.length\(\) > 0/.test(a), '정류장 도착정보는 병렬로 받아 먼저 온 곳부터 그리고 빈 응답은 0.3초 뒤 다시');
  });
  await t('실기기 3건(s158): 키보드는 화면을 누르지 않고 · 칩 전환은 캐시로 바로 · 버스 카드는 첫 정류장부터 스프링', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), h = fs.readFileSync(N('HomeCore.java'), 'utf8');
    const man = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    assert.ok(/windowSoftInputMode="adjustPan"/.test(man) && /private void applyIme\(\)/.test(a) && /SOFT_INPUT_ADJUST_PAN/.test(a) && /onInputFocus\(boolean on\) \{ if \(on\) applyIme\(\); \}/.test(a), '키보드: 화면은 그대로(adjustPan), 채팅 입력줄만 줄인다');
    assert.ok(/public void touch\(\) \{ resRev\+\+; dataRev\+\+; \}/.test(h) && /resultRequestTab\(/.test(h) && /case HomeCore\.R_RESULT: homeChip = true; reloadHome\(\)/.test(a), '칩: 경로 자료가 바뀔 때만 dataRev 가 오른다(칩만 바꿔도 캐시 열쇠는 그대로)');
    assert.ok(/private String resGet\(String k\)/.test(a) && /home\.dataRev \+ ":" \+ home\.resTab/.test(a) && /"shell-home-res-pre"/.test(a) && /cachedHome = chip \? lruGet\(homeCache, json\)/.test(a) && /!home\.riding\(\)\) for \(String tb : HomeCore\.RTABS\)/.test(a), '칩: 다른 탭 결과를 뒤에서 미리 받아 두고 칩을 누르면 서버 없이 바로 그린다');
    assert.ok(/CARD_STAGGER_MS \* Math\.min\(order, 8\)/.test(sv) && /dy = f <= 0f \? -18f : -18f \* \(1f - spring\(f\)\)/.test(sv) && /cardLn\.put\(it\.key, it\.ln\)/.test(sv), '버스: 정류장 카드가 첫 번째부터 차례로 위에서 스프링으로 내려앉는다(다시 그려도 멈추지 않는다)');
    assert.ok(/private void warmBus\(final double la, final double lo\)/.test(a) && /json\.equals\(warmBusJson\)/.test(a) && /warmBus\(l\.getLatitude\(\), l\.getLongitude\(\)\)/.test(a), '버스: 위치를 잡는 순간 정류장 화면을 미리 받아 둔다(요청이 같을 때만 쓴다)');
  });
  await t('앱 크기(s138): 64비트 한 가지 · 한국어·영어만 · 릴리스에서 라이브러리 코드 줄이기 · 실패하면 디버그로 대신', () => {
    const g = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'build.gradle'), 'utf8');
    assert.ok(/abiFilters 'arm64-v8a' \}/.test(g) && !/armeabi/.test(g), '지도 엔진 네이티브 라이브러리는 64비트만');
    assert.ok(/resConfigs 'ko', 'en'/.test(g) && /minifyEnabled true/.test(g) && /proguard-rules\.pro/.test(g) && /signingConfig signingConfigs\.debug/.test(g), '글 두 가지 · R8 · 설치용 서명');
    const pr = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'proguard-rules.pro'), 'utf8');
    assert.ok(/-keep class com\.dullyyj\.subway\.\*\* \{ \*; \}/.test(pr), '우리 코드는 그대로(이름으로 찾는 위젯 글자·서비스 보호)');
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-shell.yml'), 'utf8');
    const ic = fs.readFileSync(path.join(ROOT, 'shell-android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'utf8');
    assert.ok(/<inset android:drawable="@drawable\/ic_launcher_fg" android:inset="8\.6%"/.test(ic), '앱 아이콘 그림은 안전 영역 안으로(너무 커 보이지 않게)');
    assert.ok(/assembleRelease[\s\S]*assembleDebug/.test(y) && /apk\/release\/\*\.apk/.test(y) && /apk\/debug\/\*\.apk/.test(y), '릴리스 먼저 · 실패하면 디버그 · 둘 다 올림 대상');
  });
  await t('캐릭터 놀이터(s141): 계산(PlayCore)은 JVM 에서 통과 · 안드로이드 없이 순수 · 시계/무작위는 밖에서 받는다', async () => {
    const o = fs.mkdtempSync(path.join(os.tmpdir(), 'playjvm-'));
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', o, N('RunnerCore.java'), N('PlayCore.java'), path.join(__dirname, 'java', 'PlayJvmTest.java')], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', o, 'com.dullyyj.subway.PlayJvmTest'], { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stdout || '').split('\n').filter(l => /^FAIL/.test(l)).join('\n') || r.stderr);
    assert.ok(/ALL OK/.test(r.stdout), r.stdout.slice(-300));
    const src = fs.readFileSync(N('PlayCore.java'), 'utf8');
    assert.ok(!/import\s+android\.|SystemClock|System\.currentTimeMillis|Math\.random/.test(src), '순수 자바(무작위는 Random 을 밖에서 받는다)');
  });
  await t('캐릭터 놀이터(s141): 그림(PlayView) — 30fps · 그릴 때 새 객체 없음 · 아틀라스는 뒤 스레드 · 안 보이면 멈춤 · 만져지지 않음', () => {
    const v = fs.readFileSync(N('PlayView.java'), 'utf8');
    const draw = v.slice(v.indexOf('protected void onDraw'), v.indexOf('private void cloud('));
    const rest = v.slice(v.indexOf('private void cloud('));
    assert.ok(!/\bnew\s+[A-Z]/.test(draw), 'onDraw/drawWorld 에 new: ' + (draw.match(/\bnew\s+[A-Z]\w*/) || [''])[0]);
    const body = rest.replace(/\/\/.*$/gm, '');
    const dd = body.slice(0, body.indexOf('private void drawActors(')) + body.slice(body.indexOf('private void drawActors('));
    assert.ok(!/\bnew\s+[A-Z]/.test(dd), '장식 · 캐릭터 그리기에 new: ' + (dd.match(/\bnew\s+[A-Z]\w*/) || [''])[0]);
    assert.ok(/acc >= 0\.030d/.test(v) && /postInvalidateDelayed\(26L\)/.test(v), '30fps (웹과 같다)');
    assert.ok(/new Thread\(/.test(v) && /shell-play-atlas/.test(v) && /createScaledBitmap/.test(v), '아틀라스는 뒤 스레드에서 한 번만 줄여 만든다');
    assert.ok(/onDetachedFromWindow\(\) \{ running = false/.test(v) && /onWindowVisibilityChanged/.test(v), '창이 떼어지거나 안 보이면 멈춘다');
    assert.ok(/setClickable\(false\)/.test(v) && /DST_IN/.test(v) && /saveLayer/.test(v), '만져지지 않는다 · 가장자리를 투명하게(DST_IN)');
    assert.ok(/RunnerArt\.warm/.test(v) && /dudung_intro/.test(v), '시트는 달리기 로딩과 같은 RunnerArt');
  });
  await t('캐릭터 놀이터(s141): 연결 — 팝업 이름 옆 · 시간표 제목 옆 · 팝업→시간표는 같은 장면 이어받기 · 닫으면 끝', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8');
    const pp = a.slice(a.indexOf('private void playPlace('), a.indexOf('/** 웹 .nmp 역 팝업의 손잡이'));
    assert.ok(/PlayCore\.popupHost\(/.test(pp) && /PlayCore\.ttHost\(/.test(pp) && /playAnchor\(tt \? ScreenCore\.K_BAR : ScreenCore\.K_TEXT\)/.test(pp), '칸 위치: 팝업 이름 · 시간표 제목');
    assert.ok(/tt \? pv\.snap\(\) : null/.test(pp) && /pv\.begin\(/.test(pp) && /pv\.end\(\)/.test(pp), '시간표로 올라오면 팝업의 장면을 이어받고 · 칸이 없으면 놓지 않는다');
    assert.ok(/ANIMATOR_DURATION_SCALE/.test(pp), '동작 줄이기면 한 장면만');
    assert.ok(/map\.onStn\(txt\);[\s\S]{0,120}playPlace\(\);/.test(a) && /map\.onTt\(txt\);[\s\S]{0,120}playPlace\(\);/.test(a), '팝업 · 시간표 화면이 올라온 뒤 놓는다');
    assert.ok(/private void closeSheet\(\) \{[^\n]*playView\.end\(\)/.test(a), '시트가 닫히면 놀이터도 끝');
    assert.ok(/new PlayView\(this, dpr\)/.test(a), '역 팝업 박스에 얹는다');
    assert.ok(/public float\[\] playAnchor\(int kind\)/.test(sv), 'ScreenView 가 칸 자리를 알려 준다');
  });
  await t('s159: 버스 정보 몰래 갱신(busMove) · 1분 폴링 · 지도 vh 높이 · 이름 한 줄 · 칩 즉시 강조', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    const bm = a.slice(a.indexOf('private void busMove('), a.indexOf('private void busMove(') + 6000);
    assert.ok(/busShowing\(\)/.test(bm) && /stopCount\(\) > 0/.test(bm) && /new Thread\(/.test(bm) && /map\.addBusRes\(/.test(bm) && /present\(body, txt, true\)/.test(bm), '비우지 않고 뒤 스레드에서 받아 한 번에 바꿔 끼운다');
    assert.ok(/busMove\(ll\[0\], ll\[1\]\)/.test(a) && /busMove\(la, lo\);/.test(a), '위치가 바뀌면 busMove');
    assert.ok(/BUS_POLL_MS = 60000L/.test(a), '1분에 한 번');
    assert.ok(/public String stopSig\(\)/.test(mc), '정류장 구성 서명');
    assert.ok(/hv = optNum\(m, "hv"/.test(sc) && /winH \* n\.hv \/ 100f/.test(sc) && /public static volatile float winH/.test(sc), '지도 높이는 창 높이 vh');
    assert.ok(/ScreenCore\.winH = /.test(sv), 'ScreenView 가 창 높이를 알려 준다');
    assert.ok(/pickRtab\(/.test(sv), '경로 방식 칩은 누르는 즉시 강조');
    assert.ok(/rtColor\(it, 0,/.test(sv) && /f \* \(2f - f\)/.test(sv) && /150f/.test(sv) && /rtAnim = false/.test(sv) && /rh\.tab\."\) \? 1\.5f/.test(sv), '칩 색은 0.15초 동안 섞인다(웹 transition .15s) · 테두리 1.5');
    assert.ok(/nameBot = TRK_NAME_H - c\.ipB/.test(sc) && /ellipsize\(c\.name\.replace/.test(sc), '타임라인 이름은 한 줄');
  });
  await t('s160: 도착정보 못 받은 곳은 비워 기기가 직접 받는다 · 처음 그리기는 서버 대기 짧게', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    const w = fs.readFileSync(path.join(__dirname, '..', 'engine', 'map-worker.js'), 'utf8');
    assert.ok(/public int svb = 300/.test(mc) && /\\"svb\\":" \+ svb/.test(mc), '요청에 svb(서버 대기 ms)');
    assert.ok(/map\.svb = busRefreshing \? 2500 : 300/.test(a) && /w\.svb = 2500/.test(a), '처음 그리기 300ms · 조용한 갱신 2500ms');
    assert.ok(/BUS_BASE = "https:\/\/gildongmu-bus\.phg0643\.workers\.dev"/.test(fs.readFileSync(N('ShellCore.java'), 'utf8')) && /ShellCore\.BUS_BASE \+ "\/tago\?url="/.test(mc), 's164: 버스 도착정보·정류장은 웹과 같은 버스 프록시(gildongmu-bus) — gentle-lab /tago 는 522');
    assert.ok(/HomeSearchCore\.busUrl\(HomeSearchCore\.BUS_BASE,/.test(a), 's164: 정류장 검색도 버스 프록시');
    assert.ok(/KEEP_OLD_MS = 45000L/.test(mc), '받아 둔 도착정보는 45초까지 둔다(앱은 판단하지 않는다 — 서버가 정한다)');
    assert.ok(/arrWave/.test(w) && /else failA\+\+;/.test(w) && /if \(arrWave\) break;/.test(w), '서버: 도착정보는 온 것만 싣고 못 받은 곳은 need 로 남긴다');
  });
  console.log(`\n${pass} 통과 / ${fail} 실패 / ${skipped} 건너뜀`);
  process.exit(fail ? 1 : 0);
})();
