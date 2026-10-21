// 화면 캐시 규칙(엔진) — /screen/* 응답의 ETag · 신선 시간(max-age) · 304 판단. 2026-10-21 (s113).
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다." — 어느 화면을 얼마 동안 다시 안 받아도 되는지(max-age)와
//   '내용이 같은가'(ETag)는 엔진이 정한다. 앱은 헤더를 그대로 따를 뿐(신선하면 요청을 건너뛰고, 같으면 304 만 받고 화면을 그대로 둔다).
// 입력  scCond(path, bodyText, ifNoneMatch) → { etag, maxAge, notModified }
// 규칙  ETag = 응답 글 해시 + 길이(같은 글이면 같다) · max-age = 화면 종류별 표(아래) · If-None-Match 가 ETag 와 같으면 notModified.
var SC_MAXAGE = {
  '/screen/tabs': 600, '/screen/cchips': 600, '/screen/hdr': 300, '/screen/shop': 300, '/screen/settings': 30,
  '/screen/news': 60, '/screen/board': 15, '/screen/chat': 4, '/screen/home': 15, '/screen/hcards': 60,
  '/screen/map': 20, '/screen/food': 120, '/screen/fav': 30, '/screen/cong': 60, '/screen/ai': 60, '/screen/talk': 15
};
function scHash(str) {                                   // cyrb53 — 같은 글이면 같은 값(암호용 아님)
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function scEtag(text) { var t = String(text == null ? '' : text); return '"' + scHash(t) + '.' + t.length.toString(36) + '"'; }
function scMaxAge(path) { var m = SC_MAXAGE[String(path || '')]; return typeof m === 'number' ? m : 0; }
function scMatches(inm, etag) {
  if (!inm) return false;
  var parts = String(inm).split(',');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim().replace(/^W\//, '');
    if (p === '*' || p === etag) return true;
  }
  return false;
}
function scCond(path, text, inm) {
  var etag = scEtag(text);
  return { etag: etag, maxAge: scMaxAge(path), notModified: scMatches(inm, etag) };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { scCond: scCond, scEtag: scEtag, scMaxAge: scMaxAge, scMatches: scMatches, SC_MAXAGE: SC_MAXAGE };
