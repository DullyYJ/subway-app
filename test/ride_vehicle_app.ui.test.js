// 실시간 차량 위치(gildongmu-ride 워커) 연동 — 2026-10-11
//   탔다는 증거(차량 속도 이동)가 있는 동안 워커가 '내 곁의 같은 차'를 두 번 연속 뚜렷이 가리키면 잠그고, 차량 위치로 정류장 진행을 따라간다.
//   GPS 는 확인용(450m 넘게 벌어지면 해제). 워커가 실패·미지원이면 기존 동작 그대로.
// 실행: node test/ride_vehicle_app.ui.test.js [html 경로]
const assert = require('assert');
const H = require('./helpers/ride_harness');
const BF = require('./helpers/bus_fixture');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const s0 = BF.stop(0);
const pt = (q) => ({ lat: q.y, lng: q.x });
const eastStops = (n) => Array.from({ length: n }, (_, i) => pt(BF.stop(i + 1)));
const altStops = (n) => Array.from({ length: n }, (_, i) => pt(BF.stopAlt(i + 1)));
const M_LNG = 1 / (111320 * Math.cos(37.5547 * Math.PI / 180));
async function toStopAndWait(app, secs) {
  await app.moveAlong([{ lat: s0.y, lng: s0.x - 0.0001 }], 1.3, 5);
  for (let k = 0; k < Math.ceil(secs / 15); k++) await app.feed(s0.y, s0.x - 0.0001, 0.1, 15);
}
// 내 위치에서 동쪽(진행 방향)으로 aheadM 앞에 있는 한 대의 차량을 흉내 내는 워커
function worker(o) {
  o = o || {};
  return (body) => {
    if (o.fail) return o.fail === 500 ? 500 : { ok: false, error: 'x' };
    if (o.unsupported) return { ok: true, n: 0, unsupported: (body.cands || []).length, now: Date.now() };
    const f = body.fix, veh = { lat: f.lat + (o.dLat || 0), lng: f.lng + (o.aheadM != null ? o.aheadM : 30) * M_LNG };
    const no = o.busNo || (body.cands[0] && body.cands[0].busNo) || '88';
    const base = { vehicleno: o.vehicleno || '인천70바1234', routeKey: '23_ICB1', busNo: no, cand: 0, lat: veh.lat, lng: veh.lng, nodeord: 3, nodenm: '나정류장', nodeid: 'ICB2', ageMs: 8000 };
    const out = { ok: true, ver: 'mock', now: Date.now(), n: 5, unsupported: 0 };
    if (body.lock && body.lock.vehicleno) out.lock = o.lost ? { found: false } : Object.assign({ found: true, dist: Math.round((o.aheadM != null ? o.aheadM : 30)) }, base);
    if (o.conf !== 'none') out.match = Object.assign({ conf: o.conf || 'sure', dist: Math.round(o.aheadM != null ? o.aheadM : 30), second: o.second === undefined ? 600 : o.second }, base);
    return out;
  };
}
const diag = (app) => app.page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('ovlDiag') || '[]') || []).map(String); } catch (e) { return []; } });
const veh = (app) => app.page.evaluate(() => window._veh ? { v: window._veh.vehicleno, no: window._veh.no } : null);

