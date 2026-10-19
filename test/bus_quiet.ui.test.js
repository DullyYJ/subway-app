// 버스 정류장 화면 '조용한 갱신' 시험 — 2026-10-19 (YJ: "버스정류장이 계속 새로고침돼서 볼 수가 없어 /
//   현재 위치가 이전 조회 대비 100m 미만이면 재조회하지 마 / 시간이 바뀌는 건 계속 새로고침하지 말고 시간만 조용히 바꿔")
//   · 주변 정류장: 100m 미만 이동이면(시간이 지나 낡았어도) 목록을 다시 조회·재그림하지 않는다. 100m 이상이면 다시 조회한다. 🔄(force)는 그대로 다시 그린다.
//   · 도착 정보: 내 정류장 응답(partial)이 이웃 병합 응답보다 노선이 적어도 줄을 허물지 않는다(시간만 제자리). 최종 응답에서 노선 구성이 바뀌어도 애니메이션·'방향 확인 중…' 없이 조용히.
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };
const NOW = new Date('2026-10-19T18:30:00+09:00');
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
    await page.evaluate(() => {
      window.__fetchN = 0; window.__loc = [37.5547, 126.9726];
      window._fetchNearStops = function (la, ln, cb) { window.__fetchN++; cb(null, [
        { nodeid: 'ICB1', nodenm: '아라역5번출구', citycode: '23', cityCode: '23', gpslati: la + 0.0001, gpslong: ln, dist: 30 },
        { nodeid: 'ICB2', nodenm: '아라센트럴파크', citycode: '23', cityCode: '23', gpslati: la + 0.0003, gpslong: ln, dist: 80 }]); };
      window._busRefreshLocation = function (cb) { cb(window.__loc[0], window.__loc[1]); };
      window.__items = function (ids) { return ids.map(function (r, i) { return { routeid: 'R' + r, routeno: r, arrtime: 300 + i * 60, arrprevstationcnt: 5, routetp: '간선버스', dirName: '방면' + r }; }); };
      window.__arrSet = ['931', '75', '991'];
      window.__arrPartial = null;
      window._busArrFetchMerged = function (cc, stop, onPartial) {
        if (window.__arrPartial && onPartial) onPartial(window.__items(window.__arrPartial));
        return Promise.resolve(window.__items(window.__arrSet));
      };
      window._busViewMode = 'near';
    });
    return { ctx, page, errs };
  }
  // 백그라운드 미리 받기(_prefetchNearStops)도 같은 조회 함수를 쓰므로, '이 호출이 만든 조회 수'만 센다
  const load = async (x, force) => { const n0 = await x.page.evaluate(() => window.__fetchN); await x.page.evaluate((f) => { window.__pre = window._prefetchNearStops; window._prefetchNearStops = function () {}; loadMapNearStops(f); }, !!force); await x.page.clock.runFor(300); const n1 = await x.page.evaluate(() => window.__fetchN); x.fetches = (x.fetches || 0) + (n1 - n0); };
  const fetches = (x) => x.fetches;
  const mark = (x) => x.page.evaluate(() => { document.querySelectorAll('#mapBusStopList .map-bus-stop-card').forEach(function (c) { c.__m = 1; }); document.querySelectorAll('#mapBusStopList .kbus-row').forEach(function (r) { r.__m = 1; }); return document.querySelectorAll('#mapBusStopList .map-bus-stop-card').length; });
  const kept = (x) => x.page.evaluate(() => ({ cards: document.querySelectorAll('#mapBusStopList .map-bus-stop-card').length, cardsKept: document.querySelectorAll('#mapBusStopList .map-bus-stop-card').length === document.querySelectorAll('#mapBusStopList .map-bus-stop-card').length && Array.prototype.every.call(document.querySelectorAll('#mapBusStopList .map-bus-stop-card'), c => c.__m === 1), rows: document.querySelectorAll('#mapBusStopList .kbus-row').length, rowsKept: Array.prototype.every.call(document.querySelectorAll('#mapBusStopList .kbus-row'), r => r.__m === 1) }));

  await t('주변 정류장: 100m 미만 이동이면 시간이 지나 낡았어도 다시 조회·재그림하지 않는다 · 100m 이상이면 다시 조회한다', async () => {
    const x = await fresh(); await load(x, true);
    assert.strictEqual(fetches(x), 1, '처음 조회 1번');
    const n0 = await mark(x); assert(n0 >= 1, '카드가 그려진다 ' + n0);
    await x.page.clock.runFor(130000);                                           // 60초(낡음 기준)를 넘긴다
    await x.page.evaluate(() => { window.__loc = [37.5547 + 0.00045, 126.9726]; });   // 약 50m
    await load(x, false);
    assert.strictEqual(fetches(x), 1, '50m 이동 · 낡았어도 재조회 없음');
    let k = await kept(x); assert(k.cardsKept && k.cards === n0, '카드가 그대로(재그림 없음) ' + JSON.stringify(k));
    await x.page.evaluate(() => { window.__loc = [37.5547 + 0.00095, 126.9726]; });   // 약 105m
    await load(x, false);
    assert.strictEqual(fetches(x), 2, '105m 이동 → 다시 조회');
    assert.deepStrictEqual(x.errs, []);
    await x.ctx.close();
  });

  await t('주변 정류장: 99m 에서 99m 더(기준은 마지막으로 그린 자리) — 누적 100m 를 넘으면 그때 조회', async () => {
    const x = await fresh(); await load(x, true);
    await x.page.evaluate(() => { window.__loc = [37.5547 + 0.0007, 126.9726]; });    // 약 78m
    await load(x, false); assert.strictEqual(fetches(x), 1);
    await x.page.evaluate(() => { window.__loc = [37.5547 + 0.0012, 126.9726]; });    // 처음 자리에서 약 133m
    await load(x, false); assert.strictEqual(fetches(x), 2, '기준은 화면에 그린 자리 — 누적 이동이 100m 를 넘으면 조회');
    await x.ctx.close();
  });

  await t('🔄(force)는 100m 미만이어도 그대로 다시 조회·다시 그린다', async () => {
    const x = await fresh(); await load(x, true); await load(x, true);
    assert.strictEqual(fetches(x), 2);
    await x.ctx.close();
  });

  await t('도착 정보: 내 정류장 응답(partial)이 노선이 적어도 줄을 허물지 않고 시간만 제자리에서 바뀐다', async () => {
    const x = await fresh(); await load(x, true);
    const rows0 = await x.page.evaluate(() => document.querySelectorAll('#mapBusStopList .kbus-row').length);
    assert(rows0 >= 3, '처음 줄 ' + rows0);
    await mark(x);
    await x.page.evaluate(() => { window.__arrPartial = ['931']; window.__items0 = window.__items; window.__items = function (ids) { return window.__items0(ids).map(function (a) { a.arrtime -= 40; return a; }); }; });
    await x.page.evaluate(() => _refreshMapBusArrivals());
    // partial 만 도착한 순간(최종 응답 전)을 보려고 최종 응답을 늦춘다
    await x.page.evaluate(() => { window._busArrFetchMerged = function (cc, stop, onPartial) { if (onPartial) onPartial(window.__items(['931'])); return new Promise(function () {}); }; });
    await x.page.evaluate(() => { document.querySelectorAll('#mapBusStopList .map-bus-stop-card').forEach(function (c) { _loadMapBusArrival(window._mapBusCards[0].stop, window._mapBusCards[0].cardIdx); }); });
    await x.page.clock.runFor(200);
    const k = await kept(x);
    assert(k.rows >= rows0 && k.rowsKept, 'partial 에서 줄이 그대로(사라졌다 다시 생기지 않는다) ' + JSON.stringify(k) + ' 처음 ' + rows0);
    await x.ctx.close();
  });

  await t('도착 정보: 최종 응답에서 노선이 늘어도 펼쳐지는 애니메이션·방향 깜박임 없이 조용히 바뀐다', async () => {
    const x = await fresh(); await load(x, true);
    await x.page.clock.runFor(1500);                                              // 처음 펼침(애니메이션)이 끝난다
    const d0 = await x.page.evaluate(() => { const e = document.querySelector('#mapBusStopList .kbus-dir'); return e ? e.textContent : null; });
    assert(/방면/.test(d0 || ''), '방향 라벨이 있다 ' + d0);
    await x.page.evaluate(() => { window.__arrSet = ['931', '75', '991', '77']; _loadMapBusArrival(window._mapBusCards[0].stop, window._mapBusCards[0].cardIdx); });
    await x.page.clock.runFor(100);
    const r = await x.page.evaluate(() => { const c = document.getElementById('mapBusCard_' + window._mapBusCards[0].cardIdx); const rows = c.querySelectorAll('.kbus-row'); return { n: rows.length, anim: c.querySelectorAll('.kbus-in').length, dirs: Array.prototype.map.call(c.querySelectorAll('.kbus-dir'), e => e.textContent) }; });
    assert.strictEqual(r.n, 4, '새 노선이 얹힌다 ' + JSON.stringify(r));
    assert.strictEqual(r.anim, 0, '다시 그려도 펼침 애니메이션 없음 ' + JSON.stringify(r));
    assert(r.dirs.every(s => /방면/.test(s)), '방향 라벨이 \'확인 중…\' 으로 돌아가지 않는다 ' + JSON.stringify(r));
    await x.ctx.close();
  });

  await t('끄기(_busQuietOff)면 예전 규칙(낡으면 다시 조회)', async () => {
    const x = await fresh(); await load(x, true);
    await x.page.evaluate(() => { window._busQuietOff = true; });
    await x.page.clock.runFor(130000);
    await load(x, false);
    assert.strictEqual(fetches(x), 2, '예전: 60초 넘으면 다시 조회');
    await x.ctx.close();
  });

  await b.close();
  console.log('\n' + pass + ' 통과, ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
