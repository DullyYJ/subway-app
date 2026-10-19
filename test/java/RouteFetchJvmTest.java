package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** RouteFetchCore(경로 요청: 엔진의 follow 지시를 따라 단계 진행 · 보관) 시험 — 안드로이드 없이 JVM. 사용: java RouteFetchJvmTest */
public class RouteFetchJvmTest {
    static int fails = 0, oks = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (c) oks++; else fails++; }

    @SuppressWarnings("unchecked")
    static Map<String, Object> obj(String json) throws Exception { return (Map<String, Object>) ScreenCore.parse(json); }
    @SuppressWarnings("unchecked")
    static List<Object> arr(Object o) { return (List<Object>) o; }

    /** 가짜 바깥 세상: 주소별로 정해 둔 응답을 돌려주고, 부른 주소·내보낸 이벤트를 기록한다. */
    static final class Fake implements RouteFetchCore.Env {
        final List<String> urls = new ArrayList<String>();
        final List<Map<String, Object>> evs = new ArrayList<Map<String, Object>>();
        final List<RouteFetchCore.Res> script = new ArrayList<RouteFetchCore.Res>();   // 부른 순서대로 돌려줄 응답
        int staleAfterGets = -1;       // 이 횟수만큼 get 한 뒤부터 낡은 요청이 된다
        boolean throwOnGet = false;
        long clock = 1000;
        public RouteFetchCore.Res get(String url, int ms) {
            urls.add(url);
            if (throwOnGet) throw new RuntimeException("펑");
            int i = urls.size() - 1;
            return i < script.size() ? script.get(i) : RouteFetchCore.Res.bad("대본 끝", 1);
        }
        public long now() { return clock; }
        public boolean stale() { return staleAfterGets >= 0 && urls.size() >= staleAfterGets; }
        public void emit(Map<String, Object> ev) { evs.add(ev); }
        Fake say(RouteFetchCore.Res r) { script.add(r); return this; }
    }

    static String body(String follow, String rest) { return "{\"follow\":" + follow + "," + rest + "}"; }
    static final String REST = "\"result\":{\"path\":[{\"a\":1},{\"a\":2}]},\"engVer\":\"v\"";
    static RouteFetchCore.Res good(String b) { return RouteFetchCore.Res.good(b, 120); }
    static final String URL = "https://route.example/route-v2-app?SX=1&SY=2&EX=3&EY=4&baseMs=5";

    static Object get(Map<String, Object> m, String k) { return m.get(k); }

    public static void main(String[] a) throws Exception {
        // ── 주소 검사 ──
        ok(RouteFetchCore.isRouteUrl(URL) && RouteFetchCore.isRouteUrl("https://x.dev/route-v2-app?a=1"), "isRouteUrl: 경로 서버 주소는 받는다");
        ok(!RouteFetchCore.isRouteUrl("http://x.dev/route-v2-app?a=1") && !RouteFetchCore.isRouteUrl("https://x.dev/other?a=1") && !RouteFetchCore.isRouteUrl("https://x.dev/route-v2-app")
            && !RouteFetchCore.isRouteUrl(null) && !RouteFetchCore.isRouteUrl("") && !RouteFetchCore.isRouteUrl("file:///etc/passwd") && !RouteFetchCore.isRouteUrl("https://x.dev/a/route-v2-app/../x?z=1"), "isRouteUrl: http·다른 경로·질의 없음·null·file 은 거절");
        ok(RouteFetchCore.clampTimeout(null) == 15000 && RouteFetchCore.clampTimeout(5) == 1000 && RouteFetchCore.clampTimeout(999999) == 30000 && RouteFetchCore.clampTimeout(9000) == 9000, "clampTimeout");
        ok((URL + "&live=0").equals(RouteFetchCore.liveZero(URL)), "liveZero: 웹의 _routeStaged 와 같은 &live=0");

        // ── follow 읽기 ──
        Map<String, Object> f = RouteFetchCore.extractFollow(body("{\"v\":1,\"ver\":\"route-v2-x\",\"n\":3,\"draw\":true,\"next\":null,\"miss\":0,\"applied\":2,\"retry\":null}", REST));
        ok(f != null && RouteFetchCore.num(f, "n") == 3 && RouteFetchCore.draws(f) && !RouteFetchCore.wantsFull(f) && "route-v2-x".equals(RouteFetchCore.ver(f)), "extractFollow: 기본");
        ok(RouteFetchCore.extractFollow("  \n " + body("{\"v\":1,\"n\":1}", REST)) != null, "extractFollow: 앞 공백 허용");
        Map<String, Object> fs = RouteFetchCore.extractFollow(body("{\"ver\":\"a}b{c\\\"d\",\"n\":4,\"next\":\"full\"}", REST));
        ok(fs != null && RouteFetchCore.num(fs, "n") == 4 && RouteFetchCore.wantsFull(fs) && "a}b{c\"d".equals(RouteFetchCore.ver(fs)), "extractFollow: 글자 안의 괄호·따옴표");
        ok(RouteFetchCore.extractFollow("{\"result\":{},\"follow\":{\"n\":1}}") == null, "extractFollow: follow 가 맨 앞이 아니면 옛 엔진으로 본다");
        ok(RouteFetchCore.extractFollow(null) == null && RouteFetchCore.extractFollow("") == null && RouteFetchCore.extractFollow("[1]") == null && RouteFetchCore.extractFollow("{\"follow\":3}") == null
            && RouteFetchCore.extractFollow("{\"follow\":{\"n\":1") == null && RouteFetchCore.extractFollow("{\"follow\":{\"n\":}}") == null, "extractFollow: 깨졌거나 없으면 null");
        StringBuilder big = new StringBuilder("{\"follow\":{\"ver\":\""); for (int i = 0; i < 6000; i++) big.append('x'); big.append("\"}}");
        ok(RouteFetchCore.extractFollow(big.toString()) == null, "extractFollow: 지시가 비정상으로 길면 포기");
        ok(RouteFetchCore.draws(null) && !RouteFetchCore.wantsFull(null) && RouteFetchCore.num(null, "n") == 0 && "".equals(RouteFetchCore.ver(null)), "접근자: null 안전");
        ok(!RouteFetchCore.draws(RouteFetchCore.extractFollow(body("{\"draw\":false,\"next\":\"full\"}", REST))), "draws: draw=false 만 그리지 않는다");

        // ── 진단 줄 ──
        Map<String, Object> le = RouteFetchCore.logEntry(good("x"), 15000, f);
        ok("경로 3건".equals(le.get("how")) && Integer.valueOf(3).equals(le.get("n")) && "route-v2-x".equals(le.get("ver")) && le.get("err") == null, "logEntry: 성공은 경로 N건·버전");
        ok("경로 0건".equals(RouteFetchCore.logEntry(good("x"), 15000, null).get("how")), "logEntry: follow 없으면 0건");
        Map<String, Object> lt = RouteFetchCore.logEntry(RouteFetchCore.Res.bad("timeout", 15000), 15000, null);
        ok("타임아웃(15000ms)".equals(lt.get("how")) && lt.get("err") == null, "logEntry: 타임아웃 표기가 웹과 같다");
        Map<String, Object> lf = RouteFetchCore.logEntry(RouteFetchCore.Res.bad("HTTP 500", 33), 15000, null);
        ok("실패".equals(lf.get("how")) && "HTTP 500".equals(lf.get("err")) && Long.valueOf(33).equals(lf.get("ms")), "logEntry: 실패는 이유를 담는다");

        // ── ① 보통 응답: first 하나, 더 묻지 않는다 ──
        RouteFetchCore.State st = new RouteFetchCore.State();
        Fake e1 = new Fake().say(good(body("{\"v\":1,\"n\":2,\"draw\":true,\"next\":null,\"miss\":0}", REST)));
        RouteFetchCore.run("7", URL, 15000, e1, st);
        ok(e1.urls.size() == 1 && e1.urls.get(0).equals(URL + "&live=0"), "보통: 빠른 요청 한 번(&live=0)만");
        ok(e1.evs.size() == 1 && "first".equals(e1.evs.get(0).get("stage")) && Boolean.TRUE.equals(e1.evs.get(0).get("ok")) && "7".equals(e1.evs.get(0).get("id")), "보통: first 이벤트 하나");
        ok(((String) e1.evs.get(0).get("raw")).contains("\"result\"") && e1.evs.get(0).get("legacy") == null && e1.evs.get(0).get("forced") == null, "보통: raw 는 받은 그대로 · legacy/forced 없음");
        ok(st.has() && st.n() == 2 && "first".equals(st.stage()) && st.at() == 1000 && URL.equals(st.url()) && "7".equals(st.id()), "보통: 결과를 보관한다");
        ok(arr(e1.evs.get(0).get("log")).size() == 1, "보통: 진단 줄 하나");

        // ── ② livePending: first 뒤에 full ──
        RouteFetchCore.State st2 = new RouteFetchCore.State();
        Fake e2 = new Fake().say(good(body("{\"v\":1,\"n\":2,\"draw\":true,\"next\":\"full\",\"miss\":1}", REST)))
                            .say(good(body("{\"v\":1,\"n\":3,\"draw\":true,\"next\":null,\"miss\":0}", REST)));
        RouteFetchCore.run("8", URL, 15000, e2, st2);
        ok(e2.urls.size() == 2 && e2.urls.get(0).endsWith("&live=0") && e2.urls.get(1).equals(URL), "뒤따르기: 두 번째는 live=0 없는 전체 요청");
        ok(e2.evs.size() == 2 && "first".equals(e2.evs.get(0).get("stage")) && "full".equals(e2.evs.get(1).get("stage")) && Boolean.TRUE.equals(e2.evs.get(1).get("ok")), "뒤따르기: first → full 순서");
        ok(st2.n() == 3 && "full".equals(st2.stage()), "뒤따르기: 보관은 가장 최근 응답");

        // ── ③ 뒤따르는 전체가 실패해도 first 는 이미 나갔고, full 이 ok:false ──
        Fake e3 = new Fake().say(good(body("{\"n\":2,\"next\":\"full\"}", REST))).say(RouteFetchCore.Res.bad("timeout", 15000));
        RouteFetchCore.State st3 = new RouteFetchCore.State();
        RouteFetchCore.run("9", URL, 15000, e3, st3);
        ok(e3.evs.size() == 2 && Boolean.FALSE.equals(e3.evs.get(1).get("ok")) && "timeout".equals(e3.evs.get(1).get("why")) && st3.n() == 2 && "first".equals(st3.stage()), "뒤따르기 실패: full ok:false · 보관은 first 그대로");

        // ── ④ ldWait: 빠른 응답은 내보내지 않고 전체를 first 로 ──
        Fake e4 = new Fake().say(good(body("{\"n\":1,\"draw\":false,\"next\":\"full\"}", "\"result\":{\"path\":[]}")))
                            .say(good(body("{\"n\":5,\"draw\":true,\"next\":null}", REST)));
        RouteFetchCore.State st4 = new RouteFetchCore.State();
        RouteFetchCore.run("10", URL, 15000, e4, st4);
        ok(e4.urls.size() == 2 && e4.evs.size() == 1 && "first".equals(e4.evs.get(0).get("stage")) && ((String) e4.evs.get(0).get("raw")).contains("\"a\":2"), "ldWait: 빠른 응답은 버리고 전체를 first 로 낸다(이벤트 하나)");
        ok(arr(e4.evs.get(0).get("log")).size() == 2 && e4.evs.get(0).get("forced") == null && st4.n() == 5, "ldWait: 진단 줄 둘 · 보관은 전체");

        // ── ⑤ ldWait + 전체 실패: 빠른 응답을 forced 로 ──
        Fake e5 = new Fake().say(good(body("{\"n\":1,\"draw\":false,\"next\":\"full\"}", REST))).say(RouteFetchCore.Res.bad("HTTP 502", 40));
        RouteFetchCore.State st5 = new RouteFetchCore.State();
        RouteFetchCore.run("11", URL, 15000, e5, st5);
        ok(e5.evs.size() == 1 && Boolean.TRUE.equals(e5.evs.get(0).get("forced")) && Boolean.TRUE.equals(e5.evs.get(0).get("ok")) && e5.urls.size() == 2, "ldWait 전체 실패: 빠른 응답을 forced 로 낸다(웹의 full || main0)");

        // ── ⑥ 빠른 요청 실패 ──
        Fake e6 = new Fake().say(RouteFetchCore.Res.bad("timeout", 15000));
        RouteFetchCore.State st6 = new RouteFetchCore.State();
        RouteFetchCore.run("12", URL, 15000, e6, st6);
        ok(e6.urls.size() == 1 && e6.evs.size() == 1 && Boolean.FALSE.equals(e6.evs.get(0).get("ok")) && "timeout".equals(e6.evs.get(0).get("why")) && !st6.has(), "첫 요청 실패: ok:false 하나 · 더 묻지 않음 · 보관 없음");
        ok("타임아웃(15000ms)".equals(((Map<?, ?>) arr(e6.evs.get(0).get("log")).get(0)).get("how")), "첫 요청 실패: 진단 줄이 웹과 같은 글자");

        // ── ⑦ 옛 엔진(follow 없음): legacy 로 돌려주고 판단하지 않는다 ──
        Fake e7 = new Fake().say(good("{\"result\":{\"path\":[{}]},\"liveStat\":{\"livePending\":true}}"));
        RouteFetchCore.State st7 = new RouteFetchCore.State();
        RouteFetchCore.run("13", URL, 15000, e7, st7);
        ok(e7.urls.size() == 1 && e7.evs.size() == 1 && Boolean.TRUE.equals(e7.evs.get(0).get("legacy")) && Boolean.TRUE.equals(e7.evs.get(0).get("ok")) && !st7.has(), "옛 엔진: legacy 하나 · liveStat 을 읽어 스스로 판단하지 않는다 · 보관 안 함");

        // ── ⑧ 낡은 요청 ──
        Fake e8 = new Fake().say(good(body("{\"n\":2,\"next\":\"full\"}", REST))); e8.staleAfterGets = 1;
        RouteFetchCore.State st8 = new RouteFetchCore.State();
        RouteFetchCore.run("14", URL, 15000, e8, st8);
        ok(e8.urls.size() == 1 && e8.evs.size() == 1 && Boolean.TRUE.equals(e8.evs.get(0).get("stale")) && !st8.has(), "낡은 요청(첫 응답 뒤): stale 한 번으로 끝내고 더 묻지 않는다");
        Fake e9 = new Fake().say(good(body("{\"n\":2,\"next\":\"full\"}", REST))).say(good(body("{\"n\":3}", REST)));
        RouteFetchCore.State st9 = new RouteFetchCore.State();
        e9.staleAfterGets = 2;
        RouteFetchCore.run("15", URL, 15000, e9, st9);
        ok(e9.urls.size() == 2 && e9.evs.size() == 1 && "first".equals(e9.evs.get(0).get("stage")) && st9.n() == 2, "낡은 요청(전체 받은 뒤): full 을 내보내지 않는다");

        // ── ⑨ 통신 코드가 던져도 죽지 않는다 ──
        Fake e10 = new Fake(); e10.throwOnGet = true;
        RouteFetchCore.State st10 = new RouteFetchCore.State();
        RouteFetchCore.run("16", URL, 15000, e10, st10);
        ok(e10.evs.size() == 1 && Boolean.FALSE.equals(e10.evs.get(0).get("ok")), "get 이 예외여도 ok:false 로 끝난다");

        // ── ⑩ 이벤트는 작은 JSON 쓰기로 그대로 웹에 간다(따옴표·줄바꿈 포함 raw) ──
        String tricky = body("{\"n\":1}", "\"result\":{\"path\":[{\"name\":\"강남\\\"역\\n2번\"}]}");
        Fake e11 = new Fake().say(good(tricky));
        RouteFetchCore.run("17", URL, 15000, e11, new RouteFetchCore.State());
        String json = HomeSearchCore.toJson(e11.evs.get(0));
        Map<String, Object> back = obj(json);
        ok(tricky.equals(back.get("raw")) && "first".equals(back.get("stage")), "이벤트 JSON 왕복: raw 가 글자 하나 안 바뀌고 돌아온다");

        // ── 재조회 once ──
        RouteFetchCore.State so = new RouteFetchCore.State();
        Fake o1 = new Fake().say(good(body("{\"n\":2,\"miss\":0,\"better\":true}", REST)));
        Map<String, Object> r1 = RouteFetchCore.once("20", URL + "&pm=2&pa=0", 15000, o1, so);
        ok(Boolean.TRUE.equals(r1.get("ok")) && "retry".equals(r1.get("stage")) && so.has() && "retry".equals(so.stage()) && o1.urls.get(0).equals(URL + "&pm=2&pa=0"), "once: 그대로 한 번 받아 돌려주고 보관(live=0 을 붙이지 않는다)");
        Fake o2 = new Fake().say(good(body("{\"n\":9,\"better\":false}", REST)));
        Map<String, Object> r2 = RouteFetchCore.once("21", URL, 15000, o2, so);
        ok(Boolean.TRUE.equals(r2.get("ok")) && so.n() == 2, "once: 엔진이 나아지지 않았다고 한 응답은 보관을 바꾸지 않는다");
        Fake o3 = new Fake().say(good(body("{\"n\":4}", REST)));
        RouteFetchCore.once("22", URL, 15000, o3, so);
        ok(so.n() == 4, "once: better 표시가 없으면 보관한다");
        Fake o4 = new Fake().say(RouteFetchCore.Res.bad("timeout", 15000));
        Map<String, Object> r4 = RouteFetchCore.once("23", URL, 15000, o4, so);
        ok(Boolean.FALSE.equals(r4.get("ok")) && "timeout".equals(r4.get("why")) && so.n() == 4, "once: 실패는 ok:false · 보관 유지");
        Fake o5 = new Fake().say(good("{\"result\":{}}"));
        Map<String, Object> r5 = RouteFetchCore.once("24", URL, 15000, o5, so);
        ok(Boolean.TRUE.equals(r5.get("legacy")) && so.n() == 4, "once: 옛 엔진 응답은 legacy 표시 · 보관 안 함");
        Fake o6 = new Fake(); o6.throwOnGet = true;
        ok(Boolean.FALSE.equals(RouteFetchCore.once("25", URL, 15000, o6, so).get("ok")), "once: 예외여도 죽지 않는다");

        // ── 보관 ──
        RouteFetchCore.State s0 = new RouteFetchCore.State();
        s0.offer("a", "u", "first", "raw", 0, 5); s0.offer("a", "u", "first", null, 3, 5);
        ok(!s0.has(), "State: 경로가 없거나 raw 가 없으면 보관하지 않는다");
        s0.offer("a", "u", "first", "raw", 1, 5);
        ok(s0.has() && "raw".equals(s0.raw()) && s0.n() == 1, "State: 보관");
        s0.clear();
        ok(!s0.has() && s0.n() == 0 && s0.at() == 0, "State: clear");

        System.out.println(fails == 0 ? "ALL OK (" + oks + ")" : fails + " FAIL");
        System.exit(fails == 0 ? 0 : 1);
    }
}
