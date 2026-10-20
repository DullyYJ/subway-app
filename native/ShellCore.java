package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.net.URLEncoder;
import java.util.HashMap;
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
    public static final int E_NONE = 0, E_TAB = 1, E_REFRESH = 2, E_TOAST = 3, E_LINK = 4;
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

    // ═════════════ 탭마다 보여 줄 것 ═════════════
    public static final int SRC_SETTINGS = 1, SRC_PENDING = 2;
    /** 탭 → 내용 출처. 커뮤니티 탭 안의 설정이 먼저 옮겨졌고, 나머지는 엔진 화면을 하나씩 잇는 중이다. */
    public static int sourceOf(String tab) { return "community".equals(tab) ? SRC_SETTINGS : SRC_PENDING; }

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
