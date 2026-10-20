// 길동무 — 홈 '혼잡도 카드' 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-20 s76 — 혼잡도 카드)
//   예전엔 www/index.html 의 getCongPct / getCong24 / renderChart24 / renderCarGrid / updateCong / _fetchBusCongestion·updateBusCong 가
//   혼잡 %·단계 글·색·24시간 막대(높이·색·피크)·칸별 혼잡·버스 평균/최대 승객 수를 웹에서 계산해 DOM 에 썼다.
//   이제 앱은 '기기 사실'(지하철이면 역 이름·호선·실시간 자료 칸, 버스면 노선 번호·정류장·API 원자료 [시간대, 승객 수] 쌍, 기준 시각)만 보내고,
//   엔진이 글·색·막대·칸을 정해 화면 JSON 으로 내려 준다. 앱(네이티브 ScreenCore/ScreenView)은 그리기만 한다(눌러서 하는 동작은 없다).
//   웹 카드는 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//
// 입력  congScreen({ cap }, facts)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(13 이상이어야 만든다 — 혼잡도 카드 노드 cgh · gauge · chart · cars 와 box 의 hc 가 13)
//        facts = { mode:'sub'|'bus'|'none', now: 기준 시각 ms, tz: 기기 시간대(동쪽 분), th:'dark'|'pastel',
//                  stn, line, ld: 실시간 자료(_CONG)가 로드됐나(0|1), live: [시간대별 값…]|null(그 역의 실시간 자료 칸),
//                  bus: { no: 노선 번호, stop: 정류장 이름, ld: 불러오는 중(0|1), none: 자료 없음(0|1), pr: [[tzon, cgst]…] (국토부 원자료) } }
// 출력  { ok, v:1, screen:'cong', cover:'tab', bg:'card', head:[노드…], body:[], info:{ mode, bc, badge, bbg } }
//        info.bc = 카드 왼쪽 띠 색 · info.badge/bbg = 섹션 제목 옆 배지 글/색 (CSS 색 또는 'arex' 같은 앱 색 이름)
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var CONG_SCREEN_V = 1;
var CONG_EMOJI = /[☀-➿⬀-⯿️‍]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;      // 새 네이티브 글에는 이모지를 쓰지 않는다

// 시간대별 기본 혼잡도 프로파일 (0~23시, 0~100)
var CONG_PROFILE = [10, 8, 7, 7, 8, 20, 55, 85, 95, 70, 55, 50, 60, 55, 50, 55, 65, 85, 95, 80, 65, 45, 30, 18];
// 노선별 첫차/막차 시각 (시 단위) — first: 첫차 시, last: 막차 종료 시(exclusive)
var CONG_SVC = {
  '1호선': [5, 24], '2호선': [5, 24], '3호선': [5, 24], '4호선': [5, 24], '5호선': [5, 24], '6호선': [5, 24], '7호선': [5, 24], '8호선': [5, 24], '9호선': [5, 24],
  '수인분당선': [5, 24], '신분당선': [5, 24], '경의중앙선': [5, 24], '경춘선': [5, 24], '경강선': [6, 23], '공항철도': [5, 24], 'GTX-A': [5, 23], '서해선': [5, 24],
  '신림선': [5, 24], '우이신설선': [5, 24], '인천1호선': [5, 24], '인천2호선': [5, 24], '김포골드라인': [6, 23], '에버라인선': [6, 23], '의정부선': [5, 24]
};
// 노선별 혼잡 가중치 (평균보다 혼잡한 노선은 1.0 이상)
var CONG_LW = {
  '2호선': 0.95, '9호선': 1.15, '4호선': 0.90, '1호선': 0.85, '3호선': 0.88, '5호선': 0.80, '6호선': 0.82, '7호선': 0.92, '8호선': 0.75, '수인분당선': 0.85, '신분당선': 0.75,
  '경의중앙선': 0.78, '공항철도': 0.90, '경춘선': 0.72, 'GTX-A': 0.80, '서해선': 0.70, '신림선': 0.70, '우이신설선': 0.65, '인천1호선': 0.72, '인천2호선': 0.68, '김포골드라인': 0.85
};
var CONG_CARS = [0.7, 0.9, 1.1, 1.2, 1.1, 1.0, 0.9, 0.7];      // 칸별 상대 적재율 — 앞/뒤 칸이 보통 덜 혼잡
var CONG_BUS_CAP = 40;                                          // 시내버스 좌석+입석 정원(만석 = 100%)
var CONG_BAR_K = { sub: 0.9, bus: 1.38 };                      // 막대 높이 배율(% → dp): 지하철은 아래 칸별 혼잡이 있어 낮게, 버스는 칸별이 없어 키운다
var CONG_BAR_H = { sub: 112, bus: 160 };                       // 막대 영역 높이(dp)

