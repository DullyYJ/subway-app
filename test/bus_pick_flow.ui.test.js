// 버스 경로에서 출발지·도착지 고르기 흐름 시험 — 2026-10-15 (YJ)
//   · 정류장을 눌러도 지도·길찾기 패널이 펼쳐지지 않는다 → 하단에 [출발지로 설정]
//   · 출발지 설정 → '출발지로 설정되었습니다' 팝업, 경로 화면 유지, 하단 '다른 정류장을 누르면 도착지로 설정됩니다' + [도착지는 역으로 설정]
//   · 다른 정류장 누름 → 도착지 설정 + 경로탐색(fmapDoRoute) + 홈 이동
//   · [도착지는 역으로 설정] → 노선도(지하철) 탭, 역을 누르면 시간표 시트 + 하단 [도착지로 설정]만 → 누르면 경로탐색 + 홈
// 계산은 엔진이 한다 — 여기서는 앱이 상태를 넘기고 화면만 그리는지 본다.
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 600)); } };
const NOW = new Date('2026-10-15T09:30:00+09:00');
const STOPS = [
  { nodeid: 'ICB1', nodenm: '송도스포츠센터', nodeno: '39721', nodeord: 1, gpslati: 37.38, gpslong: 126.65, updowncd: 0 },
  { nodeid: 'ICB2', nodenm: '한진', nodeno: '38540', nodeord: 2, gpslati: 37.39, gpslong: 126.66, updowncd: 0 },
  { nodeid: 'ICB3', nodenm: '선광', nodeno: '38543', nodeord: 3, gpslati: 37.40, gpslong: 126.67, updowncd: 0 },
  { nodeid: 'ICB4', nodenm: '대동도어', nodeno: '39983', nodeord: 4, gpslati: 37.41, gpslong: 126.68, updowncd: 0 }
];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh() {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5547, longitude: 126.9726 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort(); });
    await page.addInitScript(() => { try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('bgPermGuided', '1'); } catch (e) {} });
    await page.clock.install({ time: NOW });
    await page.goto('file://' + html); await page.clock.runFor(3500);
    // 경로탐색은 엔진 호출이라 여기서는 '불렸는지'만 본다
    await page.evaluate(() => { window.__routed = []; window.fmapDoRoute = function () { window.__routed.push({ s: _fmapStart && { t: _fmapStart.type, n: _fmapStart.name }, d: _fmapDest && { t: _fmapDest.type, n: _fmapDest.name } }); }; });
    return { ctx, page, errs };
  }
  const openRoute = async (x) => {
    await x.page.evaluate((stops) => {
      const m = document.getElementById('busRouteModal'); m.style.display = 'flex'; m.dataset.cityCode = '23'; window._busRouteModalOpen = true;
      _renderBusRoute(stops, []);
    }, STOPS);
    await x.page.clock.runFor(200);
  };
  const clickRow = async (x, i) => { await x.page.evaluate((i) => document.querySelector('#busRouteBody .brs-row[data-idx="' + i + '"]').click(), i); await x.page.clock.runFor(100); };
  const bar = (x) => x.page.evaluate(() => { const e = document.getElementById('brPickBar'); return { shown: !!e && e.style.display !== 'none', text: e ? e.innerText.replace(/\s+/g, ' ').trim() : '', btns: e ? [...e.querySelectorAll('button')].map(n => n.innerText.trim()) : [] }; });
  const pop = (x) => x.page.evaluate(() => { const e = document.getElementById('pickPop'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; });
  const tabOn = (x) => x.page.evaluate(() => (document.querySelector('.tab-body.active') || {}).id);
  const modalOn = (x) => x.page.evaluate(() => document.getElementById('busRouteModal').style.display !== 'none');

  await t('정류장을 눌러도 지도·길찾기 패널은 없고, 하단에 [출발지로 설정]이 생긴다', async () => {
    const x = await fresh(); await openRoute(x);
    assert.strictEqual((await bar(x)).shown, false, '누르기 전엔 하단 바 없음');
    assert(!(await x.page.evaluate(() => /지도 · 길찾기/.test(document.getElementById('busRouteBody').innerText))), '"지도 · 길찾기" 글자 제거');
    await clickRow(x, 1);
    assert.strictEqual(await x.page.evaluate(() => document.querySelectorAll('.food-map-panel').length), 0, '지도 패널 없음');
    const bb = await bar(x);
    assert(bb.shown && /한진/.test(bb.text) && bb.btns.length === 1 && /출발지로 설정/.test(bb.btns[0]), '하단 바 ' + JSON.stringify(bb));
    assert.strictEqual(await x.page.evaluate(() => document.querySelectorAll('#busRouteBody .brs-pick').length), 1, '눌러 둔 줄 표시');
    // 하단 버튼이 하단 탭(.bnav)에 가려지지 않는다(버튼 한가운데를 눌렀을 때 닿는 것이 그 버튼)
    const hit = await x.page.evaluate(() => { const b = document.querySelector('#brPickBar .brp-main'), r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), nv = document.querySelector('.bnav').getBoundingClientRect(); return { ok: e === b || b.contains(e), bottom: r.bottom, navTop: nv.top }; });
    assert(hit.ok && hit.bottom <= hit.navTop + 1, '버튼이 탭에 가려지지 않는다 ' + JSON.stringify(hit));
    assert(!(await x.page.evaluate(() => /🚏/.test(document.getElementById('busRouteModal').innerText))), '사람 모양처럼 보이는 정류장 이모지(🚏) 제거');
    await clickRow(x, 2);                                                   // 다른 줄을 누르면 후보만 바뀐다
    assert(/선광/.test((await bar(x)).text) && !(await x.page.evaluate(() => !!(_fmapStart && _fmapStart.name === '선광'))), '후보 변경, 아직 출발지 아님');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('[출발지로 설정] → 팝업 "출발지로 설정되었습니다", 경로 화면 유지, 하단은 "다른 정류장을 누르면 도착지로 설정됩니다" + [도착지는 역으로 설정]', async () => {
    const x = await fresh(); await openRoute(x);
    await x.page.evaluate(() => { _fmapDest = { type: 'bus', name: '옛도착지' }; });        // 이전 도착지가 남아 있어도 곧바로 탐색하지 않는다
    await clickRow(x, 1);
    await x.page.evaluate(() => document.querySelector('#brPickBar .brp-main').click()); await x.page.clock.runFor(100);
    assert(/출발지로 설정되었습니다/.test(await pop(x) || ''), '팝업 ' + await pop(x));
    const st = await x.page.evaluate(() => ({ s: _fmapStart && [_fmapStart.type, _fmapStart.name, _fmapStart.nodeId], d: _fmapDest, pick: !!_pick, routed: window.__routed.length }));
    assert.deepStrictEqual(st.s, ['bus', '한진', 'ICB2']); assert.strictEqual(st.d, null, '이전 도착지는 비움'); assert.strictEqual(st.routed, 0, '아직 경로탐색 안 함');
    assert(await modalOn(x), '경로 화면 유지');
    const bb = await bar(x);
    assert(bb.shown && /다른 정류장을 누르면 도착지로 설정됩니다/.test(bb.text) && /한진/.test(bb.text) && /도착지는 역으로 설정/.test(bb.btns.join('|')), '하단 안내 ' + JSON.stringify(bb));
    assert.strictEqual(await x.page.evaluate(() => document.querySelectorAll('#busRouteBody .brs-pstart').length), 1, '출발지 줄 표시');
    await x.page.clock.runFor(2000); assert.strictEqual(await pop(x), null, '팝업은 사라진다');
    // 출발지와 같은 정류장을 누르면 도착지가 되지 않는다
    await clickRow(x, 1);
    assert.strictEqual((await x.page.evaluate(() => window.__routed.length)), 0); assert(await x.page.evaluate(() => !!_pick), '그대로 도착지 고르는 중');
    // 다시 열어도(닫았다 열기) 도착지 고르는 중이 이어진다
    await x.page.evaluate(() => closeBusRoute()); await openRoute(x);
    assert(/다른 정류장을 누르면/.test((await bar(x)).text), '다시 열어도 하단 안내');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('다른 정류장을 누르면 도착지로 설정 → 경로탐색(엔진) 호출 · 홈 이동 · 팝업', async () => {
    const x = await fresh(); await x.page.evaluate(() => switchTab('map', document.getElementById('ni-map'))); await x.page.clock.runFor(500); await openRoute(x);
    await clickRow(x, 1); await x.page.evaluate(() => document.querySelector('#brPickBar .brp-main').click()); await x.page.clock.runFor(100);
    await clickRow(x, 3); await x.page.clock.runFor(400);
    const r = await x.page.evaluate(() => window.__routed);
    assert.strictEqual(r.length, 1, '경로탐색 한 번 ' + JSON.stringify(r));
    assert.deepStrictEqual(r[0], { s: { t: 'bus', n: '한진' }, d: { t: 'bus', n: '대동도어' } });
    assert.strictEqual(await tabOn(x), 'tab-home', '홈으로 이동'); assert.strictEqual(await modalOn(x), false, '경로 화면 닫힘');
    assert(/도착지로 설정되었습니다/.test(await pop(x) || ''), '팝업 ' + await pop(x));
    assert.strictEqual(await x.page.evaluate(() => window._pick), null, '흐름 끝');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('[도착지는 역으로 설정] → 노선도(지하철) 탭 · 역을 누르면 시간표 시트 + [도착지로 설정]만 → 누르면 경로탐색 · 홈 이동', async () => {
    const x = await fresh(); await openRoute(x);
    await clickRow(x, 1); await x.page.evaluate(() => document.querySelector('#brPickBar .brp-main').click()); await x.page.clock.runFor(100);
    const hint0 = await x.page.evaluate(() => document.getElementById('svgHint').textContent.replace(/\s+/g, ' ').trim());
    await x.page.evaluate(() => document.querySelector('#brPickBar .brp-main').click()); await x.page.clock.runFor(600);
    assert.strictEqual(await tabOn(x), 'tab-map', '노선도 탭'); assert.strictEqual(await modalOn(x), false, '경로 화면 닫힘');
    assert(await x.page.evaluate(() => document.getElementById('mapSubwayPanel').style.display !== 'none'), '지하철 노선도가 보인다 ' + await x.page.evaluate(() => JSON.stringify([document.getElementById('mapSubwayPanel').style.display, document.getElementById('mapBusPanel').style.display, window._pickDestMode, (document.querySelector('.tab-body.active')||{}).id])));
    assert.strictEqual(await x.page.evaluate(() => window._pickDestMode), true);
    assert(/도착지로 설정할 역/.test(await x.page.evaluate(() => document.getElementById('svgHint').textContent)), '안내 글');
    // 역을 누름(앱이 실제 탭에서 부르는 그 함수) — 출발/도착 팝업 대신 시간표 시트
    await x.page.evaluate(() => svgShowPopup('서울역', ['1호선', '4호선'])); await x.page.clock.runFor(900);
    const ui = await x.page.evaluate(() => { const s = document.getElementById('nmTtSheet'); return { pop: !!document.getElementById('svgStationPop'), sheet: !!s, title: s && s.querySelector('#nmTtTitle').textContent, btns: s ? [...s.querySelectorAll('button')].map(n => n.innerText.trim()).filter(Boolean) : [], pickBtns: s ? s.querySelectorAll('#nmTtPick button').length : 0 }; });
    assert(!ui.pop && ui.sheet && /서울역 시간표/.test(ui.title), '시간표 시트 ' + JSON.stringify(ui));
    assert.strictEqual(ui.pickBtns, 1, '하단 버튼은 하나'); assert(ui.btns.some(n => /도착지로 설정/.test(n)) && !ui.btns.some(n => /출발역|도착역/.test(n)), '버튼 ' + JSON.stringify(ui.btns));
    await x.page.evaluate(() => document.getElementById('nmTtPickBtn').click()); await x.page.clock.runFor(400);
    const r = await x.page.evaluate(() => window.__routed);
    assert.strictEqual(r.length, 1, '경로탐색 한 번 ' + JSON.stringify(r));
    assert.deepStrictEqual(r[0], { s: { t: 'bus', n: '한진' }, d: { t: 'subway', n: '서울역' } });
    assert.strictEqual(await tabOn(x), 'tab-home', '홈으로 이동');
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet') || !!document.getElementById('svgStationPop')), false, '시트 닫힘');
    const after = await x.page.evaluate(() => ({ mode: window._pickDestMode, pick: window._pick, hint: document.getElementById('svgHint').textContent.replace(/\s+/g, ' ').trim() }));
    assert.strictEqual(after.mode, false); assert.strictEqual(after.pick, null); assert.strictEqual(after.hint, hint0, '안내 글 복원');
    assert(/도착지로 설정되었습니다/.test(await pop(x) || ''), '팝업');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('취소 · 탭을 떠남: 도착지 고르기 흐름이 끝나고 평소 노선도(출발/도착 팝업)로 돌아간다', async () => {
    const x = await fresh(); await openRoute(x);
    await clickRow(x, 1); await x.page.evaluate(() => document.querySelector('#brPickBar .brp-main').click()); await x.page.clock.runFor(100);
    await x.page.evaluate(() => document.querySelector('#brPickBar .brp-sub').click()); await x.page.clock.runFor(100);
    assert.strictEqual(await x.page.evaluate(() => _pick), null, '취소'); assert.strictEqual((await bar(x)).shown, false, '바 사라짐');
    // 역 고르기 중 다른 탭으로 가면 끝난다
    await clickRow(x, 1); await x.page.evaluate(() => document.querySelector('#brPickBar .brp-main').click());
    await x.page.evaluate(() => document.querySelector('#brPickBar .brp-main').click()); await x.page.clock.runFor(500);
    assert.strictEqual(await x.page.evaluate(() => window._pickDestMode), true);
    await x.page.evaluate(() => switchTab('shop', document.getElementById('ni-shop'))); await x.page.clock.runFor(300);
    assert.strictEqual(await x.page.evaluate(() => window._pickDestMode), false, '탭을 떠나면 끝');
    await x.page.evaluate(() => switchTab('map', document.getElementById('ni-map'))); await x.page.clock.runFor(500);
    await x.page.evaluate(() => svgShowPopup('시청', ['1호선', '2호선'])); await x.page.clock.runFor(900);
    assert(await x.page.evaluate(() => !!document.getElementById('svgStationPop') && !document.getElementById('nmTtSheet')), '평소처럼 팝업');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
