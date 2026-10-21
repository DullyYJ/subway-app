// 길동무 — 미리보기 라벨(홈 카드 위 작은 주황 알약) 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-20 (s81)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   기준 시각을 미래로 바꿨거나(예상) 노선도에서 경로를 정했을 때(노선도) 경로 · 혼잡도 · AI 승무원 카드 맨 위에 붙는 라벨의 글 · 색 · 크기를 엔진이 정한다.
//   앱(웹)은 사실만 보낸다: kind('route'|'cong'|'ai') · mode('custom'|'metro') · lbl(웹이 보여 주던 기준 시각 글, 예 '오후 2:30').
// 입력  pvlScreen({ cap }, f)   cap 17 이상
// 출력  { ok, v:1, screen:'pvl', cover:'tab', bg:'card', head:[pill], body:[spacer 0], info:{ kind, mode }, rev }
var PVL_CAP = 17;
var PVL_WORD = { route: '예상 경로', cong: '예상 혼잡도', ai: '예상 브리핑' };
var PVL_EMOJI = /[☀-➿⬀-⯿️‍]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;

function pvlStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function pvlHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }

function pvlScreen(inp, f) {
  inp = inp || {};
  if (!(Number(inp.cap) >= PVL_CAP)) return { ok: false, error: 'cap' };
  f = (f && typeof f === 'object') ? f : {};
  var kind = pvlStr(f.kind, 8), mode = pvlStr(f.mode, 8);
  if (!PVL_WORD[kind]) return { ok: false, error: 'kind' };
  if (mode !== 'custom' && mode !== 'metro') return { ok: false, error: 'mode' };
  var s;
  if (mode === 'custom') {
    var lbl = pvlStr(f.lbl, 60).replace(PVL_EMOJI, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, 40);
    s = PVL_WORD[kind] + (lbl ? ' · ' + lbl : '');
  } else s = '노선도에서 설정한 경로';
  var pill = { t: 'pill', pad: [0, 0, 0, 10], s: s, size: 11, bold: true, tc: '#ff9500', fill: 'rgba(255,149,0,0.14)', ph: 11, pv: 4, r: 9 };
  return { ok: true, v: 1, screen: 'pvl', cover: 'tab', bg: 'card', head: [pill], body: [{ t: 'spacer', h: 0 }], info: { kind: kind, mode: mode }, rev: 'v1:' + pvlHash(JSON.stringify(pill)) };
}

// 기준시각 글('오늘 오후 2:30' · '내일 오전 9:00' · '10/25(일) 오후 1:05') — 홈 기준시각 줄(homeBaseLabel)과 같은 모양. now = 기기 시계 ms, tz = 동쪽 분.
function pvlBaseLabel(ms, now, tz) {
  ms = Number(ms); now = Number(now); tz = Number(tz);
  if (!isFinite(ms) || !isFinite(tz)) return '';
  var d = new Date(ms + tz * 60000), t = new Date((isFinite(now) ? now : ms) + tz * 60000);
  var diff = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / 86400000), h = d.getUTCHours();
  var day = diff === 0 ? '오늘' : diff === 1 ? '내일' : (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + '일월화수목금토'.charAt(d.getUTCDay()) + ')';
  return day + ' ' + (h < 12 ? '오전' : '오후') + ' ' + ((h % 12) || 12) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
}
// 카드 맨 위에 붙는 작은 주황 알약 노드(기준시각을 미래로 바꿨거나 노선도에서 경로를 정했을 때). 둘 다 아니면 null. bt = 기준시각 ms|null.
function pvlPillNode(kind, bt, metro, now, tz) {
  var mode = bt != null ? 'custom' : metro === true ? 'metro' : '';
  if (!mode || !PVL_WORD[kind]) return null;
  var o = pvlScreen({ cap: PVL_CAP }, { kind: kind, mode: mode, lbl: mode === 'custom' ? pvlBaseLabel(bt, now, tz) : '' });
  return o && o.ok ? o.head[0] : null;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { pvlScreen: pvlScreen, PVL_CAP: PVL_CAP, pvlBaseLabel: pvlBaseLabel, pvlPillNode: pvlPillNode };
