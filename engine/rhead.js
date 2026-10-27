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
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(10 이상이어야 만든다 — 머리줄 노드 rhd 가 10; part 'k' 는 타임라인 노드 trk + 마커 mk 가 있는 12 이상)
//        part  = 'h'(머리줄 + 요약 줄 + 환승 안내) | 't'(경로 옵션 탭 줄) | 'n'(공식 공지 · 지연 제보 줄) | 'l'(장거리 열차·버스 고르기 + 대기 제외 안내) | 'k'(구간 타임라인: 머리 노드 trk — facts 는 아래 별도)
//        part 'g'(s217, 규격 25) = 요약 칩 줄 tags — facts { m: 총 분, n: 환승 횟수, mix: ['KTX','지하철'…], hubs: ['부평','구로'…], } → 타임라인 바로 위. facts.cp=1 이면 part 'h' 가 긴 환승 목록 상자를 빼 준다.
//        part 'k' facts = { secs:[{ty,nm,du,di,ws,ar,ss,es,sts,tw,we,tc:[{at,to}],st:[[이름,위도,경도]…]}], xf:[{k,xi,si}]|null(환승 원자료), bt: 사용자가 정한 예상 시각 ms|null, rb: 이번 탐색이 나간 시각 ms|null,
//                          now: 그릴 때 기기 시계 ms, sw:[막차 뒤 첫차까지 분…], tz: 기기 시간대(동쪽 분), th:'dark'|'pastel' }
//                          lv(2단계, 선택): { p:{f,t,r,sn}|null(웹이 정한 마커 위치: 칸 번호 f → t, 구간 비율 r, sn=점프), w:{d}|null(승차 대기 중이면 승차역까지 거리 m), ea:[HH:MM…](웹이 지금 보여 주는 칸별 시각) } → 마커 mk 와 시각 덮어쓰기  → head:[{t:'trk', cells:[…]}] (칸 = 이름·배지·선·점·시각 한 줄; 시각/색/글 전부 엔진이 정한다)
//        facts = { m: 총 소요 분, a: 출발 이름, b: 도착 이름, fav: 즐겨찾기 단추를 보일지(0|1),
//                  sp: {ride,wait,walk}(분) | null, why: 엔진이 준 이유 글,
//                  dx: [{s,dc,dd,bc,bd,to,secs}](환승 호차·문 원자료), ex: {s, l:[{fac,door}]} | null(하차 빠른 문),
//                  xs: [{kind,at,walkMin,boardAt,toType,toLine,fromType,fromLine,service}](환승 원자료),
//                  tab: 지금 고른 탭('fast'|'less'|'sub'|'bus'|'longdist'), ld: 장거리 탭을 보일지(0|1),
//                  u: 이동 중이라 숫자가 '남은 시간'인지(0|1), nr: 경로가 없는 탭 이름('sub'|'bus'|…; 비면 정상),
//                  ln: 내 경로의 지하철 노선 이름들, off: { 노선: {text,title,ts,estimated,suspect} }(서버가 준 공지 원자료), al: { 노선: {reporters, stations} }, now: 지금 시각(ms),
//                  lg: 장거리 원자료 { mode, grade, depTs, candidates:[{mode,depTs,depLabel,totalMin}], options:[{grade,depTs,depLabel,fare}], noWaitMin, fastRide:{depLabel,rideMin,noWaitMin} } | null }
// 출력  { ok, v:1, screen:'rhead', cover:'tab', bg:'card', head:[], body:[노드…], info:{part} }
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var RHEAD_SCREEN_V = 1;
var RHEAD_TABS = [['fast', '최단시간'], ['less', '최소환승'], ['sub', '지하철'], ['bus', '버스'], ['longdist', '장거리']];
// 새 네이티브 글에는 이모지를 쓰지 않는다
var RHEAD_EMOJI = /[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;      // 그림 이모지·기호만(화살표 → 는 문장에 쓰이니 남긴다)

// 시스템 이름이 '부산_부산' 처럼 같은 말 두 번으로 오면 한 번만(s217). 뒤가 다르면('서울_1호선') 건드리지 않는다.
function rheadNmFix(s) {
  s = String(s == null ? '' : s).trim();
  var i = s.indexOf('_');
  if (i > 0) {
    var a = s.slice(0, i).trim(), b = s.slice(i + 1).trim();
    if (a && a.replace(/역$/, '') === b.replace(/역$/, '')) return a.length >= b.length ? a : b;
  }
  return s;
}

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
  var at = rheadNmFix(t.at), wm = Math.round(Number(t.walkMin) || 0);
  var walkTxt = (t.kind === 'train') ? '' : (wm > 0 ? ' · 도보 ' + wm + '분' : '');
  if (t.kind === 'train') {
    return at + '에서 ' + (t.service === 'express' ? '급행' : '일반') + ' 열차로 갈아타요 (' + f(1, t.fromLine) + ' 안에서 열차가 바뀌어요)';
  }
  if (t.kind === 'walk') {
    var to = rheadNmFix(t.boardAt);
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
    al: (f.al && typeof f.al === 'object') ? f.al : {}, now: Number(f.now) > 0 ? Number(f.now) : 0,
    lg: (f.lg && typeof f.lg === 'object') ? f.lg : null,
    cp: (f.cp === 1 || f.cp === true) ? 1 : 0, n: rheadInt(f.n, 0, 99),
    mix: rheadList(f.mix, 4).map(function (v) { return rheadStr(v, 12).trim(); }).filter(Boolean),
    hubs: rheadList(f.hubs, 8).map(function (v) { return rheadNmFix(rheadStr(v, 24)).replace(/역$/, '').trim(); }).filter(Boolean)
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
// ── 장거리 열차·버스 고르기(예전 웹 _renderLdGradeChips 와 같은 판단·문구; 드롭박스 대신 단추 줄, 그림말 제외) ──
var RHEAD_LD_MODE = { train: '열차', expbus: '고속버스', subbus: '시외버스' };
function rheadWon(n) { return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }      // 12300 → '12,300'
function rheadNum(v) { return (v == null || v === '' || !isFinite(Number(v))) ? null : Number(v); }
function rheadLdNodes(f) {
  var lg = f.lg, out = [];
  if (!lg || !lg.mode) return [{ t: 'spacer', h: 0 }];
  var cands = rheadList(lg.candidates, 8), opts = rheadList(lg.options, 8), cur = rheadNum(lg.depTs), mode = rheadStr(lg.mode, 12), grade = rheadStr(lg.grade, 20);
  var cut = function (t) { t = String(t).replace(/\s+/g, ' ').trim(); return t.length > 24 ? t.slice(0, 23) + '…' : t; };
  var wid = function (t) { var w = 0; for (var i = 0; i < t.length; i++) w += t.charCodeAt(i) >= 0x1100 ? 1 : 0.62; return w; };      // 글자 폭 어림(한글 1, 그 밖 0.62)
  var rows = function (items) {                         // 단추 줄 — 폭이 허락하는 만큼(어림 25칸 이내) 한 줄에 담는다
    var line = [], w = 0;
    items.forEach(function (it) {
      var iw = wid(it.label) + 2.4;
      if (line.length && w + iw > 25) { out.push({ t: 'btnrow', pad: [0, 0, 0, 6], gap: 6, h: 32, items: line }); line = []; w = 0; }
      line.push(it); w += iw;
    });
    if (line.length) out.push({ t: 'btnrow', pad: [0, 0, 0, 6], gap: 6, h: 32, items: line });
  };
  if (cands.length > 1) {
    var mi = [];
    cands.forEach(function (c, i) {
      if (!c || typeof c !== 'object' || !c.mode) return;
      var cm = rheadStr(c.mode, 12), cd = rheadNum(c.depTs);
      var on = (cm === mode) && (cur == null || cd === cur);
      var label = (RHEAD_LD_MODE[cm] || cm) + (c.depLabel ? ' ' + rheadStr(c.depLabel, 12) : '') + (rheadNum(c.totalMin) != null ? ' · ' + rheadInt(c.totalMin, 0, 9999) + '분' : '');
      mi.push({ label: cut(label), on: on, act: { a: 'call', v: 'rh.ld.m.' + i } });
    });
    rows(mi);
  }
  if (opts.length > 1) {
    var gi = [];
    opts.forEach(function (o, i) {
      if (!o || typeof o !== 'object' || !o.grade) return;
      var og = rheadStr(o.grade, 20), od = rheadNum(o.depTs);
      var on = (og === grade) && (cur == null || od == null || od === cur);
      var label = og + (o.depLabel ? ' ' + rheadStr(o.depLabel, 12) : '') + (rheadNum(o.fare) != null ? ' · ' + rheadWon(o.fare) + '원' : '');
      gi.push({ label: cut(label), on: on, act: { a: 'call', v: 'rh.ld.g.' + i } });
    });
    rows(gi);
  }
  var note = '', nw = rheadNum(lg.noWaitMin);
  if (nw != null) note += '대기 시간을 빼면 약 ' + rheadInt(nw, 0, 9999) + '분 (다른 지도앱은 대기를 빼고 표시해요)';
  var fr = (lg.fastRide && typeof lg.fastRide === 'object') ? lg.fastRide : null;
  if (fr && rheadNum(fr.rideMin) != null) {
    note += (note ? '\n' : '') + '이동만 가장 빠른 편: ' + rheadStr(fr.depLabel, 12) + ' 출발, 열차 ' + rheadInt(fr.rideMin, 0, 9999) + '분' + (rheadNum(fr.noWaitMin) != null ? ' (대기 제외 총 ' + rheadInt(fr.noWaitMin, 0, 9999) + '분)' : '');
  }
  if (note) out.push({ t: 'text', s: note, size: 12, color: 'sub', lh: 1.5, pad: [0, 2, 0, 8] });
  if (!out.length) out.push({ t: 'spacer', h: 0 });
  return out;
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
  var nm = function (s) { return rheadNmFix(s).replace(/역$/, ''); };
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
  if (!f.cp) rheadDoorLines(f.dx, f.ex).forEach(function (s) { nodes.push({ t: 'text', s: s, size: 12, color: 'sub', lh: 1.5, pad: [0, 0, 0, 0] }); });
  if (nodes.length > 1) nodes[nodes.length - 1].pad = [0, 0, 0, 8];       // (통합 카드 cp 에서는 호차·문 줄이 세부경로 시트로 갔다 — s219)
  if (f.xs.length && !f.cp) {                            // 통합 카드(cp)에서는 긴 환승 목록 대신 칩 줄(part g)이 맡고, 자세한 순서는 세부경로 시트가 보여 준다
    var h1 = '환승 ' + f.xs.length + '번', parts = [h1];
    f.xs.forEach(function (t, i) { parts.push((i + 1) + '. ' + rheadXferLine(t).replace(RHEAD_EMOJI, '').slice(0, 160)); });
    nodes.push({ t: 'box', s: parts.join('\n'), hl: [[0, h1.length]], size: 12, lh: 1.55, color: 'text', fill: 'rgba(255,159,10,0.12)', line: 'rgba(255,159,10,0.4)', r: 10, ip: [10, 7, 10, 7], pad: [0, 0, 0, 8] });
  }
  return nodes;
}

// ── part 'g': 요약 칩 줄(s217) — '환승 5회 · 293분' · 'KTX + 지하철' · 거점 이름들. 타임라인 바로 위에 놓인다. ──
function rheadTagNodes(f) {
  if (!f.m && !f.n && !f.mix.length && !f.hubs.length) return [];
  var items = [];
  var first = (f.n > 0 ? '환승 ' + f.n + '회' : '직통') + (f.m > 0 ? ' \u00b7 ' + f.m + '분' : '');
  items.push({ s: first, b: true, c: 'rgba(255,159,10,0.14)', oc: 'rgba(255,159,10,0.45)', tc: 'gold' });
  if (f.mix.length) items.push({ s: f.mix.join(' + '), b: true, c: 'card2', oc: 'border', tc: 'text' });
  var hubs = f.hubs.filter(function (h, i, a) { return a.indexOf(h) === i; }).slice(0, 4);
  hubs.forEach(function (h) { items.push({ s: h, b: false, c: 'card2', oc: 'border', tc: 'sub' }); });
  return [{ t: 'tags', pad: [0, 2, 0, 10], gap: 6, h: 24, size: 11, px: 10, items: items }];
}
// 세부경로 시트 맨 위 환승 순서 상자(예전 홈 카드 윗부분에 길게 있던 1~N번 목록이 여기로 옮겨 왔다).
function rheadXferBox(xs, pad) {
  xs = rheadList(xs, 8).filter(function (t) { return t && typeof t === 'object'; });
  if (!xs.length) return null;
  var h1 = '환승 ' + xs.length + '번', parts = [h1];
  xs.forEach(function (t, i) { parts.push((i + 1) + '. ' + rheadXferLine(t).replace(RHEAD_EMOJI, '').slice(0, 160)); });
  return { t: 'box', s: parts.join('\n'), hl: [[0, h1.length]], size: 12, lh: 1.55, color: 'text', fill: 'rgba(255,159,10,0.12)', line: 'rgba(255,159,10,0.4)', r: 10, ip: [10, 7, 10, 7], pad: pad || [0, 0, 0, 8] };
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

// ── part 'k': 구간 타임라인(예전 웹 _renderHtlTrack · _segStopOffsets · _transitColor · _htlBaseMs 의 계산 전부) ──
//   앱이 보내는 원자료: secs[{ty,nm,du,di,ws,ar,ss,es,sts,tw,we,tc,st:[[이름,위도,경도]…]}] · xf(환승 원자료; 없으면 null) ·
//   bt(사용자가 정한 예상 시각 ms|null) · rb(이번 탐색이 나간 시각 ms|null) · now(기기 시계 ms) · sw(막차 뒤 첫차까지 분 목록) · tz(기기 시간대, 동쪽 분) · th('dark'|'pastel')
//   엔진이 시각·색·글·배지·선·점을 칸(cell)마다 정해 내려주고, 앱은 칸을 그리기만 한다.
var RTRK_LC = {
  '1호선': '#0052a4', '2호선': '#00a84d', '3호선': '#ef7c1c', '4호선': '#00a5de', '5호선': '#996cac', '6호선': '#cd7c2f', '7호선': '#747f00', '8호선': '#e6186c', '9호선': '#bdb092',
  '공항철도': '#0090d2', '경의중앙선': '#73c7a6', '경춘선': '#0c8e72', '수인분당선': '#f5a200', '경강선': '#003da5', '서해선': '#8cc63f', '우이신설선': '#b0b0b0', '신림선': '#6789ca',
  '신분당선': '#d31145', 'GTX-A': '#9069b5', '인천1호선': '#7ca8d5', '인천2호선': '#f4a62c', '인천공항철도': '#0090d2', '김포골드라인': '#ad8605', '의정부경전철': '#fb8f36', '용인경전철': '#51a834'
};
var RTRK_ALIAS = {
  '경인선': '#0052a4', '경부선': '#0052a4', '경원선': '#0052a4', '일산선': '#0052a4', '과천선': '#0052a4', '안산선': '#0052a4', '분당선': '#f5a200', '수인선': '#f5a200',
  '공항철도1호선': '#0090d2', '별내선': '#e6186c', '진접선': '#00a5de', '신분당선(연장)': '#d31145'
};
var RTRK_BUS_COLS = ['#30d158', '#bf5af2', '#ff6482', '#40c8e0', '#ffd60a'];
var RTRK_W = 64, RTRK_WLD = 108, RTRK_DWELL = 20, RTRK_MINGAP = 20, RTRK_GREY = '#8e8e93';
var RTRK_DOT = { dark: { s: '#d4af37', e: '#ff2d55' }, pastel: { s: '#1d9bf0', e: '#e0455a' } };

function rheadTrkNm(s) { return rheadNmFix(s).replace(/역$/, '').trim(); }
function rheadTrkNum(v) { return (v == null || v === '' || !isFinite(Number(v))) ? null : Number(v); }
function rheadTrkHex2(n) { return (n < 16 ? '0' : '') + n.toString(16); }
function rheadTrkBright(hex, th) {                      // 어두운 테마에서만 어두운 선 색을 밝힌다
  if (th === 'pastel') return hex;
  if (!hex || hex.length < 7) return hex;
  var r = parseInt(hex.slice(1, 3), 16) || 0, g = parseInt(hex.slice(3, 5), 16) || 0, b = parseInt(hex.slice(5, 7), 16) || 0;
  var br = (r * 299 + g * 587 + b * 114) / 1000;
  if (br < 100) {
    var k = Math.max(1.5, 160 / Math.max(br, 1));
    r = Math.min(255, Math.round(r * k)); g = Math.min(255, Math.round(g * k)); b = Math.min(255, Math.round(b * k));
    return '#' + rheadTrkHex2(r) + rheadTrkHex2(g) + rheadTrkHex2(b);
  }
  return hex;
}
function rheadTrkColor(ty, nm, th) {
  if (ty === 3) return RTRK_GREY;
  if (ty === 2) return '#30d158';
  if (ty === 4) return '#ff9500';
  if (nm) {
    var bare = nm.replace(/^(수도권|광역|서울|인천|경기)\s+/, '');
    var raw = RTRK_LC[nm] || RTRK_LC[bare] || RTRK_ALIAS[nm] || RTRK_ALIAS[bare];
    if (raw) return rheadTrkBright(raw, th);
  }
  return '#4dabff';
}
function rheadTrkHM(ms, tz) {                           // 기기 시간대 기준 HH:MM
  if (!ms) return '';
  var d = new Date(ms + tz * 60000), h = d.getUTCHours(), m = d.getUTCMinutes();
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
function rheadTrkHav(la1, lo1, la2, lo2) {
  var R = 6371000, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function rheadTrkSec(s) {
  s = (s && typeof s === 'object') ? s : {};
  var ty = rheadInt(s.ty, 0, 9);
  var sts = Array.isArray(s.sts) ? s.sts.slice(0, 150).map(rheadTrkNum) : null;
  if (sts && sts.some(function (v) { return v == null; })) sts = null;
  var tc = Array.isArray(s.tc) ? s.tc.slice(0, 8).filter(function (t) { return t && typeof t === 'object'; }).map(function (t) { return { at: rheadStr(t.at, 30), to: t.to === 'express' ? 'express' : 'local' }; }) : null;
  return {
    ty: ty, nm: rheadStr(s.nm, 40).trim(), du: Math.max(0, rheadTrkNum(s.du) || 0), di: Math.max(0, rheadTrkNum(s.di) || 0),
    ws: rheadTrkNum(s.ws), ar: rheadTrkNum(s.ar), ss: rheadTrkNum(s.ss), es: rheadTrkNum(s.es), sts: sts, tw: rheadTrkNum(s.tw), we: s.we ? 1 : 0, tc: tc,
    st: rheadList(s.st, 150).map(function (r) { r = Array.isArray(r) ? r : []; return { n: rheadStr(r[0], 40), la: rheadTrkNum(r[1]), lo: rheadTrkNum(r[2]) }; })
  };
}
function rheadTrkHasEng(sg) { return sg.ss != null && sg.es != null; }
// 정류장·역마다 구간 시작에서 몇 초 뒤인가: 엔진이 준 역별 시각 → 좌표 거리 비례(버스는 정차 포함) → 균등
function rheadTrkOffsets(sg) {
  var st = sg.st, n = st.length, i;
  if (sg.sts && sg.sts.length && sg.ss != null) {
    var ss = sg.sts;
    if (ss.length > n) ss = ss.slice(ss.length - n);
    if (ss.length === n || n === 0) return ss.map(function (v) { return Math.max(0, v - sg.ss); });
  }
  if (n < 2) return [0];
  var dur = sg.du, wait = 0;
  if (sg.ty === 2 && sg.ws != null) wait = Math.max(0, Math.min(sg.ws, dur * 0.6));
  var move = Math.max(dur - wait, 0);
  var d = [], tot = 0, geo = true;
  for (i = 1; i < n; i++) {
    var a = st[i - 1], b = st[i];
    if (a.la == null || a.lo == null || b.la == null || b.lo == null) { geo = false; break; }
    var m = rheadTrkHav(a.la, a.lo, b.la, b.lo);
    if (!isFinite(m) || m < 0) m = 0;
    d.push(m); tot += m;
  }
  var off;
  if (geo && tot > 0) {
    var mid = n - 2 > 0 ? n - 2 : 0;
    var dwellAll = sg.ty === 2 ? Math.min(RTRK_DWELL * mid, move * 0.35) : 0;
    var moveAll = Math.max(move - dwellAll, move * 0.5);
    var perDwell = mid > 0 ? dwellAll / mid : 0;
    off = [0]; var c = 0;
    for (i = 0; i < d.length; i++) {
      c += moveAll * (d[i] / tot);
      if (i < d.length - 1) c += perDwell;
      off.push(c);
    }
    var last = off[off.length - 1];
    if (last > 0 && move > 0) { var k = move / last; for (i = 0; i < off.length; i++) off[i] *= k; }
    if (wait > 0) for (i = 1; i < off.length; i++) off[i] += wait;
    for (i = 1; i < off.length; i++) if (off[i] - off[i - 1] < RTRK_MINGAP) off[i] = off[i - 1] + RTRK_MINGAP;
    return off;
  }
  var even = move / (n - 1);
  off = [0];
  for (i = 1; i < n; i++) off.push(even * i + wait);
  return off;
}
function rheadTrkLabel(ty, name) {                      // 노선/번호 라벨: 지하철=노선명, 버스=숫자면 "N번"
  var nm = String(name || '').trim();
  if (!nm) return ty === 1 ? '지하철' : (ty === 2 ? '버스' : '');
  if (ty === 2) return /^[0-9-]+$/.test(nm) ? nm + '번' : nm;
  return nm;
}
// 지나가는 점들(pts) — 예전 웹이 화면을 짓기 전에 모으던 목록
function rheadTrkPoints(f) {
  var th = f.th, tz = f.tz, i, a, b;
  var segs = f.secs;
  segs.forEach(function (sg) { if (sg.ty === 2 && sg.we && sg.nm && sg.nm.indexOf('예상') < 0) sg.nm = sg.nm + ' · 예상'; });
  if (f.xf) f.xf.forEach(function (t) {                  // 엔진이 알려 준 환승을 그릴 자리에 붙인다
    if (!t || t.k === 'train') return;
    if (t.xi != null && segs[t.xi] && segs[t.xi].ty === 3) segs[t.xi].xfo = t;
    else if (t.si != null && segs[t.si + 1]) segs[t.si + 1].xfIn = t;
  });
  for (i = 1; i < segs.length; i++) {                    // 같은 자리에서 같은 이름 역이 두 번 찍히는 것 방지(장거리 앞뒤는 지우지 않는다)
    var c = segs[i], p = segs[i - 1];
    if (c.ty === 3 || p.ty === 3) continue;
    if (c.ty === 4 || p.ty === 4) continue;
    if (p.st.length && c.st.length && rheadTrkNm(p.st[p.st.length - 1].n) === rheadTrkNm(c.st[0].n)) c.st = c.st.slice(1);
  }
  for (var wi = 0; wi < segs.length; wi++) {
    if (segs[wi].ty !== 3) continue;
    var ps = null, ns = null;
    for (a = wi - 1; a >= 0; a--) if (segs[a].ty !== 3) { ps = segs[a]; break; }
    for (b = wi + 1; b < segs.length; b++) if (segs[b].ty !== 3) { ns = segs[b]; break; }
    var same = segs[wi].du <= 60 && segs[wi].di <= 80;
    if (same && ps && ns && ps.ty !== 4 && ns.ty !== 4 && ps.st.length && ns.st.length && rheadTrkNm(ps.st[ps.st.length - 1].n) === rheadTrkNm(ns.st[0].n)) ns.st = ns.st.slice(1);
  }
  var total = 0;
  segs.forEach(function (sg) { if (sg.ty !== 3) total += sg.st.length; });
  // 단일 시간축
  var sh = 0;
  if (f.bt == null) for (i = 0; i < f.sw.length; i++) { var v = f.sw[i]; if (typeof v === 'number' && isFinite(v) && v > 0 && v < 1440) { sh = v * 60000; break; } }
  var base = f.bt != null ? f.bt : ((f.rb != null && f.now - f.rb <= 300000) ? f.rb + sh : f.now + sh);
  var cum = base, shift = 0;
  var segMs = segs.map(function (sg) {
    var t = cum;
    if (rheadTrkHasEng(sg)) { t = base + sg.ss * 1000 + shift; cum = base + sg.es * 1000 + shift; }
    else cum = t + sg.du * 1000;
    if (sg.ty === 1 && sg.tw != null && sg.tw > 0) { var w = Math.round(sg.tw); t += w; cum += w; shift += w; }
    return t;
  });
  var busN = 0;
  segs.forEach(function (s0) { if (s0.ty === 2) s0.bn = busN++; });
  var segCol = function (s0) { return (s0.ty === 2 && busN >= 2) ? RTRK_BUS_COLS[((s0.bn % 5) + 5) % 5] : rheadTrkColor(s0.ty, s0.nm, th); };
  var pts = [], gIdx = 0;
  segs.forEach(function (sg, si) {
    var col = segCol(sg), secMin = Math.round(sg.du / 60);
    if (sg.ty === 3) {
      var pC = RTRK_GREY, nC = RTRK_GREY, nt = 0, nn = '';
      for (a = si - 1; a >= 0; a--) if (segs[a].ty !== 3) { pC = segCol(segs[a]); break; }
      for (b = si + 1; b < segs.length; b++) if (segs[b].ty !== 3) { nC = segCol(segs[b]); nt = segs[b].ty; nn = segs[b].nm; break; }
      pts.push({ type: 'walk', pC: pC, nC: nC, xf: sg.xfo || null, nextLabel: rheadTrkLabel(nt, nn), nextCol: nC, lbl: secMin > 0 ? secMin + '분' : (Math.round(sg.di) + 'm') });
      return;
    }
    if (!sg.st.length) return;
    var off = sg.ty === 4 ? null : rheadTrkOffsets(sg);
    var ldLbl = null;
    if (sg.ty === 4 && sg.es != null && sg.ss != null) {
      var lm = Math.round(Math.max(0, sg.es - sg.ss) / 60);
      ldLbl = lm >= 60 ? (Math.floor(lm / 60) + '시간' + (lm % 60 ? (lm % 60) + '분' : '')) : (lm + '분');
    }
    var used = {};
    sg.st.forEach(function (st, ni) {
      var isF = gIdx === 0, isL = gIdx === total - 1, arr = '';
      if (sg.ty === 4) arr = ni === 0 ? rheadTrkHM(segMs[si], tz) : rheadTrkHM(segMs[si] + Math.max(0, (sg.es == null || sg.ss == null) ? 0 : sg.es - sg.ss) * 1000, tz);
      else if (isF) arr = rheadTrkHM(segMs[si], tz);
      else arr = rheadTrkHM(segMs[si] + (off[ni] || 0) * 1000, tz);
      var lC = col;
      if (ni === 0 && si > 0) for (a = si - 1; a >= 0; a--) if (segs[a].ty !== 3) { lC = segCol(segs[a]); break; }
      var tcg = null;                                    // 이 역에서 일반↔급행을 갈아타나(이름이 같은 첫 역에만)
      if (sg.ty === 1 && f.xf && sg.tc) {
        var nm0 = rheadTrkNm(st.n);
        for (var q = 0; q < sg.tc.length; q++) { if (used[q]) continue; if (rheadTrkNm(sg.tc[q].at) === nm0) { used[q] = 1; tcg = sg.tc[q]; break; } }
      }
      var absMs = sg.ty === 4 ? null : (isF ? segMs[si] : segMs[si] + (off[ni] || 0) * 1000);
      pts.push({ type: 'stn', nm: rheadTrkNm(st.n), col: col, lC: lC, lineNm: sg.nm, lineLabel: rheadTrkLabel(sg.ty, sg.nm), xfIn: (ni === 0 && sg.xfIn) ? sg.xfIn : null, trainChg: tcg,
        arrT: arr, isF: isF, isL: isL, ni: ni, ld: sg.ty === 4, ldRole: sg.ty === 4 ? (ni === 0 ? 'dep' : 'arr') : null, ldDur: ldLbl,
        sty: sg.ty, la: st.la, lo: st.lo, ms: absMs });
      gIdx++;
    });
  });
  return pts;
}
// 점 하나 → 그릴 칸 하나
function rheadTrkCells(pts, th, ea) {
  var cells = [], last = pts.length - 1, ti = 0, dots = RTRK_DOT[th] || RTRK_DOT.dark, tiN = 0;
  pts.forEach(function (pt, pi) { if (pt.type !== 'walk' || pi === 0 || pi === last) tiN++; });
  if (ea && ea.length !== tiN) ea = null;                   // 웹이 보여 주는 칸 수와 다르면(다른 경로의 낡은 목록) 시각을 덮지 않는다
  pts.forEach(function (pt, pi) {
    var walk = pt.type === 'walk', c = { w: pt.ld ? RTRK_WLD : RTRK_W };
    var endpoint = pi === 0 || pi === last, myTi = (!walk || endpoint) ? ti++ : -1;      // 위치 추적이 쓰는 칸 번호(도보 중간 칸은 -1)
    if (walk) { if (pt.xf) { c.n = '환승'; c.nc = 'gold'; c.ns = 11; c.nb = true; c.np = 2; } else { c.n = '도보'; c.nc = 'sub'; c.ns = 9; c.nb = false; c.np = 2; } }
    else { c.n = pt.nm; c.nc = pt.ld ? pt.col : 'text'; c.ns = pt.ld ? 11 : 10; c.nb = true; }
    var g = null, nm = pt.lineLabel || pt.lineNm;
    if (pt.ld) g = { s: nm + ' ' + (pt.ldRole === 'dep' ? '출발' : '도착'), k: 'p', c: pt.col, z: 7.5 };
    else if (walk) {
      var hadBefore = false;
      for (var h = 0; h < pi; h++) if (pts[h].type === 'stn') { hadBefore = true; break; }
      if (hadBefore && pt.nextLabel) g = { s: '↔ ' + pt.nextLabel, k: 'p', c: pt.nextCol || '#0a84ff', z: pt.xf ? 8 : 6.5 };
    } else if (pt.isF) g = { s: nm, k: 't', c: pt.col, z: 7 };
    else if (pt.trainChg) g = { s: '↔ ' + (pt.trainChg.to === 'express' ? '급행' : '일반') + ' 환승', k: 'p', c: pt.col, z: 8 };
    else if (pt.xfIn) g = { s: '↔ ' + nm, k: 'p', c: pt.col, z: 8 };
    else if (pt.ni === 0) {
      var prev = pi > 0 ? pts[pi - 1] : null, prevWalk = prev && prev.type === 'walk', prevLn = '';
      for (var q = pi - 1; q >= 0; q--) if (pts[q].type === 'stn') { prevLn = pts[q].lineNm || ''; break; }
      if (!prevWalk && prevLn && prevLn !== pt.lineNm) g = { s: '↔ ' + nm, k: 'p', c: pt.col, z: 6.5 };
      else if (prevWalk) {
        var had2 = false;
        for (var r = 0; r < pi - 1; r++) if (pts[r].type === 'stn') { had2 = true; break; }
        if (!had2) g = { s: nm, k: 't', c: pt.col, z: 7 };
      }
    }
    if (g && g.s.length) { c.g = g.s; c.gk = g.k; c.gc = g.c; c.gs = g.z; c.gx = pt.ld ? 5 : 4; }
    var lColor = pi > 0 ? pts[pi - 1]._r : RTRK_GREY, rColor = walk ? RTRK_GREY : pt.col;
    pt._r = rColor;
    c.lc = pi !== 0 ? lColor : ''; c.rc = pi !== last ? rColor : '';
    if (endpoint) { c.dk = 'e'; c.dc = pi === 0 ? dots.s : dots.e; }
    else if (!walk) { c.dk = 'r'; c.dc = pt.col; }
    else { c.dk = 'm'; c.dc = lColor; c.dc2 = rColor; }
    if (walk) { c.t = pt.lbl; c.tc = 'gold'; c.ts = 9; c.tb = true; }
    else {
      var at = pt.arrT, live = (ea && myTi >= 0) ? ea[myTi] : null;                    // 웹이 지금 보여 주는 시각(엔진이 5초마다 고쳐 준 값)이 HH:MM 이면 그것으로
      if (typeof live === 'string' && /^\d{1,2}:\d{2}$/.test(live)) at = live;
      c.t = (pt.ld && pt.ldRole === 'arr' && pt.ldDur) ? at + ' · 총 ' + pt.ldDur : at; c.tc = pt.ld ? 'gold' : 'sub'; c.ts = pt.ld ? 10 : 9; c.tb = true; }
    c.ti = myTi;
    cells.push(c);
  });
  return cells;
}
// 내 위치 마커: 웹이 알려 준 '몇 번째 칸 → 몇 번째 칸, 구간 비율' 과 대기 거리 원자료로 어디에·무슨 색으로·어떤 글로 그릴지 정한다(앱은 그리기만)
var RTRK_MK = { cap: 0.7, hh: 0.9, ms: 3000, d: 14, c: '#0a84ff', bc: '#ffffff', bw: 2, hc: 'rgba(10,132,255,.85)', hw: 6, bms: 1300, ring: 'rgba(10,132,255,.7)', rms: 1400, wc: '#ff9f0a', whc: 'rgba(255,159,10,.28)', whw: 4, wms: 1600, bz: 9 };
function rheadTrkMark(lv, cells) {
  var p = lv && lv.p;
  if (!p || typeof p !== 'object') return null;
  var f = rheadTrkNum(p.f), t = rheadTrkNum(p.t), r = rheadTrkNum(p.r), fi = -1, tj = -1, i;
  if (f == null) return null;
  for (i = 0; i < cells.length; i++) { if (cells[i].ti === f && fi < 0) fi = i; if (t != null && cells[i].ti === t && tj < 0) tj = i; }
  if (fi < 0) return null;
  if (tj < 0 || tj === fi) { tj = fi; r = 0; }
  r = Math.round(Math.max(0, Math.min(1, r == null ? 0 : r)) * 100) / 100;
  var w = lv.w && typeof lv.w === 'object' ? lv.w : null, d = w ? rheadTrkNum(w.d) : null;
  if (!w && tj !== fi && !p.sn && r > RTRK_MK.cap) r = RTRK_MK.cap;      // s258 (YJ 선택 1번: 구간의 70%까지만 부드럽게, 그 뒤는 다음 역 도착이 확정(또는 시각표 도착 시각)될 때까지 대기 — 열차가 늦을 때 마커가 앞서가지 않게)
  var K = RTRK_MK, mk = { f: fi, t: tj, r: r, ms: p.sn ? 0 : K.ms, d: K.d, c: w ? K.wc : K.c, bc: K.bc, bw: K.bw, hh: K.hh, pu: w ? 'w' : 'b', pms: w ? K.wms : K.bms, hc: w ? K.whc : K.hc, hw: w ? K.whw : K.hw, ring: K.ring, rms: K.rms };
  if (w) {
    mk.bt = d == null ? '대기 중' : (d >= 1000 ? '대기 중 · ' + (d / 1000).toFixed(1) + 'km' : '대기 중 · ' + Math.round(d) + 'm');
    mk.bg = K.wc; mk.btc = '#ffffff'; mk.bz = K.bz;
  }
  return mk;
}
// 타임라인 사실 정리(화면과 탑승 시작이 같은 것을 쓴다). 못 쓰면 { error }.
function rheadTrkPrep(inp) {
  var f = (inp && typeof inp === 'object') ? inp : {};
  var secs = rheadList(f.secs, 12).map(rheadTrkSec);
  if (!secs.length) return { error: 'empty' };
  if (!secs.some(rheadTrkHasEng)) return { error: 'notimes' };      // 엔진이 구간 시각을 안 준 옛 응답은 그리지 않는다(웹이 그린다)
  var now = rheadTrkNum(f.now);
  if (now == null || now <= 0) return { error: 'now' };
  var th = f.th === 'pastel' ? 'pastel' : 'dark';
  var facts = {
    secs: secs, th: th, tz: rheadInt(f.tz, -840, 840), now: now, bt: rheadTrkNum(f.bt), rb: rheadTrkNum(f.rb),
    sw: rheadList(f.sw, 6), xf: Array.isArray(f.xf) ? f.xf.slice(0, 12).filter(function (t) { return t && typeof t === 'object'; }).map(function (t) { return { k: t.k === 'train' ? 'train' : 'x', xi: rheadTrkNum(t.xi), si: rheadTrkNum(t.si) }; }) : null
  };
  return { facts: facts, f: f };
}
// 승차 전 '내 위치' 점이 놓일 칸(점 번호). 출발이 '내 위치'면 처음 칸. 아니면 기기 위치에서 600m 안의 가장 가까운 역·정류장. 없으면 -1.
function rheadTrkMeCell(pts, me, ra) {
  if (!pts || !pts.length) return -1;
  var hasMe = Array.isArray(me) && me.length === 2 && isFinite(Number(me[0])) && isFinite(Number(me[1])) && Math.abs(Number(me[0])) <= 90 && Math.abs(Number(me[1])) <= 180;
  if (!hasMe) return -1;
  if (/내\s*위치|현재\s*위치/.test(String(ra == null ? '' : ra))) return 0;
  var la = Number(me[0]), lo = Number(me[1]), best = -1, bd = 600;
  pts.forEach(function (pt, i) {
    if (!pt || pt.type !== 'stn' || pt.la == null || pt.lo == null) return;
    var d = rheadTrkHav(la, lo, pt.la, pt.lo);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function rheadTrackScreen(inp) {
  var f = (inp && typeof inp === 'object') ? inp : {};
  var pp = rheadTrkPrep(inp);
  if (pp.error) return { ok: false, error: pp.error };
  var facts = pp.facts, th = facts.th;
  var pts = rheadTrkPoints(facts);
  if (!pts.length) return { ok: false, error: 'nopoints' };
  var lv = (f.lv && typeof f.lv === 'object') ? f.lv : null;
  var ea = (lv && Array.isArray(lv.ea)) ? lv.ea.slice(0, 60).map(function (v) { return typeof v === 'string' ? v.slice(0, 8) : ''; }) : null;
  if (lv && (lv.pn || lv.na)) {          // 탑승 추적(대기 모드 엔진)은 노드 번호(0=출발지, 1.. = 지나는 역·정류장)로 말한다 → 칸 번호로 바꾼다
    var nodeTi = [-1], tcount = 0;
    pts.forEach(function (pt, pi) {
      var endp = pt.type !== 'walk' || pi === 0 || pi === pts.length - 1;
      if (pt.type === 'stn') nodeTi.push(tcount);
      if (endp) tcount++;
    });
    var toTi = function (n) { n = rheadTrkNum(n); return (n != null && n >= 1 && n < nodeTi.length) ? nodeTi[Math.floor(n)] : null; };
    lv = { p: lv.p || null, w: lv.w || null, ea: ea };
    if (f.lv.pn && typeof f.lv.pn === 'object') {
      var pf = toTi(f.lv.pn.f), pt2 = toTi(f.lv.pn.t);
      lv.p = pf == null ? null : { f: pf, t: pt2 == null ? pf : pt2, r: rheadTrkNum(f.lv.pn.r) || 0 };
    }
    if (Array.isArray(f.lv.na)) {
      ea = new Array(tcount);
      for (var q = 0; q < tcount; q++) ea[q] = '';
      for (var nq = 1; nq < nodeTi.length; nq++) { var v = f.lv.na[nq]; if (typeof v === 'string') ea[nodeTi[nq]] = v.slice(0, 8); }
    }
  }
  var cells = rheadTrkCells(pts, th, ea), w = 0;
  cells.forEach(function (c) { w += c.w; });
  if (!(lv && lv.p)) {                                    // 탑승 추적이 없어도 웹처럼 '내 위치' 점을 보여 준다(출발이 내 위치면 처음 칸, 아니면 가까운 역·정류장 칸)
    var mi = rheadTrkMeCell(pts, f.me, f.ra);
    if (mi >= 0 && cells[mi] && cells[mi].ti >= 0) lv = { p: { f: cells[mi].ti, t: cells[mi].ti, r: 0, sn: 1 }, w: null, ea: ea };
  }
  var node = { t: 'trk', pad: [14, 6, 14, 6], cells: cells };
  var mk = rheadTrkMark(lv, cells);
  if (mk) {
    node.mk = mk;
    var here = mk.r >= mk.hh ? mk.t : mk.f;                    // 웹 htl-passed · htl-gps-here: 시간 기준은 역에 90% 다가가야 다음 칸으로 넘어간다(출발 칸은 건드리지 않는다)
    if (here > 0 && here < cells.length) { for (var pi2 = 0; pi2 < here; pi2++) cells[pi2].ps = true; cells[here].hr = true; }      // s257 (YJ: 첫 역·정류장도 지나가면 회색) — 출발 칸도 마커가 지나가면 회색
  }
  var out = { ok: true, v: 1, screen: 'rhead', cover: 'tab', bg: 'card', head: [node], body: [{ t: 'spacer', h: 0 }], info: { part: 'k', n: cells.length, w: w } };
  out.rev = 'r' + RHEAD_SCREEN_V + 'k:' + rheadHash(JSON.stringify(cells) + (mk ? JSON.stringify(mk) : ''));
  return out;
}

function rheadScreen(inp, factsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 10)) return { ok: false, error: 'cap' };
  if (inp.part === 'k') return Number(inp.cap) >= 12 ? rheadTrackScreen(factsIn) : { ok: false, error: 'cap' };      // 타임라인 노드 trk(+내 위치 마커 mk)는 규격 12
  if (inp.part === 'g' && Number(inp.cap) < 25) return { ok: false, error: 'cap' };      // 알약 줄 tags 는 규격 25
  var part = (inp.part === 't' || inp.part === 'n' || inp.part === 'l' || inp.part === 'g') ? inp.part : 'h';
  var f = rheadFacts(factsIn);
  var body = part === 't' ? rheadTabNodes(f) : (part === 'n' ? rheadNoteNodes(f) : (part === 'l' ? rheadLdNodes(f) : (part === 'g' ? rheadTagNodes(f) : rheadHeadNodes(f))));
  var out = { ok: true, v: 1, screen: 'rhead', cover: 'tab', bg: 'card', head: [], body: body, info: { part: part } };      // 카드 안에 놓이는 화면 — 바탕은 카드색
  out.rev = 'r' + RHEAD_SCREEN_V + part + ':' + rheadHash(JSON.stringify(body));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { rheadTrkPrep: rheadTrkPrep, rheadTrkPoints: rheadTrkPoints, rheadTrkColor: rheadTrkColor, rheadScreen: rheadScreen, rheadTrackScreen: rheadTrackScreen, rheadFacts: rheadFacts, rheadXferLine: rheadXferLine, rheadDoorLines: rheadDoorLines, rheadXferBox: rheadXferBox, rheadNmFix: rheadNmFix };
