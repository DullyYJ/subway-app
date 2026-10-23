package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 지도 탭의 순수 자바 상태기 — 2026-10-20 (s91).
 * 어떤 칩·문구·목록을 보일지, 역 → 노선 표, 검색 규칙, 가까운 역, 시간표 요약은 엔진(/screen/map)이 정한다.
 * 여기는 이 기기가 쥔 사실(안쪽 탭·지역·호선 필터·눌린 역·시간표 요청 상태)과 서버가 준 시간표 응답을 엔진이 읽는 모양으로 옮기고, 눌림의 뜻을 정한다.
 * 노선도 그림은 MetroMapView, 통신·위치·시트는 ShellActivity 가 한다.
 */
public final class MapCore {
    public static final String K_MODE = "map_mode", K_REG = "map_reg", K_FLT = "map_flt";
    public static final String K_BUSVW = "map_busvw", K_BUSFAV = "bus_fav", K_BUSAL = "bus_al", K_BUSORD = "bus_ord", VW_NEAR = "near", VW_FAV = "fav";
    public static final int R_NONE = 0, R_RENDER = 1, R_FIND = 2, R_LOC = 3, R_STN = 4, R_START = 5, R_DEST = 6, R_TT = 7, R_CLOSE = 8, R_TT_LOAD = 9, R_TT_RENDER = 10, R_BUS_LOC = 11, R_BUS_VIEW = 12, R_BUS_REF = 13, R_BUS_SEL = 14, R_ALIAS = 15,
            R_BR_OPEN = 16, R_BR_RENDER = 17, R_BR_REFRESH = 18, R_BR_CLOSE = 19, R_BR_START = 20, R_BR_FINISH = 21, R_BR_TOSTN = 22, R_BR_CANCEL = 23, R_BR_SAME = 24;

    private final ShellCore.Store st;
    public MapCore(ShellCore.Store st) { this.st = st; }

    /** 미리 받기 전용: 고른 방식과 상관없이 이 방식으로 요청을 만든다(null 이면 고른 방식). */
    public String modeOverride = null;
    public String mode() { return modeOverride != null ? modeOverride : "subway".equals(st.get(K_MODE, "bus")) ? "subway" : "bus"; }
    public String reg() { String r = st.get(K_REG, "seoul"); return r.matches("seoul|busan|daegu|gwangju|daejeon") ? r : "seoul"; }
    public String flt() { String f = st.get(K_FLT, "ALL"); return f.length() > 0 && f.length() < 12 ? f : "ALL"; }
    public double[] gps = null;

