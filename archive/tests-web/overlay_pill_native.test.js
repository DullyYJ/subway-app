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
t('추천 줄: 버튼은 [rcGo][확인] 둘 — 이름은 웹이 보내고 못 받으면 기본 이름, 주변버스 버튼은 없다', () => {
  assert.ok(/rcEnd = rc\.optString\("ok", ""\); if \(rcEnd\.length\(\) == 0\) rcEnd = "확인";/.test(j));
  assert.ok(!/rcBus|recoBus|busW/.test(j), '주변버스 보기는 없앴다');
});
t('[맛집/쿠팡 보기]는 웹에 recoGo 를 알리고 앱을 앞으로 가져온다 · [확인]은 그 추천을 닫고 recoOk 를 알린다', () => {
  assert.ok(/rh == 1\) \{ act\("recoGo"\); openApp\(\); \}/.test(j));
  assert.ok(/rcHideAt = rcAt; rcOn = false; act\("recoOk"\); attachOrUpdate\(\);/.test(j));
  assert.ok(/if \(rcOn && rcAt == rcHideAt\) rcOn = false;/.test(j), '닫은 추천이 웹에서 다시 와도 안 그린다');
});
t('내릴 준비(getoff): 추천 줄 자리에 우선 싣고(rcKind 1) 버튼은 [앱 종료] 하나, rcGo 는 비운다', () => {
  assert.ok(/JSONObject gf = o\.optJSONObject\("getoff"\);/.test(j));
  assert.ok(/rcKind = 1; rcA = gf\.optString\("a", ""\);[^\n]*rcGo = "";/.test(j));
  assert.ok(/rcEnd = gf\.optString\("end", ""\); if \(rcEnd\.length\(\) == 0\) rcEnd = "앱 종료";/.test(j));
  assert.ok(/else if \(rh == 2 && rcKind == 1\) quitApp\(\);/.test(j), '내릴 준비의 버튼은 앱 종료');
  assert.ok(/goW = rcGo\.length\(\) > 0 \?/.test(j), 'go 가 비면 그 칸을 만들지 않는다');
});
t('앱 자동종료 예약: 웹이 준 시각(quit.at)에 네이티브 타이머가 quitApp 을 부른다(웹이 멈춰도) · at=0 은 취소 · 종료하면 예약도 지운다', () => {
  assert.ok(/JSONObject qj = o\.optJSONObject\("quit"\);\s*if \(qj != null\) setQuitAt\(\(long\) qj\.optDouble\("at", 0\)\);/.test(j));
  const q = body('private void setQuitAt(long at)');
  assert.ok(/main\.removeCallbacks\(quitRun\)/.test(q) && /main\.postDelayed\(quitRun/.test(q));
  assert.ok(/quitAtMs = 0L; quitApp\(\);/.test(j));
  assert.ok(/quitAtMs = 0L; main\.removeCallbacks\(quitRun\);/.test(body('private void finishQuit()')));
});
t('[앱 종료]는 앱을 완전히 끝낸다: 웹에 recoEnd 를 알리고, 서비스·화면 켜 둠·오버레이·알림·액티비티를 정리하고 프로세스(시계 위젯)는 살려 둔다', () => {
  assert.ok(/act\("recoEnd"\)/.test(body('private void quitApp()')));
  const q = body('private void finishQuit()');
  for (const re of [/KeepAliveService\.ACT_STOP/, /stopKeepSvc\(\)/, /cpuLock\.release\(\)/, /detach\(\)/, /cancelAll\(\)/, /finishAndRemoveTask\(\)/, /WidgetCore\.onAppLeft\(/]) assert.ok(re.test(q), String(re));
  assert.ok(!/killProcess|System\.exit/.test(j), '프로세스를 죽이면 시계 위젯 동물들이 멈춘다');
});
t('버튼 눌림 판정은 둘 모두(겹치면 손가락에 가까운 쪽)', () => { const h = body('int hit(float x, float y)'); assert.ok(/RectF\[\] rs = \{ go, ok \};/.test(h) && /int\[\] id = \{ 1, 2 \};/.test(h)); });
console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
