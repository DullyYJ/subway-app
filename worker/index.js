// ══════════════════════════════════════════════════════════
// 출근길 뭐라카노 — Cloudflare Worker + D1
//
// 엔드포인트:
//   GET  /talks?after=<ts>              최근 톡 조회
//   POST /talks {nick,text}             톡 등록
//   GET  /posts?cat=<cat>               게시글 목록
//   POST /posts {nick,title,body,cat}   게시글 등록
//   POST /react {id,type}               반응 +1
//   GET  /kakao-food?station=<역명>     도착역 맛집 조회 (D1 캐시)
//
// 크론 (매일 새벽 3시):
//   전국 225개 역 맛집 카카오 API로 수집 → D1 저장
// ══════════════════════════════════════════════════════════

// ── 카카오 REST API 키 ────────────────────────────────────
const KAKAO_KEY = 'a420cd52d24c6380fb5d1a2287663495';

// ── 전국 역 좌표 목록 (크론 순회용) ─────────────────────────
const ALL_STATIONS = [{"name":"다대포해수욕장","line":"부산1호선","lat":35.04867,"lng":128.9641},{"name":"다대포항","line":"부산1호선","lat":35.05782,"lng":128.9713},{"name":"낫개","line":"부산1호선","lat":35.065265,"lng":128.979873},{"name":"신장림","line":"부산1호선","lat":35.074433,"lng":128.977041},{"name":"장림","line":"부산1호선","lat":35.08109,"lng":128.9775},{"name":"동매","line":"부산1호선","lat":35.0899,"lng":128.9742},{"name":"신평","line":"부산1호선","lat":35.095179,"lng":128.960564},{"name":"하단","line":"부산1호선","lat":35.10618,"lng":128.966803},{"name":"당리","line":"부산1호선","lat":35.103532,"lng":128.973846},{"name":"사하","line":"부산1호선","lat":35.099847,"lng":128.9831},{"name":"괴정","line":"부산1호선","lat":35.099816,"lng":128.992144},{"name":"대티","line":"부산1호선","lat":35.103126,"lng":128.999936},{"name":"서대신","line":"부산1호선","lat":35.110937,"lng":129.012178},{"name":"동대신","line":"부산1호선","lat":35.110452,"lng":129.017684},{"name":"토성","line":"부산1호선","lat":35.100727,"lng":129.019776},{"name":"자갈치","line":"부산1호선","lat":35.097372,"lng":129.02667},{"name":"남포","line":"부산1호선","lat":35.097953,"lng":129.034869},{"name":"중앙","line":"부산1호선","lat":35.103837,"lng":129.036371},{"name":"부산","line":"부산1호선","lat":35.115224,"lng":129.0397},{"name":"초량","line":"부산1호선","lat":35.121168,"lng":129.043039},{"name":"부산진","line":"부산1호선","lat":35.127787,"lng":129.047894},{"name":"좌천","line":"부산1호선","lat":35.134361,"lng":129.054455},{"name":"범일","line":"부산1호선","lat":35.140952,"lng":129.059352},{"name":"범내골","line":"부산1호선","lat":35.1474,"lng":129.059261},{"name":"서면","line":"부산1호선","lat":35.158282,"lng":129.059556},{"name":"부전","line":"부산1호선","lat":35.162587,"lng":129.062952},{"name":"양정","line":"부산1호선","lat":35.173122,"lng":129.071366},{"name":"시청","line":"부산1호선","lat":35.179837,"lng":129.076642},{"name":"연산","line":"부산1호선","lat":35.186168,"lng":129.081534},{"name":"교대","line":"부산1호선","lat":35.19605,"lng":129.080035},{"name":"동래","line":"부산1호선","lat":35.205641,"lng":129.078506},{"name":"명륜","line":"부산1호선","lat":35.212551,"lng":129.079659},{"name":"온천장","line":"부산1호선","lat":35.220249,"lng":129.086437},{"name":"부산대","line":"부산1호선","lat":35.229609,"lng":129.089358},{"name":"장전","line":"부산1호선","lat":35.238091,"lng":129.088111},{"name":"구서","line":"부산1호선","lat":35.247407,"lng":129.091327},{"name":"두실","line":"부산1호선","lat":35.256959,"lng":129.091386},{"name":"남산","line":"부산1호선","lat":35.265404,"lng":129.092496},{"name":"범어사","line":"부산1호선","lat":35.273105,"lng":129.092679},{"name":"노포","line":"부산1호선","lat":35.284687,"lng":129.094967},{"name":"장산","line":"부산2호선","lat":35.169914,"lng":129.176986},{"name":"중동","line":"부산2호선","lat":35.1667,"lng":129.168604},{"name":"해운대","line":"부산2호선","lat":35.163672,"lng":129.158908},{"name":"동백","line":"부산2호선","lat":35.161484,"lng":129.147897},{"name":"벡스코","line":"부산2호선","lat":35.168844,"lng":129.138933},{"name":"센텀시티","line":"부산2호선","lat":35.168827,"lng":129.131745},{"name":"민락","line":"부산2호선","lat":35.167228,"lng":129.121909},{"name":"수영","line":"부산2호선","lat":35.165227,"lng":129.114713},{"name":"광안","line":"부산2호선","lat":35.157916,"lng":129.113168},{"name":"금련산","line":"부산2호선","lat":35.149771,"lng":129.110961},{"name":"남천","line":"부산2호선","lat":35.142139,"lng":129.107978},{"name":"경성대·부경대","line":"부산2호선","lat":35.137585,"lng":129.100548},{"name":"대연","line":"부산2호선","lat":35.135153,"lng":129.092161},{"name":"못골","line":"부산2호선","lat":35.134731,"lng":129.084415},{"name":"지게골","line":"부산2호선","lat":35.135574,"lng":129.074365},{"name":"문현","line":"부산2호선","lat":35.139151,"lng":129.067399},{"name":"국제금융센터·부산은행","line":"부산2호선","lat":35.145817,"lng":129.066755},{"name":"전포","line":"부산2호선","lat":35.153102,"lng":129.065374},{"name":"서면","line":"부산2호선","lat":35.15774,"lng":129.059084},{"name":"부암","line":"부산2호선","lat":35.157444,"lng":129.050185},{"name":"가야","line":"부산2호선","lat":35.155883,"lng":129.042817},{"name":"동의대","line":"부산2호선","lat":35.153986,"lng":129.03275},{"name":"개금","line":"부산2호선","lat":35.153284,"lng":129.020533},{"name":"냉정","line":"부산2호선","lat":35.151254,"lng":129.012255},{"name":"주례","line":"부산2호선","lat":35.150508,"lng":129.003077},{"name":"감전","line":"부산2호선","lat":35.155528,"lng":128.991146},{"name":"사상","line":"부산2호선","lat":35.162361,"lng":128.984621},{"name":"덕포","line":"부산2호선","lat":35.173754,"lng":128.983955},{"name":"모덕","line":"부산2호선","lat":35.180366,"lng":128.985621},{"name":"모라","line":"부산2호선","lat":35.189663,"lng":128.988655},{"name":"구남","line":"부산2호선","lat":35.196804,"lng":128.994928},{"name":"구명","line":"부산2호선","lat":35.20252,"lng":128.999322},{"name":"덕천","line":"부산2호선","lat":35.210219,"lng":129.005673},{"name":"수정","line":"부산2호선","lat":35.223356,"lng":129.009198},{"name":"화명","line":"부산2호선","lat":35.236278,"lng":129.013918},{"name":"율리","line":"부산2호선","lat":35.246714,"lng":129.012918},{"name":"동원","line":"부산2호선","lat":35.258656,"lng":129.012392},{"name":"금곡","line":"부산2호선","lat":35.267248,"lng":129.016905},{"name":"호포","line":"부산2호선","lat":35.280406,"lng":129.017097},{"name":"증산","line":"부산2호선","lat":35.308302,"lng":129.010246},{"name":"부산대양산캠퍼스","line":"부산2호선","lat":35.316955,"lng":129.013941},{"name":"남양산","line":"부산2호선","lat":35.325359,"lng":129.019457},{"name":"양산","line":"부산2호선","lat":35.338728,"lng":129.026391},{"name":"수영","line":"부산3호선","lat":35.167753,"lng":129.11459},{"name":"망미","line":"부산3호선","lat":35.171528,"lng":129.108225},{"name":"배산","line":"부산3호선","lat":35.173504,"lng":129.095498},{"name":"물만골","line":"부산3호선","lat":35.176808,"lng":129.085748},{"name":"연산","line":"부산3호선","lat":35.186173,"lng":129.081526},{"name":"거제","line":"부산3호선","lat":35.188589,"lng":129.073941},{"name":"종합운동장","line":"부산3호선","lat":35.19125,"lng":129.067504},{"name":"사직","line":"부산3호선","lat":35.198998,"lng":129.064996},{"name":"미남","line":"부산3호선","lat":35.205503,"lng":129.068061},{"name":"만덕","line":"부산3호선","lat":35.213,"lng":129.036527},{"name":"남산정","line":"부산3호선","lat":35.21334,"lng":129.023928},{"name":"숙등","line":"부산3호선","lat":35.21197,"lng":129.012749},{"name":"덕천","line":"부산3호선","lat":35.210215,"lng":129.005671},{"name":"구포","line":"부산3호선","lat":35.206697,"lng":128.996366},{"name":"강서구청","line":"부산3호선","lat":35.211247,"lng":128.981756},{"name":"체육공원","line":"부산3호선","lat":35.212577,"lng":128.969651},{"name":"대저","line":"부산3호선","lat":35.213386,"lng":128.961049},{"name":"미남","line":"부산4호선","lat":35.207116,"lng":129.069172},{"name":"동래","line":"부산4호선","lat":35.204834,"lng":129.077082},{"name":"수안","line":"부산4호선","lat":35.201828,"lng":129.083806},{"name":"낙민","line":"부산4호선","lat":35.200254,"lng":129.090774},{"name":"충렬사","line":"부산4호선","lat":35.199859,"lng":129.097636},{"name":"명장","line":"부산4호선","lat":35.205143,"lng":129.101517},{"name":"서동","line":"부산4호선","lat":35.213333,"lng":129.107683},{"name":"금사","line":"부산4호선","lat":35.215829,"lng":129.115153},{"name":"반여농산물시장","line":"부산4호선","lat":35.217779,"lng":129.124061},{"name":"석대","line":"부산4호선","lat":35.218112,"lng":129.137179},{"name":"영산대","line":"부산4호선","lat":35.225777,"lng":129.146149},{"name":"윗반송","line":"부산4호선","lat":35.232506,"lng":129.154024},{"name":"고촌","line":"부산4호선","lat":35.236031,"lng":129.160444},{"name":"안평","line":"부산4호선","lat":35.237363,"lng":129.171823},{"name":"설화명곡","line":"대구1호선","lat":35.8521,"lng":128.4876},{"name":"화원","line":"대구1호선","lat":35.8466,"lng":128.5073},{"name":"대곡","line":"대구1호선","lat":35.8443,"lng":128.5199},{"name":"진천","line":"대구1호선","lat":35.8398,"lng":128.5348},{"name":"월배","line":"대구1호선","lat":35.8381,"lng":128.5489},{"name":"상인","line":"대구1호선","lat":35.8368,"lng":128.5614},{"name":"월드컵경기장","line":"대구1호선","lat":35.8393,"lng":128.5749},{"name":"죽전","line":"대구1호선","lat":35.8377,"lng":128.5874},{"name":"감삼","line":"대구1호선","lat":35.8546,"lng":128.5778},{"name":"두류","line":"대구1호선","lat":35.8601,"lng":128.5824},{"name":"내당","line":"대구1호선","lat":35.8658,"lng":128.5831},{"name":"반월당","line":"대구1호선","lat":35.8694,"lng":128.5946},{"name":"중앙로","line":"대구1호선","lat":35.8693,"lng":128.6029},{"name":"대구역","line":"대구1호선","lat":35.8773,"lng":128.606},{"name":"신천","line":"대구1호선","lat":35.8823,"lng":128.6173},{"name":"동대구","line":"대구1호선","lat":35.8793,"lng":128.6278},{"name":"동구청","line":"대구1호선","lat":35.8733,"lng":128.6376},{"name":"아양교","line":"대구1호선","lat":35.8694,"lng":128.6461},{"name":"동촌","line":"대구1호선","lat":35.8743,"lng":128.6574},{"name":"해안","line":"대구1호선","lat":35.8804,"lng":128.6664},{"name":"방촌","line":"대구1호선","lat":35.8847,"lng":128.6738},{"name":"각산","line":"대구1호선","lat":35.8897,"lng":128.6824},{"name":"안심","line":"대구1호선","lat":35.8931,"lng":128.6914},{"name":"문양","line":"대구2호선","lat":35.8176,"lng":128.3986},{"name":"다사","line":"대구2호선","lat":35.8217,"lng":128.4129},{"name":"대실","line":"대구2호선","lat":35.8264,"lng":128.4337},{"name":"강창","line":"대구2호선","lat":35.8302,"lng":128.4543},{"name":"계명대","line":"대구2호선","lat":35.8551,"lng":128.5283},{"name":"성서산업단지","line":"대구2호선","lat":35.8456,"lng":128.5398},{"name":"이곡","line":"대구2호선","lat":35.8528,"lng":128.5477},{"name":"용산","line":"대구2호선","lat":35.8582,"lng":128.5543},{"name":"죽곡","line":"대구2호선","lat":35.8604,"lng":128.5658},{"name":"태평로","line":"대구2호선","lat":35.8626,"lng":128.5742},{"name":"반월당","line":"대구2호선","lat":35.8694,"lng":128.5946},{"name":"경대병원","line":"대구2호선","lat":35.8672,"lng":128.6068},{"name":"대구은행","line":"대구2호선","lat":35.8641,"lng":128.6155},{"name":"범어","line":"대구2호선","lat":35.8601,"lng":128.6276},{"name":"수성구청","line":"대구2호선","lat":35.8558,"lng":128.6374},{"name":"만촌","line":"대구2호선","lat":35.8513,"lng":128.6478},{"name":"담티","line":"대구2호선","lat":35.8496,"lng":128.6614},{"name":"고산","line":"대구2호선","lat":35.8487,"lng":128.6789},{"name":"신매","line":"대구2호선","lat":35.8513,"lng":128.6908},{"name":"사월","line":"대구2호선","lat":35.8553,"lng":128.6984},{"name":"대공원","line":"대구2호선","lat":35.8584,"lng":128.7092},{"name":"벤처밸리","line":"대구2호선","lat":35.8566,"lng":128.7178},{"name":"영남대","line":"대구2호선","lat":35.8384,"lng":128.7468},{"name":"칠곡경대병원","line":"대구3호선","lat":35.9243,"lng":128.5764},{"name":"학정","line":"대구3호선","lat":35.9174,"lng":128.5747},{"name":"동천","line":"대구3호선","lat":35.9113,"lng":128.5755},{"name":"팔거","line":"대구3호선","lat":35.9052,"lng":128.5768},{"name":"공단","line":"대구3호선","lat":35.8991,"lng":128.5779},{"name":"만평","line":"대구3호선","lat":35.8921,"lng":128.5784},{"name":"팔달시장","line":"대구3호선","lat":35.8865,"lng":128.5796},{"name":"원대","line":"대구3호선","lat":35.8812,"lng":128.5814},{"name":"달성공원","line":"대구3호선","lat":35.8754,"lng":128.5814},{"name":"서문시장","line":"대구3호선","lat":35.8699,"lng":128.5862},{"name":"청라언덕","line":"대구3호선","lat":35.8668,"lng":128.5924},{"name":"남산","line":"대구3호선","lat":35.8636,"lng":128.5979},{"name":"명덕","line":"대구3호선","lat":35.8581,"lng":128.6017},{"name":"건들바위","line":"대구3호선","lat":35.8521,"lng":128.6073},{"name":"수성시장","line":"대구3호선","lat":35.8521,"lng":128.6155},{"name":"수성구민운동장","line":"대구3호선","lat":35.8521,"lng":128.6272},{"name":"황금","line":"대구3호선","lat":35.8537,"lng":128.6375},{"name":"수성못","line":"대구3호선","lat":35.8483,"lng":128.6432},{"name":"지산","line":"대구3호선","lat":35.8444,"lng":128.6501},{"name":"범물","line":"대구3호선","lat":35.8413,"lng":128.6574},{"name":"용지","line":"대구3호선","lat":35.8398,"lng":128.6682},{"name":"평동","line":"광주1호선","lat":35.1534,"lng":126.7898},{"name":"도산","line":"광주1호선","lat":35.1537,"lng":126.7994},{"name":"쌍촌","line":"광주1호선","lat":35.1528,"lng":126.8214},{"name":"운천","line":"광주1호선","lat":35.1544,"lng":126.8348},{"name":"상무","line":"광주1호선","lat":35.1558,"lng":126.8474},{"name":"농성","line":"광주1호선","lat":35.1533,"lng":126.8588},{"name":"화정","line":"광주1호선","lat":35.1523,"lng":126.8699},{"name":"소태","line":"광주1호선","lat":35.1523,"lng":126.9332},{"name":"남광주","line":"광주1호선","lat":35.1487,"lng":126.9227},{"name":"문화전당","line":"광주1호선","lat":35.1468,"lng":126.9137},{"name":"금남로4가","line":"광주1호선","lat":35.1469,"lng":126.9104},{"name":"금남로5가","line":"광주1호선","lat":35.1467,"lng":126.9068},{"name":"양동시장","line":"광주1호선","lat":35.1455,"lng":126.9028},{"name":"돌고개","line":"광주1호선","lat":35.1443,"lng":126.8947},{"name":"서광주","line":"광주1호선","lat":35.1435,"lng":126.8863},{"name":"공항","line":"광주1호선","lat":35.1234,"lng":126.8108},{"name":"광주송정","line":"광주1호선","lat":35.1378,"lng":126.7922},{"name":"녹동","line":"광주1호선","lat":35.1436,"lng":126.9388},{"name":"용산","line":"광주1호선","lat":35.1447,"lng":126.9448},{"name":"시청","line":"광주1호선","lat":35.1578,"lng":126.8842},{"name":"광주터미널","line":"광주1호선","lat":35.1588,"lng":126.8943},{"name":"판암","line":"대전1호선","lat":36.3155,"lng":127.4481},{"name":"신흥","line":"대전1호선","lat":36.3187,"lng":127.4395},{"name":"대동","line":"대전1호선","lat":36.3215,"lng":127.4318},{"name":"용운","line":"대전1호선","lat":36.3241,"lng":127.4248},{"name":"대전시청","line":"대전1호선","lat":36.3508,"lng":127.3862},{"name":"탄방","line":"대전1호선","lat":36.3438,"lng":127.3853},{"name":"시청","line":"대전1호선","lat":36.3508,"lng":127.3862},{"name":"갈마","line":"대전1호선","lat":36.3521,"lng":127.3754},{"name":"월평","line":"대전1호선","lat":36.3541,"lng":127.3638},{"name":"갑천","line":"대전1호선","lat":36.3562,"lng":127.3528},{"name":"유성온천","line":"대전1호선","lat":36.3594,"lng":127.3418},{"name":"봉명","line":"대전1호선","lat":36.3642,"lng":127.3358},{"name":"구암","line":"대전1호선","lat":36.3697,"lng":127.3309},{"name":"현충원","line":"대전1호선","lat":36.3752,"lng":127.3262},{"name":"반석","line":"대전1호선","lat":36.3824,"lng":127.3198},{"name":"중앙로","line":"대전1호선","lat":36.3286,"lng":127.4265},{"name":"대전역","line":"대전1호선","lat":36.3323,"lng":127.4344},{"name":"서대전네거리","line":"대전1호선","lat":36.3262,"lng":127.4134},{"name":"오룡","line":"대전1호선","lat":36.3234,"lng":127.4063},{"name":"용문","line":"대전1호선","lat":36.3293,"lng":127.3987},{"name":"정부청사","line":"대전1호선","lat":36.3382,"lng":127.3926},{"name":"노은","line":"대전1호선","lat":36.3853,"lng":127.3396},{"name":"지족","line":"대전1호선","lat":36.3876,"lng":127.3496}];

