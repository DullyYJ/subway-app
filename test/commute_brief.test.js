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
t("s207: kind:'auto' — 한국 시각 오후 3시 전이면 출근, 3시부터는 퇴근(앱은 판단하지 않는다)", () => {
  const P = (iso) => M.cbPlan({ kind: 'auto', nowMs: Date.parse(iso), from: { nm: '인하대' }, to: { nm: '강남' } });
  assert.strictEqual(P('2026-10-26T08:30:00+09:00').kind, 'morn'); assert.strictEqual(P('2026-10-26T14:59:00+09:00').kind, 'morn');
  assert.strictEqual(P('2026-10-26T15:00:00+09:00').kind, 'eve'); assert.strictEqual(P('2026-10-26T23:40:00+09:00').kind, 'eve');
  assert.strictEqual(P('2026-10-26T08:30:00+09:00').fromStn.name, '인하대'); assert.strictEqual(P('2026-10-26T19:00:00+09:00').fromStn.name, '강남');
  assert.strictEqual(M.cbPlan({ kind: 'zzz', from: { nm: '인하대' }, to: { nm: '강남' } }).kind, 'morn');
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
  // s208: 같은 이름 역이 수도권·부산에 모두 있으면(중동) 저장된 좌표에 가까운 쪽, 좌표가 없으면 예전처럼 처음 만난 역
  assert.strictEqual(M.cbFindStn('중동').line, '1호선');
  assert.strictEqual(M.cbFindStn('중동', 35.1667, 129.1686).line, '부산2호선');
  assert.strictEqual(M.cbFindStn('중동', 37.4866, 126.7644).line, '1호선');
  assert.strictEqual(M.cbResolve({ nm: '중동', lat: 35.1667, lng: 129.1686, bus: false }).line, '부산2호선');
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
t('제목·본문(s285): 예상 소요·도착시각 · 출발지 날씨 · 도착지 날씨 · 출발지 혼잡도 · 추천 3개 이하 · 마무리 (경로줄 · 오늘 최저최고 · 도착지 혼잡도는 없다)', () => {
  const r = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T07:40:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, WX, { temp: 18, rain: 10, txt: '맑음' });
  assert.strictEqual(r.title, '출근길 브리핑 · 인하대→강남'); assert.strictEqual(r.kind, 'morn');
  const L = r.body.split('\n');
  assert.ok(!/→/.test(L[0]) && !/오늘 \d/.test(r.body), '경로줄 · 오늘 최저최고 없음: ' + L[0]);
  assert.strictEqual(L[0], '인하대 14° 구름 · 체감 11° · 습도 60%');
  assert.strictEqual(L[1], '강남 18° 맑음');
  assert.ok(/^인하대 혼잡도 \d+% \((여유|보통|혼잡)\)$/.test(L[2]), L[2]);
  assert.strictEqual(r.body.split('\n').filter(x => /혼잡도/.test(x)).length, 1, '도착역 혼잡도 줄은 없다(출발지만)');
  const recs = L.filter(x => x.indexOf('· ') === 0);
  assert.ok(recs.length >= 1 && recs.length <= 3, '추천 ' + recs.length);
  assert.ok(recs.indexOf('· 접이식 우산 있으면 안심이에요') >= 0 && recs.indexOf('· 쌀쌀해요, 겉옷 챙기세요') >= 0);
  assert.strictEqual(L[L.length - 1], M.cbClosing('morn', AT('2026-10-21T07:40:00+09:00'), { temp: 14, feel: 11, rain: 30, txt: '구름' }), '마무리는 출발지 날씨를 반영한 매크로 문장');
  assert.deepStrictEqual(r.route.to.name, '강남');
});
t('도착지 날씨는 출발지와 비슷해도 늘 보인다(s281) · 옷차림은 두 곳 중 나쁜 쪽에 맞춘다', () => {
  const r = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:40:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, WX, { temp: 15, rain: 30, txt: '구름' });
  assert.ok(r.body.split('\n').some(x => /^강남 15° 구름 · 강수 30%$/.test(x)), r.body);
  const w2 = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:40:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, { temp: 20, rain: 0, txt: '맑음' }, { temp: 19, feel: -1, rain: 60, txt: '눈' }).body;
  assert.ok(/우산 꼭 챙기세요/.test(w2) && /강추위예요/.test(w2), '도착지가 춥고 비 오면 출발지가 맑아도 챙기라고: ' + w2);
});
t('날씨를 못 받으면 날씨·추천(날씨 기반) 줄만 빠진다', () => {
  const r = M.cbBrief({ kind: 'eve', nowMs: AT('2026-10-21T21:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, null, null);
  const L = r.body.split('\n');
  assert.ok(/^강남 혼잡도/.test(L[0])); assert.strictEqual(L.length, 2);   // 출발역 혼잡도 · 마무리(피크 아님)
});
t('피크 시간 안내: 출근 7~9시 / 퇴근 17~19시에만', () => {
  const a = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T08:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, null, null).body;
  const b = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, null, null).body;
  const c = M.cbBrief({ kind: 'eve', nowMs: AT('2026-10-21T18:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, null, null).body;
  assert.ok(/피크 시간이에요/.test(a) && !/피크/.test(b) && /퇴근 피크예요/.test(c));
});
t('버스 출발이면 혼잡도 줄을 빼고, 극단 날씨 추천(더위·추위·강수·자외선·바람)', () => {
  const bus = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:00:00+09:00'), from: { nm: '정류장', lat: 37.5, lng: 127, bus: true }, to: { nm: '강남' } }, null, null).body;
  assert.ok(!/혼잡도/.test(bus), '버스 출발지는 혼잡도 줄이 없다(도착지 혼잡도는 안 보여 준다)');
  const hot = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, { temp: 35, feel: 38, hum: 85, uv: 9, wind: 40, rain: 50, txt: '맑음' }, null).body;
  assert.ok(/우산 꼭 챙기세요/.test(hot) && /무더위예요/.test(hot) && (hot.match(/^· /gm) || []).length === 3);
  const cold = M.cbBrief({ kind: 'morn', nowMs: AT('2026-10-21T10:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }, { temp: -3, feel: -8, txt: '눈' }, null).body;
  assert.ok(/강추위예요/.test(cold));
});
t('응원 문구 매크로(s286): 달마다 다르다 · 요일마다 다르다 · 날씨에 따라 머리말이 다르다 · 출근=힘찬 응원 · 퇴근=위로 · 같은 날은 같은 문장', () => {
  const D = (y, m, d, hh) => AT(y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + 'T' + String(hh || 7).padStart(2, '0') + ':00:00+09:00');
  // 풍경 조각: 12달 × 3 × (출근 · 퇴근) — 달 이름이 들어 있고 달끼리 겹치지 않는다
  for (const kd of ['morn', 'eve']) {
    assert.strictEqual(M.CB_IMG[kd].length, 12); assert.strictEqual(M.CB_WISH[kd].length, 14); assert.strictEqual(M.CB_DOW[kd].length, 7);
    const all = [].concat(...M.CB_IMG[kd]); assert.strictEqual(new Set(all).size, 36, kd + ': 풍경 36개가 모두 다르다');
    M.CB_IMG[kd].forEach((a, mo) => a.forEach(x => { if (/\d+월/.test(x)) assert.ok(x.indexOf((mo + 1) + '월') >= 0, kd + ' ' + (mo + 1) + '월 풍경에 다른 달 이름: ' + x); }));
    assert.strictEqual(new Set(M.CB_WISH[kd]).size, 14);
  }
  assert.ok(M.CB_WISH.morn.every(x => !M.CB_WISH.eve.includes(x)) && [].concat(...M.CB_DOW.morn).every(x => ![].concat(...M.CB_DOW.eve).includes(x)), '출근과 퇴근 문장은 다르다');
  // 달마다 다르다(같은 요일 · 같은 날짜 번호 · 같은 날씨여도)
  for (const kd of ['morn', 'eve']) {
    const imgs = new Set(); for (let m = 1; m <= 12; m++) imgs.add(M.cbClosing(kd, D(2026, m, 15), null).split('. ')[1].split('처럼')[0]);
    assert.strictEqual(imgs.size, 12, kd + ': 12달이 모두 다른 풍경');
  }
  // 한 달 치(cbCheerMonth): 31일 겹침 없음 · 달마다 · 해마다 다르다 · 같은 달은 늘 같다
  const mm = (y, m) => M.cbCheerMonth(D(y, m, 15));
  for (const kd of ['morn', 'eve']) {
    for (let m = 1; m <= 12; m++) assert.strictEqual(new Set(mm(2026, m)[kd]).size, 31, kd + ' ' + m + '월 31일 모두 다르다');
    for (let m = 1; m < 12; m++) assert.strictEqual(mm(2026, m)[kd].filter(x => mm(2026, m + 1)[kd].includes(x)).length, 0, kd + ' ' + m + '월과 ' + (m + 1) + '월은 겹치는 문장이 없다');
    assert.ok(mm(2026, 10)[kd].filter((x, i) => x === mm(2027, 10)[kd][i]).length <= 10, kd + ': 해가 바뀌면 순서가 달라진다');
  }
  assert.deepStrictEqual(mm(2026, 10), M.cbCheerMonth(D(2026, 10, 1, 0)), '같은 달은 날짜 · 시각과 상관없이 같다'); assert.strictEqual(mm(2026, 10).ym, '2026-10');
  const custom = mm(2026, 10); custom.morn[20] = '바꾼 꼬리.';
  assert.ok(M.cbClosing('morn', D(2026, 10, 21), null, custom).endsWith('바꾼 꼬리.'), '서버가 준 달 문구를 쓴다');
  assert.strictEqual(M.cbClosing('morn', D(2026, 11, 21), null, custom), M.cbClosing('morn', D(2026, 11, 21), null), '달이 다른 문구는 쓰지 않고 새로 만든다');
  // 한 달(31일) 안에서 같은 문장이 없다
  for (const kd of ['morn', 'eve']) { const sn = new Set(); for (let d = 1; d <= 31; d++) sn.add(M.cbClosing(kd, D(2026, 10, d), null)); assert.strictEqual(sn.size, 31, kd + ': 10월 31일 모두 다르다'); }
  assert.strictEqual(M.cbClosing('morn', D(2026, 10, 21, 7), null), M.cbClosing('morn', D(2026, 10, 21, 23), null), '같은 날은 같은 문장');
  // 요일: 같은 달 · 같은 주의 다른 요일은 요일 이름과 요일 응원이 다르다
  const dn = ['일', '월', '화', '수', '목', '금', '토'], seen = new Set();
  for (let d = 18; d <= 24; d++) { const c = M.cbClosing('eve', D(2026, 10, d), null); const k = new Date(D(2026, 10, d) + 9 * 3600000).getUTCDay(); assert.ok(c.indexOf(dn[k] + '요일 저녁,') === 0, c); seen.add(c.split('. ')[0]); }
  assert.strictEqual(seen.size, 7, '요일마다 다른 첫 문장');
  assert.notStrictEqual(M.cbClosing('morn', D(2026, 10, 19), null).split('. ')[0], M.cbClosing('morn', D(2026, 10, 26), null).split('. ')[0], '같은 요일도 주마다 번갈아');
  // 날씨 머리말
  const head = w => M.cbClosing('morn', D(2026, 10, 19), w).split('월요일')[0];
  assert.strictEqual(head({ temp: 14, txt: '비', rain: 80 }), '비 오는 '); assert.strictEqual(head({ temp: -3, txt: '눈' }), '눈 내리는 ');
  assert.strictEqual(head({ temp: 33, feel: 36, txt: '맑음' }), '무더운 '); assert.strictEqual(head({ temp: -2, feel: -6, txt: '맑음' }), '추운 ');
  assert.strictEqual(head({ temp: 12, wind: 40, txt: '맑음' }), '바람 부는 '); assert.strictEqual(head({ temp: 18, txt: '맑음' }), '맑은 ');
  assert.strictEqual(head({ temp: 18, txt: '구름 많음' }), '흐린 '); assert.strictEqual(head(null), ''); assert.strictEqual(head({ temp: 18, txt: '' }), '');
  assert.ok(/^비 오는 월요일 아침, /.test(M.cbBrief({ kind: 'morn', nowMs: D(2026, 10, 19), from: { nm: '인하대' }, to: { nm: '강남' } }, { temp: 14, txt: '비', rain: 80 }, null).body.split('\n').pop()), '브리핑 마지막 줄에 날씨가 반영된다');
  // 출근=힘찬 응원 · 퇴근=수고 위로
  assert.ok(M.CB_WISH.eve.filter(x => /수고|고생|쉬|괜찮|토닥|잘했|대단|고마/.test(x)).length >= 10, '퇴근 소원은 수고 · 위로');
  assert.ok(M.CB_WISH.morn.filter(x => /출발|응원|당당|해내|파이팅|씩씩|웃|기운|에너지|도전/.test(x)).length >= 10, '출근 소원은 힘찬 응원');
  assert.ok(M.cbClosing('eve', D(2026, 10, 21), null).length < 120, '알림에 들어갈 길이');
});
t('예상 소요 · 도착시각(s285): 엔진이 준 경로 소요로 한국 시각 도착을 만든다 · 없으면 줄이 빠진다', () => {
  const at = AT('2026-10-21T18:00:00+09:00');
  const r = M.cbCompose(M.cbPlan({ kind: 'eve', nowMs: at, from: { nm: '인하대' }, to: { nm: '강남' } }), { nowMs: at, eta: { min: 50, xfer: 0 } }, null, null);
  const L = r.body.split('\n');
  assert.strictEqual(L[0], '예상 50분 소요 · 18:50경 도착 · 환승 없음');
  const r2 = M.cbCompose(M.cbPlan({ kind: 'eve', nowMs: at, from: { nm: '인하대' }, to: { nm: '강남' } }), { nowMs: at, eta: { min: 75, xfer: 2 } }, null, null);
  assert.strictEqual(r2.body.split('\n')[0], '예상 1시간 15분 소요 · 19:15경 도착 · 환승 2회');
  const r3 = M.cbCompose(M.cbPlan({ kind: 'eve', nowMs: AT('2026-10-21T23:30:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }), { nowMs: AT('2026-10-21T23:30:00+09:00'), eta: { min: 60, xfer: 1 } }, null, null);
  assert.ok(/^예상 1시간 소요 · 00:30경 도착/.test(r3.body.split('\n')[0]), '자정을 넘기면 00:30: ' + r3.body.split('\n')[0]);
  assert.ok(!/예상 .* 소요/.test(M.cbBrief({ kind: 'eve', nowMs: at, from: { nm: '인하대' }, to: { nm: '강남' } }, null, null).body), 'eta 가 없으면 줄이 없다');
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
  assert.ok(w.indexOf('if (url.pathname === "/commute-brief") return handleCommuteBrief(request, env, ctx);') > 0);
  assert.ok(!/[^\x00-\x7f]/.test(body));
  assert.ok(/ctx\.waitUntil\(cbCheerCron\(env\)\.catch\(/.test(w.slice(w.indexOf('async scheduled(event, env, ctx)'), w.indexOf('async fetch(request, env, ctx)'))), 's286: cron(scheduled)이 응원 문구 한 달 치를 만든다');
});

(async () => {
  // 워커 연결부: 날씨는 가짜 fetch 로 받는다
  const scn = fs.readFileSync(path.join(root, 'engine/scene-worker.js'), 'utf8');
  const glue = scn.slice(scn.indexOf('var WX_CODES'), scn.indexOf('async function sceneWeather')) + '\n' + fs.readFileSync(path.join(root, 'engine/commute-brief-worker.js'), 'utf8');   // s219: 날씨는 장면 엔진의 wxMeteo(Open-Meteo)를 같이 쓴다
  const calls = [];
  const fn = new Function('cbPlan', 'cbCompose', 'cbCheerMonth', 'WSAY_WX_URL', 'fetch', 'AbortController', 'Response', glue + '\nreturn { handleCommuteBrief: handleCommuteBrief, cbCheerCron: cbCheerCron, cbCheerLoad: cbCheerLoad };');
  const fakeFetch = async (u) => { calls.push(u); return { ok: true, json: async () => ({ current: { time: '2026-10-21T07:00', temperature_2m: 14, apparent_temperature: 11, relative_humidity_2m: 60, weather_code: 2, wind_speed_10m: 2 }, hourly: { time: ['2026-10-21T07:00', '2026-10-21T08:00', '2026-10-21T09:00'], precipitation_probability: [30, 10, 5] }, daily: { uv_index_max: [3], temperature_2m_max: [21], temperature_2m_min: [9] } }) }; };
  const G = fn(M.cbPlan, M.cbCompose, M.cbCheerMonth, 'https://wx.test/weather', fakeFetch, AbortController, Response), h = (rq, env) => G.handleCommuteBrief(rq, env || {}, { waitUntil: () => {} });
  const post = (b) => h(new Request('https://x.test/commute-brief', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b) })).then(r => r.json().then(j => [r.status, j]));
  const [s1, j1] = await post({ kind: 'morn', nowMs: AT('2026-10-21T07:40:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } });
  try {
    assert.strictEqual(s1, 200); assert.strictEqual(j1.ok, true); assert.strictEqual(j1.title, '출근길 브리핑 · 인하대→강남');
    assert.ok(/인하대 14° 구름/.test(j1.body)); assert.ok(calls.length >= 2 && /latitude=37\.44/.test(calls[0]), calls.join(' '));
    const [s2] = await post('JSON 아님'); assert.strictEqual(s2, 400);
    const [s3] = await post({ pad: 'x'.repeat(7000) }); assert.strictEqual(s3, 413);
    const bad = fn(M.cbPlan, M.cbCompose, M.cbCheerMonth, 'https://wx.test/weather', async () => { throw new Error('down'); }, AbortController, Response).handleCommuteBrief;
    const r4 = await bad(new Request('https://x.test/commute-brief', { method: 'POST', body: JSON.stringify({ kind: 'eve', nowMs: AT('2026-10-21T18:00:00+09:00'), from: { nm: '인하대' }, to: { nm: '강남' } }) }), {}, { waitUntil: () => {} }).then(r => r.json());
    assert.strictEqual(r4.ok, true); assert.ok(!/°/.test(r4.body), '날씨 서버가 죽어도 문구는 나온다');
    pass++; console.log('  ok   워커 연결부: 날씨 받기 · 잘못된 본문 · 너무 큼 · 날씨 서버 장애');
  } catch (e) { fail++; console.log('  FAIL 워커 연결부', String(e && e.message).split('\n')[0]); }
  try {
    // s286: 서버가 달마다 만들어 KV 에 두는 응원 문구 한 달 치
    const kv = new Map(), puts = [], KV = { get: async (k) => kv.has(k) ? JSON.parse(kv.get(k)) : null, put: async (k, v, o) => { kv.set(k, v); puts.push([k, o && o.expirationTtl]); } };
    const real = Date.now; const setNow = ms => { Date.now = () => ms; };
    try {
      setNow(AT('2026-10-03T04:00:00+09:00')); let r = await G.cbCheerCron({ ROWS_KV: KV });
      assert.deepStrictEqual(r.made, ['cheer:2026-10'], '이달 것을 만든다'); assert.ok(puts[0][1] >= 40 * 86400, '약 50일 보관');
      r = await G.cbCheerCron({ ROWS_KV: KV }); assert.deepStrictEqual(r.made, [], '이미 있으면 다시 만들지 않는다(cron 이 자주 돌아도)');
      setNow(AT('2026-10-26T04:00:00+09:00')); r = await G.cbCheerCron({ ROWS_KV: KV });
      assert.deepStrictEqual(r.made, ['cheer:2026-11'], '25일부터 다음 달 것을 미리 만든다');
      setNow(AT('2026-12-28T04:00:00+09:00')); r = await G.cbCheerCron({ ROWS_KV: KV });
      assert.deepStrictEqual(r.made, ['cheer:2026-12', 'cheer:2027-01'], '12월 말 → 다음 해 1월');
      assert.deepStrictEqual(await G.cbCheerCron({}), { skipped: 'no-kv' });
    } finally { Date.now = real; }
    assert.ok(JSON.parse(kv.get('cheer:2026-11')).morn.length === 31 && JSON.parse(kv.get('cheer:2026-11')).ym === '2026-11');
    // 알림 요청은 KV 의 이달 문구를 쓴다(서버에서 바꿔 둔 문구가 그대로 나간다) · KV 가 없거나 비어 있어도 같은 문구가 나온다
    const own = M.cbCheerMonth(AT('2026-11-12T07:00:00+09:00')); own.morn[11] = '서버가 바꿔 둔 11월 12일 꼬리.'; kv.set('cheer:2026-11', JSON.stringify(own));
    const at = AT('2026-11-12T07:40:00+09:00'), rq = () => new Request('https://x.test/commute-brief', { method: 'POST', body: JSON.stringify({ kind: 'morn', nowMs: at, from: { nm: '인하대' }, to: { nm: '강남' } }) });
    const j5 = await h(rq(), { ROWS_KV: KV }).then(r => r.json());
    assert.ok(j5.body.split('\n').pop().endsWith('서버가 바꿔 둔 11월 12일 꼬리.'), j5.body.split('\n').pop());
    const j6 = await h(rq(), {}).then(r => r.json()), j7 = await h(rq(), { ROWS_KV: { get: async () => { throw new Error('kv down'); }, put: async () => {} } }).then(r => r.json());
    assert.strictEqual(j6.body.split('\n').pop(), M.cbClosing('morn', at, { temp: 14, feel: 11, rain: 0, txt: '구름' }), 'KV 가 없으면 그 자리에서 같은 문구');
    assert.strictEqual(j7.body, j6.body, 'KV 가 죽어도 같은 문구');
    pass++; console.log('  ok   응원 문구 서버(s286): cron 이 달마다 한 번만 만들어 KV 에 두고 · 25일부터 다음 달 · 알림이 KV 문구를 쓴다 · KV 없어도 같은 문구');
  } catch (e) { fail++; console.log('  FAIL 응원 문구 서버(s286)', String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
  console.log('commute_brief:', pass, '통과', fail, '실패');
  process.exit(fail ? 1 : 0);
})();
