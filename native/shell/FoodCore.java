package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 맛집 탭의 순수 자바 상태기 — 2026-10-20 (s90).
 * 무엇을 어떤 순서로·어떤 문구로 보일지, 도착역·가까운 역·중심 좌표·거리 재기·중복 정리·길찾기 주소는 모두 엔진(/screen/food)이 정한다.
 * 여기는 이 기기가 쥔 사실(도착지 이름·좌표, 기기 위치, 고른 칩)과 서버가 준 원자료를 엔진이 읽는 모양으로 옮겨 담고, 눌림이 무엇을 뜻하는지만 정한다.
 * 통신·위치·외부 지도 앱 열기는 ShellActivity 가 한다.
 */
public final class FoodCore {
    public static final String FOOD_BASE = "https://gildongmu-food.phg0643.workers.dev";
    static final String PUB_URL = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius";
    public static final int RADIUS = 1500, LIMIT = 400, PUB_PAGES = 3, PUB_PAGE_SIZE = 200;
    public static final long TTL = 10 * 60 * 1000L;
    public static final int R_NONE = 0, R_RENDER = 1, R_REFRESH = 2, R_SHEET = 3, R_CLOSE = 4, R_OPEN = 5;

    // ── 이 기기의 사실 ──
    public String dest = "";                     // 홈에서 고른 도착지 이름('역' 포함 가능 — 엔진이 다듬는다)
    public double[] dl = null, gps = null;       // 도착지 좌표 · 기기 위치
    public boolean locating = false, noperm = false;
    public String flt = "전체";

    // ── 받은 원자료 ──
    public boolean loaded = false, failed = false;
    String centerKey = "";                       // 원자료가 받아진 중심(소수 셋째 자리)
    long loadedAt = 0;
    List<Object> srv = new ArrayList<Object>();  // 서버 가게(원자료 그대로)
    List<Object> pub = new ArrayList<Object>();  // 공공데이터 행 [상호, 중분류, 소분류, 도로명, 지번, 위도, 경도]

    // ── 마지막 화면에서 읽은 것 ──
    public double[] ctr = null;                  // 엔진이 정한 중심 좌표
    final Map<String, Object> go = new LinkedHashMap<String, Object>();
    final Map<String, String> alts = new LinkedHashMap<String, String>();   // 칩 → 그 칩의 화면 글
    public String pendingSel = "";               // 눌린 가게(시트 요청용 JSON)
    final Map<String, String> nvApp = new LinkedHashMap<String, String>(), nvWeb = new LinkedHashMap<String, String>();

    // ── 도착지/위치 알림 ──
    /** 홈의 도착지가 바뀌면 원자료를 비운다. 같으면 false. */
    public boolean setDest(String name, double lat, double lng) {
        String n = name == null ? "" : name.trim();
        double[] c = (n.length() > 0 && lat != 0 && lng != 0) ? new double[] { lat, lng } : null;
        boolean same = n.equals(dest) && ((c == null) == (dl == null)) && (c == null || (c[0] == dl[0] && c[1] == dl[1]));
        dest = n; dl = c;
        if (!same) invalidate();
        return !same;
    }
    public void setGps(double lat, double lng) {
        boolean far = gps == null || Math.abs(gps[0] - lat) > 0.003 || Math.abs(gps[1] - lng) > 0.003;
        gps = new double[] { lat, lng }; locating = false; noperm = false;
        if (far && dest.length() == 0) invalidate();
    }
    public void invalidate() { loaded = false; failed = false; alts.clear(); go.clear(); ctr = null; centerKey = ""; srv = new ArrayList<Object>(); pub = new ArrayList<Object>(); }
    public void refresh() { invalidate(); loadedAt = 0; if (dest.length() == 0) gps = null; }

    /** 위치가 필요한데 아직 없는가(도착지가 없고 기기 위치도 없을 때). */
    public boolean needGps() { return dest.length() == 0 && gps == null; }
    public boolean needData() { return ctr != null && (!loaded || centerKey.length() == 0 || System.currentTimeMillis() - loadedAt > TTL); }

    static String key(double[] c) { return String.format(java.util.Locale.US, "%.3f,%.3f", c[0], c[1]); }
    public String state() {
        if (needGps()) return noperm ? "noperm" : (locating ? "locating" : "idle");
        return loaded ? "done" : "loading";
    }