// ── 욕설 필터 ────────────────────────────────────────────
const BAD_WORDS = ['시발','씨발','시팔','씨팔','ㅅㅂ','ㅄ','병신','ㅂㅅ','개새','새끼','새기','색끼',
  '좆','존나','지랄','ㅈㄹ','꺼져','닥쳐','엿먹','미친놈','미친년','또라이','등신','멍청',
  '죽어','뒤져','뒈져','개같','개소리','걸레','창녀','느금','니애미','니미','애미','애비',
  'fuck','shit','bitch','한남','한녀','김치녀','된장녀','맘충','틀딱','급식충'];
function hasBadWord(t) {
  if (!t) return false;
  const s = String(t).toLowerCase().replace(/\s+/g, '');
  return BAD_WORDS.some(b => s.includes(b.toLowerCase()));
}

// ── CORS 헤더 ────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ══════════════════════════════════════════════════════════
// 맛집 크롤링: 카카오 장소검색 API
// ══════════════════════════════════════════════════════════
async function fetchKakaoPlaces(lat, lng) {
  // FD4=음식점, CE7=카페 두 번 호출 후 합치기
  const categories = ['FD4', 'CE7'];
  let all = [];

  for (const cat of categories) {
    const url = `https://dapi.kakao.com/v2/local/search/category.json` +
      `?category_group_code=${cat}` +
      `&x=${lng}&y=${lat}` +
      `&radius=500` +
      `&sort=popularity` +
      `&size=10`;

    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `KakaoAK ${KAKAO_KEY}` }
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.documents) all = all.concat(data.documents);
    } catch (e) {
      console.error(`카카오 API 오류 (${cat}):`, e);
    }
  }

  // 중복 제거 (place_id 기준) + 거리순 정렬
  const seen = new Set();
  return all
    .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .sort((a, b) => parseInt(a.distance) - parseInt(b.distance))
    .slice(0, 15);
}

