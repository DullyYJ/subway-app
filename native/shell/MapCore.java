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
    public static final int R_NONE = 0, R_RENDER = 1, R_FIND = 2, R_LOC = 3, R_STN = 4, R_START = 5, R_DEST = 6, R_TT = 7, R_CLOSE = 8, R_TT_LOAD = 9, R_TT_RENDER = 10;

    private final ShellCore.Store st;
    public MapCore(ShellCore.Store st) { this.st = st; }

    public String mode() { return "subway".equals(st.get(K_MODE, "bus")) ? "subway" : "bus"; }
    public String reg() { String r = st.get(K_REG, "seoul"); return r.matches("seoul|busan|daegu|gwangju|daejeon") ? r : "seoul"; }
    public String flt() { String f = st.get(K_FLT, "ALL"); return f.length() > 0 && f.length() < 12 ? f : "ALL"; }
    public double[] gps = null;

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
        return "{\"cap\":" + cap + ",\"f\":" + facts("b", theme, "") + "}";
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
            nearName = im.get("near") instanceof Map ? BoardCore.s(((Map<String, Object>) im.get("near")).get("name"), 40) : "";
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
        if (v.startsWith("m:")) { st.put(K_MODE, "subway".equals(v.substring(2)) ? "subway" : "bus"); return R_RENDER; }
        if (v.startsWith("r:")) { st.put(K_REG, v.substring(2)); st.put(K_FLT, "ALL"); return R_RENDER; }
        if (v.startsWith("f:")) { st.put(K_FLT, v.substring(2)); return R_RENDER; }
        return R_NONE;
    }
    /** 머리·본문 call. fields 는 머리의 입력칸(mq). */
    public int act(String v, Map<String, String> fields) {
        if (v == null) return R_NONE;
        if ("mp.find".equals(v)) { String q = fields == null ? null : fields.get("mq"); return q == null || q.replaceAll("\\s+", "").length() < 2 ? R_NONE : R_FIND; }
        if ("mp.loc".equals(v)) return R_LOC;
        if (v.startsWith("mr.")) {
            try { int i = Integer.parseInt(v.substring(3)); if (i >= 0 && i < regionStns.size()) { stn = regionStns.get(i)[0]; stnLine = regionStns.get(i)[1]; return R_STN; } } catch (NumberFormatException e) { /* 무시 */ }
        }
        return R_NONE;
    }
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
