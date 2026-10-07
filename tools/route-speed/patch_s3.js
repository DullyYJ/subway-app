// s3: 콜드 요청 CPU 단축 3종 — (1) 버스 대기 간선 캐시를 accessSec/rtw 상태로 확장(부작용 재생), (2) isPassStop 이름별 캐시, (3) xpBits/xpHops 디코드 가속.
// 결과·부작용(waitLog, rtwStat, __waitSrc)은 원본과 동일하게 재생한다. 앵커가 하나라도 안 맞으면 즉시 실패.
const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
function rep(a,b,n){const c=s.split(a).length-1;if(c!==(n||1))throw new Error('anchor '+c+' '+a.slice(0,70));s=s.split(a).join(b);}

// (1) 대기 간선 캐시 확장
rep(`  let _pure = !G.rtw && !G.accessSec;
  if (_pure && _live) { for (const _k in _live) { _pure = false; break; } }
  let _bwM = null;
  if (_pure) { _bwM = G.__bwM2 || (G.__bwM2 = new Map()); } else if (G.__bwM2) G.__bwM2 = null;`,
`  let _liveE = true;
  if (_live) { for (const _k in _live) { _liveE = false; break; } }
  let _bwM = null;
  if (_liveE && (!G.__bwMemo || (!G.rtw && !G.accessSec))) {
    let _an = 0;
    const _as = G.accessSec;
    if (_as) { for (const _k in _as) _an++; }
    const _tk = G.__bwTk;
    if (G.__bwM2 && _tk && _tk.an === _an && _tk.as === !!_as && _tk.rtw === G.rtw && _tk.rw === G.routeWait && _tk.rn === G.routeNoOf && _tk.rt === G.routeTypeOf && _tk.st === !!(G.rtwStat && G.rtwStat.stopKeys === 0)) {
      _bwM = G.__bwM2;
    } else {
      _bwM = G.__bwM2 = new Map();
      G.__bwTk = { an: _an, as: !!_as, rtw: G.rtw, rw: G.routeWait, rn: G.routeNoOf, rt: G.routeTypeOf, st: !!(G.rtwStat && G.rtwStat.stopKeys === 0) };
    }
  } else if (G.__bwM2) G.__bwM2 = null;`);
rep(`          if (e.bwE === _bwM) { G.__waitSrc = e.bwS; bw = e.bwV; }
          else {
            let _sid = _stopIds.get(un);
            if (_sid === void 0) { _sid = stopIdOf(ub); _stopIds.set(un, _sid); }
            bw = busWaitAt(G, e.line, _sid);
            e.bwE = _bwM; e.bwV = bw; e.bwS = G.__waitSrc;
          }`,
`          if (e.bwE === _bwM) {
            G.__waitSrc = e.bwS; bw = e.bwV;
            if (e.bwK != null) (G.waitLog = G.waitLog || {})[e.bwK] = e.bwT;
            if (e.bwD != null && G.rtwStat) { const _q = G.rtwStat, _d = e.bwD; _q.stopHit += _d[0]; _q.anyHit += _d[1]; _q.anySkipped += _d[2]; _q.miss += _d[3]; }
          }
          else {
            let _sid = _stopIds.get(un);
            if (_sid === void 0) { _sid = stopIdOf(ub); _stopIds.set(un, _sid); }
            const _q0 = G.rtwStat;
            let _a0 = 0, _a1 = 0, _a2 = 0, _a3 = 0;
            if (_q0) { _a0 = _q0.stopHit; _a1 = _q0.anyHit; _a2 = _q0.anySkipped; _a3 = _q0.miss; }
            bw = busWaitAt(G, e.line, _sid);
            e.bwE = _bwM; e.bwV = bw; e.bwS = G.__waitSrc;
            e.bwK = null; e.bwT = void 0; e.bwD = null;
            if (_q0) {
              const _d0 = _q0.stopHit - _a0, _d1 = _q0.anyHit - _a1, _d2 = _q0.anySkipped - _a2, _d3 = _q0.miss - _a3;
              if (_d0 | _d1 | _d2 | _d3) e.bwD = [_d0, _d1, _d2, _d3];
            }
            if (G.accessSec && _sid != null && G.accessSec[stopNorm(_sid)] != null && G.waitLog) {
              const _no = G.routeNoOf ? G.routeNoOf[e.line] : null;
              const _kk = _sid + "|" + (_no || e.line);
              if (G.waitLog[_kk] !== void 0) { e.bwK = _kk; e.bwT = G.waitLog[_kk]; }
            }
          }`);

