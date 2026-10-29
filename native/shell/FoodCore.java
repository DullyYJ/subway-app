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
    public static final int R_NONE = 0, R_RENDER = 1, R_REFRESH = 2, R_SHEET = 3, R_CLOSE = 4, R_OPEN = 5, R_PANEL = 6, R_UNPANEL = 7, R_LINK = 8;

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
    String srvJ = "", pubJ = "";                  // srv · pub 을 엔진에 보낼 글로 바꾼 것
    List<Object> pub = new ArrayList<Object>();  // 공공데이터 행 [상호, 중분류, 소분류, 도로명, 지번, 위도, 경도]

    // ── 마지막 화면에서 읽은 것 ──
    public double[] ctr = null;                  // 엔진이 정한 중심 좌표
    final Map<String, Object> go = new LinkedHashMap<String, Object>();
    final Map<String, String> alts = new LinkedHashMap<String, String>();   // 칩 → 그 칩의 화면 글
    public String selName = ""; public double selLa, selLo;   // 가게 시트의 가게(카카오 장소 ID 조회용)
    public String pendingSel = "";               // 눌린 가게(시트 요청용 JSON)
    public String stnName = "";                  // 엔진이 정한 도착역(또는 가까운 역) 이름 — 지도 펼침의 '출발'
    // ── 가게 지도 펼침(웹 _foodShowMap): 카드 바로 아래에 끼운다. 무엇을 그릴지는 엔진(f.pn)이 정하고, 앱은 그 노드를 목록 화면의 그 카드 뒤에 끼우기만 한다 ──
    public String openKey = "";                  // 펼친 가게 번호(예: c.12) — 같은 카드를 또 누르면 접는다
    String panelAfter = "";                      // 끼울 자리 = 그 카드의 act (fm.c.12)
    List<Object> panelNodes = null;              // 엔진이 만든 펼침 노드
    final Map<String, String> panelRes = new LinkedHashMap<String, String>();    // 받아 온 경로 글(rt · ro) — 실패는 빈 글
    public List<String[]> panelNeed = new ArrayList<String[]>();                  // 엔진이 더 받아 오라는 {k, url}
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
    public void invalidate() { loaded = false; failed = false; alts.clear(); go.clear(); ctr = null; centerKey = ""; srv = new ArrayList<Object>(); pub = new ArrayList<Object>(); srvJ = ""; pubJ = ""; }
    public void refresh() { closePanel(); invalidate(); loadedAt = 0; if (dest.length() == 0) gps = null; }

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
        public boolean srvOk = false, pubOk = false;     // pubOk: 공공데이터 쪽이 한 쪽이라도 읽혔다(빈 목록 포함)
        public List<Object> srv = new ArrayList<Object>(), pub = new ArrayList<Object>();
        public String srvJ = "", pubJ = "";            // 엔진에 보낼 글(통신 스레드에서 미리 만들어 둔다 — 주 스레드에서 수천 줄을 글로 바꾸지 않게)
    }
    @SuppressWarnings("unchecked")
    public static Data parseData(String serverJson, List<String> pubPages) {   // 서버: {items:[{n,c,a,d,lo,la}…]}
        Data d = new Data();
        try {
            Object o = ScreenCore.parse(serverJson);
            if (o instanceof Map) {
                Object it = ((Map<String, Object>) o).get("items");
                d.srv = it instanceof List ? new ArrayList<Object>((List<Object>) it) : new ArrayList<Object>();
                d.srvOk = it instanceof List;                                    // s255: items 가 없는 답(오류 봉투 등)은 가게 없음이 아니라 못 받음
            }
        } catch (Exception e) { d.srvOk = false; }
        for (String p : pubPages) if (rows(p, d.pub) >= 0) d.pubOk = true;
        d.srvJ = HomeSearchCore.toJson(d.srv); d.pubJ = HomeSearchCore.toJson(d.pub);
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
        srv = d.srv; pub = d.pub; srvJ = d.srvJ; pubJ = d.pubJ; failed = !d.srvOk || (d.pub.isEmpty() && !d.pubOk);          // s255: 두 쪽 다 비었는데 공공데이터 쪽이 아예 안 읽혔으면 '없다'가 아니라 '못 받았다'
        loaded = true; centerKey = ctr == null ? "" : key(ctr); loadedAt = System.currentTimeMillis();
    }

    // ── 주소 ──
    public String serverUrl() { return FOOD_BASE + "/food?lat=" + ctr[0] + "&lng=" + ctr[1] + "&r=" + RADIUS + "&limit=" + LIMIT; }
    /** 공유 저장소(엔진 /food-pub): 같은 칸(약 200m)을 먼저 누른 사람이 받아 둔 공공데이터를 한 번에 받는다. 30일 넘은 칸은 엔진이 다시 받아 덮어쓴다. */
    public String sharedUrl() { return ShellCore.BASE + "/food-pub?lat=" + ctr[0] + "&lng=" + ctr[1]; }
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
        if (withData && loaded) b.append(",\"s\":").append(srvJ.length() > 0 ? srvJ : HomeSearchCore.toJson(srv)).append(",\"u\":").append(pubJ.length() > 0 ? pubJ : HomeSearchCore.toJson(pub));
        b.append(",\"alts\":\"chips\"}");
        return b.toString();
    }
    /** 가게 지도 펼침 본문(엔진 f.pn=1): 고른 가게 · 내 위치 · 도착역 좌표와 이름 · 이미 받은 경로 글. */
    public String panelRequest(int cap) { return panelBody(cap, pendingSel, true); }
    /** 눌러 보기 전에 미리 받아 둘 펼침 본문(첫 왕복 — 경로 글 없음). 목록에 없는 가게면 "". */
    public String panelRequestFor(int cap, String k) { String sel = selJson(k); return sel.length() == 0 ? "" : panelBody(cap, sel, false); }
    /** 목록 순서대로 가게 열쇠 최대 max 개. */
    public List<String> goKeys(int max) { List<String> r = new ArrayList<String>(); for (String k : go.keySet()) { if (r.size() >= max) break; r.add(k); } return r; }
    @SuppressWarnings("unchecked")
    private String selJson(String k) {
        Object g = go.get(k);
        if (!(g instanceof List) || ((List<Object>) g).size() < 5) return "";
        List<Object> l = (List<Object>) g;
        Map<String, Object> sel = new LinkedHashMap<String, Object>();
        sel.put("n", l.get(0)); sel.put("c", l.get(1)); sel.put("a", l.get(2)); sel.put("la", l.get(3)); sel.put("lo", l.get(4));
        return HomeSearchCore.toJson(sel);
    }
    private String panelBody(int cap, String selJ, boolean withRes) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{\"pn\":1,\"sel\":").append(selJ).append(",\"me\":").append(ll(gps)).append(",\"ctr\":").append(ll(ctr)).append(",\"stn\":").append(ShellCore.q(stnName)).append(",\"dst\":").append(dest.length() > 0 ? 1 : 0);
        if (withRes && !panelRes.isEmpty()) {
            b.append(",\"res\":{"); boolean first = true;
            for (Map.Entry<String, String> e : panelRes.entrySet()) { if (!first) b.append(','); first = false; b.append(ShellCore.q(e.getKey())).append(':').append(ShellCore.q(e.getValue())); }
            b.append('}');
        }
        return b.append("}}").toString();
    }
    /** 가게 시트 본문. */
    public String sheetRequest(int cap, double[] me) {
        return "{\"cap\":" + cap + ",\"f\":{\"sel\":" + pendingSel + ",\"me\":" + ll(me) + "}}";
    }

    // ── 받은 화면에서 읽기 ──
    /** 받은 목록 화면에서 읽은 것(무거운 읽기는 통신 스레드에서 하고, 주 스레드는 apply 로 값만 옮긴다). */
    public static final class Parsed {
        boolean ok; double[] ctr; String stn; Map<String, Object> go = new LinkedHashMap<String, Object>(); Map<String, String> alts = new LinkedHashMap<String, String>();
    }
    @SuppressWarnings("unchecked")
    public static Parsed parseScreen(String json) {
        Parsed pr = new Parsed();
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return pr;
            Map<String, Object> m = (Map<String, Object>) o;
            Object i = m.get("info");
            if (i instanceof Map) {
                Map<String, Object> im = (Map<String, Object>) i;
                Object c = im.get("ctr");
                if (c instanceof List && ((List<Object>) c).size() == 2) { List<Object> cl = (List<Object>) c; pr.ctr = new double[] { BoardCore.d(cl.get(0)), BoardCore.d(cl.get(1)) }; }
                if (im.get("go") instanceof Map) pr.go.putAll((Map<String, Object>) im.get("go"));
                if (im.get("stn") instanceof String) pr.stn = BoardCore.s(im.get("stn"), 30);
            }
            if (m.get("alts") instanceof Map) for (Map.Entry<String, Object> e : ((Map<String, Object>) m.get("alts")).entrySet()) pr.alts.put(e.getKey(), HomeSearchCore.toJson(e.getValue()));
            pr.ok = true;
        } catch (Exception e) { pr.ok = false; }
        return pr;
    }
    public void apply(Parsed pr) {
        if (pr == null || !pr.ok) return;                                   // 읽을 수 없으면 이전 값 유지
        go.clear(); go.putAll(pr.go);
        ctr = pr.ctr;
        if (pr.stn != null) stnName = pr.stn;
        alts.clear(); alts.putAll(pr.alts);
    }
    public void onScreen(String json) { apply(parseScreen(json)); }
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
    public boolean pickChip(String chip) { closePanel(); flt = chip == null || chip.length() == 0 ? "전체" : chip; return alts.containsKey(flt); }

    /** v: fm.c.<번호> · fm.p.<번호>. 가게 시트를 열 수 있으면 R_SHEET. */
    @SuppressWarnings("unchecked")
    public int act(String v) {
        if (v == null || !v.startsWith("fm.")) return R_NONE;
        String k = v.substring(3);
        if ("close".equals(k)) return R_CLOSE;
        if (("nr".equals(k) || "kr".equals(k) || "ni".equals(k) || "ki".equals(k)) && openKey.length() > 0) return R_LINK;
        Object g = go.get(k);
        if (!(g instanceof List) || ((List<Object>) g).size() < 5) return R_NONE;
        List<Object> l = (List<Object>) g;
        Map<String, Object> sel = new LinkedHashMap<String, Object>();
        sel.put("n", l.get(0)); sel.put("c", l.get(1)); sel.put("a", l.get(2)); sel.put("la", l.get(3)); sel.put("lo", l.get(4));
        pendingSel = HomeSearchCore.toJson(sel);
        selName = l.get(0) instanceof String ? (String) l.get(0) : ""; selLa = l.get(3) instanceof Number ? ((Number) l.get(3)).doubleValue() : 0; selLo = l.get(4) instanceof Number ? ((Number) l.get(4)).doubleValue() : 0;
        if (k.equals(openKey)) { closePanel(); return R_UNPANEL; }                 // 열려 있는 카드를 또 누르면 접는다(웹 토글)
        openKey = k; panelAfter = "fm." + k; panelNodes = null; panelRes.clear(); panelNeed.clear();
        return R_PANEL;
    }
    /** 눌렀을 때 펼침 답이 오기 전에 자리부터 보이는 뼈대(받으면 그 자리에서 진짜 펼침으로 바뀐다). */
    public boolean panelSkel;
    @SuppressWarnings("unchecked")
    public void showPanelSkeleton() {
        try {
            Object o = ScreenCore.parse("{\"t\":\"skel\",\"kind\":\"map\",\"rows\":2,\"pad\":[12,6,12,10]}");
            List<Object> l = new ArrayList<Object>(); l.add(o); panelNodes = l; panelSkel = true;
        } catch (Exception e) { panelNodes = null; panelSkel = false; }
    }
    public void closePanel() { panelSkel = false; openKey = ""; panelAfter = ""; panelNodes = null; panelRes.clear(); panelNeed.clear(); nvApp.clear(); nvWeb.clear(); }
    /** 엔진의 펼침 화면을 읽는다: 끼울 노드 · 열 주소(info.nv) · 더 받아 올 주소(info.need). 읽을 수 없으면 false. */
    @SuppressWarnings("unchecked")
    public boolean onPanel(String json) {
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return false;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok")) || !(m.get("body") instanceof List) || ((List<Object>) m.get("body")).isEmpty()) return false;
            panelNodes = new ArrayList<Object>((List<Object>) m.get("body")); panelSkel = false;
            panelNeed.clear();
            Object i = m.get("info");
            if (i instanceof Map) {
                Map<String, Object> im = (Map<String, Object>) i;
                if (im.get("need") instanceof List) for (Object x : (List<Object>) im.get("need")) {
                    if (!(x instanceof Map)) continue;
                    String k = BoardCore.s(((Map<String, Object>) x).get("k"), 8), u = BoardCore.s(((Map<String, Object>) x).get("url"), 1500);
                    if (k.length() > 0 && u.startsWith("https://") && !panelRes.containsKey(k)) panelNeed.add(new String[] { k, u });
                }
            }
            onSheet(json);                                                          // info.nv → 네이버 · 카카오 단추 주소
            return true;
        } catch (Exception e) { return false; }
    }
    public void panelGot(String k, String body) { panelRes.put(k, body == null ? "" : body); }
    /** 목록 화면 글에 펼침을 끼운 글. 펼침이 없거나 그 카드가 목록에 없으면 원래 글 그대로. */
    @SuppressWarnings("unchecked")
    public String withPanel(String listTxt) {
        if (openKey.length() == 0 || panelNodes == null || listTxt == null) return listTxt;
        try {
            Object o = ScreenCore.parse(listTxt);
            if (!(o instanceof Map)) return listTxt;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!(m.get("body") instanceof List)) return listTxt;
            List<Object> body = new ArrayList<Object>((List<Object>) m.get("body"));
            int at = -1;
            for (int i = 0; i < body.size(); i++) {
                Object n = body.get(i);
                if (!(n instanceof Map)) continue;
                Object a = ((Map<String, Object>) n).get("act");
                if (a instanceof Map && panelAfter.equals(((Map<String, Object>) a).get("v"))) { at = i; break; }
            }
            if (at < 0) return listTxt;
            body.addAll(at + 1, panelNodes);
            m.put("body", body);
            Object rv = m.get("rev");
            m.put("rev", (rv instanceof String ? (String) rv : "") + "+" + openKey + ":" + (panelNodes.hashCode() & 0x7fffffff));
            return HomeSearchCore.toJson(m);
        } catch (Exception e) { return listTxt; }
    }
    /** 시트 단추: fm.nr · fm.kr · fm.ni · fm.ki → [앱 주소, 웹 주소]. */
    public String[] sheetLink(String v) {
        if (v == null || !v.startsWith("fm.")) return null;
        String k = "nr".equals(v.substring(3)) ? "nroute" : "kr".equals(v.substring(3)) ? "kroute" : "ni".equals(v.substring(3)) ? "ninfo" : "ki".equals(v.substring(3)) ? "kinfo" : "";
        if (k.length() == 0 || !nvApp.containsKey(k)) return null;
        return new String[] { nvApp.get(k), nvWeb.get(k) };
    }

    /** 시트의 [카카오맵에서 가게 정보]: 엔진에 가게 이름+좌표로 카카오 장소 주소를 묻는 본문. 좌표를 모르면 "" (이름 검색 주소로 바로 연다). */
    public String kakaoIdBody() {
        if (selName.length() == 0 || (selLa == 0 && selLo == 0)) return "";
        return "{\"op\":\"kakaoId\",\"name\":" + ShellCore.q(selName) + ",\"la\":" + selLa + ",\"lo\":" + selLo + "}";
    }
    /** 엔진 응답 → [앱 주소, 웹 주소]. 장소를 못 찾았거나 응답이 이상하면 null (이름 검색 주소로 연다). */
    @SuppressWarnings("unchecked")
    public static String[] kakaoIdLink(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            String app = BoardCore.s(m.get("app"), 80), web = BoardCore.s(m.get("web"), 80);
            if (!Boolean.TRUE.equals(m.get("ok")) || !app.startsWith("kakaomap://place?id=") || !web.startsWith("https://place.map.kakao.com/")) return null;
            return new String[] { app, web };
        } catch (ScreenCore.ParseError e) { return null; }
    }
}
