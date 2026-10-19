package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 저장값 보관 코어 — 2026-10-19 (5번 4단계: 저장값·설정을 앱 본체에도). 순수 자바: 안드로이드·네트워크·시계·스레드 없음 → JVM 에서 그대로 시험한다.
 *
 *   ★ 원칙: 계산은 엔진이. 어떤 키를 보관할지·웹과 앱 본체 중 어느 쪽 값을 따를지는 엔진(engine/store-sync.js)이 정한다.
 *   여기서는 '구조 검사'만 한다 — 키 모양(영문·숫자·_ : . - , 64자 이하) · 값 길이 · 개수 · 합계 한도. 어떤 이름의 키가 설정인지 같은 목록은 이 파일에 없다(시험이 막는다).
 *
 *   apply(현재, 쓸 것, 지울 것) → 새 상태 + 받아들인/거절한 개수. 한도를 넘는 새 키·긴 값·이상한 키는 거절하고 나머지는 계속 처리한다(한 건 때문에 전체가 안 되지 않게).
 *   encode/decode : {키:글자} ↔ JSON 글자(깨진 것은 빈 맵). 웹과 주고받는 모양이다.
 */
public final class StoreCore {
    private StoreCore() { }

    public static final int MAX_KEY_LEN = 64;
    public static final int MAX_VALUE = 20000;
    public static final int MAX_KEYS = 200;
    public static final int MAX_TOTAL = 200000;

    public static boolean validKey(String k) {
        if (k == null) return false;
        int n = k.length();
        if (n == 0 || n > MAX_KEY_LEN) return false;
        for (int i = 0; i < n; i++) {
            char c = k.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == ':' || c == '.' || c == '-';
            if (!ok) return false;
        }
        return true;
    }

    /** apply 결과. state 는 새 상태(키 이름 순), 나머지는 개수. */
    public static final class Result {
        public final Map<String, String> state;
        public final int set, del, rejected;
        Result(Map<String, String> state, int set, int del, int rejected) { this.state = state; this.set = set; this.del = del; this.rejected = rejected; }
    }

    private static int total(Map<String, String> m) {
        int t = 0;
        for (String v : m.values()) t += v.length();
        return t;
    }

    /** 현재 상태에 쓸 것·지울 것을 적용한 새 상태. 현재 상태는 건드리지 않는다. 지우기가 먼저, 그다음 쓰기. */
    public static Result apply(Map<String, String> cur, Map<String, Object> set, List<Object> del) {
        TreeMap<String, String> st = new TreeMap<String, String>();
        if (cur != null) for (Map.Entry<String, String> e : cur.entrySet()) if (validKey(e.getKey()) && e.getValue() != null) st.put(e.getKey(), e.getValue());
        int nSet = 0, nDel = 0, rej = 0;
        if (del != null) {
            for (Object o : del) {
                if (!(o instanceof String) || !validKey((String) o)) { rej++; continue; }
                if (st.remove((String) o) != null) nDel++;
            }
        }
        if (set != null) {
            int tot = total(st);
            for (Map.Entry<String, Object> e : new TreeMap<String, Object>(set).entrySet()) {
                String k = e.getKey();
                Object v = e.getValue();
                if (!validKey(k) || !(v instanceof String)) { rej++; continue; }
                String s = (String) v;
                if (s.length() > MAX_VALUE) { rej++; continue; }
                String old = st.get(k);
                int nextTotal = tot - (old == null ? 0 : old.length()) + s.length();
                if ((old == null && st.size() >= MAX_KEYS) || nextTotal > MAX_TOTAL) { rej++; continue; }
                st.put(k, s);
                tot = nextTotal;
                if (old == null || !old.equals(s)) nSet++;
            }
        }
        return new Result(st, nSet, nDel, rej);
    }

    /** 웹이 보낸 {"set":{…},"del":[…]} 를 읽어 적용. 깨졌으면 아무것도 바꾸지 않고 null. */
    @SuppressWarnings("unchecked")
    public static Result applyJson(Map<String, String> cur, String json) {
        if (json == null || json.length() == 0 || json.length() > 2 * MAX_TOTAL) return null;
        Object o;
        try { o = ScreenCore.parse(json); } catch (Throwable t) { return null; }
        if (!(o instanceof Map)) return null;
        Map<String, Object> m = (Map<String, Object>) o;
        Object s = m.get("set"), d = m.get("del");
        Map<String, Object> set = (s instanceof Map) ? (Map<String, Object>) s : null;
        List<Object> del = (d instanceof List) ? (List<Object>) d : null;
        return apply(cur, set, del);
    }

    /** {키:글자} → JSON 글자. */
    public static String encode(Map<String, String> m) {
        Map<String, Object> o = new LinkedHashMap<String, Object>();
        if (m != null) for (Map.Entry<String, String> e : new TreeMap<String, String>(m).entrySet()) o.put(e.getKey(), e.getValue());
        return HomeSearchCore.toJson(o);
    }

    /** JSON 글자 → {키:글자}. 글자가 아닌 값·이상한 키는 버리고, 깨졌으면 빈 맵. */
    @SuppressWarnings("unchecked")
    public static Map<String, String> decode(String json) {
        TreeMap<String, String> out = new TreeMap<String, String>();
        if (json == null || json.length() == 0) return out;
        Object o;
        try { o = ScreenCore.parse(json); } catch (Throwable t) { return out; }
        if (!(o instanceof Map)) return out;
        for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) {
            if (validKey(e.getKey()) && e.getValue() instanceof String) out.put(e.getKey(), (String) e.getValue());
        }
        return out;
    }

    /** 키 목록(진단용). */
    public static List<String> keys(Map<String, String> m) {
        return m == null ? new ArrayList<String>() : new ArrayList<String>(new TreeMap<String, String>(m).keySet());
    }
}
