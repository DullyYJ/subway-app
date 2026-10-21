// 뉴스 화면 엔진(engine/news.js) 시험.  실행: node test/news_engine.test.js   (javac · java 필요 — 앱 검증기로 같은 JSON 을 읽어 본다)
//  ① cap 5 미만이면 만들지 않는다 ② 분류·디코드·요약 정리·언론사 이름·'N분 전'이 웹 함수와 같다(표본 대조) ③ 거르기(잡음·중복)·'전체' 골고루·3일 컷·정렬·번호
//  ④ 빈 상태 문구 ⑤ 상세 문구 ⑥ 여러 상태에서 만든 화면이 앱 검증기(ScreenCore.load)를 모두 통과 ⑦ 워커 내장 사본 ⑧ 워커 끝에서 끝까지(POST /screen/news) ⑨ 웹 연결부가 엔진 규약을 지키는가
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), { spawnSync } = require('child_process');
const E = require('../engine/news');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');
const NOW = Date.UTC(2026, 9, 18, 3, 0, 0);
const MIN = 60000, HR = 3600000, DAY = 24 * HR;

// ── ② 웹 함수 대조 ──
{
  const grab = (re, label) => { const m = re.exec(html); ok(!!m, '웹에서 찾았다: ' + label); return m ? m[0] : ''; };
  const src = [
    grab(/var _NEWS_CATS = \[[^\]]*\];/, '_NEWS_CATS'),
    grab(/var _NEWS_RULES = \[[\s\S]*?\n\];/, '_NEWS_RULES'),
    grab(/function _newsRuleCat\(text\)\{[\s\S]*?\n\}\n/, '_newsRuleCat'),
    grab(/function _newsClassify\(it\)\{[\s\S]*?\n\}\n/, '_newsClassify'),
    grab(/var _NEWS_NOISE = .*;/, '_NEWS_NOISE'),
    grab(/function _newsNoise\(title\)\{[\s\S]*?\n\}\n/, '_newsNoise'),
    grab(/var _NEWS_POLICY = \{[\s\S]*?\n\};/, '_NEWS_POLICY'),
    grab(/var _HTML_ENT = \{[\s\S]*?\n\};/, '_HTML_ENT'),
    grab(/function _htmlDecode\(str\)\{[\s\S]*?\n\}\n/, '_htmlDecode'),
    grab(/function _newsCleanDesc\(raw\)\{[\s\S]*?\n\}\n/, '_newsCleanDesc'),
    grab(/function _newsSourceLabel\(it\)\{[\s\S]*?\n\}\n/, '_newsSourceLabel'),
    grab(/function _newsAgo\(ts\)\{[\s\S]*?\n\}\n/, '_newsAgo')
  ].join('\n');
  const ctx = { window: {}, Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }, URL, console };
  vm.createContext(ctx);
  vm.runInContext(src + ';this.W={cl:_newsClassify,rc:_newsRuleCat,dec:_htmlDecode,cd:_newsCleanDesc,sl:_newsSourceLabel,ago:_newsAgo,noise:_newsNoise,cats:_NEWS_CATS}', ctx);
  const W = ctx.W;
  ok(JSON.stringify(W.cats) === JSON.stringify(E.NW_CATS), '칩 목록이 웹과 같다');
  const titles = ['코스피 2,700 돌파 외국인 순매수', '손흥민 시즌 10호골', '아이유 새 앨범 컴백', '대통령 국회 시정연설', '기준금리 동결 한국은행', '엔비디아 신제품 공개 AI 반도체', '서울 도심 화재 사고 발생', '뉴욕증시 나스닥 상승 마감', '오늘의 날씨 맑음', '삼성전자 주가 상승', '부동산 전세 대출 규제', '프로야구 KBO 한국시리즈', '', '[연합뉴스 이 시각 헤드라인]'];
  const descs = ['', '코스피 이야기', '야구 소식 프로야구', '(서울=연합뉴스) 홍길동 기자 = 오늘 날씨는 맑겠다.'];
  const srv = ['', '사회', '증시', '문화', '국제', 'IT', '과학', '이상한값', '스포츠'];
  let n = 0;
  titles.forEach(ti => descs.forEach(de => srv.forEach(sv => { n++; const a = W.cl({ title: ti, desc: de, cat: sv }), b = E.nwClassify({ title: ti, desc: de, cat: sv }); if (a !== b) ok(false, '분류 다름: ' + ti + '|' + de + '|' + sv + ' web=' + a + ' eng=' + b); })));
  ok(true, '분류 ' + n + '건 대조'); pass += 0;
  titles.forEach(ti => ok(W.noise(ti) === E.nwNoise(ti), '잡음 판정 같음: ' + ti));
  ['&apos;따옴표&apos;', '&amp;apos;이중&amp;apos;', '&#039;숫자&#039; &#x27;16진&#x27;', '&lt;b&gt;태그&lt;/b&gt;', '그냥 글', '', '&nbsp;공백&middot;점&hellip;'].forEach(s => ok(W.dec(s) === E.nwDecode(s), '디코드 같음: ' + s));
  ['<p>(서울=연합뉴스) 홍길동 기자 = 정부는 오늘 새로운 대책을 발표했다고 밝혔다.</p>', '짧아', '[앵커] 오늘 저녁 날씨를 전해 드립니다. 전국이 대체로 맑겠습니다.', 'a'.repeat(400), '&lt;b&gt;굵은&lt;/b&gt; 요약 글이 길게 이어지는 문장입니다 정말 길게'].forEach(s => ok(W.cd(s) === E.nwCleanDesc(s), '요약 정리 같음: ' + s.slice(0, 20)));
  [{ source: '조선일보', link: 'https://x.com/a' }, { source: '', link: 'https://www.yna.co.kr/view/1' }, { source: '뉴스', link: 'https://m.mk.co.kr/n/2' }, { source: '', link: 'https://unknown.example.org/a' }, { source: '', link: 'bad' }, {}].forEach(it => ok(W.sl(it) === E.nwSourceLabel(it), '언론사 이름 같음: ' + JSON.stringify(it)));
  [20 * 1000, 59 * 1000, 5 * MIN, 59 * MIN, 61 * MIN, 5 * HR, 23 * HR, 25 * HR, 3 * DAY].forEach(d => ok(W._ago === undefined && W.ago(NOW - d) === E.nwAgo(NOW - d, NOW), 'N분 전 같음: ' + d));
}

