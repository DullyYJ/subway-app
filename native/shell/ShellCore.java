package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 네이티브 껍데기(ShellActivity)의 순수 자바 계산부 — 2026-10-20 (s84, 웹 없는 앱의 첫 조각).
 * 안드로이드·시계·네트워크를 쓰지 않아 JVM 에서 시험한다. 원칙은 그대로다: 화면의 글·순서·보임/숨김은 엔진이 정하고, 여기는 ① 기기 사실을
 * 엔진이 받는 모양으로 모으고 ② 눌림을 '저장값 바꾸기 · 탭 옮기기 · 다시 받기' 중 무엇으로 이을지만 정한다.
 *
 * 저장 장소는 Store(키-값) 하나뿐이다. 안드로이드에서는 SharedPreferences, 시험에서는 MemStore.
 */
public final class ShellCore {
    private ShellCore() { }

    public static final String BASE = "https://route-v2.phg0643.workers.dev";
    /** 껍데기가 아는 화면 규격(ScreenNativePlugin 의 status cap 과 같은 단계). */
    public static final int CAP = 18;
    /** 설정 화면 요청의 cap — 3 이면 하위 화면 행동이 'web' 이라 껍데기가 안 열 수 있는 것은 '아직 안 옮겼어요'로 알린다. */
    public static final int SETTINGS_CAP = 3;

    public interface Store { String get(String key, String def); void put(String key, String value); }

    /** 시험·임시용 메모리 저장소. */
    public static final class MemStore implements Store {
        public final Map<String, String> m = new HashMap<String, String>();
        @Override public String get(String k, String d) { String v = m.get(k); return v == null ? d : v; }
        @Override public void put(String k, String v) { m.put(k, v); }
    }

    // ═════════════ 탭 ═════════════
    /** 엔진 TABS_LIST 와 같은 이름·순서(엔진이 그림을 정하고, 여기는 어느 이름이 유효한지만 안다). */
    public static final String[] TABS = { "community", "map", "home", "shop", "food" };
    public static final String DEFAULT_TAB = "home";
    public static final String K_TAB = "tab";

    public static boolean isTab(String id) { for (String t : TABS) if (t.equals(id)) return true; return false; }
    public static String currentTab(Store st) { String t = st.get(K_TAB, DEFAULT_TAB); return isTab(t) ? t : DEFAULT_TAB; }

    /** POST /screen/tabs 본문. */
    public static String tabsBody(String tab) {
        return "{\"cap\":" + CAP + ",\"f\":{\"tab\":" + q(isTab(tab) ? tab : DEFAULT_TAB) + "}}";
    }
    public static String tabsUrl() { return BASE + "/screen/tabs"; }
    /** 통신 허용 목록(ScreenCore.netAllowed) 안의 주소인가 — 껍데기가 보내는 모든 주소가 통과해야 한다. */
    public static boolean netOk(String url) { return ScreenCore.netAllowed(url); }

    // ═════════════ 설정 화면 ═════════════
    public static final String K_ID = "comm_id", K_THEME = "theme", K_RIDELOG_OFF = "ride_log_off";
    public static final String[] NOTIF = { "arrive", "transfer", "arrive_reco" };
    public static final String THEME_DEFAULT = "pastel";

    public static String theme(Store st) { String t = st.get(K_THEME, THEME_DEFAULT); return "dark".equals(t) ? "dark" : "pastel"; }