// (2) isPassStop 이름별 캐시
rep(`function isPassStop(nm) {
  const s = String(nm == null ? "" : nm);
  return`,`var _PASS_MEMO = /* @__PURE__ */ new Map();
function isPassStop(nm) {
  if (typeof nm === "string") {
    const _h = _PASS_MEMO.get(nm);
    if (_h !== void 0) return _h;
    const _r = isPassStopRaw(nm);
    if (_PASS_MEMO.size > 5e4) _PASS_MEMO.clear();
    _PASS_MEMO.set(nm, _r);
    return _r;
  }
  return isPassStopRaw(nm);
}
function isPassStopRaw(nm) {
  const s = String(nm == null ? "" : nm);
  return`);

// (3) xpBits / xpHops 가속(잘못된 문자는 원본 경로로)
rep(`function xpBits(h) {
  if (!h || h.length < 120) return null;`,`var _HX = new Int8Array(128).fill(-1);
for (let _i = 0; _i < 10; _i++) _HX[48 + _i] = _i;
for (let _i = 0; _i < 6; _i++) { _HX[97 + _i] = 10 + _i; _HX[65 + _i] = 10 + _i; }
var _B36 = new Int8Array(128).fill(-1);
for (let _i = 0; _i < 10; _i++) _B36[48 + _i] = _i;
for (let _i = 0; _i < 26; _i++) { _B36[97 + _i] = 10 + _i; _B36[65 + _i] = 10 + _i; }
var _XB_MEMO = /* @__PURE__ */ new Map();
function xpBits(h) {
  if (!h || h.length < 120) return null;
  if (typeof h === "string") {
    const _m = _XB_MEMO.get(h);
    if (_m !== void 0) return _m;
    const _r = xpBitsFast(h);
    if (_XB_MEMO.size > 4e3) _XB_MEMO.clear();
    _XB_MEMO.set(h, _r);
    return _r;
  }
  return xpBitsRaw(h);
}
function xpBitsFast(h) {
  var b = new Uint8Array(480), any = 0;
  for (var i = 0; i < 120; i++) {
    var c = h.charCodeAt(i), v = c < 128 ? _HX[c] : -1;
    if (v < 0) return xpBitsRaw(h);
    b[4 * i] = v >> 3 & 1;
    b[4 * i + 1] = v >> 2 & 1;
    b[4 * i + 2] = v >> 1 & 1;
    b[4 * i + 3] = v & 1;
    any |= v;
  }
  return any ? b : null;
}
function xpBitsRaw(h) {
  if (!h || h.length < 120) return null;`);
rep(`function xpHops(h) {
  if (!h || h.length < 4) return null;
  var a = new Uint16Array(480), any = 0;`,`function xpHops(h) {
  if (!h || h.length < 4) return null;
  if (typeof h !== "string") return xpHopsRaw(h);
  var a = new Uint16Array(480), any = 0;
  for (var i = 0; i + 4 <= h.length; i += 4) {
    var c0 = h.charCodeAt(i), c1 = h.charCodeAt(i + 1), c2 = h.charCodeAt(i + 2), c3 = h.charCodeAt(i + 3);
    var v0 = c0 < 128 ? _B36[c0] : -1, v1 = c1 < 128 ? _B36[c1] : -1, v2 = c2 < 128 ? _B36[c2] : -1, v3 = c3 < 128 ? _B36[c3] : -1;
    if ((v0 | v1 | v2 | v3) < 0) return xpHopsRaw(h);
    var sl = v0 * 36 + v1, hp = v2 * 36 + v3;
    if (sl < 480 && hp > 0) {
      a[sl] = hp;
      any = 1;
    }
  }
  return any ? a : null;
}
function xpHopsRaw(h) {
  if (!h || h.length < 4) return null;
  var a = new Uint16Array(480), any = 0;`);
fs.writeFileSync(process.argv[3],s);console.log('ok s3');
