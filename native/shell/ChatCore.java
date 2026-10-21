package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 커뮤니티 > 실시간소통의 순수 자바 상태기 — 2026-10-20 (s89).
 * 어느 방을 어떤 순서로·어떤 문구로 보일지는 엔진(/screen/chat)이 정한다. 여기는 서버가 준 대화를 방별로 모아 엔진이 읽는 줄로 옮겨 담고,
 * 이 기기가 쥔 사실(고른 방·숨긴 글·탄 노선 기록)을 보관하며 눌림의 뜻을 정한다. 통신·시계·6초 주기는 ShellActivity 가 한다.
 */
public final class ChatCore {
    public static final String K_SEL = "chat_sel", K_HID = "lrHidden", K_MY = "my_lines";
    public static final int R_NONE = 0, R_RENDER = 1, R_SEND = 2, R_REPORT = 3, R_ROOM = 4, R_NEED_ID = 5;

    private final ShellCore.Store st;
    /** 지금 경로의 지하철 구간 이름들(엔진이 노선으로 바꿔 앞에 둔다). */
    public List<String> routeSec = new ArrayList<String>();
    public boolean failed = false, loaded = false;
    long sinceG = 0;
    final Map<String, Long> sinceR = new LinkedHashMap<String, Long>();
    final Map<String, List<Object>> talk = new LinkedHashMap<String, List<Object>>();       // 전체 방: id → 줄
    final Map<String, Map<String, List<Object>>> room = new LinkedHashMap<String, Map<String, List<Object>>>();   // 노선 방: 노선 → (id → 줄)
    final Map<String, Object> alerts = new LinkedHashMap<String, Object>();
    String noticesJson = ""; public long noticesAt = 0;
    public String pendingId = "", pendingText = "", pendingLine = "";
    List<String> ridsR = new ArrayList<String>();                                            // 엔진에 보낸 노선 방 글 번호(눌림 번호 → 글번호)

    public ChatCore(ShellCore.Store st) { this.st = st; }

    /** 홈 대화 카드용: 전체 방의 최근 n줄을 [[닉네임, 글, 시각, 내 글]…] 글로(오래된 것부터). 엔진이 줄 수·시각 글을 정한다. */
    public String recentTalksJson(int n) {
        List<Object> all = new ArrayList<Object>(talk.values());
        List<Object> out = all.size() > n ? all.subList(all.size() - n, all.size()) : all;
        return HomeSearchCore.toJson(new ArrayList<Object>(out));
    }
    public int talkCount() { return talk.size(); }
    public String talkMark() { return talk.size() + ":" + sinceG; }
    public String sel() { String s = st.get(K_SEL, "all"); return s.length() > 0 && s.length() < 30 ? s : "all"; }
    public void select(String line) { st.put(K_SEL, line == null || line.length() == 0 || line.length() > 29 ? "all" : line); loaded = false; failed = false; }

