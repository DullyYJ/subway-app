// 길동무 — 홈 '경로 결과 카드' 윗부분 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-20 s71 — 결과 카드 윗부분)
//   예전엔 www/index.html 의 _renderTransitResultCard / _renderSplitRow / _renderXferRow / _doorTipLines / _xferLine 이
//   머리줄('24분 부평 → 두정')·'전체 N분 · 승차 · 대기 · 도보' 줄·왜 이 경로인지·호차/문 안내·환승 안내 문장을 웹에서 지었다.
//   이제 앱은 '기기 사실'(총 소요 분 · 출발/도착 이름 · 나눈 분 · 엔진이 준 이유 · 호차/문 원자료 · 환승 원자료 · 눌린 탭)만 보내고,
//   엔진이 글·순서·단추를 정해 화면 JSON 으로 내려 준다. 앱(네이티브 ScreenCore/ScreenView)은 그리기만 하고
//   누르면 {a:'call', v:'rh.fav'|'rh.close'|'rh.tab.<종류>'} 만 알린다(즐겨찾기 열기·카드 닫기·탭 고르기는 예전 웹 함수가 그대로 한다).
//   웹 카드는 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//
// 입력  rheadScreen({ cap, part }, facts)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(10 이상이어야 만든다 — 머리줄 노드 rhd 가 10)
//        part  = 'h'(머리줄 + 요약 줄 + 환승 안내) | 't'(경로 옵션 탭 줄) | 'n'(공식 공지 · 지연 제보 줄)
//        facts = { m: 총 소요 분, a: 출발 이름, b: 도착 이름, fav: 즐겨찾기 단추를 보일지(0|1),
//                  sp: {ride,wait,walk}(분) | null, why: 엔진이 준 이유 글,
//                  dx: [{s,dc,dd,bc,bd,to,secs}](환승 호차·문 원자료), ex: {s, l:[{fac,door}]} | null(하차 빠른 문),
//                  xs: [{kind,at,walkMin,boardAt,toType,toLine,fromType,fromLine,service}](환승 원자료),
//                  tab: 지금 고른 탭('fast'|'less'|'sub'|'bus'|'longdist'), ld: 장거리 탭을 보일지(0|1),
//                  u: 이동 중이라 숫자가 '남은 시간'인지(0|1), nr: 경로가 없는 탭 이름('sub'|'bus'|…; 비면 정상),
//                  ln: 내 경로의 지하철 노선 이름들, off: { 노선: {text,title,ts,estimated,suspect} }(서버가 준 공지 원자료), al: { 노선: {reporters, stations} }, now: 지금 시각(ms) }
// 출력  { ok, v:1, screen:'rhead', cover:'tab', bg:'card', head:[], body:[노드…], info:{part} }
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var RHEAD_SCREEN_V = 1;
var RHEAD_TABS = [['fast', '최단시간'], ['less', '최소환승'], ['sub', '지하철'], ['bus', '버스'], ['longdist', '장거리']];
// 새 네이티브 글에는 이모지를 쓰지 않는다
var RHEAD_EMOJI = /[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;      // 그림 이모지·기호만(화살표 → 는 문장에 쓰이니 남긴다)

function rheadHash(s) {                               // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function rheadStr(v, max) {
  if (v == null) return '';
  var s = String(v).replace(RHEAD_EMOJI, '');
  return s.length > max ? s.slice(0, max) : s;
}
function rheadInt(v, lo, hi) {
  var n = Math.round(Number(v));
  if (!isFinite(n)) n = 0;
  return n < lo ? lo : (n > hi ? hi : n);
}
// '은/는' 같은 받침 조사(예전 웹 _arrJosa 와 같다) — 한글이 아니면 받침 있는 쪽
function rheadJosa(word, withBatchim, withoutBatchim) {
  var ch = String(word == null ? '' : word).trim().slice(-1);
  var code = ch.charCodeAt(0);
  if (!(code >= 0xAC00 && code <= 0xD7A3)) return withBatchim;
  return ((code - 0xAC00) % 28) ? withBatchim : withoutBatchim;
}
function rheadDoor(d) {                               // '7-2' → '7호차 2번 문'
  var m = String(d == null ? '' : d).match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? (m[1] + '호차 ' + m[2] + '번 문') : '';
}
function rheadList(v, max) { return Array.isArray(v) ? v.slice(0, max) : []; }

// 환승 한 줄 문장(예전 웹 _xferLine 과 같은 문구)
function rheadXferLine(t) {
  var f = function (type, name) {
    name = String(name == null ? '' : name).trim();
    if (!name) return type === 2 ? '버스' : '열차';
    return (type === 2 && /^[0-9-]+$/.test(name)) ? name + '번' : name;
  };
  var at = String(t.at == null ? '' : t.at).trim(), wm = Math.round(Number(t.walkMin) || 0);
  var walkTxt = (t.kind === 'train') ? '' : (wm > 0 ? ' · 도보 ' + wm + '분' : '');
  if (t.kind === 'train') {
    return at + '에서 ' + (t.service === 'express' ? '급행' : '일반') + ' 열차로 갈아타요 (' + f(1, t.fromLine) + ' 안에서 열차가 바뀌어요)';
  }
  if (t.kind === 'walk') {
    var to = String(t.boardAt == null ? '' : t.boardAt).trim();
    return at + ' 하차' + (wm > 0 ? ' → 도보 ' + wm + '분' : '') + ' → ' + (to && to !== at ? to + '에서 ' : '') + f(Number(t.toType), t.toLine) + ' 승차';
  }
  return at + '에서 ' + f(Number(t.fromType), t.fromLine) + ' → ' + f(Number(t.toType), t.toLine) + ' 환승' + walkTxt;
}

// 환승 호차-문 · 도착역 빠른 하차 줄(예전 웹 _doorTipLines 와 같은 문구)
function rheadDoorLines(dx, ex) {
  var out = [];
  rheadList(dx, 8).forEach(function (x) {
    if (!x || typeof x !== 'object') return;
    var dc = rheadStr(x.dc, 6), dd = rheadStr(x.dd, 6), bc = rheadStr(x.bc, 6), bd = rheadStr(x.bd, 6);
    if (!(dc && dd && bc && bd)) return;
    var to = rheadStr(x.to, 8), s = rheadStr(x.s, 30);
    var tl = /^\d+$/.test(to) ? (to + '호선 ') : '';
    var t = (s ? s + ' 환승: ' : '환승: ') + dc + '호차 ' + dd + '번 문에서 내리면 ' + tl + bc + '호차 ' + bd + '번 문이 가까워요';
    var secs = Number(x.secs);
    if (secs > 0) t += ' (환승 약 ' + Math.max(1, Math.round(secs / 60)) + '분)';
    out.push(t);
  });
  if (ex && typeof ex === 'object') {
    var parts = rheadList(ex.l, 6).map(function (f) {
      if (!f) return '';
      var l = rheadDoor(f.door); if (!l) return '';
      var fc = rheadStr(f.fac, 20) || '출구';
      return fc + rheadJosa(fc, '은', '는') + ' ' + l;
    }).filter(Boolean);
    if (parts.length) { var es = rheadStr(ex.s, 30); out.push((es ? es + ' 하차: ' : '하차: ') + parts.join(', ') + '이 가까워요'); }
  }
  return out;
}

function rheadFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var sp = null;
  if (f.sp && typeof f.sp === 'object') {
    sp = { ride: rheadInt(f.sp.ride, 0, 9999), wait: rheadInt(f.sp.wait, 0, 9999), walk: rheadInt(f.sp.walk, 0, 9999) };
  }
  var tab = String(f.tab == null ? 'fast' : f.tab);
  if (!RHEAD_TABS.some(function (t) { return t[0] === tab; })) tab = 'fast';
  return {
    m: rheadInt(f.m, 0, 9999), a: rheadStr(f.a, 40), b: rheadStr(f.b, 40),
    fav: (f.fav === 1 || f.fav === true) ? 1 : 0,
    sp: sp, why: rheadStr(f.why, 400).replace(/\s+/g, ' ').trim(),
    dx: rheadList(f.dx, 8), ex: (f.ex && typeof f.ex === 'object') ? f.ex : null,
    xs: rheadList(f.xs, 8).filter(function (t) { return t && typeof t === 'object'; }),
    tab: tab, ld: (f.ld === 1 || f.ld === true) ? 1 : 0,
    u: (f.u === 1 || f.u === true) ? 1 : 0, nr: rheadStr(f.nr, 12).replace(/[^a-z]/g, ''),
    ln: rheadList(f.ln, 6).map(function (l) { return rheadStr(l, 24).trim(); }).filter(Boolean),
    off: (f.off && typeof f.off === 'object') ? f.off : {}, offAt: Number(f.offAt) > 0 ? Number(f.offAt) : 0,
    al: (f.al && typeof f.al === 'object') ? f.al : {}, now: Number(f.now) > 0 ? Number(f.now) : 0
  };
}

