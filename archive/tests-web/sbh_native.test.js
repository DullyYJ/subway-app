// 숨김 인계 자바 쪽 약속 점검 — 2026-10-19
//   자바(OverlayPlugin · KeepAliveService)는 이 환경에서 컴파일하지 못한다(android.jar 없음 — 컴파일은 CI). 그래서 웹과 자바가 서로 부르는 이름·순서·안전장치가
//   소스에 그대로 있는지 글로 점검한다: 플러그인 메서드 ↔ 웹 호출, 웹이 자바가 부르는 함수를 가졌는지, 인계 → 돌려받기 → 포기(8초) 순서, 낡은 값으로 덮지 않는 가드.
// 실행: node test/sbh_native.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const OV = fs.readFileSync(path.join(R, 'native', 'OverlayPlugin.java'), 'utf8');
const KA = fs.readFileSync(path.join(R, 'native', 'KeepAliveService.java'), 'utf8');
const WEB = fs.readFileSync(path.join(R, 'ios-reference', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const has = (s, re, msg) => assert.ok(re.test(s), msg || String(re));
const body = (src, sig) => { const i = src.indexOf(sig); assert.ok(i >= 0, '없음: ' + sig); let d = 0, j = src.indexOf('{', i); const st = j; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } } return src.slice(st, j + 1); };

