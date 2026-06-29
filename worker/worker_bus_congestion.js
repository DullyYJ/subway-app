// ════════════════════════════════════════════════════════════
// Cloudflare Worker — 버스 노선별 혼잡도 프록시
// 기존 Worker(gentle-lab-7e47subway-api)에 아래 라우트를 추가하세요.
// CORS 우회 + 국토부 노선별 혼잡도 API 중계
// ════════════════════════════════════════════════════════════

// 기존 fetch 핸들러 안에 다음 분기를 추가:
//
//   if (url.pathname === '/bus-congestion') {
//     return handleBusCongestion(url, corsHeaders);
//   }
//
// 그리고 아래 함수를 Worker에 추가:

async function handleBusCongestion(url, corsHeaders) {
  const KEY = 'fbdaeef19e93c7490ee53f87ae076ba752ff4fb89183d1e34d9798306d7b652d';
  const BASE = 'https://apis.data.go.kr/1613000/RouteCongestionLevel/getRouteCongestionLevel';

  // 클라이언트가 넘긴 파라미터 전달
  const p = url.searchParams;
  const qs = new URLSearchParams({
    serviceKey: KEY,
    pageNo: p.get('pageNo') || '1',
    numOfRows: p.get('numOfRows') || '100',
    opr_ymd: p.get('opr_ymd') || '',
    ctpv_cd: p.get('ctpv_cd') || '',
    sgg_cd: p.get('sgg_cd') || '',
    dataType: 'JSON'
  });
  // 선택 파라미터
  if (p.get('rte_id'))  qs.set('rte_id',  p.get('rte_id'));
  if (p.get('sttn_id')) qs.set('sttn_id', p.get('sttn_id'));

  const apiUrl = BASE + '?' + qs.toString();

  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300'  // 5분 캐시
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
