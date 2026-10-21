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
    public static final int SETTINGS_CAP = 8;

    /** 앱 시계의 오늘 날짜 글자(예: 2026-10-20). 화면을 요청하기 직전에 껍데기가 넣는다 — 코어는 시계를 읽지 않는다. */
    public static final String K_DAY = "mk_today";
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
    /** 맨 위 흐르는 문구 화면(엔진 /screen/hdr). tzMin 은 동쪽이 +(한국 540). */
    public static String hdrUrl(int tzMin, long nowMs) { return BASE + "/screen/hdr?tz=" + tzMin + "&now=" + nowMs; }
    public static String tabsUrl() { return BASE + "/screen/tabs"; }
    /** 통신 허용 목록(ScreenCore.netAllowed) 안의 주소인가 — 껍데기가 보내는 모든 주소가 통과해야 한다. */
    public static boolean netOk(String url) { return ScreenCore.netAllowed(url); }

    // ═════════════ 설정 화면 ═════════════
    public static final String K_LOCDISC = "loc_disc";   // 위치 정보 이용 안내에 동의했는가(1)
    public static final String K_ID = "comm_id", K_THEME = "theme", K_RIDELOG_OFF = "ride_log_off";
    public static final String[] NOTIF = { "arrive", "transfer", "arrive_reco" };
    public static final String THEME_DEFAULT = "pastel";

    public static String theme(Store st) { String t = st.get(K_THEME, THEME_DEFAULT); return "dark".equals(t) ? "dark" : "pastel"; }

    /** 엔진 GET /screen/settings 의 f= 에 실리는 기기 사실. pt(포인트 저장값 · 엔진이 만든 그대로)와 day(오늘 날짜)는 엔진 규칙(/rules)이 등급을 계산하는 데 쓴다. */
    public static String settingsFacts(Store st) {
        StringBuilder b = new StringBuilder("{");
        b.append("\"id\":").append(q(st.get(K_ID, "")));
        b.append(",\"np\":{");
        for (int i = 0; i < NOTIF.length; i++) {
            if (i > 0) b.append(',');
            b.append(q(NOTIF[i])).append(':').append("0".equals(st.get("np_" + NOTIF[i], "1")) ? 0 : 1);
        }
        b.append('}');
        b.append(",\"ovl\":").append("1".equals(st.get(K_OVL, "0")) ? 1 : 0);
        b.append(",\"sam\":").append("1".equals(st.get(K_SAM, "0")) ? 1 : 0).append(",\"samw\":").append("1".equals(st.get(K_SAMW, "0")) ? 1 : 0);
        b.append(",\"cm\":").append(CmCore.on(st) ? 1 : 0);
        b.append(",\"errn\":").append(ErrCore.count(st));
        b.append(",\"pgs\":[\"sam\",\"ovl\",\"arr\",\"cm\",\"gw\",\"dev\"]");                           // 이 앱이 열 수 있는 하위 화면(나머지 줄은 엔진이 감춘다)
        b.append(",\"rl\":").append("1".equals(st.get(K_RIDELOG_OFF, "0")) ? 0 : 1);
        b.append(",\"th\":").append(q(theme(st)));
        b.append(",\"pt\":").append(RulesCore.ptOf(st)).append(",\"day\":").append(q(st.get(K_DAY, ""))).append('}');
        return b.toString();
    }
    public static String settingsUrl(Store st) {
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&f=" + URLEncoder.encode(settingsFacts(st), "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP; }
    }

    // ═════════════ 설정 하위 화면: 다른 앱 위에 표시(ovl) ═════════════
    public static final int PG_NONE = 0, PG_RENDER = 1, PG_CLOSE = 2, PG_NEEDPERM = 3, PG_SAMOPEN = 4, PG_BATREQ = 5, PG_ARRTEST = 6, PG_GWADD = 7, PG_GWCFG = 8, PG_DEVSTART = 9, PG_DEVSTOP = 10, PG_ERLCOPY = 11, PG_ERLCLEAR = 12, PG_LOCOK = 13, PG_LOCNO = 14, PG_POLOPEN = 15;
    /** 하위 화면 주소. 지원 여부·허용 여부는 기기 사실이라 껍데기가 알려 준다(글은 엔진이 만든다). */
    /** 출퇴근 브리핑 화면(cm · 시각 고르기 · 장소 고르기) 주소 — pfJson 은 CmCore.pageFacts(). */
    public static String pageUrlCm(String pfJson) {
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=cm&f=" + URLEncoder.encode(pfJson, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=cm"; }
    }
    /** 캐릭터 시계 위젯 화면(gw) 주소 — pfJson 은 GwCore.pageFacts(). */
    public static String pageUrlGw(String pfJson) {
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=gw&f=" + URLEncoder.encode(pfJson, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=gw"; }
    }
    /** 설정 첫 화면의 약관·오류 로그 줄 → 하위 화면 이름(polp · poll · polo · erl), 아니면 null. */
    public static String polPage(String v) {
        if ("pol.privacy".equals(v)) return "polp";
        if ("pol.location".equals(v)) return "poll";
        if ("pol.opensource".equals(v)) return "polo";
        if ("errlog".equals(v)) return "erl";
        return null;
    }
    public static boolean isPolPage(String p) { return "polp".equals(p) || "poll".equals(p) || "polo".equals(p) || "erl".equals(p); }
    /** 사실이 필요 없는 하위 화면(약관) 주소, 오류 로그는 pfJson 에 기록을 싣는다. */
    public static String pageUrlPlain(String page, String pfJson) {
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=" + page + (pfJson == null ? "" : "&f=" + URLEncoder.encode(pfJson, "UTF-8")); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=" + page; }
    }
    /** 개발자 도구 화면(dev) 주소 — pfJson 은 DevCore.pageFacts(). */
    public static String pageUrlDev(String pfJson) {
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=dev&f=" + URLEncoder.encode(pfJson, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=dev"; }
    }
    /** 절전 화면(sam) 주소 — pfJson 은 기기가 읽은 사실({"pf":{w,ig,bk,sok}}). */
    public static String pageUrlSam(String pfJson) {
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=sam&f=" + URLEncoder.encode(pfJson, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=sam"; }
    }
    /** 하차 추천 시험 화면(arr) 주소. stat 이 true 면 '상태 확인' 결과를 싣는다. */
    public static String pageUrlArr(boolean showStat, boolean timer, boolean policy, String recoInner, String stage, long stageAt) {
        StringBuilder b = new StringBuilder("{\"pf\":{\"nat\":true,\"nv\":true");
        if (showStat) {
            b.append(",\"st\":{\"timer\":").append(timer).append(",\"route\":").append(recoInner.length() > 0).append(",\"pre\":7,\"tzo\":-540,\"policy\":").append(policy);
            if (recoInner.length() > 0) b.append(',').append(recoInner);
            if (stage.length() > 0) b.append(",\"dg\":{\"stage\":").append(q(stage)).append(stageAt > 0 ? ",\"at\":" + stageAt : "").append('}');
            b.append('}');
        }
        b.append("}}");
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=arr&f=" + URLEncoder.encode(b.toString(), "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=arr"; }
    }
    /** 'arr.t.<시간대>' 누름 → 시간대 이름(morning · lunch · night · shop), 아니면 null. */
    public static String arrKind(String v) {
        if (v == null || !v.startsWith("arr.t.")) return null;
        String k = v.substring(6);
        return ("morning".equals(k) || "lunch".equals(k) || "night".equals(k) || "shop".equals(k)) ? k : null;
    }
    /**
     * 시험 알림 요청 본문. 그 시간대에 드는 한국시간 시각(커피 08:30 · 점심 12:30 · 야식 19:30 · 쇼핑 22:00)을 도착 시각으로, 그 5분 전을 '지금'으로 엔진에 알려 준다.
     * 도착지는 강남역 좌표(맛집 서버에서 가게를 받아 오게). 글은 엔진이 만든다.
     */
    public static String arrTestBody(String kind, long nowMs) {
        int min = "morning".equals(kind) ? 8 * 60 + 30 : ("lunch".equals(kind) ? 12 * 60 + 30 : ("night".equals(kind) ? 19 * 60 + 30 : 22 * 60));
        long kstDay = Math.floorDiv(nowMs + 9L * 3600000L, 86400000L) * 86400000L - 9L * 3600000L;
        long arr = kstDay + min * 60000L;
        return "{\"arrMs\":" + arr + ",\"nowMs\":" + (arr - 5L * 60000L) + ",\"dest\":\"강남\",\"seed\":" + Math.abs(nowMs / 1000L) % 2147483647L
            + ",\"loc\":{\"lat\":37.4979,\"lng\":127.0276},\"foodPref\":\"server\",\"aiCopy\":1,\"pickShop\":1}";
    }
    public static String pageUrl(Store st, String page, boolean supported, boolean granted) {
        String pf = "{\"pf\":{\"nat\":true,\"nv\":true,\"sup\":" + supported + ",\"gr\":" + granted + ",\"on\":" + "1".equals(st.get(K_OVL, "0")) + ",\"pfl\":" + "1".equals(st.get(K_PFL, "0")) + "}}";
        try { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=" + URLEncoder.encode(page, "UTF-8") + "&f=" + URLEncoder.encode(pf, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return BASE + "/screen/settings?cap=" + SETTINGS_CAP + "&p=" + page; }
    }
    /** 하위 화면 눌림(스위치는 a=set · key=ovl). 스위치를 켰는데 권한이 없으면 PG_NEEDPERM — 껍데기가 기기 설정 화면을 연다. */
    public static int routePage(Store st, String page, String a, String v, String key, boolean on, boolean granted) {
        if ("locd".equals(page)) {
            if (!"call".equals(a)) return PG_NONE;
            if ("locd.ok".equals(v)) { st.put(K_LOCDISC, "1"); return PG_LOCOK; }
            if ("locd.no".equals(v)) return PG_LOCNO;
            if ("pol.privacy".equals(v)) return PG_POLOPEN;
            return PG_NONE;
        }
        if (isPolPage(page)) {
            if (!"call".equals(a)) return PG_NONE;
            if ("pg.back".equals(v)) return PG_CLOSE;
            if ("erl".equals(page) && "erl.copy".equals(v)) return PG_ERLCOPY;
            if ("erl".equals(page) && "erl.clear".equals(v)) return PG_ERLCLEAR;
            return PG_NONE;
        }
        if ("dev".equals(page)) {
            if (!"call".equals(a)) return PG_NONE;
            if ("pg.back".equals(v)) return PG_CLOSE;
            if (DevCore.mode(v) != null) return PG_DEVSTART;
            if ("dev.stop".equals(v)) return PG_DEVSTOP;
            return PG_NONE;
        }
        if ("gw".equals(page)) {
            if (!"call".equals(a)) return PG_NONE;
            if ("pg.back".equals(v)) return PG_CLOSE;
            if ("sam.open".equals(v)) return PG_SAMOPEN;
            if ("bat.req".equals(v)) return PG_BATREQ;
            if (GwCore.addType(v) != null) return PG_GWADD;
            if (GwCore.stepRoam(st, v)) return PG_GWCFG;
            return PG_NONE;
        }
        if ("sam".equals(page)) {
            if (!"call".equals(a)) return PG_NONE;
            if ("pg.back".equals(v)) return PG_CLOSE;
            if ("sam.open".equals(v)) return PG_SAMOPEN;
            if ("bat.req".equals(v)) return PG_BATREQ;
            return PG_NONE;
        }
        if ("arr".equals(page)) {
            if (!"call".equals(a)) return PG_NONE;
            if ("pg.back".equals(v)) return PG_CLOSE;
            if (arrKind(v) != null) return PG_ARRTEST;
            if ("arr.stat".equals(v)) return PG_RENDER;
            return PG_NONE;
        }
        if (!"ovl".equals(page)) return PG_NONE;
        if ("set".equals(a) && "ovl".equals(key)) { st.put(K_OVL, on ? "1" : "0"); return on && !granted ? PG_NEEDPERM : PG_RENDER; }
        if ("call".equals(a) && "pg.back".equals(v)) return PG_CLOSE;
        if ("call".equals(a) && "pf.live".equals(v)) { st.put(K_PFL, "1".equals(st.get(K_PFL, "0")) ? "0" : "1"); return PG_RENDER; }
        return PG_NONE;
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
    public static final int E_NONE = 0, E_TAB = 1, E_REFRESH = 2, E_TOAST = 3, E_LINK = 4, E_NEWS = 5, E_PAGE = 6;
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
            if (v != null && v.startsWith("pg.") && v.length() > 3 && v.length() < 10) return new Effect(E_PAGE, v.substring(3));      // 설정 하위 화면(다른 앱 위에 표시 …)
            String pol = polPage(v);
            if (pol != null) return new Effect(E_PAGE, pol);                                  // 약관 3종 · 오류 로그

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
    /** 커뮤니티 머리(칩 줄)를 방식 m 으로 그려 달라는 본문과 그 캐시 열쇠(다른 방식을 눌러도 바로 뜨게 미리 받는 데 쓴다). */
    public static String cchipsBody(String m) { return "{\"cap\":" + CAP + ",\"f\":{\"mode\":" + q(isMode(m) ? m : MODE_DEFAULT) + "}}"; }
    public static String cchipsKey(String m) { return S_CCHIPS + "|" + (isMode(m) ? m : MODE_DEFAULT); }
    public static String mode(Store st) { String m = st.get(K_MODE, MODE_DEFAULT); return isMode(m) ? m : MODE_DEFAULT; }

    public static final String S_SETTINGS = "settings", S_SHOP = "shop", S_NEWS = "news", S_CCHIPS = "cchips", S_PENDING = "pending", S_HOME = "home", S_BOARD = "board", S_WRITE = "write", S_CHAT = "chat", S_FOOD = "food", S_FOODSHEET = "foodsheet", S_MAPH = "maph", S_MAPB = "mapb", S_MAPSTN = "mapstn", S_MAPTT = "maptt", S_MAPBR = "mapbr", S_FAV = "fav", S_DETAIL = "detail", S_SETPG = "setpg", S_HDR = "hdr";
    public static final String K_OVL = "ovl_on", K_RIDESNAP = "ride_snap", K_GPSASK = "gps_asked", K_PFL = "pf_live", K_SAM = "dev_sam", K_SAMW = "dev_samw";

    /** 탭이 보여 줄 화면 칸들(위에서 아래로). 첫 칸이 머리(높이는 그린 내용만큼), 마지막 칸이 본문(남은 높이). 한 칸이면 본문만. */
    public static String[] slotsOf(Store st, String tab) {
        if ("community".equals(tab)) {
            String m = mode(st);
            return new String[] { S_CCHIPS, "news".equals(m) ? S_NEWS : "set".equals(m) ? S_SETTINGS : "board".equals(m) ? S_BOARD : "chat".equals(m) ? S_CHAT : S_PENDING };
        }
        if ("shop".equals(tab)) return new String[] { S_SHOP };
        if ("home".equals(tab)) return new String[] { S_HOME };
        if ("food".equals(tab)) return new String[] { S_FOOD };
        if ("map".equals(tab)) return new String[] { S_MAPH, S_MAPB };
        return new String[] { S_PENDING };
    }

    // ── 조건부 요청 메타: 엔진이 준 ETag · max-age 를 화면 열쇠마다 기억한다(앱은 따르기만 한다) ──
    /** etag · 받은 시각 · 엔진이 말한 신선 시간(초) · 그때 보낸 요청의 서명(같은 요청인지 가린다). */
    public static final class Cond {
        public final String etag; public final long at; public final int maxAge; public final int sig;
        public Cond(String etag, long at, int maxAge, int sig) { this.etag = etag == null ? "" : etag; this.at = at; this.maxAge = Math.max(0, maxAge); this.sig = sig; }
        /** 신선 시간 안이고 같은 요청이면 참 — 네트워크 없이 캐시를 그대로 쓴다. */
        public boolean fresh(long now, int sig) { return etag.length() > 0 && maxAge > 0 && this.sig == sig && now >= at && now - at < maxAge * 1000L; }
        /** 같다는 답(304)을 받았다: 받은 시각만 새로 한다. */
        public Cond touched(long now, int maxAge, int sig) { return new Cond(etag, now, maxAge > 0 ? maxAge : this.maxAge, sig); }
        public String enc() { return etag.replace('\n', ' ') + "\n" + at + "\n" + maxAge + "\n" + sig; }
        public static Cond parse(String s) {
            if (s == null || s.length() == 0) return null;
            String[] p = s.split("\n", -1);
            if (p.length != 4) return null;
            try { return new Cond(p[0], Long.parseLong(p[1]), Integer.parseInt(p[2]), Integer.parseInt(p[3])); } catch (NumberFormatException e) { return null; }
        }
    }
    public static String condKey(String ck) { return "cm_" + Integer.toHexString(ck.hashCode()); }

    // ── 마지막으로 안 내 위치: 지도 · 맛집을 위치 대기 없이 바로 그리는 데 쓴다(새 위치는 뒤에서 받아 바꾼다) ──
    public static final String K_LASTLOC = "last_loc";
    public static void lastLocPut(Store st, double la, double lo, long now) {
        if (Double.isNaN(la) || Double.isNaN(lo) || (la == 0 && lo == 0)) return;
        st.put(K_LASTLOC, la + "," + lo + "," + now);
    }
    /** {위도, 경도} 또는 null. */
    public static double[] lastLocGet(Store st) {
        try {
            String[] p = st.get(K_LASTLOC, "").split(",");
            if (p.length < 2) return null;
            double la = Double.parseDouble(p[0]), lo = Double.parseDouble(p[1]);
            return (la == 0 && lo == 0) || Math.abs(la) > 90 || Math.abs(lo) > 180 ? null : new double[] { la, lo };
        } catch (Exception e) { return null; }
    }
    /** 화면 글 안의 분류 칩(act.a == "cat")들의 값 — 다른 분류 · 방을 미리 받을 때 어떤 것들이 있는지 화면에서 읽는다. */
    public static List<String> catValues(String json) {
        List<String> out = new ArrayList<String>();
        try { collectCat(ScreenCore.parse(json), out, 0); } catch (Exception e) { /* 없음 */ }
        return out;
    }
    @SuppressWarnings("unchecked")
    private static void collectCat(Object o, List<String> out, int depth) {
        if (depth > 14 || out.size() >= 24) return;
        if (o instanceof Map) {
            Map<String, Object> m = (Map<String, Object>) o;
            Object v = m.get("v");
            if ("cat".equals(m.get("a")) && v instanceof String && ((String) v).length() > 0 && ((String) v).length() < 20 && !out.contains(v)) out.add((String) v);
            for (Object x : m.values()) collectCat(x, out, depth + 1);
        } else if (o instanceof List) {
            for (Object x : (List<Object>) o) collectCat(x, out, depth + 1);
        }
    }
    public static String shopUrl(String cat) { return BASE + "/screen/shop?cap=" + CAP + (cat != null && cat.length() > 0 ? "&cat=" + enc(cat) : ""); }
    /** 노선도 화면 열쇠(방식 · 지역 · 필터를 직접 줘서 — 지금 고른 방식이 아닌 쪽도 미리 받아 두려고). */
    public static String mapKey(String screen, String mode, Store st) { return screen + "|" + mode + "|" + st.get(MapCore.K_REG, "seoul") + "|" + st.get(MapCore.K_FLT, "ALL") + busViewSuffix(screen, mode, st); }
    /** 버스 본문은 주변/즐겨찾기가 다른 화면이라 캐시도 따로(머리와 지하철은 해당 없음). */
    private static String busViewSuffix(String screen, String mode, Store st) { return S_MAPB.equals(screen) && "bus".equals(mode) ? "|" + (MapCore.VW_FAV.equals(st.get(MapCore.K_BUSVW, MapCore.VW_NEAR)) ? MapCore.VW_FAV : MapCore.VW_NEAR) : ""; }

    /** 요청 하나(GET 이면 body 가 null). */
    public static final class Req {
        public final String method, url, body;
        Req(String m, String u, String b) { method = m; url = u; body = b; }
    }

    public static final String BOARD_BASE = "https://board-writer.phg0643.workers.dev";
    public static final String NEWS_BASE = "https://gentle-lab-7e47subway-api.phg0643.workers.dev";
    public static final String SHOP_BASE = "https://gildongmu-shop.phg0643.workers.dev";

    /** 이 화면을 계산하려면 먼저 받아야 하는 원자료 주소들(없으면 바로 엔진에 요청). */
    public static String[] feedUrls(String screen) {
        if (S_NEWS.equals(screen)) return new String[] { BOARD_BASE + "/newsfeed", NEWS_BASE + "/news/all?per=100" };
        return new String[0];
    }

    /** 화면 하나를 엔진에서 받는 요청. feeds 는 feedUrls 의 응답 글(못 받은 것은 빈 글). */
    public static Req request(String screen, Store st, String[] feeds) {
        if (S_SETTINGS.equals(screen)) return new Req("GET", settingsUrl(st), null);
        if (S_SHOP.equals(screen)) {
            return new Req("GET", shopUrl(st.get(K_SHOP_CAT, "")), null);
        }
        if (S_CCHIPS.equals(screen)) return new Req("POST", BASE + "/screen/cchips", cchipsBody(mode(st)));
        if (S_NEWS.equals(screen)) {
            NewsRows r = NewsRows.from(feeds);
            return new Req("POST", BASE + "/screen/news", "{\"cap\":" + CAP + ",\"f\":{\"cat\":" + q(st.get(K_NEWS_CAT, "전체")) + "},\"n\":" + r.listJson() + "}");
        }
        return null;
    }
    /** 소식 요청 본문. withAlts 면 엔진이 가진 모든 분류 화면을 한 번에 같이 돌려준다(미리 받기용). */
    public static String newsBody(Store st, NewsRows rows, boolean withAlts) {
        return "{\"cap\":" + CAP + ",\"f\":{\"cat\":" + q(st.get(K_NEWS_CAT, "전체")) + "},\"n\":" + rows.listJson() + (withAlts ? ",\"alts\":\"chips\"" : "") + "}";
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
    /** 설정에 저장된 커뮤니티 아이디(없으면 빈 글). */
    public static String commId(Store st) { return st.get(K_ID, ""); }
    /** 서버 답 {"ok":true,"id":…} 에서 글번호를, {"error":"…"} 에서 사유를 꺼낸다. */
    @SuppressWarnings("unchecked")
    public static String jsonId(String body) {
        try { Object o = ScreenCore.parse(body); if (o instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) o).get("ok"))) return BoardCore.idStr(((Map<String, Object>) o).get("id")); } catch (Exception e) { /* 없음 */ }
        return "";
    }
    @SuppressWarnings("unchecked")
    public static String jsonError(String body) {
        try { Object o = ScreenCore.parse(body); if (o instanceof Map) { Object e = ((Map<String, Object>) o).get("error"); if (e instanceof String) return ((String) e).length() > 120 ? ((String) e).substring(0, 120) : (String) e; } } catch (Exception e) { /* 없음 */ }
        return "";
    }
    public static String enc(String s) { try { return URLEncoder.encode(s, "UTF-8"); } catch (java.io.UnsupportedEncodingException e) { return ""; } }

    // ═════════════ 뉴스 원자료 → 엔진 요청 ═════════════
    /** 엔진 /screen/news 가 받는 기사 줄 [제목, 링크, 언론사, 시각(ms), 서버 분류, 요약]. 분류·거르기·중복 정리는 엔진이 하고, 여기는 모양만 맞춘다. */
    public static final class NewsRows {
        public final List<String[]> rows = new ArrayList<String[]>();
        public static final int MAX = 900;                               // 엔진은 분류마다 100건만 쓴다 — 엔진 요청 본문이 한도(NET_MAX_REQ)를 넘지 않게 기사 줄 수를 묶는다
        private final java.util.HashSet<String> seen = new java.util.HashSet<String>();      // 같은 기사(엔진 key: 공백 뺀 제목)는 한 번만 — 원자료 두 곳이 겹친다

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
            if (!seen.add(title.replaceAll("\\s", ""))) return;
            String desc = decode(str(m.get("desc")));
            if (desc.length() > 240) desc = desc.substring(0, 240);
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
        /**
         * 목록 계산용 가벼운 줄: 링크 · 언론사는 비우고 요약은 120자까지만. 엔진이 목록을 만들 때 쓰는 것은 제목 · 시각 · 서버 분류 · 요약(분류 보조)뿐이고,
         * 구글 뉴스 링크는 한 줄에 수백 자라 700줄이면 요청이 수백 KB — 휴대 통신에서 느리고 한도(NET_MAX_REQ)를 넘기던 원인이었다.
         * 줄 순서는 rows 와 같다(엔진이 돌려주는 ix 가 그대로 rows 의 번호). 눌렀을 때의 상세 요청은 rowJson(전체 줄)을 그대로 보낸다.
         */
        public String listJson() {
            StringBuilder b = new StringBuilder("[");
            for (int i = 0; i < rows.size(); i++) {
                if (i > 0) b.append(',');
                String[] r = rows.get(i);
                String d = r[5].length() > 120 ? r[5].substring(0, 120) : r[5];
                b.append('[').append(q(r[0])).append(",\"\",\"\",").append(r[3]).append(',').append(q(r[4])).append(',').append(q(d)).append(']');
            }
            return b.append(']').toString();
        }
        /** 기사 고유 id(링크 또는 제목)로 줄을 찾아 엔진에 보낼 모양으로. 없으면 눌린 줄이 알려 준 제목 · 링크만 담은 줄(엔진이 요약 없는 상세를 만든다). */
        public String rowJsonById(String id, String title) { return rowJsonById(id, title, -1); }
        /** 같은 id 의 줄이 여럿이면 엔진이 알려 준 원래 위치(ix)에 가장 가까운 줄 — 누른 그 기사. */
        public String rowJsonById(String id, String title, int ix) {
            int i = indexById(id, title, ix);
            if (i >= 0) return rowJson(i);
            boolean url = id.startsWith("http");
            String t = title != null && title.length() > 0 ? title : (url ? "" : id);
            return "[" + q(t) + "," + q(url ? id : "") + ",\"\",0,\"\",\"\"]";
        }
        /** 누른 기사 줄의 번호(없으면 -1). 상세 팝업의 원문 링크를 줄에서 찾는 데도 쓴다 — id 가 제목인 기사는 링크가 id 에 없다. */
        public int indexById(String id, String title, int ix) {
            int best = -1;
            for (int i = 0; i < rows.size(); i++) {
                String[] r = rows.get(i);
                if (!(id.equals(r[1]) || (r[1].length() == 0 && id.equals(r[0])) || (!id.startsWith("http") && squash(id).equals(squash(r[0]))))) continue;
                if (ix < 0) return i;
                if (best < 0 || Math.abs(i - ix) < Math.abs(best - ix)) best = i;
            }
            if (best >= 0) return best;
            if (ix >= 0 && ix < rows.size() && squash(rows.get(ix)[0]).equals(squash(id.startsWith("http") ? (title == null ? "" : title) : id))) return ix;          // 엔진이 받은 줄에 링크가 없어 id 가 제목이다 — 보낸 순서 그대로의 줄
            return -1;
        }
        public String rowJson(int i) {
            if (i < 0 || i >= rows.size()) return "[]";
            String[] r = rows.get(i);
            return "[" + q(r[0]) + "," + q(r[1]) + "," + q(r[2]) + "," + r[3] + "," + q(r[4]) + "," + q(r[5]) + "]";
        }
        static String squash(String t) { return t == null ? "" : t.replaceAll("\\s", ""); }
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
        public String title = "", meta = "", body = "", notice = "", btn = "", close = "닫기", link = "", cat = "", src = "";
        public boolean open, bodyIsEmpty;
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
            r.body = desc.length() > 0 ? desc : empty; r.bodyIsEmpty = desc.length() == 0;
            r.notice = NewsRows.str(m.get("notice")); r.btn = NewsRows.str(m.get("btn")); r.cat = NewsRows.str(m.get("cat")); r.src = NewsRows.str(m.get("src"));
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

    /** 화면을 기다리는 동안 보이는 스켈레톤(뼈대) — 앱이 스스로 그리는 자리표시(내용 없음). 화면마다 모양만 다르다. */
    public static String skeletonScreen(String screen) {
        String kind = S_HOME.equals(screen) || S_SHOP.equals(screen) ? "cards" : S_MAPB.equals(screen) ? "map" : "list";
        int rows = "cards".equals(kind) ? 4 : "map".equals(kind) ? 4 : 8;
        return "{\"ok\":true,\"v\":1,\"screen\":\"skel\",\"head\":[],\"body\":[{\"t\":\"skel\",\"kind\":\"" + kind + "\",\"rows\":" + rows + ",\"pad\":[12,12,12,0]}]}";
    }
    /**
     * 엔진이 "서버가 늦다"며 준 안내 화면(top-level delayed:true · retry:[초…])의 재시도 간격(초). 아니면 null.
     * 앱은 이 화면을 그리고(캐시에는 두지 않는다) 이 간격마다 뒤에서 다시 받는다 — 문구와 간격은 엔진이 정한다.
     */
    @SuppressWarnings("unchecked")
    public static int[] retryHint(String json) {
        if (json == null || json.length() < 10 || json.length() > 20000 || json.indexOf("\"delayed\"") < 0) return null;
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("delayed"))) return null;
            Object r = m.get("retry");
            int n = r instanceof List ? Math.min(6, ((List<Object>) r).size()) : 0;
            if (n == 0) return DEFAULT_RETRY.clone();
            int[] out = new int[n];
            for (int i = 0; i < n; i++) { Object x = ((List<Object>) r).get(i); out[i] = x instanceof Double ? (int) Math.max(1, Math.min(120, ((Double) x).doubleValue())) : 5; }
            return out;
        } catch (Exception e) { return null; }
    }
    /** 엔진 안내 화면조차 못 받을 때(통신 실패)의 재시도 간격(초) — 짧게 몇 번만. */
    public static final int[] DEFAULT_RETRY = { 4, 8, 16, 30 };
    /** 화면을 못 받았을 때(서버 응답 없음) 빈 화면 대신 보이는 안내와 [다시 시도] — 행동 이름은 RETRY_ACT. */
    public static final String RETRY_ACT = "gdm_retry";
    public static String errorScreen() { return errorScreen(""); }
    /** diag: 왜 못 받았는지 짧은 글(HTTP 코드 · 통신 오류 · 너무 긴 본문 …) — 작은 글씨로 덧붙여 화면만 봐도 원인을 알 수 있게 한다. */
    public static String errorScreen(String diag) {
        String dg = diag == null || diag.length() == 0 ? "" : "{\"t\":\"text\",\"s\":" + q(diag.length() > 90 ? diag.substring(0, 90) : diag) + ",\"size\":11,\"color\":\"sub\",\"alpha\":0.7,\"lh\":1.4,\"align\":\"center\",\"pad\":[24,0,24,12]},";
        return "{\"ok\":true,\"v\":1,\"screen\":\"error\",\"head\":[],\"body\":["
            + "{\"t\":\"text\",\"s\":\"서버 연결이 지연되고 있습니다.\\n자동으로 다시 시도하고 있어요.\",\"size\":15,\"color\":\"sub\",\"lh\":1.5,\"align\":\"center\",\"pad\":[24,96,24,12]}," + dg
            + "{\"t\":\"button\",\"s\":\"다시 시도\",\"size\":14,\"h\":44,\"r\":12,\"bold\":true,\"fill\":\"gold\",\"tc\":\"white\",\"act\":{\"a\":\"call\",\"v\":\"" + RETRY_ACT + "\"}}]}";
    }
    /** 캐시 열쇠가 가리키는 칸에 올라와야 하는 엔진 화면 이름(다른 탭의 늦은 답이 이 칸을 덮지 못하게 가린다). */
    public static String expectId(String key) {
        String s = key.indexOf('|') > 0 ? key.substring(0, key.indexOf('|')) : key;
        return S_MAPH.equals(s) || S_MAPB.equals(s) ? "map" : s;
    }
    /**
     * 이 화면 글(열쇠)을 디스크에 얼마나 오래 둘지(ms, 0 이면 두지 않는다). 앱을 다시 켜면 마지막 화면이 바로 뜨고, 새 글은 뒤에서 받아 바꾼다.
     * 버스 도착정보는 오래되면 틀린 정보라 짧게(5분) 둔다.
     */
    /** 버스 도착정보는 실시간이라 이보다 오래된 화면은 보여 주지 않는다(새로 받을 때까지 뼈대) — 이 안이면 받은 뒤 흐른 초만큼 줄어든 채로 바로 뜬다. */
    public static final long BUS_FRESH_MS = 8000L;
    public static long diskTtl(String key) {
        if (key == null) return 0L;
        String s = key.indexOf('|') > 0 ? key.substring(0, key.indexOf('|')) : key;
        if (S_MAPB.equals(s)) return key.contains("|bus|") ? BUS_FRESH_MS : 24L * 3600000L;
        if (S_SHOP.equals(s) || S_CCHIPS.equals(s) || S_HDR.equals(s) || "tabs".equals(s) || S_NEWS.equals(s) || S_CHAT.equals(s) || S_BOARD.equals(s)
            || S_FOOD.equals(s) || S_MAPH.equals(s) || S_SETTINGS.equals(s)) return 24L * 3600000L;
        if (S_HOME.equals(s)) return 6L * 3600000L;
        return 0L;
    }
    /** 켤 때 디스크에서 미리 읽어 둘 화면 열쇠(SWR): 지금 탭의 것을 먼저, 그다음 나머지 모든 탭 — 어느 탭을 눌러도 파일 읽기를 기다리지 않는다. 중복 없음 · 디스크에 두지 않는 화면은 뺀다. */
    public static java.util.List<String> warmKeys(Store st, String cur) {
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<String>();
        String c = isTab(cur) ? cur : DEFAULT_TAB;
        java.util.List<String> order = new java.util.ArrayList<String>();
        order.add(c);
        for (String t : TABS) if (!t.equals(c)) order.add(t);
        out.add(S_HDR);
        for (int i = 0; i < order.size(); i++) {
            String t = order.get(i);
            out.add("tabs|" + t);
            for (String sl : slotsOf(st, t)) out.add(cacheKey(sl, st));
        }
        java.util.List<String> r = new java.util.ArrayList<String>();
        for (String k : out) if (diskTtl(k) > 0L) r.add(k);
        return r;
    }
    public static boolean diskCacheable(String screen) { return diskTtl(screen) > 0L; }
    /**
     * 설정 화면 캐시 열쇠: 스위치 · 토글 모양이 기기에 저장된 값(settingsFacts)에서 나오므로, 열쇠에 그 값의 지문을 넣는다.
     * 저장된 값이 바뀌면 열쇠가 달라져 옛 화면이 절대 뜨지 않고(로컬 최신 값 우선), 같은 값일 때만 캐시 화면을 즉시 보여 준다.
     */
    public static String settingsKey(Store st) { return S_SETTINGS + "|" + Integer.toHexString(settingsFacts(st).hashCode()); }
    /** 화면 하나를 가리키는 캐시 열쇠(같은 화면이라도 고른 분류·방식이 다르면 다른 글이다). */
    public static String cacheKey(String screen, Store st) {
        if (S_SHOP.equals(screen)) return screen + "|" + st.get(K_SHOP_CAT, "");
        if (S_NEWS.equals(screen)) return screen + "|" + st.get(K_NEWS_CAT, "전체");
        if (S_SETTINGS.equals(screen)) return settingsKey(st);
        if (S_CCHIPS.equals(screen)) return screen + "|" + mode(st);
        if (S_CHAT.equals(screen)) return screen + "|" + st.get(ChatCore.K_SEL, "all");                       // 방마다 따로
        if (S_MAPH.equals(screen) || S_MAPB.equals(screen)) return mapKey(screen, st.get(MapCore.K_MODE, "bus"), st);
        return screen;
    }

    // ═════════════ 색 ═════════════
    /** ScreenView 의 역할 번호 순서(bg·card·border·text·sub·gold·orange·imgbg·white·border2·card2·nav)와 같다. */
    public static int[] palette(String theme) {
        if ("dark".equals(theme)) return new int[] { 0xFF121214, 0xFF1C1C1E, 0xFF2C2C2E, 0xFFF2F2F7, 0xFF8E8E93, 0xFFD4AF37, 0xFFFF9F0A, 0xFF252528, 0xFFFFFFFF, 0xFF3A3A3C, 0xFF2C2C2E, 0xFF1C1C1E, 0xFFB8922F, 0xFF121214 };
        return new int[] { 0xFFF0F4F8, 0xFFFFFFFF, 0xFFDCE8F0, 0xFF1A2533, 0xFF6B8299, 0xFF1D9BF0, 0xFFF07830, 0xFFE8F4FF, 0xFFFFFFFF, 0xFFC8DCEA, 0xFFE8F0F8, 0xFFFFFFFF, 0xFF0E7DD6, 0xFFFFFFFF };
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
