// 네이티브 장면(Kotlin/Compose Canvas + 햅틱) 검증 — 2026-10-16
//   원칙: "계산은 엔진이, 그림은 앱이". 이 시험은 엔진(engine/scene.js)이 만든 /scene 답을 네이티브 코어가 그대로 받아 그리는지 본다.
//   ① 순수 자바 코어(SceneCore 등 — android.* 없음)를 JVM 에서 컴파일하고 자체 점검(java SceneJvmTest check) 통과
//        엔진 답 14종 × 작은 폰 크기(360x120·300x150 …) 60초 · 6종 캐릭터 동작/착지 연출 · 꾹 눌러 옮기기(스크롤과 구분) · 진동 이름 · 주사율 정책
//   ② 코어는 안드로이드·네트워크에 손대지 않는다(계산은 엔진, 코어는 받은 것만 그린다)
//   ③ 진동 무늬표: 코어가 알리는 모든 이름에 무늬가 있다
//   ④ 안드로이드 계층(AndroidCv·SceneDriver·SceneHost·SceneNativePlugin)을 진짜 android.jar 로 컴파일 — jar 가 없으면 건너뛴다
//        (CI 의 ubuntu 러너엔 Android SDK 가 있어 돌고, 로컬은 ANDROID_JAR=… 로 지정). Kotlin(SceneCompose.kt)은 KOTLINC 가 있으면 스텁 Compose 로 컴파일.
//   ⑤ Gradle 주입 스크립트(Kotlin+Compose)가 Capacitor 템플릿 모양에서 올바르게·여러 번 돌려도 같게 동작
//   ⑥ CI 워크플로가 파일을 복사하고 MainActivity·플러그인·터치 전달·Gradle 주입에 연결한다
// 실행: node test/scene_native_java.test.js   (javac · java · python3 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, skipped = 0;
const t = async (name, fn) => { try { const r = await fn(); if (r === 'skip') { skipped++; console.log('  skip ', name); } else { pass++; console.log('  ok  ', name); } } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 1200)); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const JAVA = ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Djava.awt.headless=true'];
const N = n => path.join(ROOT, 'native', n);
const CORE = ['SceneCv', 'SceneUtil', 'SceneModel', 'SceneArt', 'SceneCore', 'SceneActs', 'SceneHaptics'].map(n => N(n + '.java'));
const walk = (d, ext, acc = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, ext, acc); else if (p.endsWith(ext)) acc.push(p); } return acc; };
const which = c => { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.split('\n')[0].trim() : ''; };

function findAndroidJar() {
  if (process.env.ANDROID_JAR && fs.existsSync(process.env.ANDROID_JAR)) return process.env.ANDROID_JAR;
  for (const base of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, '/usr/local/lib/android/sdk'].filter(Boolean)) {
    const pl = path.join(base, 'platforms'); if (!fs.existsSync(pl)) continue;
    const vs = fs.readdirSync(pl).filter(x => /^android-\d+$/.test(x)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
    for (const v of vs) { const j = path.join(pl, v, 'android.jar'); if (fs.existsSync(j)) return j; }
  }
  return '';
}

