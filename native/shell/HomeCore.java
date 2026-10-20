package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 홈 탭 경로 입력의 순수 자바 상태기 — 2026-10-20 (s86).
 * 웹의 fmapSearch/_fmapSetLocation/swapFmapRoute 가 하던 '무엇이 입력됐고 무엇을 골랐나'만 쥔다. 후보를 거르고 줄·글을 정하는 것은 엔진(/screen/home)이다.
 * 안드로이드·통신·시계를 쓰지 않는다(시계 값은 Env 로 받는다). 통신은 ShellActivity 가 하고, 여기는 요청 본문과 눌림의 뜻만 만든다.
 */
public final class HomeCore {
    public static final int START = 0, DEST = 1;
    public static final String[] KEYS = { "start", "dest" };

    /** 고른 장소(웹 _fmapStart/_fmapDest 와 같은 모양). */
    public static final class Loc {
        public String type = "", name = "", line = "", nodeId = "", cityCode = "";
        public double lat, lng;
        public boolean ok() { return lat != 0 && lng != 0 && name.length() > 0; }
    }

    /** 요청 시점의 시계(순수 계산에서 시계를 부르지 않으려고 밖에서 받는다). m 은 JS getMonth 처럼 0부터. */
    public static final class Env {
        public long nowMs; public int tzoMin, y, m, d; public boolean hol;
    }

    // ── 상태 ──
    public final String[] text = { "", "" };
    public final Loc[] loc = { null, null };
    public int active = -1, last = START;
    public long baseMs = -1;                         // -1 = 기준시각을 안 골랐다(지금)
    public boolean gps;

    /** 후보(눌려 있는 칸 하나에 대한 것). */
    static final class Cand {
        String q = "", fetchedQ = "";
        List<Map<String, Object>> busRaw = new ArrayList<Map<String, Object>>(), placeRaw = new ArrayList<Map<String, Object>>();
        List<Object> busDisp = new ArrayList<Object>(), placeDisp = new ArrayList<Object>();
        void clear() { q = ""; fetchedQ = ""; busRaw.clear(); placeRaw.clear(); busDisp.clear(); placeDisp.clear(); }
    }
    final Cand[] cand = { new Cand(), new Cand() };
    final List<Loc> pkU = new ArrayList<Loc>();      // 엔진이 거른 지하철 후보(응답 info.pk.u 순서)

    // ── 경로 결과(받은 응답을 그대로 들고 있다가 엔진에 다시 보낸다 — 앱은 가공하지 않는다) ──
    public static final String[] RTABS = { "fast", "less", "sub", "bus", "longdist" };
    public String routeRaw = "", resTab = "fast", resA = "", resB = "";
    public long resRb = 0, resBt = -1;
    public int resRev = 0;                                       // 결과가 바뀔 때마다 오른다(화면 캐시 열쇠)
    public boolean hasRoute() { return routeRaw.length() > 2; }
    /** 받은 경로 응답을 결과로 둔다. 모양이 JSON 객체가 아니면 버린다. */
    public boolean setRoute(String raw, String a, String b, long bt, long rb) {
        String t = raw == null ? "" : raw.trim();
        if (t.length() < 2 || t.charAt(0) != '{' || t.charAt(t.length() - 1) != '}') return false;
        routeRaw = t; resA = a == null ? "" : a; resB = b == null ? "" : b; resBt = bt; resRb = rb; resTab = "fast"; resRev++;
        return true;
    }
    public void clearRoute() { routeRaw = ""; resRev++; }
    /** 엔진 POST /screen/result 본문. */
    public String resultRequest(Env env, int cap, String theme, int tzMin) {
        return "{\"cap\":" + cap + ",\"r\":{\"data\":" + routeRaw + ",\"tab\":" + ShellCore.q(resTab)
            + ",\"a\":" + ShellCore.q(resA) + ",\"b\":" + ShellCore.q(resB)
            + ",\"bt\":" + (resBt >= 0 ? String.valueOf(resBt) : "null") + ",\"rb\":" + resRb
            + ",\"now\":" + env.nowMs + ",\"tz\":" + (-env.tzoMin) + ",\"th\":" + ShellCore.q("dark".equals(theme) ? "dark" : "pastel") + ",\"fav\":1}}";
    }
    /** 결과 화면의 눌림(rh.*). */
    public int actResult(String v) {
        if (v == null || !v.startsWith("rh.")) return R_NONE;
        if ("rh.close".equals(v)) { clearRoute(); return R_RENDER; }
        if ("rh.fav".equals(v)) return R_FAV;
        if (v.startsWith("rh.tab.")) {
            String t = v.substring(7);
            for (String x : RTABS) if (x.equals(t)) { if (!x.equals(resTab)) { resTab = x; resRev++; } return R_RESULT; }
        }
        return R_NONE;
    }