// ── 공식 공지 · 지연 제보 줄(예전 웹 _routeOfficialRow · _lrRouteAlertStart 와 같은 문구, 그림말 제외) ──
function rheadAgo(ts, now) {                          // '방금' · 'N분 전' · 'N시간 전'
  var m = Math.max(0, Math.round((now - Number(ts || 0)) / 60000));
  return m < 1 ? '방금' : (m < 60 ? m + '분 전' : Math.round(m / 60) + '시간 전');
}
function rheadJoin(parts) {                           // [[글, 굵게(0|1)], …] → { s, hl }
  var s = '', hl = [];
  parts.forEach(function (p) { if (p[1] && p[0].length) hl.push([s.length, s.length + p[0].length]); s += p[0]; });
  return { s: s, hl: hl };
}
function rheadOffParts(l, n, now) {
  var txt = rheadStr(n.text || n.title || '', 400).replace(/\s+/g, ' ').trim();
  if (n.estimated) {                                  // 도착 간격으로 짐작한 것(공식 공지 아님) — 지연 의심만 보인다
    return [[l + ' 지연 의심 (도착 간격 기준 추정)', 1], [' · ' + txt + ' (' + rheadAgo(n.ts, now) + ' · 공식 공지 아님)', 0]];
  }
  if (txt.length > 110) txt = txt.slice(0, 108).replace(/\s+\S*$/, '') + '…';
  var pre = (txt.indexOf(l) === 0) ? '' : l + ' — ';
  return [['서울교통공사 공지', 1], [' · ' + pre + txt + ' (' + rheadAgo(n.ts, now) + ')', 0]];
}
function rheadNoteNodes(f) {
  var now = f.now || 0, out = [], i;
  var offLines = [];
  f.ln.forEach(function (l) {
    var n = f.off[l];
    if (!n || typeof n !== 'object') return;
    if (n.estimated && !n.suspect) return;            // 짐작한 '정상' 은 경로 카드에 올리지 않는다
    offLines.push(rheadOffParts(l, n, now));
  });
  if (offLines.length) {
    var parts = [];
    offLines.forEach(function (p, k) { if (k) parts.push(['\n', 0]); p.forEach(function (x) { parts.push(x); }); });
    var j = rheadJoin(parts), b = { t: 'box', s: j.s, size: 12, lh: 1.5, color: 'text', fill: 'rgba(10,132,255,0.12)', line: 'rgba(10,132,255,0.35)', r: 10, ip: [10, 7, 10, 7], pad: [0, 0, 0, 8] };
    if (j.hl.length) b.hl = j.hl;
    out.push(b);
  }
  var al = [], first = -1;
  f.ln.forEach(function (l, k) {
    var a = f.al[l];
    if (!a || typeof a !== 'object' || !(Number(a.reporters) >= 3)) return;
    var st = rheadList(a.stations, 1)[0], t = l + ' 최근 30분 지연 제보 ' + rheadInt(a.reporters, 0, 9999) + '명' + (st && st.stn ? ' (' + rheadStr(st.stn, 20) + ' 부근)' : '');
    if (first < 0) first = k;
    al.push([t, 1]);
  });
  if (al.length) {
    var ap = [];
    al.forEach(function (p, k) { if (k) ap.push([' · ', 0]); ap.push(p); });
    ap.push([' — 시간 여유를 두고 이동하세요.', 0]);
    var aj = rheadJoin(ap), ab = { t: 'box', s: aj.s, size: 12, lh: 1.5, color: 'text', fill: 'rgba(255,69,58,0.12)', line: 'rgba(255,69,58,0.35)', r: 10, ip: [10, 7, 10, 7], pad: [0, 0, 0, 4] };
    if (aj.hl.length) ab.hl = aj.hl;
    out.push(ab);
    out.push({ t: 'row', gap: 6, pad: [0, 0, 0, 8], kids: [{ t: 'button', s: '노선 방 보기', size: 11, h: 28, r: 10, bold: true, fill: 'card2', line: 'border', tc: 'gold', act: { a: 'call', v: 'rh.room.' + first } }] });
  }
  if (!out.length) out.push({ t: 'spacer', h: 0 });     // 보일 것이 없다 — 높이 0
  return out;
}