// ── ① cap ──
const ROWS = [
  ['코스피 2,700 돌파', 'https://a.example/1', '연합뉴스', NOW - 5 * MIN, '사회', ''],
  ['뉴욕증시 상승 마감', 'https://a.example/2', '', NOW - 20 * MIN, '증시', ''],
  ['손흥민 시즌 10호골', 'https://a.example/3', '뉴스1', NOW - 1 * HR, '스포츠', ''],
  ['아이유 새 앨범 컴백', 'https://a.example/4', '', NOW - 2 * HR, '연예', ''],
  ['기준금리 동결', 'https://a.example/5', '', NOW - 3 * HR, '경제', ''],
  ['화재 사고 발생', 'https://a.example/6', '', NOW - 4 * HR, '', ''],
  ['오래된 증시 기사 코스피', 'https://a.example/7', '', NOW - 5 * DAY, '증시', ''],
  ['[연합뉴스 이 시각 헤드라인]', 'https://a.example/8', '', NOW - 1 * MIN, '사회', ''],
  ['코스피 2,700  돌파', 'https://a.example/9', '', NOW - 6 * MIN, '증시', ''],       // 공백만 다른 같은 제목 → 중복
  ['다른 제목 같은 링크', 'https://a.example/3', '', NOW - 7 * MIN, '사회', ''],         // 같은 링크 → 중복
  ['', 'https://a.example/10', '', NOW, '', ''],                                         // 제목 없음
  [123, 'x'],                                                                            // 이상한 줄
  '문자열'
];
const S = E.newsScreen({ cap: 5, now: NOW }, { cat: '전체' }, ROWS);
const newsN = o => o.body.filter(x => x.t === 'news');
ok(E.newsScreen({ cap: 4, now: NOW }, {}, ROWS).ok === false && E.newsScreen({}, {}, ROWS).ok === false && E.newsScreen(null, null, null).ok === false, 'cap 5 미만이면 만들지 않는다');
ok(S.ok && S.v === 1 && S.screen === 'news' && S.cover === 'tab' && /^n1:/.test(S.rev), '기본 모양');

