// 홈 'AI 승무원' 브리핑 문장 엔진(engine/home-brief.js) 시험 — 2026-10-19 (s65)
//   · 소요시간 · 환승 안내(버스 첫 구간 · 환승 횟수 · 장거리) · 시각(실시간/노선도) · 혼잡 · 날씨 준비물 · 목적지 미설정 · 마무리
//   · 조사(으로/로) · 같은 입력 → 같은 출력 · Worker 내장본이 모듈과 같다 · /home-brief 길
'use strict';
process.env.TZ = 'Asia/Seoul';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { homeBrief, hbJosRo, handleHomeBrief } = require(path.join(root, 'engine/home-brief.js'));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }

// 조각 → 글자(시험 읽기용)
function txt(frag) {
  if (typeof frag === 'string') return frag;
  if (frag.b != null) return frag.b;
  if (frag.stn) return frag.stn[0];
  if (frag.ln) return frag.ln;
  if (frag.id) return frag.raw != null ? '[' + frag.raw + ']' : frag.t.map(txt).join('');
  return '';
}
function flat(r) { return r.paras.map(p => (p.t || p.sub).map(txt).join('')); }
const NOW = Date.UTC(2026, 9, 19, 0, 0, 0);           // 한국시간 09:00
const base = { from: '강남', to: '시청', hour: 14, cong: 20, hol: false, mins: 25, wF: null, wT: null, segs: null, metro: false, nt: null, tl: null, nowMin: 840, nowMs: NOW, arrMs: 0, dm: '', rnd: 0 };
const mk = o => homeBrief(Object.assign({}, base, o));

