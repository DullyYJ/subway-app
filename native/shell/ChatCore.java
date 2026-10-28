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
    public static final String K_SEL = "chat_sel", K_HID = "lrHidden", K_MY = "my_lines", K_SELS = "chat_sels";
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
        return "{\"cap\":" + cap + "," + fdFor(sel, live, theme, tzoMin, me, true) + "}";
    }
    /** 한 방의 사실(f)과 자료(d) 두 조각 — 요청 본문의 알맹이이자, 한 번에 여러 방을 물을 때(alts) 방마다의 { f, d } 다. withG=false 면 전체 방 줄(g)을 비운다(노선 방 화면은 g 를 안 쓴다). */
    private String fdFor(String sel, boolean live, String theme, int tzoMin, String me, boolean withG) {
        StringBuilder b = new StringBuilder("\"f\":{\"sel\":").append(ShellCore.q(sel));
        b.append(",\"sec\":").append(HomeSearchCore.toJson(new ArrayList<Object>(routeSec)));
        b.append(",\"my\":").append(st.get(K_MY, "[]"));
        b.append(",\"th\":").append(ShellCore.q("dark".equals(theme) ? "dark" : "pastel"));
        b.append(",\"st\":").append(ShellCore.q(live ? (loaded ? "ready" : failed ? "fail" : "loading") : ("all".equals(sel) ? !talk.isEmpty() : room.containsKey(sel)) ? "ready" : "fail"));
        b.append(",\"tzo\":").append(tzoMin).append(",\"me\":").append(ShellCore.q(me)).append(",\"hid\":").append(st.get(K_HID, "[]")).append("},\"d\":{");
        List<Object> g = withG ? new ArrayList<Object>(talk.values()) : new ArrayList<Object>();
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
        b.append(",\"al\":").append(HomeSearchCore.toJson(alerts.get(sel))).append("}");
        return b.toString();
    }
    /** 이 상태기에 전체 방 글이 있나(= 전체 방 화면을 '준비됨'으로 만들 수 있나). */
    public boolean hasTalks() { return !talk.isEmpty(); }
    /** 이 상태기에 그 노선 방 글을 받아 둔 적이 있나. */
    public boolean hasRoom(String line) { return room.containsKey(line); }

    // ── 모든 방을 한 번에(s274, YJ: 쇼핑·커뮤니티 모든 카테고리를 병렬로 받아 로딩 없애기): 방마다 따로 묻던 것을 한 요청(엔진 alts)으로 — 맨 위는 전체 방 · alts 는 글을 받아 둔 노선 방들.
    //   엔진이 방마다의 화면을 계산하고(따로 요청했을 때와 글자 하나까지 같다), 앱은 방별로 캐시에 둘 뿐이다. 글을 못 받은 방은 싣지 않는다(오류 화면이 캐시에 남지 않게 — 다음 순회에 다시). ──
    public String batchRequest(List<String> sels, int cap, String theme, int tzoMin, String me) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(',').append(fdFor("all", false, theme, tzoMin, me, true)).append(",\"alts\":{");
        int n = 0;
        for (String sel : sels) {
            if (n >= 23) break;
            if (sel == null || "all".equals(sel) || !room.containsKey(sel)) continue;
            if (n++ > 0) b.append(',');
            b.append(ShellCore.q(sel)).append(":{").append(fdFor(sel, false, theme, tzoMin, me, false)).append('}');
        }
        return b.append("}}").toString();
    }
    /** 위 요청의 답: 방 → 화면 글(맨 위 화면은 "all" 로). 못 읽거나 ok 가 아니면 빈 표. */
    @SuppressWarnings("unchecked")
    public static Map<String, String> parseBatch(String json) {
        Map<String, String> out = new LinkedHashMap<String, String>();
        if (json == null || json.length() < 10) return out;
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return out;
            Map<String, Object> m = (Map<String, Object>) o;
            Object alts = m.remove("alts");
            m.remove("ver");
            if (Boolean.TRUE.equals(m.get("ok"))) out.put("all", HomeSearchCore.toJson(m));
            if (alts instanceof Map) for (Map.Entry<String, Object> e : ((Map<String, Object>) alts).entrySet())
                if (e.getValue() instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) e.getValue()).get("ok"))) out.put(e.getKey(), HomeSearchCore.toJson(e.getValue()));
        } catch (Exception ignored) { }
        return out;
    }

    // ── '불러오는 중' 화면 한꺼번에(s247, YJ: 화면 넘길 때 빈 화면): 아직 못 받은 방으로 넘길 때 회색 뼈대 대신, 칩 줄은 그대로 두고(고른 칩이 바뀐 채) 본문만 '불러오는 중…' 인 엔진 화면을 바로 올린다.
    //   그 화면도 엔진이 만든다(st:'loading') — 한 번의 요청에 모든 방을 alts 로 실어 받아 방마다 기억한다. 앱은 그리기만 한다. ──
    private String factsFor(String sel, String theme, int tzoMin, String me) {
        StringBuilder b = new StringBuilder("{\"sel\":").append(ShellCore.q(sel));
        b.append(",\"sec\":").append(HomeSearchCore.toJson(new ArrayList<Object>(routeSec)));
        b.append(",\"my\":").append(st.get(K_MY, "[]"));
        b.append(",\"th\":").append(ShellCore.q("dark".equals(theme) ? "dark" : "pastel"));
        b.append(",\"st\":\"loading\",\"tzo\":").append(tzoMin).append(",\"me\":").append(ShellCore.q(me)).append(",\"hid\":").append(st.get(K_HID, "[]")).append('}');
        return b.toString();
    }
    private static final String EMPTY_D = "{\"g\":[],\"r\":[],\"off\":null,\"offOk\":0,\"offAt\":0,\"al\":null}";
    /** 모든 방(sels, 엔진이 칩으로 준 순서)의 '불러오는 중' 화면을 한 번에 받는 요청 본문. */
    public String loadingBatchRequest(List<String> sels, int cap, String theme, int tzoMin, String me) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":").append(factsFor("all", theme, tzoMin, me)).append(",\"d\":").append(EMPTY_D).append(",\"alts\":{");
        int n = 0;
        for (String sel : sels) {
            if (n >= 24) break;
            if (n++ > 0) b.append(',');
            b.append(ShellCore.q(sel)).append(":{\"f\":").append(factsFor(sel, theme, tzoMin, me)).append(",\"d\":").append(EMPTY_D).append('}');
        }
        return b.append("}}").toString();
    }
    /** 위 요청의 답에서 방마다의 화면 글(alts). 못 읽으면 빈 표. */
    @SuppressWarnings("unchecked")
    public static Map<String, String> parseLoadingBatch(String json) {
        Map<String, String> out = new LinkedHashMap<String, String>();
        if (json == null || json.length() < 10) return out;
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map) || !(((Map<String, Object>) o).get("alts") instanceof Map)) return out;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) ((Map<String, Object>) o).get("alts")).entrySet())
                if (e.getValue() instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) e.getValue()).get("ok"))) out.put(e.getKey(), HomeSearchCore.toJson(e.getValue()));
        } catch (Exception ignored) { }
        return out;
    }

    /** 모든 방 목록(엔진이 칩으로 준 순서)을 저장소 글로 / 되돌린다 — 다음에 켤 때 방 목록을 기다리지 않고 모든 방을 한꺼번에 받으려고. 방 이름 1~29자 · 최대 24개. */
    public static String encSels(List<String> sels) {
        StringBuilder b = new StringBuilder();
        if (sels != null) for (String s : sels) { if (s == null || s.length() == 0 || s.length() > 29 || s.indexOf('\n') >= 0) continue; if (b.length() > 0) b.append('\n'); b.append(s); }
        return b.toString();
    }
    public static ArrayList<String> decSels(String enc) {
        ArrayList<String> out = new ArrayList<String>();
        if (enc == null || enc.length() == 0 || enc.length() > 1200) return out;
        for (String s : enc.split("\n")) { if (s.length() > 0 && s.length() < 30 && !out.contains(s) && out.size() < 24) out.add(s); }
        return out.size() >= 2 ? out : new ArrayList<String>();
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
    // s277: 방을 오갈 때마다 화면 전체(수백 줄)를 주 스레드에서 다시 읽어 postLine 만 꺼내던 것 — 같은 글이면 지난 답을 쓴다(최근 8개)
    private final java.util.LinkedHashMap<String, String> plMemo = new java.util.LinkedHashMap<String, String>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, String> e) { return size() > 8; }
    };
    @SuppressWarnings("unchecked")
    public void onScreen(String json) {
        if (json == null) { postLine = ""; return; }
        String m = plMemo.get(json);
        if (m != null) { postLine = m; return; }
        try { Object o = ScreenCore.parse(json); Object i = o instanceof Map ? ((Map<String, Object>) o).get("info") : null; postLine = i instanceof Map ? BoardCore.s(((Map<String, Object>) i).get("pl"), 20) : ""; plMemo.put(json, postLine); }
        catch (Exception e) { postLine = ""; }
    }
}