    /** 엔진 GET /screen/settings 의 f= 에 실리는 기기 사실. 웹 쪽 설정 기능 스위치(feat)는 껍데기에 없으므로 비운다. */
    public static String settingsFacts(Store st) {
        StringBuilder b = new StringBuilder("{");
        b.append("\"id\":").append(q(st.get(K_ID, "")));
        b.append(",\"np\":{");
        for (int i = 0; i < NOTIF.length; i++) {
            if (i > 0) b.append(',');
            b.append(q(NOTIF[i])).append(':').append("0".equals(st.get("np_" + NOTIF[i], "1")) ? 0 : 1);
        }
        b.append('}');
        b.append(",\"rl\":").append("1".equals(st.get(K_RIDELOG_OFF, "0")) ? 0 : 1);
        b.append(",\"th\":").append(q(theme(st)));
        b.append(",\"feat\":{}}");
        return b.toString();
    }
    public static String settingsUrl(Store st) {
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&f=" + URLEncoder.encode(settingsFacts(st), "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP; }
    }

    /** 아이디 규칙(웹 _saveCommId 와 같다): 2~12자 · 한글/영문/숫자/밑줄. 나쁜 말 검사는 엔진이 맡는 일이라 껍데기는 모양만 본다. */
    public static String idError(String v) {
        if (v == null) return "아이디는 2~12자로 입력해주세요";
        v = v.trim();
        if (v.length() < 2 || v.length() > 12) return "아이디는 2~12자로 입력해주세요";
        for (int i = 0; i < v.length(); i++) {
            char c = v.charAt(i);
            boolean ok = (c >= '가' && c <= '힣') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_';
            if (!ok) return "한글·영문·숫자만 사용할 수 있어요";
        }
        return "";
    }

    // ═════════════ 눌림 → 효과 ═════════════
    public static final int E_NONE = 0, E_TAB = 1, E_REFRESH = 2, E_TOAST = 3, E_LINK = 4, E_NEWS = 5;
    /** 눌림 결과: 껍데기가 할 일 하나. arg 는 탭 이름 · 알림 글 · 주소. 저장값은 route 가 이미 바꿔 놓았다. */
    public static final class Effect {
        public final int kind; public final String arg;
        Effect(int k, String a) { kind = k; arg = a == null ? "" : a; }
        @Override public String toString() { return kind + ":" + arg; }
    }
    static final Effect NONE = new Effect(E_NONE, ""), REFRESH = new Effect(E_REFRESH, "");

    /** 설정 화면의 눌림. a = 행동 종류(set·sel·call·web) · v = 값 · key = 스위치 키 · on = 스위치 새 값 · fields = 입력칸 글. */
    public static Effect routeSettings(Store st, String a, String v, String key, boolean on, Map<String, String> fields) {
        if (a == null) return NONE;
        if ("set".equals(a)) {
            if (key != null && key.startsWith("n.")) {
                String k = key.substring(2);
                for (String n : NOTIF) if (n.equals(k)) { st.put("np_" + k, on ? "1" : "0"); return REFRESH; }
                return NONE;
            }
            if ("rl".equals(key)) { st.put(K_RIDELOG_OFF, on ? "0" : "1"); return REFRESH; }
            return NONE;                                           // 웹 기능 스위치(f.*)는 껍데기에 없다
        }
        if ("sel".equals(a)) {
            if ("dark".equals(v) || "pastel".equals(v)) { st.put(K_THEME, v); return REFRESH; }
            return NONE;
        }
        if ("call".equals(a)) {
            if ("saveId".equals(v)) {
                String raw = fields == null ? "" : fields.get("cid");
                String err = idError(raw);
                if (err.length() > 0) return new Effect(E_TOAST, err);
                String id = raw.trim();
                st.put(K_ID, id);
                return new Effect(E_TOAST, "아이디가 저장되었어요: " + id);
            }
            if ("clearId".equals(v)) { st.put(K_ID, ""); return new Effect(E_TOAST, "아이디가 삭제되었어요"); }
            if (v != null && v.startsWith("tab.") && isTab(v.substring(4))) return tabEffect(st, v.substring(4));
            return new Effect(E_TOAST, "아직 옮기는 중이에요");
        }
        if ("web".equals(a)) return new Effect(E_TOAST, "아직 옮기는 중이에요");
        return NONE;
    }

    /** 탭 막대의 눌림. */
    public static Effect routeTabs(Store st, String a, String v) {
        if ("call".equals(a) && v != null && v.startsWith("tab.") && isTab(v.substring(4))) return tabEffect(st, v.substring(4));
        return NONE;
    }
    private static Effect tabEffect(Store st, String tab) { st.put(K_TAB, tab); return new Effect(E_TAB, tab); }

    /** 화면 칸(screen)별 눌림. 새로 받아야 하면 REFRESH(본문) · 탭 전체를 다시 그려야 하면 E_TAB. */
    public static Effect route(String screen, Store st, String a, String v, String key, boolean on, String url, Map<String, String> fields) {
        if (S_SETTINGS.equals(screen)) return routeSettings(st, a, v, key, on, fields);
        if (S_CCHIPS.equals(screen)) {
            if ("call".equals(a) && v != null && v.startsWith("cc.") && isMode(v.substring(3))) {
                st.put(K_MODE, v.substring(3));
                return new Effect(E_TAB, currentTab(st));
            }
            return NONE;
        }
        if (S_SHOP.equals(screen)) {
            if ("cat".equals(a) && v != null && v.length() > 0 && v.length() < 20) { st.put(K_SHOP_CAT, v); return REFRESH; }
            if ("open".equals(a)) return linkEffect(url);
            if ("refresh".equals(a)) return REFRESH;
            return NONE;
        }
        if (S_NEWS.equals(screen)) {
            if ("cat".equals(a) && v != null && v.length() > 0 && v.length() < 20) { st.put(K_NEWS_CAT, v); return REFRESH; }
            if ("call".equals(a) && v != null && v.startsWith("nw.")) {
                try { int i = Integer.parseInt(v.substring(3)); if (i >= 0 && i < NewsRows.MAX) return new Effect(E_NEWS, String.valueOf(i)); } catch (NumberFormatException e) { /* 무시 */ }
            }
            return NONE;
        }
        return NONE;
    }

    /** 검색줄: 글이 있으면 tpl 의 {q} 에 넣고, 비었으면 empty 주소로(주소는 엔진이 정했다). */
    public static Effect routeSearch(String tpl, String empty, String q) {
        String t = q == null ? "" : q.trim();
        if (t.length() > 0 && tpl != null && tpl.indexOf("{q}") >= 0) return linkEffect(tpl.replace("{q}", enc(t)));
        if (t.length() == 0 && empty != null && empty.length() > 0) return linkEffect(empty);
        return NONE;
    }
    static Effect linkEffect(String url) { return linkOk(url) ? new Effect(E_LINK, url) : NONE; }

    // ═════════════ 탭마다 보여 줄 것 ═════════════
    public static final String K_MODE = "cc_mode", K_SHOP_CAT = "shop_cat", K_NEWS_CAT = "news_cat";
    public static final String MODE_DEFAULT = "news";
    public static final String[] MODES = { "chat", "board", "news", "set" };
    public static boolean isMode(String m) { for (String x : MODES) if (x.equals(m)) return true; return false; }
    public static String mode(Store st) { String m = st.get(K_MODE, MODE_DEFAULT); return isMode(m) ? m : MODE_DEFAULT; }

    public static final String S_SETTINGS = "settings", S_SHOP = "shop", S_NEWS = "news", S_CCHIPS = "cchips", S_PENDING = "pending", S_HOME = "home";

    /** 탭이 보여 줄 화면 칸들(위에서 아래로). 첫 칸이 머리(높이는 그린 내용만큼), 마지막 칸이 본문(남은 높이). 한 칸이면 본문만. */
    public static String[] slotsOf(Store st, String tab) {
        if ("community".equals(tab)) {
            String m = mode(st);
            return new String[] { S_CCHIPS, "news".equals(m) ? S_NEWS : "set".equals(m) ? S_SETTINGS : S_PENDING };
        }
        if ("shop".equals(tab)) return new String[] { S_SHOP };
        if ("home".equals(tab)) return new String[] { S_HOME };
        return new String[] { S_PENDING };
    }

    /** 요청 하나(GET 이면 body 가 null). */
    public static final class Req {
        public final String method, url, body;
        Req(String m, String u, String b) { method = m; url = u; body = b; }
    }

    public static final String BOARD_BASE = "https://board-writer.phg0643.workers.dev";
    public static final String NEWS_BASE = "https://gentle-lab-7e47subway-api.phg0643.workers.dev";

    /** 이 화면을 계산하려면 먼저 받아야 하는 원자료 주소들(없으면 바로 엔진에 요청). */
    public static String[] feedUrls(String screen) {
        if (S_NEWS.equals(screen)) return new String[] { BOARD_BASE + "/newsfeed", NEWS_BASE + "/news/all?per=100" };
        return new String[0];
    }

    /** 화면 하나를 엔진에서 받는 요청. feeds 는 feedUrls 의 응답 글(못 받은 것은 빈 글). */
    public static Req request(String screen, Store st, String[] feeds) {
        if (S_SETTINGS.equals(screen)) return new Req("GET", settingsUrl(st), null);
        if (S_SHOP.equals(screen)) {
            String c = st.get(K_SHOP_CAT, "");
            return new Req("GET", BASE + "/screen/shop?cap=" + CAP + (c.length() > 0 ? "&cat=" + enc(c) : ""), null);
        }
        if (S_CCHIPS.equals(screen)) return new Req("POST", BASE + "/screen/cchips", "{\"cap\":" + CAP + ",\"f\":{\"mode\":" + q(mode(st)) + "}}");
        if (S_NEWS.equals(screen)) {
            NewsRows r = NewsRows.from(feeds);
            return new Req("POST", BASE + "/screen/news", "{\"cap\":" + CAP + ",\"f\":{\"cat\":" + q(st.get(K_NEWS_CAT, "전체")) + "},\"n\":" + r.json() + "}");
        }
        return null;
    }
    /** 화면 둘을 위아래로 이어 붙인다(첫 화면의 head·cover·info 를 쓰고 본문만 이어 붙임). 내용은 건드리지 않는다. 못 읽으면 첫 화면 그대로. */
    @SuppressWarnings("unchecked")
    public static String mergeBodies(String first, String second) {
        try {
            Object a = ScreenCore.parse(first), b = ScreenCore.parse(second);
            if (!(a instanceof Map) || !(b instanceof Map)) return first;
            Map<String, Object> ma = (Map<String, Object>) a, mb = (Map<String, Object>) b;
            if (!(ma.get("body") instanceof List) || !(mb.get("body") instanceof List)) return first;
            List<Object> body = new ArrayList<Object>((List<Object>) ma.get("body"));
            body.addAll((List<Object>) mb.get("body"));
            ma.put("body", body);
            return HomeSearchCore.toJson(ma);
        } catch (Exception e) { return first; }
    }
    public static String enc(String s) { try { return URLEncoder.encode(s, "UTF-8"); } catch (java.io.UnsupportedEncodingException e) { return ""; } }

    // ═════════════ 뉴스 원자료 → 엔진 요청 ═════════════
    /** 엔진 /screen/news 가 받는 기사 줄 [제목, 링크, 언론사, 시각(ms), 서버 분류, 요약]. 분류·거르기·중복 정리는 엔진이 하고, 여기는 모양만 맞춘다. */
    public static final class NewsRows {
        public final List<String[]> rows = new ArrayList<String[]>();
        public static final int MAX = 1200;

        @SuppressWarnings("unchecked")
        public static NewsRows from(String[] feeds) {
            NewsRows r = new NewsRows();
            try {
                if (feeds != null && feeds.length > 0 && feeds[0] != null && feeds[0].length() > 2) {
                    Object o = ScreenCore.parse(feeds[0]);
                    if (o instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) o).get("ok")) && ((Map<String, Object>) o).get("items") instanceof List)
                        for (Object it : (List<Object>) ((Map<String, Object>) o).get("items")) r.add(it, "");
                }
            } catch (Exception e) { /* 못 읽은 원자료는 건너뛴다 */ }
            try {
                if (feeds != null && feeds.length > 1 && feeds[1] != null && feeds[1].length() > 2) {
                    Object o = ScreenCore.parse(feeds[1]);
                    if (o instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) o).get("ok")) && ((Map<String, Object>) o).get("cats") instanceof Map) {
                        Map<String, Object> cats = (Map<String, Object>) ((Map<String, Object>) o).get("cats");
                        for (Map.Entry<String, Object> e : cats.entrySet())
                            if (e.getValue() instanceof List) for (Object it : (List<Object>) e.getValue()) r.add(it, e.getKey());
                    }
                }
            } catch (Exception e) { /* 건너뛴다 */ }
            return r;
        }
        @SuppressWarnings("unchecked")
        void add(Object it, String srv) {
            if (rows.size() >= MAX || !(it instanceof Map)) return;
            Map<String, Object> m = (Map<String, Object>) it;
            String title = decode(str(m.get("title"))).replaceAll("\\s+", " ").trim();
            if (title.length() == 0) return;
            String desc = decode(str(m.get("desc")));
            if (desc.length() > 400) desc = desc.substring(0, 400);
            long ts = m.get("ts") instanceof Double ? (long) ((Double) m.get("ts")).doubleValue() : 0L;
            String cat = srv.length() > 0 ? srv : str(m.get("cat"));
            rows.add(new String[] { title, str(m.get("link")), decode(str(m.get("source"))).trim(), String.valueOf(ts), cat, desc });
        }
        public String json() {
            StringBuilder b = new StringBuilder("[");
            for (int i = 0; i < rows.size(); i++) {
                if (i > 0) b.append(',');
                b.append(rowJson(i));
            }
            return b.append(']').toString();
        }
        public String rowJson(int i) {
            if (i < 0 || i >= rows.size()) return "[]";
            String[] r = rows.get(i);
            return "[" + q(r[0]) + "," + q(r[1]) + "," + q(r[2]) + "," + r[3] + "," + q(r[4]) + "," + q(r[5]) + "]";
        }
        static String str(Object o) { return o instanceof String ? (String) o : ""; }
    }

    /** HTML 글자 이름표 풀기(웹 _htmlDecode 와 같은 범위: 자주 오는 이름표와 숫자 이름표). */
    public static String decode(String s) {
        if (s == null || s.indexOf('&') < 0) return s == null ? "" : s;
        StringBuilder b = new StringBuilder();
        int n = s.length();
        for (int i = 0; i < n; i++) {
            char c = s.charAt(i);
            if (c != '&') { b.append(c); continue; }
            int e = s.indexOf(';', i);
            if (e < 0 || e - i > 9) { b.append(c); continue; }
            String t = s.substring(i + 1, e), r = null;
            if ("amp".equals(t)) r = "&"; else if ("lt".equals(t)) r = "<"; else if ("gt".equals(t)) r = ">"; else if ("quot".equals(t)) r = "\""; else if ("apos".equals(t)) r = "'"; else if ("nbsp".equals(t)) r = " ";
            else if (t.startsWith("#")) {
                try {
                    int cp = t.startsWith("#x") || t.startsWith("#X") ? Integer.parseInt(t.substring(2), 16) : Integer.parseInt(t.substring(1));
                    if (cp > 0 && cp < 0x110000) r = new String(Character.toChars(cp));
                } catch (NumberFormatException ex) { r = null; }
            }
            if (r == null) { b.append(c); continue; }
            b.append(r); i = e;
        }
        return b.toString();
    }

    /** 원문 주소는 http(s) 만 연다. */
    public static boolean linkOk(String u) { return u != null && u.length() < 2048 && (u.startsWith("https://") || u.startsWith("http://")) && u.indexOf(' ') < 0; }

    /** 기사 상세(엔진 {detail}) → 안내창에 쓸 값. 못 읽으면 null. */
    public static final class Detail {
        public String title = "", meta = "", body = "", notice = "", btn = "", close = "닫기", link = "";
        public boolean open;
    }
    @SuppressWarnings("unchecked")
    public static Detail parseDetail(String json, String link) {
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return null;
            Object d = ((Map<String, Object>) o).get("detail");
            if (!(d instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) d;
            Detail r = new Detail();
            r.title = NewsRows.str(m.get("title")); r.meta = NewsRows.str(m.get("meta"));
            String desc = NewsRows.str(m.get("desc")), empty = NewsRows.str(m.get("empty"));
            r.body = desc.length() > 0 ? desc : empty;
            r.notice = NewsRows.str(m.get("notice")); r.btn = NewsRows.str(m.get("btn"));
            String cl = NewsRows.str(m.get("close")); if (cl.length() > 0) r.close = cl;
            r.open = Double.valueOf(1d).equals(m.get("open")) && linkOk(link);
            r.link = link;
            return r.title.length() > 0 ? r : null;
        } catch (Exception e) { return null; }
    }
    public static String newsDetailBody(String rowJson) { return "{\"cap\":" + CAP + ",\"d\":" + rowJson + "}"; }

    /** 아직 엔진 화면을 못 잇는 탭의 임시 화면(앱이 정한 글은 이것 하나뿐 — 이어지는 대로 지운다). */
    public static String pendingScreen(String tab) {
        return "{\"ok\":true,\"v\":1,\"screen\":\"pending\",\"cover\":\"tab\",\"head\":[],\"body\":[{\"t\":\"text\",\"s\":\"이 화면은 아직 네이티브로 옮기는 중이에요.\\n(" + esc(tab) + ")\","
            + "\"size\":14,\"color\":\"sub\",\"lh\":1.5,\"align\":\"center\",\"pad\":[24,80,24,0]}]}";
    }

    // ═════════════ 색 ═════════════
    /** ScreenView 의 역할 번호 순서(bg·card·border·text·sub·gold·orange·imgbg·white·border2·card2·nav)와 같다. */
    public static int[] palette(String theme) {
        if ("dark".equals(theme)) return new int[] { 0xFF121214, 0xFF1C1C1E, 0xFF2C2C2E, 0xFFF2F2F7, 0xFF8E8E93, 0xFFD4AF37, 0xFFFF9F0A, 0xFF252528, 0xFFFFFFFF, 0xFF3A3A3C, 0xFF2C2C2E, 0xFF1C1C1E };
        return new int[] { 0xFFF0F4F8, 0xFFFFFFFF, 0xFFDCE8F0, 0xFF1A2533, 0xFF6B8299, 0xFF1D9BF0, 0xFFF07830, 0xFFE8F4FF, 0xFFFFFFFF, 0xFFC8DCEA, 0xFFE8F0F8, 0xFFFFFFFF };
    }

    // ═════════════ 작은 도구 ═════════════
    static String q(String s) { return "\"" + esc(s) + "\""; }
    static String esc(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c == '\n') b.append("\\n");
            else if (c < 0x20) b.append(' ');
            else b.append(c);
        }
        return b.toString();
    }
}