(async () => {
  const b = await H.launch();

  console.log('[① 버스를 타고 달림 — 같은 차가 두 번 연속 뚜렷하면 잠그고 승차를 확정한다]');
  let app = await H.newApp(b, () => BF.resp('88', 480)); app.stat.vehFn = worker(); await app.search(); await app.confirm();
  await toStopAndWait(app, 45);
  const n0 = (app.stat.veh || []).length;
  await t('서 있는 동안(차량 속도 이동 없음)은 워커에 묻지 않는다', async () => assert.strictEqual(n0, 0, 'n0=' + n0));
  await app.moveAlong(eastStops(3), 8, 5);
  await t('타고 달리면 워커에 묻는다', async () => assert.ok((app.stat.veh || []).length >= 2, 'req=' + (app.stat.veh || []).length));
  await t('요청에 내 위치·후보 버스(88번, 승차 정류장 id)가 실린다', async () => { const q = app.stat.veh[0]; assert.ok(q.fix && q.cands && q.cands.length >= 1 && q.cands[0].busNo === '88' && q.cands[0].boardStopId === 'GGB1', JSON.stringify(q).slice(0, 200)); });
  await t('차량이 잠긴다', async () => assert.deepStrictEqual(await veh(app), { v: '인천70바1234', no: '88' }));
  const st1 = await app.state();
  await t('승차가 확정된다', async () => assert.strictEqual(st1.boarded, true));
  await t('경로가 자동 확정된다(탑승 감지)', async () => assert.strictEqual(st1.locked, true));
  await t('진행도가 승차 정류장 너머로 간다', async () => assert.ok(st1.gm > 2, 'gm=' + st1.gm));
  await t('잠근 뒤 요청에는 lock 이 실린다', async () => assert.ok(app.stat.veh.some(q => q && q.lock && q.lock.vehicleno === '인천70바1234')));
  await t('진단 기록에 차량매칭이 남는다', async () => assert.ok((await diag(app)).some(x => /차량매칭/.test(x))));
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(app.errs)], []));
  await app.ctx.close();

  console.log('[② 잠근 차량이 내 앞 350m — 차량 위치가 다음 정류장 쪽이면 진행도가 거기까지 간다]');
  app = await H.newApp(b, () => BF.resp('88', 480)); app.stat.vehFn = worker({ aheadM: 360 }); await app.search(); await app.confirm();
  await toStopAndWait(app, 45);
  await app.moveAlong(eastStops(3), 8, 5);
  const st2 = await app.state(), cur = app.cur;
  const nearIdx = await app.page.evaluate(([la, ln]) => { let bi = -1, bd = 1e9; _transitNodeData.forEach((n, i) => { if (n.lat == null || n.isWalk) return; const d = haversineM(la, ln, n.lat, n.lng); if (d < bd) { bd = d; bi = i; } }); return bi; }, [cur.lat, cur.lng]);
  await t('차량 위치(내 앞 360m)를 따라 진행도가 내 위치의 정류장 이상이다(gm=' + st2.gm + ', 내 곁=' + nearIdx + ')', async () => assert.ok(st2.gm >= nearIdx, 'gm=' + st2.gm + ' near=' + nearIdx));
  await app.ctx.close();

  console.log('[③ 서 있기만 하면 — 정류장에 서 있는데 버스가 곁을 지나도 잠그지 않는다]');
  app = await H.newApp(b, () => BF.resp('88', 480)); app.stat.vehFn = worker({ aheadM: 10 }); await app.search(); await app.confirm();
  await toStopAndWait(app, 150);
  await t('차량이 곁에 있어도 내가 움직이지 않으면 잠그지 않는다', async () => assert.strictEqual(await veh(app), null));
  await t('승차 확정으로 보지 않는다', async () => assert.ok(!(await app.state()).boarded));
  await app.ctx.close();

  console.log('[④ 애매한 결과(weak) — 잠그지 않고 기존 동작 그대로]');
  app = await H.newApp(b, () => BF.resp('88', 480)); app.stat.vehFn = worker({ conf: 'weak', second: 100 }); await app.search(); await app.confirm();
  await toStopAndWait(app, 45);
  await app.moveAlong(eastStops(4), 8, 5);
  const st4 = await app.state();
  await t('weak 는 잠그지 않는다', async () => assert.strictEqual(await veh(app), null));
  await t('기존 방식대로 진행도는 따라간다', async () => assert.ok(st4.gm >= 4, 'gm=' + st4.gm));
  await app.ctx.close();

  console.log('[⑤ 워커 실패·미지원 — 기존 동작 그대로, 오류 없음, 재시도는 줄어든다]');
  for (const [nm, o] of [['500 오류', { fail: 500 }], ['ok:false', { fail: 1 }], ['도시 미지원', { unsupported: 1 }]]) {
    app = await H.newApp(b, () => BF.resp('88', 480)); app.stat.vehFn = worker(o); await app.search(); await app.confirm();
    await toStopAndWait(app, 45);
    await app.moveAlong(eastStops(6), 8, 5);
    const s = await app.state();
    await t(nm + ': 잠그지 않고 기존 GPS 로 진행도가 간다(gm=' + s.gm + ')', async () => { assert.strictEqual(await veh(app), null); assert.ok(s.gm >= 5); });
    await t(nm + ': JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(app.errs)], []));
    if (o.unsupported) await t('도시 미지원이면 5분간 다시 묻지 않는다(요청 ' + (app.stat.veh || []).length + '회)', async () => assert.ok((app.stat.veh || []).length <= 3));
    await app.ctx.close();
  }

  console.log('[⑥ 잠근 뒤 차량이 450m 넘게 벌어지거나 사라지면 푼다]');
  app = await H.newApp(b, () => BF.resp('88', 480)); const W = { o: {} }; app.stat.vehFn = (bd) => { const o = Object.assign({}, W.o); return worker(o)(bd); };
  await app.search(); await app.confirm(); await toStopAndWait(app, 45); await app.moveAlong(eastStops(3), 8, 5);
  await t('먼저 잠겨 있다', async () => assert.ok(await veh(app)));
  W.o = { aheadM: 700 };
  await app.moveAlong([pt(BF.stop(4)), pt(BF.stop(5))], 8, 5);
  await t('차량이 700m 떨어지면 푼다', async () => assert.strictEqual(await veh(app), null));
  await t('해제가 진단에 남는다', async () => assert.ok((await diag(app)).some(x => /차량매칭해제/.test(x))));
  await app.ctx.close();
  app = await H.newApp(b, () => BF.resp('88', 480)); const W2 = { o: {} }; app.stat.vehFn = (bd) => worker(Object.assign({}, W2.o))(bd);
  await app.search(); await app.confirm(); await toStopAndWait(app, 45); await app.moveAlong(eastStops(3), 8, 5);
  W2.o = { lost: true, conf: 'none' };
  await app.moveAlong([pt(BF.stop(4)), pt(BF.stop(5)), pt(BF.stop(6))], 8, 5);
  await t('차량이 목록에서 3번 사라지면 푼다', async () => assert.strictEqual(await veh(app), null));
  await app.ctx.close();

  console.log('[⑦ 추천 안 한 버스(급행97)를 탔다 — 차량 매칭이 그 후보 경로로 바꿔 이어서 안내한다]');
  app = await H.newApp(b, () => BF.respWithAlt(480)); app.stat.vehFn = (bd) => worker({ busNo: '급행97', aheadM: 20 })(bd);
  await app.search(); await app.confirm();
  const req0 = app.stat.routeReq;
  await toStopAndWait(app, 45);
  await app.moveAlong(altStops(3), 8, 5);
  const st7 = await app.state();
  await t('경로가 급행97 후보로 바뀐다', async () => assert.ok(st7.names.includes('급1정류장'), st7.names.join(',')));
  await t('차량이 급행97 로 잠긴다', async () => assert.deepStrictEqual(await veh(app), { v: '인천70바1234', no: '급행97' }));
  await t('엔진에 다시 묻지 않는다', async () => assert.strictEqual(app.stat.routeReq, req0));
  await t('승차 확정·확정 상태', async () => { assert.strictEqual(st7.boarded, true); assert.strictEqual(st7.locked, true); });
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(app.errs)], []));
  await app.ctx.close();

  console.log('[⑧ 끄기 스위치]');
  app = await H.newApp(b, () => BF.resp('88', 480)); app.stat.vehFn = worker(); await app.page.evaluate(() => { window._vehOff = true; });
  await app.search(); await app.confirm(); await toStopAndWait(app, 45); await app.moveAlong(eastStops(3), 8, 5);
  await t('_vehOff 이면 워커에 묻지 않는다', async () => assert.strictEqual((app.stat.veh || []).length, 0));
  await app.ctx.close();

  console.log('[⑨ 지하철 탑승 확정 중 — 곁의 버스가 잡혀도 차량 잠금·경로 교체를 하지 않는다 (2026-10-14 계양역 사례)]');
  app = await H.newApp(b, () => BF.respWithAlt(480)); app.stat.vehFn = (bd) => worker({ busNo: '급행97', aheadM: 20 })(bd);
  await app.page.evaluate(() => { window._trkSubConfirmed = function () { return true; }; });
  await app.search(); await app.confirm();
  const req9 = app.stat.routeReq;
  await toStopAndWait(app, 45);
  await app.moveAlong(altStops(3), 8, 5);
  const st9 = await app.state();
  await t('버스 차량이 잠기지 않는다', async () => assert.strictEqual(await veh(app), null));
  await t('경로가 급행97 후보로 바뀌지 않는다', async () => assert.ok(!st9.names.includes('급1정류장'), st9.names.join(',')));
  await t('워커에 묻지도 않는다', async () => assert.strictEqual((app.stat.veh || []).length, 0));
  await t('_applyRiddenRoute 가 false 를 돌려주고 경로를 건드리지 않는다', async () => {
    const r = await app.page.evaluate(() => { try { return _applyRiddenRoute({ routeKey: '23_ICB1', busNo: '급행97' }); } catch (e) { return 'ERR ' + e.message; } });
    assert.strictEqual(r, false, String(r));
  });
  await t('엔진에 다시 묻지 않는다', async () => assert.strictEqual(app.stat.routeReq, req9));
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(app.errs)], []));
  await app.ctx.close();

  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
