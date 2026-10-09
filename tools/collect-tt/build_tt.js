// 수집 결과 → gildongmu-tt 번들 형식의 _REAL_TT 기록 + _TT_ORIENT(방향 힌트)로 변환해 기존 번들에 합친다.
// 사용: node tools/collect-tt/build_tt.js <기존번들.json> <출력번들.json> [--tago raw.json …] [--kric kric.json …]
//   · 기록: _REAL_TT["노선|역"] = { D:{상:[델타],하:[델타]}, W:{…}, S:{…(토요일 자료가 있을 때만)} }
//   · 시각: 출발시각(없으면 도착시각)의 '분'(초는 버림). 03:00 이전은 전날 운행의 연장이라 +1440. 같은 시각 중복은 하나로.
//     그 역이 종착인 열차(내릴 수만 있는 열차)는 뺀다.
//   · 평일=D, 휴일=W(일요일·공휴일), 토요일=S(자료가 있을 때만; 없으면 엔진이 W 로 대신한다).
//   · 상/하: TAGO 는 U→상, D→하. KRIC 은 '역 번호가 커지는 쪽으로 가는 열차'=하, 작아지는 쪽=상.
//   · _TT_ORIENT[노선] = { order:[역…], fwd:'상'|'하' } — 선형 노선에서 'order 번호가 커지는 쪽으로 가는 열차'의 키. 엔진은 이 노선의 방향을 시각표 상관 대신 이것으로 정한다.
const fs = require('fs');
const argv = process.argv.slice(2); const inP = argv[0], outP = argv[1];
const tagoFiles = [], kricFiles = [], busanFiles = [], fillFiles = []; let mode = null;
for (const a of argv.slice(2)) { if (a === '--tago') mode = tagoFiles; else if (a === '--kric') mode = kricFiles; else if (a === '--busan') mode = busanFiles; else if (a === '--kric-fill') mode = fillFiles; else if (mode) mode.push(a); }
const bundle = JSON.parse(fs.readFileSync(inP, 'utf8'));
const { NT_STNORDER } = require('../../engine/next-train-data.js');
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const RT = bundle.data._REAL_TT; bundle.data._TT_ORIENT = bundle.data._TT_ORIENT || {};
const NONLINEAR = new Set(['경의중앙선']);
const ENDBASED = new Set(['GTX-A', '서해선']);   // TAGO 의 상/하가 구간마다 뒤집히는 노선 — 종착역 위치로 방향 키를 다시 정한다(순서는 번들 _TT_ORDER_HARD)               // 갈라지거나 구간이 나뉜 노선 — 방향 힌트를 만들지 않는다(시각표 상관 사용)
const ORDER_FIX = { '공항철도': ['서울', '공덕', '홍대입구', '디지털미디어시티', '마곡나루', '김포공항', '계양', '검암', '청라국제도시', '영종', '운서', '공항화물청사', '인천공항1터미널', '인천공항2터미널'] };
function toMin(s) { if (!s || s === '0' || !/^\d{6}$/.test(s)) return null; let m = (+s.slice(0, 2)) * 60 + (+s.slice(2, 4)); if (m < 180) m += 1440; return m; }
function enc(minsArr) { const s = Array.from(new Set(minsArr.filter(x => x != null))).sort((a, b) => a - b); if (!s.length) return null; const o = [s[0]]; for (let i = 1; i < s.length; i++) o.push(s[i] - s[i - 1]); return o; }
// 실측 인접 관계(_REAL_SEG)로 만든 '이웃 그래프'(TAGO 에 있는 역만; 자료에 없는 역 하나를 사이에 둔 두 역도 이웃).
function contractedGraph(bundle, line, names) {
  const present = new Set(names), adj = {}; names.forEach(n => adj[n] = new Set());
  const raw = {}; for (const k in (bundle.data._REAL_SEG || {})) { const p = k.split('|'); if (p[0] !== line) continue; const a = nz(p[1]), b = nz(p[2]); (raw[a] = raw[a] || new Set()).add(b); (raw[b] = raw[b] || new Set()).add(a); }
  if (!Object.keys(raw).length) return null;
  for (const a of names) for (const b of (raw[a] || [])) { if (present.has(b)) { if (a !== b) { adj[a].add(b); adj[b].add(a); } } else for (const c of (raw[b] || [])) if (present.has(c) && c !== a) { adj[a].add(c); adj[c].add(a); } }
  return adj;
}
// 순서가 '첫 역에서 바깥으로 뻗는 나무' 모양인지: 이웃 그래프가 사이클 없는 한 덩어리 나무이고, 모든 이웃쌍에서 첫 역에서 먼 쪽이 순서 번호도 크다.
//   → 순서 번호가 커지는 쪽 = 바깥쪽. 한 줄이거나 Y자(5호선 마천·하남)여도 어느 이웃쌍이든 방향이 한 가지로 정해진다. 고리(6호선 응암, 2호선)나 급행 건너뜀 간선이 있으면 실패.
function outwardTreeOK(adj, order) {
  if (!adj) return false; const idx = {}; order.forEach((n, i) => idx[n] = i);
  let edges = 0; order.forEach(n => edges += adj[n].size); edges /= 2;
  if (edges !== order.length - 1) return false;
  const dist = { [order[0]]: 0 }, q = [order[0]];
  while (q.length) { const c = q.shift(); for (const x of adj[c]) if (dist[x] == null) { dist[x] = dist[c] + 1; q.push(x); } }
  if (order.some(n => dist[n] == null)) return false;
  for (const a of order) for (const b of adj[a]) { if (Math.abs(dist[a] - dist[b]) !== 1) return false; if ((dist[a] < dist[b]) !== (idx[a] < idx[b])) return false; }
  return true;
}
// 한 줄 경로(양 끝 두 역, 모두 차수 ≤2)면 그 순서
function physicalPath(adj, names) {
  if (!adj) return null; const ends = names.filter(n => adj[n].size === 1);
  if (ends.length !== 2 || names.some(n => adj[n].size === 0 || adj[n].size > 2)) return null;
  const path = [ends[0]], seen = new Set(path); let cur = ends[0];
  while (true) { const nx = [...adj[cur]].find(x => !seen.has(x)); if (!nx) break; path.push(nx); seen.add(nx); cur = nx; }
  return path.length === names.length ? path : null;
}
const stat = {}; const lineStations = {};   // line -> [{nm, rec}]
function put(line, nm, day, dir, mins) {
  const arr = enc(mins); if (!arr) return;
  const key = line + '|' + nm; const rec = (RT[key] && RT[key].__new) ? RT[key] : (RT[key] = { __new: 1 });
  (rec[day] = rec[day] || {})[dir] = arr;
}
const KMAP = { 'DG|1': '대구1호선', 'DG|2': '대구2호선', 'DG|3': '대구3호선', 'DJ|1': '대전1호선', 'GJ|1': '광주1호선', 'SL|L1': '신림선', 'AR|A1': '공항철도', 'BG|B1': '부산김해경전철' };
const KRIC_LINES = new Set();
for (const f of kricFiles) for (const row of JSON.parse(fs.readFileSync(f, 'utf8'))) { const l = KMAP[row.opr + '|' + row.ln]; if (l && NT_STNORDER[l]) KRIC_LINES.add(l); }
// ── TAGO ──
const tagoStn = {};   // line -> [{nm,id,side:{U:lo/hi}}]
const idSort = (a, b) => { const f = x => { const m = x.id.match(/^(\D*)(\d*)(\D*)(\d+)$/); return m ? [m[1] + m[2] + m[3], +m[4]] : [x.id, 0]; }; const A = f(a), B = f(b); return A[0] < B[0] ? -1 : A[0] > B[0] ? 1 : A[1] - B[1]; };
for (const f of tagoFiles) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const id in raw) {
    const r = raw[id]; if (KRIC_LINES.has(r.line)) continue;       // KRIC 자료가 있는 노선은 KRIC(방향 정보가 더 정확)을 쓴다
    if (!NT_STNORDER[r.line] || !NT_STNORDER[r.line].some(s => nz(s) === r.nm)) continue;
    const key = r.line + '|' + r.nm; if (RT[key] && !RT[key].__new) continue;     // 기존(서울 1~9호선 등) 기록은 건드리지 않는다
    const days = { D: '01', S: '02', W: '03' };
    if (ENDBASED.has(r.line) && bundle.data._TT_ORDER_HARD[r.line]) {
      const ord = bundle.data._TT_ORDER_HARD[r.line].map(nz), ix = {}; ord.forEach((n, i) => ix[n] = i);
      for (const [dn, dc] of Object.entries(days)) {
        const up = [], dn2 = [];
        for (const ud of ['U', 'D']) for (const x of (r.tt[dc + ud] || [])) { const e = nz(x[2]); if (e === r.nm || ix[r.nm] == null) continue; const t = toMin((x[1] && x[1] !== '0') ? x[1] : x[0]);
          if (!e) { if (ix[r.nm] === 0) dn2.push(t); else if (ix[r.nm] === ord.length - 1) up.push(t); continue; }   // 종착역 이름이 비어 있는 행 = 기점역에서 출발하는 열차(갈 수 있는 방향이 하나뿐)
          if (ix[e] == null) continue; (ix[e] > ix[r.nm] ? dn2 : up).push(t); }
        put(r.line, r.nm, dn, '상', up); put(r.line, r.nm, dn, '하', dn2);
      }
      (tagoStn[r.line] = tagoStn[r.line] || []).push({ nm: r.nm, id, ends: { U: [], D: [] }, endBased: true });
      continue;
    }
    for (const [dn, dc] of Object.entries(days)) for (const [ud, dk] of [['U', '상'], ['D', '하']]) {
      const rows = (r.tt[dc + ud] || []).filter(x => nz(x[2]) !== r.nm);          // 이 역이 종착인 열차는 뺀다
      put(r.line, r.nm, dn, dk, rows.map(x => toMin((x[1] && x[1] !== '0') ? x[1] : x[0])));
    }
    (tagoStn[r.line] = tagoStn[r.line] || []).push({ nm: r.nm, id, ends: { U: r.tt['01U'].map(x => nz(x[2])), D: r.tt['01D'].map(x => nz(x[2])) } });
  }
}
for (const l in tagoStn) {
  if (ENDBASED.has(l) && bundle.data._TT_ORDER_HARD[l]) { const order = bundle.data._TT_ORDER_HARD[l].map(nz); bundle.data._TT_ORIENT[l] = { order, fwd: '하' }; stat[l] = Object.assign(stat[l] || {}, { TAGO역: tagoStn[l].length, 방향힌트: 'O(종착역 기준, 번들 순서)' }); lineStations[l] = order; continue; }
  let st = tagoStn[l].sort(idSort); let order = st.map(s => s.nm);
  if (ORDER_FIX[l]) { const have = new Set(order); const fixed = ORDER_FIX[l].filter(n => have.has(n)); order.forEach(n => { if (!fixed.includes(n)) fixed.push(n); }); order = fixed; }
  // 서울 1~9호선: 역 ID 순서가 선로 순서와 다른 노선이 있다(7호선은 석남→장암으로 끊기고 8호선 별내선·9호선 노량진은 뒤섞인다). 번들의 실측 인접 관계(_REAL_SEG)에서 '한 줄'로 이어지는 순서를 만들 수 있을 때만 그 순서를 쓰고, 못 만들면 방향 힌트를 만들지 않는다(엔진이 시각표 상관으로 정한다).
  let seoulPhysical = null;
  if (/^\d호선$/.test(l)) {
    const g = contractedGraph(bundle, l, order);
    if (g && outwardTreeOK(g, order)) seoulPhysical = order;                    // 역 ID 순서가 그대로 선로 순서(바깥으로 뻗는 나무)
    else { const pp = physicalPath(g, order); if (pp) { seoulPhysical = pp; order = pp; } }
  }
  const idx = {}; order.forEach((n, i) => idx[n] = i);
  let loN = 0, hiN = 0;                                                        // U 열차가 번호 작은 쪽/큰 쪽으로 가는 역 수
  for (const s of st) { let lo = 0, hi = 0; s.ends.U.forEach(e => { if (idx[e] == null) return; if (idx[e] < idx[s.nm]) lo++; else if (idx[e] > idx[s.nm]) hi++; }); if (lo > hi) loN++; else if (hi > lo) hiN++; }
  const dec = loN + hiN, major = Math.max(loN, hiN);
  const ok = !NONLINEAR.has(l) && dec >= 4 && major / dec >= 0.9 && (!/^\d호선$/.test(l) || !!seoulPhysical);
  stat[l] = Object.assign(stat[l] || {}, { TAGO역: st.length, 방향힌트: ok ? 'O' : 'X(U방향 일관 ' + major + '/' + dec + (NONLINEAR.has(l) ? ', 비선형' : '') + ')' });
  if (ok) bundle.data._TT_ORIENT[l] = { order, fwd: loN > hiN ? '하' : '상' };   // U 가 번호 작은 쪽이면 번호 커지는 쪽은 D(하)
  lineStations[l] = order;
}
// ── KRIC ──
const kr = {};
for (const f of kricFiles) for (const row of JSON.parse(fs.readFileSync(f, 'utf8'))) {
  const line = KMAP[row.opr + '|' + row.ln]; if (!line || !NT_STNORDER[line]) continue;
  (kr[line] = kr[line] || {})[row.st] = kr[line][row.st] || { nm: nz(row.nm), days: {} };
  const o = kr[line][row.st]; const rows = String(row.data || '').split('\n').filter(Boolean).map(x => x.split(','));
  const dayKey = { '8': 'D', '9': 'W', '7': 'S' }[row.day]; if (!dayKey) continue;
  const up = [], dn = [];
  for (const r of rows) { const [trn, arr, dep, org, dst] = r; if (dst === row.st) continue;       // 종착
    const t = toMin(dep) != null ? toMin(dep) : toMin(arr); if (t == null) continue;
    (dst > row.st ? dn : up).push(t); }       // 역 번호(문자열 순서 = 선로 순서)가 커지는 쪽으로 가는 열차 = 하
  o.days[dayKey] = { 상: up, 하: dn };
}
for (const line in kr) {
  const sts = Object.keys(kr[line]).sort((a, b) => +a - +b);
  for (const st of sts) { const o = kr[line][st]; const key = line + '|' + o.nm; if (RT[key] && !RT[key].__new) continue;
    for (const dn of ['D', 'W', 'S']) if (o.days[dn]) for (const dk of ['상', '하']) put(line, o.nm, dn, dk, o.days[dn][dk]); }
  const order = sts.map(s => kr[line][s].nm);
  bundle.data._TT_ORIENT[line] = { order, fwd: '하' };
  stat[line] = Object.assign(stat[line] || {}, { KRIC역: sts.length, 방향힌트: 'O(역번호 순)' });
  lineStations[line] = order;
}
// ── 부산교통공사(웹 수집; tools/collect-tt/busan.js) ──
//   · busan.json = {호선:{역코드:{nm, ud:{0:{rows}, 1:{rows}}}}}. rows=[[시, 평일[[행선,분]…], 토요일[…], 일·공휴일[…]]…]. 역코드가 커지는 쪽이 하(노포·양산·대저·안평 쪽).
//   · 방향: 행선역이 이 역보다 번호가 큰 쪽이면 하, 작은 쪽이면 상. 행선=이 역(종착)인 열차는 뺀다.
for (const f of busanFiles) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const ho in raw) {
    const line = '부산' + ho + '호선'; if (!NT_STNORDER[line]) continue;
    const nzOrder = NT_STNORDER[line].map(nz), ix = {}; nzOrder.forEach((n, i) => ix[n] = i);
    const codes = Object.keys(raw[ho]).sort((a, b) => +a - +b), seq = [];
    let miss = [];
    for (const c of codes) { const o = raw[ho][c]; const nm = nz(o.nm);
      if (ix[nm] == null) { miss.push(o.nm); continue; }
      seq.push(nm);
      const acc = { D: { 상: [], 하: [] }, S: { 상: [], 하: [] }, W: { 상: [], 하: [] } };   // 행선이 적힌 행
      const blk = { D: { 상: [], 하: [] }, S: { 상: [], 하: [] }, W: { 상: [], 하: [] } };   // 행선이 빈 행(페이지 방향 라벨로 판정)
      for (const ud of ['0', '1']) { const p = o.ud && o.ud[ud]; if (!p || !p.rows) continue; const onDest = nz(String(p.on || '').replace(/행$/, ''));
        for (const [hh, ...cols] of p.rows) { const h = +hh; const base = h < 3 ? h + 24 : h;
          cols.forEach((arr, ci) => { const dn = ['D', 'S', 'W'][ci]; for (const [dest, mm] of arr) { const e = nz(dest) || onDest; if (e === nm || ix[e] == null) continue; (nz(dest) ? acc : blk)[dn][ix[e] > ix[nm] ? '하' : '상'].push(base * 60 + (+mm)); } }); } }
      const term = ix[nm] === 0 || ix[nm] === nzOrder.length - 1;   // 종착 역의 빈 행은 (안평·대저처럼) 같은 출발을 되풀이하는 경우와 (수영·미남처럼) 나머지 출발인 경우가 있다 — 행선이 적힌 출발 수가 빈 행 이상이면 되풀이로 보고 뺀다
      for (const dn of ['D', 'S', 'W']) for (const dk of ['상', '하']) if (!(term && acc[dn][dk].length >= blk[dn][dk].length)) acc[dn][dk] = acc[dn][dk].concat(blk[dn][dk]);
      for (const dn of ['D', 'S', 'W']) for (const dk of ['상', '하']) put(line, nm, dn, dk, acc[dn][dk]);
    }
    const sorted = seq.every((n, i) => i === 0 || ix[n] > ix[seq[i - 1]]);
    bundle.data._TT_ORIENT[line] = { order: NT_STNORDER[line].map(nz).filter(n => seq.includes(n)), fwd: '하' };
    stat[line] = Object.assign(stat[line] || {}, { 부산역: seq.length + '/' + NT_STNORDER[line].length, 순서일치: sorted, 이름불일치: miss.join(',') || '-', 방향힌트: 'O(역코드 순)' });
    lineStations[line] = bundle.data._TT_ORIENT[line].order;
  }
}
// ── 빈 역 보충(코레일 KRIC; --kric-fill kric_KR.json) ──
//   TAGO 에 시각표가 없는 역(수인분당 청량리·신길온천, 경의중앙 지평·문산·운천·임진강, 경춘 광운대 …)만, 코레일 역별 시각표로 채운다. 이미 기록이 있는 역은 건드리지 않는다.
//   방향 키는 TAGO 와 같은 기준(U→상, D→하)으로 맞춘다: 열차의 종착역 이름이 TAGO 에서 주로 U 로 가면 상, D 로 가면 하.
//   종착역 이름만으로 방향이 갈리지 않는 몇 개(HAND)는 노선 지리로 직접 정했다.
const FILL_MAP = { K1: '수인분당선', K2: '경춘선', K4: '경의중앙선' };
const HAND = {   // 노선: { '이 역|행선': '상'|'하' }
  '수인분당선': { '신길온천|오이도': '하' },
  '경의중앙선': { '지평|용산': '상', '문산|용산': '하', '운천|문산': '하', '임진강|문산': '하' }
};
if (fillFiles.length) {
  const endLab = {};   // 노선 -> 종착역 -> {U,D}
  for (const f of tagoFiles) { const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const id in raw) { const r = raw[id]; if (!Object.values(FILL_MAP).includes(r.line)) continue; const m = endLab[r.line] = endLab[r.line] || {};
      for (const u of ['U', 'D']) for (const x of (r.tt['01' + u] || [])) { const e = nz(x[2]); if (!e || e === r.nm) continue; (m[e] = m[e] || { U: 0, D: 0 })[u]++; } } }
  const names = {}, rowsBy = {};
  for (const f of fillFiles) for (const row of JSON.parse(fs.readFileSync(f, 'utf8'))) { if (row.opr !== 'KR' || !FILL_MAP[row.ln]) continue; names[row.ln + '|' + row.st] = nz(row.nm); (rowsBy[row.ln] = rowsBy[row.ln] || []).push(row); }
  for (const ln in rowsBy) { const line = FILL_MAP[ln];
    for (const row of rowsBy[ln]) { const nm = nz(row.nm); const key = line + '|' + nm;
      if (!NT_STNORDER[line] || !NT_STNORDER[line].some(x => nz(x) === nm)) continue;
      const cnt = r0 => r0 && r0.D ? ['상', '하'].reduce((a, k) => a + (r0.D[k] ? r0.D[k].length : 0), 0) : 0;
      let kn = 0; { const dd = String(row.data || '').split('\n').filter(Boolean).filter(x => { const c = x.split(','); const d = names[ln + '|' + c[4]]; return d && d !== nm && (c[2] || c[1]); }).length; kn = dd; }
      // 이미 기록이 있으면 건드리지 않는다. 다만 하루 30편 이하의 드문 역에서 코레일 쪽이 평일 편수가 더 많으면(TAGO 가 일부 열차를 빠뜨린 경우) 코레일로 바꾼다.
      if (RT[key] && !(row.day === '8' && cnt(RT[key]) <= 30 && kn > cnt(RT[key]))) { if (row.day === '8' && cnt(RT[key]) !== kn && Math.abs(cnt(RT[key]) - kn) > 0.05 * Math.max(kn, 1)) stat[line] = Object.assign(stat[line] || {}, { ['편수차이_' + nm]: 'TAGO ' + cnt(RT[key]) + '편 / 코레일 ' + kn + '편(유지)' }); continue; }
      if (RT[key] && row.day === '8') { stat[line] = Object.assign(stat[line] || {}, { ['교체_' + nm]: 'TAGO ' + cnt(RT[key]) + '→코레일 ' + kn }); RT[key] = { __new: 1 }; }
      const dayKey = { '8': 'D', '9': 'W', '7': 'S' }[row.day]; if (!dayKey) continue;
      const up = [], dn = []; let unk = 0;
      for (const r of String(row.data || '').split('\n').filter(Boolean).map(x => x.split(','))) { const [, arr, dep, , dst] = r;
        const dest = names[ln + '|' + dst] || ''; if (!dest || dest === nm) continue;                   // 이 역이 종착인 열차는 뺀다
        const t = toMin(dep) != null ? toMin(dep) : toMin(arr); if (t == null) continue;
        let lab = (HAND[line] || {})[nm + '|' + dest];
        if (!lab) { const c = (endLab[line] || {})[dest]; if (c && c.U !== c.D) lab = c.U > c.D ? '상' : '하'; }
        if (!lab) { unk++; continue; }
        (lab === '상' ? up : dn).push(t); }
      put(line, nm, dayKey, '상', up); put(line, nm, dayKey, '하', dn);
      stat[line] = Object.assign(stat[line] || {}, { ['보충_' + nm]: '코레일(' + (up.length + dn.length) + '건' + (unk ? ', 방향불명 ' + unk : '') + ')' });
    } }
}
let added = 0;
for (const k in RT) if (RT[k].__new) { delete RT[k].__new; added++; const l = k.split('|')[0]; stat[l] = stat[l] || {}; stat[l].기록 = (stat[l].기록 || 0) + 1; if (RT[k].S) stat[l].토요일 = (stat[l].토요일 || 0) + 1; }
const today = new Date().toISOString().slice(0, 10);
bundle.version = String(bundle.version).replace(/\+tago.*$/, '') + '+tago-' + today;
fs.writeFileSync(outP, JSON.stringify(bundle));
fs.writeFileSync(outP.replace(/\.json$/, '') + '.order.json', JSON.stringify(lineStations));
console.log('추가', added, bundle.version); for (const l in stat) console.log(' ', l.padEnd(8), JSON.stringify(stat[l]));
