package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 커뮤니티 > 게시판의 순수 자바 상태기 — 2026-10-20 (s88).
 * 글을 거르고 정렬하고 문구를 짓는 일은 전부 엔진(/screen/board)이 한다. 여기는 서버가 준 글을 엔진이 읽는 줄로 옮겨 담고,
 * 이 기기가 쥔 사실(보일 개수·두 번 누르기 대기·누른 반응·신고한 글·내 글·받아 온 댓글)을 보관하며, 눌림의 뜻만 정한다. 통신·시계는 ShellActivity 가 한다.
 */
public final class BoardCore {
    public static final String K_RX = "bd_rx", K_REP = "bd_rep", K_MY = "bd_my", K_OWNER = "bd_owner";
    public static final int SHOW_STEP = 30, MAX_POSTS = 400;
    public static final long ARM_MS = 3500L;
    public static final int R_NONE = 0, R_RENDER = 1, R_WRITE = 2, R_REPORT = 3, R_DELETE = 4, R_COMMENT = 5, R_NEED_ID = 6, R_OPEN = 7;

    private final ShellCore.Store st;
    public boolean loading = true;
    public int n = SHOW_STEP;
    String armK = "", armId = ""; long armAt;
    final List<Map<String, Object>> posts = new ArrayList<Map<String, Object>>();               // 서버가 준 글(원래 모양)
    final Map<String, List<Object>> cmts = new LinkedHashMap<String, List<Object>>();           // 글번호 → 엔진 댓글 줄
    List<String> idByIdx = new ArrayList<String>();                                             // 엔진이 돌려준 info: 원래 번호 → 글번호
    Map<String, String> pidById = new LinkedHashMap<String, String>();                          // 글번호 → 엔진이 정한 post id (입력칸 열쇠용)

    public BoardCore(ShellCore.Store st) { this.st = st; }

    // ── 보관 ──
    @SuppressWarnings("unchecked")
    private Map<String, Object> obj(String key) {
        try { Object o = ScreenCore.parse(st.get(key, "{}")); if (o instanceof Map) return (Map<String, Object>) o; } catch (Exception e) { /* 비움 */ }
        return new LinkedHashMap<String, Object>();
    }
    @SuppressWarnings("unchecked")
    private List<Object> arr(String key) {
        try { Object o = ScreenCore.parse(st.get(key, "[]")); if (o instanceof List) return (List<Object>) o; } catch (Exception e) { /* 비움 */ }
        return new ArrayList<Object>();
    }
    public static String idStr(Object o) {
        if (o instanceof String) return (String) o;
        if (o instanceof Double) { double d = (Double) o; return d == Math.rint(d) && Math.abs(d) < 1e15 ? String.valueOf((long) d) : String.valueOf(d); }
        return "";
    }
    static String s(Object o, int max) { String v = o instanceof String ? (String) o : (o instanceof Double ? idStr(o) : ""); return v.length() > max ? v.substring(0, max) : v; }
    static double d(Object o) { return o instanceof Double ? (Double) o : 0d; }