// 엔진이 만드는 /scene 답을 그대로 장면 JSON 으로 쓴다(앱·네이티브는 판단하지 않는다)
function genScenarios(dir) {
  const E = require(path.join(ROOT, 'engine', 'scene')), decide = E.sceneDecide, ms = s => Date.parse(s + '+09:00');
  const Nn = o => Object.assign({ name: '', isSub: false, isBus: false, isWalk: false, isOrigin: false, lineName: '', hasLoc: true }, o);
  const O = Nn({ name: '출발', isOrigin: true }), W1 = Nn({ name: '도보', isWalk: true });
  const S = (name, line) => Nn({ name, isSub: true, lineName: line || '2호선' }), B = (name, line) => Nn({ name, isBus: true, lineName: line || '6659' });
  const SUB = [O, W1, S('강남'), S('역삼'), S('선릉'), W1], BUS = [O, W1, B('A'), B('B'), B('C'), B('D'), W1];
  const out = {
    idle_noon_clear: decide({ nowMs: ms('2026-10-15T12:30:00'), locked: false }, { temp: 12, rain: 5, txt: '맑음' }),
    idle_night_clear: decide({ nowMs: ms('2026-10-15T22:30:00'), locked: false }, { temp: 9, rain: 0, txt: '맑음' }),
    idle_dawn_snow: decide({ nowMs: ms('2026-12-20T05:10:00'), locked: false }, { temp: -3, rain: 90, txt: '눈' }),
    idle_evening_fog: decide({ nowMs: ms('2026-04-20T18:40:00'), locked: false }, { temp: 14, rain: 10, txt: '안개' }),
    idle_morning_cloudy: decide({ nowMs: ms('2026-07-10T08:40:00'), locked: false }, { temp: 27, rain: 20, txt: '구름많음' }),
    idle_afternoon_overcast: decide({ nowMs: ms('2026-10-15T15:40:00'), locked: false }, { temp: 16, rain: 30, txt: '흐림' }),
    wait_bus_rain: decide({ nowMs: ms('2026-10-15T09:00:00'), locked: true, key: 'k7', here: 1, boarded: false, nodes: BUS }, { temp: 11, rain: 80, txt: '비' }),
    wait_sub_clear: decide({ nowMs: ms('2026-10-15T08:00:00'), locked: true, key: 'k8', here: 1, boarded: false, nodes: SUB }, { temp: 14, rain: 0, txt: '맑음' }),
    wait_bus_night: decide({ nowMs: ms('2026-10-15T23:10:00'), locked: true, key: 'k9', here: 1, boarded: false, nodes: BUS }, null),
    alight_sub: decide({ nowMs: ms('2026-10-15T19:00:00'), locked: true, key: 'k3', here: 5, boarded: true, nodes: SUB }, null),
    alight_bus: decide({ nowMs: ms('2026-10-15T13:00:00'), locked: true, key: 'k4', here: 5, boarded: true, nodes: BUS }, { temp: 20, rain: 0, txt: '맑음' }),
    ride_bus: decide({ nowMs: ms('2026-10-15T10:00:00'), locked: true, key: 'k5', here: 2, boarded: true, nodes: BUS }, { temp: 20, rain: 0, txt: '맑음' }),
    ride_bus_end: decide({ nowMs: ms('2026-10-15T21:20:00'), locked: true, key: 'k6', here: 4, boarded: true, nodes: BUS }, null),
    none_sub_cong: decide({ nowMs: ms('2026-10-15T08:00:00'), locked: true, key: 'k8', here: 3, boarded: true, nodes: SUB }, null)
  };
  for (const k of Object.keys(out)) fs.writeFileSync(path.join(dir, 'scn_' + k + '.json'), JSON.stringify(out[k]));
  return out;
}

