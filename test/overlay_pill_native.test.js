// 오버레이 알약 — 2026-10-16 (YJ: "접혀 있어도 추천이 뜨면 펴지면서 나와야 해 · 2정거장 전엔 알약 둘레 무지개, 1정거장 전엔 펼침")
// 네이티브(OverlayPlugin.java)의 접힘/펼침 규칙을 소스에서 확인한다(안드로이드 뷰는 JVM 에서 못 돌려서 규칙 문장 단위로 본다).
// 실행: node test/overlay_pill_native.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const j = fs.readFileSync(path.join(__dirname, '..', 'native', 'OverlayPlugin.java'), 'utf8');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const body = (sig) => { const i = j.indexOf(sig); assert.ok(i >= 0, sig + ' 없음'); let d = 0, k = j.indexOf('{', i); const st = k; for (; k < j.length; k++) { if (j[k] === '{') d++; else if (j[k] === '}') { d--; if (d === 0) break; } } return j.slice(st, k + 1); };

const am = body('private void applyMode()');
t('접힌 알약은 새 추천(rcOn·rcAt)이 오면 펼쳐진다', () => {
  assert.ok(/boolean recoOpen = rcOn && rcAt != dismissedRecoAt;/.test(am));
  assert.ok(/boolean wp = userPill && !demoActive\(\) && !alertOpen && !recoOpen;/.test(am));
});
t('한 정거장 전(alert 1)에만 펼치고, 두 정거장 전(alert 2)은 펼치지 않는다', () => {
  assert.ok(/boolean alertOpen = alertLevel == 1 && curAlertAt != dismissedAlertAt;/.test(am));
});
t('사용자가 그 추천으로 다시 접으면 같은 추천으로는 다시 펼치지 않고, 펴면 기록을 지운다', () => {
  const sp = body('private void setUserPill(boolean v)');
  assert.ok(/if \(rcOn\) dismissedRecoAt = rcAt;/.test(sp));
  assert.ok(/dismissedRecoAt = -1L;/.test(sp));
});
const aa = body('private void applyAlert()');
t('알약일 때도 무지개 테두리를 그린다(알약 모양 반지름)', () => {
  assert.ok(/int mode = alertLevel;/.test(aa) && !/curPill \? 0 : alertLevel/.test(aa));
  assert.ok(/border\.setRadius\(curPill \? dp\(15\) : dp\(14\)\)/.test(aa));
  assert.ok(/mode == 1 \? 1100L : 6000L/.test(aa), '두 정거장 전은 천천히(6초), 한 정거장 전은 빠르게(1.1초)');
});
t('무지개 테두리는 반지름을 바꿀 수 있다', () => assert.ok(/void setRadius\(float r\)/.test(j)));
t('추천 줄: 버튼 이름(bus·end)을 웹이 보내고 못 받으면 기본 이름', () => {
  assert.ok(/rcBus = rc\.optString\("bus", ""\); if \(rcBus\.length\(\) == 0\) rcBus = "주변버스 보기";/.test(j));
  assert.ok(/rcEnd = rc\.optString\("end", ""\); if \(rcEnd\.length\(\) == 0\) rcEnd = "종료";/.test(j));
});
t('[주변버스 보기]는 웹에 recoBus 를 알리고 앱을 앞으로 가져온다', () => assert.ok(/rh == 3\) \{ act\("recoBus"\); openApp\(\); \}/.test(j)));
t('[종료]는 앱을 완전히 끝낸다: 웹에 recoEnd 를 알리고, 서비스·화면 켜 둠·오버레이·알림·액티비티를 정리하고 프로세스(시계 위젯)는 살려 둔다', () => {
  assert.ok(/else if \(rh == 2\) quitApp\(\);/.test(j));
  assert.ok(/act\("recoEnd"\)/.test(body('private void quitApp()')));
  const q = body('private void finishQuit()');
  for (const re of [/KeepAliveService\.ACT_STOP/, /stopKeepSvc\(\)/, /cpuLock\.release\(\)/, /detach\(\)/, /cancelAll\(\)/, /finishAndRemoveTask\(\)/, /WidgetCore\.onAppLeft\(/]) assert.ok(re.test(q), String(re));
  assert.ok(!/killProcess|System\.exit/.test(j), '프로세스를 죽이면 시계 위젯 동물들이 멈춘다');
});
t('버튼 눌림 판정은 셋 모두(겹치면 손가락에 가까운 쪽)', () => { const h = body('int hit(float x, float y)'); assert.ok(/RectF\[\] rs = \{ go, bus, ok \};/.test(h) && /int\[\] id = \{ 1, 3, 2 \};/.test(h)); });
console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
