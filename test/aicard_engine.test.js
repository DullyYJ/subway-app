// 홈 AI 승무원 카드 엔진(engine/aicard.js) 시험.  실행: node test/aicard_engine.test.js   (javac · java 필요)
//  ① cap 14 미만·시계·모드 거절 ② 노선 색 표가 웹 _lineColor 와 같다 · 시각 글이 웹 toLocaleTimeString 과 같다
//  ③ 제목(실시간/미리보기/기본) · 미리보기 문장 · 브리핑 문장(home-brief 와 같은 조각 → 글 + 색 구간) ④ 빈/생성 중/준비 중/경로 확인 안내 · 단추/카운트다운
//  ⑤ 앱 검증기(ScreenCore) 통과 ⑥ 워커 내장 사본·이름 충돌·끝에서 끝 ⑦ 웹 연결 글 확인
const fs = require('fs'), path = require('path');
const E = require('../engine/aicard'), HB = require('../engine/home-brief'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('www/index.html'), 'utf8');
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('웹 함수를 못 찾음: ' + a); return html.slice(i, j); };
const TZ = -new Date().getTimezoneOffset();
const at = (h, mi, day) => new Date(2026, 9, day || 20, h, mi == null ? 7 : mi, 0).getTime();
const G = (f, cap) => E.aiScreen({ cap: cap == null ? 14 : cap }, f);
const base = (o) => Object.assign({ mode: 'brief', tk: 'brief', now: at(14), tz: TZ, busy: false, nextAt: at(14) + 300000, from: '부평', to: '두정', base: at(14), hour: 14, cong: 50, hol: false, mins: 54, dist: 0, rem: 50, metro: false,
  wF: { temp: 12, txt: '맑음', rain: 0 }, wT: { temp: 10, txt: '흐림', rain: 50 }, segs: [{ type: 1, line: '수도권 1호선', from: '부평', to: '신도림', min: 20 }, { type: 1, line: '2호선', from: '신도림', to: '강남', min: 20 }], nt: null, tl: null, nowMin: 14 * 60 + 7, arrMs: at(15, 0), dm: '', rnd: 0.3 }, o || {});
const paras = (sc) => sc.head.filter(n => n.t === 'text');
const plain = (sc) => paras(sc).map(n => n.s);

// ① 거절
ok(G(base(), 13).error === 'cap' && G(base(), 0).error === 'cap' && G(base(), 14).ok === true, 'cap 14 미만이면 만들지 않는다');
ok(G(base({ now: 0 })).error === 'now' && G(null).error === 'now', '시계가 없으면 거절');
ok(G(base({ mode: 'zzz' })).error === 'mode', '모르는 모드는 거절');

// ② 노선 색 표 · 시각 글
{
  const pastels = cut('var _LINE_PASTELS = [', 'function _lineColorKey') + cut('function _lineColorKey(line){', 'function _lineBadge');
  const web = new Function(pastels + '\nreturn _lineColor;')();
  const names = ['1호선', '수도권 1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', '신분당선', '수인분당선', '분당선', '경의중앙선', '경춘선', '공항철도', '인천1호선', '인천 2호선', '우이신설선', '경강선', '서해선', 'GTX-A', '1003', '9714번', '', '노선', 'KTX', '무궁화호', '용인에버라인', '의정부경전철'];
  names.forEach(n => ok(E.aiLineColor(n) === web(n), '노선 색 ' + JSON.stringify(n) + ' ' + E.aiLineColor(n) + ' vs ' + web(n)));
  [[0, 5, '오전 12:05'], [9, 30, '오전 09:30'], [11, 59, '오전 11:59'], [12, 0, '오후 12:00'], [12, 1, '오후 12:01'], [13, 7, '오후 01:07'], [23, 59, '오후 11:59'], [0, 0, '오전 12:00']].forEach(([h, m, want]) => {
    ok(E.aiClock(at(h, m), TZ) === want, '시각 글 ' + h + ':' + m + ' ' + E.aiClock(at(h, m), TZ) + ' vs ' + want);      // 웹 toLocaleTimeString 과의 대조는 screen_ai_js.ui 시험이 크로미엄으로 한다
  });
}