(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scn-nj-'));
  const cls = path.join(out, 'cls'), scn = path.join(out, 'scn'); fs.mkdirSync(cls); fs.mkdirSync(scn);
  let scenarios;

  await t('순수 자바 코어 컴파일', async () => {
    const r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-d', cls].concat(CORE, [path.join(__dirname, 'java', 'AwtCv.java'), path.join(__dirname, 'java', 'SceneJvmTest.java')]), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
  });
  await t('엔진(engine/scene.js)이 만든 /scene 답 14종을 장면 JSON 으로 쓴다', async () => {
    scenarios = genScenarios(scn);
    const modes = new Set(Object.values(scenarios).map(r => r.mode));
    assert(modes.has('idle') && modes.has('wait') && modes.has('alight') && modes.has('ride') && modes.has(null), [...modes].join(','));
  });
  await t('자바 자체 점검 전부 통과(장면 14종×작은 폰 크기 · 6종 캐릭터 동작/착지 · 꾹 눌러 옮기기 · 진동 · 주사율 · 결정성)', async () => {
    const r = spawnSync('java', JAVA.concat(['-cp', cls, 'com.dullyyj.subway.SceneJvmTest', 'check', scn]), { env: ENV, encoding: 'utf8', maxBuffer: 1 << 27 });
    const o = (r.stdout || '') + (r.stderr || '');
    const bad = o.split('\n').filter(l => /^FAIL/.test(l) || /Exception/.test(l));
    assert(!bad.length && /ALL OK/.test(o), bad.slice(0, 8).join(' | ') || o.slice(-400));
    const n = (o.match(/^ok /gm) || []).length;
    assert(n >= 150, '점검 항목이 너무 적다: ' + n);
  });

  await t('코어(Scene*.java 중 순수 자바)는 android.*·네트워크에 손대지 않는다 — 계산은 엔진, 코어는 받은 장면만 그린다', async () => {
    const bad = [];
    for (const f of CORE) {
      const s = fs.readFileSync(f, 'utf8');
      if (/import\s+android\./.test(s)) bad.push(path.basename(f) + ': android import');
      if (/java\.net\.|HttpURLConnection|okhttp|WebView|XMLHttpRequest/.test(s)) bad.push(path.basename(f) + ': 네트워크');
    }
    assert(!bad.length, bad.join(', '));
    // 코어가 쓰는 엔진 답 필드만 읽는다: 모르는 장면 종류(mode)를 자기가 만들어 내지 않는다
    const core = fs.readFileSync(N('SceneCore.java'), 'utf8');
    assert(!/\bmode\s*=\s*"(?!idle|wait|ride|alight)/.test(core.replace(/\/\/.*$/gm, '')), '코어가 엔진이 안 준 mode 를 만든다');
  });
  await t('진동: 코어가 알리는 모든 이름(grab·release·land_*·hearts·thud·angry·splash·flap·grin)에 무늬가 있다', async () => {
    const src = ['SceneCore', 'SceneActs'].map(n => fs.readFileSync(N(n + '.java'), 'utf8')).join('\n');
    const emitted = new Set([...src.matchAll(/haptic\("([a-z_]+)"\)/g)].map(m => m[1]));
    ['cotton', 'pose', 'dig', 'flip', 'fly', 'puddle'].forEach(k => emitted.add('land_' + k)); emitted.add('land');
    const table = new Set([...fs.readFileSync(N('SceneHaptics.java'), 'utf8').matchAll(/p\("([a-z_]+)",/g)].map(m => m[1]));
    const miss = [...emitted].filter(n => !table.has(n));
    assert(!miss.length, '무늬 없는 진동 이름: ' + miss.join(','));
    assert(emitted.size >= 12, [...emitted].join(','));
  });

  // ── 안드로이드 계층: 진짜 android.jar 로 컴파일 ──
  const jar = findAndroidJar(), kotlinc = process.env.KOTLINC || which('kotlinc');
  const capOut = path.join(out, 'cap'), ktOut = path.join(out, 'kt'), jOut = path.join(out, 'j');
  fs.mkdirSync(capOut); fs.mkdirSync(ktOut); fs.mkdirSync(jOut);
  const ANDROID_SRC = ['AndroidCv', 'SceneDriver', 'SceneHost', 'SceneNativePlugin'].map(n => N(n + '.java'));
  let kotlinDone = false;
  await t('안드로이드 계층(AndroidCv·SceneDriver·SceneHost·SceneNativePlugin)을 진짜 android.jar 로 컴파일', async () => {
    if (!jar) return 'skip';
    console.log('        android.jar =', jar);
    const capStubs = walk(path.join(__dirname, 'android-stubs', 'com'), '.java');
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', jar, '-d', capOut].concat(capStubs), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, '캐퍼시터 스텁: ' + (r.stderr || '').slice(0, 800));
    let cp = [jar, capOut], extra = [];
    if (kotlinc) {
      const kc = path.dirname(path.dirname(fs.realpathSync(kotlinc)));
      const libs = ['kotlin-stdlib.jar', 'kotlinx-coroutines-core-jvm.jar'].map(j => path.join(kc, 'lib', j));
      if (libs.every(fs.existsSync)) {
        const kts = walk(path.join(__dirname, 'kotlin-stubs'), '.kt').concat([N('SceneCompose.kt')]);
        r = spawnSync(kotlinc, ['-no-stdlib', '-nowarn', '-cp', cp.concat(libs).join(path.delimiter), '-jvm-target', '17', '-d', ktOut].concat(kts, CORE, ANDROID_SRC), { env: ENV, encoding: 'utf8', maxBuffer: 1 << 26 });
        assert.strictEqual(r.status, 0, 'kotlinc: ' + ((r.stdout || '') + (r.stderr || '')).slice(0, 1500));
        cp = cp.concat([ktOut], libs); kotlinDone = true;
      }
    }
    if (!kotlinDone) { const st = walk(path.join(__dirname, 'android-stubs-scene'), '.java'); extra = st; }
    r = spawnSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-deprecation', '-cp', cp.join(path.delimiter), '-d', jOut].concat(CORE, ANDROID_SRC, extra), { env: ENV, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 2000));
    assert(fs.existsSync(path.join(jOut, 'com', 'dullyyj', 'subway', 'SceneNativePlugin.class')));
  });
  await t('코틀린 막(SceneCompose.kt)이 컴파일된다(kotlinc 가 있을 때 — 진짜 Compose 컴파일은 CI 의 gradle 단계)', async () => {
    if (!jar || !kotlinc) return 'skip';
    assert(kotlinDone, 'kotlinc 는 있는데 컴파일 단계를 못 돌렸다');
    assert(fs.existsSync(path.join(ktOut, 'com', 'dullyyj', 'subway', 'SceneCompose.class')));
  });
  await t('안드로이드 계층의 약속: 프레임마다 객체를 새로 만들지 않고, 손가락은 웹뷰를 먹지 않는다, 숨으면 프레임 시계가 꺼진다', async () => {
    const cvSrc = fs.readFileSync(N('AndroidCv.java'), 'utf8');
    // drawPath/drawBitmap 은 Compose 의 nativeCanvas(GPU 기록용)에 한다 — 직접 비트맵에 소프트웨어로 그리는 건 바탕 한 장(ALayer)뿐
    assert(/new Canvas\(bmp\)/.test(cvSrc) && (cvSrc.match(/new Canvas\(/g) || []).length === 1, 'AndroidCv: 소프트웨어 Canvas 는 바탕 비트맵(ALayer) 하나뿐이어야 한다');
    const host = fs.readFileSync(N('SceneHost.java'), 'utf8');
    assert(/dispatchTouchEvent[\s\S]{0,80}return false/.test(host) && /onTouchEvent[\s\S]{0,80}return false/.test(host), 'SceneHost 가 손가락을 삼킨다');
    const pl = fs.readFileSync(N('SceneNativePlugin.java'), 'utf8');
    assert(/SceneCompose\.hide\(compose\)/.test(pl) && /ACTION_CANCEL/.test(pl) && /static boolean route\(MotionEvent/.test(pl), '숨김 때 프레임 시계 정지·웹뷰 CANCEL·route 가 있어야 한다');
    const kt = fs.readFileSync(N('SceneCompose.kt'), 'utf8');
    assert(/withFrameNanos/.test(kt) && /drawIntoCanvas/.test(kt) && /nativeCanvas/.test(kt) && /androidx\.compose\.foundation\.Canvas/.test(kt), 'Compose Canvas + 프레임 시계를 써야 한다');
    assert(!/Random|Math\.random|fetch|http/i.test(kt), 'Kotlin 막에는 계산·통신이 없어야 한다');
  });

  // ── Gradle 주입 스크립트 ──
  const ROOT_GRADLE = `// Top-level build file where you can add configuration options common to all sub-projects/modules.

buildscript {

    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.2.1'
        classpath 'com.google.gms:google-services:4.4.0'

        // NOTE: Do not place your application dependencies here; they belong
        // in the individual module build.gradle files
    }
}

apply from: "variables.gradle"
`;
  const APP_GRADLE = `apply plugin: 'com.android.application'

android {
    namespace "com.dullyyj.subway"
    compileSdk rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.dullyyj.subway"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
}

repositories {
    flatDir{
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
}

apply from: 'capacitor.build.gradle'

try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
`;
  const CAP_GRADLE = `android {
  compileOptions {
      sourceCompatibility JavaVersion.VERSION_17
      targetCompatibility JavaVersion.VERSION_17
  }
}
`;
  const mkTemplate = () => {
    const d = fs.mkdtempSync(path.join(out, 'tpl-')); fs.mkdirSync(path.join(d, 'app'));
    fs.writeFileSync(path.join(d, 'build.gradle'), ROOT_GRADLE); fs.writeFileSync(path.join(d, 'app', 'build.gradle'), APP_GRADLE);
    fs.writeFileSync(path.join(d, 'app', 'capacitor.build.gradle'), CAP_GRADLE); fs.writeFileSync(path.join(d, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx1536m\nandroid.useAndroidX=true\n');
    return d;
  };
  const inject = d => spawnSync('python3', ['-I', N('inject_kotlin_compose.py'), d], { encoding: 'utf8' });
  await t('Gradle 주입: Capacitor 템플릿에 Kotlin 플러그인·Compose 설정·의존성이 올바른 자리에 들어간다', async () => {
    const d = mkTemplate(), r = inject(d); assert.strictEqual(r.status, 0, r.stderr + r.stdout);
    const root = fs.readFileSync(path.join(d, 'build.gradle'), 'utf8'), app = fs.readFileSync(path.join(d, 'app', 'build.gradle'), 'utf8'), props = fs.readFileSync(path.join(d, 'gradle.properties'), 'utf8');
    assert(/classpath 'com\.android\.tools\.build:gradle:8\.2\.1'\n\s+classpath 'org\.jetbrains\.kotlin:kotlin-gradle-plugin:1\.9\.22'/.test(root), 'root classpath 자리');
    assert(/^apply plugin: 'com\.android\.application'\napply plugin: 'kotlin-android'/.test(app), 'kotlin-android 플러그인은 android 플러그인 바로 뒤');
    assert(/android \{\n[\s\S]*buildFeatures \{\s+compose true/.test(app) && /kotlinCompilerExtensionVersion = '1\.5\.8'/.test(app), 'compose 설정');
    assert(/kotlinOptions \{\s+jvmTarget = '17'/.test(app), '자바 목표(17)와 같은 jvmTarget');
    assert(/platform\('androidx\.compose:compose-bom:2024\.02\.00'\)/.test(app) && /'androidx\.compose\.ui:ui'/.test(app) && /'androidx\.compose\.foundation:foundation'/.test(app) && /'androidx\.compose\.runtime:runtime'/.test(app), '의존성');
    assert(/kotlin\.jvm\.target\.validation\.mode=warning/.test(props) && /android\.useAndroidX=true/.test(props), 'gradle.properties');
    // 기존 내용이 그대로 남아 있다(우리가 지운 건 없다)
    for (const keep of ['namespace "com.dullyyj.subway"', "apply from: 'capacitor.build.gradle'", 'google-services.json', 'versionCode 1', 'minifyEnabled false']) assert(app.includes(keep), keep + ' 사라짐');
    assert(root.includes('com.google.gms:google-services') && root.includes('apply from: "variables.gradle"'));
  });
  await t('Gradle 주입: 두 번 돌려도 같은 결과(중복 없음)', async () => {
    const d = mkTemplate(); assert.strictEqual(inject(d).status, 0);
    const a1 = fs.readFileSync(path.join(d, 'app', 'build.gradle'), 'utf8'), r1 = fs.readFileSync(path.join(d, 'build.gradle'), 'utf8'), p1 = fs.readFileSync(path.join(d, 'gradle.properties'), 'utf8');
    assert.strictEqual(inject(d).status, 0);
    assert.strictEqual(fs.readFileSync(path.join(d, 'app', 'build.gradle'), 'utf8'), a1); assert.strictEqual(fs.readFileSync(path.join(d, 'build.gradle'), 'utf8'), r1); assert.strictEqual(fs.readFileSync(path.join(d, 'gradle.properties'), 'utf8'), p1);
    assert.strictEqual((a1.match(/kotlin-android/g) || []).length, 1);
  });
  await t('Gradle 주입: 템플릿이 바뀌어 자리를 못 찾으면 조용히 넘어가지 않고 실패한다(메시지에 자리 이름)', async () => {
    let d = mkTemplate(); fs.writeFileSync(path.join(d, 'build.gradle'), '// nothing here\n');
    let r = inject(d); assert(r.status !== 0 && /classpath/.test(r.stderr), r.stderr);
    d = mkTemplate(); fs.writeFileSync(path.join(d, 'app', 'build.gradle'), '// nothing here\n');
    r = inject(d); assert(r.status !== 0 && /apply plugin/.test(r.stderr), r.stderr);
  });
  await t('Gradle 주입: 자바 목표를 못 읽으면 jvmTarget 을 찍지 않는다(어긋난 값으로 빌드가 깨지지 않게)', async () => {
    const d = mkTemplate(); fs.unlinkSync(path.join(d, 'app', 'capacitor.build.gradle'));
    const r = inject(d); assert.strictEqual(r.status, 0, r.stderr);
    assert(!/kotlinOptions/.test(fs.readFileSync(path.join(d, 'app', 'build.gradle'), 'utf8')));
  });

  // ── CI 워크플로 ──
  await t('CI 워크플로: 파일 복사·플러그인 등록·터치 전달(MainActivity)·Gradle 주입·시험 목록·수동 실행 시험 건너뛰기', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    for (const f of ['SceneCv', 'SceneUtil', 'SceneModel', 'SceneArt', 'SceneCore', 'SceneActs', 'SceneHaptics', 'AndroidCv', 'SceneDriver', 'SceneHost', 'SceneNativePlugin']) {
      assert(y.includes('native/' + f + '.java'), f + ' 복사 누락'); assert(fs.existsSync(N(f + '.java')), f + ' 파일 없음');
    }
    assert(y.includes('native/SceneCompose.kt') && fs.existsSync(N('SceneCompose.kt')), 'Kotlin 파일 복사 누락');
    assert(y.includes('registerPlugin(SceneNativePlugin.class)'), '플러그인 등록 누락');
    assert(y.includes('public boolean dispatchTouchEvent(MotionEvent ev)') && y.includes('SceneNativePlugin.route(ev)') && y.includes('import android.view.MotionEvent;'), 'MainActivity 터치 전달 누락');
    assert(y.includes('python3 native/inject_kotlin_compose.py android'), 'Gradle 주입 단계 누락');
    assert(y.indexOf('inject_kotlin_compose.py') < y.indexOf('./gradlew assembleDebug'), 'Gradle 주입이 빌드보다 먼저여야 한다');
    assert(y.indexOf('inject_kotlin_compose.py') > y.indexOf('Patch app/build.gradle (versionCode'), 'Gradle 주입은 versionCode 패치 뒤여야 한다(앵커가 겹치지 않게)');
    assert(y.includes('- scene_native_java.test.js') && y.includes('- scene_native_js.ui.test.js'), '시험 목록 누락');
    assert(y.includes('skip_tests') && y.includes("needs.test.result == 'skipped'") && y.includes("github.event.inputs.skip_tests != 'true'"), '수동 실행 시험 건너뛰기 설정 누락');
    assert(y.includes('"android.permission.VIBRATE"'), '진동 권한(VIBRATE) 누락');
    const yaml = spawnSync('python3', ['-I', '-c', 'import sys,yaml;yaml.safe_load(sys.stdin.read())'], { input: y, encoding: 'utf8' });
    if (!/No module named/.test(yaml.stderr || '')) assert.strictEqual(yaml.status, 0, '워크플로 YAML 오류: ' + yaml.stderr);
  });
  await t('CI 의 MainActivity 파이썬 템플릿을 실제로 돌리면 올바른 자바가 나온다(터치 전달·플러그인 등록)', async () => {
    const y = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
    const i = y.indexOf('MAIN = "\\n".join(['), j = y.indexOf('main = os.path.join(PKGDIR', i);
    assert(i > 0 && j > i);
    const body = y.slice(i, j).split('\n').map(l => l.replace(/^ {10}/, '')).join('\n');
    const o = execFileSync('python3', ['-I', '-c', 'PKG = "com.dullyyj.subway"\n' + body + '\nprint(MAIN)\n'], { encoding: 'utf8' });
    assert(/registerPlugin\(SceneNativePlugin\.class\);\s+registerPlugin\(GdmWidgetPlugin/.test(o) || o.includes('registerPlugin(SceneNativePlugin.class);'));
    assert(/public boolean dispatchTouchEvent\(MotionEvent ev\) \{\s+if \(SceneNativePlugin\.route\(ev\)\) return true;\s+return super\.dispatchTouchEvent\(ev\);\s+\}/.test(o), o);
    // 중괄호 짝
    assert.strictEqual((o.match(/\{/g) || []).length, (o.match(/\}/g) || []).length);
    if (jar && fs.existsSync(path.join(jOut, 'com', 'dullyyj', 'subway', 'SceneNativePlugin.class'))) {
      // 진짜 BridgeActivity 는 없으니 스텁으로 갈음해 MainActivity 도 컴파일해 본다
      const stubDir = path.join(out, 'ma'); fs.mkdirSync(path.join(stubDir, 'com', 'getcapacitor'), { recursive: true });
      fs.writeFileSync(path.join(stubDir, 'com', 'getcapacitor', 'BridgeActivity.java'), 'package com.getcapacitor; public class BridgeActivity extends android.app.Activity { public com.getcapacitor.Bridge getBridge() { return null; } public void registerPlugin(Class c) {} }');
      fs.writeFileSync(path.join(stubDir, 'MainActivity.java'), o);
      const sub = path.join(out, 'ma2'); fs.mkdirSync(sub);
      // MainActivity 는 위젯·다른 플러그인 클래스도 부른다 → 같은 이름의 빈 스텁
      const names = ['CellInfoPlugin', 'PowerPlugin', 'OverlayPlugin', 'MotionPlugin', 'NativeMapPlugin', 'GdmWidgetPlugin', 'GdmSharePlugin', 'RowNativePlugin', 'HtlNativePlugin', 'ScreenNativePlugin'];
      names.forEach(n => fs.writeFileSync(path.join(sub, n + '.java'), 'package com.dullyyj.subway; public class ' + n + ' {}'));
      fs.writeFileSync(path.join(sub, 'WidgetCore.java'), 'package com.dullyyj.subway; public class WidgetCore { public static void captureLaunch(android.content.Intent i) {} public static void onAppLeft(android.content.Context c) {} }');
      const r = spawnSync('javac', ['-encoding', 'UTF-8', '-cp', [jar, capOut, jOut].join(path.delimiter), '-d', path.join(out, 'ma3')].concat([path.join(stubDir, 'com', 'getcapacitor', 'BridgeActivity.java'), path.join(stubDir, 'MainActivity.java')], walk(sub, '.java')), { env: ENV, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, (r.stderr || '').slice(0, 1500));
    }
  });

  console.log(`\n${pass} pass, ${fail} fail${skipped ? ', ' + skipped + ' skip(' + (jar ? '' : 'android.jar 없음 ') + (kotlinc ? '' : 'kotlinc 없음') + ')' : ''}`);
  process.exit(fail ? 1 : 0);
})();