// 역별 시간대 혼잡 표(서울교통공사 20260331) — Worker 에서는 앞에 붙은 engine/cong-data.js 가 채운다. Node(시험)에서는 아래에서 불러온다.
var CONG_REAL;
if (typeof CONG_REAL === 'undefined' || !CONG_REAL) { try { if (typeof require === 'function') CONG_REAL = require('./cong-data').CONG_REAL; } catch (eCr) {} }
// 공휴일은 engine/holidays.js(holDowKST) 가 단일 출처다 — Worker 에서는 같은 범위에 붙어 있고, Node(시험)에서는 아래에서 불러온다.
var CONG_HOLFN = (typeof holDowKST === 'function') ? holDowKST : null;
if (!CONG_HOLFN) { try { if (typeof require === 'function') CONG_HOLFN = require('./holidays').holDowKST; } catch (eCh) {} }

function congHash(s) {                                // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function congStr(v, max) {
  if (v == null) return '';
  var s = String(v).replace(CONG_EMOJI, '');
  return s.length > max ? s.slice(0, max) : s;
}
function congInt(v, lo, hi) {
  var n = Math.round(Number(v));
  if (!isFinite(n)) n = 0;
  return n < lo ? lo : (n > hi ? hi : n);
}
function congHourOf(nowMs, tz) {                      // 기기 시간대의 '시'(예전 웹 new Date(ms).getHours() 와 같다)
  var m = Math.floor(nowMs / 60000) + tz;
  return Math.floor((((m % 1440) + 1440) % 1440) / 60);
}
function congIsWeekend(nowMs) {                       // 예전 웹 _isHolidayOrWeekend: KST 토·일 또는 공휴일
  var dow;
  if (CONG_HOLFN) dow = CONG_HOLFN(nowMs);
  else dow = new Date(nowMs + 324e5).getUTCDay();
  return dow === 0 || dow === 6;
}
function congCol(p) { return p < 30 ? '#34c759' : p < 60 ? '#ff9f0a' : p < 80 ? '#ff6b35' : '#ff3b30'; }
function congLvl(p) {
  return { col: congCol(p), lvl: p < 30 ? '원활' : p < 60 ? '보통' : p < 80 ? '혼잡' : '매우혼잡', lvlS: p < 30 ? '쾌적해요' : p < 60 ? '적당해요' : p < 80 ? '혼잡해요' : '지옥이에요' };
}
function congStnKey(name) { name = String(name || ''); return (name.length > 1 && name.charAt(name.length - 1) === '역') ? name.slice(0, -1) : name; }

// 지하철 현재 혼잡 %(예전 웹 getCongPct): 실시간 자료 → 서울교통공사 표 → 통계 프로파일(주말·공휴일 완화)
function congPctSub(F, h) {
  if (F.ld && F.live) { var v = F.live[h]; if (v !== undefined && v !== null) return Math.round(v); }
  var re = CONG_REAL && CONG_REAL[congStnKey(F.stn)];
  if (re && re[h] !== undefined && re[h] > 0) return Math.round(re[h]);
  var base = CONG_PROFILE[h] || 50;
  if (F.wk) base = base * (h >= 10 && h <= 20 ? 0.7 : 0.55);
  var w = CONG_LW[F.line] || 0.80, isPeak = (h >= 7 && h <= 9) || (h >= 18 && h <= 20);
  var pct = Math.round(base * w * (isPeak ? 1.0 : 0.95));
  return Math.max(5, Math.min(100, pct));
}
// 지하철 24시간 값(예전 웹 getCong24)
function congDataSub(F) {
  var i, a = [];
  if (F.ld && F.live) { for (i = 0; i < 24; i++) a.push(F.live[i] == null ? 0 : Number(F.live[i]) || 0); return a; }
  var re = CONG_REAL && CONG_REAL[congStnKey(F.stn)];
  if (re && Array.isArray(re)) return re.slice(0, 24);
  var w = CONG_LW[F.line] || 0.80;
  for (i = 0; i < 24; i++) a.push(Math.max(5, Math.min(100, Math.round(CONG_PROFILE[i] * w))));
  return a;
}
// 버스: 국토부 원자료 [tzon, cgst] 쌍 → 지금 시간대 평균/최대 승객 수·혼잡 %·24시간 값(예전 웹 _fetchBusCongestion 의 계산)
function congBusStat(pr, h, wk) {
  var items = [], i, t, c;
  for (i = 0; i < pr.length; i++) { t = parseInt(pr[i][0], 10); c = parseFloat(pr[i][1]); items.push({ t: t, c: c }); }
  var pool = items.filter(function (it) { return it.t === h; });
  if (!pool.length) pool = items.filter(function (it) { return Math.abs(it.t - h) <= 1; });
  if (!pool.length) pool = items;
  var sum = 0, cnt = 0, maxC = 0;
  pool.forEach(function (it) { if (!isNaN(it.c)) { sum += it.c; cnt++; if (it.c > maxC) maxC = it.c; } });
  if (!cnt) return null;
  var avg = sum / cnt, pct = Math.min(100, Math.round(avg / CONG_BUS_CAP * 100));
  var hs = {}, hn = {};
  items.forEach(function (it) { if (isNaN(it.t) || isNaN(it.c)) return; hs[it.t] = (hs[it.t] || 0) + it.c; hn[it.t] = (hn[it.t] || 0) + 1; });
  var hourly = [];
  for (i = 0; i < 24; i++) hourly[i] = hn[i] ? Math.min(100, Math.round((hs[i] / hn[i]) / CONG_BUS_CAP * 100)) : 0;
  if (wk) pct = Math.round(pct * (h >= 10 && h <= 20 ? 0.7 : 0.55));      // 주말·공휴일 완화(웹 updateBusCong)
  return { pct: pct, avg: Math.round(avg), max: maxC, hourly: hourly };
}
function congBusLabel(nm) {                           // 예전 웹 _busCongLabel: 숫자만이면 '번' 을 붙인다
  nm = String(nm == null ? '' : nm).replace(/번$/, '').trim();
  if (!nm) return '-';
  return /^[0-9-]+$/.test(nm) ? nm + '번' : nm;
}