t('플러그인 메서드: standbyTake · standbyPacket 이 @PluginMethod 로 있고 웹이 부르는 이름과 같다', () => {
  has(OV, /@PluginMethod\s+public void standbyTake\(PluginCall call\)/);
  has(OV, /@PluginMethod\s+public void standbyPacket\(PluginCall call\)/);
  has(WEB, /n\.standbyTake\(\)/); has(WEB, /handoff: _sbhOn\(\)/);
  has(OV, /call\.getBoolean\("handoff", false\)/, '웹이 알리는 handoff 를 읽는다');
});
t('자바가 웹에 시키는 함수가 웹에 있다: _sbHandback · _sbHanded · _ovlStandbyPush', () => {
  has(OV, /window\._sbHandback&&window\._sbHandback\(\)/); has(WEB, /window\._sbHandback = _sbHandback/);
  has(OV, /window\._sbHanded=true/); has(WEB, /window\._sbHanded === true/);
  has(OV, /window\._ovlStandbyPush&&window\._ovlStandbyPush\(true\)/); has(WEB, /window\._ovlStandbyPush = _ovlStandbyPush/);
});
t('가려질 때: 스위치(handoffOk)가 켜졌고 여정 중이고 맡긴 상태가 있을 때만 인계한다 — 아니면 예전처럼 웹을 깨운다', () => {
  const b = body(OV, 'protected void handleOnStop()');
  has(b, /handoffOk\s*&&\s*journeyOn\s*&&\s*!hosted\s*&&\s*!handoff\s*&&\s*KeepAliveService\.hasPacket/);
  has(b, /startHandoffSoon\(\);\s*return;/);
  has(b, /wakeWebSoon\(300L\);[\s\S]*wakeWebSoon\(1500L\)/, '인계가 안 되면 예전 깨우기가 그대로 남는다');
});
t('인계 시작: 웹이 최신 상태를 맡긴 뒤(0.7초) 서비스가 이어받고, 그 사이 다시 보이면 그만두며, 실패하면 웹을 깨운다', () => {
  const b = body(OV, 'private void startHandoffSoon()');
  has(b, /_ovlStandbyPush\(true\)/); has(b, /postDelayed\([\s\S]*700L\)/);
  has(b, /if \(appVisible \|\| handoff \|\| hosted\) return;/); has(b, /if \(!tryHandoff\(\)\) \{ wakeWebSoon\(0L\); wakeWebSoon\(1500L\); \}/);
  const tb = body(OV, 'private boolean tryHandoff()');
  has(tb, /hosted = true;/); has(tb, /handoff = true;/); has(tb, /KeepAliveService\.handoff = true;/); has(tb, /ACT_ACTIVATE/);
});
t('다시 보이면: 웹이 돌려받게 재촉하고(1초 간격), 8초가 지나도 안 받으면 서비스를 멈추고 웹이 스스로 잇게 한다', () => {
  has(body(OV, 'protected void handleOnStart()'), /if \(handoff\)[\s\S]*postDelayed\(handback/);
  has(OV, /HANDBACK_GIVEUP_MS = 8000L/);
  has(KA, /if \(!standbyActive\) return;\s*\/\/ 응답을 기다리는 사이/, '인계를 돌려준 뒤 도착한 낡은 응답은 버린다');
  const h = body(OV, 'private final Runnable handback = new Runnable()');
  has(h, /HANDBACK_GIVEUP_MS[\s\S]*endHandoff\(true\)/); has(h, /_sbHandback/); has(h, /postDelayed\(this, 1000L\)/);
  has(h, /!appVisible[\s\S]*return;/, '다시 가려지면 재촉을 멈춘다');
});
t('돌려받기(standbyTake): 서비스 상태를 주고 → 대기 루프 멈춤 + 오버레이 창은 웹에 돌려준다', () => {
  const b = body(OV, 'public void standbyTake(PluginCall call)');
  has(b, /standbyTakeJson/); has(b, /if \(was\) endHandoff\(true\)/);
  const e = body(OV, 'private void endHandoff(boolean stopLoop)');
  has(e, /handoff = false;/); has(e, /KeepAliveService\.handoff = false;/); has(e, /hosted = false; wanted = hostedOk; hostedOk = false;/); has(e, /startTicker\(\)/); has(e, /ACT_DEACTIVATE/);
});
t('인계 중 웹의 keepAlive(on) 는 서비스를 끄지 않는다(상태를 받기 전에 끄지 않는다) · 앱이 완전히 닫히면 인계는 끝나고 닫힘 대기 모드가 이어받는다', () => {
  const k = body(OV, 'public void keepAlive(PluginCall call)');
  assert.ok(k.indexOf('if (handoff)') >= 0 && k.indexOf('if (handoff)') < k.indexOf('if (KeepAliveService.standbyActive)'), 'handoff 가드가 먼저');
  const d = body(OV, 'protected void handleOnDestroy()');
  has(d, /handoff = false;\s*KeepAliveService\.handoff = false;/);
  assert.ok(d.indexOf('handoff = false') < d.indexOf('boolean handOver'), '파괴 때 인계 표시를 먼저 푼다');
});
t('서비스: 인계 중에는 웹이 맡기는 낡은 상태로 덮지 않고, 엔진이 정한 nextMs(2~8초)를 따르며, 돌려줄 최신 상태를 쥔다', () => {
  has(body(KA, 'static void savePacket(Context c, String state, String url)'), /if \(standbyActive && handoff\) return;/);
  has(KA, /STEP_MIN_MS = 2000L, STEP_MAX_MS = 8000L/);
  has(KA, /optLong\("nextMs", 0L\)/); has(KA, /nm >= STEP_MIN_MS && nm <= STEP_MAX_MS \? nm : STEP_MS|\(nm >= STEP_MIN_MS && nm <= STEP_MAX_MS\) \? nm : STEP_MS/);
  has(KA, /hh\.postDelayed\(this, nextDelayMs\)/);
  has(KA, /liveState = state; liveAt = System\.currentTimeMillis\(\);/);
  has(body(KA, 'static String standbyTakeJson(Context c)'), /r\.put\("state", new JSONObject\(st\)\)/);
});
t('엔진 쪽 약속: 엔진이 nextMs 를 주고(rideStandby), 워커 사본에도 있다', () => {
  const E = fs.readFileSync(path.join(R, 'engine', 'ride-standby.js'), 'utf8'), W = fs.readFileSync(path.join(R, 'engine', 'route-v2-worker.ascii.js'), 'utf8');
  has(E, /nextMs: done \? O\.stepMs : nextMs/); assert.ok(/nextMs/.test(W) && /rsNextMs/.test(W), '워커 사본');
});

console.log('\nsbh_native: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
