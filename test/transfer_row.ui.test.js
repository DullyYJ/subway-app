// 환승 표시 + 장거리 고르기 상자 노출 시험 — 2026-10-17
//   원칙: "계산은 엔진이, 그림은 앱이". 엔진이 준 info.transfers / subPath[].trainChanges 만 그린다(지어내지 않는다).
//   · 환승 줄(#transitXferRow): 엔진 목록 그대로 문장으로 옮긴다. 없으면(옛 엔진) 숨긴다
//   · 타임라인: 환승 이동은 '도보'가 아니라 '환승' 으로, 도착할 노선 배지가 크게. 같은 노선 안 일반↔급행 갈아타기 역에도 배지
//   · 장거리 고르기 상자(열차 13:47 ▾): '🚄 장거리' 탭(cacheSource engine_longdist)에서만 보이고, 최단시간 등에서는 숨는다
// 실행: node test/transfer_row.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 500)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh() {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript(() => { try { localStorage.setItem('locDisc', '1'); } catch (e) {} });
    await page.goto('file://' + html); await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => {
      const ov = document.getElementById('locDiscOv'); if (ov) ov.remove();
      const stn = (n, i) => ({ stationName: n, x: 126.7 + i * 0.01, y: 37.4 + i * 0.01 });
      // 부평 → (1호선) → 구로 → 환승(도보 1분) → (경부선) → 두정   — 카카오가 알려 주는 모양 그대로
      window.__path = (withTransfers) => ({
        info: Object.assign({ totalTime: 60, transferCount: 1, pathType: 3, tab: 'fast' }, withTransfers ? { transfers: [
          { kind: 'line', at: '구로', boardAt: '구로', fromType: 1, fromLine: '1호선', toType: 1, toLine: '천안급행', walkMin: 1, secIdx: 1, xferSecIdx: 2 }] } : {}),
        subPath: [
          { trafficType: 3, sectionTime: 3, startSec: 0, endSec: 180, lane: [{ name: '도보' }], startName: '내 위치', endName: '부평' },
          { trafficType: 1, sectionTime: 30, startSec: 180, endSec: 1980, lane: [{ name: '1호선' }], startName: '부평', endName: '구로', passStopList: { stations: [stn('부평', 0), stn('신도림', 1), stn('구로', 2)] } },
          { trafficType: 3, sectionTime: 1, startSec: 1980, endSec: 2040, lane: [{ name: '환승' }], startName: '구로', endName: '구로' },
          { trafficType: 1, sectionTime: 25, startSec: 2040, endSec: 3540, lane: [{ name: '천안급행' }], startName: '구로', endName: '두정', passStopList: { stations: [stn('구로', 2), stn('안양', 3), stn('두정', 4)] } },
          { trafficType: 3, sectionTime: 2, startSec: 3540, endSec: 3660, lane: [{ name: '도보' }], startName: '두정', endName: '도착지' }
        ]
      });
    });
    return { ctx, page, errs };
  }
  const draw = (x, withTransfers) => x.page.evaluate((w) => {
    const r = _convertSinglePathToRoute(window.__path(w));
    _renderHtlTrack(r.sections, { name: '출발' }, { name: '도착' }, 60, r.transfers);
    _renderXferRow(r);
    const row = document.getElementById('transitXferRow');
    return { transfers: r.transfers, rowShown: getComputedStyle(row).display !== 'none', rowText: row.textContent, track: document.getElementById('transitHtlTrack').textContent };
  }, withTransfers);

  console.log('[① 엔진이 준 환승을 그대로 알려 준다]');
  await t('환승 줄: "구로에서 1호선 → 천안급행 환승 · 도보 1분" (엔진 값 그대로)', async () => {
    const x = await fresh(); const r = await draw(x, true);
    assert.ok(r.rowShown, '환승 줄이 보여야 한다'); assert.ok(/환승 1번/.test(r.rowText), r.rowText);
    assert.ok(/구로에서 1호선 → 천안급행 환승 · 도보 1분/.test(r.rowText), r.rowText); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('타임라인: 환승 이동은 "도보"가 아니라 "환승" + 갈아탈 노선 배지', async () => {
    const x = await fresh(); const r = await draw(x, true);
    assert.ok(/환승/.test(r.track), r.track); assert.ok(/↔\s*천안급행/.test(r.track), r.track);
    const big = await x.page.evaluate(() => [...document.querySelectorAll('#transitHtlTrack span')].filter(s => /↔/.test(s.textContent)).map(s => parseFloat(getComputedStyle(s).fontSize)));
    assert.ok(big.length && Math.max(...big) >= 8, '배지 글자가 6.5px 로 작으면 안 된다: ' + big); await x.ctx.close();
  });
  await t('옛 엔진(transfers 없음): 줄은 숨고 아무것도 지어내지 않는다', async () => {
    const x = await fresh(); const r = await draw(x, false);
    assert.strictEqual(r.transfers, null); assert.ok(!r.rowShown); assert.strictEqual(r.rowText, '');
    assert.ok(!/환승/.test(r.track), '엔진이 환승이라 하지 않았으면 타임라인에 환승 글자가 없다: ' + r.track); await x.ctx.close();
  });
  await t('걷기 환승(역이 다름)·버스끼리·열차 갈아타기 문장', async () => {
    const x = await fresh();
    const o = await x.page.evaluate(() => ({
      walk: _xferLine({ kind: 'walk', at: '아라', boardAt: '아라역4번출구', toType: 2, toLine: '931', walkMin: 5 }),
      bus: _xferLine({ kind: 'bus', at: '시청', fromType: 2, fromLine: '1', toType: 2, toLine: '2', walkMin: 0 }),
      train: _xferLine({ kind: 'train', at: '구로', fromType: 1, fromLine: '1호선', service: 'express' })
    }));
    assert.strictEqual(o.walk, '아라 하차 → 도보 5분 → 아라역4번출구에서 931번 승차');
    assert.strictEqual(o.bus, '시청에서 1번 → 2번 환승');
    assert.strictEqual(o.train, '구로에서 급행 열차로 갈아타요 (1호선 안에서 열차가 바뀌어요)'); await x.ctx.close();
  });
  await t('같은 노선 안 일반→급행: 구간이 하나여도 그 역에 "급행 환승" 배지, 다른 역엔 없다', async () => {
    const x = await fresh();
    const r = await x.page.evaluate(() => {
      const stn = (n, i) => ({ stationName: n, x: 126.7 + i * 0.01, y: 37.4 + i * 0.01 });
      const p = { info: { totalTime: 50, transferCount: 0, tab: 'fast', transfers: [{ kind: 'train', at: '구로', boardAt: '구로', fromType: 1, fromLine: '1호선', toType: 1, toLine: '1호선', service: 'express', walkMin: 0, secIdx: 1, stopIdx: 2 }] },
        subPath: [{ trafficType: 3, sectionTime: 3, startSec: 0, endSec: 180, lane: [{ name: '도보' }], startName: '내 위치', endName: '부평' },
          { trafficType: 1, sectionTime: 45, startSec: 180, endSec: 2880, lane: [{ name: '1호선' }], startName: '부평', endName: '두정', trainChanges: [{ at: '구로', idx: 2, to: 'express' }], passStopList: { stations: [stn('부평', 0), stn('신도림', 1), stn('구로', 2), stn('안양', 3), stn('두정', 4)] } },
          { trafficType: 3, sectionTime: 2, startSec: 2880, endSec: 3000, lane: [{ name: '도보' }], startName: '두정', endName: '도착지' }] };
      const rt = _convertSinglePathToRoute(p); _renderHtlTrack(rt.sections, { name: '출발' }, { name: '도착' }, 50, rt.transfers); _renderXferRow(rt);
      _renderHtlTrack(rt.sections, { name: '출발' }, { name: '도착' }, 50, rt.transfers);   // 다시 그려도 같아야 한다(원본 데이터를 소모하지 않는다)
      const badges = [...document.querySelectorAll('#transitHtlTrack span')].filter(s => /급행 환승/.test(s.textContent));
      const node = badges[0] && badges[0].closest('[id^=tnode_], div[style*="flex-direction:column"]');
      return { n: badges.length, text: node ? node.textContent : '', row: document.getElementById('transitXferRow').textContent };
    });
    assert.strictEqual(r.n, 1, '배지 개수 ' + r.n); assert.ok(/구로/.test(r.text), r.text); assert.ok(/구로에서 급행 열차로 갈아타요/.test(r.row), r.row); await x.ctx.close();
  });

  console.log('[② 장거리 고르기 상자는 장거리 탭에서만]');
  const ldCase = async (src) => {
    const x = await fresh();
    const r = await x.page.evaluate((src) => {
      const p = window.__path(true); p.info.longDist = true; p.info.ldMode = 'train'; p.info.ldGrade = '무궁화'; p.info.ldDepTs = 1;
      p.info.candidates = [{ mode: 'train', depLabel: '13:47', depTs: 1, totalMin: 89 }, { mode: 'bus', depLabel: '13:50', depTs: 2, totalMin: 120 }];
      const rt = _convertSinglePathToRoute(p);
      _renderTransitResultCard({ routes: [rt] }, { name: '부평', lat: 37.49, lng: 126.72 }, { name: '두정', lat: 36.83, lng: 127.14 }, src);
      const w = document.getElementById('ldGradeChips'); return { disp: getComputedStyle(w).display, text: w.textContent };
    }, src);
    const errs = x.errs.slice(); await x.ctx.close(); return Object.assign(r, { errs });
  };
  await t('최단시간 등 일반 탭(cacheSource engine): 고르기 상자 숨김', async () => {
    const r = await ldCase('engine'); assert.strictEqual(r.disp, 'none', r.text); assert.deepStrictEqual(r.errs, []);
  });
  await t('장거리 탭(engine_longdist): 열차/고속버스 고르기 상자가 보인다 (기능 보존)', async () => {
    const r = await ldCase('engine_longdist'); assert.notStrictEqual(r.disp, 'none'); assert.ok(/열차/.test(r.text), r.text); assert.deepStrictEqual(r.errs, []);
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
