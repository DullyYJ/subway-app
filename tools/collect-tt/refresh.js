// 시각표 분기 자동 갱신의 두뇌 — 새로 모은 원본(TAGO·KRIC·부산)으로 번들을 다시 만들되, '틀린 부분만' 안전하게 바꾼다.
// 사용: node tools/collect-tt/refresh.js --base <현재번들.json> --out <최종번들.json> --report <보고.md> [build_tt.js 에 넘길 옵션들: --tago … --kric … --kric-fill … --busan …]
//   · 관리 대상 노선(MANAGED)의 기록만 다시 만든다. 서울 1~9호선 등 그 밖의 기록은 그대로 둔다.
//   · 안전장치(노선 단위): ① 새 역 수가 옛것의 90% 미만이면 거부 ② 옛 평일 편수가 20편 이상인 역 중 새 편수가 절반 미만인 역이 30% 넘으면 거부
//       ③ 방향 검증(validate_tt)이 옛것보다 나빠지면 거부.  거부된 노선은 옛 기록을 그대로 둔다(보고서에 '확인 필요').
//   · 역 단위: 새 자료에 없는 역은 옛 기록을 유지한다. 새 자료가 있으면 그 역만 바꾼다. 달라진 게 하나도 없으면 변경 없음(버전도 안 올림).
//   · 출력 옆에 changed.txt('yes'|'no'), rejected.txt(거부된 노선 목록) 를 쓴다.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const argv = process.argv.slice(2); const opt = {}; const rest = [];
for (let i = 0; i < argv.length; i++) { if (['--base', '--out', '--report'].includes(argv[i])) { opt[argv[i].slice(2)] = argv[++i]; } else rest.push(argv[i]); }
if (!opt.base || !opt.out) { console.error('--base, --out 필요'); process.exit(2); }
const MANAGED = ['신분당선', '수인분당선', '에버라인선', '경의중앙선', 'GTX-A', '서해선', '경춘선', '경강선', '의정부선', '우이신설선',
  '대구1호선', '대구2호선', '대구3호선', '대전1호선', '광주1호선', '신림선', '공항철도', '부산1호선', '부산2호선', '부산3호선', '부산4호선',
  '3호선', '4호선', '5호선', '6호선', '9호선'];
// 서울 3호선은 TAGO, 4·5·6·9호선은 KRIC(우리 D1 에 엔진이 매일 갱신해 두는 값)에서 가져온다. 이 노선들은 TAGO 와 KRIC 모두 옛 번들과 같은 원본(±2분)인데,
// 옛 번들은 방향 라벨이 노선마다 뒤집혀 있거나 일관되지 않아 엔진의 방향 판정이 인접 역쌍의 25~30% 에서 모호했다. 새 자료는 역 코드 순서(= 선로 순서, _REAL_SEG 로 검증)로 방향 힌트까지 줘서 0% 다.
// 1·2·7·8호선과 인천·김포는 넣지 않았다 — 이유는 HANDOFF 의 '서울·인천·김포 시각표 점검' 참조(주간 감시 watch-covered-tt.yml 이 달라짐만 이슈로 알린다).
// 환경변수 MANAGED_EXTRA(쉼표 구분): 이번 실행에서만 관리 대상에 더할 노선(시험·임시 확장용)
for (const l of String(process.env.MANAGED_EXTRA || '').split(',').map(x => x.trim()).filter(Boolean)) if (!MANAGED.includes(l)) MANAGED.push(l);
const M = new Set(MANAGED);
const lineOf = k => k.split('|')[0];
const old = JSON.parse(fs.readFileSync(opt.base, 'utf8'));
const dir = path.dirname(opt.out), tmpBase = path.join(dir, 'refresh-stripped.json'), tmpBuilt = path.join(dir, 'refresh-built.json');

// 1) 관리 대상 노선의 기록을 뺀 바탕을 만들어 build_tt.js 로 새로 만든다
const stripped = JSON.parse(JSON.stringify(old));
for (const k of Object.keys(stripped.data._REAL_TT)) if (M.has(lineOf(k))) delete stripped.data._REAL_TT[k];
stripped.data._TT_ORIENT = stripped.data._TT_ORIENT || {}; for (const l of MANAGED) delete stripped.data._TT_ORIENT[l];
fs.writeFileSync(tmpBase, JSON.stringify(stripped));
cp.execFileSync('node', [path.join(__dirname, 'build_tt.js'), tmpBase, tmpBuilt].concat(rest), { stdio: 'inherit', maxBuffer: 1 << 28 });
const built = JSON.parse(fs.readFileSync(tmpBuilt, 'utf8'));
const order = JSON.parse(fs.readFileSync(tmpBuilt.replace(/\.json$/, '') + '.order.json', 'utf8'));

// 2) 노선별로 새 기록 / 옛 기록 모으기
const OT = old.data._REAL_TT, NT = built.data._REAL_TT;
const keysOf = (T, l) => Object.keys(T).filter(k => lineOf(k) === l);
const dTot = r => r && r.D ? ['상', '하'].reduce((a, k) => a + (r.D[k] ? r.D[k].length : 0), 0) : 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 3) 노선 단위 안전장치 ①②
const verdict = {};   // 노선 -> { ok, why }
for (const l of MANAGED) {
  const ok0 = keysOf(OT, l), nk = keysOf(NT, l);
  if (!ok0.length) { verdict[l] = { ok: nk.length > 0, why: nk.length ? '' : '새 자료 없음(옛 기록도 없음)', first: true }; continue; }
  if (nk.length < 0.9 * ok0.length) { verdict[l] = { ok: false, why: '역 수 ' + ok0.length + '→' + nk.length + '(90% 미만)' }; continue; }
  let big = 0, cmp = 0;
  for (const k of ok0) if (dTot(OT[k]) >= 20) { cmp++; if (!NT[k] || dTot(NT[k]) < 0.5 * dTot(OT[k])) big++; }
  if (cmp && big > 0.3 * cmp) { verdict[l] = { ok: false, why: '평일 편수가 절반 미만으로 줄어든 역 ' + big + '/' + cmp }; continue; }
  verdict[l] = { ok: true, why: '' };
}