// ── ③ 거르기·골고루·3일 컷·번호 ──
{
  const ns = newsN(S);
  ok(ns.every(n => n.t === 'news' && /^nw\.\d+$/.test(n.act.v) && n.act.a === 'call'), '모든 줄이 nw.<번호> 행동');
  const titles = ns.map(n => n.title);
  ok(!titles.some(t => /이 시각 헤드라인/.test(t)), '묶음 기사는 뺀다');
  ok(titles.filter(t => /코스피 2,700/.test(t)).length === 1, '공백만 다른 같은 제목은 한 번만');
  ok(!titles.includes('다른 제목 같은 링크'), '같은 링크는 한 번만');
  ok(!titles.includes('오래된 증시 기사 코스피'), "'전체'는 3일 넘은 기사를 뺀다");
  ok(S.info.all === 7 && S.info.n === ns.length && ns.length === 6, '정보: 거른 뒤 기사 수 ' + JSON.stringify(S.info));
  const idx = ns.map(n => Number(n.act.v.slice(3)));
  ok(idx.every(i => ROWS[i] && Array.isArray(ROWS[i])) && ns[0].title === '코스피 2,700 돌파' && ns[0].act.v === 'nw.0', '번호 = 보낸 배열의 원래 위치');
  // ── 고유 id: 목록이 바뀐 뒤에 눌러도 같은 기사가 열리도록 순번이 아니라 기사의 고유 식별(링크, 없으면 제목)을 싣는다 ──
  ok(ns.every(n => typeof n.act.id === 'string' && n.act.id.length > 0 && n.act.id.length <= 400 && typeof n.act.t === 'string' && n.act.t === n.title.slice(0, 160)), '모든 줄의 행동에 id · 제목');
  ok(ns.every(n => { const r = ROWS[Number(n.act.v.slice(3))]; return n.act.id === (r[1] || n.title); }), 'id = 링크(없으면 제목) — 순번과 같은 줄을 가리킨다');
  const shuffled = ROWS.slice().reverse(), S2 = E.newsScreen({ cap: 5, now: NOW }, { cat: '전체' }, shuffled);
  const byId = o => new Map(newsN(o).map(n => [n.act.id, n.title]));
  const m1 = byId(S), m2 = byId(S2);
  ok(m1.size === newsN(S).length && [...m2].filter(([id, t]) => m1.get(id) === t).length >= 4, '보낸 순서가 달라도 같은 기사는 같은 id(같은 링크의 중복 기사만 어느 쪽이 남느냐가 다르다)');
  const subs = ns.map(n => n.sub);
  ok(subs[0] === '증시 · 5분 전', '작은 글: 분류 · N분 전 → ' + subs[0]);
  // 골고루: 처음 몇 개는 서로 다른 분류
  const cats = ns.map(n => n.sub.split(' · ')[0]);
  ok(new Set(cats.slice(0, 5)).size === 5, "'전체'는 분류를 돌아가며 뽑는다 " + cats.join(','));
  const sc = E.newsScreen({ cap: 5, now: NOW }, { cat: '증시' }, ROWS), sn = newsN(sc);
  ok(sn.length === 3 && sn[0].title === '코스피 2,700 돌파' && sn[1].title === '뉴욕증시 상승 마감' && /오래된/.test(sn[2].title), '증시 칩: 기간 제한 없이 최신순 전부 ' + sn.map(n => n.title).join('|'));
  ok(sn[2].sub === '증시 · 5일 전', '5일 전 문구');
  ok(sc.head[0].items.filter(i => i.on).length === 1 && sc.head[0].items.find(i => i.on).label === '증시' && sc.head[0].items.map(i => i.label).join() === E.NW_CATS.join(), '칩 줄: 고른 칩만 켜짐');
  ok(sc.head[0].onc === 'gold' && sc.head[0].onfg === '#121214', '칩 켜진 색');
  const all = []; for (let i = 0; i < 500; i++) all.push(['증시 코스피 기사 ' + i, 'https://b.example/' + i, '', NOW - i * MIN, '증시', '']);
  ok(newsN(E.newsScreen({ cap: 5, now: NOW }, { cat: '증시' }, all)).length === 300, '한 번에 300줄까지');
  ok(newsN(E.newsScreen({ cap: 5, now: NOW }, { cat: '전체' }, all)).length === 200, "'전체'는 200줄까지");
  const bad = E.newsScreen({ cap: 5, now: NOW }, { cat: '없는칩' }, ROWS);
  ok(bad.info.cat === '전체', '모르는 칩은 전체');
  const withEnt = newsN(E.newsScreen({ cap: 5, now: NOW }, { cat: '전체' }, [['&apos;따옴표&apos; 코스피 &amp; 환율', 'https://c.example/1', '', NOW - MIN, '', '']]));
  ok(withEnt[0].title === "'따옴표' 코스피 & 환율", '제목의 HTML 글자 코드는 엔진이 푼다 ' + withEnt[0].title);
  const noTs = newsN(E.newsScreen({ cap: 5, now: NOW }, { cat: '전체' }, [['시각 없는 기사 코스피', 'https://c.example/2', '', 0, '', '']]));
  ok(noTs[0].sub === '증시 · 방금', '시각이 없으면 지금으로 본다 ' + noTs[0].sub);
  ok(E.newsScreen({ cap: 5, now: NOW }, { cat: '전체' }, ROWS).rev === S.rev && E.newsScreen({ cap: 5, now: NOW + DAY }, { cat: '전체' }, ROWS).rev !== S.rev, '같은 입력 → 같은 rev, 시간이 지나면 달라짐');
}