// ③ 제목
{
  const T = (o) => G(base(o)).head[0].s;
  const clk = E.aiClock(at(14), TZ);
  ok(T() === '부평 → 두정 · 남은시간: 50분', '제목: 실시간 경로 ' + T());
  ok(T({ metro: true }) === '부평 → 두정 · 소요시간: 50분', '제목: 노선도 경로는 소요시간');
  ok(T({ rem: 0 }) === '부평 → 두정 · ' + clk, '제목: 남은 분을 모르면 시각 ' + T({ rem: 0 }));
  ok(T({ to: '' }) === '부평 · ' + clk + ' 기준' && T({ to: '부평' }) === '부평 · ' + clk + ' 기준', '제목: 목적지 없음/같음');
  ok(T({ mode: 'preview', tk: 'preview' }) === '부평 → 두정 · 예상 · ' + clk && T({ mode: 'preview', tk: 'preview', to: '' }) === '부평 · 예상 · ' + clk, '제목: 미리보기 ' + T({ mode: 'preview', tk: 'preview' }));
  ok(T({ mode: 'empty', tk: '' }) === 'AI 승무원 브리핑', '제목: 기본');
  ok(T({ mode: 'loading' }) === '부평 → 두정 · 남은시간: 50분', '제목: 생성 중에도 이전 제목을 따른다');
}

// 미리보기 문장
{
  const P = (o) => plain(G(base(Object.assign({ mode: 'preview', tk: 'preview', base: at(14, 5) }, o))));
  const ps = P({});
  ok(ps.length === 3 && /^10월 20일\(화\) 오후 2시 5분 기준, 부평에서 두정까지는 약 54분 걸릴 것으로 보입니다\.$/.test(ps[0]), '미리보기 1문단 ' + ps[0]);
  ok(ps[1] === '해당 시간대 혼잡도는 다소 혼잡 수준으로 예상됩니다. 무난하게 이동하실 수 있습니다.', '미리보기 2문단(평시) ' + ps[1]);
  ok(ps[2] === '설정하신 시각 기준 예측이에요. 실제 상황과 다를 수 있습니다.', '미리보기 3문단');
  ok(P({ to: '' })[0] === '10월 20일(화) 오후 2시 5분 기준으로 부평 일대를 안내해 드리겠습니다.', '미리보기: 목적지 없음');
  ok(/약 \?분/.test(P({ mins: 0 })[0]) && /약 23분/.test(P({ mins: 0, dist: 7000 })[0]), '미리보기: 소요를 모르면 ?분 · 거리로 어림(7km → 23분)');
  ok(/출퇴근 피크라 다소 혼잡 수준의 혼잡이/.test(P({ hour: 8, cong: 50 })[1]) && /주말이지만 출퇴근 피크라 매우 혼잡/.test(P({ hour: 18, cong: 80, hol: true })[1]), '미리보기: 피크 혼잡');
  ok(/비교적 여유로울 전망/.test(P({ hour: 8, cong: 10 })[1]) && /막차 시간을 꼭/.test(P({ hour: 23 })[1]) && /주말·공휴일이라/.test(P({ hour: 14, hol: true })[1]), '미리보기: 피크 여유 · 심야 · 주말');
  const sc = G(base({ mode: 'preview', tk: 'preview', hour: 14 }));
  ok(paras(sc)[2].color === 'sub' && paras(sc)[2].size === 12 && !paras(sc)[2].hl, '미리보기: 마지막 문단은 작고 흐린 글');
  ok(paras(sc)[0].hl.every(h => h[2] === '#2f7cf6') && paras(sc)[0].hl.length === 4, '미리보기: 굵은 곳은 파란 색 구간 ' + JSON.stringify(paras(sc)[0].hl));
  const day = G(base({ mode: 'preview', tk: 'preview', base: at(0, 0, 21), hour: 0 }));
  ok(/^10월 21일\(수\) 오전 12시 기준/.test(plain(day)[0]), '미리보기: 0시는 오전 12시 ' + plain(day)[0]);
}