    // ── 받은 대화 합치기 ──
    @SuppressWarnings("unchecked")
    public boolean addTalks(String json, String me) {                 // GET /talks → {ok, talks:[{id,nick,text,ts,line}]}
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map) || !Boolean.TRUE.equals(((Map<String, Object>) o).get("ok")) || !(((Map<String, Object>) o).get("talks") instanceof List)) return fail();
            for (Object x : (List<Object>) ((Map<String, Object>) o).get("talks")) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> m = (Map<String, Object>) x;
                String id = BoardCore.idStr(m.get("id"));
                if (id.length() == 0 || talk.containsKey(id)) continue;
                double ts = BoardCore.d(m.get("ts"));
                if (ts > sinceG) sinceG = (long) ts;
                String nick = BoardCore.s(m.get("nick"), 40);
                List<Object> row = new ArrayList<Object>();
                row.add(nick); row.add(BoardCore.s(m.get("text"), 400)); row.add(Double.valueOf(ts));
                row.add(Double.valueOf(me.length() > 0 && me.equals(nick) ? 1 : 0)); row.add(BoardCore.s(m.get("line"), 20));
                talk.put(id, row);
            }
            while (talk.size() > 300) talk.remove(talk.keySet().iterator().next());
            loaded = true; failed = false;
            return true;
        } catch (Exception e) { return fail(); }
    }
    @SuppressWarnings("unchecked")
    public boolean addRoom(String line, String json) {                // GET /lroom → {ok, msgs:[{id,ts,nick,text,kind}], alert}
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map) || !Boolean.TRUE.equals(((Map<String, Object>) o).get("ok"))) return fail();
            Map<String, Object> mo = (Map<String, Object>) o;
            Map<String, List<Object>> rm = room.get(line);
            if (rm == null) { rm = new LinkedHashMap<String, List<Object>>(); room.put(line, rm); }
            long since = sinceR.containsKey(line) ? sinceR.get(line) : 0;
            if (mo.get("msgs") instanceof List) for (Object x : (List<Object>) mo.get("msgs")) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> m = (Map<String, Object>) x;
                String id = BoardCore.idStr(m.get("id"));
                if (id.length() == 0 || rm.containsKey(id)) continue;
                double ts = BoardCore.d(m.get("ts"));
                if (ts > since) since = (long) ts;
                List<Object> row = new ArrayList<Object>();
                row.add(id); row.add(Double.valueOf(ts)); row.add(BoardCore.s(m.get("nick"), 40)); row.add(BoardCore.s(m.get("text"), 400)); row.add(BoardCore.s(m.get("kind"), 10));
                rm.put(id, row);
            }
            while (rm.size() > 200) rm.remove(rm.keySet().iterator().next());
            sinceR.put(line, since);
            if (mo.get("alert") instanceof Map) alerts.put(line, mo.get("alert")); else alerts.remove(line);
            loaded = true; failed = false;
            return true;
        } catch (Exception e) { return fail(); }
    }
    public boolean setNotices(String json, long now) {                // GET route-v2 /line-notices → {ok, lines:{…}}
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map) || !Boolean.TRUE.equals(((Map<String, Object>) o).get("ok"))) return false;
            noticesJson = json; noticesAt = now; return true;
        } catch (Exception e) { return false; }
    }
    private boolean fail() { failed = true; return false; }

    // ── 엔진 요청 ──
    @SuppressWarnings("unchecked")
    public String request(int cap, String theme, int tzoMin, String me, long now) { return requestFor(sel(), true, cap, theme, tzoMin, me, now); }
    /** 방 sel 의 요청. live=false 면 눌림 번호표(ridsR)를 건드리지 않는다(미리 받기용 별도 상태기에서 쓴다). */
    public String requestFor(String sel, boolean live, int cap, String theme, int tzoMin, String me, long now) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{\"sel\":").append(ShellCore.q(sel));
        b.append(",\"sec\":").append(HomeSearchCore.toJson(new ArrayList<Object>(routeSec)));
        b.append(",\"my\":").append(st.get(K_MY, "[]"));
        b.append(",\"th\":").append(ShellCore.q("dark".equals(theme) ? "dark" : "pastel"));
        b.append(",\"st\":").append(ShellCore.q(live ? (loaded ? "ready" : failed ? "fail" : "loading") : ("all".equals(sel) ? !talk.isEmpty() : room.containsKey(sel)) ? "ready" : "fail"));
        b.append(",\"tzo\":").append(tzoMin).append(",\"me\":").append(ShellCore.q(me)).append(",\"hid\":").append(st.get(K_HID, "[]")).append("},\"d\":{");
        List<Object> g = new ArrayList<Object>(talk.values());
        b.append("\"g\":").append(HomeSearchCore.toJson(g));
        List<String> rids = new ArrayList<String>();
        List<Object> r = new ArrayList<Object>();
        if (!"all".equals(sel) && room.containsKey(sel)) for (Map.Entry<String, List<Object>> e : room.get(sel).entrySet()) { r.add(e.getValue()); rids.add(e.getKey()); }
        if (live) ridsR = rids;
        b.append(",\"r\":").append(HomeSearchCore.toJson(r));
        Object off = null; boolean offOk = false;
        try {
            if (noticesJson.length() > 0) { Object o = ScreenCore.parse(noticesJson); offOk = true; Object ls = ((Map<String, Object>) o).get("lines"); if (ls instanceof Map) off = ((Map<String, Object>) ls).get(sel); }
        } catch (Exception e) { offOk = false; }
        b.append(",\"off\":").append(HomeSearchCore.toJson(off)).append(",\"offOk\":").append(offOk ? 1 : 0).append(",\"offAt\":").append(noticesAt);
        b.append(",\"al\":").append(HomeSearchCore.toJson(alerts.get(sel))).append("}}");
        return b.toString();
    }

    // ── 주소 ──
    public static String talksUrl(long since) { return ShellCore.BOARD_BASE + "/talks" + (since > 0 ? "?since=" + since + "&limit=40" : "?limit=30"); }
    public String talksUrlNow() { return talksUrl(sinceG); }
    public String roomUrl(String line) { return ShellCore.BOARD_BASE + "/lroom?line=" + ShellCore.enc(line) + "&since=" + (sinceR.containsKey(line) ? sinceR.get(line) : 0); }
    public static String noticesUrl() { return ShellCore.BASE + "/line-notices"; }
    public static String sendBody(String nick, String text, String line) { return "{\"nick\":" + ShellCore.q(nick) + ",\"text\":" + ShellCore.q(text) + ",\"line\":" + ShellCore.q(line) + "}"; }
    public static String reportBody(String id) { return "{\"id\":" + ShellCore.q(id) + "}"; }

    // ── 숨긴 글 / 탄 기록 ──
    @SuppressWarnings("unchecked")
    public void hide(String id) {
        List<Object> l;
        try { Object o = ScreenCore.parse(st.get(K_HID, "[]")); l = o instanceof List ? (List<Object>) o : new ArrayList<Object>(); } catch (Exception e) { l = new ArrayList<Object>(); }
        if (!l.contains(id)) l.add(id);
        while (l.size() > 300) l.remove(0);
        st.put(K_HID, HomeSearchCore.toJson(l));
    }

    // ── 눌림 ──
    /** v: ch.send · ch.x.<번호>.  cat 눌림(칩)은 select 로 따로. */
    public int act(String v, Map<String, String> fields, String me) { return act(v, "", fields, me); }
    /** actId: 엔진이 행동에 실어 준 글 고유 id(있으면 번호표 대신 이것으로 신고 대상을 정한다). */
    public int act(String v, String actId, Map<String, String> fields, String me) {
        if (v == null) return R_NONE;
        if ("ch.send".equals(v)) {
            String key = "all".equals(sel()) ? "chat.all" : "chat.room";
            String t = fields == null ? null : fields.get(key);
            if (t == null || t.trim().length() == 0) return R_NONE;
            if (me.length() == 0) return R_NEED_ID;
            pendingText = t.trim().length() > 200 ? t.trim().substring(0, 200) : t.trim();
            pendingLine = sel();
            return R_SEND;
        }
        if (v.startsWith("ch.x.")) {
            if (actId != null && actId.length() > 0) { pendingId = actId; return R_REPORT; }
            try { int i = Integer.parseInt(v.substring(5)); if (i >= 0 && i < ridsR.size()) { pendingId = ridsR.get(i); return R_REPORT; } } catch (NumberFormatException e) { /* 무시 */ }
        }
        return R_NONE;
    }
    /** 'all' 방에서 글을 보낼 때 붙일 노선 — 엔진이 화면 info.pl 로 정해 준 값. */
    public String postLine = "";
    @SuppressWarnings("unchecked")
    public void onScreen(String json) {
        try { Object o = ScreenCore.parse(json); Object i = o instanceof Map ? ((Map<String, Object>) o).get("info") : null; postLine = i instanceof Map ? BoardCore.s(((Map<String, Object>) i).get("pl"), 20) : ""; }
        catch (Exception e) { postLine = ""; }
    }
}