// ── ④ 빈 상태 ──
{
  const t = (cat, rows) => { const o = E.newsScreen({ cap: 5, now: NOW }, { cat }, rows); return o.body.map(n => n.s || '').join('|'); };
  ok(t('전체', []) === '뉴스 불러오는 중...' && t('증시', []) === '증시 뉴스를 불러오는 중...' && t('연예', null) === '연예 뉴스를 불러오는 중...', '기사가 없으면 불러오는 중 안내(이모지 없이)');
  ok(t('IT', ROWS) === 'IT 뉴스를 불러오는 중...', '그 분류 기사가 없을 때도 같은 안내');
}

// ── ⑤ 상세 문구 ──
{
  const d = E.newsDetail({ cap: 5, now: NOW }, ['손흥민 시즌 10호골', 'https://www.yna.co.kr/view/9', '', NOW - 3 * MIN, '', '<p>(서울=연합뉴스) 홍길동 기자 = 손흥민이 시즌 10호골을 터뜨리며 팀의 승리를 이끌었다.</p>']);
  ok(d.ok && d.detail.cat === '스포츠' && d.detail.title === '손흥민 시즌 10호골' && d.detail.meta === '3분 전 · 연합뉴스' && d.detail.src === '연합뉴스' && d.detail.btn === '연합뉴스 원문 보기 ›' && d.detail.open === 1, '상세: 분류·제목·시간·언론사·단추 ' + JSON.stringify(d.detail));
  ok(d.detail.desc.indexOf('<p>') < 0 && d.detail.desc.startsWith('손흥민이') && d.detail.empty === '', '요약 정리(태그·기자 서두 제거)');
  ok(/출처 · 연합뉴스\n제목과 요약은 발췌이며 저작권은 해당 언론사에 있습니다/.test(d.detail.notice), '출처 안내');
  const e = E.newsDetail({ cap: 5, now: NOW }, ['제목만 있는 기사', 'javascript:alert(1)', '네이버', NOW, '', '']);
  ok(e.ok && e.detail.desc === '' && /요약을 제공하지 않아요/.test(e.detail.empty) && e.detail.open === 0, '요약이 없으면 안내 글 · http 가 아닌 링크는 열기 단추 없음');
  ok(E.newsDetail({ cap: 4 }, ['a']).ok === false && E.newsDetail({ cap: 5 }, null).ok === false && E.newsDetail({ cap: 5 }, ['']).ok === false, '상세: cap 부족·이상한 입력은 거절');
}