function congFacts(inp) {
  var f = (inp && typeof inp === 'object') ? inp : {};
  var F = { mode: (f.mode === 'sub' || f.mode === 'bus') ? f.mode : 'none', now: Number(f.now), tz: congInt(f.tz, -840, 840), th: f.th === 'pastel' ? 'pastel' : 'dark' };
  if (!isFinite(F.now) || F.now <= 0) F.now = 0;
  F.stn = congStr(f.stn, 40); F.line = congStr(f.line, 20); F.ld = f.ld ? 1 : 0;
  F.live = Array.isArray(f.live) ? f.live.slice(0, 24).map(function (v) { return (v == null || !isFinite(Number(v))) ? null : Number(v); }) : null;
  var b = (f.bus && typeof f.bus === 'object') ? f.bus : {};
  F.bus = { no: congStr(b.no, 30), stop: congStr(b.stop, 40), ld: b.ld ? 1 : 0, none: b.none ? 1 : 0,
            pr: Array.isArray(b.pr) ? b.pr.slice(0, 1500).filter(function (p) { return Array.isArray(p) && p.length >= 2; }) : [] };
  F.h = congHourOf(F.now, F.tz); F.wk = F.now ? congIsWeekend(F.now) : false;
  return F;
}

// ── 노드 ──
function congHead(lab, nm, meta, st, sc) { return { t: 'cgh', pad: [0, 0, 0, 0], lab: lab, nm: nm, meta: meta, st: st, sc: sc }; }
function congGauge(pct, c) { return { t: 'gauge', pad: [0, 10, 0, 0], s: '혼잡도', txt: pct + '%', v: Math.max(0, Math.min(100, pct)), c: c }; }
function congChart(bars, ci, src, pk, mode, th) {
  return { t: 'chart', pad: [0, 10, 0, 0], ttl: '24시간 혼잡도', src: src, pk: pk, bh: CONG_BAR_H[mode], ci: ci, co: th === 'pastel' ? '#111111' : '#ffffff', cs: congHash(JSON.stringify(bars) + '|' + ci), bars: bars };
}
function congBar(h, v, curH, active, mode) {
  if (!active) return { h: String(h), o: true };      // 운행 없는 시간은 지금이어도 강조하지 않는다(웹과 같다) — 가운데 맞춤(ci)만 지금 시각을 따른다
  var b = { h: String(h), v: Math.max(4, Math.round(v * CONG_BAR_K[mode])), c: congCol(v), a: h === curH ? 1 : 0.75 };
  if (h === curH) b.u = true;
  return b;
}
function congCarsNode(F, pct) {
  var cells = [];
  for (var i = 0; i < CONG_CARS.length; i++) {
    var cp = Math.min(100, Math.round(pct * (CONG_CARS[i] || 1.0)));
    cells.push({ n: (i + 1) + '칸', l: cp < 30 ? '여유' : cp < 60 ? '보통' : cp < 80 ? '혼잡' : '만원', p: cp + '%', c: congCol(cp) });
  }
  return { t: 'cars', pad: [0, 10, 0, 0], ttl: '칸별 혼잡 예상도', cells: cells };
}

