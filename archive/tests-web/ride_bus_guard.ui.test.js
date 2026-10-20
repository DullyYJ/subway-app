// 버스로 시작하는 경로의 위치추적 — 2026-10-11 YJ 제보 3건 + 자동 확정
//   ① 버스를 놓쳤는데(타지 않았는데) 마커가 다음 정류장으로 간다  ② 추천 안 한 버스(후보 중 다른 경로)를 탔을 때 경로가 틀어진다
//   ③ 마커가 정류장 몇 개를 한꺼번에 건너뛴다  ④ 경로 확정을 안 눌러도 버스를 타면 자동 확정돼야 한다
// 실행: node test/ride_bus_guard.ui.test.js [html 경로]
const assert = require('assert');
const H = require('./helpers/ride_harness');
const BF = require('./helpers/bus_fixture');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const s0 = BF.stop(0);
const pt = (q) => ({ lat: q.y, lng: q.x });
const eastStops = (n) => Array.from({ length: n }, (_, i) => pt(BF.stop(i + 1)));
const altStops = (n) => Array.from({ length: n }, (_, i) => pt(BF.stopAlt(i + 1)));
const southStops = (n) => Array.from({ length: n }, (_, i) => ({ lat: BF.LAT - 0.0030 * (i + 1), lng: s0.x + 0.0030 * (i + 1) }));
async function toStopAndWait(app, secs) {
  await app.moveAlong([{ lat: s0.y, lng: s0.x - 0.0001 }], 1.3, 5);
  for (let k = 0; k < Math.ceil(secs / 15); k++) await app.feed(s0.y, s0.x - 0.0001, 0.1, 15);
}
const BOARD = 2;   // 가정류장 노드 번호(내 위치 0 · 도보 1 · 가정류장 2)