// ── ⑥ 앱 검증기(ScreenCore.load)를 통과하는가 ──
{
  const lines = [];
  for (const cat of E.NW_CATS) for (const data of [0, 1, 2]) {
    const rows = data === 0 ? [] : data === 1 ? ROWS : (() => { const a = []; for (let i = 0; i < 600; i++) a.push(['아주 긴 기사 제목 ' + i + ' 코스피 주가 환율 금리 야구 드라마 국회 화재 인공지능 ' + '가나다라마바사'.repeat(8), 'https://z.example/' + i, '언론사', NOW - i * 7 * MIN, ['', '사회', '증시', '연예'][i % 4], '']); return a; })();
    lines.push(JSON.stringify(E.newsScreen({ cap: 5, now: NOW }, { cat }, rows)));
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'newschk_'));
  try {
    const f = path.join(dir, 'in.jsonl'), cls = path.join(dir, 'c');
    fs.writeFileSync(f, lines.join('\n') + '\n'); fs.mkdirSync(cls);
    const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '' });
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', cls, R('native/shell/ScreenCore.java'), R('test/java/ScreenCheck.java')], { env: ENV, encoding: 'utf8' });
    ok(r.status === 0, 'ScreenCheck 컴파일 ' + (r.stderr || '').slice(0, 300));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', cls, 'com.dullyyj.subway.ScreenCheck', f], { env: ENV, encoding: 'utf8' });
    const out = (r.stdout || '').split('\n').filter(Boolean);
    ok(out.length === lines.length, '모든 화면에 결과가 나왔다 ' + out.length + '/' + lines.length);
    ok(out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + out.filter(l => !l.startsWith('OK ')).slice(0, 3).join(' | '));
    ok(out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음(앱이 모든 노드를 안다)');
    ok(out.some(l => Number(l.split(' ')[3]) > 10000), '큰 목록의 본문 높이 ' + out.map(l => l.split(' ')[3]).join(','));
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } }
}