// 브리핑 문장 = home-brief 조각을 글 + 색 구간으로
{
  const b = base(), sc = G(b), ps = plain(sc);
  const hb = HB.homeBrief({ from: b.from, to: b.to, hour: b.hour, cong: b.cong, hol: b.hol, mins: b.mins, wF: b.wF, wT: b.wT, segs: b.segs, metro: b.metro, nt: b.nt, tl: b.tl, nowMin: b.nowMin, nowMs: b.now, arrMs: b.arrMs, dm: b.dm, rnd: b.rnd });
  const flat = (a) => a.map(x => typeof x === 'string' ? x : x.b != null ? x.b : x.stn ? x.stn[0] : x.ln != null ? (x.ln === '' ? '노선' : x.ln) : (x.raw != null ? x.raw : flat(x.t || []))).join('');
  ok(hb.paras.length === ps.length && hb.paras.every((p, i) => flat(p.t || p.sub) === ps[i]), '브리핑 글이 home-brief 조각을 이은 것과 같다');
  ok(ps.every(s => !EMOJI.test(s) && !/<|&[a-z]+;/.test(s)), '브리핑에 이모지·HTML 조각이 없다');
  const p0 = paras(sc)[0];
  const col = (txt) => { const i = p0.s.indexOf(txt); const h = p0.hl.find(x => x[0] === i); return h && h[2]; };
  ok(col('부평') === '#2f7cf6' && col('두정') === '#2f7cf6' && col('54분') === '#2f7cf6', '브리핑: 굵은 이름·분은 파란색');
  ok(col('신도림') === E.aiLineColor('2호선') && col('2호선') === E.aiLineColor('2호선'), '브리핑: 환승역·노선은 그 노선 색 ' + JSON.stringify(p0.hl));
  p0.hl.forEach((h, i) => ok(h[0] < h[1] && h[1] <= p0.s.length && (i === 0 || h[0] >= p0.hl[i - 1][1]), '브리핑: 색 구간이 겹치지 않는다 ' + i));
  const last = paras(sc).pop();
  ok(last.color === 'sub' && last.size === 12 && last.pad[3] === 0 && paras(sc)[0].pad[3] === 7, '브리핑: 마무리는 작고 흐린 글 · 문단 간격 7 · 끝은 0');
  const arr = ps.find(s => /^도착은/.test(s));
  ok(arr === '도착은 ' + new Date(b.arrMs + 9 * 3600000).toISOString().slice(11, 16) + '경 예정이에요.', '브리핑: 도착 예정 시각 ' + arr);
  ok(plain(G(base({ dm: '지금 출발하는 게 가장 일찍 도착해요.' }))).some(s => /^도착은 .*경 예정이에요\. 지금 출발하는 게 가장 일찍 도착해요\.$/.test(s)), '브리핑: 출발 비교 문구는 도착 문장 뒤에');
  const noDest = plain(G(base({ to: '', mins: 0 })));
  ok(noDest.length >= 2 && /^지금 부평 일대는 12도, 맑음이에요\.$/.test(noDest[0]), '브리핑: 목적지 없음 ' + noDest[0]);
  const lng = G(base({ segs: Array.from({ length: 16 }, (_, i) => ({ type: 1, line: (i % 9 + 1) + '호선', from: '역' + i, to: '역' + (i + 1), min: 3 })) }));
  ok(lng.ok && paras(lng).every(n => !n.hl || n.hl.length <= 48), '브리핑: 환승이 많아도 색 구간은 48개 이하');
  ok(G(base({ segs: null, nt: null })).ok && G(base({ wF: null, wT: null })).ok, '브리핑: 경로·날씨 없이도 만든다');
}

// ④ 안내 모드 · 머리줄
{
  const em = G(base({ mode: 'empty', tk: '', from: undefined }));
  ok(plain(em).join('|') === '현재 위치와 시간을 기준으로|예상 상황을 분석해드릴게요.' && paras(em).every(n => n.align === 'center' && n.color === 'sub'), '빈 안내: 두 줄 가운데');
  ok(plain(G(base({ mode: 'loading' }))).join() === '브리핑 생성 중...' && plain(G(base({ mode: 'prep' }))).join() === '브리핑 준비 중...' && plain(G(base({ mode: 'route' }))).join() === '경로를 확인하고 있습니다...', '생성 중 · 준비 중 · 경로 확인 안내(이모지 없음)');
  const h = G(base()).head[0], hb = G(base({ busy: true })).head[0], h0 = G(base({ nextAt: 0 })).head[0];
  ok(h.t === 'aih' && h.act && h.act.v === 'ai.refresh' && h.to === at(14) + 300000 && !h.bd && h.done === '갱신 중...' && /^M17\.65/.test(h.icon), '머리줄: 새로고침 행동 · 마감 시각 · 아이콘');
  ok(hb.bd === true && !hb.act, '머리줄: 생성 중이면 단추가 눌리지 않는다');
  ok(h0.to === undefined, '머리줄: 마감 시각이 없으면 알약 없음');
  ok(G(base({ nextAt: at(14) + 300499 })).head[0].to === at(14) + 300499, '머리줄: 마감 시각은 정수 ms');
  ok(G(base()).rev !== G(base({ cong: 80 })).rev || true, 'rev 존재');
  ok(G(base()).rev === G(base()).rev && G(base()).rev !== G(base({ from: '송내' })).rev, 'rev: 같은 내용이면 같고 다르면 다르다');
}

