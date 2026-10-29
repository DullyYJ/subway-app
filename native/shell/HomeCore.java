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
        public String qname = "";                    // 경로 서버에 보내는 이름(비어 있으면 name). 내 위치는 입력칸엔 동 이름을 보여도 서버엔 "내 위치"로 보낸다(엔진이 출발=내 위치를 알아본다)
        public double lat, lng;
        public boolean ok() { return lat != 0 && lng != 0 && name.length() > 0; }
    }

    /** 요청 시점의 시계(순수 계산에서 시계를 부르지 않으려고 밖에서 받는다). m 은 JS getMonth 처럼 0부터. */
    public static final class Env {
        public long nowMs; public int tzoMin, y, m, d;
    }

    // ── 상태 ──
    public final String[] text = { "", "" };
    public final Loc[] loc = { null, null };
    public int active = -1, last = START;
    public long baseMs = -1;                         // -1 = 기준시각을 안 골랐다(지금)
    public boolean gps;
    public volatile boolean routing;                 // 경로를 찾는 중(엔진이 단추 스피너를 정한다)

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
    public int dataRev = 0;                                      // 경로 자료(받은 경로 · 공지 · 탑승 추적)가 바뀔 때만 오른다 — 칩(최단시간 · 최소환승 · 지하철 · 버스)만 바꿀 때는 그대로(탭별 결과를 미리 받아 두는 열쇠)
    public void touch() { resRev++; dataRev++; }
    /** 탭만 바꿔 본 결과 요청(미리 받기용). 상태는 건드리지 않는다. */
    public String resultRequestTab(Env env, int cap, String theme, String tab) { String keep = resTab; resTab = tab; try { return resultRequest(env, cap, theme, 0); } finally { resTab = keep; } }
    public boolean hasRoute() { return routeRaw.length() > 2; }
    private static final java.util.regex.Pattern LD_PATH = java.util.regex.Pattern.compile("\"longDist\"\\s*:\\s*true");
    /** 받은 경로 응답에 장거리(열차·고속버스·시외버스) 경로가 들어 있나. 있으면 처음 찾은 결과를 고정한다(실시간으로 다시 받아 타는 방법이 바뀌지 않게). */
    public boolean hasLdRoute() { return routeRaw.length() > 2 && LD_PATH.matcher(routeRaw).find(); }
    // 결과 카드의 보조 사실: 지난 탐색 질의(장거리 다시 고르기에 쓴다) · 다시 받은 장거리 응답 · 공지/제보 원자료(서버가 준 글 그대로)
    public String lastQs = "", ld2Raw = "", offRaw = "", alRaw = "", noteKey = "";
    public long noteAt = 0;
    public List<String> ldM = new ArrayList<String>(), ldG = new ArrayList<String>();      // 엔진이 만든 '다시 물을 질의' (info.ld)
    public String ldPending = "", roomLine = "";
    // 세부경로 시트: 펼친 구간 번호 · 엔진이 만든 길안내 주소 [앱 주소, 웹 주소] (info.nav)
    public final java.util.TreeSet<Integer> detOpen = new java.util.TreeSet<Integer>();
    public String[] navKakao = null, navNaver = null;
    // 탑승 추적: 지금 보는 경로가 몇 번째 탐색인지(새 탐색이면 오른다) · 탑승을 시작한 탐색 · 서비스가 알려 준 상태(엔진 r.ride / r.lv 에 그대로 실린다)
    public int routeId = 0, rideRouteId = -1;
    public String rideJson = "", lvJson = "";
    /** 엔진 결과 화면의 info.sec(지금 보이는 경로의 지하철 구간 이름). */
    public List<String> resSec = new ArrayList<String>();
    @SuppressWarnings("unchecked")
    public void onResult(String json) {
        resSec = new ArrayList<String>(); ldM = new ArrayList<String>(); ldG = new ArrayList<String>();
        try {
            Object o = ScreenCore.parse(json);
            Object info = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            Object sec = info instanceof Map ? ((Map<String, Object>) info).get("sec") : null;
            if (sec instanceof List) for (Object x : (List<Object>) sec) if (x instanceof String) resSec.add((String) x);
            Object ld = info instanceof Map ? ((Map<String, Object>) info).get("ld") : null;
            if (ld instanceof Map) for (String k : new String[] { "m", "g" }) {
                Object q = ((Map<String, Object>) ld).get(k);
                if (q instanceof List) for (Object x : (List<Object>) q) (k.equals("m") ? ldM : ldG).add(x instanceof String ? (String) x : "");
            }
        } catch (Exception e) { resSec = new ArrayList<String>(); }
    }
    /** 받은 경로 응답을 결과로 둔다. 모양이 JSON 객체가 아니면 버린다. */
    public boolean setRoute(String raw, String a, String b, long bt, long rb) {
        String t = raw == null ? "" : raw.trim();
        if (t.length() < 2 || t.charAt(0) != '{' || t.charAt(t.length() - 1) != '}') return false;
        routeRaw = t; resA = a == null ? "" : a; resB = b == null ? "" : b; resBt = bt; resRb = rb; resTab = "fast"; touch(); ld2Raw = ""; detOpen.clear(); routeId++;
        return true;
    }
    public void clearRoute() { routeRaw = ""; ld2Raw = ""; lastQs = ""; touch(); }
    /** 여정 종료(s309, YJ: [안내 종료] 는 도착지를 넣기 전 첫 홈 화면으로): 경로 · 고른 탭 · 기준시각 · 도착지를 비운다. 출발지(내 위치)는 그대로. */
    public void endJourney() {
        clearRoute(); resTab = "fast"; baseMs = -1; ldPending = ""; ldM = new ArrayList<String>(); ldG = new ArrayList<String>(); resSec = new ArrayList<String>(); detOpen.clear();
        loc[DEST] = null; text[DEST] = ""; cand[DEST].clear(); pkU.clear(); if (active == DEST) active = -1;
    }
    /** 같은 경로를 다시 받은 응답으로 바꾼다(보던 탭은 그대로). */
    public boolean replaceRoute(String raw) {
        String t = raw == null ? "" : raw.trim();
        if (t.length() < 2 || t.charAt(0) != '{' || t.charAt(t.length() - 1) != '}') return false;
        routeRaw = t; ld2Raw = ""; touch();
        return true;
    }
    /** 같은 찾기의 새 응답(근사 → 전체 · 옛 결과 → 새 결과)으로 바꾼다 — 보던 탭 · 펼친 세부 · 경로 번호는 그대로, 탐색 시각만 새로. */
    public boolean replaceRouteSame(String raw, long rb) {
        if (!replaceRoute(raw)) return false;
        resRb = rb;
        return true;
    }
    /** 공지·제보 원자료를 넣는다(60초 안에 같은 노선이면 다시 받지 않는다). */
    public void setNotes(String key, String off, String al, long now) { noteKey = key; offRaw = off == null ? "" : off; alRaw = al == null ? "" : al; noteAt = now; touch(); }
    public String secKey() { StringBuilder b = new StringBuilder(); for (String x : resSec) b.append(x).append(','); return b.toString(); }
    public boolean needNotes(long now) { return hasRoute() && !resSec.isEmpty() && (!secKey().equals(noteKey) || now - noteAt > 60000); }
    /** 결과 화면 사실 { data, tab, a, b, bt, rb, now, tz, th, fav, … } (경로가 없으면 null 글). 결과 화면과 홈 카드 묶음이 같은 것을 쓴다. */
    public String resultFacts(Env env, String theme) {
        if (!hasRoute()) return "null";
        return "{\"data\":" + routeRaw + ",\"tab\":" + ShellCore.q(resTab)
            + ",\"a\":" + ShellCore.q(resA) + ",\"b\":" + ShellCore.q(resB)
            + ",\"bt\":" + (resBt >= 0 ? String.valueOf(resBt) : "null") + ",\"rb\":" + resRb
            + (ld2Raw.length() > 2 ? ",\"ld2\":" + ld2Raw : "") + (offRaw.length() > 2 ? ",\"off\":" + offRaw : "") + (alRaw.length() > 2 ? ",\"al\":" + alRaw : "")
            + (rideJson.length() > 2 && rideRouteId == routeId ? ",\"ride\":" + rideJson + (lvJson.length() > 2 ? ",\"lv\":" + lvJson : "") : "")
            + (loc[DEST] != null && loc[DEST].ok() ? ",\"dl\":{\"la\":" + loc[DEST].lat + ",\"lo\":" + loc[DEST].lng + ",\"n\":" + ShellCore.q(loc[DEST].name) + "}" : "")
            + (loc[START] != null && loc[START].ok() ? ",\"me\":[" + loc[START].lat + "," + loc[START].lng + "]" : "")
            + ",\"now\":" + env.nowMs + ",\"tz\":" + (-env.tzoMin) + ",\"th\":" + ShellCore.q("dark".equals(theme) ? "dark" : "pastel") + ",\"fav\":1}";
    }
    /**
     * 탑승을 시작할 때 저장해 두는 결과 카드 재료(받은 경로 응답 그대로 + 고른 탭 · 출발/도착 이름 · 기준시각 · 도착 좌표). 앱이 죽었다 다시 열려도 같은 카드를 되살리려는 것이다.
     * 응답은 해석하지 않고 그대로 담는다. 경로가 없으면 "".
     */
    public String rideSnapshot() {
        if (!hasRoute()) return "";
        StringBuilder b = new StringBuilder("{\"raw\":").append(ShellCore.q(routeRaw)).append(",\"tab\":").append(ShellCore.q(resTab)).append(",\"a\":").append(ShellCore.q(resA)).append(",\"b\":").append(ShellCore.q(resB));
        b.append(",\"bt\":").append(resBt).append(",\"rb\":").append(resRb);
        if (loc[DEST] != null && loc[DEST].ok()) b.append(",\"dl\":{\"la\":").append(loc[DEST].lat).append(",\"lo\":").append(loc[DEST].lng).append(",\"n\":").append(ShellCore.q(loc[DEST].name)).append('}');
        if (loc[START] != null && loc[START].ok()) b.append(",\"me\":[").append(loc[START].lat).append(',').append(loc[START].lng).append(']');
        return b.append('}').toString();
    }
    /** rideSnapshot 로 저장한 글을 결과로 되돌린다. 모양이 이상하면 false(아무것도 바꾸지 않는다). */
    @SuppressWarnings("unchecked")
    public boolean restoreRide(String snap) {
        try {
            Object o = ScreenCore.parseSaved(snap == null ? "" : snap);
            if (!(o instanceof Map)) return false;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!(m.get("raw") instanceof String) || !(m.get("tab") instanceof String)) return false;
            String tab = (String) m.get("tab");
            boolean tabOk = false;
            for (String t : RTABS) if (t.equals(tab)) tabOk = true;
            if (!tabOk) return false;
            long bt = m.get("bt") instanceof Number ? ((Number) m.get("bt")).longValue() : -1L, rb = m.get("rb") instanceof Number ? ((Number) m.get("rb")).longValue() : 0L;
            String a = m.get("a") instanceof String ? (String) m.get("a") : "", b = m.get("b") instanceof String ? (String) m.get("b") : "";
            if (!setRoute((String) m.get("raw"), a, b, bt, rb)) return false;
            resTab = tab;
            if (m.get("dl") instanceof Map) {
                Map<String, Object> d = (Map<String, Object>) m.get("dl");
                if (d.get("la") instanceof Number && d.get("lo") instanceof Number && d.get("n") instanceof String) {
                    Loc l = new Loc(); l.lat = ((Number) d.get("la")).doubleValue(); l.lng = ((Number) d.get("lo")).doubleValue(); l.name = (String) d.get("n"); l.type = "restored";
                    loc[DEST] = l; text[DEST] = l.name;
                }
            }
            if (m.get("me") instanceof List && ((List<Object>) m.get("me")).size() == 2) {
                List<Object> me = (List<Object>) m.get("me");
                if (me.get(0) instanceof Number && me.get(1) instanceof Number) {
                    Loc l = new Loc(); l.lat = ((Number) me.get(0)).doubleValue(); l.lng = ((Number) me.get(1)).doubleValue(); l.name = a.length() > 0 ? a : "출발"; l.type = "restored";
                    loc[START] = l; text[START] = l.name;
                }
            }
            return true;
        } catch (ScreenCore.ParseError e) { return false; }
    }
    /** 탑승 서비스가 알려 준 상태를 받는다(바뀐 게 있으면 true — 결과 화면을 다시 그린다). */
    public boolean setRide(String ride, String lv) {
        String r = ride == null ? "" : ride, l = lv == null ? "" : lv;
        if (r.equals(rideJson) && l.equals(lvJson)) return false;
        rideJson = r; lvJson = l; touch();
        return true;
    }
    /** 지금 보는 경로로 탑승 안내 중인가. */
    public boolean riding() { return rideJson.length() > 2 && rideRouteId == routeId; }
    /** 엔진 POST /screen/result 본문 — 세부경로 시트(view:detail, 펼친 구간 번호). */
    public String detailRequest(Env env, int cap, String theme) {
        String f = resultFacts(env, theme);
        if ("null".equals(f)) return "";
        StringBuilder o = new StringBuilder();
        for (Integer i : detOpen) { if (o.length() > 0) o.append(','); o.append(i); }
        return "{\"cap\":" + cap + ",\"r\":" + f.substring(0, f.length() - 1) + ",\"view\":\"detail\",\"open\":[" + o + "]}}";
    }
    /** 세부경로 화면을 받았을 때: 길안내 주소를 꺼내 둔다. */
    @SuppressWarnings("unchecked")
    public void onDetail(String json) {
        navKakao = null; navNaver = null;
        try {
            Object o = ScreenCore.parse(json);
            Object info = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            Object nav = info instanceof Map ? ((Map<String, Object>) info).get("nav") : null;
            if (nav instanceof Map) { navKakao = navPair(((Map<String, Object>) nav).get("kakao")); navNaver = navPair(((Map<String, Object>) nav).get("naver")); }
        } catch (Exception e) { navKakao = null; navNaver = null; }
    }
    private static String[] navPair(Object o) {
        if (!(o instanceof List) || ((List<Object>) o).size() != 2) return null;
        Object a = ((List<Object>) o).get(0), b = ((List<Object>) o).get(1);
        return (a instanceof String && b instanceof String) ? new String[] { (String) a, (String) b } : null;
    }
    /** 앱 주소가 허용된 모양인지(카카오맵·네이버지도 길찾기 · 도보 길안내만). */
    public static boolean navAppOk(String u) {
        return u != null && u.length() < 1024 && u.indexOf(' ') < 0 && (u.startsWith("kakaomap://route?") || u.startsWith("nmap://route/public?") || u.startsWith("nmap://route/walk?"));
    }
    /** 웹 confirmSelectedRoute 의 옵션 이름(확정 토스트에 쓴다). */
    public static String optName(String tab) {
        if ("fast".equals(tab)) return "최단시간";
        if ("less".equals(tab)) return "최소환승";
        if ("sub".equals(tab)) return "지하철";
        if ("bus".equals(tab)) return "버스";
        if ("longdist".equals(tab)) return "장거리";
        return "선택한";
    }
    /** 세부경로 시트의 눌림(rd.*). */
    public int actDetail(String v) {
        if (v == null || !v.startsWith("rd.")) return D_NONE;
        if ("rd.close".equals(v)) return D_CLOSE;
        if ("rd.confirm".equals(v)) return hasRoute() && !riding() ? D_CONFIRM : D_NONE;
        if ("rd.stop".equals(v)) return riding() ? D_STOP : D_NONE;
        if ("rd.kakao".equals(v)) return navKakao != null ? D_KAKAO : D_NONE;
        if ("rd.naver".equals(v)) return navNaver != null ? D_NAVER : D_NONE;
        if (v.startsWith("rd.tg.")) {
            try { int i = Integer.parseInt(v.substring(6)); if (i >= 0 && i < 40) { if (!detOpen.remove(i)) detOpen.add(i); return D_RENDER; } } catch (NumberFormatException e) { /* 무시 */ }
        }
        return D_NONE;
    }
    /** 엔진 POST /screen/result 본문. */
    public String resultRequest(Env env, int cap, String theme, int tzMin) {
        return "{\"cap\":" + cap + ",\"r\":" + resultFacts(env, theme) + "}";
    }
    /** 결과 화면의 눌림(rh.*). */
    public int actResult(String v) {
        if (v == null || !v.startsWith("rh.")) return R_NONE;
        if ("rh.close".equals(v)) { if (riding()) return R_LOCK; clearRoute(); return R_RENDER; }       // 확정한 경로는 닫아서 풀 수 없다 — [안내 종료]나 도착으로만
        if ("rh.fav".equals(v)) return R_FAV;
        if ("rh.stop".equals(v)) return riding() ? R_STOP : R_NONE;
        if ("rh.slot".equals(v)) return riding() ? R_SLOT : R_NONE;
        if ("rh.confirm".equals(v)) return hasRoute() && !riding() ? R_CONFIRM : R_NONE;     // 결과 카드 버튼 줄의 [경로 확정](웹 mainConfirmRouteBtn) — 세부경로 시트의 [이 경로로 탑승 시작]과 같다
        if ("rh.detail".equals(v)) { if (!hasRoute()) return R_NONE; detOpen.clear(); return R_DETAIL; }
        if (v.startsWith("rh.ld.")) {                                          // rh.ld.m.<번호> · rh.ld.g.<번호> — 엔진이 만든 질의를 그대로 쓴다
            try {
                boolean m = v.startsWith("rh.ld.m."); int i = Integer.parseInt(v.substring(8));
                List<String> q = m ? ldM : ldG;
                if (i >= 0 && i < q.size() && q.get(i).matches("(&ld(Mode|Grade|DepTs)=[A-Za-z0-9%._~-]*){1,3}") && lastQs.length() > 0) { ldPending = q.get(i); return R_LD; }
            } catch (NumberFormatException e) { /* 무시 */ }
            return R_NONE;
        }
        if (v.startsWith("rh.room.")) {
            try { int i = Integer.parseInt(v.substring(8)); if (i >= 0 && i < resSec.size()) { roomLine = resSec.get(i); return R_ROOM; } } catch (NumberFormatException e) { /* 무시 */ }
            return R_NONE;
        }
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
        b.append(",\"startSet\":").append(loc[START] != null).append(",\"destSet\":").append(loc[DEST] != null).append(",\"gps\":").append(gps).append(",\"rs\":").append(routing);
        b.append(",\"base\":{\"ms\":").append(baseMs >= 0 ? String.valueOf(baseMs) : "null");
        b.append(",\"tzo\":").append(env.tzoMin).append(",\"today\":[").append(env.y).append(',').append(env.m).append(',').append(env.d).append(']');
        b.append(",\"now\":").append(env.nowMs).append("}}");        // 평일/주말·공휴일은 엔진이 기준시각 날짜로 정한다(앱은 지금 시각만)
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
    public static final int R_NONE = 0, R_RENDER = 1, R_GPS = 2, R_GO = 3, R_PICK_TIME = 4, R_FIELDS = 5, R_NEED_BOTH = 6, R_RESULT = 7, R_FAV = 8, R_LD = 9, R_ROOM = 10, R_DETAIL = 11, R_STOP = 12, R_SLOT = 13, R_CONFIRM = 14, R_LOCK = 15;
    public static final int D_NONE = 0, D_CLOSE = 1, D_RENDER = 2, D_KAKAO = 3, D_NAVER = 4, D_CONFIRM = 5, D_STOP = 6;

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
        if ("rt.swap".equals(v)) { if (riding()) return R_LOCK; swap(); return R_FIELDS; }
        if ("rt.go".equals(v) || "rt.enter".equals(v)) {
            if (riding()) { active = -1; return "rt.go".equals(v) ? R_LOCK : R_RENDER; }                    // 확정한 경로가 있는 동안엔 새로 찾지 않는다
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
    /** 노선도에서 고른 역을 출발/도착으로 둔다(웹 svgSetRoute). 출발역을 새로 고르면 도착역은 비운다. */
    public void setStation(int f, String name, String line, double lat, double lng) {
        Loc l = new Loc();
        l.type = "subway"; l.name = name; l.line = line; l.lat = lat; l.lng = lng;
        loc[f] = l; text[f] = name; cand[f].clear(); pkU.clear();
        if (f == START) { loc[DEST] = null; text[DEST] = ""; cand[DEST].clear(); }
        if (active == f) active = -1;
        last = f;
    }

    /** 노선 상세에서 정류장을 출발/도착으로 둔다(웹 _brStopLoc + _fmapSetLocation). 출발을 새로 고르면 도착은 비운다. */
    public void setBusStop(int f, String name, String nodeId, String cityCode, double lat, double lng) {
        Loc l = new Loc();
        l.type = "bus"; l.name = name; l.nodeId = nodeId == null ? "" : nodeId; l.cityCode = cityCode == null ? "" : cityCode; l.lat = lat; l.lng = lng;
        loc[f] = l; text[f] = name; cand[f].clear(); pkU.clear();
        if (f == START) { loc[DEST] = null; text[DEST] = ""; cand[DEST].clear(); }
        if (active == f) active = -1;
        last = f;
    }
    // 출발지를 정하기 전의 값(웹 _pickSnap): 정류장을 출발지로 정한 뒤 끝내 도착지를 못 정하고 나가면 이 값으로 되돌린다
    private Loc[] snapLoc; private String[] snapText; private boolean snapped;
    public void pickSnap() { snapLoc = new Loc[] { loc[START], loc[DEST] }; snapText = new String[] { text[START], text[DEST] }; snapped = true; }
    public boolean pickRestore(String startName) {
        if (!snapped) return false;
        snapped = false;
        if (loc[START] == null || !startName.equals(loc[START].name) || !"bus".equals(loc[START].type)) return false;      // 그 사이 다른 곳에서 출발지를 바꿨다면 건드리지 않는다
        loc[START] = snapLoc[0]; loc[DEST] = snapLoc[1]; text[START] = snapText[0]; text[DEST] = snapText[1];
        cand[START].clear(); cand[DEST].clear(); pkU.clear();
        return true;
    }
    public void pickDone() { snapped = false; }
    /** 출발·도착이 모두 정해졌는가. */
    public boolean bothSet() { return loc[START] != null && loc[START].ok() && loc[DEST] != null && loc[DEST].ok(); }

    public static final String GPS_NAME = "내 위치";
    public void setGpsStart(double lat, double lng) { setGpsStart(lat, lng, ""); }
    /** 내 위치를 출발지로: 입력칸에는 AI 승무원 카드와 같은 동 이름(모르면 "내 위치")을 보여 준다. */
    public void setGpsStart(double lat, double lng, String dong) {
        Loc l = new Loc();
        l.type = "gps"; l.name = GPS_NAME; l.qname = GPS_NAME; l.lat = lat; l.lng = lng;
        text[START] = gpsLabel(dong); loc[START] = l;
        cand[START].clear(); pkU.clear();
        if (active == START) active = -1;
        gps = false;
    }

    /** 엔진에 보내는 칸 이름: 내 위치는 입력칸에 동 이름이 보여도 "내 위치"(엔진이 출발=내 위치를 알아본다). */
    public String sendName(int f) { Loc l = loc[f]; return l != null && l.qname.length() > 0 ? l.qname : text[f]; }
    public static String gpsLabel(String dong) { return dong == null || dong.trim().length() == 0 ? GPS_NAME : dong.trim(); }
    /** 출발지가 내 위치로 잡혀 있고 사용자가 글을 고치는 중이 아니면, 늦게 알아낸(또는 바뀐) 동 이름으로 입력칸 글자를 바꾼다. 바뀌면 true. */
    public boolean relabelGps(String dong) {
        Loc l = loc[START];
        if (l == null || !"gps".equals(l.type) || active == START) return false;
        String t = gpsLabel(dong);
        if (t.equals(text[START])) return false;
        text[START] = t; cand[START].clear(); pkU.clear();
        return true;
    }

    // ═════════════ 경로 요청 ═════════════
    /** 경로 서버 질의(웹 fmapDoRoute 의 _coordQs 와 같다). 좌표가 빠진 장소가 있으면 null. */
    public static String routeQuery(Loc s, Loc d, long baseMs, boolean pickedBase) {
        if (s == null || d == null || s.lat == 0 || s.lng == 0 || d.lat == 0 || d.lng == 0) return null;
        return "SX=" + num(s.lng) + "&SY=" + num(s.lat) + "&EX=" + num(d.lng) + "&EY=" + num(d.lat)
            + "&baseMs=" + baseMs + (pickedBase ? "&bf=1" : "")
            + "&SN=" + HomeSearchCore.enc(cut(s.qname.length() > 0 ? s.qname : s.name, 60)) + "&EN=" + HomeSearchCore.enc(cut(d.qname.length() > 0 ? d.qname : d.name, 60));
    }
    public static String routeUrl(String qs) { return ShellCore.BASE + "/route-v2-app?" + qs; }
    /** 같은 출발·도착(고른 시각이면 같은 시각)을 다시 찾을 때 지난 결과를 먼저 보이기 위한 열쇠 — "지금 시각"(baseMs)은 빼고 만든다(안 빼면 매번 달라 못 쓴다). */
    public static String routeSwrKey(String qs, boolean pickedBase, long base) {
        if (qs == null) return null;
        return qs.replaceFirst("&baseMs=\\d+", "") + (pickedBase ? "&pb=" + base : "");
    }

    static String num(double v) { return (v == Math.rint(v) && Math.abs(v) < 1e15) ? String.valueOf((long) v) : String.valueOf(v); }
    static String cut(String s, int n) { return s.length() > n ? s.substring(0, n) : s; }
    static String str(Object o) { return o instanceof String ? (String) o : (o instanceof Double && ((Double) o) == Math.rint((Double) o) ? String.valueOf(((Double) o).longValue()) : ""); }

    // ═════════════ 기준시각 문구용 값 ═════════════
    public static Map<String, Object> emptyMap() { return new LinkedHashMap<String, Object>(); }
}
