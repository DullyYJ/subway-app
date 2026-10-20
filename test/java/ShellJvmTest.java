package com.dullyyj.subway;

import java.util.HashMap;
import java.util.Map;

/** ShellCore(네이티브 껍데기의 순수 계산) 시험 — 안드로이드 없이 JVM. 사용: java ShellJvmTest */
public class ShellJvmTest {
    static int fails = 0, oks = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (c) oks++; else fails++; }

    public static void main(String[] a) throws Exception {
        ShellCore.MemStore st = new ShellCore.MemStore();

        // ── 탭 ──
        ok("home".equals(ShellCore.currentTab(st)), "처음엔 홈 탭");
        st.put("tab", "bogus");
        ok("home".equals(ShellCore.currentTab(st)), "모르는 탭 이름은 홈으로");
        ok(ShellCore.tabsBody("map").equals("{\"cap\":18,\"f\":{\"tab\":\"map\"}}"), "탭 막대 요청 본문");
        ok(ShellCore.tabsBody("x\"y").contains("\"home\""), "엉터리 탭 이름은 요청에 실리지 않는다");
        ok(ShellCore.netOk(ShellCore.tabsUrl()), "탭 주소는 통신 허용 목록 안");
        ShellCore.Effect e = ShellCore.routeTabs(st, "call", "tab.shop");
        ok(e.kind == ShellCore.E_TAB && "shop".equals(e.arg) && "shop".equals(ShellCore.currentTab(st)), "탭 누름 → 탭 옮김 + 저장");
        ok(ShellCore.routeTabs(st, "call", "tab.nope").kind == ShellCore.E_NONE, "모르는 탭은 무시");
        ok(ShellCore.routeTabs(st, "set", "tab.shop").kind == ShellCore.E_NONE, "call 이 아니면 무시");

        // ── 설정 사실 ──
        ShellCore.MemStore s2 = new ShellCore.MemStore();
        String f = ShellCore.settingsFacts(s2);
        ok(f.equals("{\"id\":\"\",\"np\":{\"arrive\":1,\"transfer\":1,\"arrive_reco\":1},\"rl\":1,\"th\":\"pastel\",\"feat\":{}}"), "기본 기기 사실: " + f);
        s2.put("comm_id", "길동무7"); s2.put("np_transfer", "0"); s2.put("ride_log_off", "1"); s2.put("theme", "dark");
        f = ShellCore.settingsFacts(s2);
        ok(f.contains("\"id\":\"길동무7\"") && f.contains("\"transfer\":0") && f.contains("\"rl\":0") && f.contains("\"th\":\"dark\""), "바뀐 기기 사실");
        s2.put("comm_id", "a\"b\\c\nd");
        ok(ShellCore.settingsFacts(s2).contains("a\\\"b\\\\c\\nd"), "아이디의 따옴표·역슬래시·줄바꿈은 이스케이프");
        String u = ShellCore.settingsUrl(s2);
        ok(u.startsWith("https://route-v2.phg0643.workers.dev/screen/settings?cap=3&f=") && u.indexOf(' ') < 0 && u.indexOf('"') < 0 && ShellCore.netOk(u), "설정 주소: 인코딩 · 허용 목록");

        // ── 설정 눌림 ──
        ShellCore.MemStore s3 = new ShellCore.MemStore();
        e = ShellCore.routeSettings(s3, "set", "", "n.transfer", false, null);
        ok(e.kind == ShellCore.E_REFRESH && "0".equals(s3.get("np_transfer", "1")), "알림 스위치 끔 → 저장 + 다시 받기");
        e = ShellCore.routeSettings(s3, "set", "", "n.transfer", true, null);
        ok("1".equals(s3.get("np_transfer", "0")), "알림 스위치 켬");
        ok(ShellCore.routeSettings(s3, "set", "", "n.evil", true, null).kind == ShellCore.E_NONE && s3.m.get("np_evil") == null, "모르는 알림 키는 저장 안 함");
        e = ShellCore.routeSettings(s3, "set", "", "rl", false, null);
        ok(e.kind == ShellCore.E_REFRESH && "1".equals(s3.get("ride_log_off", "0")), "도착 오차 기록 끔");
        ok(ShellCore.routeSettings(s3, "set", "", "f.scrh", true, null).kind == ShellCore.E_NONE, "웹 기능 스위치(f.*)는 무시");
        e = ShellCore.routeSettings(s3, "sel", "dark", "", false, null);
        ok(e.kind == ShellCore.E_REFRESH && "dark".equals(ShellCore.theme(s3)), "테마 고르기");
        ok(ShellCore.routeSettings(s3, "sel", "neon", "", false, null).kind == ShellCore.E_NONE && "dark".equals(ShellCore.theme(s3)), "모르는 테마는 무시");

        Map<String, String> fl = new HashMap<String, String>();
        fl.put("cid", " 홍길동 ");
        e = ShellCore.routeSettings(s3, "call", "saveId", "", false, fl);
        ok(e.kind == ShellCore.E_TOAST && "홍길동".equals(s3.get("comm_id", "")) && e.arg.contains("홍길동"), "아이디 저장(앞뒤 공백 제거)");
        fl.put("cid", "a");
        e = ShellCore.routeSettings(s3, "call", "saveId", "", false, fl);
        ok(e.kind == ShellCore.E_TOAST && e.arg.contains("2~12자") && "홍길동".equals(s3.get("comm_id", "")), "너무 짧은 아이디 거절 · 저장값 그대로");
        fl.put("cid", "bad id!");
        ok(ShellCore.routeSettings(s3, "call", "saveId", "", false, fl).arg.contains("한글·영문·숫자"), "특수문자 아이디 거절");
        fl.put("cid", "1234567890123");
        ok(ShellCore.routeSettings(s3, "call", "saveId", "", false, fl).arg.contains("2~12자"), "13자 아이디 거절");
        ok(ShellCore.routeSettings(s3, "call", "saveId", "", false, null).arg.contains("2~12자"), "입력칸 값이 없으면 거절");
        e = ShellCore.routeSettings(s3, "call", "clearId", "", false, null);
        ok(e.kind == ShellCore.E_TOAST && "".equals(s3.get("comm_id", "x")), "아이디 삭제");
        ok(ShellCore.routeSettings(s3, "call", "errlog", "", false, null).kind == ShellCore.E_TOAST, "아직 없는 기능은 알림");
        ok(ShellCore.routeSettings(s3, "web", "cm", "", false, null).kind == ShellCore.E_TOAST, "web 행동은 '옮기는 중' 알림");
        ok(ShellCore.routeSettings(s3, "call", "tab.map", "", false, null).kind == ShellCore.E_TAB, "설정 화면에서 온 탭 이동");
        ok(ShellCore.routeSettings(s3, null, null, null, false, null).kind == ShellCore.E_NONE, "빈 눌림은 무시");

        // ── 출처 · 임시 화면 · 색 ──
        for (String t : ShellCore.TABS) {
            try { ScreenCore.load(ShellCore.pendingScreen(t)); ok(true, "임시 화면 검증 통과: " + t); }
            catch (ScreenCore.ParseError pe) { ok(false, "임시 화면 검증 실패 " + t + ": " + pe.getMessage()); }
        }

        // ── 칸(slot) · 요청 ──
        ShellCore.MemStore s4 = new ShellCore.MemStore();
        String[] sl = ShellCore.slotsOf(s4, "community");
        ok(sl.length == 2 && "cchips".equals(sl[0]) && "news".equals(sl[1]), "커뮤니티 기본 = 칩 줄 + 뉴스");
        s4.put("cc_mode", "set");
        ok("settings".equals(ShellCore.slotsOf(s4, "community")[1]), "설정 칩이면 설정 화면");
        s4.put("cc_mode", "board");
        ok("board".equals(ShellCore.slotsOf(s4, "community")[1]), "게시판 칩이면 게시판 화면");
        s4.put("cc_mode", "chat");
        ok("chat".equals(ShellCore.slotsOf(s4, "community")[1]), "채팅 칩이면 실시간소통 화면");
        s4.put("cc_mode", "zzz");
        ok("news".equals(ShellCore.mode(s4)), "모르는 칩은 기본으로");
        ok(ShellCore.slotsOf(s4, "shop").length == 1 && "shop".equals(ShellCore.slotsOf(s4, "shop")[0]), "쇼핑 한 칸");
        ShellCore.Req rq = ShellCore.request("shop", s4, new String[0]);
        ok("GET".equals(rq.method) && rq.url.equals("https://route-v2.phg0643.workers.dev/screen/shop?cap=18") && rq.body == null, "쇼핑 요청(분류 없음)");
        s4.put("shop_cat", "식사 & 간식");
        ok(ShellCore.request("shop", s4, new String[0]).url.endsWith("&cat=%EC%8B%9D%EC%82%AC+%26+%EA%B0%84%EC%8B%9D"), "쇼핑 분류 인코딩");
        rq = ShellCore.request("cchips", s4, null);
        ok("POST".equals(rq.method) && rq.body.equals("{\"cap\":18,\"f\":{\"mode\":\"news\"}}"), "칩 줄 요청: " + rq.body);
        ok(ShellCore.feedUrls("news").length == 2 && ShellCore.netOk(ShellCore.feedUrls("news")[0]) && ShellCore.netOk(ShellCore.feedUrls("news")[1]), "뉴스 원자료 주소는 허용 목록 안");
        ok(ShellCore.feedUrls("shop").length == 0 && ShellCore.request("pending", s4, null) == null, "원자료 없는 화면 · 모르는 화면은 요청 없음");

        // ── 뉴스 원자료 ──
        String f0 = "{\"ok\":true,\"items\":[{\"title\":\"  코스피 &amp; 환율  \\n 급등 \",\"link\":\"https://a.com/1\",\"desc\":\"요약 &#39;x&#39;\",\"source\":\"연합&apos;뉴스\",\"ts\":1700000000000,\"cat\":\"경제\"},{\"title\":\"\"},{\"link\":\"x\"}]}";
        String f1 = "{\"ok\":true,\"cats\":{\"증시\":[{\"title\":\"나스닥 마감\",\"link\":\"https://b.com/2\",\"source\":\"한경\",\"ts\":1700000001000}]}}";
        ShellCore.NewsRows nr = ShellCore.NewsRows.from(new String[] { f0, f1 });
        ok(nr.rows.size() == 2, "빈 제목은 건너뛴다: " + nr.rows.size());
        ok(nr.rows.get(0)[0].equals("코스피 & 환율 급등") && nr.rows.get(0)[5].equals("요약 'x'") && nr.rows.get(0)[2].equals("연합'뉴스"), "이름표 풀기 · 공백 정리");
        ok(nr.rows.get(1)[4].equals("증시") && nr.rows.get(1)[3].equals("1700000001000"), "서버 분류 칸 · 시각");
        ok(nr.rowJson(1).equals("[\"나스닥 마감\",\"https://b.com/2\",\"한경\",1700000001000,\"증시\",\"\"]"), "기사 줄 JSON: " + nr.rowJson(1));
        ok(nr.rowJson(9).equals("[]"), "없는 번호");
        try { ScreenCore.parse(nr.json()); ok(true, "기사 목록은 올바른 JSON"); } catch (ScreenCore.ParseError pe) { ok(false, "기사 목록 JSON 오류"); }
        ok(ShellCore.NewsRows.from(new String[] { "", "not json" }).rows.isEmpty() && ShellCore.NewsRows.from(null).rows.isEmpty(), "원자료가 없거나 깨져도 빈 목록");
        s4.put("news_cat", "증시");
        rq = ShellCore.request("news", s4, new String[] { f0, f1 });
        ok(rq.body.startsWith("{\"cap\":18,\"f\":{\"cat\":\"증시\"},\"n\":[[") && ShellCore.netOk(rq.url), "뉴스 요청 본문");
        ok(ShellCore.decode("a&lt;b&gt;&quot;&#x41;&unknown;&").equals("a<b>\"A&unknown;&"), "이름표 풀기 모음");

        // ── 칸별 눌림 ──
        ShellCore.MemStore s5 = new ShellCore.MemStore();
        e = ShellCore.route("cchips", s5, "call", "cc.set", "", false, "", null);
        ok(e.kind == ShellCore.E_TAB && "set".equals(ShellCore.mode(s5)), "칩 누름 → 칸 바뀜(탭 다시 그리기)");
        ok(ShellCore.route("cchips", s5, "call", "cc.hack", "", false, "", null).kind == ShellCore.E_NONE, "모르는 칩 무시");
        e = ShellCore.route("shop", s5, "cat", "추천", "", false, "", null);
        ok(e.kind == ShellCore.E_REFRESH && "추천".equals(s5.get("shop_cat", "")), "쇼핑 분류 누름");
        e = ShellCore.route("shop", s5, "open", "", "", false, "https://link.coupang.com/a/1", null);
        ok(e.kind == ShellCore.E_LINK && e.arg.startsWith("https://"), "쇼핑 링크 열기");
        ok(ShellCore.route("shop", s5, "open", "", "", false, "javascript:alert(1)", null).kind == ShellCore.E_NONE && ShellCore.route("shop", s5, "open", "", "", false, "intent://x", null).kind == ShellCore.E_NONE, "http(s) 아닌 주소는 열지 않는다");
        ok(ShellCore.route("shop", s5, "refresh", "", "", false, "", null).kind == ShellCore.E_REFRESH, "새로고침");
        e = ShellCore.route("news", s5, "cat", "경제", "", false, "", null);
        ok(e.kind == ShellCore.E_REFRESH && "경제".equals(s5.get("news_cat", "")), "뉴스 칩");
        e = ShellCore.route("news", s5, "call", "nw.12", "", false, "", null);
        ok(e.kind == ShellCore.E_NEWS && "12".equals(e.arg), "기사 누름");
        ok(ShellCore.route("news", s5, "call", "nw.x", "", false, "", null).kind == ShellCore.E_NONE && ShellCore.route("news", s5, "call", "nw.-1", "", false, "", null).kind == ShellCore.E_NONE && ShellCore.route("news", s5, "call", "nw.99999", "", false, "", null).kind == ShellCore.E_NONE, "엉터리 기사 번호 무시");
        e = ShellCore.routeSearch("https://www.coupang.com/np/search?q={q}", "https://coupa.ng/x", " 라면 ");
        ok(e.kind == ShellCore.E_LINK && e.arg.equals("https://www.coupang.com/np/search?q=%EB%9D%BC%EB%A9%B4"), "검색: 글이 있으면 tpl");
        e = ShellCore.routeSearch("https://www.coupang.com/np/search?q={q}", "https://coupa.ng/x", " ");
        ok(e.kind == ShellCore.E_LINK && e.arg.equals("https://coupa.ng/x"), "검색: 비었으면 empty");
        ok(ShellCore.routeSearch("", "", "a").kind == ShellCore.E_NONE, "주소 없으면 무시");

        // ── 기사 상세 ──
        ShellCore.Detail dt = ShellCore.parseDetail("{\"ok\":true,\"v\":1,\"detail\":{\"cat\":\"경제\",\"title\":\"제목\",\"meta\":\"3분 전 · 한경\",\"desc\":\"\",\"empty\":\"요약 없음\",\"notice\":\"출처\",\"btn\":\"한경 원문 보기 ›\",\"close\":\"닫기\",\"open\":1}}", "https://b.com/2");
        ok(dt != null && dt.title.equals("제목") && dt.body.equals("요약 없음") && dt.open && dt.btn.contains("원문"), "상세 읽기(요약 없으면 안내 글)");
        dt = ShellCore.parseDetail("{\"ok\":true,\"detail\":{\"title\":\"t\",\"desc\":\"d\",\"open\":1}}", "javascript:x");
        ok(dt != null && !dt.open && "d".equals(dt.body), "이상한 링크면 원문 단추를 숨긴다");
        ok(ShellCore.parseDetail("{\"ok\":false}", "") == null && ShellCore.parseDetail("zzz", "") == null, "상세를 못 읽으면 null");
        ok(ShellCore.newsDetailBody("[\"a\"]").equals("{\"cap\":18,\"d\":[\"a\"]}"), "상세 요청 본문");

        ok(ShellCore.palette("dark").length == 12 && ShellCore.palette("pastel").length == 12 && ShellCore.palette("zzz")[0] == 0xFFF0F4F8, "팔레트 12칸 · 기본은 파스텔");
        ok(ShellCore.palette("dark")[0] == 0xFF121214 && ShellCore.palette("dark")[5] == 0xFFD4AF37, "다크 배경·금색");

        // ── 홈 탭 입력 ──
        HomeCore h = new HomeCore();
        HomeCore.Env env = new HomeCore.Env(); env.nowMs = 0; env.tzoMin = -540; env.y = 2026; env.m = 9; env.d = 20;
        String hrq = h.request(env, 18);
        ok(hrq.equals("{\"cap\":18,\"f\":{\"start\":\"\",\"dest\":\"\",\"active\":\"\",\"startSet\":false,\"destSet\":false,\"gps\":false,\"base\":{\"ms\":null,\"tzo\":-540,\"today\":[2026,9,20],\"hol\":false}},\"d\":{}}"), "홈 요청 본문(빈 상태): " + hrq);
        ok(h.onText("start", "강남", "focus") && h.active == HomeCore.START, "입력칸 눌림 → 활성");
        ok(h.onText("start", "강남역", "edit") && "강남역".equals(h.text[0]), "글 고침");
        ok("강남역".equals(h.wantQuery()) && h.wantQuery().isEmpty(), "후보 찾을 글은 한 번만");
        java.util.List<Map<String, Object>> bus = new java.util.ArrayList<Map<String, Object>>();
        Map<String, Object> b1 = new java.util.LinkedHashMap<String, Object>(); b1.put("nodenm", "강남역.강남역사거리"); b1.put("nodeid", "GGB1"); b1.put("citycode", Double.valueOf(31010)); b1.put("gpslati", Double.valueOf(37.5)); b1.put("gpslong", Double.valueOf(127.02)); b1.put("dist", Double.valueOf(0));
        bus.add(b1);
        ok(h.setCands("강남역", true, bus), "후보 받기");
        ok(h.request(env, 18).contains("\"b\":[{\"n\":\"강남역.강남역사거리\",\"d\":0}]"), "요청에 버스 후보 실림");
        ok(h.act("sg.b.0", null) == HomeCore.R_FIELDS && h.loc[0] != null && "bus".equals(h.loc[0].type) && "GGB1".equals(h.loc[0].nodeId) && h.active == -1, "버스정류장 고르기");
        ok(h.request(env, 18).contains("\"startSet\":true"), "고른 뒤 startSet");
        ok(h.act("rt.go", null) == HomeCore.R_NEED_BOTH, "도착 비면 경로 탐색 안 함");
        h.onText("dest", "서울역", "edit");
        ok(h.act("rt.swap", null) == HomeCore.R_FIELDS && "서울역".equals(h.text[0]) && h.loc[1] != null && h.loc[0] == null, "바꾸기: 글·고른 장소 함께");
        ok(h.act("sg.b.9", null) == HomeCore.R_NONE, "엉터리 후보 번호 무시");
        h.setGpsStart(37.55, 126.97);
        ok("내 위치".equals(h.text[0]) && h.loc[0].ok() && !h.gps, "위치 감지 결과");
        ok(h.act("rt.gps", null) == HomeCore.R_GPS, "위치 단추");
        ok(h.act("bt.pick", null) == HomeCore.R_PICK_TIME && (h.baseMs = 5) == 5 && h.act("bt.now", null) == HomeCore.R_RENDER && h.baseMs == -1, "기준시각 열기·현재로");
        String hqs = HomeCore.routeQuery(h.loc[0], null, 1000L, false);
        ok(hqs == null, "도착 좌표 없으면 질의 없음");
        h.loc[1] = new HomeCore.Loc(); h.loc[1].name = "서울역"; h.loc[1].lat = 37.5547; h.loc[1].lng = 126.9707; h.text[1] = "서울역";
        hqs = HomeCore.routeQuery(h.loc[0], h.loc[1], 1000L, true);
        ok(hqs != null && hqs.startsWith("SX=126.97&SY=37.55&EX=126.9707&EY=37.5547&baseMs=1000&bf=1&SN=") && hqs.contains("EN=%EC%84%9C%EC%9A%B8%EC%97%AD"), "경로 질의: " + hqs);
        ok(h.act("rt.go", null) == HomeCore.R_GO, "둘 다 있으면 경로 탐색");
        h.onScreen("{\"info\":{\"pk\":{\"u\":[{\"name\":\"강남\",\"line\":\"2호선\",\"lat\":37.4979,\"lng\":127.0276}]}}}");
        h.onText("start", "강남", "focus");
        ok(h.act("sg.u.0", null) == HomeCore.R_FIELDS && "subway".equals(h.loc[0].type) && "강남".equals(h.text[0]) && "2호선".equals(h.loc[0].line), "지하철 후보 고르기(info.pk.u)");

        // ── 경로 결과 ──
        HomeCore r2 = new HomeCore();
        ok(!r2.hasRoute() && !r2.setRoute("not json", "a", "b", -1, 1) && !r2.setRoute("", "a", "b", -1, 1), "경로 응답이 객체가 아니면 버린다");
        ok(r2.setRoute("{\"result\":{\"path\":[]}}", "부평", "두정", -1, 1234L) && r2.hasRoute() && "fast".equals(r2.resTab), "경로 응답 보관");
        env.nowMs = 99L;
        String rreq = r2.resultRequest(env, 18, "dark", 0);
        ok(rreq.equals("{\"cap\":18,\"r\":{\"data\":{\"result\":{\"path\":[]}},\"tab\":\"fast\",\"a\":\"부평\",\"b\":\"두정\",\"bt\":null,\"rb\":1234,\"now\":99,\"tz\":540,\"th\":\"dark\",\"fav\":1}}"), "결과 요청 본문: " + rreq);
        int rev0 = r2.resRev;
        ok(r2.act("rh.tab.bus", null) == HomeCore.R_RESULT && "bus".equals(r2.resTab) && r2.resRev == rev0 + 1, "결과 탭 누름");
        ok(r2.act("rh.tab.bus", null) == HomeCore.R_RESULT && r2.resRev == rev0 + 1, "같은 탭을 또 눌러도 캐시 열쇠는 그대로");
        ok(r2.act("rh.tab.zzz", null) == HomeCore.R_NONE && r2.act("rh.ld.m.0", null) == HomeCore.R_NONE, "모르는 눌림 무시");
        ok(r2.act("rh.fav", null) == HomeCore.R_FAV, "즐겨찾기 누름");
        ok(r2.act("rh.close", null) == HomeCore.R_RENDER && !r2.hasRoute(), "닫기 → 결과 비움");
        String m1 = "{\"ok\":true,\"cover\":\"chips\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":4}],\"info\":{\"h\":1}}", m2 = "{\"ok\":true,\"body\":[{\"t\":\"text\",\"s\":\"가\",\"pad\":[0,0,0,8]}]}";
        String mm = ShellCore.mergeBodies(m1, m2);
        ok(mm.contains("\"spacer\"") && mm.contains("\"s\":\"가\"") && mm.indexOf("spacer") < mm.indexOf("\"가\"") && mm.contains("\"pad\":[0,0,0,8]") && mm.contains("\"cover\":\"chips\""), "본문 이어 붙이기: " + mm);
        ok(ShellCore.mergeBodies(m1, "zzz").equals(m1), "못 읽으면 첫 화면 그대로");

        // ── 게시판 ──
        ShellCore.MemStore bs = new ShellCore.MemStore();
        BoardCore bc = new BoardCore(bs);
        ok(!bc.setPosts("zzz") && !bc.setPosts("{\"posts\":3}") && bc.loading, "엉터리 글 목록은 받지 않는다");
        ok(bc.setPosts("{\"posts\":[{\"id\":11,\"cat\":\"혼잡\",\"title\":\"사람 많아요\",\"body\":\"본문\",\"nick\":\"철수\",\"ts\":1700000000000,\"views\":0,\"likes\":2,\"lols\":1,\"sads\":0,\"cmts\":3,\"user\":1},{\"id\":12,\"title\":\"\"},{\"id\":13,\"title\":\"두 번째\"}]}") && !bc.loading && bc.posts.size() == 2, "서버 글 받기(제목 없는 글 제외)");
        String bq = bc.request(18, 1000L);
        ok(bq.startsWith("{\"cap\":18,\"f\":{\"n\":30,\"st\":\"ready\",\"arm\":null,\"rx\":{},\"rep\":[]},\"p\":[[\"11\",\"혼잡\",\"사람 많아요\",\"본문\",\"철수\",1700000000000,0,2,1,0,3,10,\"\",[]]"), "게시판 요청: " + bq);
        ok(bq.contains("[\"13\",\"잡담\",\"두 번째\",\"\",\"익명\""), "분류·글쓴이 기본값");
        bc.onScreen("{\"info\":{\"ids\":[\"p11\",\"p13\"],\"idx\":[0,1]}}");
        ok("p11".equals(bc.pidById.get("11")) && "c.11".equals(bc.commentKey("11")) && "11".equals(bc.idOfPid("p11")), "화면 번호 ↔ 글번호");
        ok(bc.act("bd.lk.0", null, 5L) == BoardCore.R_RENDER && bs.get("bd_rx", "").equals("{\"11\":{\"like\":1}}"), "좋아요 켜기");
        ok(bc.act("bd.lk.0", null, 6L) == BoardCore.R_RENDER && bs.get("bd_rx", "").equals("{}"), "한 번 더 누르면 끄기");
        ok(bc.act("bd.rp.0", null, 100L) == BoardCore.R_RENDER && bc.request(18, 200L).contains("\"arm\":{\"k\":\"rp\",\"id\":\"11\"}"), "신고 첫 눌림은 확인 대기");
        ok(bc.request(18, 100L + BoardCore.ARM_MS + 1).contains("\"arm\":null"), "대기는 3.5초 뒤 풀린다");
        bc.act("bd.rp.0", null, 300L);
        ok(bc.act("bd.rp.0", null, 400L) == BoardCore.R_REPORT && "11".equals(bc.pendingId) && bs.get("bd_rep", "").equals("[\"11\"]"), "두 번째 눌림은 신고 확정");
        ok(BoardCore.reportBody("11").equals("{\"post_id\":\"11\"}") && BoardCore.commentBody("11", "나", "안녕").equals("{\"post_id\":\"11\",\"nick\":\"나\",\"body\":\"안녕\"}"), "서버 본문");
        java.util.Map<String, String> ff = new java.util.HashMap<String, String>(); ff.put("c.11", "  좋은 글 ");
        ok(bc.act("bd.cm.0", ff, 500L) == BoardCore.R_COMMENT && "좋은 글".equals(bc.pendingText) && bc.act("bd.cm.0", new java.util.HashMap<String, String>(), 501L) == BoardCore.R_NONE, "댓글 등록(빈 글은 무시)");
        bc.addLocalComment("11", "나", "좋은 글", 600L);
        ok(bc.request(18, 700L).contains("[\"loc600\",\"나\",\"좋은 글\",600,[]]"), "방금 쓴 댓글이 줄에 실린다");
        ok(bc.setComments("13", "{\"comments\":[{\"id\":7,\"nick\":\"영희\",\"body\":\"서버 댓글\",\"ts\":900}]}") && bc.request(18, 1000L).contains("[\"srv7\",\"영희\",\"서버 댓글\",900,[]]"), "서버 댓글 붙이기");
        ok(bc.act("bd.more", null, 0L) == BoardCore.R_RENDER && bc.n == 60 && bc.act("bd.write", null, 0L) == BoardCore.R_WRITE, "더 보기 · 글쓰기");
        ok(bc.act("bd.xx.0", null, 0L) == BoardCore.R_NONE && bc.act("bd.lk.99", null, 0L) == BoardCore.R_NONE && bc.act("zz", null, 0L) == BoardCore.R_NONE, "엉터리 눌림 무시");
        bc.addMine("L1", "잡담", "내 글", "내용", "나", 5000L, true);
        String mq = bc.request(18, 6000L);
        ok(mq.contains("[\"L1\",\"잡담\",\"내 글\",\"내용\",\"나\",5000,0,0,0,0,0,5,\"\",[]]"), "내 글(전송 대기)은 서버 글 위에 실린다");
        bc.markSent("L1", "99");
        ok(bc.isServerMine("99") && bc.request(18, 6000L).contains("[\"99\",\"잡담\",\"내 글\",\"내용\",\"나\",5000,0,0,0,0,0,9,"), "전송되면 서버 글 표시");
        ok(ShellCore.jsonId("{\"ok\":true,\"id\":42}").equals("42") && ShellCore.jsonId("{\"ok\":false}").isEmpty() && ShellCore.jsonError("{\"error\":\"이미 올렸어요\"}").equals("이미 올렸어요"), "서버 답 읽기");

        // ── 실시간소통 ──
        ShellCore.MemStore cs = new ShellCore.MemStore();
        ChatCore cc = new ChatCore(cs);
        ok("all".equals(cc.sel()), "처음엔 전체 방");
        cc.select("2호선"); ok("2호선".equals(cc.sel()) && "2호선".equals(cs.get("chat_sel", "")), "방 고르기 저장");
        cc.select("all");
        ok(!cc.addTalks("zzz", "나") && cc.failed && !cc.loaded, "엉터리 대화는 실패로 표시");
        ok(cc.addTalks("{\"ok\":true,\"talks\":[{\"id\":1,\"nick\":\"철수\",\"text\":\"안녕\",\"ts\":100,\"line\":\"2호선\"},{\"id\":2,\"nick\":\"나\",\"text\":\"반가워\",\"ts\":200}]}", "나") && cc.loaded && !cc.failed && cc.sinceG == 200, "전체 대화 받기");
        ok(cc.addTalks("{\"ok\":true,\"talks\":[{\"id\":2,\"nick\":\"나\",\"text\":\"반가워\",\"ts\":200}]}", "나"), "같은 줄은 한 번만");
        String cq = cc.request(18, "pastel", -540, "나", 1000L);
        ok(cq.contains("\"g\":[[\"철수\",\"안녕\",100,0,\"2호선\"],[\"나\",\"반가워\",200,1,\"\"]]") && cq.contains("\"st\":\"ready\"") && cq.contains("\"tzo\":-540") && cq.contains("\"me\":\"나\"") && cq.contains("\"offOk\":0"), "채팅 요청: " + cq);
        cc.select("1호선");
        ok(cc.addRoom("1호선", "{\"ok\":true,\"msgs\":[{\"id\":\"m1\",\"ts\":50,\"nick\":\"영희\",\"text\":\"지연이에요\",\"kind\":\"delay\"}],\"alert\":{\"reporters\":3,\"stations\":[{\"stn\":\"부평\",\"n\":3}]}}") && cc.sinceR.get("1호선") == 50L, "노선 방 받기");
        ok(cc.roomUrl("1호선").endsWith("since=50") && ChatCore.talksUrl(0).endsWith("?limit=30") && ChatCore.talksUrl(7).endsWith("?since=7&limit=40"), "주소");
        cc.setNotices("{\"ok\":true,\"lines\":{\"1호선\":{\"text\":\"지연\",\"ts\":5}}}", 777L);
        cq = cc.request(18, "dark", -540, "나", 1000L);
        ok(cq.contains("\"r\":[[\"m1\",50,\"영희\",\"지연이에요\",\"delay\"]]") && cq.contains("\"off\":{\"text\":\"지연\",\"ts\":5}") && cq.contains("\"offOk\":1") && cq.contains("\"offAt\":777") && cq.contains("\"reporters\":3"), "노선 방 요청에 대화·공지·집계");
        java.util.Map<String, String> cf = new java.util.HashMap<String, String>(); cf.put("chat.room", " 안녕하세요 ");
        ok(cc.act("ch.send", cf, "") == ChatCore.R_NEED_ID && cc.act("ch.send", cf, "나") == ChatCore.R_SEND && "안녕하세요".equals(cc.pendingText) && "1호선".equals(cc.pendingLine), "보내기(아이디 없으면 안내)");
        ok(cc.act("ch.send", new java.util.HashMap<String, String>(), "나") == ChatCore.R_NONE, "빈 글은 무시");
        ok(cc.act("ch.x.0", null, "나") == ChatCore.R_REPORT && "m1".equals(cc.pendingId) && cc.act("ch.x.9", null, "나") == ChatCore.R_NONE, "노선 방 글 신고(번호 → 글번호)");
        cc.hide("m1"); ok(cs.get("lrHidden", "").equals("[\"m1\"]"), "신고한 글 숨김 기록");
        cc.onScreen("{\"info\":{\"sel\":\"all\",\"pl\":\"4호선\"}}"); ok("4호선".equals(cc.postLine), "전체 방 글에 붙일 노선(엔진이 정함)");
        ok(ChatCore.sendBody("나", "안녕", "1호선").equals("{\"nick\":\"나\",\"text\":\"안녕\",\"line\":\"1호선\"}"), "보내기 본문");
        HomeCore hr = new HomeCore(); hr.onResult("{\"info\":{\"sec\":[\"수도권 1호선\",\"2호선\"]}}");
        ok(hr.resSec.size() == 2 && "2호선".equals(hr.resSec.get(1)), "결과 화면의 지하철 구간 이름");

        System.out.println(fails == 0 ? "ALL OK " + oks : "FAILED " + fails + " / " + (oks + fails));
        if (fails > 0) System.exit(1);
    }
}
