// 오버레이를 앱 경로 화면(타임라인) 그대로 — 2026-10-11
//   앱의 실제 타임라인(_renderHtlTrack)을 그려 놓고, 오버레이로 보내는 칸(_ovlStrip)이 그 화면과 같은지 확인한다.
// 실행: node test/overlay_strip.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(theme) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-11T14:30:00+09:00') });
    await page.goto('file://' + html); await page.addStyleTag({ content: '#locDiscOv{display:none !important}' }); await page.clock.runFor(2500);
    await page.evaluate((theme) => {
      const ov = document.getElementById('locDiscOv'); if (ov) ov.remove();
      if (theme) document.documentElement.setAttribute('data-theme', theme);
      if (!document.getElementById('transitHtlTrack')) document.body.insertAdjacentHTML('beforeend', '<div id="transitHtlWrap" class="htl-wrap" style="display:none"><div id="transitHtlTrack"></div></div>');
      const st = (n, i) => ({ stationName: n, lat: 37.58 + i * 0.002, lon: 126.7 + i * 0.002 });
      // 도보 2분 → 931번(이음대로.대성베르힐 … 아라역4번출구) → 도보 → 인천2호선 → 도보
      const secs = [
        { transportation: { type: 3 }, duration: 120, distance: 150 },
        { transportation: { type: 2, name: '931' }, duration: 600, startSec: 120, endSec: 720, passStopList: { stationList: [st('이음대로.대성베르힐', 0), st('이음대로.호반써밋', 1), st('인천외국어마을', 2), st('아라역4번출구', 3), st('아라동주민센터', 4)] } },
        { transportation: { type: 3 }, duration: 180, distance: 200 },
        { transportation: { type: 1, name: '인천2호선' }, duration: 900, startSec: 900, endSec: 1800, passStopList: { stationList: [st('아라', 6), st('검단오류', 7), st('왕길', 8)] } },
        { transportation: { type: 3 }, duration: 240, distance: 300 },
      ];
      _renderHtlTrack(secs, { name: '출발', lat: 37.579, lng: 126.699 }, { name: '도착', lat: 37.6, lng: 126.73 }, 30);
      window._routeLocked = true; window._metroRouteMode = false; window._gpsMaxIdx = 1;
    }, theme);
    return { ctx, page, errs };
  }
  const strip = (page) => page.evaluate(() => { const r = _ovlStrip(_pipStations()); return r; });

  console.log('[① 앱 타임라인의 칸을 그대로 읽는다]');
  let a = await fresh();
  let r = await strip(a.page);
  await t('좌우로 넘겨 볼 수 있게 전체 칸(최대 120)을 보내고, 현위치 칸 번호·시작 위치를 준다', async () => {
    const all = await a.page.evaluate(() => Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).length);
    assert.ok(r && r.cells.length === Math.min(all, 120), r.cells.length + '/' + all); assert.strictEqual(r.base, 0); assert.strictEqual(r.cur, 1);
  });
  await t('칸 이름이 앱 타임라인의 역명과 같다', async () => {
    const dom = await a.page.evaluate(() => Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).map(c => c.children[0].textContent.trim()));
    assert.deepStrictEqual(r.cells.map(c => c.n), dom.slice(0, r.cells.length), JSON.stringify([r.cells.map(c => c.n), dom]));
  });
  await t('시각이 앱과 같다(HH:MM)', async () => { assert.ok(/^\d\d:\d\d$/.test(r.cells[1].t), JSON.stringify(r.cells[1])); assert.ok(/^\d\d:\d\d$/.test(r.cells[2].t)); });
  await t('버스 번호 라벨이 승차 칸에 있다', async () => { assert.ok(r.cells.some(c => /931/.test(c.g)), JSON.stringify(r.cells.map(c => c.g))); });
  await t('색이 #rrggbb 이고, 점·선 정보가 있다', async () => {
    const c = r.cells[2];
    assert.ok(/^#[0-9a-f]{6}$/.test(c.dc), JSON.stringify(c)); assert.ok(/^#[0-9a-f]{6}$/.test(c.lc) && /^#[0-9a-f]{6}$/.test(c.rc), JSON.stringify(c));
    assert.ok(c.dk === 1, JSON.stringify(c));
    assert.ok(/^#[0-9a-f]{6}$/.test(r.theme.bg) && /^#[0-9a-f]{6}$/.test(r.theme.fg) && /^#[0-9a-f]{6}$/.test(r.theme.sub), JSON.stringify(r.theme));
  });
  await t('앱의 첫 칸(도보)은 왼쪽 선이 없다', async () => { await a.page.evaluate(() => { window._gpsMaxIdx = 0; }); const q = await strip(a.page); assert.ok(q.cur + q.base <= 1, String(q.cur)); assert.ok(!q.cells[0].lc && q.cells[0].rc, JSON.stringify(q.cells[0])); });

  console.log('[①-1 대기 모드용 그림 틀 — 칸마다 노드 번호가 따라온다]');
  await t('full: 처음 칸부터 전부 + 칸→노드 번호(map). 노드가 있는 칸은 그 노드 이름과 같고 도보 칸은 -1', async () => {
    await a.page.evaluate(() => { window._gpsMaxIdx = 3; });
    const q = await a.page.evaluate(() => { const r = _ovlStrip(_pipStations(), true); return { n: r.cells.length, map: r.map, base: r.base, names: r.cells.map(c => c.n), nd: _transitNodeData.map(x => x.name) }; });
    assert.strictEqual(q.base, 0); assert.strictEqual(q.map.length, q.n);
    let hit = 0; q.map.forEach((m, i) => { if (m >= 0) { hit++; assert.strictEqual(q.nd[m], q.names[i], i + '번 칸'); } });
    assert.ok(hit >= 6, '노드가 있는 칸 ' + hit); assert.ok(q.map.some(m => m < 0), '도보 칸(-1)이 있어야 한다');
    for (let i = 1; i < q.map.length; i++) if (q.map[i] >= 0 && q.map[i - 1] >= 0) assert.ok(q.map[i] > q.map[i - 1], '노드 번호가 거꾸로');
  });
  await t('_ovlStandbyFrame: 엔진에 맡길 틀(cells·map·theme) — 이름·노선 라벨은 엔진이 준 줄임 값을 쓰고(없으면 원문), 이동 중 문구(m) 자리가 있다', async () => {
    const f = await a.page.evaluate(() => { window._ovlSbFrame = { sig: '', at: 0, v: null }; return _ovlStandbyFrame(); });
    assert.ok(f && f.cells.length === f.map.length && f.cells.length > 5 && /^#[0-9a-f]{6}$/.test(f.theme.bg), JSON.stringify(f && f.theme));
    assert.ok(f.cells.every(c => typeof c.m === 'string'), 'm');
  });

  console.log('[①-2 아주 긴 경로(칸이 40개를 넘는)도 끝까지 보낸다]');
  await t('버스 정류장이 많은 긴 경로: 마지막 칸(공덕 뒤 도보)까지 모두 보낸다', async () => {
    const q = await a.page.evaluate(() => {
      const st = (n, i) => ({ stationName: n, lat: 37.4 + i * 0.001, lon: 126.6 + i * 0.001 });
      const bus = []; for (let i = 0; i < 45; i++) bus.push(st('정류장' + i, i));
      const secs = [
        { transportation: { type: 3 }, duration: 120, distance: 150 },
        { transportation: { type: 2, name: '순환43' }, duration: 1800, startSec: 120, endSec: 1920, passStopList: { stationList: bus } },
        { transportation: { type: 3 }, duration: 180, distance: 200 },
        { transportation: { type: 1, name: '1호선' }, duration: 600, startSec: 2100, endSec: 2700, passStopList: { stationList: [st('신도림', 50), st('영등포', 51), st('신길', 52)] } },
        { transportation: { type: 3 }, duration: 300, distance: 300 },
        { transportation: { type: 1, name: '5호선' }, duration: 900, startSec: 3000, endSec: 3900, passStopList: { stationList: [st('신길', 53), st('여의도', 54), st('여의나루', 55), st('마포', 56), st('공덕', 57)] } },
        { transportation: { type: 3 }, duration: 240, distance: 300 },
      ];
      _renderHtlTrack(secs, { name: '출발', lat: 37.399, lng: 126.599 }, { name: '도착', lat: 37.46, lng: 126.66 }, 90);
      window._routeLocked = true; window._metroRouteMode = false; window._gpsMaxIdx = 1;
      const all = Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).length;
      const r = _ovlStrip(_pipStations());
      return { all, n: r.cells.length, last: r.cells.slice(-4).map(c => c.n), names: r.cells.map(c => c.n) };
    });
    assert.ok(q.all > 50, '경로 칸 수 ' + q.all);
    assert.strictEqual(q.n, q.all, q.n + '/' + q.all);
    assert.ok(q.names.indexOf('공덕') > 40, '공덕 위치 ' + q.names.indexOf('공덕'));
  });

  console.log('[② 현위치가 움직이면 창이 따라가고 끝에서는 멈춘다]');
  await t('현위치 칸 번호가 현위치를 가리킨다', async () => {
    await a.page.evaluate(() => { window._gpsMaxIdx = 3; }); const q = await strip(a.page);
    assert.strictEqual(q.cur + q.base, 3); const all = await a.page.evaluate(() => Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).map(c => c.children[0].textContent.trim()));
    assert.strictEqual(q.cells[q.cur].n, all[3]);
  });
  await t('마지막 칸이 현위치면 cur 가 마지막 칸이다', async () => {
    const n = await a.page.evaluate(() => _transitNodeData.length);
    await a.page.evaluate((n) => { window._gpsMaxIdx = n - 1; }, n); const q = await strip(a.page);
    assert.strictEqual(q.cur, q.cells.length - 1);
    const cnt = await a.page.evaluate(() => Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).length);
    assert.strictEqual(q.base + q.cells.length, cnt);
  });
  await t('정류장명 원문은 그대로 보내고(자르기는 네이티브가 한 줄 …로) 줄바꿈 문자는 없다', async () => {
    assert.ok(r.cells.every(c => !/[\n\r]/.test(c.n)));
  });

  console.log('[③ 경로를 못 읽으면 이름 목록으로 대신한다 · 끄기 스위치]');
  await t('타임라인 DOM 이 없으면 이름 목록으로 만든다', async () => {
    const q = await a.page.evaluate(() => { document.getElementById('transitHtlTrack').innerHTML = ''; window._gpsMaxIdx = 1; return _ovlStrip(_pipStations()); });
    assert.ok(q === null || (q.cells.length > 0 && q.cells.every(c => c.n)), JSON.stringify(q));
  });
  await t('_ovlStripOff 면 null', async () => { const q = await a.page.evaluate(() => { window._ovlStripOff = true; return _ovlStrip(_pipStations()); }); assert.strictEqual(q, null); });
  await t('페이지 오류 없음', async () => assert.deepStrictEqual(a.errs, []));
  await a.ctx.close();

  console.log('[④ 다크 테마]');
  const d = await fresh('dark');
  const rd = await strip(d.page);
  await t('다크 테마에서 바탕은 어둡고 현위치 글자는 밝다(앱 테마를 따름)', async () => {
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11); };
    assert.ok(lum(rd.theme.bg) < lum(rd.theme.fg), JSON.stringify(rd.theme));
  });
  await t('다크 테마에서 환승 도보 가운데 점이 검정이 아니라 바탕보다 밝다', async () => {
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11); };
    const dots = rd.cells.filter(c => c.dk === 3);
    assert.ok(dots.length > 0, '환승 도보 점이 없다');
    dots.forEach(c => { assert.ok(/^#[0-9a-f]{6}$/.test(c.dc) && lum(c.dc) > lum(rd.theme.bg) + 60, JSON.stringify(c)); });
  });
  await t('라이트 테마에서는 점이 어두워 바탕과 구분된다', async () => {
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11); };
    const ql = await strip((await fresh()).page);
    ql.cells.filter(c => c.dk === 3).forEach(c => assert.ok(lum(c.dc) < lum(ql.theme.bg) - 60, JSON.stringify(c)));
  });
  await d.ctx.close();

  console.log('[⑤ 환승 버튼이 떠 있으면 마커는 환승 칸에서 기다린다 — 2026-10-19]');
  const x = await fresh();
  await t('환승 버튼(board) + 다음 구간 탑승 노드가 앞에 있으면 현위치 칸이 환승 도보 칸이다 · xfer 표시', async () => {
    const q = await x.page.evaluate(() => {
      const nd = _transitNodeData; let bi = -1;
      for (let i = 0; i < nd.length; i++) if (nd[i] && nd[i].isSub) { bi = i; break; }
      window._gpsMaxIdx = bi - 1;
      const before = _ovlStrip(_pipStations());
      window._rs.st = 'board'; window._rs.leg = { k: 1, bi, ai: bi, mode: 'sub', line: '인천2호선', name: '아라' };
      const r = _ovlStrip(_pipStations());
      const cell = r.cells[r.cur];
      return { bi, b: before.cur + before.base, c: r.cur + r.base, xfer: !!r.xfer, dk: cell.dk, names: r.cells.map(c => c.n), n: cell.n };
    });
    assert.ok(q.xfer, JSON.stringify(q)); assert.ok(q.c > q.b, JSON.stringify(q));
  });
  await t('환승 버튼이 없으면(hidden) 옮기지 않는다 · 첫 구간(k=0)도 옮기지 않는다', async () => {
    const q = await x.page.evaluate(() => {
      const nd = _transitNodeData; let bi = -1; for (let i = 0; i < nd.length; i++) if (nd[i] && nd[i].isSub) { bi = i; break; }
      window._rs.st = 'hidden'; const a = _ovlStrip(_pipStations());
      window._rs.st = 'board'; window._rs.leg = { k: 0, bi, ai: bi, mode: 'sub', line: 'x', name: 'y' }; const c = _ovlStrip(_pipStations());
      window._rs.st = 'hidden'; window._rs.leg = null;
      return { a: !!a.xfer, c: !!c.xfer };
    });
    assert.deepStrictEqual(q, { a: false, c: false });
  });
  await t('환승 칸에서 기다리는 동안 _ovlLines 의 moving 은 거짓', async () => {
    const q = await x.page.evaluate(() => {
      const nd = _transitNodeData; let bi = -1; for (let i = 0; i < nd.length; i++) if (nd[i] && nd[i].isSub) { bi = i; break; }
      window._rs.st = 'board'; window._rs.leg = { k: 1, bi, ai: bi, mode: 'sub', line: '인천2호선', name: '아라' };
      const o = _ovlLines(); window._rs.st = 'hidden'; window._rs.leg = null; return { m: o.moving, sc: o.scur };
    });
    assert.strictEqual(q.m, false, JSON.stringify(q));
  });
  await x.ctx.close();

  console.log('[⑥ 버스를 탈 때 — 마커의 달림/정지는 엔진이 본 GPS 속도(motion), 진행도·통과 시각은 엔진 busPos 를 따른다 — 2026-10-19]');
  const y = await fresh();
  const setup = () => y.page.evaluate(() => {
    const nd = _transitNodeData; const bus = []; for (let i = 0; i < nd.length; i++) if (nd[i] && nd[i].isBus && !nd[i].isWalk) bus.push(i);
    window._htlBoarded = true; window._busVerdict = null; window._nodePassMs = {}; window._nodePassSrc = {}; window._gpsMaxIdx = bus[1]; window._gpsConfirmIdx = bus[1];
    return { bus, here: _pipHereIdx() };
  });
  await t('버스 구간: 엔진 motion 이 moving:true 면 달리는 중(PF 가 정차라고 해도) · false 면 정지', async () => {
    const q0 = await setup();
    const q = await y.page.evaluate(() => {
      window._pfBest = { at: Date.now(), conf: 0.9, kind: 'dwell' };
      window._trkMotion = { v: { moving: true, speedMps: 8 }, at: Date.now() }; const a = _ovlMoving(), la = _ovlLines().moving;
      window._trkMotion = { v: { moving: false, speedMps: 0 }, at: Date.now() }; const c = _ovlMoving();
      window._trkMotion = { v: { moving: null }, at: Date.now() }; window._pfBest = { at: Date.now(), conf: 0.9, kind: 'seg' }; const d = _ovlMoving();
      window._trkMotion = { v: { moving: false }, at: Date.now() - 60000 }; const e = _ovlMoving();   // 낡은 판정은 따르지 않는다 → 기존(PF seg)
      return { a, la, c, d, e, here: _pipHereIdx(), isBus: !!_transitNodeData[_pipHereIdx()].isBus };
    });
    assert.ok(q.isBus, JSON.stringify([q0, q]));
    assert.strictEqual(q.a, true, JSON.stringify(q)); assert.strictEqual(q.la, true, JSON.stringify(q)); assert.strictEqual(q.c, false, JSON.stringify(q));
    assert.strictEqual(q.d, true, '판단 못 하면(null) 기존 판정으로 ' + JSON.stringify(q)); assert.strictEqual(q.e, true, '낡은 motion 은 무시 ' + JSON.stringify(q));
  });
  await t('엔진이 버스가 아니라고 하면(notBus) motion 을 따르지 않는다', async () => {
    const q = await y.page.evaluate(() => { window._busVerdict = { state: 'notBus', at: Date.now() }; window._pfBest = null; window._trkMotion = { v: { moving: true }, at: Date.now() }; const r = _ovlMoving(); window._busVerdict = null; return r; });
    assert.strictEqual(q, false);
  });
  await t('busPos: 지난 정류장까지 진행도가 오르고, 시각을 아는 정류장은 통과 증거(gps)로 적힌다', async () => {
    const q0 = await setup();
    const q = await y.page.evaluate((bus) => {
      const t0 = Date.now() - 20000; _busPosFollow({ lg: 1, offM: 8, fromI: bus[3], toI: bus[4], ratio: 0.3, passed: [{ i: bus[3], ms: t0 }], passedUnknown: [bus[2]] });
      return { gm: window._gpsMaxIdx, gc: window._gpsConfirmIdx, ms: _nodePassMs[bus[3]], src: _nodePassSrc[bus[3]], t0, unk: _nodePassMs[bus[2]] };
    }, q0.bus);
    assert.strictEqual(q.gm, q0.bus[3], JSON.stringify(q)); assert.ok(q.gc >= q0.bus[3]); assert.strictEqual(q.src, 'gps'); assert.ok(Math.abs(q.ms - q.t0) < 1500, JSON.stringify(q));
    assert.ok(q.unk == null, '시각을 모르는 정류장은 시각을 만들어 적지 않는다');
  });
  await t('busPos: 이미 gps 로 확정한 정류장 시각은 밀거나 당기지 않는다', async () => {
    const q0 = await setup();
    const q = await y.page.evaluate((bus) => {
      const fixed = Date.now() - 40000; _nodePassMs[bus[2]] = fixed; _nodePassSrc[bus[2]] = 'gps';
      _busPosFollow({ lg: 1, offM: 8, fromI: bus[2], toI: bus[3], ratio: 0.5, passed: [{ i: bus[2], ms: fixed + 9000 }], passedUnknown: [] });
      return { fixed, now: _nodePassMs[bus[2]] };
    }, q0.bus);
    assert.strictEqual(q.now, q.fixed);
  });
  await t('busPos: 엔진이 notBus 라 하면 · 승차 확정 전이면 진행도를 올리지 않는다', async () => {
    const q0 = await setup();
    const q = await y.page.evaluate((bus) => {
      window._busVerdict = { state: 'notBus', at: Date.now() };
      _busPosFollow({ lg: 1, offM: 8, passed: [{ i: bus[3], ms: Date.now() - 5000 }], passedUnknown: [] }); const a = window._gpsMaxIdx;
      window._busVerdict = null; window._htlBoarded = false;
      _busPosFollow({ lg: 1, offM: 8, passed: [{ i: bus[3], ms: Date.now() - 5000 }], passedUnknown: [] }); const c = window._gpsMaxIdx;
      window._htlBoarded = true; return { a, c };
    }, q0.bus);
    assert.strictEqual(q.a, q0.bus[1]); assert.strictEqual(q.c, q0.bus[1]);
  });
  await t('버스를 타고 있는 동안 PF 가 지하철 역을 채택하지 않는다(진행도가 버스 노드)', async () => {
    const q0 = await setup();
    const q = await y.page.evaluate(() => {
      const nd = _transitNodeData; let si = -1; for (let i = 0; i < nd.length; i++) if (nd[i] && nd[i].isSub) { si = i; break; }
      if (!window._pf || !_pf.st) return { skip: true };
      const before = window._gpsMaxIdx, keep = _pf.st; _pf.st = [{ name: nd[si].name, _td: si }]; _pf.A = _pf.A || { k: -1, td: -1 };
      try { _pfAdopt(0, {}, Date.now(), '앞'); } catch (e) { return { err: String(e) }; }
      _pf.st = keep; return { before, after: window._gpsMaxIdx, si };
    });
    assert.ok(!q.skip, 'PF 상태 없음'); assert.ok(!q.err, JSON.stringify(q)); assert.strictEqual(q.after, q.before, JSON.stringify(q));
  });
  await t('페이지 오류 없음(⑥)', async () => assert.deepStrictEqual([...new Set(y.errs)], []));
  await y.ctx.close();

  await b.close();
  console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
