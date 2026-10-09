// 길동무 — 공휴일 (엔진 전체의 단일 출처). 다음 열차·장거리 시간표·/holidays(앱)가 모두 여기를 본다.
//   · 자료: KV `nt:holidays:v1`(매일 새벽 자동 갱신 워크플로가 정부 특일 API·외부 자료·규칙 계산을 대조해 올림) → 없거나 내장본보다 오래되면 내장본(HOL_EMBED).
//   · 형식: { version, asOf, years: { '2026': { status:'verified'|'provisional', dates: { 'YYYY-MM-DD': '이름' } } } }
//   · 자료가 없는 해는 '양력 고정 공휴일'만 공휴일로 본다(음력·대체공휴일을 모르면서 아는 척하지 않는다) — holCovers() 로 확인 가능.
var HOL_KV_KEY = "nt:holidays:v1";
var HOL_TTL_MS = 3600 * 1000;
var HOL_FIXED_SOLAR = { '1-1': '신정', '3-1': '삼일절', '5-5': '어린이날', '6-6': '현충일', '8-15': '광복절', '10-3': '개천절', '10-9': '한글날', '12-25': '성탄절' };
var _HOL = { years: {}, version: '', asOf: '', src: 'none' };
var _HOL_AT = 0, _HOL_BUSY = null;
function _holPad(n) { return (n < 10 ? '0' : '') + n; }
function holLoad(obj, src) {
  var years = {};
  if (_HOL.years) for (var y0 in _HOL.years) years[y0] = _HOL.years[y0];       // 해 단위로 덮어쓴다(내장본의 다른 해는 유지)
  if (obj && obj.years) for (var y in obj.years) { var ye = obj.years[y]; if (ye && ye.dates) years[y] = ye; }
  _HOL = { years: years, version: String(obj && obj.version || ''), asOf: String(obj && obj.asOf || ''), src: src };
}
function holCovers(y) { return !!(_HOL.years && _HOL.years[String(y)]); }
function holName(y, m, d) {
  var ye = _HOL.years && _HOL.years[String(y)];
  if (ye) return ye.dates[y + '-' + _holPad(m) + '-' + _holPad(d)] || null;
  return HOL_FIXED_SOLAR[m + '-' + d] || null;
}
function holIs(y, m, d) { return holName(y, m, d) != null; }
function holIsYmd(ymd) { ymd = String(ymd); return holIs(+ymd.slice(0, 4), +ymd.slice(4, 6), +ymd.slice(6, 8)); }
// 기준 시각(ms)의 KST 요일 — 공휴일이면 일요일(0)로 본다(버스 배차간격·지하철 첫차/막차·주말 여부 계산용)
function holDowKST(ms) {
  var d = new Date(ms + 324e5);
  return holIs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) ? 0 : d.getUTCDay();
}
function holSnapshot() {
  var out = { version: _HOL.version, asOf: _HOL.asOf, src: _HOL.src, years: {} };
  for (var y in _HOL.years) out.years[y] = { status: _HOL.years[y].status || '', dates: _HOL.years[y].dates };
  return out;
}
// 내장본 먼저 적재(요청이 오기 전에 이미 쓸 수 있게). HOL_EMBED 는 holidays-data.js 가 정의한다.
try { if (typeof HOL_EMBED === 'string') holLoad(JSON.parse(HOL_EMBED), 'embed'); } catch (e) { }
var _HOL_EMBED_ASOF = _HOL.asOf, _HOL_EMBED_YEARS = _HOL.years;
// KV 의 최신 자료를 받아 둔다(1시간에 한 번). 실패해도 지금 가진 것을 그대로 쓴다.
async function holEnsure(env) {
  if (Date.now() - _HOL_AT < HOL_TTL_MS) return;
  if (_HOL_BUSY) return _HOL_BUSY;
  _HOL_BUSY = (async function () {
    try {
      if (env && env.ROWS_KV) {
        var txt = await env.ROWS_KV.get(HOL_KV_KEY, { cacheTtl: 3600 });
        if (txt) {
          var o = JSON.parse(txt);
          if (o && o.years && String(o.asOf || '') >= String(_HOL_EMBED_ASOF || '')) { _HOL = { years: _HOL_EMBED_YEARS, version: _HOL_EMBED_ASOF, asOf: _HOL_EMBED_ASOF, src: 'embed' }; holLoad(o, 'kv'); }
        }
      }
    } catch (e) { /* 지금 것을 유지 */ }
    _HOL_AT = Date.now();
  })();
  try { await _HOL_BUSY; } finally { _HOL_BUSY = null; }
}
// GET /holidays[?year=2027] — 앱이 쓰는 공휴일 목록
async function handleHolidays(request, env) {
  var H = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'public, max-age=3600' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  await holEnsure(env);
  var snap = holSnapshot(), u = new URL(request.url), q = u.searchParams.get('year');
  if (q) { var one = {}; if (snap.years[q]) one[q] = snap.years[q]; snap.years = one; }
  return new Response(JSON.stringify(snap), { headers: H });
}
if (typeof module !== 'undefined' && module.exports) module.exports = { holLoad: holLoad, holIs: holIs, holName: holName, holIsYmd: holIsYmd, holDowKST: holDowKST, holCovers: holCovers, holEnsure: holEnsure, holSnapshot: holSnapshot, handleHolidays: handleHolidays, HOL_FIXED_SOLAR: HOL_FIXED_SOLAR, _holReset: function () { _HOL = { years: _HOL_EMBED_YEARS, version: _HOL_EMBED_ASOF, asOf: _HOL_EMBED_ASOF, src: 'embed' }; _HOL_AT = 0; } };