(async () => {
  const b = await H.launch();

  console.log('[① 버스를 놓치고 걸어서 다음 정류장 옆을 지남 — 마커는 승차 정류장에 머문다]');
  let app = await H.newApp(b, () => BF.resp('88', 480)); await app.search(); await app.confirm();
  await toStopAndWait(app, 60);
  await t('승차 정류장에 서 있으면 진행도가 승차 정류장이다', async () => assert.strictEqual((await app.state()).gm, BOARD));
  await app.moveAlong([pt({ x: s0.x + BF.DLNG * 0.9, y: s0.y })], 1.3, 5);   // 다음 정류장 바로 옆까지 걸어감(걷는 속도)
  await t('걸어서 다음 정류장 옆에 닿아도 진행도가 올라가지 않는다(타지 않았다)', async () => { const s = await app.state(); assert.strictEqual(s.gm, BOARD, 'gm=' + s.gm); assert.ok(!s.riding); });
  await t('승차 확정으로 보지 않는다', async () => assert.ok(!(await app.state()).boarded));
  await app.moveAlong([pt({ x: s0.x - 0.0001, y: s0.y })], 1.3, 5);
  for (let k = 0; k < 40; k++) await app.feed(s0.y, s0.x - 0.0001, 0.1, 15);   // 예정 출발(21:08) 한참 뒤까지 서 있음
  await t('예정 출발 시각이 한참 지나도 서 있는 동안은 진행도가 그대로다', async () => assert.strictEqual((await app.state()).gm, BOARD));
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(app.errs)], []));
  await app.ctx.close();

  console.log('[② 버스를 타고 달림 — 정류장을 따라가고, 한 번에 많이 건너뛰지 않는다]');
  app = await H.newApp(b, () => BF.resp('88', 480)); await app.search(); await app.confirm();
  await toStopAndWait(app, 45);
  const seen = [];
  await app.moveAlong(eastStops(5), 8, 5, async () => seen.push((await app.state()).gm));
  await t('타고 달리면 진행도가 승차 정류장 너머로 올라간다', async () => assert.ok(seen[seen.length - 1] > BOARD + 2, JSON.stringify(seen)));
  await t('진행도가 거꾸로 가지 않는다', async () => assert.ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]), JSON.stringify(seen)));
  await t('한 번에 두 정류장 넘게 뛰지 않는다', async () => assert.ok(seen.every((v, i) => i === 0 || v - seen[i - 1] <= 2), JSON.stringify(seen)));
  const before = (await app.state()).gm;
  await app.page.clock.runFor(20000);
  await app.feed(BF.LAT, BF.stop(9).x, 8, 5);      // 25초 사이 3정류장 이상 앞(GPS 갑작스런 점프)
  const after = (await app.state()).gm;
  await t('25초 사이 정류장 3개 넘게 앞으로 튀는 위치는 한꺼번에 따라가지 않는다(' + before + '→' + after + ')', async () => assert.ok(after - before <= 2, before + '→' + after));
  await app.feed(BF.LAT, BF.stop(9).x, 8, 60);
  const later = (await app.state()).gm;
  await t('실제로 계속 그쪽에 있으면 시간이 흐른 뒤 따라간다(' + after + '→' + later + ')', async () => assert.ok(later >= after));
  await app.ctx.close();

  console.log('[③ 경로 확정을 누르지 않아도 버스를 타면 자동 확정]');
  process.env.__X = '';
  app = await H.newApp(b, () => BF.resp('88', 480)); await app.search(); await app.page.clock.runFor(1500);
  await t('확정 전에는 확정 상태가 아니다', async () => assert.ok(!(await app.state()).locked));
  await toStopAndWait(app, 45);
  await t('승차 정류장에 서 있는 동안은 확정되지 않는다(오탐 방지)', async () => assert.ok(!(await app.state()).locked));
  await app.moveAlong(eastStops(3), 8, 5);
  await t('버스를 타고 다음 정류장을 지나도 자동으로 확정된다', async () => assert.strictEqual((await app.state()).locked, true));
  await t('확정 문구가 탑승 감지로 표시된다', async () => assert.ok(/탑승 감지로 확정됨/.test(await app.page.evaluate(() => document.getElementById('mainConfirmRouteBtn').textContent))));
  await app.ctx.close();

  console.log('[③-2 걸어만 다니면 자동 확정되지 않는다]');
  app = await H.newApp(b, () => BF.resp('88', 480)); await app.search(); await app.page.clock.runFor(1500);
  await toStopAndWait(app, 30);
  await app.moveAlong([pt({ x: s0.x + BF.DLNG * 3, y: s0.y })], 1.4, 5);    // 걸어서 3정류장 거리를 감
  await t('걷는 속도로 노선을 따라가기만 하면 확정되지 않는다', async () => assert.ok(!(await app.state()).locked));
  await app.ctx.close();

  console.log('[④ 추천 안 한 버스(엔진 후보 중 다른 경로)를 탔다 — 재탐색 없이 그 경로로 이어서 안내]');
  app = await H.newApp(b, () => BF.respWithAlt(480)); await app.search(); await app.confirm();
  const req0 = app.stat.routeReq;
  await toStopAndWait(app, 45);
  const n0 = (await app.state()).names;
  await t('처음 보던 경로는 88번 노선(나정류장…)이다', async () => assert.ok(n0.includes('나정류장') && !n0.includes('급1정류장')));
  const g = [];
  await app.moveAlong(altStops(6), 8, 5, async () => g.push((await app.state()).gm));
  const st4 = await app.state();
  await t('급행97 경로를 따라 달리면 그 후보 경로로 바뀐다', async () => assert.ok(st4.names.includes('급1정류장') && st4.names.includes('급3정류장'), st4.names.join(',')));
  await t('엔진에 다시 묻지(재탐색) 않는다', async () => assert.strictEqual(app.stat.routeReq, req0, app.stat.routeReq + ' vs ' + req0));
  await t('확정 상태가 유지된다', async () => assert.strictEqual(st4.locked, true));
  await t('진행도가 지금 위치(급행 노선의 앞쪽 정류장)로 맞춰져 있다', async () => assert.ok(st4.gm >= BOARD + 4, 'gm=' + st4.gm));
  await t('타고 있다고 표시된다(승차 후)', async () => assert.strictEqual(st4.boarded, true));
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(app.errs)], []));
  await app.ctx.close();

  console.log('[④-2 처음 보던 경로(88번)를 그대로 탔다 — 바꾸지 않는다]');
  app = await H.newApp(b, () => BF.respWithAlt(480)); await app.search(); await app.confirm();
  await toStopAndWait(app, 45);
  await app.moveAlong(eastStops(7), 8, 5);
  const st5 = await app.state();
  await t('보던 경로를 따라가면 경로가 그대로다', async () => assert.ok(st5.names.includes('나정류장') && !st5.names.includes('급1정류장'), st5.names.join(',')));
  await t('진행도가 끝 쪽까지 간다', async () => assert.ok(st5.gm >= BOARD + 5, 'gm=' + st5.gm));
  await app.ctx.close();

  console.log('[④-3 후보 어디에도 안 맞는 길로 간다 — 억지로 맞추지 않는다]');
  app = await H.newApp(b, () => BF.respWithAlt(480)); await app.search(); await app.confirm();
  await toStopAndWait(app, 45);
  await app.moveAlong(southStops(6), 8, 5);
  const st6 = await app.state();
  await t('어느 후보와도 안 맞으면 경로를 바꾸지 않는다(88번 그대로)', async () => assert.ok(st6.names.includes('나정류장') && !st6.names.includes('급1정류장'), st6.names.join(',')));
  await app.ctx.close();

  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