    // ── 받은 글 합치기 ──
    /** 통신 스레드에서 읽어 두는 덩어리(기본 목록은 건드리지 않는다). */
    public static final class Data {
        public boolean srvOk = false;
        public List<Object> srv = new ArrayList<Object>(), pub = new ArrayList<Object>();
    }
    @SuppressWarnings("unchecked")
    public static Data parseData(String serverJson, List<String> pubPages) {   // 서버: {items:[{n,c,a,d,lo,la}…]}
        Data d = new Data();
        try {
            Object o = ScreenCore.parse(serverJson);
            if (o instanceof Map) {
                Object it = ((Map<String, Object>) o).get("items");
                d.srv = it instanceof List ? new ArrayList<Object>((List<Object>) it) : new ArrayList<Object>();
                d.srvOk = true;
            }
        } catch (Exception e) { d.srvOk = false; }
        for (String p : pubPages) rows(p, d.pub);
        return d;
    }
    /** 공공데이터 한 쪽의 항목 수(못 읽으면 -1). 200 미만이면 마지막 쪽. */
    public static int pageCount(String json) { return rows(json, new ArrayList<Object>()); }
    @SuppressWarnings("unchecked")
    static int rows(String json, List<Object> out) {              // 행 = [상호, 중분류, 소분류, 도로명, 지번, 위도, 경도]
        if (json == null || json.length() == 0) return -1;
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return -1;
            Map<String, Object> m = (Map<String, Object>) o;
            Object body = m.get("body");
            if (body == null && m.get("response") instanceof Map) body = ((Map<String, Object>) m.get("response")).get("body");
            Object items = body instanceof Map ? ((Map<String, Object>) body).get("items") : null;
            List<Object> l = new ArrayList<Object>();
            if (items instanceof List) l.addAll((List<Object>) items);
            else if (items instanceof Map) l.add(items);
            int n = 0;
            for (Object x : l) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> r = (Map<String, Object>) x;
                List<Object> row = new ArrayList<Object>();
                row.add(r.get("bizesNm")); row.add(r.get("indsMclsNm")); row.add(r.get("indsSclsNm")); row.add(r.get("rdnmAdr")); row.add(r.get("lnoAdr")); row.add(r.get("lat")); row.add(r.get("lon"));
                out.add(row); n++;
            }
            return n;
        } catch (Exception e) { return -1; }
    }
    public void setData(Data d) {
        srv = d.srv; pub = d.pub; failed = !d.srvOk;
        loaded = true; centerKey = ctr == null ? "" : key(ctr); loadedAt = System.currentTimeMillis();
    }

    // ── 주소 ──
    public String serverUrl() { return FOOD_BASE + "/food?lat=" + ctr[0] + "&lng=" + ctr[1] + "&r=" + RADIUS + "&limit=" + LIMIT; }
    public String publicUrl(int page) {
        String inner = PUB_URL + "?serviceKey=" + "&radius=" + RADIUS + "&cx=" + ctr[1] + "&cy=" + ctr[0] + "&indsLclsCd=I2&type=json&numOfRows=" + PUB_PAGE_SIZE + "&pageNo=" + page;
        return ShellCore.NEWS_BASE + "/tago?url=" + ShellCore.enc(inner);
    }

    // ── 엔진 요청 ──
    private static String ll(double[] c) { return c == null ? "null" : "[" + c[0] + "," + c[1] + "]"; }
    /** 본문. withData=false 면 원자료 없이 사실만(중심 좌표를 먼저 받으려고). */
    public String request(int cap, boolean withData) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{");
        b.append("\"stn\":").append(ShellCore.q(dest)).append(",\"st\":").append(ShellCore.q(withData && loaded ? "done" : state()));
        b.append(",\"flt\":").append(ShellCore.q(flt)).append(",\"fail\":").append(failed ? 1 : 0);
        b.append(",\"gps\":").append(ll(gps)).append(",\"dl\":").append(ll(dl)).append("}");
        if (withData && loaded) b.append(",\"s\":").append(HomeSearchCore.toJson(srv)).append(",\"u\":").append(HomeSearchCore.toJson(pub));
        b.append(",\"alts\":\"chips\"}");
        return b.toString();
    }
    /** 가게 시트 본문. */
    public String sheetRequest(int cap, double[] me) {
        return "{\"cap\":" + cap + ",\"f\":{\"sel\":" + pendingSel + ",\"me\":" + ll(me) + "}}";
    }

    // ── 받은 화면에서 읽기 ──
    @SuppressWarnings("unchecked")
    public void onScreen(String json) {
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return;
            Map<String, Object> m = (Map<String, Object>) o;
            Object i = m.get("info");
            go.clear();
            if (i instanceof Map) {
                Map<String, Object> im = (Map<String, Object>) i;
                Object c = im.get("ctr");
                if (c instanceof List && ((List<Object>) c).size() == 2) { List<Object> cl = (List<Object>) c; ctr = new double[] { BoardCore.d(cl.get(0)), BoardCore.d(cl.get(1)) }; }
                else ctr = null;
                if (im.get("go") instanceof Map) go.putAll((Map<String, Object>) im.get("go"));
            }
            alts.clear();
            if (m.get("alts") instanceof Map) for (Map.Entry<String, Object> e : ((Map<String, Object>) m.get("alts")).entrySet()) alts.put(e.getKey(), HomeSearchCore.toJson(e.getValue()));
        } catch (Exception e) { /* 이전 값 유지 */ }
    }
    /** 이 칩의 화면 글(엔진이 한꺼번에 계산해 보낸 것). 없으면 null. */
    public String altOf(String chip) { return alts.get(chip); }

    @SuppressWarnings("unchecked")
    public void onSheet(String json) {
        nvApp.clear(); nvWeb.clear();
        try {
            Object o = ScreenCore.parse(json);
            Object i = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            Object nv = i instanceof Map ? ((Map<String, Object>) i).get("nv") : null;
            if (nv instanceof Map) for (Map.Entry<String, Object> e : ((Map<String, Object>) nv).entrySet()) {
                if (!(e.getValue() instanceof Map)) continue;
                Map<String, Object> u = (Map<String, Object>) e.getValue();
                nvApp.put(e.getKey(), BoardCore.s(u.get("app"), 1500)); nvWeb.put(e.getKey(), BoardCore.s(u.get("web"), 1500));
            }
        } catch (Exception e) { /* 비움 */ }
    }

    // ── 눌림 ──
    /** 칩: 고른 칩을 기억한다. 엔진이 이미 계산해 둔 화면이 있으면 true(요청 없이 올릴 수 있다). */
    public boolean pickChip(String chip) { flt = chip == null || chip.length() == 0 ? "전체" : chip; return alts.containsKey(flt); }

    /** v: fm.c.<번호> · fm.p.<번호>. 가게 시트를 열 수 있으면 R_SHEET. */
    @SuppressWarnings("unchecked")
    public int act(String v) {
        if (v == null || !v.startsWith("fm.")) return R_NONE;
        String k = v.substring(3);
        if ("close".equals(k)) return R_CLOSE;
        Object g = go.get(k);
        if (!(g instanceof List) || ((List<Object>) g).size() < 5) return R_NONE;
        List<Object> l = (List<Object>) g;
        Map<String, Object> sel = new LinkedHashMap<String, Object>();
        sel.put("n", l.get(0)); sel.put("c", l.get(1)); sel.put("a", l.get(2)); sel.put("la", l.get(3)); sel.put("lo", l.get(4));
        pendingSel = HomeSearchCore.toJson(sel);
        return R_SHEET;
    }
    /** 시트 단추: fm.nr · fm.kr · fm.ni · fm.ki → [앱 주소, 웹 주소]. */
    public String[] sheetLink(String v) {
        if (v == null || !v.startsWith("fm.")) return null;
        String k = "nr".equals(v.substring(3)) ? "nroute" : "kr".equals(v.substring(3)) ? "kroute" : "ni".equals(v.substring(3)) ? "ninfo" : "ki".equals(v.substring(3)) ? "kinfo" : "";
        if (k.length() == 0 || !nvApp.containsKey(k)) return null;
        return new String[] { nvApp.get(k), nvWeb.get(k) };
    }
}
