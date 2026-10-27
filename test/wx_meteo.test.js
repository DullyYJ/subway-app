// 날씨 직접 받기(wxMeteo · sceneWeather, s219) 시험.  실행: node test/wx_meteo.test.js
// 예전엔 subway-api 워커의 /weather 를 불렀는데 배포본에 그 경로가 없어 날씨가 한 번도 안 나왔다 → Open-Meteo 를 엔진이 직접 받는다.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'engine/scene-worker.js'), 'utf8');
const code = sw.slice(sw.indexOf('var WX_CODES'), sw.indexOf('async function handleScene'));
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ' ' + e.message); } };
const mk = (resp, calls) => new Function('fetch', 'SCENE_WX_CACHE', 'AbortController', code + ';return {wxMeteo,sceneWeather}')(async (u) => { calls.push(u); return resp; }, {}, AbortController);
const DATA = { current: { time: '2026-10-26T09:00', temperature_2m: 11.6, apparent_temperature: 9.8, relative_humidity_2m: 60, weather_code: 61, wind_speed_10m: 3.24 }, hourly: { time: ['2026-10-26T08:00', '2026-10-26T09:00', '2026-10-26T10:00', '2026-10-26T11:00', '2026-10-26T12:00'], precipitation_probability: [90, 20, 70, 40, 99] }, daily: { uv_index_max: [3.4], temperature_2m_max: [15.2], temperature_2m_min: [7.1] } };
(async () => {
  const calls = [];
  const m = mk({ ok: true, json: async () => DATA }, calls);
  await t('Open-Meteo 응답을 온도 · 강수확률(지금부터 3시간 최대) · 문구로 바꾼다', async () => {
    const w = await m.sceneWeather(37.5, 127.0);
    assert.deepStrictEqual([w.temp, w.rain, w.txt, w.feel, w.uv, w.hum], [12, 70, '비', 10, 3.4, 60]);
    assert.ok(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=37\.500/.test(calls[0]));
  });
  await t('10분 캐시 · 한국 밖 좌표는 null · 실패해도 죽지 않는다', async () => {
    await m.sceneWeather(37.5, 127.0); assert.strictEqual(calls.length, 1);
    assert.strictEqual(await m.sceneWeather(10, 10), null);
    const bad = mk({ ok: false, json: async () => null }, []);
    assert.strictEqual(await bad.sceneWeather(37.5, 127.0), null);
  });
  await t('s251: 한도 초과(429)면 날씨를 내지 않는다 — 옛 캐시도 쓰지 않고 10분은 부르지도 않는다', async () => {
    const calls2 = []; let mode = 'ok';
    const f = async (u) => { calls2.push(u); return mode === 'ok' ? { ok: true, status: 200, json: async () => DATA } : { ok: false, status: 429, json: async () => ({ error: true, reason: 'Daily API request limit exceeded' }) }; };
    const cache = {};
    const m2 = new Function('fetch', 'SCENE_WX_CACHE', 'AbortController', code + ';return {wxMeteo,sceneWeather,wxLimited}')(f, cache, AbortController);
    assert.ok((await m2.sceneWeather(37.5, 127.0)).temp === 12 && !m2.wxLimited(), '처음엔 받는다');
    mode = '429';
    assert.strictEqual(await m2.wxMeteo(37.6, 127.1), null);
    assert.ok(m2.wxLimited(), '429 를 받으면 한도 표시');
    const n = calls2.length;
    assert.strictEqual(await m2.sceneWeather(37.5, 127.0), null, '방금 받은 캐시가 있어도 날씨를 내지 않는다');
    assert.strictEqual(await m2.sceneWeather(37.9, 127.5), null);
    assert.strictEqual(calls2.length, n, '쉬는 동안은 API 를 부르지도 않는다');
  });
  const w = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
  await t('워커에 내장 · 순수 ASCII · 출퇴근 브리핑도 같은 함수 사용', async () => {
    assert.ok(w.indexOf('async function wxMeteo(') > 0 && w.indexOf('typeof wxMeteo === "function"') > 0);
    assert.ok(!/[^\x00-\x7f]/.test(w));
    assert.ok(w.indexOf('var j = await wxMeteo(lat, lng, ac.signal);') > 0, '위젯 한마디 날씨도 같은 함수');
  });
  console.log('wx_meteo: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
