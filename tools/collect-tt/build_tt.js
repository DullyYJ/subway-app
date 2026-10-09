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
const tagoFiles = [], kricFiles = []; let mode = null;
for (const a of argv.slice(2)) { if (a === '--tago') mode = tagoFiles; else if (a === '--kric') mode = kricFiles; else if (mode) mode.push(a); }
const bundle = JSON.parse(fs.readFileSync(inP, 'utf8'));
const { NT_STNORDER } = require('../../engine/next-train-data.js');
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const RT = bundle.data._REAL_TT; bundle.data._TT_ORIENT = bundle.data._TT_ORIENT || {};
const NONLINEAR = new Set(['경의중앙선', 'GTX-A', '서해선']);               // 갈라지거나 구간이 나뉜 노선 — 방향 힌트를 만들지 않는다(시각표 상관 사용)
const ORDER_FIX = { '공항철도': ['서울', '공덕', '홍대입구', '디지털미디어시티', '마곡나루', '김포공항', '계양', '검암', '청라국제도시', '영종', '운서', '공항화물청사', '인천공항1터미널', '인천공항2터미널'] };
function toMin(s) { if (!s || s === '0' || !/^\d{6}$/.test(s)) return null; let m = (+s.slice(0, 2)) * 60 + (+s.slice(2, 4)); if (m < 180) m += 1440; return m; }
function enc(minsArr) { const s = Array.from(new Set(minsArr.filter(x => x != null))).sort((a, b) => a - b); if (!s.length) return null; const o = [s[0]]; for (let i = 1; i < s.length; i++) o.push(s[i] - s[i - 1]); return o; }
const stat = {}; const lineStations = {};   // line -> [{nm, rec}]
function put(line, nm, day, dir, mins) {
  const arr = enc(mins); if (!arr) return;
  const key = line + '|' + nm; const rec = (RT[key] && RT[key].__new) ? RT[key] : (RT[key] = { __new: 1 });
  (rec[day] = rec[day] || {})[dir] = arr;
}
// ── TAGO ──
const tagoStn = {};   // line -> [{nm,id,side:{U:lo/hi}}]
const idSort = (a, b) => { const f = x => { const m = x.id.match(/^(\D*)(\d*)(\D*)(\d+)$/); return m ? [m[1] + m[2] + m[3], +m[4]] : [x.id, 0]; }; const A = f(a), B = f(b); return A[0] < B[0] ? -1 : A[0] > B[0] ? 1 : A[1] - B[1]; };
for (const f of tagoFiles) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const id in raw) {
    const r = raw[id]; if (!NT_STNORDER[r.line] || !NT_STNORDER[r.line].some(s => nz(s) === r.nm)) continue;
    const key = r.line + '|' + r.nm; if (RT[key] && !RT[key].__new) continue;     // 기존(서울 1~9호선 등) 기록은 건드리지 않는다
    const days = { D: '01', S: '02', W: '03' };
    for (const [dn, dc] of Object.entries(days)) for (const [ud, dk] of [['U', '상'], ['D', '하']]) {
      const rows = (r.tt[dc + ud] || []).filter(x => nz(x[2]) !== r.nm);          // 이 역이 종착인 열차는 뺀다
      put(r.line, r.nm, dn, dk, rows.map(x => toMin((x[1] && x[1] !== '0') ? x[1] : x[0])));
    }
    (tagoStn[r.line] = tagoStn[r.line] || []).push({ nm: r.nm, id, ends: { U: r.tt['01U'].map(x => nz(x[2])), D: r.tt['01D'].map(x => nz(x[2])) } });
  }
}
for (const l in tagoStn) {
  let st = tagoStn[l].sort(idSort); let order = st.map(s => s.nm);
  if (ORDER_FIX[l]) { const have = new Set(order); const fixed = ORDER_FIX[l].filter(n => have.has(n)); order.forEach(n => { if (!fixed.includes(n)) fixed.push(n); }); order = fixed; }
  const idx = {}; order.forEach((n, i) => idx[n] = i);
  let loN = 0, hiN = 0;                                                        // U 열차가 번호 작은 쪽/큰 쪽으로 가는 역 수
  for (const s of st) { let lo = 0, hi = 0; s.ends.U.forEach(e => { if (idx[e] == null) return; if (idx[e] < idx[s.nm]) lo++; else if (idx[e] > idx[s.nm]) hi++; }); if (lo > hi) loN++; else if (hi > lo) hiN++; }
  const dec = loN + hiN, major = Math.max(loN, hiN);
  const ok = !NONLINEAR.has(l) && dec >= 4 && major / dec >= 0.9;
  stat[l] = Object.assign(stat[l] || {}, { TAGO역: st.length, 방향힌트: ok ? 'O' : 'X(U방향 일관 ' + major + '/' + dec + (NONLINEAR.has(l) ? ', 비선형' : '') + ')' });
  if (ok) bundle.data._TT_ORIENT[l] = { order, fwd: loN > hiN ? '하' : '상' };   // U 가 번호 작은 쪽이면 번호 커지는 쪽은 D(하)
  lineStations[l] = order;
}
// ── KRIC ──
const KMAP = { 'DG|1': '대구1호선', 'DG|2': '대구2호선', 'DG|3': '대구3호선', 'DJ|1': '대전1호선', 'GJ|1': '광주1호선' };
const kr = {};
for (const f of kricFiles) for (const row of JSON.parse(fs.readFileSync(f, 'utf8'))) {
  const line = KMAP[row.opr + '|' + row.ln]; if (!line) continue;
  (kr[line] = kr[line] || {})[row.st] = kr[line][row.st] || { nm: nz(row.nm), days: {} };
  const o = kr[line][row.st]; const rows = String(row.data || '').split('\n').filter(Boolean).map(x => x.split(','));
  const dayKey = { '8': 'D', '9': 'W', '7': 'S' }[row.day]; if (!dayKey) continue;
  const up = [], dn = [];
  for (const r of rows) { const [trn, arr, dep, org, dst] = r; if (dst === row.st) continue;       // 종착
    const t = toMin(dep) != null ? toMin(dep) : toMin(arr); if (t == null) continue;
    (+dst > +row.st ? dn : up).push(t); }
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
let added = 0;
for (const k in RT) if (RT[k].__new) { delete RT[k].__new; added++; const l = k.split('|')[0]; stat[l] = stat[l] || {}; stat[l].기록 = (stat[l].기록 || 0) + 1; if (RT[k].S) stat[l].토요일 = (stat[l].토요일 || 0) + 1; }
const today = new Date().toISOString().slice(0, 10);
bundle.version = String(bundle.version).replace(/\+tago.*$/, '') + '+tago-' + today;
fs.writeFileSync(outP, JSON.stringify(bundle));
fs.writeFileSync(outP.replace(/\.json$/, '') + '.order.json', JSON.stringify(lineStations));
console.log('추가', added, bundle.version); for (const l in stat) console.log(' ', l.padEnd(8), JSON.stringify(stat[l]));
