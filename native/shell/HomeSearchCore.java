package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 홈 경로 입력 후보 검색의 순수 자바 코어 — 2026-10-19 (5번 2단계: 데이터 계층을 웹뷰 밖으로).
 *
 *   · 지하철역 후보는 엔진(/screen/home)이 직접 거른다. 이 코어는 '버스정류장(TAGO)'과 '장소(카카오)' 후보만 맡는다.
 *   · 안드로이드·네트워크·시계를 쓰지 않는다 — 주소 만들기 · 응답 읽기 · 후보 뽑기(예전 웹 코드와 같은 규칙) · 이벤트 JSON 만들기 · 저장본(LRU+기한)만 한다.
 *     실제 통신·타이머는 HomeSearchPlugin 이 하고, 계산은 여기서 하니 JVM 에서 그대로 시험된다.
 *   · 예전 웹 규칙(www/index.html 의 _busStopSearchByName · fmapSearch)과 같다:
 *       버스: TAGO getSttnNoList?nodeNm=<q> 응답의 response.body.items.item (객체 하나·배열·없음("" 포함)) → 앞 5개
 *       장소: 카카오 search/keyword.json?query=<q>&size=5 응답의 documents 중 x·y 가 0 이 아닌 것 → 앞 5개
 *   · 표시용 줄(disp)은 엔진 입력({n,d} · {n,a})이고, 원본(raw)은 웹이 '고르기'에 쓴다(좌표·정류장 번호·도시 코드).
 */
public final class HomeSearchCore {
    private HomeSearchCore() { }

    public static final int MAX_BUS = 5, MAX_PLACE = 5, MIN_Q = 2, MAX_Q = 60;
    public static final long PLACE_TTL_MS = 90L * 24 * 3600 * 1000, BUS_TTL_MS = 10L * 60 * 1000;
    public static final int PLACE_MAX = 300, BUS_MAX = 60;
    public static final String TAGO_URL = "https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList";
    public static final String BUS_BASE = "https://gildongmu-bus.phg0643.workers.dev";            // 버스 공공 API 프록시(웹과 같음)
    public static final String DEFAULT_BASE = "https://gentle-lab-7e47subway-api.phg0643.workers.dev";

    // ═════════════ ① 검색어·주소 ═════════════
    /** 앞뒤 공백을 떼고 MAX_Q 글자까지. 비면 "". */
    public static String norm(String q) {
        if (q == null) return "";
        String s = q.trim();
        return s.length() > MAX_Q ? s.substring(0, MAX_Q) : s;
    }