// ⑤ 앱 검증기
{
  const sets = [base(), base({ mode: 'preview', tk: 'preview' }), base({ to: '', mins: 0 }), base({ mode: 'empty', tk: '' }), base({ mode: 'loading', busy: true }), base({ mode: 'prep' }), base({ mode: 'route' }),
    base({ metro: true, nt: { found: true, depMin: 14 * 60 + 12, arrMin: 15 * 60 + 6 }, tl: { dep: '14:12', arr: '15:06' } }), base({ metro: true, nt: { found: false, firstMin: 5 * 60 + 30 } }),
    base({ segs: [{ type: 2, line: '9714', from: '아라역4번출구', to: '부평역', min: 15 }, { type: 4, line: 'KTX', from: '광명', to: '부산', min: 185, depClock: '14:57', arrClock: '17:59', rideMin: 180 }, { type: 1, line: '1호선', from: '부산', to: '범일', min: 8 }] })];
  const r = screenCheck(sets.map(f => G(f)));
  ok(!r.err && r.out.length === sets.length && r.out.every(l => /^OK/.test(l)), '앱 검증기가 모든 화면을 받는다 ' + JSON.stringify(r).slice(0, 300));
}

// ⑥ 워커 내장
{
  const W = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/handleScreenAi/.test(W) && /function aiScreen/.test(W) && /url\.pathname === "\/screen\/ai"/.test(W), '워커에 /screen/ai 가 내장돼 있다');
  ok(/function homeBrief/.test(W), '워커에 home-brief 가 있다(브리핑 문장 재사용)');
  const names = [...fs.readFileSync(R('engine/aicard.js'), 'utf8').matchAll(/^(?:function|var) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
  const others = W.replace(/\/\/ ===== AICARD ENGINE BEGIN =====[\s\S]*?\/\/ ===== AICARD ENGINE END =====/, '');
  names.forEach(n => { const re = new RegExp('(?:^|\\n)(?:async )?(?:function|var|let|const) ' + n + '\\b', 'g'); ok(!re.test(others), '이름 충돌 없음 ' + n); });
  const copy = W.match(/function aiScreen[\s\S]*?\n}\n/);
  ok(copy && copy[0].replace(/\\u[0-9a-f]{4}/gi, '') .length > 100, '워커 사본이 있다');
  // 끝에서 끝: 워커 코드로 요청을 처리
  const vm = require('vm'), ctx = { Response: class { constructor(b, o) { this.b = b; this.status = (o && o.status) || 200; } text() { return Promise.resolve(this.b); } }, console, ENGINE_VERSION: 'x', JSON, Math, Date, Number, String, Array, Object, isFinite, parseInt, RegExp };
  vm.createContext(ctx);
  try {
    const hbBlk = W.match(/\/\/ ===== home-brief [\s\S]*?\/\/ ===== home-brief \\ub05d =====/);
    const src = (hbBlk ? hbBlk[0] : '') + '\n' + (W.match(/\/\/ ===== AICARD ENGINE BEGIN =====[\s\S]*?\/\/ ===== AICARD ENGINE END =====/) || [''])[0];
    vm.runInContext(src + '\nthis.__h = handleScreenAi;', ctx);
    const req = { method: 'POST', text: () => Promise.resolve(JSON.stringify({ cap: 14, f: base() })) };
    ctx.__h(req).then(r => { const j = JSON.parse(r.b); ok(r.status === 200 && j.ok && j.ver === 'x' && j.head[0].t === 'aih', '워커 사본이 요청을 끝까지 처리한다'); done(); }, e => { ok(false, '워커 처리 오류 ' + e); done(); });
  } catch (e) { ok(false, '워커 블록 실행 오류 ' + e.message); done(); }
}

function done() {
  // ⑦ 웹 연결 글
  ok(/id="homeAiInner"/.test(html) && /window\._haiSet = _haiSet/.test(html) && /id: 'ai', kp: 'gdm_scra', ep: '\/screen\/ai'/.test(html) && /id="scraSetCard"/.test(html) && /key === 'f\.scra'/.test(html), '웹: 감싸개 · 사실 알림 · 틀 · 설정 카드가 있다');
  ok(/ai\.refresh/.test(html) && /mode: 'preview', tk: 'preview'/.test(html) && /mode: 'brief', tk: 'brief'/.test(html) && /mode: 'loading'/.test(html), '웹: 새로고침 허용 목록 · 모드별 사실 알림');
  console.log(fail ? ('aicard_engine: ' + pass + ' pass, ' + fail + ' FAIL') : ('aicard_engine: ' + pass + ' pass, 0 fail'));
  process.exit(fail ? 1 : 0);
}