function rheadHeadNodes(f) {
  var nm = function (s) { return String(s || '').replace(/역$/, ''); };
  if (f.nr) {                                           // 고른 탭만으로는 갈 수 있는 경로가 없다 — 머리줄에 안내 한 줄만(예전 웹 _showTabNoRoute 와 같은 문구)
    var lb = f.nr === 'sub' ? '지하철' : (f.nr === 'bus' ? '버스' : '이 수단');
    return [{ t: 'rhd', pad: [0, 0, 0, 8], msg: lb + '만으로 갈 수 있는 경로가 없어요', xact: { a: 'call', v: 'rh.close' }, btn: '즐겨찾기', act: { a: 'call', v: 'rh.fav' } }];
  }
  var route = (nm(f.a) || nm(f.b)) ? (nm(f.a) + ' → ' + nm(f.b)) : '';
  var head = { t: 'rhd', pad: [0, 0, 0, 8], num: String(f.m), unit: f.u ? '분 남음' : '분', s: route, xact: { a: 'call', v: 'rh.close' } };
  if (f.fav) { head.btn = '즐겨찾기'; head.act = { a: 'call', v: 'rh.fav' }; }
  var nodes = [head];
  var lines = [];
  if (f.sp) {
    var sp = f.sp, t = '승차 ' + sp.ride + '분';
    if (sp.wait > 0) t += ' · 대기 ' + sp.wait + '분';
    if (sp.walk > 0) t += ' · 도보·환승 ' + sp.walk + '분';
    nodes.push({ t: 'text', s: '전체 ' + (sp.ride + sp.wait + sp.walk) + '분 · ' + t, size: 12, bold: true, color: 'text', lh: 1.5, pad: [0, 0, 0, 0] });
  }
  if (f.why) nodes.push({ t: 'text', s: f.why, size: 12, color: 'sub', lh: 1.5, pad: [0, 0, 0, 0] });
  rheadDoorLines(f.dx, f.ex).forEach(function (s) { nodes.push({ t: 'text', s: s, size: 12, color: 'sub', lh: 1.5, pad: [0, 0, 0, 0] }); });
  if (nodes.length > 1) nodes[nodes.length - 1].pad = [0, 0, 0, 8];
  if (f.xs.length) {
    var h1 = '환승 ' + f.xs.length + '번', parts = [h1];
    f.xs.forEach(function (t, i) { parts.push((i + 1) + '. ' + rheadXferLine(t).replace(RHEAD_EMOJI, '').slice(0, 160)); });
    nodes.push({ t: 'box', s: parts.join('\n'), hl: [[0, h1.length]], size: 12, lh: 1.55, color: 'text', fill: 'rgba(255,159,10,0.12)', line: 'rgba(255,159,10,0.4)', r: 10, ip: [10, 7, 10, 7], pad: [0, 0, 0, 8] });
  }
  return nodes;
}