t('조사: 받침 없음/ㄹ → 로, 그 밖 → 으로', () => {
  assert.strictEqual(hbJosRo('2호선'), '으로'); assert.strictEqual(hbJosRo('7호선'), '으로'); assert.strictEqual(hbJosRo('3호선'), '으로');
  assert.strictEqual(hbJosRo('신분당선'), '으로'); assert.strictEqual(hbJosRo('공항철도'), '로'); assert.strictEqual(hbJosRo('경의중앙선'), '으로');
  assert.strictEqual(hbJosRo('분당선'), '으로'); assert.strictEqual(hbJosRo('경춘선'), '으로'); assert.strictEqual(hbJosRo('KTX'), '로');
  assert.strictEqual(hbJosRo('5호선'), '으로'); assert.strictEqual(hbJosRo('6호선'), '으로'); assert.strictEqual(hbJosRo('8호선'), '으로'); assert.strictEqual(hbJosRo('1호선'), '으로');
  assert.strictEqual(hbJosRo(''), '으로'); assert.strictEqual(hbJosRo(null), '으로');
});
t('소요시간 문장 · 모르면 대체 문장', () => {
  assert.ok(flat(mk({}))[0].startsWith('강남에서 시청까지는 약 25분 걸려요.'));
  assert.ok(flat(mk({ mins: 0 }))[0].startsWith('강남에서 시청까지는 이렇게 가시면 돼요.'));
});
t('경로 구간: 없음 / 1개 / 여러 개 / 버스 첫 구간', () => {
  assert.ok(flat(mk({}))[0].endsWith('환승 정보는 경로가 확정되면 구간별로 알려드릴게요.'));
  assert.ok(flat(mk({ segs: [{ type: 1, line: '2호선' }] }))[0].endsWith('환승 없이 2호선으로 한 번에 가실 수 있어요.'));
  const s3 = [{ type: 1, line: '2호선', from: 'A', to: 'B' }, { type: 1, line: '9호선', from: 'B', to: 'C' }, { type: 1, line: '공항철도', from: 'C', to: 'D' }];
  const l = flat(mk({ segs: s3 }))[0];
  assert.ok(l.includes('가는 길에 B에서 9호선으로, C에서 공항철도로 갈아타시면 돼요. 환승이 2번이라 안내 방송 놓치지 마세요.'), l);
  const sb = [{ type: 2, line: '146', from: '정류장', to: '다음정류장' }, { type: 1, line: '2호선', from: '다음', to: 'Z' }];
  const lb = flat(mk({ segs: sb }))[0];
  assert.ok(lb.includes('정류장에서 146번 버스를 타고 다음정류장까지 가신 다음, 가는 길에 다음에서 2호선으로 갈아타시면 돼요.'), lb);
  assert.ok(!lb.includes('환승이'));
});
t('장거리: 출발·도착 시각 · 접근/하차 구간 · 환승 없음', () => {
  const segs = [{ type: 1, line: '2호선', from: '강남', to: '서울' }, { type: 4, line: 'KTX', from: '서울', to: '부산', min: 150, depClock: '10:00', arrClock: '12:30', rideMin: 140 }];
  const l = flat(mk({ segs, mins: 200 }))[0];
  assert.ok(l.includes('강남에서 서울까지 먼저 이동하시고, 서울에서 KTX를 타고 부산까지 가시면 돼요. 10:00 출발, 12:30경 도착이에요 (타고 가는 시간은 약 140분).'), l);
  assert.ok(l.includes('내리신 곳이 목적지와 가까워서 따로 환승은 없어요.') && l.endsWith('승차권과 출발 시각은 한 번 더 확인해 주세요.'));
  const segs2 = segs.concat([{ type: 1, line: '1호선', from: '부산', to: '시청' }]);
  assert.ok(flat(mk({ segs: segs2 }))[0].includes('도착하시면 부산에서 1호선으로 갈아타고 목적지까지 가시면 돼요.'));
  const segs3 = [{ type: 4, line: '고속버스', from: 'a', to: 'b', min: 90 }];
  assert.ok(flat(mk({ segs: segs3 }))[0].includes('약 90분 걸려요 (') === false);
  assert.ok(flat(mk({ segs: segs3 }))[0].includes('a에서 고속버스를 타고 b까지 가시면 돼요. 약 90분 걸려요.'));
});
t('시각: 실시간 모드 도착 예정 · 갱신 id 두 개', () => {
  const r = mk({ mins: 30, arrMs: NOW + 30 * 60000, dm: '<i>x</i>' });
  const p = r.paras[1].t;
  assert.strictEqual(p[0].id, 'homeAiArr'); assert.strictEqual(txt(p[0]), '도착은 09:30경 예정이에요.');
  assert.strictEqual(p[2].id, 'homeAiDep'); assert.strictEqual(p[2].raw, '<i>x</i>');
  assert.strictEqual(flat(mk({ mins: 30 }))[1], '도착은 09:30경 예정이에요.');            // arrMs 없으면 지금 + 소요
  assert.strictEqual(mk({ mins: 0 }).paras.length, 3);                                    // 시각 문단 없음 → 혼잡·마무리만... (날씨 없음)
});
t('시각: 노선도 모드 — 다음 열차 · 타임라인 우선 · 막차 후 첫차', () => {
  assert.strictEqual(flat(mk({ metro: true, nt: { found: true, depMin: 14 * 60 + 5.4, arrMin: 14 * 60 + 30.6 } }))[1], '지금 출발하시면 다음 열차는 14:05, 도착은 14:31경이에요.');
  assert.strictEqual(flat(mk({ metro: true, nt: { found: true, depMin: 100, arrMin: 130 }, tl: { dep: '01:41', arr: '02:11' } }))[1], '지금 출발하시면 다음 열차는 01:41, 도착은 02:11경이에요.');
  const nf = flat(mk({ metro: true, nowMin: 23 * 60 + 50, nt: { found: false, firstMin: 5 * 60 + 30 } }))[1];
  assert.strictEqual(nf, '지금은 운행 중인 열차가 없어요 (막차 이후). 첫차는 05:30(5시간 40분 후)에 있어요. 첫차를 타시면 05:55경 도착해요.');
  assert.strictEqual(flat(mk({ metro: true, nt: { found: false } }))[1], '지금은 운행 중인 열차가 없어요 (막차 이후). 경로와 소요시간만 참고해 주세요.');
  assert.strictEqual(flat(mk({ metro: true, nt: null }))[1], flat(mk({ metro: true, nt: null }))[1]);
  assert.strictEqual(mk({ metro: true }).paras.length, 3);                                  // 소요 · 혼잡 · 꼬리(노선도 문구)
  const last = mk({ metro: true }).paras.pop();
  assert.deepStrictEqual(last, { sub: ['노선도에서 고르신 경로 미리보기예요. 출발하시면 위치에 맞춰 안내를 이어갈게요.'] });
  assert.ok(flat(mk({ metro: true, nowMin: 0, nt: { found: false, firstMin: 5 } }))[1].includes('(5분 후)'));
  assert.ok(flat(mk({ metro: true, nowMin: 1430, nt: { found: false, firstMin: 10 } }))[1].includes('(20분 후)'));
});
t('혼잡 한마디: 늦은 시간 · 피크 · 높음 · 주말', () => {
  const cg = o => flat(mk(Object.assign({ mins: 0 }, o)))[1];
  assert.strictEqual(cg({ hour: 23 }), '늦은 시간이라 막차 시간은 꼭 확인해 두세요.'); assert.strictEqual(cg({ hour: 3 }), '늦은 시간이라 막차 시간은 꼭 확인해 두세요.');
  assert.ok(cg({ hour: 8, cong: 75 }).startsWith('지금은 출퇴근 피크라 많이 붐벼요.')); assert.strictEqual(cg({ hour: 12, cong: 75 }), '지금 꽤 혼잡해요. 여유를 두고 움직이세요.');
  assert.strictEqual(cg({ hour: 18, cong: 50 }), '지금은 출퇴근 피크라 다소 붐벼요.'); assert.strictEqual(cg({ hour: 12, cong: 50 }), '지금은 다소 붐비는 편이에요.');
  assert.strictEqual(cg({ hour: 12, cong: 10, hol: true }), '주말이라 한산한 편이에요.'); assert.strictEqual(cg({ hour: 8, cong: 10 }), '출퇴근 시간대지만 크게 붐비진 않아요.');
  assert.strictEqual(cg({ hour: 12, cong: 10 }), '지금은 여유로운 편이에요.');
});
t('날씨 · 준비물', () => {
  const w = (a, b) => flat(mk({ mins: 0, wF: a, wT: b }));
  assert.strictEqual(w({ temp: 20, txt: '맑음', rain: 0 }, { temp: 21, txt: '구름', rain: 10 })[2], '날씨는 강남 20도 맑음, 시청 21도 구름이에요.');
  assert.ok(w({ temp: 20, txt: '맑음', rain: 70 }, null)[2].endsWith('이에요. 비 소식이 있어요. 우산 꼭 챙기세요.'));
  assert.ok(w({ temp: 20, txt: '맑음', rain: 45 }, null)[2].includes('비가 올 수도 있어요.'));
  assert.ok(w({ temp: 1, txt: '맑음', rain: 0 }, { temp: 7, txt: '', rain: 0 })[2].includes('많이 추워요. 따뜻하게 입고 나오세요. 두 곳 기온 차가 6도라 옷차림 참고하세요.'));
  assert.ok(w({ temp: 6, txt: '', rain: 0 }, null)[2].includes('쌀쌀하니 겉옷 챙기세요.')); assert.ok(w({ temp: 30, txt: '', rain: 0 }, null)[2].includes('더우니 물 한 병'));
  assert.strictEqual(w(null, null).length, 3);                                              // 소요 · 혼잡 · 마무리
  assert.strictEqual(w({ temp: 'x' }, undefined).length, 3);                                // 이상한 날씨는 없는 것
});
t('목적지 미설정: 같은 곳도 미설정 · 현위치 문단', () => {
  const r = flat(mk({ to: '', wF: { temp: 5, txt: '흐림', rain: 50 }, hour: 8, cong: 80 }));
  assert.strictEqual(r[0], '지금 강남 일대는 5도, 흐림이에요.');
  assert.strictEqual(r[1], '비가 올 수도 있어요. 우산 하나 챙기시면 좋아요. 쌀쌀하니 겉옷 챙기세요.');
  assert.strictEqual(r[2], '지금은 출퇴근 혼잡 시간대예요. 이용에 참고하세요.');
  assert.strictEqual(r[3], '강남 일대 교통은 피크라 매우 붐벼요. 목적지를 정해 주시면 소요시간과 환승 경로까지 챙겨 드릴게요.');
  assert.deepStrictEqual(mk({ to: '강남' }).paras.length, mk({ to: '' }).paras.length);
  assert.ok(flat(mk({ to: '', hour: 23 }))[0].includes('늦은 시간이라 배차 간격이'));
  assert.ok(flat(mk({ to: '', hol: true }))[0].includes('주말·공휴일 시간표'));
  assert.ok(flat(mk({ to: '', cong: 10, hour: 12 }))[0].includes('원활해요'));
});
t('마무리: 난수로 문구 고르기 · 경계 · 같은 입력 같은 출력', () => {
  const cl = r => mk({ rnd: r }).paras.pop().sub[0];
  assert.ok(cl(0).startsWith('이동 중에도')); assert.ok(cl(0.26).startsWith('가시는 동안')); assert.ok(cl(0.51).startsWith('편안히')); assert.ok(cl(0.99).startsWith('안전하게'));
  assert.ok(cl(1).startsWith('이동 중에도')); assert.ok(cl(-1).startsWith('이동 중에도')); assert.ok(cl('x').startsWith('이동 중에도'));
  assert.deepStrictEqual(mk({ rnd: 0.3 }), mk({ rnd: 0.3 }));
});
t('이상한 입력에도 죽지 않는다', () => {
  assert.ok(homeBrief().paras.length > 0); assert.ok(homeBrief(null).paras.length > 0); assert.ok(homeBrief({ segs: 'x', nt: 5, wF: 3 }).paras.length > 0);
  assert.ok(homeBrief({ from: '가', to: '나', segs: [null] }).paras.length > 0);
});
t('순수 함수: 입력을 바꾸지 않는다', () => {
  const o = Object.assign({}, base, { segs: [{ type: 1, line: '2호선', from: 'a', to: 'b' }, { type: 1, line: '3호선', from: 'b', to: 'c' }] });
  const c = JSON.stringify(o); homeBrief(o); assert.strictEqual(JSON.stringify(o), c);
});
t('엔진은 화면(DOM)·색·좌표를 모른다', () => {
  const src = fs.readFileSync(path.join(root, 'engine/home-brief.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/document\.|window\.|innerHTML|style\.|#[0-9a-fA-F]{6}/.test(src));
});

// ── Worker 내장본 · 길 ──
const worker = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 내장되고 /home-brief 길이 있다', () => {
  assert.ok(/\/\/ ===== home-brief \(/.test(worker)); assert.ok(/home-brief \\ub05d =====/.test(worker));
  assert.ok(/url\.pathname === "\/home-brief"\) return handleHomeBrief\(request\)/.test(worker));
});
t('Worker 내장본 결과가 모듈과 같다', () => {
  const m = worker.match(/\/\/ ===== home-brief \([^\n]*\n([\s\S]*?)\/\/ ===== home-brief \\ub05d =====/);
  assert.ok(m);
  const body = m[1].replace(/^\s*if \(typeof module[^\n]*\n/m, '');
  const mod = new Function('Response', body + '; return { homeBrief: homeBrief };')(Response);
  const segsA = [{ type: 2, line: '146', from: '가', to: '나' }, { type: 1, line: '2호선', from: '나', to: '다' }, { type: 1, line: '9호선', from: '다', to: '라' }];
  const segsB = [{ type: 4, line: 'KTX', from: '서울', to: '부산', min: 150, depClock: '10:00', arrClock: '12:30', rideMin: 140 }];
  let n = 0;
  for (const segs of [null, segsA, segsB, [segsA[1]]]) for (const metro of [false, true]) for (const hour of [3, 8, 14, 18, 23]) for (const cong of [10, 50, 80]) for (const to of ['시청', '']) for (const nt of [null, { found: true, depMin: 800, arrMin: 830 }, { found: false, firstMin: 330 }]) {
    const a = Object.assign({}, base, { segs, metro, hour, cong, to, nt, wF: { temp: 5, txt: '흐림', rain: 50 }, wT: { temp: 11, txt: '맑음', rain: 0 }, rnd: (n % 10) / 10 }); n++;
    assert.deepStrictEqual(mod.homeBrief(a), homeBrief(a));
  }
  assert.ok(n > 300);
});
async function call(method, body) {
  const req = new Request('https://x/home-brief', { method, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const res = await handleHomeBrief(req); return { status: res.status, json: await res.json().catch(() => null) };
}
(async () => {
  let r = await call('POST', base);
  t('POST: ok · v · 문단', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.v, 1); assert.deepStrictEqual(r.json.paras, JSON.parse(JSON.stringify(homeBrief(base).paras))); });
  r = await call('GET'); t('GET → 405', () => assert.strictEqual(r.status, 405));
  r = await call('OPTIONS'); t('OPTIONS → 204', () => assert.strictEqual(r.status, 204));
  r = await call('POST', '{not json'); t('이상한 JSON → 400', () => assert.strictEqual(r.status, 400));
  r = await call('POST', 'x'.repeat(30001)); t('너무 긴 본문 → 413', () => assert.strictEqual(r.status, 413));
  console.log('home_brief: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