// ── ⑦ 워커 내장 사본 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== NEWS ENGINE BEGIN =====', me = '// ===== NEWS ENGINE END =====';
  const i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 뉴스 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/news.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0, '워커 내장 사본이 engine/news.js 와 같다');
  ok(body.indexOf(esc(fs.readFileSync(R('engine/news-worker.js'), 'utf8').trimEnd())) >= 0, '워커 연결부도 같다');
  ok(w.indexOf('if (url.pathname === "/screen/news") return handleScreenNews(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  const names = (t, re) => (t.match(re) || []);
  const other = w.slice(0, i) + w.slice(j);
  ok(['newsScreen', 'newsDetail', 'nwList', 'nwPick', 'nwDecode', 'nwClassify', 'NW_RULES', 'NW_CATS', 'NEWS_SCREEN_V'].every(n => names(other, new RegExp('(function|var)\\s+' + n + '\\b', 'g')).length === 0), '다른 엔진과 이름이 겹치지 않는다');
}

// ── ⑨ 웹 연결부 규약 ──
{
  const has = t => html.indexOf(t) >= 0;
  ok(has('window._scrNews = {') && has("var BASE = ((typeof _ROUTE_V2_BASE === 'string' && _ROUTE_V2_BASE) ? _ROUTE_V2_BASE : 'https://route-v2.phg0643.workers.dev') + '/screen/news';"), '웹: 뉴스 연결부 + 엔진 주소');
  ok(has("headers: { 'Content-Type': 'text/plain;charset=UTF-8' }"), '웹: 사전 요청이 필요 없게 text/plain 으로 보낸다');
  ok(has('"cap":5,"f":{"cat":') && has('cap: 5, d: row'), '웹: 규격 수준 5를 알린다(목록·상세)');
  ok(has("addListener('action', onAction)") && has("/^nw\\.(\\d+)$/"), '웹: cat · 기사 번호 행동만 처리');
  ok(has('id="scrnSetCard"') && has('onchange="_scrnSetUse(this.checked)"') && has("key === 'f.scrn'") && has('f.feat.scrn'), '웹: 설정 스위치(기본 꺼짐) + 설정 화면 연결');
  ok(has('window._scrNews.closeDetail()') && has('window._scrNews.kick()') && has('window._scrNews.changed()') && has('window._scrNews.owns()'), '웹: 뒤로가기 · 탭/칩 전환 · 기사 갱신 · 웹 목록 쉼');
  const g = html.slice(html.indexOf('서버 구동 네이티브 화면 4호: 커뮤니티 > 뉴스'));
  const glue = g.slice(0, g.indexOf('window._scrNews = {'));
  ok(!/_newsClassify|_newsRuleCat|_newsAgo|_htmlDecode|_newsCleanDesc|_newsSourceLabel|_NEWS_RULES/.test(glue.replace(/\/\/.*$/gm, '')), '웹: 연결부 안에서 분류·시간·요약·언론사 계산을 하지 않는다(엔진 몫)');
}

// ── ⑩ s67: 한 요청으로 모든 칩 화면(alts) ──
{
  const rows = []; for (let i = 0; i < 80; i++) rows.push([['코스피 급등 기사 ', '삼성 실적 발표 ', '정부 경제 대책 ', '손흥민 골 소식 ', '국회 정치 공방 ', '아이돌 신곡 공개 ', '네이버 AI 신기능 ', '시청 사회 사건 '][i % 8] + i, 'https://n.example/' + i, '언론' + (i % 3), NOW - i * 7 * MIN, '', i % 5 === 0 ? '요약 글 ' + i : '']);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = E.newsScreens({ cap: 5, now: NOW }, { cat: '증시' }, rows, 'chips');
  ok(out.ok && out.alts && Object.keys(out.alts).join() === E.NW_CATS.join(), 'alts: 칩 전부(엔진이 가진 칩 이름이 키)');
  E.NW_CATS.forEach(c => ok(same(out.alts[c], E.newsScreen({ cap: 5, now: NOW }, { cat: c }, rows)), 'alts[' + c + '] = 그 칩으로 따로 요청한 화면과 글자 하나까지 같다'));
  const plain = Object.assign({}, out); delete plain.alts;
  ok(same(plain, E.newsScreen({ cap: 5, now: NOW }, { cat: '증시' }, rows)), 'alts 를 빼면 예전 응답과 같다(현재 칩 화면)');
  ok(E.newsScreens({ cap: 5, now: NOW }, { cat: '증시' }, rows).alts === undefined, 'alts 를 달라고 하지 않으면 없다');
  const ex = E.newsScreens({ cap: 5, now: NOW }, { cat: '전체' }, rows, { a: { cat: '경제' }, b: { cat: '이상한칩' }, c: 5, d: null });
  ok(Object.keys(ex.alts).join() === 'a,b' && same(ex.alts.a, E.newsScreen({ cap: 5, now: NOW }, { cat: '경제' }, rows)) && ex.alts.b.info.cat === '전체', 'alts 직접 지정: 키는 앱이 정한다 · 모르는 칩은 전체 · 이상한 값은 건너뜀');
  const many = {}; for (let i = 0; i < 40; i++) many['k' + i] = { cat: '증시' };
  ok(Object.keys(E.newsScreens({ cap: 5, now: NOW }, {}, rows, many).alts).length === 12, 'alts 개수 상한 12');
  ok(E.newsScreens({ cap: 4, now: NOW }, {}, rows, 'chips').ok === false, 'cap 부족이면 alts 도 만들지 않는다');
  ok(E.newsScreens({ cap: 5, now: NOW }, {}, rows, [1, 2]).alts === undefined, '배열 alts 는 무시');
  const t0 = Date.now(); const bigRows = []; for (let i = 0; i < 1200; i++) bigRows.push(['코스피 주가 기사 제목 ' + i + ' 가나다라마바사아자차카타파하', 'https://news.example.com/a/' + i, '언론' + (i % 9), NOW - i * MIN, ['', '사회', '증시'][i % 3], '']);
  E.newsScreens({ cap: 5, now: NOW }, { cat: '전체' }, bigRows, 'chips');
  ok(Date.now() - t0 < 1500, '큰 목록(1200건)에서 8칩을 한 번에: ' + (Date.now() - t0) + 'ms');
  // 앱 검증기가 alts 의 모든 화면을 통과시키는가 — 위 ⑥ 구간의 검증 도구를 쓰지 않고 구조만 본다(각 화면은 따로 요청한 것과 같으므로 이미 검증된 것)
  ok(E.NW_CATS.every(c => out.alts[c].head[0].items.filter(x => x.on).length === 1 && out.alts[c].head[0].items.find(x => x.on).label === c), 'alts 화면마다 켜진 칩이 자기 칩');
}

// ── ⑧ 워커 끝에서 끝까지 ──
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_news_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp), w = mod.default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/news', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const nowRows = [['코스피 2,700 돌파', 'https://a.example/1', '연합뉴스', Date.now() - 5 * MIN, '사회', ''], ['손흥민 골', 'https://a.example/2', '', Date.now() - HR, '', '']];
    const r = await post(JSON.stringify({ cap: 5, f: { cat: '전체' }, n: nowRows })), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'news' && newsN(j).length === 2, '워커 응답 200');
    ok(/route-v2-2026-10-\d\ds\d\d/.test(j.ver), '엔진 버전 표시 ' + j.ver);
    const ra = await (await post(JSON.stringify({ cap: 5, f: { cat: '전체' }, alts: 'chips', n: nowRows }))).json();
    ok(ra.ok && Object.keys(ra.alts).join() === '전체,증시,경제,사회,정치,연예,스포츠,IT' && ra.alts['증시'].info.n === 1, '워커: alts 응답(칩 8개 화면이 함께 온다)');
    const rn = await (await post(JSON.stringify({ cap: 5, f: { cat: '전체' }, n: nowRows }))).json();
    ok(rn.alts === undefined, '워커: alts 를 안 달면 예전 응답 그대로');
    const d = await (await post(JSON.stringify({ cap: 5, d: nowRows[0] }))).json();
    ok(d.ok && d.detail.cat === '증시' && d.detail.src === '연합뉴스', '워커: 상세 응답');
    ok((await (await post(JSON.stringify({ cap: 4, f: {}, n: [] }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post('{oops')).status === 400, '워커: 깨진 본문은 400');
    ok((await post('x'.repeat(1500001))).status === 413, '워커: 너무 큰 본문은 413');
    ok((await call('https://x/screen/news')).status === 405, '워커: GET 은 405');
    const ro = await call('https://x/screen/news', { method: 'OPTIONS' });
    ok(ro.status === 204 && /POST/.test(ro.headers.get('access-control-allow-methods')), '워커: OPTIONS 204 + POST 허용');
    ok(r.headers.get('access-control-allow-origin') === '*' && /^private, max-age=\d+$/.test(r.headers.get('cache-control')), '워커: CORS · no-store');
    const big = []; for (let i = 0; i < 1200; i++) big.push(['코스피 주가 기사 제목 ' + i + ' 가나다라마바사아자차카타파하', 'https://news.example.com/article/' + i + '/long/path/segment', '언론사' + (i % 9), Date.now() - i * MIN, ['', '사회', '증시'][i % 3], i % 20 === 0 ? '요약 글 '.repeat(30) : '']);
    const body = JSON.stringify({ cap: 5, f: { cat: '전체' }, n: big });
    const t0 = Date.now(); const rb = await post(body); const jb = await rb.json();
    ok(rb.status === 200 && jb.ok && Date.now() - t0 < 1500, '워커: 큰 목록(1200건 ' + Math.round(body.length / 1024) + 'KB)도 빠르게 ' + (Date.now() - t0) + 'ms');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`news_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