// ══════════════════════════════════════════════════════════
// 크론: 매일 새벽 3시 — 전국 역 맛집 수집
// ══════════════════════════════════════════════════════════
async function crawlAllStations(env) {
  console.log(`[크론] 맛집 수집 시작: ${ALL_STATIONS.length}개 역`);

  // D1 테이블 생성 (없으면)
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_name TEXT NOT NULL,
      place_id TEXT NOT NULL,
      place_name TEXT NOT NULL,
      category_name TEXT,
      address_name TEXT,
      road_address_name TEXT,
      distance INTEGER DEFAULT 0,
      place_url TEXT,
      lat REAL,
      lng REAL,
      updated_at INTEGER NOT NULL,
      UNIQUE(station_name, place_id)
    )
  `).run();

  let success = 0, fail = 0;

  for (const stn of ALL_STATIONS) {
    try {
      const places = await fetchKakaoPlaces(stn.lat, stn.lng);
      const now = Date.now();

      // 기존 데이터 삭제 후 새로 삽입
      await env.DB.prepare(
        'DELETE FROM restaurants WHERE station_name = ?'
      ).bind(stn.name).run();

      for (const p of places) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO restaurants
            (station_name, place_id, place_name, category_name,
             address_name, road_address_name, distance, place_url,
             lat, lng, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          stn.name,
          p.id,
          p.place_name,
          p.category_name || '',
          p.address_name || '',
          p.road_address_name || '',
          parseInt(p.distance) || 0,
          p.place_url || '',
          parseFloat(p.y) || 0,
          parseFloat(p.x) || 0,
          now
        ).run();
      }

      success++;

      // API 호출 제한 방지: 역 사이 50ms 대기
      await new Promise(r => setTimeout(r, 50));

    } catch (e) {
      console.error(`[크론] ${stn.name} 실패:`, e);
      fail++;
    }
  }

  console.log(`[크론] 완료 — 성공: ${success}, 실패: ${fail}`);
  return { success, fail, total: ALL_STATIONS.length };
}

// ══════════════════════════════════════════════════════════
// fetch 핸들러
// ══════════════════════════════════════════════════════════
export default {

  // ── 크론 트리거 (매일 새벽 3시 KST = UTC 18:00) ──────────
  async scheduled(event, env, ctx) {
    ctx.waitUntil(crawlAllStations(env));
  },

  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {

      // ══════════════════════════════════════════════════
      // 🍽️ 맛집 조회 (D1 캐시)
      // GET /kakao-food?station=계산
      // ══════════════════════════════════════════════════
      if (path === '/kakao-food' && method === 'GET') {
        const stationName = url.searchParams.get('station');
        const category    = url.searchParams.get('cat') || '전체';

        if (!stationName) return json({ error: 'station 파라미터 필요' }, 400);

        // D1에서 조회
        let q, binds;
        if (category !== '전체') {
          // 카테고리 필터
          const catMap = {
            '카페':  '%카페%',
            '일식':  '%일식%',
            '중식':  '%중식%',
            '양식':  '%양식%',
            '술집':  '%술집%',
            '분식':  '%분식%',
            '한식':  '%한식%',
          };
          const like = catMap[category] || '%' + category + '%';
          q = `SELECT * FROM restaurants
               WHERE station_name = ? AND category_name LIKE ?
               ORDER BY distance ASC LIMIT 15`;
          binds = [stationName, like];
        } else {
          q = `SELECT * FROM restaurants
               WHERE station_name = ?
               ORDER BY distance ASC LIMIT 15`;
          binds = [stationName];
        }

        const { results } = await env.DB.prepare(q).bind(...binds).all();

        // 데이터 없으면 실시간 카카오 호출 후 저장
        if (!results || results.length === 0) {
          // 역 좌표 찾기
          const stn = ALL_STATIONS.find(s => s.name === stationName);
          if (!stn) return json({ restaurants: [], cached: false, error: '역 정보 없음' });

          const places = await fetchKakaoPlaces(stn.lat, stn.lng);
          const now = Date.now();

          // D1에 저장
          try {
            await env.DB.prepare(`
              CREATE TABLE IF NOT EXISTS restaurants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                station_name TEXT NOT NULL,
                place_id TEXT NOT NULL,
                place_name TEXT NOT NULL,
                category_name TEXT,
                address_name TEXT,
                road_address_name TEXT,
                distance INTEGER DEFAULT 0,
                place_url TEXT,
                lat REAL,
                lng REAL,
                updated_at INTEGER NOT NULL,
                UNIQUE(station_name, place_id)
              )
            `).run();

            for (const p of places) {
              await env.DB.prepare(`
                INSERT OR REPLACE INTO restaurants
                  (station_name, place_id, place_name, category_name,
                   address_name, road_address_name, distance, place_url,
                   lat, lng, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                stationName, p.id, p.place_name, p.category_name || '',
                p.address_name || '', p.road_address_name || '',
                parseInt(p.distance) || 0, p.place_url || '',
                parseFloat(p.y) || 0, parseFloat(p.x) || 0, now
              ).run();
            }
          } catch (e) { console.error('D1 저장 오류:', e); }

          return json({ restaurants: places, cached: false });
        }

        return json({
          restaurants: results,
          cached: true,
          updated_at: results[0]?.updated_at
        });
      }

      // ══════════════════════════════════════════════════
      // 🔧 수동 크롤링 트리거 (관리자용)
      // GET /admin/crawl-food
      // ══════════════════════════════════════════════════
      if (path === '/admin/crawl-food' && method === 'GET') {
        const result = await crawlAllStations(env);
        return json({ ok: true, ...result });
      }

      // ══════════════════════════════════════════════════
      // 💬 톡 조회
      // ══════════════════════════════════════════════════
      if (path === '/talks' && method === 'GET') {
        const after = parseInt(url.searchParams.get('after') || '0');
        const { results } = await env.DB.prepare(
          'SELECT id, nick, text, ts FROM talks WHERE ts > ? ORDER BY ts DESC LIMIT 50'
        ).bind(after).all();
        return json({ talks: results.reverse() });
      }

      // ══════════════════════════════════════════════════
      // 💬 톡 등록
      // ══════════════════════════════════════════════════
      if (path === '/talks' && method === 'POST') {
        const { nick, text } = await request.json();
        if (!nick || !text) return json({ error: 'nick/text 필요' }, 400);
        if (hasBadWord(nick) || hasBadWord(text)) return json({ error: '욕설·비방 차단' }, 400);
        const ts = Date.now();
        await env.DB.prepare('INSERT INTO talks (nick, text, ts) VALUES (?, ?, ?)')
          .bind(String(nick).slice(0, 12), String(text).slice(0, 100), ts).run();
        await env.DB.prepare(
          'DELETE FROM talks WHERE id NOT IN (SELECT id FROM talks ORDER BY ts DESC LIMIT 200)'
        ).run();
        return json({ ok: true, ts });
      }

      // ══════════════════════════════════════════════════
      // 📋 게시글 목록
      // ══════════════════════════════════════════════════
      if (path === '/posts' && method === 'GET') {
        const cat = url.searchParams.get('cat');
        let q, binds;
        if (cat && cat !== 'all') {
          q = 'SELECT * FROM posts WHERE cat = ? ORDER BY ts DESC LIMIT 50';
          binds = [cat];
        } else {
          q = 'SELECT * FROM posts ORDER BY ts DESC LIMIT 50';
          binds = [];
        }
        const stmt = env.DB.prepare(q);
        const { results } = await (binds.length ? stmt.bind(...binds) : stmt).all();
        return json({ posts: results });
      }

      // ══════════════════════════════════════════════════
      // 📋 게시글 등록
      // ══════════════════════════════════════════════════
      if (path === '/posts' && method === 'POST') {
        const { nick, title, body, cat } = await request.json();
        if (!nick || !title || !body) return json({ error: 'nick/title/body 필요' }, 400);
        if (hasBadWord(nick) || hasBadWord(title) || hasBadWord(body))
          return json({ error: '욕설·비방 차단' }, 400);
        const ts = Date.now();
        const r = await env.DB.prepare(
          'INSERT INTO posts (nick, title, body, cat, ts) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          String(nick).slice(0, 12), String(title).slice(0, 100),
          String(body).slice(0, 2000), cat || '잡담', ts
        ).run();
        return json({ ok: true, id: r.meta.last_row_id, ts });
      }

      // ══════════════════════════════════════════════════
      // 👍 반응 (좋아요/웃김/슬픔)
      // ══════════════════════════════════════════════════
      if (path === '/react' && method === 'POST') {
        const { id, type } = await request.json();
        const col = { like: 'likes', lol: 'lols', sad: 'sads' }[type];
        if (!id || !col) return json({ error: '잘못된 요청' }, 400);
        await env.DB.prepare(`UPDATE posts SET ${col} = ${col} + 1 WHERE id = ?`)
          .bind(id).run();
        return json({ ok: true });
      }

      return json({ error: 'Not found' }, 404);

    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};