function rheadTabNodes(f) {
  var kids = [];
  RHEAD_TABS.forEach(function (tb) {
    if (tb[0] === 'longdist' && !f.ld) return;
    var on = tb[0] === f.tab;
    var n = { t: 'button', s: tb[1], size: 11, h: 32, r: 10, bold: true, act: { a: 'call', v: 'rh.tab.' + tb[0] } };
    if (on) { n.fill = 'gold'; n.line = 'gold'; n.tc = '#ffffff'; }
    else { n.fill = 'card2'; n.line = 'border'; n.tc = 'sub'; }
    kids.push(n);
  });
  return [{ t: 'row', gap: 6, pad: [0, 0, 0, 0], kids: kids }];
}

function rheadScreen(inp, factsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 10)) return { ok: false, error: 'cap' };
  var part = inp.part === 't' ? 't' : (inp.part === 'n' ? 'n' : 'h');
  var f = rheadFacts(factsIn);
  var body = part === 't' ? rheadTabNodes(f) : (part === 'n' ? rheadNoteNodes(f) : rheadHeadNodes(f));
  var out = { ok: true, v: 1, screen: 'rhead', cover: 'tab', bg: 'card', head: [], body: body, info: { part: part } };      // 카드 안에 놓이는 화면 — 바탕은 카드색
  out.rev = 'r' + RHEAD_SCREEN_V + part + ':' + rheadHash(JSON.stringify(body));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { rheadScreen: rheadScreen, rheadFacts: rheadFacts, rheadXferLine: rheadXferLine, rheadDoorLines: rheadDoorLines };