    // ── 서버 글 읽기(/posts?limit=50 → {posts:[…]}) ──
    @SuppressWarnings("unchecked")
    public boolean setPosts(String json) {
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map) || !(((Map<String, Object>) o).get("posts") instanceof List)) return false;
            posts.clear();
            for (Object x : (List<Object>) ((Map<String, Object>) o).get("posts")) {
                if (!(x instanceof Map) || posts.size() >= MAX_POSTS) continue;
                Map<String, Object> m = (Map<String, Object>) x;
                if (idStr(m.get("id")).length() == 0 || s(m.get("title"), 400).length() == 0) continue;
                posts.add(m);
            }
            loading = false;
            return true;
        } catch (Exception e) { return false; }
    }

    /** 서버 댓글(/comments → {comments:[{id,nick,body,ts}]})을 글에 붙인다. */
    @SuppressWarnings("unchecked")
    public boolean setComments(String postId, String json) {
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map) || !(((Map<String, Object>) o).get("comments") instanceof List)) return false;
            List<Object> out = new ArrayList<Object>();
            for (Object x : (List<Object>) ((Map<String, Object>) o).get("comments")) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> m = (Map<String, Object>) x;
                List<Object> row = new ArrayList<Object>();
                row.add("srv" + idStr(m.get("id"))); row.add(s(m.get("nick"), 40)); row.add(s(m.get("body"), 400)); row.add(Double.valueOf(d(m.get("ts")))); row.add(new ArrayList<Object>());
                out.add(row);
            }
            if (out.isEmpty()) return false;
            cmts.put(postId, out);
            return true;
        } catch (Exception e) { return false; }
    }
    /** 방금 쓴 댓글을 바로 보이게 덧붙인다(서버 번호가 오면 다음 받기에서 바뀐다). */
    public void addLocalComment(String postId, String nick, String text, long now) {
        List<Object> l = cmts.get(postId); if (l == null) { l = new ArrayList<Object>(); cmts.put(postId, l); }
        List<Object> row = new ArrayList<Object>();
        row.add("loc" + now); row.add(nick); row.add(text); row.add(Double.valueOf(now)); row.add(new ArrayList<Object>());
        l.add(row);
    }

    // ── 내 글 ──
    /** 새로 쓴 글을 내 글 목록에 둔다(전송 대기 표시 pending). 반환: 글번호. */
    public String addMine(String id, String cat, String title, String body, String nick, long now, boolean pending) {
        List<Object> my = arr(K_MY);
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", id); m.put("cat", cat); m.put("title", title); m.put("body", body); m.put("nick", nick); m.put("ts", Double.valueOf(now)); m.put("pending", Boolean.valueOf(pending));
        my.add(0, m);
        while (my.size() > 50) my.remove(my.size() - 1);
        st.put(K_MY, HomeSearchCore.toJson(my));
        return id;
    }
    @SuppressWarnings("unchecked")
    public void markSent(String localId, String serverId) {
        List<Object> my = arr(K_MY);
        for (Object x : my) if (x instanceof Map && localId.equals(idStr(((Map<String, Object>) x).get("id")))) {
            ((Map<String, Object>) x).put("id", serverId); ((Map<String, Object>) x).put("pending", Boolean.FALSE); ((Map<String, Object>) x).put("srv", Boolean.TRUE);
        }
        st.put(K_MY, HomeSearchCore.toJson(my));
    }
    @SuppressWarnings("unchecked")
    private boolean removeMine(String id) {
        List<Object> my = arr(K_MY), out = new ArrayList<Object>(); boolean hit = false;
        for (Object x : my) { if (x instanceof Map && id.equals(idStr(((Map<String, Object>) x).get("id")))) hit = true; else out.add(x); }
        if (hit) st.put(K_MY, HomeSearchCore.toJson(out));
        return hit;
    }
    @SuppressWarnings("unchecked")
    public boolean isServerMine(String id) {
        for (Object x : arr(K_MY)) if (x instanceof Map && id.equals(idStr(((Map<String, Object>) x).get("id")))) return Boolean.TRUE.equals(((Map<String, Object>) x).get("srv"));
        return false;
    }

    // ── 엔진 요청 ──
    /** 엔진 글 줄: [번호, 분류, 제목, 본문, 글쓴이, 시각, 조회, 좋아요, ㅋㅋ, ㅠㅠ, 서버 댓글 수, 표시비트, 링크, 댓글들]  (표시비트 1 내 글 · 2 이용자 글 · 4 전송 대기 · 8 서버 글) */
    @SuppressWarnings("unchecked")
    List<Object> rows() {
        List<Object> out = new ArrayList<Object>();
        for (Object x : arr(K_MY)) {                                    // 내 글은 서버 목록 위에 얹는다
            if (!(x instanceof Map)) continue;
            Map<String, Object> m = (Map<String, Object>) x;
            String id = idStr(m.get("id"));
            boolean srv = Boolean.TRUE.equals(m.get("srv"));
            boolean dup = false;
            for (Map<String, Object> p : posts) if (id.equals(idStr(p.get("id")))) dup = true;
            if (dup) continue;
            out.add(row(id, s(m.get("cat"), 12), s(m.get("title"), 300), s(m.get("body"), 3000), s(m.get("nick"), 40), d(m.get("ts")), 0, 0, 0, 0, 0,
                1 | (Boolean.TRUE.equals(m.get("pending")) ? 4 : 0) | (srv ? 8 : 0), "", cmts.get(id)));
        }
        List<Object> mineIds = new ArrayList<Object>();
        for (Object x : arr(K_MY)) if (x instanceof Map) mineIds.add(idStr(((Map<String, Object>) x).get("id")));
        for (Map<String, Object> p : posts) {
            String id = idStr(p.get("id"));
            boolean mine = mineIds.contains(id);
            out.add(row(id, s(p.get("cat"), 12).length() > 0 ? s(p.get("cat"), 12) : "잡담", s(p.get("title"), 300), s(p.get("body"), 3000), s(p.get("nick"), 40).length() > 0 ? s(p.get("nick"), 40) : "익명",
                d(p.get("ts")), (int) d(p.get("views")), (int) d(p.get("likes")), (int) d(p.get("lols")), (int) d(p.get("sads")), (int) d(p.get("cmts")),
                8 | (mine ? 1 : 0) | (d(p.get("user")) != 0 || Boolean.TRUE.equals(p.get("user")) ? 2 : 0), s(p.get("link"), 400), cmts.get(id)));
        }
        return out;
    }
    private static List<Object> row(String id, String cat, String title, String body, String nick, double ts, int views, int like, int lol, int sad, int srvCmts, int flags, String link, List<Object> cm) {
        List<Object> r = new ArrayList<Object>();
        r.add(id); r.add(cat); r.add(title); r.add(body); r.add(nick); r.add(Double.valueOf(ts)); r.add(Double.valueOf(views)); r.add(Double.valueOf(like)); r.add(Double.valueOf(lol)); r.add(Double.valueOf(sad));
        r.add(Double.valueOf(srvCmts)); r.add(Double.valueOf(flags)); r.add(link); r.add(cm == null ? new ArrayList<Object>() : cm);
        return r;
    }

    /** POST /screen/board 본문. */
    public String request(int cap, long now) {
        if (armK.length() > 0 && now - armAt > ARM_MS) { armK = ""; armId = ""; }
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{\"n\":").append(n).append(",\"st\":").append(ShellCore.q(loading ? "loading" : "ready"));
        b.append(",\"arm\":").append(armK.length() > 0 ? "{\"k\":" + ShellCore.q(armK) + ",\"id\":" + ShellCore.q(armId) + "}" : "null");
        b.append(",\"rx\":").append(st.get(K_RX, "{}")).append(",\"rep\":").append(st.get(K_REP, "[]")).append("},\"p\":");
        List<Object> rs = rows();
        idByIdx = new ArrayList<String>();
        for (Object r : rs) idByIdx.add(idStr(((List<?>) r).get(0)));
        return b.append(HomeSearchCore.toJson(rs)).append('}').toString();
    }

    /** 엔진이 돌려준 화면의 info(ids/idx)를 읽어 글번호 ↔ 입력칸 열쇠를 맞춘다. */
    @SuppressWarnings("unchecked")
    public void onScreen(String json) {
        pidById.clear();
        try {
            Object o = ScreenCore.parse(json);
            Object info = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            if (!(info instanceof Map)) return;
            Object ids = ((Map<String, Object>) info).get("ids"), idx = ((Map<String, Object>) info).get("idx");
            if (!(ids instanceof List) || !(idx instanceof List)) return;
            for (int k = 0; k < ((List<Object>) ids).size() && k < ((List<Object>) idx).size(); k++) {
                int i = (int) d(((List<Object>) idx).get(k));
                if (i >= 0 && i < idByIdx.size()) pidById.put(idByIdx.get(i), s(((List<Object>) ids).get(k), 60));
            }
        } catch (Exception e) { pidById.clear(); }
    }
    /** 글 id 화면 열쇠('p…') → 글번호. */
    public String idOfPid(String pid) {
        for (Map.Entry<String, String> e : pidById.entrySet()) if (e.getValue().equals(pid)) return e.getKey();
        return "";
    }
    public String commentKey(String postId) { String pid = pidById.get(postId); return pid == null || pid.length() < 2 ? "" : "c." + pid.substring(1); }
    public boolean isServerPost(String id) { for (Map<String, Object> p : posts) if (id.equals(idStr(p.get("id")))) return true; return isServerMine(id); }

    // ── 눌림 ──
    public String pendingId = "", pendingText = "";               // R_REPORT/R_DELETE/R_COMMENT 의 대상
    private String idAt(String num) {
        try { int i = Integer.parseInt(num); if (i >= 0 && i < idByIdx.size()) return idByIdx.get(i); } catch (NumberFormatException e) { /* 무시 */ }
        return "";
    }
    @SuppressWarnings("unchecked")
    private void toggleRx(String id, String type) {
        Map<String, Object> rx = obj(K_RX);
        Object cur = rx.get(id);
        Map<String, Object> m = cur instanceof Map ? (Map<String, Object>) cur : new LinkedHashMap<String, Object>();
        if (m.containsKey(type)) m.remove(type); else m.put(type, Double.valueOf(1));
        if (m.isEmpty()) rx.remove(id); else rx.put(id, m);
        st.put(K_RX, HomeSearchCore.toJson(rx));
    }
    @SuppressWarnings("unchecked")
    private void addReported(String id) {
        List<Object> rep = arr(K_REP);
        if (!rep.contains(id)) rep.add(id);
        while (rep.size() > 200) rep.remove(0);
        st.put(K_REP, HomeSearchCore.toJson(rep));
    }
    /** v: 'bd.lk.3' 같은 이름. fields: 화면 입력칸 글자(댓글). */
    public int act(String v, Map<String, String> fields, long now) {
        if (v == null || !v.startsWith("bd.")) return R_NONE;
        if ("bd.more".equals(v)) { n = Math.min(300, n + SHOW_STEP); return R_RENDER; }
        if ("bd.write".equals(v)) return R_WRITE;
        String[] p = v.split("\\.");
        if (p.length != 3) return R_NONE;
        String id = idAt(p[2]);
        if (id.length() == 0) return R_NONE;
        String kind = p[1];
        if ("lk".equals(kind)) { toggleRx(id, "like"); return R_RENDER; }
        if ("lo".equals(kind)) { toggleRx(id, "lol"); return R_RENDER; }
        if ("sd".equals(kind)) { toggleRx(id, "sad"); return R_RENDER; }
        if ("dl".equals(kind) || "rp".equals(kind)) {
            if (armK.equals(kind) && armId.equals(id) && now - armAt <= ARM_MS) {          // 두 번째 눌림 = 확정
                armK = ""; armId = ""; pendingId = id;
                if ("rp".equals(kind)) { addReported(id); return R_REPORT; }
                boolean srv = isServerMine(id) || isServerPost(id);
                removeMine(id);
                return srv ? R_DELETE : R_RENDER;
            }
            armK = kind; armId = id; armAt = now; return R_RENDER;
        }
        if ("cm".equals(kind)) {
            String key = commentKey(id), t = fields == null ? null : fields.get(key);
            if (t == null || t.trim().length() == 0) return R_NONE;
            pendingId = id; pendingText = t.trim().length() > 200 ? t.trim().substring(0, 200) : t.trim();
            return R_COMMENT;
        }
        return R_NONE;
    }

    // ── 서버 본문 ──
    public static String reportBody(String id) { return "{\"post_id\":" + ShellCore.q(id) + "}"; }
    public static String deleteBody(String id, String owner) { return "{\"post_id\":" + ShellCore.q(id) + ",\"owner_key\":" + ShellCore.q(owner) + "}"; }
    public static String commentBody(String id, String nick, String text) { return "{\"post_id\":" + ShellCore.q(id) + ",\"nick\":" + ShellCore.q(nick) + ",\"body\":" + ShellCore.q(text) + "}"; }
    public static String postBody(String nick, String title, String body, String cat, String owner) {
        return "{\"nick\":" + ShellCore.q(nick) + ",\"title\":" + ShellCore.q(title) + ",\"body\":" + ShellCore.q(body) + ",\"cat\":" + ShellCore.q(cat) + ",\"owner_key\":" + ShellCore.q(owner) + "}";
    }
    public static String postsUrl() { return ShellCore.BOARD_BASE + "/posts?limit=50"; }
    public static String commentsUrl(String id) { return ShellCore.BOARD_BASE + "/comments?post_id=" + ShellCore.enc(id) + "&limit=50"; }
}