    // ── 버스: 이 기기의 위치 사실 + 엔진이 받아 오라고 한 주소의 본문(해석은 엔진) ──
    public double[] busLL = null;
    final Map<String, String> busRes = new LinkedHashMap<String, String>();
    public final List<String[]> busNeed = new ArrayList<String[]>();           // [k, 주소]
    /** 서버가 정류장·도착정보를 한 번에 받아 준 적이 있다(그러면 갱신도 서버에 한 번에 맡긴다) · 이번 응답에서 서버가 못 받은 도착정보 수. */
    public boolean svServer; public int svFail;
    /** 서버가 도착정보를 기다리는 시간(ms): 처음 그릴 때는 짧게(정류장부터 먼저 보이고 도착정보는 이어서), 조용한 갱신은 넉넉히. */
    public int svb = 300;
    public void setBusLoc(double la, double lo) { busLL = new double[] { la, lo }; busRes.clear(); busNeed.clear(); busSel = -1; stopsSaved = false; loadStopsCache(); }
    // ── 주변 정류장 목록(tp · gg · tn · d1)은 거의 안 바뀐다 — 같은 곳(약 110m 칸)이면 기기에 24시간 두고 바로 쓴다(SWR: 도착정보만 새로). 도착정보(a · f)는 절대 두지 않는다.
    private static final long STOPS_TTL_MS = 24L * 3600L * 1000L;
    private boolean stopsSaved;
    private String stopsKey() { return busLL == null ? "" : "bsc_" + Math.round(busLL[0] * 1000.0) + "_" + Math.round(busLL[1] * 1000.0); }
    @SuppressWarnings("unchecked")
    private void loadStopsCache() {
        String k = stopsKey();
        if (k.length() == 0) return;
        try {
            String raw = st.get(k, "");
            if (raw.length() == 0) return;
            Object o = ScreenCore.parse(raw);
            if (!(o instanceof Map)) return;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!(m.get("t") instanceof Double) || System.currentTimeMillis() - ((Double) m.get("t")).longValue() > STOPS_TTL_MS || !(m.get("r") instanceof Map)) return;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) m.get("r")).entrySet())
                if (e.getKey().matches("tp|gg|tn|d1") && e.getValue() instanceof String) busRes.put(e.getKey(), (String) e.getValue());
            stopsSaved = true;                                                                  // 방금 읽은 것을 다시 쓰지 않는다
        } catch (Exception e) { /* 못 읽으면 새로 받는다 */ }
    }
    /** 정류장 목록을 다 받았다 — 이 자리 칸에 보관한다(처음 한 번). 호출하는 쪽이 정류장이 있는 화면일 때만 부른다. */
    public int stopCount() { return stopJson.size(); }
    /** 지금 목록의 정류장 열쇠(id) 묶음 — 위치가 바뀌어도 같은 정류장들이면 같다(거리는 넣지 않는다). */
    public String stopSig() {
        StringBuilder b = new StringBuilder();
        java.util.regex.Pattern p = java.util.regex.Pattern.compile("\"id\"\\s*:\\s*\"([^\"]*)\"");
        for (String sj : stopJson) { java.util.regex.Matcher m = p.matcher(sj); b.append(m.find() ? m.group(1) : sj.hashCode()).append('|'); }
        return b.toString();
    }
    public boolean saveStopsCache() {
        if (!VW_NEAR.equals(busView()) || stopJson.isEmpty()) return false;
        String k = stopsKey();
        if (k.length() == 0 || stopsSaved) return false;
        StringBuilder b = new StringBuilder("{\"t\":").append(System.currentTimeMillis()).append(",\"r\":{");
        boolean first = true; int total = 0;
        for (String key : new String[] { "tp", "gg", "tn", "d1" }) {
            String v = busRes.get(key);
            if (v == null) continue;
            total += v.length();
            if (!first) b.append(','); first = false;
            b.append(ShellCore.q(key)).append(':').append(ShellCore.q(v));
        }
        if (first || total > 200000) return false;
        b.append("}}");
        String idx = st.get("bsc_idx", "");
        List<String> ids = new ArrayList<String>(java.util.Arrays.asList(idx.length() == 0 ? new String[0] : idx.split(",")));
        ids.remove(k); ids.add(k);
        while (ids.size() > 4) st.put(ids.remove(0), "");                                         // 최근 4곳만
        st.put(k, b.toString());
        StringBuilder ix = new StringBuilder();
        for (String id : ids) { if (ix.length() > 0) ix.append(','); ix.append(id); }
        st.put("bsc_idx", ix.toString());
        stopsSaved = true;
        return true;
    }
    /** 주변 정류장 / 즐겨찾기 (웹 _busViewMode). 저장소에 두어 캐시 열쇠가 알아본다. */
    public String busView() { return VW_FAV.equals(st.get(K_BUSVW, VW_NEAR)) ? VW_FAV : VW_NEAR; }
    public int busSel = -1;                                      // 지도·카드에서 고른 정류장 번호(엔진이 핀·카드 강조를 정한다)
    final java.util.Map<Integer, List<String[]>> rts = new java.util.HashMap<Integer, List<String[]>>();       // 정류장 번호 → 줄마다 [노선 id, 번호, 종류] (엔진이 알려 준다)
    final List<String> stopJson = new ArrayList<String>();       // 엔진이 알려 준 현재 목록(info.stops)의 정류장 값 — 즐겨찾기로 저장할 때 그대로 쓴다
    public String toast = "", aliasKey = "", aliasName = "", aliasCur = "";
    private String favRaw() { String f = st.get(K_BUSFAV, "[]"); return f.startsWith("[") && f.length() < 30000 ? f : "[]"; }
    private String ordRaw() { String f = st.get(K_BUSORD, "[]"); return f.startsWith("[") && f.length() < 6000 ? f : "[]"; }
    private String alRaw() { String f = st.get(K_BUSAL, "{}"); return f.startsWith("{") && f.length() < 12000 ? f : "{}"; }
    /** 30초 자동 새로고침: 정류장 목록(tp·gg·tn·d1)은 두고 도착정보(a0.. · f0..)만 비워 엔진이 다시 받아 오게 한다. */
    private long arrAt;       // 도착정보(a·f)를 마지막으로 받은 시각 — 엔진이 이 값으로 다시 그린 화면의 초는 그만큼 이미 흐른 것
    public long arrAge() { return arrAt > 0L ? Math.max(0L, System.currentTimeMillis() - arrAt) : 0L; }
    private final java.util.HashMap<String, String> arrStash = new java.util.HashMap<String, String>();
    private long arrStashAt;
    /** 8초 갱신을 시작한다: 보던 도착정보는 따로 챙겨 두고 비운다(새로 받기가 실패하면 restoreArrivals 로 되돌린다 — 비어 버린 채 남아 "도착정보 없음"이 되지 않게). */
    public void dropArrivals() {
        if (arrStash.isEmpty()) {
            for (Map.Entry<String, String> e : busRes.entrySet()) if (e.getKey().matches("[af][0-9]{1,3}")) arrStash.put(e.getKey(), e.getValue());
            arrStashAt = arrAt;
        }
        arrAt = 0L;
        java.util.Iterator<String> it = busRes.keySet().iterator(); while (it.hasNext()) { if (it.next().matches("[af][0-9]{1,3}")) it.remove(); }
        busNeed.clear();
    }
    /** 새로 못 받은 도착정보(a · f)만 갱신 전에 보던 값으로 채운다 — 채운 개수. */
    public int fillFromStash() { int c = 0; for (Map.Entry<String, String> e : arrStash.entrySet()) if (!busRes.containsKey(e.getKey())) { busRes.put(e.getKey(), e.getValue()); c++; } return c; }
    public void restoreArrivals() { if (!arrStash.isEmpty()) { busRes.putAll(arrStash); arrAt = arrStashAt; arrStash.clear(); } busNeed.clear(); }
    public void commitArrivals() { arrStash.clear(); }
    // ── 도착정보 미리 받기(투기적 선(先)받기): 엔진이 지난번에 "이 주소들을 받아 와라" 한 도착정보 주소(a0.. · f0..)를 기억해 두었다가, 같은 정류장 목록 · 같은 보기이면
    //    엔진에게 "무엇을 받을까"를 다시 묻지 않고 곧장 받아 한 번에 그리게 한다(엔진 왕복 1회 절약). 주소를 만드는 것은 여전히 엔진 — 앱은 엔진이 준 주소를 되쓸 뿐이다.
    //    정류장 목록 · 보기 · 즐겨찾기가 하나라도 달라졌으면(열쇠가 다르면) 쓰지 않는다 — 다른 정류장의 도착정보가 섞이지 않게.
    private final List<String[]> lastArrNeed = new ArrayList<String[]>();
    private String lastArrSig = "";
    static final String K_BSN = "bsn";
    private String arrSig() {
        StringBuilder b = new StringBuilder(busView()).append('|').append(favRaw().hashCode()).append('|').append(ordRaw().hashCode()).append('|').append(stopsKey());
        for (String k : new String[] { "tp", "gg", "tn", "d1" }) { String v = busRes.get(k); b.append('|').append(v == null ? -1 : v.length()).append(':').append(v == null ? 0 : v.hashCode()); }
        return b.toString();
    }
    /** 엔진이 받아 오라고 한 목록 중 도착정보(a · f) 주소만 기억한다(기기에도 보관 — 앱을 껐다 켜도 첫 갱신이 빠르다). */
    public void rememberNeed(List<String[]> need) {
        List<String[]> keep = new ArrayList<String[]>();
        for (String[] n : need) if (n != null && n.length == 2 && n[0].matches("[af][0-9]{1,3}") && n[1].length() > 0 && n[1].length() < 600 && n[1].indexOf('\t') < 0 && n[1].indexOf('\n') < 0) keep.add(n);
        if (keep.isEmpty()) return;
        lastArrNeed.clear(); lastArrNeed.addAll(keep); lastArrSig = arrSig();
        saveNeed();
    }
    private void saveNeed() {
        StringBuilder o = new StringBuilder().append(lastArrSig.hashCode());
        for (String[] n : lastArrNeed) o.append('\n').append(n[0]).append('\t').append(n[1]);
        if (o.length() < 20000) st.put(K_BSN, o.toString());
    }
    /**
     * 주변 정류장 카드를 끌어서 순서를 바꿨다(웹 _busPersistDomOrder · busNearOrder). keys = 새 순서의 정류장 열쇠, perm[j] = 새 j 번째 카드가 옛 화면에서 몇 번째였나.
     * 열쇠 목록은 기기에 저장해 다음 요청에 실어 보낸다(엔진이 그 순서로 그린다). 이미 받아 둔 도착정보(a0 ·a1 …)와 미리 받기 주소는 번호가 바뀐 만큼 옮겨 두어, 다시 받는 동안 비어 보이지 않게 한다.
     * @return 저장했으면 true(모양이 이상하면 아무것도 바꾸지 않는다)
     */
    public boolean reorderNear(String[] keys, int[] perm) {
        if (keys == null || perm == null || keys.length != perm.length || keys.length < 2 || keys.length > 40) return false;
        boolean[] seen = new boolean[perm.length];
        for (int i = 0; i < perm.length; i++) { if (perm[i] < 0 || perm[i] >= perm.length || seen[perm[i]] || keys[i] == null || keys[i].length() == 0 || keys[i].length() > 64) return false; seen[perm[i]] = true; }
        StringBuilder o = new StringBuilder("[");
        for (int i = 0; i < keys.length; i++) { if (i > 0) o.append(','); o.append(ShellCore.q(keys[i])); }
        st.put(K_BUSORD, o.append(']').toString());
        permuteArr(busRes, perm); permuteArr(arrStash, perm);
        arrKeyAt.clear();
        if (!lastArrNeed.isEmpty()) {
            String[] old = new String[perm.length];
            List<String[]> rest = new ArrayList<String[]>();
            for (String[] n : lastArrNeed) { int ix = n[0].matches("a[0-9]{1,3}") ? Integer.parseInt(n[0].substring(1)) : -1; if (ix >= 0 && ix < old.length) old[ix] = n[1]; else rest.add(n); }
            lastArrNeed.clear();
            for (int j = 0; j < perm.length; j++) if (old[perm[j]] != null) lastArrNeed.add(new String[] { "a" + j, old[perm[j]] });
            lastArrNeed.addAll(rest);
            lastArrSig = arrSig(); saveNeed();
        }
        busSel = -1; busNeed.clear();
        return true;
    }
    private static void permuteArr(Map<String, String> m, int[] perm) {
        String[] old = new String[perm.length];
        for (int i = 0; i < perm.length; i++) old[i] = m.get("a" + i);
        for (int j = 0; j < perm.length; j++) { if (old[perm[j]] != null) m.put("a" + j, old[perm[j]]); else m.remove("a" + j); }
    }
    /** 지금 상태에서 바로 받아도 되는 도착정보 주소들([k, 주소]) — 없으면 빈 목록(평소처럼 엔진에게 묻는다). */
    public List<String[]> speculativeNeed() {
        if (busLL == null) return new ArrayList<String[]>();
        if (lastArrNeed.isEmpty()) {
            String raw = st.get(K_BSN, "");
            if (raw.length() > 0) {
                String[] ln = raw.split("\n");
                if (ln.length >= 2 && ln[0].equals(String.valueOf(arrSig().hashCode()))) {
                    for (int i = 1; i < ln.length; i++) { String[] kv = ln[i].split("\t", 2); if (kv.length == 2 && kv[0].matches("[af][0-9]{1,3}") && kv[1].length() > 0) lastArrNeed.add(kv); }
                    lastArrSig = arrSig();
                }
            }
        }
        if (lastArrNeed.isEmpty() || !lastArrSig.equals(arrSig())) return new ArrayList<String[]>();
        return new ArrayList<String[]>(lastArrNeed);
    }
    // 한 정류장 응답이 잠깐 비어 와도(공공 API 의 일시 빈 응답 · 연달아 부른 제한) 보던 줄이 "도착정보 없음"으로 사라지지 않게:
    // 새 응답에 도착 값이 하나도 없고 45초 안에 받은 값이 있으면 보던 값을 그대로 둔다(그 시각도 새로 치지 않는다).
    static final long KEEP_OLD_MS = 45000L;
    private final java.util.HashMap<String, Long> arrKeyAt = new java.util.HashMap<String, Long>();
    public static boolean hasArr(String b) {
        return b != null && b.length() > 20 && (b.contains("arrtime") || b.contains("arrTime") || b.contains("traTime") || b.contains("arrmsg") || b.contains("predictTime"));
    }
    public void addBusRes(String k, String body) {
        boolean arr = k != null && k.matches("[af][0-9]{1,3}");
        if (arr) {
            long now = System.currentTimeMillis();
            if (hasArr(body)) arrKeyAt.put(k, now);
            else {
                Long at = arrKeyAt.get(k); String old = arrStash.get(k);
                if (old != null && at != null && now - at < KEEP_OLD_MS && hasArr(old)) { busRes.put(k, old); return; }
            }
            arrAt = now;
        }
        if (k != null && k.matches("[a-z][a-z0-9]{0,3}")) busRes.put(k, body == null ? "" : (body.length() > 120000 ? body.substring(0, 120000) : body)); }
    /** 엔진이 준 주소를 공공 API 프록시 주소로 바꾼다 — /tago 는 route-v2 가 아니라 웹과 같은 버스 전용 프록시(gildongmu-bus)에 있다(정류장 표 D1 만 gentle-lab). 허용 호스트가 아니면 빈 문자열. */
    public static String busFetchUrl(String u) {
        if (u == null) return "";
        if (u.startsWith(ShellCore.NEWS_BASE + "/bus-stops?") && u.length() < 200 && u.matches("[A-Za-z0-9:/._?=&%-]+")) return u;      // 서버 정류장 표(D1): 프록시 없이 직접
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^https?://(apis\\.data\\.go\\.kr|ws\\.bus\\.go\\.kr)/").matcher(u);
        if (!m.find()) return "";
        try { return ShellCore.BUS_BASE + "/tago?url=" + java.net.URLEncoder.encode(u, "UTF-8"); } catch (java.io.UnsupportedEncodingException e) { return ""; }
    }

    // ── 화면에서 읽은 것 ──
    public String view = "";                                   // 'metro' | 'list' | 'bus'
    final List<String[]> regionStns = new ArrayList<String[]>();   // 지방 노선 목록의 눌림 번호 → [역, 노선]
    public String findName = "", nearName = "";

    // ── 역 팝업 / 시간표 ──
    public String stn = "", stnLine = "";
    public String pickName = "", pickLine = ""; public double pickLa, pickLo;
    public final List<String> ttLines = new ArrayList<String>(), ttDks = new ArrayList<String>(), ttDays = new ArrayList<String>();
    public String ttLine = "", ttDay = "", ttDk = "", ttState = "loading";
    final Map<String, String> ttRes = new LinkedHashMap<String, String>();
    public String needLine = "", needDay = "";
    public int ttSeq = 0;

    // ── 요청 ──
    public String headRequest(int cap, String theme, String q) {
        return "{\"cap\":" + cap + ",\"f\":" + facts("h", theme, q) + "}";
    }
    public String bodyRequest(int cap, String theme) {
        String f = facts("b", theme, "");
        if ("bus".equals(mode())) {
            StringBuilder b = new StringBuilder(f.substring(0, f.length() - 1)).append(",\"bus\":{\"vw\":").append(ShellCore.q(busView())).append(",\"sel\":").append(busSel).append(",\"sv\":1,\"svb\":" + svb + ",\"fav\":").append(favRaw()).append(",\"al\":").append(alRaw()).append(",\"ord\":").append(ordRaw());
            if (busLL != null) b.append(",\"lat\":").append(busLL[0]).append(",\"lng\":").append(busLL[1]);
            b.append(",\"res\":{");
            boolean first = true;
            for (Map.Entry<String, String> e : busRes.entrySet()) { if (!first) b.append(','); first = false; b.append(ShellCore.q(e.getKey())).append(':').append(ShellCore.q(e.getValue())); }
            f = b.append("}}}").toString();
        }
        return "{\"cap\":" + cap + ",\"f\":" + f + "}";
    }
    public String stnRequest(int cap, String theme) {
        return "{\"cap\":" + cap + ",\"f\":{\"part\":\"stn\",\"stn\":" + ShellCore.q(stn) + ",\"sl\":" + ShellCore.q(stnLine) + ",\"th\":" + ShellCore.q(theme(theme)) + "}}";
    }
    public String ttRequest(int cap, String theme) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{\"part\":\"tt\",\"stn\":").append(ShellCore.q(stn)).append(",\"th\":").append(ShellCore.q(theme(theme)));
        b.append(",\"tt\":{\"st\":").append(ShellCore.q(ttState)).append(",\"sel\":{\"line\":").append(ShellCore.q(ttLine)).append(",\"day\":").append(ShellCore.q(ttDay)).append(",\"dk\":").append(ShellCore.q(ttDk)).append("},\"res\":{");
        boolean first = true;
        for (Map.Entry<String, String> e : ttRes.entrySet()) { if (!first) b.append(','); first = false; b.append(ShellCore.q(e.getKey())).append(':').append(e.getValue()); }
        b.append("}}}}");
        return b.toString();
    }
    private static String theme(String t) { return "dark".equals(t) ? "dark" : "pastel"; }
    private String facts(String part, String theme, String q) {
        StringBuilder b = new StringBuilder("{\"part\":").append(ShellCore.q(part)).append(",\"mode\":").append(ShellCore.q(mode())).append(",\"reg\":").append(ShellCore.q(reg()));
        b.append(",\"flt\":").append(ShellCore.q(flt())).append(",\"th\":").append(ShellCore.q(theme(theme)));
        if (q != null && q.length() > 0) b.append(",\"q\":").append(ShellCore.q(q));
        if (gps != null) b.append(",\"gps\":[").append(gps[0]).append(',').append(gps[1]).append(']');
        return b.append('}').toString();
    }
    public static String ttUrl() { return ShellCore.BASE + "/next-train"; }
    /** 시간표 묻기 본문: 처음(요일 미정)이면 이 역의 모든 노선을 한 번에, 아니면 고른 노선·요일 하나. */
    public String ttAskBody(long baseMs) {
        StringBuilder b = new StringBuilder("{\"items\":[");
        if (needDay.length() == 0) {
            for (int i = 0; i < ttLines.size() && i < 20; i++) {
                if (i > 0) b.append(',');
                b.append("{\"id\":").append(i).append(",\"op\":\"timetable\",\"line\":").append(ShellCore.q(ttLines.get(i))).append(",\"from\":").append(ShellCore.q(stn)).append(",\"baseMs\":").append(baseMs).append('}');
            }
        } else {
            b.append("{\"id\":0,\"op\":\"timetable\",\"line\":").append(ShellCore.q(needLine)).append(",\"from\":").append(ShellCore.q(stn)).append(",\"day\":").append(ShellCore.q(needDay)).append(",\"baseMs\":").append(baseMs).append('}');
        }
        return b.append("]}").toString();
    }
    /** POST /next-train 응답을 받아 모아 둔다. 처음 묻기면 노선마다 'line|-', 요일을 골랐으면 'line|day'. */
    @SuppressWarnings("unchecked")
    public boolean addTt(String json, int seq) {
        if (seq != ttSeq) return false;
        try {
            Object o = ScreenCore.parse(json);
            Object items = o instanceof Map ? ((Map<String, Object>) o).get("items") : null;
            if (!(items instanceof List)) { ttState = "fail"; return false; }
            boolean first = needDay.length() == 0;
            for (Object x : (List<Object>) items) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> m = (Map<String, Object>) x;
                int id = (int) BoardCore.d(m.get("id"));
                String line = first ? (id >= 0 && id < ttLines.size() ? ttLines.get(id) : "") : needLine;
                if (line.length() == 0) continue;
                ttRes.put(line + "|" + (first ? "-" : needDay), HomeSearchCore.toJson(m));
            }
            ttState = "ok";
            return true;
        } catch (Exception e) { ttState = "fail"; return false; }
    }

    // ── 화면 읽기 ──
    @SuppressWarnings("unchecked")
    public void onScreen(String json) {
        try {
            Object o = ScreenCore.parse(json);
            Object i = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            if (!(i instanceof Map)) return;
            Map<String, Object> im = (Map<String, Object>) i;
            view = BoardCore.s(im.get("view"), 12);
            regionStns.clear();
            if (im.get("rs") instanceof List) for (Object r : (List<Object>) im.get("rs")) if (r instanceof List && ((List<Object>) r).size() == 2) regionStns.add(new String[] { BoardCore.s(((List<Object>) r).get(0), 40), BoardCore.s(((List<Object>) r).get(1), 30) });
            findName = im.get("find") instanceof Map ? BoardCore.s(((Map<String, Object>) im.get("find")).get("name"), 40) : "";
            busNeed.clear();
            if (im.get("bus") instanceof Map && ((Map<String, Object>) im.get("bus")).get("need") instanceof List)
                for (Object x : (List<Object>) ((Map<String, Object>) im.get("bus")).get("need")) if (x instanceof Map && busNeed.size() < 64) busNeed.add(new String[] { BoardCore.s(((Map<String, Object>) x).get("k"), 4), BoardCore.s(((Map<String, Object>) x).get("url"), 600) });
            svFail = 0;
            if (im.get("bus") instanceof Map && ((Map<String, Object>) im.get("bus")).get("need") instanceof List && !busNeed.isEmpty()) svServer = false;     // 서버가 못 받았다 — 기기가 받는 옛 길로
            if (im.get("bres") instanceof Map) {                                                   // 서버가 정류장·도착정보를 한 번에 받아 줬다 — 받은 본문을 그대로 모아 둔다(다음 갱신·즐겨찾기에 쓴다)
                svServer = true;
                for (Map.Entry<String, Object> e : ((Map<String, Object>) im.get("bres")).entrySet()) if (e.getValue() instanceof String) addBusRes(e.getKey(), (String) e.getValue());
                if (im.get("svf") instanceof Double) svFail = (int) ((Double) im.get("svf")).doubleValue();
            }
            stopJson.clear();
            if (im.get("stops") instanceof List) for (Object x : (List<Object>) im.get("stops")) if (x instanceof Map && stopJson.size() < 40) stopJson.add(HomeSearchCore.toJson(x));
            nearName = im.get("near") instanceof Map ? BoardCore.s(((Map<String, Object>) im.get("near")).get("name"), 40) : "";
            rts.clear();
            if (im.get("rts") instanceof Map) for (Map.Entry<String, Object> e : ((Map<String, Object>) im.get("rts")).entrySet()) {
                if (!(e.getValue() instanceof List)) continue;
                List<String[]> rl = new ArrayList<String[]>();
                for (Object x : (List<Object>) e.getValue()) if (x instanceof List && ((List<Object>) x).size() >= 3 && rl.size() < 40) { List<Object> xl = (List<Object>) x; rl.add(new String[] { BoardCore.s(xl.get(0), 40), BoardCore.s(xl.get(1), 16), BoardCore.s(xl.get(2), 16) }); }
                try { rts.put(Integer.parseInt(e.getKey()), rl); } catch (NumberFormatException ignored) { }
            }
        } catch (Exception e) { /* 이전 값 유지 */ }
    }
    @SuppressWarnings("unchecked")
    public void onStn(String json) {
        pickName = ""; pickLine = ""; pickLa = 0; pickLo = 0;
        try {
            Object o = ScreenCore.parse(json);
            Object i = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            if (!(i instanceof Map)) return;
            Object p = ((Map<String, Object>) i).get("pick");
            if (p instanceof Map) { Map<String, Object> pm = (Map<String, Object>) p; pickName = BoardCore.s(pm.get("name"), 40); pickLine = BoardCore.s(pm.get("line"), 30); pickLa = BoardCore.d(pm.get("la")); pickLo = BoardCore.d(pm.get("lo")); }
        } catch (Exception e) { /* 비움 */ }
    }
    @SuppressWarnings("unchecked")
    public void onTt(String json) {
        needLine = ""; needDay = "";
        try {
            Object o = ScreenCore.parse(json);
            Object i = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            if (!(i instanceof Map)) return;
            Map<String, Object> im = (Map<String, Object>) i;
            ttLines.clear(); ttDks.clear(); ttDays.clear();
            for (String k : new String[] { "lines", "dks", "days" }) if (im.get(k) instanceof List) for (Object x : (List<Object>) im.get(k)) ("lines".equals(k) ? ttLines : "dks".equals(k) ? ttDks : ttDays).add(BoardCore.s(x, 40));
            ttLine = BoardCore.s(im.get("line"), 30); ttDay = BoardCore.s(im.get("day"), 6); ttDk = BoardCore.s(im.get("dk"), 4);
            if (im.get("need") instanceof Map) { Map<String, Object> nd = (Map<String, Object>) im.get("need"); needLine = BoardCore.s(nd.get("line"), 30); needDay = BoardCore.s(nd.get("day"), 6); }
        } catch (Exception e) { /* 비움 */ }
    }
    /** 시간표를 처음 열 때(노선이 정해지기 전) 쓸 노선 목록은 팝업 화면 info.lines 에서. */
    @SuppressWarnings("unchecked")
    public void setLinesFromStn(String json) {
        ttLines.clear();
        try {
            Object o = ScreenCore.parse(json);
            Object i = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            if (i instanceof Map && ((Map<String, Object>) i).get("lines") instanceof List) for (Object x : (List<Object>) ((Map<String, Object>) i).get("lines")) ttLines.add(BoardCore.s(x, 30));
        } catch (Exception e) { /* 비움 */ }
    }

    // ── 눌림 ──
    /** 칩: m:bus · m:subway · r:<지역> · f:<호선>. */
    public int cat(String v) {
        if (v == null) return R_NONE;
        if (v.startsWith("m:")) { st.put(K_MODE, "subway".equals(v.substring(2)) ? "subway" : "bus"); busRes.clear(); view = "bus".equals(mode()) ? "bus" : ""; return R_RENDER; }          // 새 화면이 올 때까지 노선도 뷰는 내려 둔다
        if (v.startsWith("r:")) { st.put(K_REG, v.substring(2)); st.put(K_FLT, "ALL"); return R_RENDER; }
        if (v.startsWith("f:")) { st.put(K_FLT, v.substring(2)); return R_RENDER; }
        return R_NONE;
    }
    /** 머리·본문 call. fields 는 머리의 입력칸(mq). */
    public int act(String v, Map<String, String> fields) {
        if (v == null) return R_NONE;
        if ("mp.find".equals(v)) { String q = fields == null ? null : fields.get("mq"); return q == null || q.replaceAll("\\s+", "").length() < 2 ? R_NONE : R_FIND; }
        if ("mp.loc".equals(v)) return "bus".equals(mode()) ? R_BUS_LOC : R_LOC;
        if ("mp.vw.near".equals(v) || "mp.vw.fav".equals(v)) { String nv = v.substring(6); if (nv.equals(busView())) return R_NONE; st.put(K_BUSVW, nv); busSel = -1; return R_BUS_VIEW; }
        if ("mp.rf".equals(v)) { busSel = -1; if (VW_FAV.equals(busView())) { busRes.clear(); busNeed.clear(); return R_BUS_REF; } return R_BUS_LOC; }
        if (v.startsWith("mp.pc.") || v.startsWith("mp.pm.")) { int i = idx(v, 6); if (i < 0) return R_NONE; busSel = i; return R_BUS_SEL; }
        if (v.startsWith("mp.fv.")) { int i = idx(v, 6); return i >= 0 && toggleFav(i) ? R_BUS_SEL : R_NONE; }
        if (v.startsWith("mp.al.")) {
            int i = idx(v, 6); if (i < 0) return R_NONE;
            Map<String, Object> sm = stopAt(i); if (sm == null) return R_NONE;
            aliasKey = BoardCore.s(sm.get("id"), 40); aliasName = BoardCore.s(sm.get("nm"), 40);
            aliasCur = aliasMap().get(aliasKey) instanceof String ? (String) aliasMap().get(aliasKey) : "";
            return aliasKey.length() > 0 ? R_ALIAS : R_NONE;
        }
        if (v.startsWith("br.")) return openRoute(v);
        if (v.startsWith("mr.")) {
            try { int i = Integer.parseInt(v.substring(3)); if (i >= 0 && i < regionStns.size()) { stn = regionStns.get(i)[0]; stnLine = regionStns.get(i)[1]; return R_STN; } } catch (NumberFormatException e) { /* 무시 */ }
        }
        return R_NONE;
    }
    private int idx(String v, int from) { try { int i = Integer.parseInt(v.substring(from)); return i >= 0 && i < stopJson.size() ? i : -1; } catch (NumberFormatException e) { return -1; } }
    @SuppressWarnings("unchecked")
    private Map<String, Object> stopAt(int i) {
        try { Object o = ScreenCore.parse(stopJson.get(i)); return o instanceof Map ? (Map<String, Object>) o : null; } catch (Exception e) { return null; }
    }
    @SuppressWarnings("unchecked")
    private Map<String, Object> aliasMap() {
        try { Object o = ScreenCore.parse(alRaw()); return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<String, Object>(); } catch (Exception e) { return new LinkedHashMap<String, Object>(); }
    }
    @SuppressWarnings("unchecked")
    private List<Object> favList() {
        try { Object o = ScreenCore.parse(favRaw()); return o instanceof List ? (List<Object>) o : new ArrayList<Object>(); } catch (Exception e) { return new ArrayList<Object>(); }
    }
    /** 별(주변) 또는 ×(즐겨찾기)를 눌렀다 — 웹 toggleFavBusStop. 12곳까지. 알림 글은 toast. */
    @SuppressWarnings("unchecked")
    private boolean toggleFav(int i) {
        Map<String, Object> sm = stopAt(i);
        if (sm == null) return false;
        String id = BoardCore.s(sm.get("id"), 40);
        if (id.length() == 0) return false;
        List<Object> fl = favList();
        int at = -1;
        for (int k = 0; k < fl.size(); k++) if (fl.get(k) instanceof Map && id.equals(BoardCore.s(((Map<String, Object>) fl.get(k)).get("id"), 40))) { at = k; break; }
        if (at >= 0) { fl.remove(at); toast = "즐겨찾기 해제"; }
        else {
            if (fl.size() >= 12) { toast = "즐겨찾기는 최대 12개"; return false; }
            fl.add(sm); toast = "즐겨찾기 추가";
        }
        st.put(K_BUSFAV, HomeSearchCore.toJson(fl));
        return true;
    }
    /** 별명 저장(빈 글이면 지움). 웹 _busEditAlias. */
    @SuppressWarnings("unchecked")
    public void setAlias(String key, String text) {
        if (key == null || key.length() == 0) return;
        Map<String, Object> am = aliasMap();
        String t = text == null ? "" : text.trim();
        if (t.length() > 10) t = t.substring(0, 10);
        if (t.length() == 0) am.remove(key); else am.put(key, t);
        st.put(K_BUSAL, HomeSearchCore.toJson(am));
    }


    // ═════════════ 노선 상세(웹 openBusRoute · _loadBusRouteData): 어느 정류장에서 눌렀는지 + 받은 본문. 계산·문구·배치는 모두 엔진(part:'br') ═════════════
    public String brRid = "", brNo = "", brTp = "", brSrc = "", brO = "", brStnJson = "", brVia = "", brCc = "";
    public int brSel = -1, brSeq = 0;
    public String pkName = "", pkId = "";                              // 출발지로 정한 정류장(없으면 빈 글)
    public double[] brMe = null;
    final Map<String, String> brRes = new LinkedHashMap<String, String>();
    public final List<String[]> brNeed = new ArrayList<String[]>();   // [k, 주소]
    public final List<String[]> brStn = new ArrayList<String[]>();    // [순번, id, 이름, 번호, 위도, 경도, 방향]
    public boolean brKnown;                                            // 위치 응답을 제대로 받았다
    public String brSt = "";

    private int openRoute(String v) {
        String[] pr = v.split("\\.");
        if (pr.length != 3 || pr[1].equals("p") ) return brAct(v);
        int si, ri;
        try { si = Integer.parseInt(pr[1]); ri = Integer.parseInt(pr[2]); } catch (NumberFormatException e) { return brAct(v); }
        List<String[]> rl = rts.get(si);
        Map<String, Object> sm = si >= 0 && si < stopJson.size() ? stopAt(si) : null;
        if (rl == null || ri < 0 || ri >= rl.size() || sm == null || rl.get(ri)[0].length() == 0) return R_NONE;
        String[] r = rl.get(ri);
        String id = BoardCore.s(sm.get("id"), 40), src = BoardCore.s(sm.get("src"), 6);
        brRid = r[0]; brNo = r[1]; brTp = r[2];
        brSrc = id.startsWith("GG:") || "gbis".equals(src) ? "gbis" : id.startsWith("SEOUL:") || "topis".equals(src) ? "topis" : "";
        StringBuilder o = new StringBuilder("{\"id\":").append(ShellCore.q(id)).append(",\"nm\":").append(ShellCore.q(BoardCore.s(sm.get("nm"), 40)))
            .append(",\"la\":").append(BoardCore.d(sm.get("la"))).append(",\"lo\":").append(BoardCore.d(sm.get("lo"))).append(",\"city\":").append(ShellCore.q(BoardCore.s(sm.get("city"), 4))).append('}');
        brO = o.toString();
        brStnJson = ""; brVia = ""; brCc = ""; brSel = -1; brRes.clear(); brNeed.clear(); brStn.clear(); brKnown = false; brSt = ""; brSeq++;
        return R_BR_OPEN;
    }
    /** 미리 받기용 복제: 지금 목록의 si번 정류장 · ri번째 노선을 연 상태의 새 MapCore(화면에 보이는 것과 따로 돈다). 못 열면 null. */
    public MapCore routeClone(int si, int ri) {
        MapCore m = new MapCore(st);
        m.rts.putAll(rts); m.stopJson.addAll(stopJson);
        return m.openRoute("br." + si + "." + ri) == R_BR_OPEN ? m : null;
    }
    /** si번 정류장에 도착정보가 있는 노선 수. */
    public String rtsSig() { StringBuilder b = new StringBuilder(); List<String[]> rl = rts.get(0); if (rl != null) for (String[] r : rl) b.append(r[0]).append(','); return b.toString(); }
    public int routeCount(int si) { List<String[]> rl = rts.get(si); return rl == null ? 0 : rl.size(); }
    public void setRouteMe(double la, double lo) { brMe = new double[] { la, lo }; }
    /** 7일 캐시에서 되살린 정류장 목록(엔진이 준 모양 그대로): 있으면 정류장을 기다리지 않고 바로 그린다. */
    public void useCachedStations(String stnJson, String via, String cc) { brStnJson = stnJson == null ? "" : stnJson; brVia = via == null ? "" : via; brCc = cc == null ? "" : cc; }
    public void dropPositions() { brRes.remove("gp"); brRes.remove("tp"); brNeed.clear(); }
    public void addBrRes(String k, String body) { if (k != null && k.matches("[a-z]{2}")) brRes.put(k, body == null ? "" : (body.length() > 200000 ? body.substring(0, 200000) : body)); }
    public String brRequest(int cap, String theme) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{\"part\":\"br\",\"th\":").append(ShellCore.q(theme(theme)));
        b.append(",\"br\":{\"rid\":").append(ShellCore.q(brRid)).append(",\"no\":").append(ShellCore.q(brNo)).append(",\"tp\":").append(ShellCore.q(brTp)).append(",\"src\":").append(ShellCore.q(brSrc));
        if (brO.length() > 0) b.append(",\"o\":").append(brO);
        if (brCc.length() > 0) b.append(",\"cc\":").append(ShellCore.q(brCc));
        if (brMe != null) b.append(",\"me\":[").append(brMe[0]).append(',').append(brMe[1]).append(']');
        if (brStnJson.length() > 0) b.append(",\"stn\":").append(brStnJson).append(",\"via\":").append(ShellCore.q(brVia));
        b.append(",\"sel\":").append(brSel);
        if (pkName.length() > 0) b.append(",\"pk\":{\"n\":").append(ShellCore.q(pkName)).append(",\"i\":").append(ShellCore.q(pkId)).append('}');
        b.append(",\"res\":{");
        boolean first = true;
        for (Map.Entry<String, String> e : brRes.entrySet()) { if (!first) b.append(','); first = false; b.append(ShellCore.q(e.getKey())).append(':').append(ShellCore.q(e.getValue())); }
        return b.append("}}}}").toString();
    }
    /** 엔진 답을 읽는다: 더 받아야 할 주소 · 정류장 목록(받았으면 두고, 큰 본문은 지운다) · 위치를 제대로 받았는지. */
    @SuppressWarnings("unchecked")
    public void onBr(String json) {
        brNeed.clear();
        try {
            Object o = ScreenCore.parse(json);
            Object i = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            if (!(i instanceof Map) || !(((Map<String, Object>) i).get("br") instanceof Map)) return;
            Map<String, Object> b = (Map<String, Object>) ((Map<String, Object>) i).get("br");
            brSt = BoardCore.s(b.get("st"), 6);
            if (b.get("need") instanceof List) for (Object x : (List<Object>) b.get("need")) if (x instanceof Map && brNeed.size() < 4) brNeed.add(new String[] { BoardCore.s(((Map<String, Object>) x).get("k"), 4), BoardCore.s(((Map<String, Object>) x).get("url"), 600) });
            if (b.get("stn") instanceof List && brStnJson.length() == 0) {
                brStnJson = HomeSearchCore.toJson(b.get("stn")); brVia = BoardCore.s(b.get("via"), 6); brCc = BoardCore.s(b.get("cc"), 4);
                brRes.remove("gs"); brRes.remove("ts");
            }
            if (b.get("stn") instanceof List) {
                brStn.clear();
                for (Object x : (List<Object>) b.get("stn")) if (x instanceof List && ((List<Object>) x).size() >= 7) { List<Object> xl = (List<Object>) x; brStn.add(new String[] { String.valueOf((long) BoardCore.d(xl.get(0))), BoardCore.s(xl.get(1), 40), BoardCore.s(xl.get(2), 40), BoardCore.s(xl.get(3), 20), String.valueOf(BoardCore.d(xl.get(4))), String.valueOf(BoardCore.d(xl.get(5))), String.valueOf((long) BoardCore.d(xl.get(6))) }); }
            }
            brKnown = b.get("pos") instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) b.get("pos")).get("known"));
        } catch (Exception e) { /* 이전 값 유지 */ }
    }
    /** 노선 상세 화면의 눌림. */
    public int brAct(String v) {
        if (v == null) return R_NONE;
        if ("br.x".equals(v)) return R_BR_CLOSE;
        if ("br.rf".equals(v)) { brRes.clear(); brNeed.clear(); return R_BR_REFRESH; }
        if ("br.cx".equals(v)) return R_BR_CANCEL;
        if ("br.st".equals(v)) return pkName.length() > 0 ? R_BR_TOSTN : R_NONE;
        if ("br.ss".equals(v)) {
            if (brSel < 0 || brSel >= brStn.size()) return R_NONE;
            return R_BR_START;
        }
        if (v.startsWith("br.p.")) {
            int i; try { i = Integer.parseInt(v.substring(5)); } catch (NumberFormatException e) { return R_NONE; }
            if (i < 0 || i >= brStn.size()) return R_NONE;
            if (pkName.length() > 0) {
                String[] r = brStn.get(i);
                if (pkId.length() > 0 ? pkId.equals(r[1]) : pkName.equals(r[2])) return R_BR_SAME;
                brSel = i; return R_BR_FINISH;
            }
            brSel = i; return R_BR_RENDER;
        }
        return R_NONE;
    }
    public String[] brPicked() { return brSel >= 0 && brSel < brStn.size() ? brStn.get(brSel) : null; }
    public void brPickStart() { String[] r = brPicked(); if (r != null) { pkName = r[2]; pkId = r[1]; } brSel = -1; }
    public void brPickClear() { pkName = ""; pkId = ""; brSel = -1; }

    /** 노선도에서 역 글자를 눌렀다. 엔진이 역이 아니라고 하면(화면 요청이 거절되면) 앱이 시트를 닫는다. */
    public void tapStation(String labelName) { stn = labelName == null ? "" : labelName.replaceAll("\\s+", "").trim(); stnLine = ""; }
    /** 시트(팝업·시간표) 단추. */
    public int sheetAct(String v) {
        if (v == null) return R_NONE;
        if ("mp.close".equals(v)) return R_CLOSE;
        if ("mp.start".equals(v)) return pickName.length() > 0 ? R_START : R_NONE;
        if ("mp.dest".equals(v)) return pickName.length() > 0 ? R_DEST : R_NONE;
        if ("mp.tt".equals(v)) { ttRes.clear(); ttLine = ""; ttDay = ""; ttDk = ""; ttState = "loading"; needDay = ""; ttSeq++; return R_TT; }
        if ("mt.retry".equals(v)) { ttState = "loading"; ttSeq++; return R_TT_LOAD; }
        if (v.startsWith("mt.l.")) {
            try { int i = Integer.parseInt(v.substring(5)); if (i >= 0 && i < ttLines.size()) { ttLine = ttLines.get(i); ttDay = ""; ttDk = ""; return ttRes.containsKey(ttLine + "|-") ? R_TT_RENDER : R_TT_LOAD; } } catch (NumberFormatException e) { /* 무시 */ }
        } else if (v.startsWith("mt.d.")) {
            ttDay = v.substring(5);
            if (ttRes.containsKey(ttLine + "|" + ttDay)) return R_TT_RENDER;
            needLine = ttLine; needDay = ttDay; ttState = "loading"; ttSeq++;
            return R_TT_LOAD;
        } else if (v.startsWith("mt.k.")) {
            try { int i = Integer.parseInt(v.substring(5)); if (i >= 0 && i < ttDks.size()) { ttDk = ttDks.get(i); return R_TT_RENDER; } } catch (NumberFormatException e) { /* 무시 */ }
        }
        return R_NONE;
    }
}
