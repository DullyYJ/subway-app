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
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', jar, '-d', j, N('ScreenCore.java'), N('NetPost.java'), N('SceneModel.java'), N('SceneUtil.java'), N('SceneHaptics.java'), N('SceneTrain.java'), N('SceneCv.java'), N('SceneArt.java'), N('SceneFx.java'), N('ScenePlaces.java'), N('SceneActs.java'), N('SceneCore.java'), N('AndroidCv.java'), N('SceneDriver.java'), N('ScreenView.java'), N('RunnerCore.java'), N('RunnerArt.java'), N('PlayCore.java'), N('PlayView.java'), N('ShellCore.java'), N('HomeSearchCore.java'), N('RouteFetchCore.java'), N('HomeCore.java'), N('WalkCore.java'), N('BoardCore.java'), N('ChatCore.java'), N('FoodCore.java'), N('MapCore.java'), N('FavCore.java'), N('HcardsCore.java'), N('RideCore.java'), N('RideJs.java'), N('RideTrackJ.java'), N('RideEtaJ.java'), N('RideStandbyJ.java'), N('RidePosFusionJ.java'), N('RideLocal.java'), N('RulesCore.java'), N('LegacyCore.java'), N('RideOverlay.java'), N('PowerInfo.java'), N('RecoNotify.java'), N('CmCore.java'), N('GwCore.java'), N('DevCore.java'), N('ErrCore.java'), N('ErrLog.java'), N('RecoGo.java'), N('ShareCore.java'), N('OvCore.java'), N('ShareArt.java'), N('ShareProvider.java'), N('RsCore.java'), N('ActRowCore.java'), N('RsSheetView.java'), N('TileMapCore.java'), N('TileLoader.java'), N('TileMapArt.java'), N('TileMapView.java'), N('WidgetGeo.java'), N('WidgetSim.java'), N('WidgetArt.java'), N('WidgetCore.java'), N('GdmWidgetBase.java'), N('GdmWidgetHB.java'), N('GdmWidgetHW.java'), N('GdmWidgetVB.java'), N('GdmWidgetVW.java'), N('GdmWidgetReceiver.java'), N('CommuteAlarm.java'), N('CommuteReceiver.java'), N('GdmApp.java'), N('RideService.java'), N('RideWidget.java'), N('MetroMapData.java'), N('MetroCamera.java'), N('MetroRenderer.java'), N('MetroMapView.java'), N('VecMap.java'), N('LocFused.java'), N('Debounce.java'), N('Swr.java'), N('ShellActivity.java')].concat(walk(path.join(__dirname, 'java', 'maplibre-stubs'), '.java')), { env: ENV, encoding: 'utf8' });
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
    const m = v.slice(v.indexOf('private double[] pfLL()'), v.indexOf('private void cachePutAsync('));
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
    assert.ok(/map\.svFail > 0 && round == 0 && map\.fillFromStash\(\) > 0/.test(v) && /spec\.isEmpty\(\)\) \{ loadMapBodyRound\(body, true, 0\)/.test(v) && /"bus"\.equals\(modeNow\) \? 12000 : 8000/.test(v), 's148: 서버가 한 번에 받아 주면 기기가 따로 받지 않고· 못 받은 곳만 보던 값으로 채워 갱신이 막히지 않는다');
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
    assert.ok(/private void busResume\(\)/.test(v) && /busResume\(\); brResume\(\); if \(ShellCore\.S_SETPG/.test(v) && /busLocCheck\(\);\s+\/\/ 위치가 그대로면 아무것도 받지 않는다/.test(v), '앞으로 돌아오면 위치만 확인한다(그대로면 받지 않는다 · 시간만 줄어든다)');
    assert.ok(/if \(b == null\) store\.put\(ShellCore\.K_TAB, ShellCore\.DEFAULT_TAB\)/.test(v), '새로 켜면 홈부터');
    assert.ok(/kind == ScreenCore\.K_SWAP\) continue;/.test(sv) && /kind == ScreenCore\.K_SWAP\) drawItem/.test(sv), '교환 단추는 구분선 위에 그린다');
    const hi = sv.slice(sv.indexOf('private void hideInput()'), sv.indexOf('private void syncInput()'));
    assert.ok(!/endEdit\(\)|blurInput\(\)/.test(hi), '검색칸 숨기기가 글자 입력칸 편집을 끝내지 않는다');
  });
  await t('버스 탭: 8초 자동 새로고침은 지도 탭이 보일 때만 · 도착정보만 비우고 엔진이 다시 계산 · 앱은 시간표/도착 계산 없음', async () => {
    const v = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    const mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    const bt = v.slice(v.indexOf('private boolean busShowing'), v.indexOf('private void startBusTick'));
    assert.ok(/BUS_POLL_MS = 30000L/.test(v) && /postDelayed\(busTick, BUS_POLL_MS\)/.test(v), '위치 재확인 30초 간격(그 사이 초는 기기에서 줄어든다)');
    assert.ok(/resumed/.test(bt) && /currentTab\(store\)/.test(bt) && /S_MAPB/.test(bt) && /dropArrivals\(\)/.test(bt) && /loadMapBodyRound\(/.test(bt), '보일 때만 · 도착정보만 비우고 다시 묻는다');
    // 끊겨도 화면을 멈추거나 에러를 띄우지 않는다: 실패한 갱신은 버리고(옛 값을 섞지 않음) 카운트다운이 이어진다 · 느린 통신이 다음 박자에 끊기지 않는다
    assert.ok(/txt\.length\(\) == 0 && busRefreshing\) \{ busFail\(\); return; \}/.test(v) && /if \(bad\) \{ busFail\(\); return; \}/.test(v) && /private void busFail\(\) \{ map\.restoreArrivals\(\); busEnd\(\); \}/.test(v), '갱신 실패는 조용히 버리고 보던 도착정보를 되돌려 놓는다(비어서 "도착정보 없음"이 되지 않는다)');
    assert.ok(/if \(busRefreshing && System\.currentTimeMillis\(\) - busRefAt < 20000L\) \{ startBusTick\(\); return; \}/.test(bt), '갱신이 오가는 중이면 겹쳐 시작하지 않는다');
    assert.ok(/BUS_STALE_MS/.test(v) && /BUS_FRESH_MS = 600000L/.test(fs.readFileSync(N('ShellCore.java'), 'utf8')) && /BUS_STALE_MS = BUS_FRESH_MS/.test(fs.readFileSync(N('ShellCore.java'), 'utf8')), '버스 캐시 화면: 10분 안이면 흐른 초만큼 줄여 바로 · 그보다 오래면 옛 숫자 없이 정류장 뼈대(s176)');
    assert.ok(/ARR_KEY = "\[afgh\]\[0-9\]\{1,3\}"/.test(mc) && /matches\(ARR_KEY\)/.test(mc.slice(mc.indexOf('dropArrivals'))), '정류장 목록(tp·gg·tn·d1)은 남기고 도착정보(a·f)만 지운다');
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
    assert.ok(/if \(draw && \(full1 \|\| !shown\)\) \{ postRoute/.test(gr), '옛 결과가 떠 있으면 근사 결과로 덮지 않는다');
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
    { const rsvc = fs.readFileSync(N('RideService.java'), 'utf8');
    assert.ok(/static void buzz\(Context c\)/.test(rsvc) && /createOneShot\(45L, 180\)/.test(rsvc) && /if \("press"\.equals\(a\)\) buzz\(RideService\.this\);\s*\/\/[^\n]*\n\s*core\.queueAct\(a\)/.test(rsvc) && /private void startRide\(\) \{\s*\n\s*if \(!home\.hasRoute\(\) \|\| home\.riding\(\)\) return;\s*\n\s*RideService\.buzz\(this\)/.test(v) && !/performHapticFeedback/.test(v.slice(v.indexOf('private void rideSlot('), v.indexOf('private void rideSlot(') + 600)), '진동(s228): [경로 확정] 은 startRide 에서 · [탑승] 은 시트·알약·경로 카드·오버레이가 모두 지나는 ovHost.act(press) 에서 한 번만'); }
  });
  await t('역까지 이동 · 대기 알약 펼침(s229): 자바 쌍둥이 · 이탈 알림 버튼 · 이탈 대화상자 · 알약 자동 펼침', () => {
    const rsj = fs.readFileSync(N('RideStandbyJ.java'), 'utf8'), rc = fs.readFileSync(N('RideCore.java'), 'utf8'), rsv = fs.readFileSync(N('RideService.java'), 'utf8'), sa = fs.readFileSync(N('ShellActivity.java'), 'utf8'), ov = fs.readFileSync(N('RideOverlay.java'), 'utf8'), rl = fs.readFileSync(N('RideLocal.java'), 'utf8');
    assert.ok(/static Map<String, Object> dtTarget\(/.test(rsj) && /static Map<String, Object> detourQuery\(/.test(rsj) && /static void dtRebase\(/.test(rsj) && /static DtInfo dtTick\(/.test(rsj) && /"detour"\.equals\(a\)\) dtActStart/.test(rsj) && /static Map<String, Object> offOut\(/.test(rsj), '자바 쌍둥이에 역까지 이동이 있다');
    assert.ok(/RideStandbyJ\.detourQuery\(/.test(rl), '역에 닿은 걸음도 시각표를 한 번 읽는다(needsTable)');
    assert.ok(/"detour"\.equals\(a\)/.test(rc) && /offStn/.test(rc) && /ACT_DETOUR/.test(rsv) && /"역까지 이동"/.test(rsv) && /setNeutralButton\("역까지 이동"/.test(sa) && /RideService\.rsAct\("detour"\)/.test(sa), '이탈 알림 · 대화상자에 [역까지 이동]');
    assert.ok(/private boolean boardOpen\(\)/.test(ov) && /\|\| boardOpen\(\); \}/.test(ov) && /dismissedRsKey/.test(ov), '알약으로 접어 둬도 탑승·환승 때가 되면 저절로 펼친다');
  });
  await t('세부경로 줄(s135): 레일 · 현재위치 점 · 뱃지 · 펼침을 ScreenView 가 그리고 · 보이는 동안에만 다시 그린다 · 그릴 때 새 객체 없음', () => {
    const sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/case ScreenCore\.K_TDROW: drawTdrow/.test(sv) && /tdDrawn/.test(sv) && /tdAct/.test(sv) && /System\.currentTimeMillis\(\)/.test(sv.slice(sv.indexOf('private void drawTdrow('), sv.indexOf('private String ellipsizeTd('))), '그리기 · 지금 시각으로 진행 비율');
    assert.ok(!/new Paint|new RectF|new Rect\(|new Path|new String|new int\[/.test(sv.slice(sv.indexOf('private void tdIcon('), sv.indexOf('private String ellipsizeTd('))), '그릴 때 새 객체 없음');
    assert.ok(/if \(tdAct \|\| tdAnim\) postInvalidateOnAnimation\(\); else if \(tdDrawn\) postInvalidateDelayed\(2000L\)/.test(sv), '지금 가는 구간이 보이면 화면 박자 · 아니면 2초마다');
    assert.ok(/CAP = 2[45]/.test(fs.readFileSync(N("ShellCore.java"), "utf8")) && /K_TDROW = 45/.test(sc) && /"tdrow"\.equals\(t\)/.test(sc), 'cap 21 · tdrow 파싱');
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
    assert.ok(/HomeCore\.optName\(home\.resTab\) \+ " 경로로 확정했어요"/.test(v) && /postDelayed\([\s\S]{0,160}closeSheet\(\)[\s\S]{0,40}600L/.test(v) && /ovlHintOnce\(\)/.test(v) && /RideOverlay\.supported\(\) && !RideOverlay\.allowed\(this\)/.test(v) && /optName\(String tab\)/.test(hm), '확정: 토스트(옵션 이름) · 초록 단추 다시 받기 · 0.6초 뒤 닫힘 · 오버레이 권한 안내는 한 번만');
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
    assert.ok(/private void foodStage\(/.test(v) && /if \(food\.ctr != null && food\.needData\(\)\) fetchFoodData\(my, v\);/.test(v) && /FoodCore\.parseData\(sbody, new ArrayList<String>\(\)\)/.test(v), '맛집: 중심을 알면 엔진 왕복과 동시에 · 서버 가게 먼저 그린 뒤 공공데이터까지');
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
    assert.ok(/onInterceptTouchEvent/.test(d) && /10f \* dpr/.test(d) && /Math\.abs\(dy\) > Math\.abs\(dx\) \* 1\.2f/.test(d) && /openTimetable\(curH,/.test(d) && /setTranslationY\(Math\.max\(0f, d\)\)/.test(d), '위/아래 끌기 규칙(10dp · 1.2배) + 손가락을 따라가기(창 높이 · 창 이동)');
    assert.ok(/ShellCore\.S_MAPSTN\.equals\(sheetName\)/.test(d) && /fired = true/.test(d) && /return false;/.test(d), '역 팝업일 때만 · 한 번만 · 평소엔 가로채지 않는다');
  });
  await t('시간표를 내려 놓으면 그 높이에서 그대로 내려가 닫힌다(s208 — 역 팝업이 다시 올라오지 않는다) · 지도는 시트가 덮은 만큼을 빼고 역을 맞춤(s155)', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), m = fs.readFileSync(N('MetroMapView.java'), 'utf8');
    assert.ok(!/backToStation|stationNow|swapOff/.test(a), 's208: 시간표를 내리다 역 팝업으로 바뀌어 다시 올라오는 길을 없앴다');
    const rel = a.slice(a.indexOf('boolean tt = ShellCore.S_MAPTT.equals(sheetName);'), a.indexOf('private void mapSheetAct('));
    assert.ok(/if \(!cancel && \(ty >= \(tt \? 56f : 40f\) \* dpr \|\| vy > 600f \* dpr\)\) \{[\s\S]*translationY\(dv\.getHeight\(\) \+ 40f \* dpr\)[\s\S]*closeSheet\(\)/.test(rel), '놓은 자리(ty)에서 그대로 아래로 내려가 닫는다(올라가지 않는다)');
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
    assert.ok(!/private boolean stationNow\(/.test(a), 's208: 끄는 도중 역 팝업으로 바꿔치기하지 않는다(손가락 따라 내려가다 놓으면 닫힘)');
    assert.ok(/private void busPaint\(/.test(a) && /fetchBusNeed\(v, keep, round, my, shownNow && !busRefreshing\)/.test(a) && /if \(partial && body\.length\(\) > 0\) main\.post/.test(a) && /MapCore\.busGet\(need\.get\(k\)\[0\], need\.get\(k\)\[1\], 5000, 4000\)/.test(a), '정류장 도착정보는 병렬로 받아 먼저 온 곳부터 그리고 빈 응답은 0.3초 뒤 다시');
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
    assert.ok(/BUS_POLL_MS = 30000L/.test(a), '위치 재확인 30초에 한 번');
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
    assert.ok(/arrWave/.test(w) && /else if \(\/\^\[af\]\/\.test\(k\)\) failA\+\+;/.test(w) && /if \(arrWave\) break;/.test(w), '서버: 도착정보는 온 것만 싣고 못 받은 곳은 need 로 남긴다');
  });
  await t('s168: 옛 도착 숫자 없이 정류장 뼈대 먼저 · 도착정보만 곧장 · 사전 연결(Keep-Alive) · 해석은 IO 스레드', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), np = fs.readFileSync(N('NetPost.java'), 'utf8'), sc = fs.readFileSync(N('ShellCore.java'), 'utf8');
    assert.ok(/private void showSkeleton[\s\S]{0,700}busSkelKey\(store\)/.test(a) && /bsk_cell/.test(a) && /stopsCell\(\)/.test(a), '버스 뼈대: 같은 동네(110m 칸)의 엔진이 그린 정류장 뼈대를 먼저 그린다');
    assert.ok(/saveBusSkeleton\(\)/.test(a) && /bodyRequest\(ShellCore\.CAP, ShellCore\.theme\(store\), true\)/.test(a), '정류장을 받은 뒤 도착정보 없는 화면을 엔진에게 받아 저장(백그라운드)');
    const f = a.slice(a.indexOf('private void loadMapBodyFast'), a.indexOf('private long preConnAt'));
    assert.ok(/if \(!keep\) map\.clearArrivals\(\)/.test(f) && /speculativeNeed\(\)/.test(f) && /fetchBusNeed\(v, keep, 0, \+\+seqMapB, true\)/.test(f) && /preconnectBus\(\)/.test(f), '콜드 스타트/탭 진입: 옛 도착정보 비우고 · 엔진 왕복 없이 도착정보만 곧장 받는다');
    assert.ok(/loadMapBodyFast\(body, shown\)/.test(a) && /loadMapBodyFast\(v, keep\); return; \}/.test(a), '탭 진입 두 길이 빠른 길을 쓴다');
    assert.ok(/NetPost\.get\(ShellCore\.BUS_BASE \+ "\/health"/.test(a) && /boolean reuse = false/.test(np) && /if \(c != null && !reuse\) c\.disconnect\(\)/.test(np), '사전 연결 + 연결 재사용(응답을 다 읽으면 끊지 않는다)');
    const bp = a.slice(a.indexOf('private void busPaint'), a.indexOf('private void fetchBusNeed'));
    assert.ok(/warm\(txt\)/.test(bp), '응답 해석은 IO 스레드(주 스레드는 그리기만)');
    assert.ok(/BUS_STALE_MS = BUS_FRESH_MS/.test(sc) && /busSkelKey\(Store st\)/.test(sc), '도착정보 화면 10분 · 뼈대 24시간');
  });
  await t('s169: 홈에서 시작해도 버스 탭을 미리 준비(연결 · 정류장 · 도착정보 주소 · 뼈대)', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    const w = a.slice(a.indexOf('private void warmBusStructure'), a.indexOf('/** 켤 때: 권한이 이미 있으면'));
    assert.ok(/saveLoc\(Location l\)[^\n]*warmBusStructure\(/.test(a), '위치를 잡으면 버스 준비를 시작');
    assert.ok(/preconnectBus\(\)/.test(w) && /saveStopsCache\(\)/.test(w) && /rememberNeed\(arrNeed\)/.test(w) && /bodyRequest\(ShellCore\.CAP, theme, true\)/.test(w) && /store\.put\("bsk_cell", cell\)/.test(w), '연결 · 정류장 보관 · 도착정보 주소 기억 · 엔진이 그린 뼈대 저장');
    assert.ok(/"map"\.equals\(ShellCore\.currentTab\(store\)\)\) return/.test(w) && /600000L/.test(w) && /speculativeNeed\(\)\.isEmpty\(\)/.test(w), '버스 탭에선 하지 않고 · 10분에 한 번 · 이미 준비된 동네는 건너뜀');
    assert.ok(/main\.post\(new Runnable\(\) \{ @Override public void run\(\) \{ w\.saveStopsCache/.test(w) && /main\.post\(new Runnable\(\) \{ @Override public void run\(\) \{ store\.put\("bsk_cell"/.test(w), '저장소 쓰기는 주 스레드로');
    assert.ok(/^\s*preconnectBus\(\);\s+\/\/ 버스 서버 연결을 켜자마자/m.test(a), '켜자마자(홈에서도) 연결을 미리 맺는다');
  });
  await t('s170: 버스 공공 API 오류 봉투는 다시 묻고 · 동시 4곳 · 못 받으면 없음으로 굳히지 않는다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), np = fs.readFileSync(N('NetPost.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/Semaphore\(4\)/.test(np) && /OpenAPI_ServiceResponse/.test(np) && /public static Res getBus\(/.test(np) && /status == 200 \? -3/.test(np), '동시 4곳 · 오류 봉투 감지 · 못 받으면 -3');
    assert.ok(!/NetPost\.get\(u, a == 0 \? 5000/.test(a) && (a.match(/MapCore\.busGet\(/g) || []).length >= 5 && !/NetPost\.getBus\(/.test(a), '버스 받기는 모두 busGet(→getBus2→getBus) 로');
    assert.ok(/busRes\.remove\(k\); return;/.test(mc), '빈 본문은 없음으로 굳히지 않는다');
  });
  await t('s183: 도착정보가 비어 오면 다른 길로 다시 · 오버레이는 앱을 내렸을 때만(기본 꺼짐) + 경로 확정 때 허용 안내 · 확정 직후 탑승 시트 열기', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), np = fs.readFileSync(N('NetPost.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8'), rs = fs.readFileSync(N('RideService.java'), 'utf8');
    assert.ok(/public static boolean busEmpty\(/.test(np) && /public static Res getBusArr\(/.test(np) && /if \(arr\) return NetPost\.getBusArr\(/.test(mc) && /busBust\(useAlt \? alt : url, 1\)/.test(np), '도착정보: 비어 오면 다른 길 + 일회용 글자로 두 번 더');
    assert.ok(!/K_OVL, "0"\)\)/.test(a) && /ShellCore\.ovlOn\(/.test(rs), '오버레이 읽는 곳 모두 ovlOn');
    const f = a.slice(a.indexOf('private void ovlHintOnce()'), a.indexOf('private void restoreRideCard()'));
    assert.ok(/appFront/.test(rs) && /on = on && !appFront;/.test(rs) && /RideService\.setAppFront\(true\)/.test(a) && /RideService\.setAppFront\(false\)/.test(a), '오버레이 창은 앱이 화면에 있는 동안 숨긴다');
    assert.ok(/openSetPage\("askovl"\)/.test(f) && /ovlAskedRun/.test(f) && /RideService\.rsAct\("open"\)/.test(f) && /rsOpenSoon\(\);/.test(a), '확정하면 허용 안내(이번 실행 한 번) · 탑승 시트 열기');
  });
  await t('s184: 오버레이 웹 규칙 — 접힌 알약은 1정거장 전·새 추천에만 펼침(맨 위로 갔다 원위치) · 2정거장 전 알약 무지개 6초 · 추천 줄 오른쪽에서 1.15초 입장', () => {
    const o = fs.readFileSync(N('RideOverlay.java'), 'utf8'), oc = fs.readFileSync(N('OvCore.java'), 'utf8');
    assert.ok(/userPill && !wantOpen\(\)/.test(o) && /cur\.alert == 1 && cur\.alertAt != dismissedAlertAt\) \|\| \(cur\.row\.kind > 0 && cur\.row\.at != dismissedRecoAt/.test(o) && /dismissedRecoAt = cur\.row\.at/.test(o) && /dismissedAlertAt = cur\.alertAt/.test(o), '펼침 규칙(1정거장 전 · 새 추천, 접은 경고·추천은 다시 안 펼침)');
    assert.ok(/restoreX = lp\.x; restoreY = lp\.y; movedForAlert = true; lp\.x = 0; lp\.y = 0/.test(o) && /lp\.x = restoreX; lp\.y = restoreY; movedForAlert = false/.test(o), '펼쳐지면 맨 위로, 끝나면 원래 자리(가로·세로)');
    assert.ok(/border\.setMode\(pill \? \(v\.alert == 2 \? 2 : 0\) : v\.alert\)/.test(o) && /alert == 2 \? 6000L/.test(oc) && /alert == 1 \? 1100L/.test(oc) && /dp\(pill \? 15 : 14\)/.test(o), '알약 둘레 무지개 6초 · 반지름 15');
    assert.ok(/IN_MS = 1150L, TURN_MS = 300L/.test(o) && /cv\.translate\(\(1f - slide\) \* getWidth\(\), 0f\)/.test(o) && /cv\.scale\(-1f, 1f/.test(o) && /\? 183L : 110L/.test(o), '추천 줄 입장: 오른쪽에서 1.15초 감속 · 좌우 반전 · 5° · 0.3초 뒤 돌아섬 · 0.6배속');
  });
  await t('s198: 오버레이 웹 맞춤 — 엔진이 정한 진동(alertAt 새 경고에 한 번) · 위치·접힘 저장 · 알약 가로 이동 · 스프링 · 관성 스크롤 · 알약 글은 엔진 값', () => {
    const o = fs.readFileSync(N('RideOverlay.java'), 'utf8'), oc = fs.readFileSync(N('OvCore.java'), 'utf8');
    assert.ok(/v\.alert > 0 && v\.alertVibe && v\.alertAt > 0L && v\.alertAt != lastVibeAt && System\.currentTimeMillis\(\) - v\.alertAt < 20000L/.test(o) && /new long\[\] \{ 0, 300, 100, 300, 100, 300 \}/.test(o) && /new long\[\] \{ 0, 400, 150, 400 \}/.test(o), '진동: 엔진 alertVibe · 새 alertAt 한 번 · 웹과 같은 무늬');
    assert.ok(/PREF = "overlay_pos"/.test(o) && /putInt\("px", lp\.x\)/.test(o) && /putBoolean\("pill", v\)/.test(o) && /sp\.getBoolean\("pill"/.test(o) && /savePos\(\)/.test(o), '위치(y)·알약 가로(px)·접힘(pill) 저장');
    assert.ok(/if \(curPill\) lp\.x = startX \+ Math\.round\(mx\)/.test(o) && /OvershootInterpolator\(2\.4f\)/.test(o) && /startFling\(-vt\.getXVelocity\(\)/.test(o) && /setDuration\(380L\)/.test(o), '알약 가로 이동 · 스프링(520ms) · 관성 스크롤 · 380ms 되돌아오기');
    assert.ok(/pillTxt/.test(oc) && /v\.pillTxt\.length\(\) > 0\) return v\.pillTxt/.test(oc) && /alertVibe = Boolean\.TRUE\.equals/.test(oc), '알약 글 · 진동 신호는 엔진 값');
  });
  await t('s184: 오버레이 카드가 화면 높이만큼 늘어나던 문제 — 테두리 뷰는 처음엔 숨기고 재는 동안 크기를 갖지 않는다', () => {
    const o = fs.readFileSync(N('RideOverlay.java'), 'utf8');
    assert.ok(/Border\(Context c\) \{ super\(c\);[^\n]*setVisibility\(View\.GONE\)/.test(o) && /MeasureSpec\.getMode\(ws\) == MeasureSpec\.EXACTLY \? MeasureSpec\.getSize\(ws\) : 0/.test(o), '테두리 뷰: 처음 숨김 + 재는 동안 0');
  });
  await t('s185: 탑승 시트 웹 숫자 맞춤 — 시트(탭 아래·탭이 같이 올라감) / 떠 있는 알약·되돌리기(탭 위) 두 뷰 · 0.46초 곡선 · 줄어들며 사라짐 · 끌어내리기', () => {
    const v = fs.readFileSync(N('RsSheetView.java'), 'utf8'), a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), c = fs.readFileSync(N('RsCore.java'), 'utf8');
    assert.ok(/H_BOARD = 83, H_UNDO = 53, H_PILL = 52/.test(c) && /BTN_H = 46f/.test(c) && /PILL_R = 14f/.test(c) && /Math\.max\(92f/.test(c), '웹 CSS 숫자(시트 83 · 단추 46 · 알약 38/14 · 단추 최소 92)');
    assert.ok(/new RsSheetView\(this, true\)/.test(a) && /new RsSheetView\(this, false\)/.test(a) && /rs\.setSibling\(tabs\)/.test(a) && /rsF\.setOv\(o\)/.test(a) && /holder\.addView\(rsF, new FrameLayout\.LayoutParams\([^)]*Gravity\.BOTTOM\)/.test(a) && a.indexOf('root.addView(tabs') < a.indexOf('root.addView(rs,'), '두 뷰: 알약은 본문 위에 떠서(자리 안 차지 · 뒤가 비침) · 시트는 탭 아래 · 시트가 탭을 올린다');
    assert.ok(/PathInterpolator\(0\.22f, 1f, 0\.36f, 1f\)/.test(v) && /RISE_MS = 460L, FADE_MS = 300L/.test(v) && /translationX\(w \* 0\.34f\)\.translationY\(hh \* 0\.64f\)\.scaleX\(0\.2f\)/.test(v) && /hh \* 1\.12f/.test(v) && /setStartDelay\(120L\)\.setDuration\(400L\)/.test(v) && /sibling\.animate\(\)\.translationY/.test(v), '올라옴 0.46초 · 닫힘은 오른쪽 아래로 0.2배 · 알약 0.12초 뒤 0.4초 · 탭 동행');
    assert.ok(/setTranslationY\(dy \* dpr\)/.test(v) && /ScreenView\.R_GOLD2/.test(v) && /new LinearGradient/.test(v) && /1400L/.test(v), '아래로 끌면 따라 내려옴 · 금색 그라데이션 단추 · 맥동 링 · 점 1.4초');
  });
  await t('s186: 대기 알약은 본문 위에 투명하게 뜨고(알약 자리 밖 터치는 뒤 화면으로) · "탑승 안내 중" 박스는 엔진에서 뺀다', () => {
    const v = fs.readFileSync(N('RsSheetView.java'), 'utf8'), a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), e = fs.readFileSync(path.join(__dirname, '..', 'engine', 'result.js'), 'utf8');
    assert.ok(/holder\.addView\(rsF,/.test(a) && !/root\.addView\(rsF/.test(a) && /rsF\.bringToFront\(\)/.test(a) && /!sheetMode\) \{[^}]*return false;/.test(v.replace(/\n/g, ' ')), '알약 뷰는 본문 칸 위(투명) · 알약 밖 터치는 통과');
    assert.ok(!/'탑승 안내 중'/.test(e), '결과 카드에 "탑승 안내 중" 박스가 없다');
  });
  await t('s187: 버스 탭 — 먼저 온 정류장부터 바로 그린다 · 비어 있음은 한 번만 더 · 카드가 커져 아래 카드 자리가 바뀌면 스프링으로 미끄러진다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), np = fs.readFileSync(N('NetPost.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/fetchBusNeed\(v, keep, 0, \+\+seqMapB, true\)/.test(a) && !/fetchBusNeed\(v, keep, 0, \+\+seqMapB, false\)/.test(a), '처음 들어올 때도 정류장마다 오는 대로 그린다');
    assert.ok(/k >= 1 \|\| !busEmpty\(r\.body\)/.test(np), '비어 있음은 한 번만 더');
    assert.ok(/public float yo; public long yt;/.test(sc) && /cardY\.get\(it\.key\)/.test(sv) && /it\.yo \* \(1f - spring\(fy/.test(sv), '카드 자리가 바뀌면 옛 자리에서 스프링으로');
  });
  await t('s188: 경로 확정이 홈에 다녀와도 풀리지 않는다 · 설치 안내는 가운데 팝업 · 엔진이 모르는 안내는 "물었다"로 굳지 않는다 · 안 받아 둔 탭은 다시 채운다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sc = fs.readFileSync(N('ShellCore.java'), 'utf8');
    assert.ok(/private boolean reviveRide\(\)/.test(a) && /RideService\.running\) && \(System\.currentTimeMillis\(\) < rideGraceUntil \|\| reviveRide\(\)\)|!RideService\.running && \(System\.currentTimeMillis\(\) < rideGraceUntil \|\| reviveRide\(\)\)/.test(a) && /reviveRide\(\);\s*rsApply\.run\(\)/.test(a), '앞으로 돌아오면 저장된 탑승 안내를 되살린다');
    const o = a.slice(a.indexOf('private void openSetPage('), a.indexOf('private void loadSetPage()'));
    assert.ok(/pop = "locd"\.equals\(page\) \|\| ShellCore\.isAskPage\(page\)/.test(o) && /Theme_Material_Light_Dialog_NoActionBar/.test(o) && /setDimAmount\(0\.68f\)/.test(o) && /Gravity\.CENTER/.test(o) && /setCancelable\(false\)/.test(o), '위치 · 설치 안내는 가운데 어두운 팝업(웹 .68)');
    assert.ok(/popResize\(dp\)/.test(a) && /private void popResize\(float dp\)/.test(a), '팝업 높이는 화면이 정한 글 높이에 맞춘다');
    assert.ok(/askUnburn\(setPage\); setupNoEngine = true;/.test(a) && /setupNoEngine \|\| setupPhase != 0/.test(a) && /K_SETUPV, ""\)\)\) \{ store\.put\(ShellCore\.K_SETUPV, "2"\)/.test(a) && /K_SETUPV = "setup_v"/.test(sc), '엔진이 모르는 안내는 건너뛰되 표시는 지우고 · 한 번 되돌린다');
    assert.ok(/RideService\.running && RideService\.liveRide\.length\(\) < 3\) return;/.test(a), '서비스가 돌지만 첫 값이 아직이면 확정을 지우지 않는다');
    assert.ok(/my == rideSeq && home\.riding\(\)\) return;/.test(a) && /rideSeq = seqRoute;/.test(a), '확정한 찾기의 뒤늦은 결과(근사 → 전체)가 확정을 풀지 않는다');
    {   // s214: 경로 확정은 사용자가 끝내거나 도착할 때까지 풀리지 않는다
        const rl = a.slice(a.indexOf('private boolean rideLocked()'), a.indexOf('private void goRoute()') + 80);
        assert.ok(/private boolean rideLocked\(\) \{\s*if \(!home\.riding\(\)\) return false;/.test(rl) && /private void goRoute\(\) \{\s*if \(rideLocked\(\)\) return;/.test(rl), '길찾기는 확정 중이면 시작하지 않는다');
        assert.ok(/private void pickBase\(\) \{\s*if \(rideLocked\(\)\) return;/.test(a) && /case HomeCore\.R_LOCK: rideLocked\(\); break;/.test(a), '기준시각 바꾸기 · 닫기/찾기/바꾸기 눌림은 확정 중이면 토스트만');
        assert.ok(/FavCore\.Go g = fav\.go\.get\(fav\.goIdx\);\s*closeSheet\(\);\s*if \(rideLocked\(\)\) break;/.test(a), '즐겨찾기 길찾기는 확정을 지우기 전에 막는다');
        const wl = a.slice(a.indexOf('private void widgetLaunch()'), a.indexOf('private int gwSeq'));
        assert.ok(/if \(rideLocked\(\)\) return;\s*toast\("출퇴근 경로를 찾는 중이에요"\)/.test(wl), '위젯 출퇴근 길찾기도 확정을 지우지 않는다');
        assert.ok(/case MapCore\.R_START:\s*if \(rideLocked\(\)\)/.test(a) && /case MapCore\.R_DEST:\s*if \(rideLocked\(\)\)/.test(a), '지도에서 출발/도착을 골라도 확정 중엔 바뀌지 않는다');
        const rv = a.slice(a.indexOf('private boolean reviveRide()'), a.indexOf('private void pollRide()'));
        assert.ok(/reviveN >= 6 \? 30000L : 4000L/.test(rv) && /try \{ RideService\.start\(this\); \} catch \(Throwable t\)/.test(rv) && !/reviveN >= 6\) return false/.test(rv), '서비스를 몇 번 못 켜도 확정을 포기하지 않고 계속 다시 켠다');
        const hc2 = fs.readFileSync(N('HomeCore.java'), 'utf8');
        assert.ok(/R_LOCK = 15/.test(hc2) && /"rh\.close"\.equals\(v\)\) \{ if \(riding\(\)\) return R_LOCK;/.test(hc2), '확정한 경로는 닫기로 풀리지 않는다');
        const rs = fs.readFileSync(path.join(ROOT, 'engine', 'ride-standby.js'), 'utf8');
        assert.ok(!/offGiveUpSec\s*:/.test(rs) && !/O\.offGiveUpSec/.test(rs), '탑승 엔진은 경로를 벗어났다고 스스로 안내를 끝내지 않는다');
        // 서비스가 뜻밖에 사라져도(켜지지 않음 · 시스템이 내림 · 엔진이 뜻밖에 끝냄) 확정을 풀지 않는다 — 사용자 종료 · 도착만 푼다
        {
            const rsv0 = fs.readFileSync(N('RideService.java'), 'utf8');
            assert.ok(/static volatile String endReason/.test(rsv0) && /ACT_STOP\.equals\(act\)\) \{ finishRide\("user"\)/.test(rsv0) && /finishRide\(q \? "arrive" : "engine-done"\)/.test(rsv0) && /static void stop\(Context c\) \{\s*endReason = "user";/.test(rsv0) && /static void start\(Context c\) \{\s*endReason = "";/.test(rsv0), '서비스가 끝난 까닭(user · arrive · 그 밖)을 남긴다');
            const fr = rsv0.slice(rsv0.indexOf('private void finishRide(String reason)'), rsv0.indexOf('// ── 알림 ──'));
            assert.ok(/if \(legit\) clearSaved\(this\);/.test(fr) && /RIDE_END/.test(fr) && !/clearSaved\(this\);\s*liveOff/.test(fr), '뜻밖의 끝은 저장본을 남겨 다시 켤 수 있게 한다');
            const pr = a.slice(a.indexOf('private void pollRide()'), a.indexOf('private int lostN'));
            assert.ok(/"arrive"\.equals\(RideService\.endReason\) \|\| "user"\.equals\(RideService\.endReason\)\)\) && resumeLostRide\(\)\) return;/.test(pr.replace(/\s+/g, ' ').replace('!(' , '!(') ) || /resumeLostRide\(\)\) return;/.test(pr), '뜻밖에 서비스가 없으면 확정을 풀지 않고 다시 켠다');
            const rl = a.slice(a.indexOf('private boolean resumeLostRide()'), a.indexOf('private long offAskedAt'));
            assert.ok(/lostN >= 20/.test(rl) && /now - lostAt >= 30000L/.test(rl) && /RideService\.save\(this, ride\)/.test(rl) && /RIDE_LOST/.test(rl), '30초에 한 번 · 스무 번까지 다시 켜고 까닭을 오류 기록에 남긴다');
        }
        // 경로 이탈 팝업: 엔진이 알린 이탈(off.at) → 서비스(liveOff) → 앱이 한 번 묻고, 고르면 지금 위치에서 다시 찾는다
        const rcj = fs.readFileSync(N('RideCore.java'), 'utf8'), rsv = fs.readFileSync(N('RideService.java'), 'utf8');
        assert.ok(/public long offAt;/.test(rcj) && /m\.get\("off"\)/.test(rcj) && /offAt = 0L; cur = -1;/.test(rcj), 'RideCore 가 엔진의 off.at 을 읽는다');
        assert.ok(/static volatile long liveOff/.test(rsv) && /liveOff = core\.offAt;/.test(rsv) && (rsv.match(/liveOff = 0L;/g) || []).length >= 2, '서비스가 이탈 시각을 앱에 알리고 끝나면 지운다');
        const ra = a.slice(a.indexOf('private void rerouteAsk()'), a.indexOf('private void rerouteFromHere()'));
        assert.ok(/!home\.riding\(\) \|\| !RideService\.running\) return;/.test(ra) && /at == offAskedAt/.test(ra) && /setPositiveButton\("다시 찾기"/.test(ra) && /setNegativeButton\("계속 안내", null\)/.test(ra), '확정 중에만 · 같은 이탈엔 한 번만 · [다시 찾기] / [계속 안내]');
        const rf2 = a.slice(a.indexOf('private void rerouteFromHere()'), a.indexOf('// ───────────── 도보 안내 시트'));
        assert.ok(/locateNow\(/.test(rf2) && /home\.setGpsStart\(l\.getLatitude\(\), l\.getLongitude\(\)\)/.test(rf2) && /RideService\.stop\(ShellActivity\.this\)/.test(rf2) && /goRoute\(\);/.test(rf2) && !/startRide\(/.test(rf2), '지금 위치를 출발지로 새로 찾는다(자동 확정은 안 한다)');
        assert.ok(/fail\(boolean noperm\) \{ if \(!once\[0\]\) toast\(/.test(rf2), '위치를 못 잡으면 안내를 그대로 둔다');
        assert.ok(/rsApply = new Runnable\(\) \{ @Override public void run\(\) \{ rerouteAsk\(\);/.test(a) && /rerouteAsk\(\); \}\s*\}, 1500L\)/.test(a) && /home\.setRide\(RideService\.liveRide, RideService\.liveLv\)\) reloadHome\(\);\s*rerouteAsk\(\);/.test(a), '서비스가 알릴 때 · 앱을 다시 열 때 · 홈 5초 틱에서 확인');
    }
    assert.ok(/private void ovlAuto\(\)/.test(a) && /RideOverlay\.allowed\(this\) && store\.get\(ShellCore\.K_OVL, ""\)\.length\(\) == 0\) store\.put\(ShellCore\.K_OVL, "1"\)/.test(a) && /ovlAuto\(\); if \(home\.riding\(\)/.test(a), '허용만 해 둔 기기는 오버레이를 켠 것으로');
    assert.ok(/private void prefetchIfCold\(\)/.test(a) && /prefetchIfCold\(\); \} \}, 1500L\)/.test(a), '캐시에 없는 탭이 있으면 미리 받기를 다시');
  });
  await t('s182: 처음 설치 승인을 한 가지씩 차례로 — 알림 → 위치 안내/권한 → 배터리(갤럭시는 절전까지) → 다른 앱 위에 표시', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sc = fs.readFileSync(N('ShellCore.java'), 'utf8');
    const f = a.slice(a.indexOf('private void setupNext()'), a.indexOf('private void askDone('));
    const iN = f.indexOf('POST_NOTIFICATIONS'), iL = f.indexOf('locGate('), iB = f.indexOf('openSetPage("askbat")'), iS = f.indexOf('openSetPage("asksam")'), iO = f.indexOf('openSetPage("askovl")');
    assert.ok(iN > 0 && iN < iL && iL < iB && iB < iS && iS < iO, '차례: 알림 → 위치 → 배터리 → 갤럭시 절전 → 오버레이');
    assert.ok(/K_LOCDISC, \"0\"\)\)\) return;/.test(f.replace(/\\"/g, '"')) || /K_LOCDISC, "0"\)\)\) return;/.test(f), '위치 안내에 동의한 뒤에만 이어서');
    assert.ok(/K_BATASK[\s\S]{0,160}K_SAMASK/.test(f) && /K_OVLASK/.test(f) && /K_NOTIFASK/.test(f), '각 안내는 평생 한 번(저장소 열쇠)');
    assert.ok(/setupDeclined = true/.test(a) && /setupDeclined \|\| setupNoEngine \|\| setupPhase != 0/.test(f), '위치 안내를 거부하면 이번엔 더 묻지 않는다');
    assert.ok(/code == REQ_SETUP_NOTIF\) \{ setupSoon\(\)/.test(a) && /setupSoon\(\);\s*\/\/ 위치 창이 닫혔다/.test(a) && /setupResume\(\); \}/.test(a), '기기 창이 닫히면(권한 결과 · 설정에서 돌아옴) 다음 승인으로');
    assert.ok(/setupPhase = 1; PowerInfo\.openSamsung/.test(a) && /PowerInfo\.requestIgnore\(ShellActivity\.this\)/.test(a) && /ACTION_MANAGE_OVERLAY_PERMISSION/.test(a.slice(a.indexOf('private void askDone('))), '갤럭시: 절전 목록 → 돌아오면 기기 허용 창 · 오버레이는 설정 화면');
    assert.ok(/if \(!perm\) return;/.test(a.slice(a.indexOf('private void autoGps()'), a.indexOf('private void autoGps()') + 700)), '첫 위치 권한은 승인 순서가 맡는다(두 곳에서 동시에 묻지 않음)');
    assert.ok(/PG_ASKOK = 16, PG_ASKNO = 17/.test(sc) && /isAskPage\(page\)/.test(sc) && /ShellCore\.isAskPage\(setPage\)\s*\? ShellCore\.pageUrlAsk/.test(a) && /isAskPage\(page\)\) sheet\.setCancelable\(false\)/.test(a.replace('"locd".equals(page) || ShellCore.', 'ShellCore.').replace(/"locd"\.equals\(page\) \|\| /, '')) || /setCancelable\(false\)/.test(a), '안내 화면: 바깥을 눌러도 닫히지 않는다 · 서버 엔진이 모르면 건너뛴다');
  });
  await t('s181: 버스 다시 묻기 — 캐시된 오류 봉투를 피해 일회용 글자(_r)를 붙인다', () => {
    const np = fs.readFileSync(N('NetPost.java'), 'utf8');
    assert.ok(/public static String busBust\(String url, int attempt\)/.test(np) && /get\(busBust\(url, a\), a == 0 \? firstMs : retryMs\)/.test(np) && /once\(busBust\(useAlt \? alt : url, a\)/.test(np), 'getBus · getBus2 의 다시 묻기에 일회용 글자');
  });
  await t('s179: 위치 허브 — 어디서 위치를 받든 홈 카드 · 버스 탭에 즉시 · 버스 화면 캐시는 위치 칸마다 · 미리받기도 그 칸 열쇠', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sc = fs.readFileSync(N('ShellCore.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/private void locHub\(Location l\)[\s\S]{0,260}hcFixFrom\(la, lo\);\s*busLocFollow\(la, lo\);/.test(a), '허브: 홈 카드 위치와 버스 탭을 한 곳에서');
    assert.ok(/saveLoc\(l\); locHub\(l\);/.test(a) && /got\[0\] = true; locHub\(l\);/.test(a), '현재 위치(1초) · 기기가 알던 위치(0.1초) 둘 다 허브로');
    const f = a.slice(a.indexOf('private void busLocFollow'), a.indexOf('private static final double BUS_FAR_DEG'));
    assert.ok(/home\.riding\(\)\) return;/.test(f) && /BUS_MOVE_DEG\)\) return;/.test(f) && /map\.busLL == null \|\| map\.stopCount\(\) == 0\) \{ map\.setBusLoc\(la, lo\); reloadMap\(false\); return; \}/.test(f) && !/busMove\(la, lo\);/.test(f) && /if \(quiet\) return;/.test(a.slice(a.indexOf('private void busMove('), a.indexOf('private void busMove(') + 900)), 's231: 탑승 중 제외 · 55m 안이면 그대로 · 정류장이 이미 떠 있으면 이동해도 자동 재탐색 없음(새로고침 단추만) · 처음 그릴 때만 그 동네 화면');
    assert.ok(/preconnectBus\(\); locKick\(\);/.test(a) && /private void locKick\(\)[\s\S]{0,200}locateNow\(8000L, 1000L, 60000L, 120000L/.test(a), '버스 탭에 들어올 때 위치를 한 번 더 확인(0.1초 → 1초)');
    assert.ok(/K_BUSCELL = \"bus_cell\"/.test(sc.replace(/\\"/g, '"')) || /K_BUSCELL = "bus_cell"/.test(sc), '위치 칸 저장 열쇠');
    assert.ok(/busViewSuffix\(String screen, String mode, Store st, String cell\)/.test(sc) && /\"\|\" \+ MapCore\.VW_NEAR \+ \"\|\" \+ \(cell == null/.test(sc.replace(/\\"/g, '"')) || /"\|" \+ MapCore\.VW_NEAR \+ "\|" \+ \(cell == null/.test(sc), '버스 주변 화면 열쇠에 위치 칸');
    assert.ok(/public boolean primary;/.test(mc) && /if \(primary\) st\.put\(ShellCore\.K_BUSCELL, stopsKey\(\)\)/.test(mc) && /map = new MapCore\(store\); map\.primary = true;/.test(a), '실제 화면 상태기만 위치 칸을 적는다');
    assert.ok(/mapKey\(ShellCore\.S_MAPB, "bus", store, MapCore\.cellOf\(ll\[0\], ll\[1\]\)\)/.test(a) && (a.match(/MapCore\.cellOf\(ll\[0\], ll\[1\]\)/g) || []).length >= 3, '미리 받기는 그 위치 칸의 열쇠로');
    assert.ok(/private void rekeyMapBody\(\)/.test(a) && /rekeyMapBody\(\);\s*present\(body, txt, true\)/.test(a), '응답이 오는 사이 칸이 바뀌어도 그 동네 화면으로 저장');
    assert.ok(/private void trimBusKeys\(String key\)[\s\S]{0,160}busKeys\.size\(\) > 6/.test(a), '위치 칸 캐시는 최근 6곳만');
  });
  await t('s176: 버스 재조회는 위치가 바뀔 때만 · 탭을 다녀와도 시간만 줄어든다 · 위치 재확인은 탑승 중이 아니면 30초마다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sc = fs.readFileSync(N('ShellCore.java'), 'utf8');
    const lc = a.slice(a.indexOf('private void busLocCheck()'), a.indexOf('/** 앞으로 돌아왔을 때'));
    assert.ok(/if \(!busShowing\(\) \|\| home\.riding\(\)\) return;/.test(lc) && /BUS_FRESH_MS\) \{ busRefresh\(\); return; \}/.test(lc) && /farFrom\(map\.busLL, l, BUS_MOVE_DEG\)\) busMove\(/.test(lc) && !/busRefresh\(\);[^}]*busMove/.test(lc.replace(/BUS_FRESH_MS\) \{ busRefresh\(\); return; \}/, '')), '탑승 중엔 안 함 · 위치가 55m 넘게 바뀌면 busMove · 같으면 아무것도 받지 않는다(10분 넘은 숫자만 예외)');
    const bt = a.slice(a.indexOf('private final Runnable busTick'), a.indexOf('private void busLocCheck()'));
    assert.ok(/busLocCheck\(\); startBusTick\(\);/.test(bt) && !/busRefresh\(\)/.test(bt), '30초 박자는 위치만 본다(도착정보를 곧바로 받지 않는다)');
    const rq = a.slice(a.indexOf('private boolean busReturnQuiet()'), a.indexOf('private void startBusTick()'));
    assert.ok(/busLocCheck\(\);/.test(rq) && !/busRefresh\(\)/.test(rq), '탭을 다녀오면 위치만 확인한다');
    assert.ok(/BUS_FRESH_MS = 600000L/.test(sc), '버스 캐시 화면 10분');
  });
  await t('s174: 처음 그릴 때 정류장만(0.3초)·전체(서버가 도착정보까지) 두 요청을 동시에 · 늦은 정류장만 화면은 버린다 · 전체가 실패하면 예전처럼', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), np = fs.readFileSync(N('NetPost.java'), 'utf8');
    assert.ok(/final boolean dual = round == 0 && wtxt\.length\(\) == 0 && "bus"\.equals\(modeNow\) && !busRefreshing/.test(a) && /map\.svb = 3500; jf = map\.bodyRequest/.test(a) && /"shell-mapfull"/.test(a), '동시에 두 요청(전체는 svb 3500)');
    assert.ok(/if \(dual && st\[2\]\) return;/.test(a) && /mapBodyApply\(v, keep \|\| st\[0\], round, my, txt, false\)/.test(a) && /if \(st\[0\] && !map\.busNeed\.isEmpty\(\)\) fetchBusNeed/.test(a), '늦은 정류장만 화면 버림 · 전체 성공이면 그 화면 · 실패면 기기가 이어 받는다');
    assert.ok(/private void mapBodyApply\(/.test(a) && /if \(deferNeed\) return;/.test(a) && /NetPost\.get\(ShellCore\.BASE \+ "\/health"/.test(a), '응답 반영 분리 · 엔진 연결도 미리');
    assert.ok(/ALT_GATE = new java\.util\.concurrent\.Semaphore\(4\)/.test(np) && /isAlt \? ALT_GATE : BUS_GATE/.test(np), '두 번째 길은 줄을 따로(8곳 동시)');
    const w = fs.readFileSync(path.join(__dirname, '..', 'engine', 'map-worker.js'), 'utf8');
    assert.ok(/헤지/.test(w) && /setTimeout\(function \(\) \{ r\(null\); \}, 700\)/.test(w), '서버 헤지(0.7초)');
  });
  await t('s172: 공공데이터 키 두 개를 두 길(버스 서버 · route-v2 /bus-tago)로 반반 · 정류장 목록은 동시에 · 가까운 역 팝업 미리', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), np = fs.readFileSync(N('NetPost.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/public static Res getBus2\(/.test(np) && /private static Res race\(/.test(np) && /altOff = true/.test(np) && /r\.status == 404/.test(np), 'getBus2: 두 길 · 동시(race) · 404면 그 길을 끈다');
    assert.ok(/public static String busAltUrl\(/.test(mc) && /\/bus-tago\?url=/.test(mc) && /public static NetPost\.Res busGet\(/.test(mc) && /& 1/.test(mc) && /\[af\]\[0-9\]\{1,3\}/.test(mc), 'MapCore.busGet: 도착정보는 번호 짝·홀로 반반 · 나머지는 동시');
    assert.ok(/private boolean pfNearStnRun\(/.test(a) && /g\.gps = new double\[\]/.test(a) && /g\.tapStation\(g\.nearName\)/.test(a) && /stnCachePut\(json, txt\)/.test(a) && (a.match(/pfNearStnRun\(ll, theme\)/g) || []).length >= 2, '가까운 역 팝업 미리받기: 켤 때 · 위치가 잡힐 때');
  });
  await t('s171: 맛집 · 쇼핑 · 지방 노선도까지 켜자마자 미리 · 위치가 늦게 잡혀도 다시 맞춘다 · 서버 두 키 반반', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    assert.ok(/private double\[\] pfLL\(\)/.test(a) && /lastLocFresh\(store, 6L \* 3600000L/.test(a) && /final double\[\] ll = pfLL\(\);/.test(a), '켤 때 위치가 아직 없으면 마지막으로 안 위치(6시간 안)로 미리 받는다');
    assert.ok(/pfAdd\(1, new PfJob\(\) \{ @Override public boolean run\(\) throws Exception \{ return pfFoodRun\(ll, dName, dLa, dLo\); \} \}\)/.test(a) && /pfAdd\(1, new PfJob\(\) \{ @Override public boolean run\(\) throws Exception \{                \/\/ 쇼핑/.test(a) && /w >= 3 \|\| pfQueue\.isEmpty\(\)/.test(a), '맛집 · 쇼핑은 대화방보다 앞순서 · 일꾼 3');
    assert.ok(/private boolean pfFoodRun\(/.test(a) && /needGps\(\)\) \{ if \(ll != null\) pfFood\.setGps/.test(a) && /synchronized \(pfFood\)/.test(a), '맛집: 도착지 전에는 현위치');
    assert.ok(/saveLoc\(Location l\)[^\n]*warmLocTabs\(/.test(a) && /private void warmLocTabs\(/.test(a) && /180000L/.test(a), '위치가 잡히면 맛집 · 버스 노선도를 다시 맞춘다(3분에 한 번)');
    assert.ok(/"busan", "daegu", "gwangju", "daejeon"/.test(a) && /gm\.bodyRequest\(ShellCore\.CAP, theme\)/.test(a), '지방 노선도(부산 · 대구 · 광주 · 대전)도 미리');
    const mw = fs.readFileSync(path.join(__dirname, '..', 'engine', 'map-worker.js'), 'utf8');
    assert.ok(/function mapSvAttempts\(/.test(mw) && /ks\.slice\(1\)\.concat\(ks\.slice\(0, 1\)\)/.test(mw) && /handleBusSplitTest/.test(mw), '서버: 두 키 반반 · 실측 주소');
  });
  await t('s199: 버스 이웃 정류장 · 바꾼 ID · 경유노선(덤) — 못 받아도 갱신을 버리지 않는다 · 번호 순서 바꿈에 같이 옮긴다 · 정류장 목록이 달라지면 경유노선을 비운다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/THRU_KEY = "\[tu\]\[0-9\]\{1,3\}"/.test(mc) && /public static boolean coreKey\(String k\)/.test(mc), '도착정보 열쇠 a·f·g·h · 경유노선 t·u · 꼭 받을 본문 a·f');
    assert.ok((a.match(/MapCore\.coreKey\(/g) || []).length >= 5, '못 받은 덤(g·h·t·u)은 갱신 실패로 세지 않는다');
    assert.ok(/permuteKeys\(m, perm, "g", 4\)/.test(mc) && /permuteKeys\(m, perm, "t", 1\)/.test(mc), '끌어서 순서를 바꾸면 이웃(4칸)·경유노선도 같이 옮긴다');
    assert.ok(/k\.matches\("tp\|gg\|tn\|d1"\)[^\n]*THRU_KEY/.test(mc) && /k\.matches\(THRU_KEY\) && \(body == null \|\| body\.length\(\) == 0\)/.test(mc), '정류장 목록이 바뀌면 경유노선을 비우고, 못 받은 경유노선은 저장하지 않는다');
  });
  await t('s199: 커뮤니티 좌우 밀기(웹 _commSwipeStep) — 판정값은 웹 그대로 · 순서는 엔진 칩에서 읽는다 · 넘어갈 때 24dp 슬라이드+페이드 0.34초', () => {
    const sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sc = fs.readFileSync(N('ShellCore.java'), 'utf8');
    assert.ok(/SW_MIN_DP = 32f, SW_OFF_DP = 80f/.test(sv) && /Math\.abs\(sdx\) >= SW_MIN_DP \* dpr/.test(sv) && /ay9 > SW_OFF_DP \* dpr && ay9 > ax9/.test(sv), '웹 판정값: 32px 넘게 밀면 넘김 · 세로로 80px 넘게 벗어나면 스크롤로 되돌린다');
    assert.ok(/adx > ady \* SW_LOCK && swipeHost\.canSwipe\(\)\) \{ mode = 9;/.test(sv) && /else if \(mode == 9\) \{ swOx = swShift;/.test(sv) && /if \(mode == 9\) \{/.test(sv) && !/\(mode == 3 \|\| mode == 1\) && !fabDown/.test(sv), 's200: 가로로 먼저 움직이면 가로로 잠가(mode 9) 세로 스크롤을 멈춘다 — 비스듬히 밀어도 목록이 위아래로 흔들리지 않는다 · 스크롤 중에는 넘김이 안 된다');
    assert.ok(/sdx < 0f \? -1 : 1/.test(sv) && /oi\[0\] - dir/.test(a) && /ti\[0\] - dir/.test(a) && /canSwipe\(\) \{ String ct = ShellCore\.currentTab\(store\); return "community"\.equals\(ct\) \|\| "shop"\.equals\(ct\)/.test(a), 's200: 손가락을 오른쪽으로 밀면(dx>0 → dir +1) 왼쪽 칸 · 왼쪽으로 밀면 오른쪽 칸');
    assert.ok(/swBlock = swipeHost == null \|\| inHead \|\| inBand \|\| inFoot/.test(sv) && /K_BUTTON \|\| pressed\.kind == ScreenCore\.K_FIELD/.test(sv), '웹 _swipeBlocked: 칩 줄 · 가로 영역 · 단추 · 입력칸에서 시작한 몸짓은 무시');
    assert.ok(/SLIDE_DP = 24f/.test(sv) && /SLIDE_MS = 340L/.test(sv) && /PathInterpolator\(0\.22f, 0\.8f, 0\.3f, 1f\)/.test(sv) && /saveLayerAlpha\(/.test(sv), '웹 ltSlideIn: 24px · 0.34초 · cubic-bezier(.22,.8,.3,1)');
    assert.ok(/private boolean commSwipe\(int dir\)/.test(a) && /body\.chipActs\(oi\)/.test(a) && /head\.chipActs\(ti\)/.test(a) && /news && dir == -1\) return true/.test(a) && /ShellCore\.NEWS_FIRST : ShellCore\.NEWS_LAST/.test(a), '실시간소통·뉴스는 안쪽 칩 먼저 · 뉴스 끝에서 왼쪽은 멈춤 · 뉴스로 들어올 때 첫/마지막 카테고리');
    assert.ok(/"shop"\.equals\(ShellCore\.currentTab\(store\)\) && \(dir == -1 \|\| dir == 1\)/.test(a) && /si\[0\] - dir/.test(a) && /sx < cats\.length\) \{ body\.slideNext\(dir\); hostBody\.handle\(cats\[sx\], false\)/.test(a), 's224: 쇼핑 탭도 좌우 밀기 — 카테고리 칩을 한 칸씩 · 양 끝에서 멈춤');
    assert.ok(/followChip = true;/.test(sv) && /private void followOnChip\(\)/.test(sv) && /if \(followChip\) followOnChip\(\);/.test(sv) && /if \(!followChip\) scrollX = 0f/.test(sv) && /flingX\.startScroll\(Math\.round\(scrollX \* dpr\)/.test(sv), 's224: 밀어서 카테고리가 바뀌면 위 칩 줄이 켜진 칩을 가운데로 따라간다(부드럽게 0.26초 · 처음으로 튀지 않음)');
    assert.ok(/mkBack/.test(sv) && /back > 0\.01f && back <= Math\.max\(24f, Math\.abs\(k\.x1 - k\.x0\)\) \* 0\.5f && \+\+mkBack < 3\) return;/.test(sv) && /mkBack = 0;/.test(sv), 's225: 마커 역주행 가드 — 역에 서 있을 때 GPS 흔들림으로 되돌아가는 작은 값(반 구간 이하)은 두 번까지 무시, 세 번 이어지면 받아들인다');
    { const np = fs.readFileSync(N('NetPost.java'), 'utf8'), ga = fs.readFileSync(N('GdmApp.java'), 'utf8'), wc = fs.readFileSync(N('WidgetCore.java'), 'utf8');
      assert.ok(/setRequestProperty\("X-Gdm-Id", id\)/.test(np) && /public static volatile String iid/.test(np) && /NetPost\.iid = loadIid\(app\)/.test(ga) && /UUID\.randomUUID\(\)\.toString\(\)\.replace\("-", ""\)/.test(ga) && /X-Gdm-Id/.test(wc), 's226: 요청마다 설치 때 만든 무작위 기기 번호(X-Gdm-Id)를 싣는다 — 공유 IP 의 다른 사용자와 한도가 섞이지 않게');
      assert.ok(/retryable\(r\.status, r\.retryS\)/.test(np) && /code == 429 \|\| code == 503/.test(np) && /sendOnce\(method, url, body, timeoutMs, etag\)/.test(np), 's226: 429 · 503(Retry-After 3초 이하)이면 사용자는 모르게 한 번만 다시 보낸다'); }
    const nw = fs.readFileSync(path.join(__dirname, '..', 'engine', 'news.js'), 'utf8'), cats = /var NW_CATS = \[([^\]]*)\]/.exec(nw)[1].split(',').map(x => x.replace(/['\s]/g, ''));
    assert.ok(sc.indexOf('NEWS_FIRST = "' + cats[0] + '", NEWS_LAST = "' + cats[cats.length - 1] + '"') > 0, '뉴스 처음·마지막 카테고리 이름이 엔진 목록과 같다');
  });
  await t('s200: 버스 정류장이 다른 탭을 다녀와야 나오던 일 — 엔진과 주고받는 바퀴 한도(3)가 이웃·바꾼 ID·방면으로 길어진 체인보다 짧아 마지막 그림을 버렸다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/BUS_ROUNDS = 8/.test(mc) && /public boolean needOptionalOnly\(\)/.test(mc) && /matches\("r\[0-9\]\{1,3\}"\)/.test(mc), '바퀴 한도 8 · 남은 것이 방면 목록(r)뿐이면 완성된 화면');
    assert.ok(/round >= MapCore\.BUS_ROUNDS \|\| map\.needOptionalOnly\(\)/.test(a) && /round < MapCore\.BUS_ROUNDS\) fetchBusNeed\(/.test(a), '앱: 방면만 남았거나 바퀴가 끝나면 지금 화면을 그린다 · 한도까지 계속 받는다');
    assert.ok(!/round < 3\) fetchBusNeed|round < 4; round\+\+\) \{\s*NetPost\.Res (br|r) = NetPost\.post\(ShellCore\.BASE \+ "\/screen\/map", (pfMap|w)\.bodyRequest/.test(a) && (a.match(/MapCore\.BUS_ROUNDS/g) || []).length >= 5, '미리 받기 · 조용한 새로고침도 같은 한도');
  });
  await t('s200: 첫 구간이 버스면 10분 안에 오는 버스를 고르는 팝업 — 엔진이 목록·카드를 만들고 앱은 띄워서 고른 번호의 도착 시각을 시작 엔진에 돌려준다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), rc = fs.readFileSync(N('RideCore.java'), 'utf8');
    assert.ok(/\/ride\/buspick/.test(a) && /tp\.join\(5000\)/.test(a) && /startOk && pick\.length\(\) > 0\) \{ busPickAsk\(/.test(a), '시작 요청과 동시에 /ride/buspick 을 보내고 고를 것이 있을 때만 카드');
    assert.ok(/private void busPickAsk\(/.test(a) && /Boolean\.TRUE\.equals\(m\.get\("ask"\)\)/.test(a) && /get\("items"\) instanceof List/.test(a) && /RideCore\.startBody\(ShellCore\.CAP, facts, off, pfl, ms\.get\(ix\)\)/.test(a), '카드와 함께 온 info.items 의 ms 를 읽어 고른 번호의 도착 시각을 그대로 돌려준다');
    assert.ok(/v\.startsWith\("dl\.bp\."\)/.test(a) && /dlgPick = Integer\.parseInt\(v\.substring\(6\)\)/.test(a) && /if \(!shown\) rideCommit\(txt0, rid\)/.test(a) && /private void rideCommit\(final String txt, final int rid\)/.test(a), '단추 dl.bp.N → 번호 · 카드를 못 띄우면 예전처럼 바로 시작');
    assert.ok(/pickMs > 0L/.test(rc) && /\\"pick\\":\{\\"ms\\":/.test(rc), '시작 본문에 r.pick.ms');
  });
  await t('s199: TAGO 줄 방면("→ ○○방향") — 큰 노선 목록은 기기에 두지 않고 이름만(info.nx) 저장해 요청에 실어 보낸다 · 서버는 기다리지 않는다', () => {
    const mc = fs.readFileSync(N('MapCore.java'), 'utf8'), w = fs.readFileSync(path.join(__dirname, '..', 'engine', 'map-worker.js'), 'utf8');
    assert.ok(/K_BNX = "bnx"/.test(mc) && /private void nxTake\(/.test(mc) && /append\(",\\"nx\\":"\)\.append\(nxJson\(\)\)/.test(mc) && /im\.get\("nx"\) instanceof Map\) nxTake/.test(mc), '엔진이 준 info.nx 를 저장하고 다음 요청 bus.nx 로 보낸다');
    assert.ok(/matches\("r\[0-9\]\{1,3\}"\)\) ri\.remove\(\)/.test(mc), '노선 경유 정류장 목록(r)은 엔진이 쓴 뒤 바로 버린다');
    assert.ok(/\^r\[0-9\]/.test(w) && /break;\s*\/\/ s199/.test(w), '서버(mapSvResolve)는 r 열쇠를 기다리지 않는다');
  });
  await t('s201: 경로 결과가 새로 조회돼도 화면 전체를 다시 시작하지 않는다 — 같은 찾기의 새 응답은 바꿔 끼우고(탭·펼침 그대로) 내용이 바뀐 칸만 스프링으로 나타난다', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8');
    assert.ok(/boolean on = shown;/.test(a) && /postRoute\(my, b1, a, b, bt, rb, full1 \? sk : null, on\); on = true;/.test(a) && /postRoute\(my, b2, a, b, bt, rb, sk, on\)/.test(a), '이미 이 찾기의 결과가 떠 있으면(옛 결과 · 근사 결과) 다음 응답은 바꿔 끼우기');
    assert.ok(/if \(replace && home\.hasRoute\(\)\) \{/.test(a) && /home\.replaceRouteSame\(raw, rb\)/.test(a) && /body\.springChanges\(5000L\)/.test(a) && /home\.replaceRoute\(nb\)\) \{ ShellActivity\.this\.body\.springChanges\(5000L\)/.test(a), '바꿔 끼울 때 setRoute(탭·펼침 초기화) 대신 replaceRouteSame · 5초 안의 새 화면은 바뀐 칸만 스프링');
    assert.ok(/public long sp;/.test(sc) && /private static String itemFp\(/.test(sv) && /private void markChanged\(/.test(sv) && /fresh \* 2 > total\) return;/.test(sv), '칸마다 내용 지문 · 이전에 없던 칸만 표시 · 절반 넘게 새것이면(다른 화면) 표시 안 함');
    assert.ok(/if \(keepScroll && lay != null && nowSp < spUntil\)/.test(sv) && /if \(spOld != null\) markChanged\(spOld, nowSp\)/.test(sv) && /private void drawItem0\(/.test(sv) && /SP_MS = 520f/.test(sv) && /-10f \* \(1f - spring\(f\)\)/.test(sv) && /\|\| bcAnim \|\| arAnim \|\| spAnim \|\|/.test(sv), '스프링: 위에서 10dp · 0.52초 · 바뀐 칸만 그리고 끝날 때까지 다시 그린다');
    const w = fs.readFileSync(path.join(__dirname, '..', 'engine', 'route-v2-worker.ascii.js'), 'utf8');
    assert.ok(/var LIVE_BUDGET_MS = 5000;/.test(w), '서버 실시간 대기 한도 5초');
  });
  await t('s202·s203: 버스 카드 이름 옆 방향 글(lmt) · 안내 줄 다시 시도(rt) · 실패 신호(fl) — 앱은 그리기와 신호만', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), sc = fs.readFileSync(N('ScreenCore.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/n\.lm = optStr\(m, "lm"/.test(sc) && /public String lmt = "";/.test(sc) && /it\.lmt = lt;/.test(sc) && !/it\.t2 = lt;/.test(sc), '방향 글은 t2(안내 줄 글)와 따로 lmt 에 둔다 — 안내 줄과 함께 있어도 안 덮는다');
    assert.ok(/it\.lmt\.length\(\) > 0\) \{ setText\(ScreenCore\.BC_LM, true, pal\[R_GOLD\]\)/.test(sv) && /append\(q\.lmt\)/.test(sv), '금색 굵게 11 로 그리고 지문에 넣는다');
    assert.ok(/n\.ract = act\(m\.get\("rt"\), false\)/.test(sc) && /z2\[12\]/.test(sc) && /it\.za\.length > 3 && it\.za\[3\] != null/.test(sv), "안내 줄 '다시 시도 ›' 누르는 자리는 네 번째 칸");
    assert.ok(/public boolean busFailShow;/.test(mc) && /"mp\.rt"\.equals\(v\)/.test(mc) && /busFailShow \? ",\\"fl\\":1" : ""/.test(mc), '요청에 fl · mp.rt 는 도착정보·경유노선만 비운다');
    assert.ok(/map\.busFailShow = busRetryN >= 3;/.test(a) && /case MapCore\.R_BUS_REF: busRetryN = 0;/.test(a), '자동 재시도 세 번 뒤에만 실패로 그린다 · 다시 시도는 횟수를 처음부터');
  });
  await t('s205: 미리받기 — 맛집(도착지·위치 확정 · 장소별 열쇠 · 호출 한도) · 호선 방 밀기(앞뒤 방 미리 · 뼈대 · 디바운스 · 캐시 120)', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8');
    assert.ok(/size\(\) > 120; if \(over\) scrKeys\.remove/.test(a) && /return size\(\) > 48; \}/.test(a), '화면 캐시 120 · 읽어 둔 화면 48(미리 받은 화면이 밀려나지 않게)');
    assert.ok(/if \(ShellCore\.S_FOOD\.equals\(screen\)\) foodSyncSig\(\);/.test(a) && /private void foodSyncSig\(\)/.test(a) && /ShellCore\.K_FOODSIG/.test(a), '맛집을 열 때 장소 표시를 맞춘다');
    assert.ok(/FOOD_PF_FRESH_MS = 30L \* 60000L/.test(a) && /FOOD_PF_GPS_GAP_MS = 10L \* 60000L/.test(a) && /cacheAge\(key\) < FOOD_PF_FRESH_MS\) return false/.test(a) && /prefetchPut\(key, r2\.body, false\)/.test(a), '맛집 미리받기: 같은 장소 30분 · 위치 기반은 10분에 한 번(공공데이터 호출 보호)');
    assert.ok(/private void foodWatch\(\)/.test(a) && /deb\.trailing\("foodwarm", 1200L/.test(a) && /foodWatchStart\(\); resumed = true|resumed = true; foodWatchStart\(\)/.test(a) && /if \(!resumed\) return; foodWatch\(\);/.test(a), '도착지가 정해지면 1.2초 뒤 맛집을 미리 받는다(켜져 있을 때만 확인)');
    assert.ok(/deb\.trailing\("chatsel", 220L/.test(a) && /if \(!shown\) showSkeleton\(body, ShellCore\.S_CHAT\)/.test(a) && /private void chatWarmSoon\(\)/.test(a) && /new int\[\] \{ 1, -1, 2, -2 \}/.test(a) && /CHAT_NEAR_FRESH_MS = 45000L/.test(a) && /private boolean pfChatRoom\(/.test(a), '호선 방 밀기: 뼈대 먼저 · 연달아 밀면 마지막만 받기 · 앞뒤 2칸 미리');
  });
  await t('s206: 맛집 공공데이터 — 공유 저장소(/food-pub) 먼저, 실패하면 예전 3쪽 직접', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), f = fs.readFileSync(N('FoodCore.java'), 'utf8');
    assert.ok(/public String sharedUrl\(\) \{ return ShellCore\.BASE \+ "\/food-pub\?lat="/.test(f), '공유 저장소 주소');
    assert.ok(/private List<String> foodPubPages\(String shared, String\[\] pu\)/.test(a) && /NetPost\.get\(shared, 9000\)/.test(a) && /FoodCore\.pageCount\(sr\.body\) >= 0\) \{ out\.add\(sr\.body\); return out; \}/.test(a), '공유 저장소에서 한 번 받고 읽히면 그것으로 끝');
    assert.ok(/res\[ii\] = NetPost\.get\(pu\[ii\], 10000\)/.test(a), '못 받으면 예전처럼 공공 서버 3쪽을 동시에');
    assert.ok(/foodDataNow\(su, pfFood\.sharedUrl\(\), pu\)/.test(a) && /foodPubPages\(shared, pu\)/.test(a) && /final String shared = food\.sharedUrl\(\);/.test(a), '미리받기 · 맛집 탭 모두 공유 저장소를 먼저 쓴다');
    assert.ok(/if \(tp\.isAlive\(\) && sbody\.length\(\) > 0\) foodStage/.test(a), '서버 가게 먼저 그리는 1단계는 그대로');
  });
  await t('s207: 앱이 하던 판단을 엔진으로 — 공휴일(now만 보냄) · 별 한도/문구 · 토스트 문구 · 후보 검색(/suggest 먼저) · 출퇴근 auto', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), m = fs.readFileSync(N('MapCore.java'), 'utf8'), h = fs.readFileSync(N('HomeCore.java'), 'utf8'), hs = fs.readFileSync(N('HomeSearchCore.java'), 'utf8');
    assert.ok(/\\"now\\":" \+ env\.nowMs/.test(h) && !/\.hol\b/.test(h) && !/DAY_OF_WEEK/.test(a.slice(a.indexOf('homeEnv'), a.indexOf('homeEnv') + 900)), '홈: 평일/휴일은 앱이 계산하지 않는다(now만 보냄)');
    assert.ok(/private void toastTx\(String m\) \{ if \(m != null && m\.length\(\) > 0\) toast\(m\); \}/.test(a) && /toastTx\(MapCore\.fill\(map\.msgS, map\.pickName\)\)/.test(a) && /toastTx\(map\.msgSame\)/.test(a), '지도 고르기 토스트는 엔진 문구를 채워 쓰기만');
    assert.ok(/favMax = 12/.test(m) && /info\.favp|"favp"/.test(m) && /static String fill\(/.test(m), '별 한도·문구는 엔진 info.favp (없으면 예전 값)');
    assert.ok(/private NetPost\.Res suggestGet\(String kind, String q, String directUrl\)/.test(a) && /suggestUrl\(/.test(a) && /suggestGet\("b", q, HomeSearchCore\.busUrl/.test(a) && /suggestGet\("p", q, HomeSearchCore\.placeUrl/.test(a), '후보 검색: 엔진 /suggest 먼저, 안 되면 예전 직접 주소');
    assert.ok(/"\/suggest\?k="/.test(hs), '/suggest 주소');
    assert.ok(/final String kind = "auto";/.test(a), '출퇴근 브리핑 종류는 엔진이 시각으로');
  });
  await t('s208: 즐겨찾기 — 현재 경로 역의 노선 힌트(sl·dl)를 엔진에 알린다(같은 이름 지방 역 구분은 엔진)', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), f = fs.readFileSync(N('FavCore.java'), 'utf8');
    assert.ok(/public String request\(int cap, String theme, String curS, String curD, String curSL, String curDL\)/.test(f) && /\.append\(",\\"sl\\":"\)\.append\(ShellCore\.q\(curSL == null \? "" : curSL\)\)/.test(f), '요청에 노선 힌트');
    assert.ok(/final HomeCore\.Loc favLa = home\.loc\[HomeCore\.START\]/.test(a) && /"subway"\.equals\(favLa\.type\) && favLa\.name\.equals\(favA\) \? favLa\.line : ""/.test(a), '지하철 역으로 정한 곳의 노선만 보낸다(이름이 다르면 빈 글)');
  });
  await t('s208: 시간표 요일·방면 한 줄(엔진) · 켜진 전체 칩이 보인다 · 권역(reg·sl)을 엔진에 보낸다', () => {
    const sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), mc = fs.readFileSync(N('MapCore.java'), 'utf8');
    assert.ok(/boolean plainOn = it\.on && it\.plain;/.test(sv) && /int fg = plainOn \? onFill/.test(sv) && /if \(plainOn\) \{ p\.setStyle\(Paint\.Style\.FILL\); p\.setColor\(onFill\)/.test(sv), '바탕 없는 켜진 칩(전체)은 칩 색 글자 + 밑줄 — 흰 글자가 배경에 묻히지 않는다');
    assert.ok(/\\"reg\\":" \+ ShellCore\.q\(reg\(\)\)/.test(mc) && /append\(",\\"sl\\":"\)\.append\(ShellCore\.q\(stnLine\)\)\.append\(",\\"reg\\":"\)\.append\(ShellCore\.q\(reg\(\)\)\)/.test(mc), '역 팝업·시간표 요청에 권역(reg)과 고른 노선(sl)을 싣는다 — 같은 이름의 지방 역 노선이 섞이지 않게(판단은 엔진)');
  });
  await t('s216: 하단 토스트 없음 · 포인트 코드 없음 · 현위치 동 이름 브리핑 · 쇼핑 그림 미리 받기', () => {
    const a = fs.readFileSync(N('ShellActivity.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8');
    const all = fs.readdirSync(path.join(__dirname, '..', 'native', 'shell')).filter(f => f.endsWith('.java')).map(f => fs.readFileSync(N(f), 'utf8')).join('\n');
    assert.ok(/private void toast\(String m\) \{ \}/.test(a) && !/Toast\.makeText/.test(all) && !/import android\.widget\.Toast;/.test(a), '하단 토스트는 어디에서도 띄우지 않는다');
    assert.ok(!/rulesAward|applyAward|awardBody|K_PT\b|mk_pt|mk_today|K_DAY\b|totalOf\(/.test(all), '포인트(적립 · 저장값 · 날짜) 코드가 앱에 없다');
    assert.ok(!/포인트/.test(all.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), '화면에 보이는 포인트 문구가 없다');
    assert.ok(/private void hcEnsureDong\(\)/.test(a) && /HcardsCore\.dongUrl\(HomeSearchCore\.DEFAULT_BASE, la, lo\)/.test(a) && /HcardsCore\.parseDong\(r\.body\)/.test(a), '위치를 알면 동 이름을 서버에 묻는다');
    assert.ok(/hc\.dongLoad\(store\.get\(HcardsCore\.K_DONG, ""\)\)/.test(a) && /store\.put\(HcardsCore\.K_DONG, hc\.dongSaved\(\)\)/.test(a), '동 이름을 저장해 다음 실행에서 바로 쓴다');
    assert.ok(/pollRide\(\);\s*hcEnsureDong\(\);/.test(a) && /hcFixFrom[\s\S]{0,600}hcEnsureDong\(\)/.test(a), '홈이 보이는 동안 5초마다 · 위치가 잡힐 때마다 확인(30초에 한 번만 묻는다)');
    assert.ok(/lastLocFresh\(store, 24L \* 3600000L, now\)/.test(a), '마지막 위치(하루 안)로 먼저 브리핑을 채운다');
    assert.ok(/private String shopCall\(String ck, String cat\) \{\s*String t = shopCall0\(ck, cat\);\s*shopWarm\(t\);/.test(a) && /ScreenView\.ImageBank\.warm\(this, ScreenCore\.imageUrls\(txt, 240\)\)/.test(a) && /shopWarm\(src\);/.test(a), '쇼핑 화면을 받을 때마다 상품 그림도 뒤에서 받아 둔다');
    assert.ok(/static void warm\(Context c, java\.util\.List<String> urls\)/.test(sv) && /private static File fetch\(String url\)/.test(sv) && /newFixedThreadPool\(2,/.test(sv) && /MIN_PRIORITY \+ 1/.test(sv), '그림 미리 받기: 파일만 · 동시 2개 · 낮은 우선순위');
  });
  await t('s217: 경로 통합 카드 — 알약 줄(tags, 규격 25) · AI 승무원이 경로 카드 안으로 합쳐짐(fuseAi) · 엔진은 규격 25부터만 쓴다', () => {
    const sc = fs.readFileSync(N('ScreenCore.java'), 'utf8'), sv = fs.readFileSync(N('ScreenView.java'), 'utf8'), shc = fs.readFileSync(N('ShellCore.java'), 'utf8');
    assert.ok(/K_TAGS = 49/.test(sc) && /"tags"\.equals\(t\)/.test(sc) && /"tags"\.equals\(n\.t\)/.test(sc), 'tags 노드를 읽고 배치한다');
    assert.ok(/case ScreenCore\.K_TAGS: drawTags\(cv, it\)/.test(sv) && /private void drawTags\(Canvas cv, ScreenCore\.Item it\)/.test(sv) && !/drawTags[\s\S]{0,900}new (Paint|RectF|Path)/.test(sv), 'tags 를 그린다(그릴 때 새 객체 없음)');
    assert.ok(/CAP = 25/.test(shc) && /static void fuseAi\(List<Object> body\)/.test(shc) && /"ai"\.equals\(\(\(Map<String, Object>\) o\)\.get\("into"\)\)/.test(shc) && /fuseAi\(body\);/.test(shc), '화면을 이어 붙일 때 AI 카드를 자리로 옮긴다');
    const hc = fs.readFileSync(path.join(ROOT, 'engine', 'hcards.js'), 'utf8'), rs = fs.readFileSync(path.join(ROOT, 'engine', 'result.js'), 'utf8'), rh = fs.readFileSync(path.join(ROOT, 'engine', 'rhead.js'), 'utf8');
    assert.ok(/HC_FUSE_CAP = 25/.test(hc) && /RES_TAGS_CAP = 25/.test(rs) && /Number\(inp\.cap\) < 25/.test(rh), '엔진은 규격 25부터만 합친다(옛 앱은 예전 모양)');
  });
  console.log(`\n${pass} 통과 / ${fail} 실패 / ${skipped} 건너뜀`);
  process.exit(fail ? 1 : 0);
})();
