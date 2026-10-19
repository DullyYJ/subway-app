package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** StoreCore(저장값 보관: 구조 검사 · 적용 · 인코딩) 시험 — 안드로이드 없이 JVM. 사용: java StoreJvmTest */
public class StoreJvmTest {
    static int fails = 0, oks = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (c) oks++; else fails++; }

    static Map<String, Object> set(String... kv) { Map<String, Object> m = new LinkedHashMap<String, Object>(); for (int i = 0; i + 1 < kv.length; i += 2) m.put(kv[i], kv[i + 1]); return m; }
    static List<Object> del(String... k) { List<Object> l = new ArrayList<Object>(); for (String s : k) l.add(s); return l; }
    static Map<String, String> cur(String... kv) { Map<String, String> m = new TreeMap<String, String>(); for (int i = 0; i + 1 < kv.length; i += 2) m.put(kv[i], kv[i + 1]); return m; }
    static String rep(char c, int n) { StringBuilder b = new StringBuilder(); for (int i = 0; i < n; i++) b.append(c); return b.toString(); }

    public static void main(String[] a) throws Exception {
        // ── 키 모양 ──
        ok(StoreCore.validKey("gdm_rtf") && StoreCore.validKey("app_theme") && StoreCore.validKey("srv:a.b-c") && StoreCore.validKey("A1") && StoreCore.validKey(rep('k', 64)), "validKey: 영문·숫자·_ : . - 는 받는다(64자까지)");
        ok(!StoreCore.validKey(null) && !StoreCore.validKey("") && !StoreCore.validKey(" ") && !StoreCore.validKey("a b") && !StoreCore.validKey("a/b") && !StoreCore.validKey("한글") && !StoreCore.validKey(rep('k', 65)) && !StoreCore.validKey("a\nb") && !StoreCore.validKey("a\"b"), "validKey: 빈 것·공백·슬래시·한글·65자·줄바꿈·따옴표는 거절");

        // ── 적용 ──
        StoreCore.Result r = StoreCore.apply(cur("a", "1", "b", "2"), set("b", "3", "c", "4"), del("a"));
        ok(r.state.size() == 2 && "3".equals(r.state.get("b")) && "4".equals(r.state.get("c")) && !r.state.containsKey("a") && r.set == 2 && r.del == 1 && r.rejected == 0, "apply: 지우고 쓰고 · 개수가 맞는다");
        Map<String, String> c0 = cur("a", "1");
        StoreCore.apply(c0, set("a", "2", "z", "9"), del("a"));
        ok(c0.size() == 1 && "1".equals(c0.get("a")), "apply: 현재 상태는 건드리지 않는다(새 상태를 돌려준다)");
        r = StoreCore.apply(cur("a", "1"), set("a", "1"), null);
        ok(r.set == 0 && r.rejected == 0 && "1".equals(r.state.get("a")), "apply: 같은 값을 다시 써도 바뀐 건 없다(set=0)");
        r = StoreCore.apply(cur("a", "1"), set("a", "9"), del("a"));
        ok("9".equals(r.state.get("a")) && r.del == 1 && r.set == 1, "apply: 지우기가 먼저, 그다음 쓰기(같은 키면 쓴 값이 남는다)");
        r = StoreCore.apply(null, null, null);
        ok(r.state.isEmpty() && r.set == 0 && r.del == 0 && r.rejected == 0, "apply: 전부 null 이어도 죽지 않는다");

        // ── 거절 ──
        Map<String, Object> bad = set("good", "1", "bad key", "2", "한글", "3");
        bad.put("num", Integer.valueOf(5)); bad.put("nul", null); bad.put("long", rep('x', StoreCore.MAX_VALUE + 1));
        r = StoreCore.apply(cur(), bad, del("ok", "bad/key"));
        ok(r.state.size() == 1 && "1".equals(r.state.get("good")) && r.rejected == 6, "apply: 이상한 키·글자 아닌 값·너무 긴 값은 거절하고 나머지는 처리한다 (거절 " + r.rejected + ")");
        r = StoreCore.apply(cur(), set("max", rep('x', StoreCore.MAX_VALUE)), null);
        ok(r.state.size() == 1 && r.rejected == 0, "apply: 값 한도 딱 맞으면 받는다");
        Map<String, Object> many = new LinkedHashMap<String, Object>();
        for (int i = 0; i < StoreCore.MAX_KEYS + 10; i++) many.put("k" + String.format("%04d", i), "1");
        r = StoreCore.apply(cur(), many, null);
        ok(r.state.size() == StoreCore.MAX_KEYS && r.rejected == 10 && r.state.containsKey("k0000") && !r.state.containsKey("k" + String.format("%04d", StoreCore.MAX_KEYS + 9)), "apply: 새 키는 한도(" + StoreCore.MAX_KEYS + ")까지만 · 이름 순으로");
        Map<String, String> full = new TreeMap<String, String>();
        for (int i = 0; i < StoreCore.MAX_KEYS; i++) full.put("f" + String.format("%04d", i), "v");
        r = StoreCore.apply(full, set("f0003", "바뀜", "new", "1"), null);
        ok("바뀜".equals(r.state.get("f0003")) && !r.state.containsKey("new") && r.rejected == 1, "apply: 가득 차도 있는 키는 바꿀 수 있고 새 키만 거절");
        Map<String, Object> big = new LinkedHashMap<String, Object>();
        for (int i = 0; i < 20; i++) big.put("b" + String.format("%02d", i), rep('y', StoreCore.MAX_VALUE - 1));
        r = StoreCore.apply(cur(), big, null);
        int tot = 0; for (String v : r.state.values()) tot += v.length();
        ok(tot <= StoreCore.MAX_TOTAL && r.state.size() == StoreCore.MAX_TOTAL / (StoreCore.MAX_VALUE - 1) && r.rejected == 20 - r.state.size(), "apply: 값 합계 한도(" + StoreCore.MAX_TOTAL + ")를 넘지 않는다");
        r = StoreCore.apply(cur("a", rep('x', 100)), set("a", "짧음"), null);
        ok("짧음".equals(r.state.get("a")), "apply: 합계는 바꾸는 키의 옛 값을 빼고 센다");
        r = StoreCore.apply(cur("bad key", "1", "ok", "2"), null, null);
        ok(r.state.size() == 1 && r.state.containsKey("ok"), "apply: 현재 상태에 섞인 이상한 키는 걸러낸다");

        // ── 웹이 보낸 JSON ──
        r = StoreCore.applyJson(cur("a", "1", "b", "2"), "{\"set\":{\"c\":\"3\",\"b\":\"22\"},\"del\":[\"a\"]}");
        ok(r != null && r.state.size() == 2 && "22".equals(r.state.get("b")) && "3".equals(r.state.get("c")), "applyJson: set·del 을 읽어 적용한다");
        ok(StoreCore.applyJson(cur(), "{\"set\":{\"a\":\"1\"}}").state.size() == 1 && StoreCore.applyJson(cur("a", "1"), "{\"del\":[\"a\"]}").state.isEmpty() && StoreCore.applyJson(cur("a", "1"), "{}").state.size() == 1, "applyJson: set 만·del 만·빈 객체도 된다");
        ok(StoreCore.applyJson(cur(), null) == null && StoreCore.applyJson(cur(), "") == null && StoreCore.applyJson(cur(), "[1]") == null && StoreCore.applyJson(cur(), "{\"set\":") == null && StoreCore.applyJson(cur(), "nope") == null && StoreCore.applyJson(cur(), rep(' ', 2 * StoreCore.MAX_TOTAL + 1)) == null, "applyJson: 깨졌거나 배열·너무 크면 null(아무것도 바꾸지 않는다)");
        r = StoreCore.applyJson(cur("a", "1"), "{\"set\":[1,2],\"del\":{\"x\":1}}");
        ok(r != null && r.state.size() == 1 && r.set == 0, "applyJson: set 이 배열·del 이 객체여도 무시하고 죽지 않는다");

        // ── 인코딩 왕복 ──
        Map<String, String> tricky = cur("q", "따옴표 \" 와 역슬래시 \\ 와 줄바꿈\n탭\t 그리고 한글 🚇", "json", "{\"a\":[1,2,{\"b\":null}]}", "empty", "", "ctl", "\u0001\u001f", "u", "  ");
        Map<String, String> back = StoreCore.decode(StoreCore.encode(tricky));
        ok(back.equals(tricky), "encode→decode: 따옴표·역슬래시·줄바꿈·제어문자·한글·이모지·빈 글자가 그대로 돌아온다");
        ok(StoreCore.encode(cur("b", "2", "a", "1")).equals("{\"a\":\"1\",\"b\":\"2\"}") && StoreCore.encode(null).equals("{}") && StoreCore.encode(cur()).equals("{}"), "encode: 키 이름 순 · 같은 입력은 같은 글자");
        ok(StoreCore.decode(null).isEmpty() && StoreCore.decode("").isEmpty() && StoreCore.decode("nope").isEmpty() && StoreCore.decode("[1]").isEmpty() && StoreCore.decode("{\"a\":").isEmpty(), "decode: 깨졌거나 객체가 아니면 빈 맵");
        Map<String, String> d = StoreCore.decode("{\"ok\":\"1\",\"bad key\":\"2\",\"num\":5,\"nul\":null,\"obj\":{\"a\":1},\"한글\":\"3\"}");
        ok(d.size() == 1 && "1".equals(d.get("ok")), "decode: 글자 아닌 값·이상한 키는 버린다");
        ok(StoreCore.keys(cur("b", "1", "a", "2")).equals(java.util.Arrays.asList("a", "b")) && StoreCore.keys(null).isEmpty(), "keys: 이름 순");

        System.out.println(fails == 0 ? "ALL OK (" + oks + ")" : "FAILED " + fails);
        System.exit(fails == 0 ? 0 : 1);
    }
}