// 4) 병합(역 단위) → 임시 최종본
const fin = JSON.parse(JSON.stringify(old));
const R = fin.data._REAL_TT; fin.data._TT_ORIENT = fin.data._TT_ORIENT || {};
const diffs = {};   // 노선 -> { changed:[], added:[], kept:[] }
function apply(l) {
  const dd = diffs[l] = { changed: [], added: [], kept: [] };
  for (const k of keysOf(NT, l)) { if (!OT[k]) { dd.added.push(k.split('|')[1]); R[k] = NT[k]; } else if (!same(OT[k], NT[k])) { dd.changed.push(k.split('|')[1]); R[k] = NT[k]; } }
  for (const k of keysOf(OT, l)) if (!NT[k]) dd.kept.push(k.split('|')[1]);       // 새 자료에 없는 역은 옛 기록 유지
  if (built.data._TT_ORIENT[l]) fin.data._TT_ORIENT[l] = built.data._TT_ORIENT[l];
}
for (const l of MANAGED) if (verdict[l].ok) apply(l);

// 5) 노선 단위 안전장치 ③ — 방향 검증이 옛것보다 나빠졌는지(변경이 있는 노선만)
const { validate } = require('./validate_tt.js');
const changedLines = MANAGED.filter(l => diffs[l] && (diffs[l].changed.length || diffs[l].added.length));
if (changedLines.length) {
  const before = {}, after = {};
  validate(old, order, changedLines).forEach(r => before[r.line] = r);
  validate(fin, order, changedLines).forEach(r => after[r.line] = r);
  for (const l of changedLines) {
    const b = before[l], a = after[l]; if (!b || !a) continue;
    const worse = a.res.반대아님 > b.res.반대아님 || a.res.방향없음 > b.res.방향없음 || a.incons > b.incons + 1 || a.nodata.length > b.nodata.length + 2;
    if (worse) {
      verdict[l] = { ok: false, why: '방향 검증이 나빠짐(반대아님 ' + b.res.반대아님 + '→' + a.res.반대아님 + ', 방향없음 ' + b.res.방향없음 + '→' + a.res.방향없음 + ', 일관성깨짐 ' + b.incons + '→' + a.incons + ', 편성없음 ' + b.nodata.length + '→' + a.nodata.length + ')' };
      for (const k of keysOf(R, l)) delete R[k]; for (const k of keysOf(OT, l)) R[k] = OT[k];     // 이 노선만 옛 기록으로 되돌린다
      if (old.data._TT_ORIENT[l]) fin.data._TT_ORIENT[l] = old.data._TT_ORIENT[l]; else delete fin.data._TT_ORIENT[l];
      delete diffs[l];
    }
  }
}

// 6) 결과 기록
const touched = MANAGED.filter(l => diffs[l] && (diffs[l].changed.length || diffs[l].added.length));
const changed = touched.length > 0;
if (changed) {
  fin.version = built.version;
  // 같은 날 두 번 바뀌어도 버전이 달라지고 사전순으로 커지도록 뒤에 .2, .3 … 을 붙인다(엔진은 '내장본보다 사전순으로 작은 KV 번들'을 무시한다)
  if (fin.version <= old.version) { const m = old.version.match(/^(.*?)(?:\.(\d+))?$/); fin.version = m[1] + '.' + ((+m[2] || 1) + 1); if (fin.version <= old.version) fin.version = old.version + '.2'; }
} else fin.version = old.version;
fs.writeFileSync(opt.out, JSON.stringify(fin));
fs.writeFileSync(opt.out.replace(/\.json$/, '') + '.order.json', JSON.stringify(order));
fs.writeFileSync(path.join(dir, 'changed.txt'), changed ? 'yes' : 'no');
const rejected = MANAGED.filter(l => !verdict[l].ok);
fs.writeFileSync(path.join(dir, 'rejected.txt'), rejected.map(l => l + ': ' + verdict[l].why).join('\n'));
const md = ['# 시각표 분기 갱신 보고', '', '- 버전: `' + old.version + '` → `' + fin.version + '`', '- 변경된 노선: ' + (touched.length ? touched.length + '개' : '없음'), ''];
for (const l of touched) { const d = diffs[l]; md.push('- **' + l + '** — 바뀐 역 ' + d.changed.length + ', 새로 생긴 역 ' + d.added.length + (d.kept.length ? ', 새 자료에 없어 옛 기록 유지 ' + d.kept.length : '') + (d.changed.length ? ' (예: ' + d.changed.slice(0, 5).join(', ') + ')' : '')); }
if (rejected.length) { md.push('', '## 확인 필요(자동 반영하지 않고 옛 기록 유지)'); for (const l of rejected) md.push('- **' + l + '** — ' + verdict[l].why); }
fs.writeFileSync(opt.report || path.join(dir, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
