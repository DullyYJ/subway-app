package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** HomeSearchCore(홈 후보 검색: 버스정류장·장소 — 주소 · 응답 읽기 · 이벤트 JSON · 저장본) 시험 — 안드로이드 없이 JVM. 사용: java HomeSearchJvmTest */
public class HomeSearchJvmTest {
    static int fails = 0, oks = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (c) oks++; else fails++; }

    @SuppressWarnings("unchecked")
    static Map<String, Object> obj(String json) throws Exception { return (Map<String, Object>) ScreenCore.parse(json); }
    @SuppressWarnings("unchecked")
    static List<Object> arr(Object o) { return (List<Object>) o; }

    public static void main(String[] a) throws Exception {
        // ── 검색어 ──
        ok("강남".equals(HomeSearchCore.norm("  강남 ")) && "".equals(HomeSearchCore.norm(null)) && "".equals(HomeSearchCore.norm("   ")), "norm: 공백 정리·null");
        StringBuilder long70 = new StringBuilder(); for (int i = 0; i < 70; i++) long70.append('가');
        ok(HomeSearchCore.norm(long70.toString()).length() == HomeSearchCore.MAX_Q, "norm: 60글자까지");

        // ── 주소(웹과 같은 글자: 시험 JS 쪽이 encodeURIComponent 로 같은 값을 만들어 비교한다) ──
        System.out.println("URL-ENC " + HomeSearchCore.enc("강남 역/a&b=c?d#e+f'(g)*!~-_.é😀"));
        System.out.println("URL-BUS " + HomeSearchCore.busUrl("https://srv.example/", "강남역 2번"));
        System.out.println("URL-BUS2 " + HomeSearchCore.busUrl(null, "서울"));
        System.out.println("URL-PLC " + HomeSearchCore.placeUrl("https://srv.example", "카페 & 빵"));
        ok(HomeSearchCore.busUrl("https://srv.example/", "x").startsWith("https://srv.example/tago?url="), "busUrl: 끝 슬래시 정리");
        ok(HomeSearchCore.busUrl(null, "x").startsWith(HomeSearchCore.DEFAULT_BASE + "/tago?url="), "busUrl: 기본 서버");
        ok(HomeSearchCore.placeUrl("", "x").startsWith(HomeSearchCore.DEFAULT_BASE + "/kakao-local?path=search%2Fkeyword.json&qs="), "placeUrl: 기본 서버·경로");

        // ── pf (JS parseFloat 처럼) ──
        ok(HomeSearchCore.pf("37.5") == 37.5 && HomeSearchCore.pf(" 127.25abc") == 127.25 && HomeSearchCore.pf("abc") == 0 && HomeSearchCore.pf("") == 0 && HomeSearchCore.pf(null) == 0
            && HomeSearchCore.pf(Double.valueOf(3)) == 3 && HomeSearchCore.pf("-0.5") == -0.5 && HomeSearchCore.pf(".") == 0 && HomeSearchCore.pf("0") == 0, "pf");

        // ── 버스 응답 ──
        String busMany = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":{\"item\":[" +
            "{\"nodenm\":\"강남역\",\"nodeid\":\"N1\",\"citycode\":11,\"gpslati\":37.49,\"gpslong\":127.02,\"dist\":350}," +
            "{\"nodeName\":\"강남역2\",\"nodeId\":\"N2\",\"cityCode\":\"11\",\"gpsLati\":\"37.5\",\"gpsLong\":\"127.0\"}," +
            "{\"nodenm\":\"a\"},{\"nodenm\":\"b\"},{\"nodenm\":\"c\"},{\"nodenm\":\"d\"},{\"nodenm\":\"e\"}]},\"numOfRows\":10}}}";
        List<Map<String, Object>> bs = HomeSearchCore.parseBus(busMany);
        ok(bs.size() == 5 && "N1".equals(bs.get(0).get("nodeid")) && "N2".equals(bs.get(1).get("nodeId")), "parseBus: 앞 5개·원본 그대로");
        ok(HomeSearchCore.parseBus("{\"response\":{\"body\":{\"items\":{\"item\":{\"nodenm\":\"하나\",\"nodeid\":\"X\"}}}}}").size() == 1, "parseBus: 객체 하나");
        ok(HomeSearchCore.parseBus("{\"response\":{\"body\":{\"items\":\"\",\"totalCount\":0}}}").size() == 0, "parseBus: 결과 없음(items 가 빈 글자)");
        ok(HomeSearchCore.parseBus("{\"response\":{\"body\":{}}}").size() == 0 && HomeSearchCore.parseBus("[]").size() == 0 && HomeSearchCore.parseBus("oops").size() == 0
            && HomeSearchCore.parseBus(null).size() == 0 && HomeSearchCore.parseBus("").size() == 0 && HomeSearchCore.parseBus("{\"response\":5}").size() == 0, "parseBus: 이상한 응답은 빈 목록(예외 없음)");
        ok(HomeSearchCore.parseBus("{\"response\":{\"body\":{\"items\":{\"item\":[1,\"x\",null,{\"nodenm\":\"ok\"}]}}}}").size() == 1, "parseBus: 객체가 아닌 칸은 건너뜀");
        Map<String, Object> d0 = HomeSearchCore.busDisp(bs.get(0)), d1 = HomeSearchCore.busDisp(bs.get(1));
        ok("강남역".equals(d0.get("n")) && ((Double) d0.get("d")) == 350.0 && "강남역2".equals(d1.get("n")) && ((Double) d1.get("d")) == 0.0, "busDisp: 이름(nodenm→nodeName)·거리");

        // ── 장소 응답 ──
        String plc = "{\"meta\":{\"total_count\":7},\"documents\":[" +
            "{\"place_name\":\"강남 카페\",\"road_address_name\":\"서울 강남대로 1\",\"address_name\":\"서울 역삼동 1\",\"x\":\"127.02\",\"y\":\"37.49\"}," +
            "{\"place_name\":\"좌표 없음\",\"address_name\":\"x\",\"x\":\"0\",\"y\":\"0\"}," +
            "{\"place_name\":\"좌표 빠짐\",\"address_name\":\"x\"}," +
            "{\"place_name\":\"지번만\",\"road_address_name\":\"\",\"address_name\":\"경기 어딘가 3\",\"x\":\"126.9\",\"y\":\"37.4\"}," +
            "{\"place_name\":\"p3\",\"x\":\"1\",\"y\":\"2\"},{\"place_name\":\"p4\",\"x\":\"1\",\"y\":\"2\"},{\"place_name\":\"p5\",\"x\":\"1\",\"y\":\"2\"},{\"place_name\":\"p6\",\"x\":\"1\",\"y\":\"2\"}]}";
        List<Map<String, Object>> ps = HomeSearchCore.parsePlaces(plc);
        ok(ps.size() == 5 && "강남 카페".equals(ps.get(0).get("place_name")) && "지번만".equals(ps.get(1).get("place_name")), "parsePlaces: 좌표 없는 것은 빼고 앞 5개");
        ok("서울 강남대로 1".equals(HomeSearchCore.placeDisp(ps.get(0)).get("a")) && "경기 어딘가 3".equals(HomeSearchCore.placeDisp(ps.get(1)).get("a")), "placeDisp: 도로명 → 지번 주소");
        ok(HomeSearchCore.parsePlaces("{}").size() == 0 && HomeSearchCore.parsePlaces("{\"documents\":5}").size() == 0 && HomeSearchCore.parsePlaces("zzz").size() == 0 && HomeSearchCore.parsePlaces(null).size() == 0, "parsePlaces: 이상한 응답은 빈 목록");

        // ── 이벤트 JSON ──
        Map<String, Object> ev = obj(HomeSearchCore.okEvent("강남", "b", bs));
        ok("강남".equals(ev.get("q")) && "b".equals(ev.get("kind")) && Boolean.TRUE.equals(ev.get("ok")) && arr(ev.get("raw")).size() == 5 && arr(ev.get("disp")).size() == 5, "okEvent(버스) 모양");
        @SuppressWarnings("unchecked") Map<String, Object> r0 = (Map<String, Object>) arr(ev.get("raw")).get(0);
        ok("N1".equals(r0.get("nodeid")) && ((Double) r0.get("gpslati")) == 37.49 && ((Double) r0.get("citycode")) == 11.0, "원본(raw)이 그대로 간다(정류장 번호·좌표·도시 코드)");
        Map<String, Object> evp = obj(HomeSearchCore.okEvent("카페\"\\\n", "p", ps));
        @SuppressWarnings("unchecked") Map<String, Object> dp0 = (Map<String, Object>) arr(evp.get("disp")).get(0);
        ok("p".equals(evp.get("kind")) && "카페\"\\\n".equals(evp.get("q")) && "강남 카페".equals(dp0.get("n")) && "서울 강남대로 1".equals(dp0.get("a")), "okEvent(장소) 모양 · 따옴표/역슬래시/줄바꿈 이스케이프");
        Map<String, Object> evf = obj(HomeSearchCore.failEvent("강남", "p", "HTTP 502"));
        ok(Boolean.FALSE.equals(evf.get("ok")) && "p".equals(evf.get("kind")) && "HTTP 502".equals(evf.get("why")), "failEvent");
        ok(obj(HomeSearchCore.okEvent("x", "b", new ArrayList<Map<String, Object>>())).get("raw") instanceof List, "빈 목록도 okEvent");
        String ctl = HomeSearchCore.toJson("a\u0001b c");
        ok(ctl.equals("\"a\\u0001b\\u2028c\"") && "a\u0001b c".equals(ScreenCore.parse(ctl)), "toJson: 제어문자·줄 구분자 이스케이프");

        // ── 저장본 ──
        HomeSearchCore.Cache c = new HomeSearchCore.Cache(1000, 3);
        c.put("k1", "[1]", 100); c.put("k2", "[2]", 100); c.put("k3", "[3]", 100);
        ok("[1]".equals(c.get("k1", 500)) && c.get("none", 500) == null, "cache: 넣고 꺼냄");
        c.put("k4", "[4]", 100);   // k1 이 방금 쓰여 최근, 가장 오래된 k2 가 밀려난다
        ok(c.get("k2", 500) == null && "[1]".equals(c.get("k1", 500)) && "[3]".equals(c.get("k3", 500)) && "[4]".equals(c.get("k4", 500)) && c.size() == 3, "cache: 상한을 넘으면 오래 안 쓴 것부터 버린다(LRU)");
        ok(c.get("k1", 1200) == null, "cache: 기한(1000ms)이 지나면 없는 것");
        HomeSearchCore.Cache c2 = new HomeSearchCore.Cache(1000, 5);
        c2.put("a|강남", HomeSearchCore.rawListJson(bs), 1000);
        c2.put("b\"|\n", "[]", 1000);
        String dump = c2.dump();
        HomeSearchCore.Cache c3 = new HomeSearchCore.Cache(1000, 5);
        c3.load(dump);
        ok(c3.size() == 2 && HomeSearchCore.rawListFrom(c3.get("a|강남", 1500)).size() == 5 && "[]".equals(c3.get("b\"|\n", 1500)), "cache: 저장·불러오기 왕복");
        HomeSearchCore.Cache c4 = new HomeSearchCore.Cache(1000, 5);
        c4.load("깨진 글"); c4.load(null); c4.load("[1,2]"); c4.load("{\"x\":[1],\"y\":\"s\",\"z\":[\"a\",\"b\"]}");
        ok(c4.size() == 0, "cache: 깨진 저장본은 무시");
        HomeSearchCore.Cache c5 = new HomeSearchCore.Cache(1000, 2);
        c5.load("{\"a\":[1,\"[]\"],\"b\":[2,\"[]\"],\"c\":[3,\"[]\"]}");
        ok(c5.size() == 2, "cache: 불러올 때도 상한");
        ok(c2.get("a|강남", 1000 + 5000) == null, "cache: 저장본 기한");
        ok(c2.get("a|강남", 1) == null, "cache: 시계가 크게 되감기면 저장본을 믿지 않는다");
        ok("b|강남".equals(HomeSearchCore.key("b", "강남")), "key");
        ok(HomeSearchCore.rawListFrom("oops").size() == 0 && HomeSearchCore.rawListFrom("{}").size() == 0 && HomeSearchCore.rawListFrom("[1,{\"a\":1}]").size() == 1, "rawListFrom: 깨졌으면 빈 목록");

        System.out.println(fails == 0 ? "ALL OK (" + oks + ")" : fails + " FAIL");
        System.exit(fails == 0 ? 0 : 1);
    }
}