    /** 퍼센트 인코딩(JS encodeURIComponent 와 같다: 영숫자 -_.!~*'() 만 그대로, 나머지는 UTF-8 바이트별 %XX). */
    public static String enc(String s) {
        StringBuilder b = new StringBuilder();
        byte[] by;
        try { by = (s == null ? "" : s).getBytes("UTF-8"); } catch (Exception e) { by = new byte[0]; }
        for (int i = 0; i < by.length; i++) {
            int c = by[i] & 0xff;
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || "-_.!~*'()".indexOf(c) >= 0) b.append((char) c);
            else { b.append('%'); b.append(Character.toUpperCase(Character.forDigit((c >> 4) & 15, 16))); b.append(Character.toUpperCase(Character.forDigit(c & 15, 16))); }
        }
        return b.toString();
    }

    private static String base(String b) {
        String s = (b == null || b.length() == 0) ? DEFAULT_BASE : b;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    /** 버스정류장: <서버>/tago?url=<TAGO 주소>  (서비스 키는 서버가 넣는다 — 웹의 _busStopSearchByName 과 같은 주소). */
    public static String busUrl(String serverBase, String q) {
        String inner = TAGO_URL + "?serviceKey=" + "&nodeNm=" + enc(q) + "&_type=json";
        return base(serverBase) + "/tago?url=" + enc(inner);
    }

    /** 장소: <서버>/kakao-local?path=search/keyword.json&qs=query=<q>&size=5  (웹의 _kakaoLocal 과 같은 주소). */
    public static String placeUrl(String serverBase, String q) {
        return base(serverBase) + "/kakao-local?path=" + enc("search/keyword.json") + "&qs=" + enc("query=" + enc(q) + "&size=" + MAX_PLACE);
    }

    // ═════════════ ② 응답 읽기 ═════════════
    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object o) { return (o instanceof Map) ? (Map<String, Object>) o : null; }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Object o) { return (o instanceof List) ? (List<Object>) o : null; }

    /** JS parseFloat 처럼 앞쪽의 수만 읽는다. 못 읽으면 0. */
    public static double pf(Object o) {
        if (o instanceof Number) { double d = ((Number) o).doubleValue(); return (Double.isNaN(d) || Double.isInfinite(d)) ? 0 : d; }
        if (!(o instanceof String)) return 0;
        String s = ((String) o).trim();
        int i = 0, n = s.length();
        if (i < n && (s.charAt(i) == '-' || s.charAt(i) == '+')) i++;
        int ds = i;
        while (i < n && Character.isDigit(s.charAt(i))) i++;
        if (i < n && s.charAt(i) == '.') { i++; while (i < n && Character.isDigit(s.charAt(i))) i++; }
        if (i == ds || (i == ds + 1 && s.charAt(ds) == '.')) return 0;
        try { double d = Double.parseDouble(s.substring(0, i)); return (Double.isNaN(d) || Double.isInfinite(d)) ? 0 : d; } catch (NumberFormatException e) { return 0; }
    }

    private static String str(Object o) { return (o instanceof String) ? (String) o : (o instanceof Number ? numStr((Number) o) : ""); }

    private static String numStr(Number n) { double d = n.doubleValue(); return d == Math.rint(d) && Math.abs(d) < 1e15 ? String.valueOf((long) d) : String.valueOf(d); }

    /** TAGO 응답 → 정류장 원본 목록(앞 MAX_BUS). 모양이 달라도 예외 없이 빈 목록. */
    public static List<Map<String, Object>> parseBus(String json) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        try {
            Map<String, Object> root = map(ScreenCore.parse(json));
            Map<String, Object> resp = root == null ? null : map(root.get("response"));
            Map<String, Object> body = resp == null ? null : map(resp.get("body"));
            Map<String, Object> items = body == null ? null : map(body.get("items"));   // 결과가 없으면 "items":"" 라서 여기서 걸러진다
            Object it = items == null ? null : items.get("item");
            List<Object> l = list(it);
            if (l == null && map(it) != null) { l = new ArrayList<Object>(); l.add(it); }
            if (l == null) return out;
            for (int i = 0; i < l.size() && out.size() < MAX_BUS; i++) { Map<String, Object> m = map(l.get(i)); if (m != null) out.add(m); }
        } catch (Exception e) { out.clear(); }
        return out;
    }

    /** 카카오 응답 → 장소 원본 목록(앞 MAX_PLACE). x·y 가 0 이거나 없으면 뺀다. */
    public static List<Map<String, Object>> parsePlaces(String json) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        try {
            Map<String, Object> root = map(ScreenCore.parse(json));
            List<Object> docs = root == null ? null : list(root.get("documents"));
            if (docs == null) return out;
            for (int i = 0; i < docs.size() && out.size() < MAX_PLACE; i++) {
                Map<String, Object> d = map(docs.get(i));
                if (d == null) continue;
                if (pf(d.get("y")) != 0 && pf(d.get("x")) != 0) out.add(d);
            }
        } catch (Exception e) { out.clear(); }
        return out;
    }

    // ═════════════ ③ 엔진에 보낼 줄(disp) ═════════════
    /** 버스: {n: 정류장 이름, d: 거리(m, 없으면 0)} — 엔진 data.b 와 같은 모양. */
    public static Map<String, Object> busDisp(Map<String, Object> stop) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        String n = str(stop.get("nodenm"));
        if (n.length() == 0) n = str(stop.get("nodeName"));
        m.put("n", n);
        m.put("d", Double.valueOf(pf(stop.get("dist"))));
        return m;
    }

    /** 장소: {n: 장소 이름, a: 도로명주소(없으면 지번주소)} — 엔진 data.p 와 같은 모양. */
    public static Map<String, Object> placeDisp(Map<String, Object> doc) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("n", str(doc.get("place_name")));
        String a = str(doc.get("road_address_name"));
        if (a.length() == 0) a = str(doc.get("address_name"));
        m.put("a", a);
        return m;
    }

    // ═════════════ ④ 웹으로 보낼 이벤트 JSON ═════════════
    /** {q, kind:'b'|'p', ok:true, raw:[원본…], disp:[엔진 입력 줄…]} */
    public static String okEvent(String q, String kind, List<Map<String, Object>> raw) {
        List<Object> disp = new ArrayList<Object>();
        for (int i = 0; i < raw.size(); i++) disp.add("b".equals(kind) ? busDisp(raw.get(i)) : placeDisp(raw.get(i)));
        Map<String, Object> e = new LinkedHashMap<String, Object>();
        e.put("q", q); e.put("kind", kind); e.put("ok", Boolean.TRUE);
        e.put("raw", new ArrayList<Object>(raw)); e.put("disp", disp);
        return toJson(e);
    }

    /** 실패(통신·응답 오류): 웹이 그 종류만 예전 방식으로 다시 찾는다. */
    public static String failEvent(String q, String kind, String why) {
        Map<String, Object> e = new LinkedHashMap<String, Object>();
        e.put("q", q); e.put("kind", kind); e.put("ok", Boolean.FALSE); e.put("why", why == null ? "" : (why.length() > 80 ? why.substring(0, 80) : why));
        return toJson(e);
    }

    /** 작은 JSON 쓰기(Map·List·String·Number·Boolean·null). */
    @SuppressWarnings("unchecked")
    public static String toJson(Object o) {
        StringBuilder b = new StringBuilder();
        write(b, o);
        return b.toString();
    }

    @SuppressWarnings("unchecked")
    private static void write(StringBuilder b, Object o) {
        if (o == null) { b.append("null"); return; }
        if (o instanceof Boolean) { b.append(((Boolean) o).booleanValue() ? "true" : "false"); return; }
        if (o instanceof Number) { double d = ((Number) o).doubleValue(); if (Double.isNaN(d) || Double.isInfinite(d)) b.append("0"); else b.append(numStr((Number) o)); return; }
        if (o instanceof String) { writeStr(b, (String) o); return; }
        if (o instanceof Map) {
            b.append('{');
            boolean first = true;
            for (Iterator<Map.Entry<String, Object>> it = ((Map<String, Object>) o).entrySet().iterator(); it.hasNext(); ) {
                Map.Entry<String, Object> en = it.next();
                if (!first) b.append(',');
                first = false;
                writeStr(b, String.valueOf(en.getKey())); b.append(':'); write(b, en.getValue());
            }
            b.append('}');
            return;
        }
        if (o instanceof List) {
            b.append('[');
            List<Object> l = (List<Object>) o;
            for (int i = 0; i < l.size(); i++) { if (i > 0) b.append(','); write(b, l.get(i)); }
            b.append(']');
            return;
        }
        writeStr(b, String.valueOf(o));
    }

    private static void writeStr(StringBuilder b, String s) {
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) { b.append("\\u"); String h = Integer.toHexString(c); for (int k = h.length(); k < 4; k++) b.append('0'); b.append(h); }
                    else b.append(c);
            }
        }
        b.append('"');
    }

    // ═════════════ ⑤ 저장본(LRU + 기한) ═════════════
    /** 검색어별 결과 저장본. 기한이 지나면 없는 것으로 치고, 상한을 넘으면 오래된 것부터 버린다. 시계는 부르는 쪽이 넘긴다. */
    public static final class Cache {
        private final long ttl; private final int max;
        private final LinkedHashMap<String, Object[]> m = new LinkedHashMap<String, Object[]>();   // key → {Long 저장 시각, String 이벤트에 쓸 원본 JSON 목록}
        public Cache(long ttlMs, int max) { this.ttl = ttlMs; this.max = max; }
        public synchronized String get(String key, long now) {
            Object[] v = m.get(key);
            if (v == null) return null;
            long t = ((Long) v[0]).longValue();
            if (now - t > ttl || now < t - 60000L) { m.remove(key); return null; }
            m.remove(key); m.put(key, v);   // 최근 사용으로
            return (String) v[1];
        }
        public synchronized void put(String key, String rawListJson, long now) {
            m.remove(key);
            m.put(key, new Object[] { Long.valueOf(now), rawListJson });
            while (m.size() > max) { Iterator<String> it = m.keySet().iterator(); it.next(); it.remove(); }
        }
        public synchronized int size() { return m.size(); }
        /** 저장용 글: {"k":[시각,"원본목록JSON"],…} */
        public synchronized String dump() {
            Map<String, Object> o = new LinkedHashMap<String, Object>();
            for (Iterator<Map.Entry<String, Object[]>> it = m.entrySet().iterator(); it.hasNext(); ) {
                Map.Entry<String, Object[]> en = it.next();
                List<Object> l = new ArrayList<Object>(); l.add(en.getValue()[0]); l.add(en.getValue()[1]);
                o.put(en.getKey(), l);
            }
            return toJson(o);
        }
        /** dump 의 글을 읽어 채운다(깨져 있으면 아무것도 안 한다). 기한 지난 것은 get 때 걸러진다. */
        public synchronized void load(String s) {
            try {
                if (s == null || s.length() == 0) return;
                Map<String, Object> o = map(ScreenCore.parse(s));
                if (o == null) return;
                for (Iterator<Map.Entry<String, Object>> it = o.entrySet().iterator(); it.hasNext(); ) {
                    Map.Entry<String, Object> en = it.next();
                    List<Object> l = list(en.getValue());
                    if (l == null || l.size() != 2 || !(l.get(0) instanceof Number) || !(l.get(1) instanceof String)) continue;
                    m.put(en.getKey(), new Object[] { Long.valueOf(((Number) l.get(0)).longValue()), l.get(1) });
                }
                while (m.size() > max) { Iterator<String> it2 = m.keySet().iterator(); it2.next(); it2.remove(); }
            } catch (Exception ignored) { }
        }
    }

    /** 원본 목록 → 저장용 JSON 글. */
    public static String rawListJson(List<Map<String, Object>> raw) { return toJson(new ArrayList<Object>(raw)); }

    /** 저장용 글 → 원본 목록(깨졌으면 빈 목록). */
    public static List<Map<String, Object>> rawListFrom(String s) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        try {
            List<Object> l = list(ScreenCore.parse(s));
            if (l == null) return out;
            for (int i = 0; i < l.size(); i++) { Map<String, Object> m = map(l.get(i)); if (m != null) out.add(m); }
        } catch (Exception e) { out.clear(); }
        return out;
    }

    /** 저장본 키: 종류 + 검색어(소문자는 건드리지 않는다 — 카카오·TAGO 가 글자 그대로 찾는다). */
    public static String key(String kind, String q) { return kind + "|" + q; }
}