function congSubNodes(F) {
  var h = F.h, pct = congPctSub(F, h), L = congLvl(pct), data = congDataSub(F), svc = CONG_SVC[F.line] || [5, 24];
  var maxV = 0, peakH = svc[0], i;
  for (i = svc[0]; i < svc[1]; i++) if ((data[i] || 0) > maxV) { maxV = data[i] || 0; peakH = i; }
  var bars = [];
  for (i = 0; i < 24; i++) bars.push(congBar(i, data[i] || 0, h, i >= svc[0] && i < svc[1], 'sub'));
  var nodes = [congHead('지하철', F.stn, h + '시 기준', L.lvl, L.col), congGauge(pct, L.col),
               congChart(bars, h, F.ld ? '(실시간 기반)' : '(통계 기반)', peakH + '시 피크', 'sub', F.th), congCarsNode(F, pct)];
  return { nodes: nodes, info: { mode: 'sub', bc: L.col, badge: L.lvlS, bbg: L.col } };
}
function congBusNodes(F) {
  var B = F.bus, lab = congBusLabel(B.no), h = F.h;
  var none = function (meta) { return { nodes: [congHead('버스', lab, meta, '정보 없음', 'sub')], info: { mode: 'bus', bc: 'arex', badge: '-', bbg: 'arex' } }; };
  if (B.ld) return none('혼잡 통계를 불러오는 중이에요');
  var st = B.none ? null : congBusStat(B.pr, h, F.wk);
  if (!st) return none('이 버스의 혼잡 통계를 못 받았어요');
  var L = congLvl(st.pct), maxV = 0, peakH = h, i;
  for (i = 0; i < 24; i++) if ((st.hourly[i] || 0) > maxV) { maxV = st.hourly[i] || 0; peakH = i; }
  var bars = [];
  for (i = 0; i < 24; i++) bars.push(congBar(i, st.hourly[i] || 0, h, st.hourly[i] > 0, 'bus'));
  var l1 = '버스는 차량 1대 기준이에요\n평균 탑승 ', a = st.avg + '명', mid = ' · 최대 ', m = st.max + '명', tail = ' (정원 약 40명 기준)';
  var s = l1 + a + mid + m + tail, a0 = l1.length, m0 = a0 + a.length + mid.length;
  var note = { t: 'box', pad: [0, 4, 0, 0], ip: [12, 10, 12, 10], s: s, hl: [[a0, a0 + a.length], [m0, m0 + m.length]], hc: L.col, size: 12, lh: 1.5, color: 'sub', fill: 'card2', r: 10 };
  var nodes = [congHead('버스', lab, h + '시 기준 · ' + B.stop + ' 정류장', L.lvl, L.col), congGauge(st.pct, L.col),
               congChart(bars, h, '(버스 통계 기반)', peakH + '시 피크', 'bus', F.th), note];
  return { nodes: nodes, info: { mode: 'bus', bc: L.col, badge: L.lvlS, bbg: L.col } };
}
function congNoneNodes(F) {                           // 출발역을 정하기 전 대기 상태
  var nodes = [congHead('지하철', '-', '시간표 기반', '출발역을 설정하세요', 'sub'), congChart([], -1, '(통계 기반)', '-', 'sub', F.th),
               { t: 'cars', pad: [0, 10, 0, 0], ttl: '칸별 혼잡 예상도', cells: [], msg: '출발역 설정 후 표시됩니다' }];
  return { nodes: nodes, info: { mode: 'none', bc: 'arex', badge: '-', bbg: 'arex' } };
}

function congScreen(inp, factsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 13)) return { ok: false, error: 'cap' };
  var F = congFacts(factsIn);
  if (!F.now) return { ok: false, error: 'now' };
  var r;
  if (F.mode === 'sub' && F.stn) r = congSubNodes(F);
  else if (F.mode === 'bus') r = congBusNodes(F);
  else r = congNoneNodes(F);
  var out = { ok: true, v: 1, screen: 'cong', cover: 'tab', bg: 'card', head: r.nodes, body: [{ t: 'spacer', h: 0 }], info: r.info };
  out.rev = 'c' + CONG_SCREEN_V + ':' + congHash(JSON.stringify(r.nodes) + JSON.stringify(r.info));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { congScreen: congScreen, congFacts: congFacts, congPctSub: congPctSub, congDataSub: congDataSub, congBusStat: congBusStat, congBusLabel: congBusLabel, congHourOf: congHourOf, congLvl: congLvl };