    // ═════════════ 요청 ═════════════
    /** 엔진 POST /screen/home 본문 { cap, f, d }. */
    public String request(Env env, int cap) {
        String key = active >= 0 ? KEYS[active] : "";
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{");
        b.append("\"start\":").append(ShellCore.q(text[START])).append(",\"dest\":").append(ShellCore.q(text[DEST]));
        b.append(",\"active\":").append(ShellCore.q(key));
        b.append(",\"startSet\":").append(loc[START] != null).append(",\"destSet\":").append(loc[DEST] != null).append(",\"gps\":").append(gps);
        b.append(",\"base\":{\"ms\":").append(baseMs >= 0 ? String.valueOf(baseMs) : "null");
        b.append(",\"tzo\":").append(env.tzoMin).append(",\"today\":[").append(env.y).append(',').append(env.m).append(',').append(env.d).append(']');
        b.append(",\"hol\":").append(env.hol).append("}}");
        b.append(",\"d\":");
        if (active >= 0) {
            Cand c = cand[active];
            b.append("{\"b\":").append(HomeSearchCore.toJson(c.busDisp)).append(",\"p\":").append(HomeSearchCore.toJson(c.placeDisp)).append('}');
        } else b.append("{}");
        return b.append('}').toString();
    }

    /** 엔진이 돌려 준 화면의 info 를 읽는다(지하철 후보 pk.u). */
    @SuppressWarnings("unchecked")
    public void onScreen(String json) {
        pkU.clear();
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return;
            Object info = ((Map<String, Object>) o).get("info");
            if (!(info instanceof Map)) return;
            Object pk = ((Map<String, Object>) info).get("pk");
            if (!(pk instanceof Map)) return;
            Object u = ((Map<String, Object>) pk).get("u");
            if (!(u instanceof List)) return;
            for (Object x : (List<Object>) u) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> m = (Map<String, Object>) x;
                Loc l = new Loc();
                l.type = "subway"; l.name = str(m.get("name")); l.line = str(m.get("line"));
                l.lat = HomeSearchCore.pf(m.get("lat")); l.lng = HomeSearchCore.pf(m.get("lng"));
                pkU.add(l);
            }
        } catch (Exception e) { pkU.clear(); }
    }

    // ═════════════ 입력 ═════════════
    /** 입력칸 이벤트(kind: focus · edit · blur). 반환: 화면을 다시 받아야 하면 true. */
    public boolean onText(String key, String value, String kind) {
        int f = "dest".equals(key) ? DEST : "start".equals(key) ? START : -1;
        if (f < 0) return false;
        if ("blur".equals(kind)) return false;                       // 끝남은 호출쪽이 잠깐 기다린 뒤 endActive() 를 부른다
        String v = value == null ? "" : value;
        if ("edit".equals(kind) && !v.equals(text[f])) {
            text[f] = v;
            loc[f] = null;                                           // 글을 고치면 고른 장소는 풀린다(웹 입력칸과 같다)
        }
        active = f; last = f;
        Cand c = cand[f];
        String q = text[f].trim();
        if (!q.equals(c.q)) { c.clear(); c.q = q; }
        return true;
    }
    public void endActive(int f) { if (active == f) active = -1; }

    /** 지금 눌린 칸의 글에 대해 버스·장소 후보를 새로 찾아야 하면 그 글(아니면 ""). 한 번 부르면 같은 글은 다시 안 돌려준다. */
    public String wantQuery() {
        if (active < 0) return "";
        Cand c = cand[active];
        String q = HomeSearchCore.norm(c.q);
        if (q.length() < HomeSearchCore.MIN_Q || q.equals(c.fetchedQ)) return "";
        c.fetchedQ = q;
        return q;
    }

    /** 후보 찾기 결과. field 는 글이 바뀌지 않았을 때만 받는다. */
    public boolean setCands(String q, boolean bus, List<Map<String, Object>> raw) {
        for (int f = 0; f < 2; f++) {
            Cand c = cand[f];
            if (!HomeSearchCore.norm(c.q).equals(q)) continue;
            List<Object> disp = new ArrayList<Object>();
            for (Map<String, Object> r : raw) disp.add(bus ? HomeSearchCore.busDisp(r) : HomeSearchCore.placeDisp(r));
            if (bus) { c.busRaw = new ArrayList<Map<String, Object>>(raw); c.busDisp = disp; }
            else { c.placeRaw = new ArrayList<Map<String, Object>>(raw); c.placeDisp = disp; }
            return true;
        }
        return false;
    }

    // ═════════════ 눌림 ═════════════
    public static final int R_NONE = 0, R_RENDER = 1, R_GPS = 2, R_GO = 3, R_PICK_TIME = 4, R_FIELDS = 5, R_NEED_BOTH = 6, R_RESULT = 7, R_FAV = 8;

    /** 홈 화면의 눌림(a:'call' 의 v). R_FIELDS 는 입력칸 글자를 화면에 다시 써야 한다는 뜻. */
    public int act(String v, java.util.Map<String, String> fields) {
        if (v == null) return R_NONE;
        if (v.startsWith("rh.")) return actResult(v);
        if (fields != null) {                                        // 화면 입력칸의 지금 글자를 먼저 받아 둔다
            for (int f = 0; f < 2; f++) { String t = fields.get(KEYS[f]); if (t != null && !t.equals(text[f])) { text[f] = t; loc[f] = null; } }
        }
        if (v.startsWith("sg.") && v.length() > 5 && v.charAt(4) == '.') {
            char kind = v.charAt(3);
            int idx;
            try { idx = Integer.parseInt(v.substring(5)); } catch (NumberFormatException e) { return R_NONE; }
            return choose(kind, idx) ? R_FIELDS : R_NONE;
        }
        if ("rt.gps".equals(v)) return gps ? R_NONE : R_GPS;
        if ("rt.swap".equals(v)) { swap(); return R_FIELDS; }
        if ("rt.go".equals(v) || "rt.enter".equals(v)) {
            if (text[START].trim().length() > 0 && text[DEST].trim().length() > 0) { active = -1; return R_GO; }
            return "rt.go".equals(v) ? R_NEED_BOTH : R_RENDER;
        }
        if ("bt.pick".equals(v)) return R_PICK_TIME;
        if ("bt.now".equals(v)) { baseMs = -1; return R_RENDER; }
        return R_NONE;
    }

    /** 후보 고르기(kind u 지하철 · b 버스정류장 · p 장소) — 웹 fmapSearch 눌림과 같다. */
    @SuppressWarnings("unchecked")
    public boolean choose(char kind, int idx) {
        int f = active >= 0 ? active : last;
        Cand c = cand[f];
        Loc l = new Loc();
        if (kind == 'u') {
            if (idx < 0 || idx >= pkU.size() || pkU.get(idx).name.length() == 0) return false;
            Loc s = pkU.get(idx);
            l.type = "subway"; l.name = s.name; l.line = s.line; l.lat = s.lat; l.lng = s.lng;
        } else if (kind == 'b') {
            if (idx < 0 || idx >= c.busRaw.size()) return false;
            Map<String, Object> s = c.busRaw.get(idx);
            String nm = str(s.get("nodenm")); if (nm.length() == 0) nm = str(s.get("nodeName"));
            l.type = "bus"; l.name = nm;
            l.nodeId = str(s.get("nodeid")); if (l.nodeId.length() == 0) l.nodeId = str(s.get("nodeId"));
            l.cityCode = str(s.get("citycode")); if (l.cityCode.length() == 0) l.cityCode = str(s.get("cityCode"));
            l.lat = HomeSearchCore.pf(s.get("gpslati") != null ? s.get("gpslati") : s.get("gpsLati"));
            l.lng = HomeSearchCore.pf(s.get("gpslong") != null ? s.get("gpslong") : s.get("gpsLong"));
        } else if (kind == 'p') {
            if (idx < 0 || idx >= c.placeRaw.size()) return false;
            Map<String, Object> s = c.placeRaw.get(idx);
            l.type = "address"; l.name = str(s.get("place_name"));
            l.lat = HomeSearchCore.pf(s.get("y")); l.lng = HomeSearchCore.pf(s.get("x"));
        } else return false;
        if (l.name.length() == 0) return false;
        text[f] = l.name; loc[f] = l;
        c.clear(); c.q = l.name; c.fetchedQ = l.name;
        pkU.clear();
        active = -1;
        return true;
    }

    public void swap() {
        String t = text[START]; text[START] = text[DEST]; text[DEST] = t;
        Loc l = loc[START]; loc[START] = loc[DEST]; loc[DEST] = l;
        cand[START].clear(); cand[DEST].clear(); pkU.clear();
        active = -1;
    }

    /** 위치 감지 결과를 출발지로 둔다. */
    public void setGpsStart(double lat, double lng) {
        Loc l = new Loc();
        l.type = "gps"; l.name = "내 위치"; l.lat = lat; l.lng = lng;
        text[START] = l.name; loc[START] = l;
        cand[START].clear(); pkU.clear();
        if (active == START) active = -1;
        gps = false;
    }

    // ═════════════ 경로 요청 ═════════════
    /** 경로 서버 질의(웹 fmapDoRoute 의 _coordQs 와 같다). 좌표가 빠진 장소가 있으면 null. */
    public static String routeQuery(Loc s, Loc d, long baseMs, boolean pickedBase) {
        if (s == null || d == null || s.lat == 0 || s.lng == 0 || d.lat == 0 || d.lng == 0) return null;
        return "SX=" + num(s.lng) + "&SY=" + num(s.lat) + "&EX=" + num(d.lng) + "&EY=" + num(d.lat)
            + "&baseMs=" + baseMs + (pickedBase ? "&bf=1" : "")
            + "&SN=" + HomeSearchCore.enc(cut(s.name, 60)) + "&EN=" + HomeSearchCore.enc(cut(d.name, 60));
    }
    public static String routeUrl(String qs) { return ShellCore.BASE + "/route-v2-app?" + qs; }

    static String num(double v) { return (v == Math.rint(v) && Math.abs(v) < 1e15) ? String.valueOf((long) v) : String.valueOf(v); }
    static String cut(String s, int n) { return s.length() > n ? s.substring(0, n) : s; }
    static String str(Object o) { return o instanceof String ? (String) o : (o instanceof Double && ((Double) o) == Math.rint((Double) o) ? String.valueOf(((Double) o).longValue()) : ""); }

    // ═════════════ 기준시각 문구용 값 ═════════════
    public static Map<String, Object> emptyMap() { return new LinkedHashMap<String, Object>(); }
}
