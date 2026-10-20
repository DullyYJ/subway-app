// 길동무 — 즐겨찾기(경로) 화면 엔진 — 2026-10-20 (s92). POST /screen/fav 로 쓰인다.
// 웹 _favQuickAdd/_removeFav/_renderFavPopup/_applyFavRoute 의 규칙(최대 8개 · 같은 출발-도착 중복 불가 · 출발=도착 불가 · 이름 기본 'A→B')을 엔진으로 옮겼다.
// 앱은 저장된 목록(list)과 지금 경로의 출발·도착 이름(cur), 방금 누른 것(op)만 보내고, 엔진이 새 목록(info.list)과 화면·안내 글(info.msg)을 돌려준다. 앱은 새 목록을 그대로 저장한다.
//   입력 { cap(18 이상), f:{ list:[{s,d,name}], cur:{s,d}|null, op:{k:'quick'}|{k:'del',i}|null, th } }
//   출력 { ok, v:1, screen:'fav', cover:'tab', head:[], body:[…], info:{ list:[{s,d,name}], msg, go:[null|{s:[이름,노선,위도,경도], d:[…]}] } }
// 눌림: fv.add(현재 경로 등록) · fv.go.<i>(이 즐겨찾기로 경로 찾기) · fv.del.<i> · fv.close
'use strict';
var FAV_V = 1, FAV_MAX = 8;
function favStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function favStnTable() {
  if (typeof HOME_STNS !== 'undefined' && HOME_STNS) return HOME_STNS;
  try { if (typeof require === 'function') return require('./home-stations').HOME_STNS; } catch (e) { /* 없음 */ }
  return [];
}
function favHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function favFind(name) {                          // 역 이름(끝의 '역' 은 뗀다) → [이름, 노선, 위도, 경도] 또는 null
  var n = favStr(name, 30).replace(/\s+/g, '').replace(/역$/, ''), t = favStnTable();
  if (!n) return null;
  for (var i = 0; i < t.length; i++) if (t[i][0] === n) return [t[i][0], t[i][1], t[i][2], t[i][3]];
  return null;
}
function favClean(list) {
  var out = [];
  (Array.isArray(list) ? list : []).forEach(function (x) {
    if (!x || typeof x !== 'object' || out.length >= FAV_MAX) return;
    var s = favStr(x.s, 30), d = favStr(x.d, 30);
    if (!s || !d || out.some(function (y) { return y.s === s && y.d === d; })) return;
    out.push({ s: s, d: d, name: favStr(x.name, 40) || (s + '→' + d) });
  });
  return out;
}
function favScreen(opt, f) {
  if (!(Number(opt && opt.cap) >= 18)) return { ok: false, error: 'cap' };
  f = (f && typeof f === 'object') ? f : {};
  var list = favClean(f.list), msg = '';
  var cur = null;
  if (f.cur && typeof f.cur === 'object') { var cs = favFind(f.cur.s), cd = favFind(f.cur.d); if (cs && cd) cur = { s: cs[0], d: cd[0] }; }
  var op = (f.op && typeof f.op === 'object') ? f.op : null;
  if (op && op.k === 'quick') {
    if (!cur) msg = '지하철역으로 정한 경로만 등록할 수 있어요';
    else if (cur.s === cur.d) msg = '출발역과 도착역이 같아요';
    else if (list.length >= FAV_MAX) msg = '즐겨찾기는 최대 ' + FAV_MAX + '개';
    else if (list.some(function (y) { return y.s === cur.s && y.d === cur.d; })) msg = '이미 등록된 경로예요';
    else { list.push({ s: cur.s, d: cur.d, name: cur.s + '→' + cur.d }); msg = cur.s + '→' + cur.d + ' 등록 완료'; }
  } else if (op && op.k === 'del') {
    var i = Math.floor(Number(op.i));
    if (i >= 0 && i < list.length) { list.splice(i, 1); msg = '즐겨찾기 삭제'; }
  }
  var kids = [{ t: 'bar', pad: [16, 0, 0, 6], title: '즐겨찾기', btn: '닫기', act: { a: 'call', v: 'fv.close' } }];
  if (cur) {
    var reg = list.some(function (y) { return y.s === cur.s && y.d === cur.d; });
    if (reg) kids.push({ t: 'text', s: '현재 경로(' + cur.s + '→' + cur.d + ')는 등록됨', size: 12, color: '#30d158', pad: [0, 4, 0, 10] });
    else if (cur.s !== cur.d) kids.push({ t: 'button', s: '+ 현재 경로(' + cur.s + '→' + cur.d + ') 빠른 등록', size: 13, h: 44, r: 12, bold: true, fill: 'card2', line: 'gold', tc: 'gold', pad: [0, 4, 0, 10], act: { a: 'call', v: 'fv.add' } });
  }
  if (!list.length) kids.push({ t: 'text', s: '저장된 즐겨찾기가 없습니다.\n경로를 찾은 뒤 위 단추로 등록해 보세요.', size: 12, color: 'sub', lh: 1.7, align: 'center', pad: [18, 4, 18, 4] });
  var go = [];
  list.forEach(function (x, i) {
    var a = favFind(x.s), b = favFind(x.d);
    go.push(a && b ? { s: a, d: b } : null);
    kids.push({ t: 'row', pad: [0, 4, 0, 4], gap: 8, kids: [
      { t: 'button', s: x.name, size: 14, h: 46, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'gold', act: { a: 'call', v: 'fv.go.' + i } },
      { t: 'button', s: '삭제', size: 13, h: 46, r: 12, bold: true, fill: 'card2', line: 'border', tc: '#ff453a', act: { a: 'call', v: 'fv.del.' + i } }] });
    if (x.name !== x.s + '→' + x.d) kids.push({ t: 'text', s: x.s + ' → ' + x.d, size: 11, color: 'sub', pad: [0, 4, 0, 8] });
  });
  kids.push({ t: 'spacer', h: 16 });
  var out = { ok: true, v: FAV_V, screen: 'fav', cover: 'tab', head: [], body: kids, info: { list: list, msg: msg, go: go } };
  out.rev = 'f' + FAV_V + ':' + favHash(JSON.stringify([kids, msg]));
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { favScreen: favScreen, favFind: favFind, favClean: favClean, FAV_MAX: FAV_MAX };
