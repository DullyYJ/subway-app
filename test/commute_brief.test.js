// 출퇴근 브리핑 문구 엔진(engine/commute-brief.js) 시험 — 2026-10-21 (s104)
//  ① 출발·도착 정하기(출근/퇴근 반대/따로 정한 곳/한쪽만) ② 장소 찾기(역 표 · 버스 좌표) ③ 문구(날씨·혼잡도·추천·마무리 멘트) ④ 이모지 없음 ⑤ 워커 내장 사본 · /commute-brief 길
process.env.TZ = 'Asia/Seoul';
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const M = require(path.join(root, 'engine/commute-brief.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };
const AT = (s) => Date.parse(s);
const WX = { temp: 14, feel: 11, hum: 60, tmin: 9, tmax: 21, rain: 30, txt: '구름', uv: 3, wind: 10 };

t('출근은 출발→도착, 퇴근은 출근의 반대', () => {
  const m = M.cbPlan({ kind: 'morn', from: { nm: '인하대' }, to: { nm: '강남' } });
  assert.strictEqual(m.fromStn.name, '인하대'); assert.strictEqual(m.toStn.name, '강남');
  const e = M.cbPlan({ kind: 'eve', from: { nm: '인하대' }, to: { nm: '강남' } });
  assert.strictEqual(e.fromStn.name, '강남'); assert.strictEqual(e.toStn.name, '인하대');
});
t('퇴근 장소를 따로 정했으면 그대로, 한쪽만 채우면 나머지는 출근의 반대편', () => {
  const both = M.cbPlan({ kind: 'eve', from: { nm: '인하대' }, to: { nm: '강남' }, eFrom: { nm: '사당' }, eTo: { nm: '수원' } });
  assert.strictEqual(both.fromStn.name, '사당'); assert.strictEqual(both.toStn.name, '수원');
  const onlyFrom = M.cbPlan({ kind: 'eve', from: { nm: '인하대' }, to: { nm: '강남' }, eFrom: { nm: '사당' } });
  assert.strictEqual(onlyFrom.fromStn.name, '사당'); assert.strictEqual(onlyFrom.toStn.name, '인하대');
  const onlyTo = M.cbPlan({ kind: 'eve', from: { nm: '인하대' }, to: { nm: '강남' }, eTo: { nm: '수원' } });
  assert.strictEqual(onlyTo.fromStn.name, '강남'); assert.strictEqual(onlyTo.toStn.name, '수원');
});
t('역 이름 찾기: 같은 이름 → 앞이 같은 → 들어 있는 순서, 공백·"역" 무시', () => {
  assert.strictEqual(M.cbFindStn('강남역').name, '강남');
  assert.strictEqual(M.cbFindStn('  강 남 ').name, '강남');
  assert.ok(M.cbFindStn('인하').name.indexOf('인하') === 0);
  assert.strictEqual(M.cbFindStn('없는역이름zzz'), null);
});
t('버스 정류장은 저장 좌표를 쓴다(역 표를 안 뒤진다)', () => {
  const p = M.cbPlan({ kind: 'morn', from: { nm: '강남', lat: 37.5, lng: 127.0, bus: true }, to: { nm: '인하대' } });
  assert.strictEqual(p.fromStn.bus, true); assert.strictEqual(p.fromStn.lat, 37.5); assert.strictEqual(p.la, 37.5);
});
t('장소가 없으면 현재 위치(없으면 인천 기본값)로 날씨를 묻고 경로 줄은 없다', () => {
  const p = M.cbPlan({ kind: 'morn', gps: { lat: 37.55, lng: 127.1 } });
  assert.strictEqual(p.fromStn, null); assert.strictEqual(p.la, 37.55);
  const q = M.cbPlan({ kind: 'morn' });
  assert.strictEqual(q.la, 37.45); assert.strictEqual(q.ln, 126.70);
  const r = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T07:40:00+09:00') }, null, null);
  assert.strictEqual(r.route, null); assert.ok(!/→/.test(r.title));
});
t('제목·본문: 경로 · 날씨 · 오늘 최저최고 · 도착지 날씨(다를 때) · 혼잡도 · 추천 3개 이하 · 마무리', () => {
  const r = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T07:40:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, WX, { temp: 18, rain: 10, txt: '맑음' });
  assert.strictEqual(r.title, '출근길 브리핑 · 인하대→강남');
  const L = r.body.split('\n');
  assert.strictEqual(L[0], '인하대 → 강남');
  assert.strictEqual(L[1], '인하대 14° 구름 · 체감 11° · 습도 60%');
  assert.strictEqual(L[2], '오늘 9°~21° · 강수 30%');
  assert.strictEqual(L[3], '강남 18° 맑음');
  assert.ok(/^인하대 혼잡도 \d+% \((여유|보통|혼잡)\)$/.test(L[4]), L[4]);
  const recs = L.filter(x => x.indexOf('· ') === 0);
  assert.ok(recs.length >= 1 && recs.length <= 3, '추천 ' + recs.length);
  assert.ok(recs.indexOf('· 접이식 우산 있으면 안심이에요') >= 0 && recs.indexOf('· 쌀쌀해요, 겉옷 챙기세요') >= 0);
  assert.strictEqual(L[L.length - 1], M.cbClosing('morn', AT('2026-10-21T07:40:00+09:00')));
  assert.deepStrictEqual(r.route.to.name, '강남');
});
t('도착지 날씨가 출발지와 비슷하면 줄을 만들지 않는다', () => {
  const r = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:40:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, WX, { temp: 15, rain: 30, txt: '구름' });
  assert.ok(r.body.split('\n').every(x => x.indexOf('강남 15') !== 0));
});
t('날씨를 못 받으면 날씨·추천(날씨 기반) 줄만 빠진다', () => {
  const r = M.cbBrief({ kind: 'eve', nowMs: AT('2026-10-21T21:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, null, null);
  const L = r.body.split('\n');
  assert.strictEqual(L[0], '강남 → 인하대'); assert.ok(/혼잡도/.test(L[1])); assert.strictEqual(L.length, 3);   // 경로 · 혼잡도 · 마무리(피크 아님)
});
t('피크 시간 안내: 출근 7~9시 / 퇴근 17~19시에만', () => {
  const a = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T08:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, null, null).body;
  const b = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, null, null).body;
  const c = M.cbBrief({ kind: 'eve', nowMs: AT('2026-10-21T18:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, null, null).body;
  assert.ok(/피크 시간이에요/.test(a) && !/피크/.test(b) && /퇴근 피크예요/.test(c));
});
t('버스 출발이면 혼잡도 줄을 빼고, 극단 날씨 추천(더위·추위·강수·자외선·바람)', () => {
  const bus = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:00:00+09:00'), from: { nm: '정류장', lat: 37.5, lng: 127, bus: true }, to: { nm: '강남' } }, null, null).body;
  assert.ok(!/혼잡도/.test(bus));
  const hot = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, { temp: 35, feel: 38, hum: 85, uv: 9, wind: 40, rain: 50, txt: '맑음' }, null).body;
  assert.ok(/우산 꼭 챙기세요/.test(hot) && /무더위예요/.test(hot) && (hot.match(/^· /gm) || []).length === 3);
  const cold = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, { temp: -3, feel: -8, txt: '눈' }, null).body;
  assert.ok(/강추위예요/.test(cold));
});
t('마무리 멘트: 요일별 3개가 주차마다 돈다 · 같은 주는 같은 문구', () => {
  const a = M.cbClosing('morn', AT('2026-10-21T07:00:00+09:00')), b = M.cbClosing('morn', AT('2026-10-21T22:00:00+09:00'));
  assert.strictEqual(a, b);
  const seen = new Set(); for (let w = 0; w < 6; w++) seen.add(M.cbClosing('eve', AT('2026-10-21T18:00:00+09:00') + w * 7 * 86400000));
  assert.ok(seen.size === 3, '3가지가 돈다: ' + seen.size);
  assert.ok(M.CB_CLOSING.morn.length === 7 && M.CB_CLOSING.eve.length === 7);
});
t('새 글에 이모지가 없다', () => {
  const r = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T08:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, WX, WX);
  assert.ok(!/[☀-➿\ud83c-\ud83e]/.test(r.title + r.body));
});
t('이상한 입력에도 죽지 않는다', () => {
  assert.doesNotThrow(() => M.cbBrief(null, null, null));
  assert.doesNotThrow(() => M.cbBrief({ kind: 'x', from: 5, to: { nm: 7 }, gps: 'a' }, { temp: 'x' }, []));
  const r = M.cbBrief({ from: { nm: 'a'.repeat(300) } }, null, null); assert.ok(r.title.length > 0);
});

const w = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('워커 내장 사본이 모듈 · 연결부와 같고 경로가 등록돼 있다', () => {
  const ms = '// ===== CBRIEF ENGINE BEGIN =====', me = '// ===== CBRIEF ENGINE END =====';
  const i = w.indexOf(ms), j = w.indexOf(me);
  assert.ok(i > 0 && j > i);
  const esc = s => s.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(path.join(root, 'engine/commute-brief.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  assert.ok(body.indexOf(esc(src)) >= 0, '모듈 사본');
  assert.ok(body.indexOf(esc(fs.readFileSync(path.join(root, 'engine/commute-brief-worker.js'), 'utf8').trimEnd())) >= 0, '연결부 사본');
  assert.ok(w.indexOf('if (url.pathname === "/commute-brief") return handleCommuteBrief(request);') > 0);
  assert.ok(!/[^\x00-\x7f]/.test(body));
});

(async () => {
  // 워커 연결부: 날씨는 가짜 fetch 로 받는다
  const glue = fs.readFileSync(path.join(root, 'engine/commute-brief-worker.js'), 'utf8');
  const calls = [];
  const fn = new Function('cbPlan', 'cbCompose', 'WSAY_WX_URL', 'fetch', 'AbortController', 'Response', glue + '\nreturn handleCommuteBrief;');
  const fakeFetch = async (u) => { calls.push(u); return { ok: true, json: async () => ({ ok: true, temp: 14, feel: 11, hum: 60, tmin: 9, tmax: 21, rain: 30, txt: '구름' }) }; };
  const h = fn(M.cbPlan, M.cbCompose, 'https://wx.test/weather', fakeFetch, AbortController, Response);
  const post = (b) => h(new Request('https://x.test/commute-brief', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b) })).then(r => r.json().then(j => [r.status, j]));
  const [s1, j1] = await post({ kind: 'morn', nowMs: AT('2026-10-21T07:40:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } });
  try {
    assert.strictEqual(s1, 200); assert.strictEqual(j1.ok, true); assert.strictEqual(j1.title, '출근길 브리핑 · 인하대→강남');
    assert.ok(/인하대 14° 구름/.test(j1.body)); assert.ok(calls.length >= 2 && /lat=37\.44/.test(calls[0]), calls.join(' '));
    const [s2] = await post('JSON 아님'); assert.strictEqual(s2, 400);
    const [s3] = await post({ pad: 'x'.repeat(7000) }); assert.strictEqual(s3, 413);
    const bad = fn(M.cbPlan, M.cbCompose, 'https://wx.test/weather', async () => { throw new Error('down'); }, AbortController, Response);
    const r4 = await bad(new Request('https://x.test/commute-brief', { method: 'POST', body: JSON.stringify({ kind: 'eve', nowMs: AT('2026-10-21T18:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }) })).then(r => r.json());
    assert.strictEqual(r4.ok, true); assert.ok(!/°/.test(r4.body), '날씨 서버가 죽어도 문구는 나온다');
    pass++; console.log('  ok   워커 연결부: 날씨 받기 · 잘못된 본문 · 너무 큼 · 날씨 서버 장애');
  } catch (e) { fail++; console.log('  FAIL 워커 연결부', String(e && e.message).split('\n')[0]); }
  console.log('commute_brief:', pass, '통과', fail, '실패');
  process.exit(fail ? 1 : 0);
})();
