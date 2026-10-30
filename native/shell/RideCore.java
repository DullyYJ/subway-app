package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 탑승 추적(대기 모드) 순수 로직 — 안드로이드 몰라도 시험된다. (2026-10-20 s94)
 *
 * ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
 *   - 경로 확정: 앱이 결과 화면 사실을 POST /ride/start 에 보내면 엔진이 대기 모드 state 를 만들어 준다. 앱은 state 를 해석하지 않고 그대로 들고 있다.
 *   - 5초마다: 모은 위치(fixes)와 state 를 POST /ride-standby 에 보내면 엔진이 영점·도착 시각·하차/환승 알림 판정을 하고 갱신된 state 를 돌려준다.
 *     앱은 돌려받은 ongoing.text(상주 알림 글) · alert(울릴 알림) · done(끝내기) · nextMs(다음 호출 간격)를 그리기만 한다.
 *   여기는 요청 본문 짓기 · 응답 읽기 · 위치 모으기 · 저장/복원만 한다(네트워크·알림·위치 수신은 RideService).
 */
public final class RideCore {
    public static final long MAX_AGE_MS = 30 * 60 * 1000L;       // 이보다 오래 갱신 안 된 저장 상태는 쓰지 않는다
    public static final int MAX_FIX = 60, SEND_FIX = 12;
    public static final long STEP_MIN_MS = 2000L, STEP_MAX_MS = 8000L, STEP_DEFAULT_MS = 5000L;     // 엔진이 알려 주는 간격의 안전 범위

    private String stateJson = "";
    public String text = "", title = "길동무 경로 안내 중";
    public long nextMs = STEP_DEFAULT_MS, savedAt = 0L;
    public boolean done;
    /** 엔진이 알린 '경로 이탈 중' — 벗어나기 시작한 시각(ms), 아니면 0. 앱이 '지금 위치에서 다시 찾을까요?'를 한 번 묻는 데 쓴다(이탈 판정과 오차 범위는 엔진이 정한다). */
    public long offAt;
    public String dtJson = "";              // s320: 역까지 이동 중 엔진이 알린 { n(역), d(남은 m), s(예상 초), a(닿음) } — 결과 카드 타임라인이 '내 위치 → 역'으로 접힌다
    public boolean dtOn;                      // s229: 역까지 이동 중(엔진 dt) — 결과 카드에 남은 거리 · 시간 글을 보인다
    public String offStn = "";                // s229: 이탈 때 경로 첫 지하철역 이름(엔진 off.stn) — 있으면 [역까지 이동]을 고를 수 있다
    public int cur = -1, rev = 0;
    public String posJson = "null", arrJson = "null";
    private int waitI = -1;                                   // 승차 대기 중인 노드 번호(없으면 -1) — 엔진 state.wait
    private double waitLat, waitLng, lastLat = Double.NaN, lastLng = Double.NaN;      // 대기 중 탑승 지점 · 마지막으로 받은 내 위치(거리 배지용)
    private final List<double[]> fixes = new ArrayList<double[]>();
    private long lastSentTs = 0L, lastFixTs = 0L;

    /** 한 번의 /ride-standby 결과. */
    public static final class Step {
        public boolean ok, done, alert;
        public String key = "", type = "", title = "", body = "";
        public long[] vib = new long[0];
        /** 하차 7분 전 추천을 지금 보내야 하면 /reco-text 본문(JSON), 아니면 "". */
        public String recoBody = "";
        /** 승차 대기 중 '실시간 다음 차를 물어라'(엔진 ask) — POST /board-live 본문(JSON), 아니면 "". */
        public String askBody = "";
    }

    /** 엔진이 정한 떠 있는 안내 값(overlay) — 서비스가 창에 그리기만 한다. active 가 아니면 창을 치운다. */
    public boolean ovActive;
    public String ovLine1 = "", ovLine2 = "", ovBanner = "";
    public int ovAlert;
    /** 내 위치 공유 재료(엔진 overlay.share) — 없으면 null. */
    public ShareCore.Share ovShare;
    /** 엔진 overlay 전체(칸 줄 · 색 · 경고 · 도착 줄) — 서비스가 창에 그린다. 없으면 null. */
    public OvCore.Ov ov;
    /** 도착 3분 뒤 종료(done)라면 true — 앱 화면까지 끝낸다. */
    public boolean quit;

    /** 하차 추천 줄(/reco-text 의 ad) — 오버레이 [보기]가 열 곳. url 이 있으면 그 주소(쿠팡 상품), 없으면 가게 이름으로 찾는다. */
    public static final class RecoAd { public String a = "", b = "", m = "", go = "맛집 보기", url = "", q = "", pn = ""; public boolean n; }      // n = 가게·상품 없이 글만 있는 추천(s295)
    /** s295 (YJ: 알림만 오고 오버레이·앱에 안 떴다): 서버가 가게·상품(ad)을 못 골라 글만 보낸 추천도 오버레이 줄·팝업으로 보이게 글(제목·본문)에서 한 줄을 만든다. [보기] 없이 [확인]만. */
    public static RecoAd textAd(String title, String text) {
        String t = title == null ? "" : title.replace('\n', ' ').trim();
        if (t.length() == 0) return null;
        RecoAd r = new RecoAd();
        r.a = BoardCore.s(t, 40);
        r.b = BoardCore.s((text == null ? "" : text).replaceAll("\\s+", " ").trim(), 64);
        r.go = ""; r.n = true;
        return r;
    }
    /** s350 (YJ: 추천을 눌렀더니 카카오맵 검색창에 안내 문구가 들어갔다): 지도에서 찾을 말은 엔진이 정한 q(가게 이름 · "<메뉴> 맛집" · "카페") 뿐이다 — 없으면 가게 이름(pn), 그것도 없으면 이름줄의 ' · ' 앞까지.
     *  글만 있는 추천(n)이거나 찾을 말이 없으면 빈 글 — 안내 문구로 검색하지 않는다(RecoGo 가 앱을 연다). 순수 계산 — 시험이 쓴다. */
    public static String recoQuery(RecoAd ad) {
        if (ad == null || ad.n) return "";
        String q = ad.q != null ? ad.q.trim() : "";
        if (q.length() == 0) q = ad.pn != null ? ad.pn.trim() : "";
        if (q.length() == 0 && ad.a != null) { int i = ad.a.indexOf(" · "); q = (i > 0 ? ad.a.substring(0, i) : ad.a).trim(); }
        return q;
    }
    private volatile RecoAd pendingAd;                 // 엔진에 아직 못 알린 추천 줄
    private volatile RecoAd lastAd;                    // 마지막으로 받은 추천 줄([보기]가 쓴다)
    private volatile String pendingAct = "";           // 오버레이 탑승 줄 손짓(press · undo · open · close · pill) — 한 번만 보낸다
    private volatile long rcDis;                       // [확인]/[보기]로 닫은 추천의 at
    public volatile double[] recoLoc;                  // 도착지 좌표(엔진 reco.loc)
    private RecoAd adInFlight; private String actInFlight = "";
    private volatile String pendingBl = "";            // /board-live 가 준 답(다음 걸음 요청의 bl 로 한 번만 실어 보낸다) — 승차 대기 중 실시간 재보정(s196)
    private String blInFlight = "";
    public void setBl(String resp) { if (resp != null && resp.length() > 2 && resp.length() < 4000) pendingBl = resp; }
    public void setRecoAd(RecoAd ad) { if (ad != null) { pendingAd = ad; lastAd = ad; rcDisAny = false; } }
    public RecoAd lastRecoAd() { return lastAd; }
    public void queueAct(String a) { if ("press".equals(a) || "undo".equals(a) || "open".equals(a) || "close".equals(a) || "pill".equals(a) || "detour".equals(a)) pendingAct = a; }
    public void dismissReco(long at) { if (at > 0) rcDis = at; }
    private volatile boolean rcDisAny, rcRetry;        // s258: 팝업·알림에서 처리했으면 '지금 보이는 추천 줄 닫기'(-1) · 못 보냈으면 다시 판정(1) — 엔진이 오버레이 줄을 같이 정리한다
    public void dismissAnyReco() { rcDisAny = true; }
    public void retryReco() { rcRetry = true; }

    /** /reco-text 응답의 ad 줄 → RecoAd. 줄이 없으면 null. */
    @SuppressWarnings("unchecked")
    public static RecoAd recoAd(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!(m.get("ad") instanceof Map)) return null;
            Map<String, Object> ad = (Map<String, Object>) m.get("ad");
            RecoAd r = new RecoAd();
            r.a = BoardCore.s(ad.get("a"), 40); r.b = BoardCore.s(ad.get("b"), 64); r.m = BoardCore.s(ad.get("m"), 32);
            if (r.a.length() == 0) return null;
            boolean shop = "shop".equals(ad.get("k"));
            r.q = BoardCore.s(ad.get("q"), 40); r.pn = BoardCore.s(ad.get("pn"), 40);      // s350: 지도에서 찾을 말(엔진 값) — 가게 이름 또는 "<메뉴> 맛집"/"카페"
            r.go = BoardCore.s(ad.get("go"), 8);                      // s237: 엔진이 아이템(맛집·카페·쿠팡)과 날씨·시간에 맞춰 정한 클릭 유도 글 — 없으면 예전 이름
            if (r.go.length() == 0) r.go = shop ? "쿠팡 보기" : "맛집 보기";
            if (shop && m.get("shopItem") instanceof Map) {
                String u = BoardCore.s(((Map<String, Object>) m.get("shopItem")).get("u"), 600);
                if (u.startsWith("https://")) r.url = u;
            }
            return r;
        } catch (ScreenCore.ParseError e) { return null; }
    }
    /** 하차 추천 상태(엔진 reco 그대로) — 설정 '상태 확인'이 보여 준다. 판단은 엔진이 했고 여기는 받은 값을 들고만 있는다. */
    private String recoDest = "", recoSlot = "", recoWhy = "";
    public String recoWhy() { return recoWhy; }
    private long recoRem = Long.MIN_VALUE, recoAlertAt = 0L, recoTick = 0L;
    private boolean recoDinner;

    public boolean hasState() { return stateJson.length() > 2; }

    // ═════════════ 시작 ═════════════
    /** 엔진 POST /ride/start 본문. facts = HomeCore.resultFacts() (경로 응답 그대로 + 탭·이름·시각). */
    public static String startBody(int cap, String facts) { return startBody(cap, facts, null); }

    /**
     * allowedOff: 사용자가 끈 알림 종류 이름들(엔진 ride-alert 의 종류: near_arrive2 · near_arrive · arrive · transfer2 · transfer). 끈 것만 false 로 실어 보낸다.
     * 어떤 알림이 어떤 종류인지는 엔진이 정한 이름을 그대로 쓰고, 여기서는 설정 스위치 두 개를 그 이름들로 펼칠 뿐이다(arrive 스위치 → 도착 3종, transfer 스위치 → 환승 2종).
     */
    public static String startBody(int cap, String facts, java.util.List<String> allowedOff) { return startBody(cap, facts, allowedOff, false); }

    /** pfLive: 설정에서 '새 위치 판단기 보정'(실험)을 켰으면 true — 엔진이 위치 판단기(PosFusion)를 안내에 함께 쓴다. */
    public static String startBody(int cap, String facts, java.util.List<String> allowedOff, boolean pfLive) { return startBody(cap, facts, allowedOff, pfLive, 0L); }

    /** pickMs: 첫 구간이 버스일 때 사용자가 팝업에서 고른 버스의 도착 시각(ms, 0 이면 안 골랐다) — 엔진이 그 차를 따라가게 r.pick.ms 로 실어 보낸다. */
    public static String startBody(int cap, String facts, java.util.List<String> allowedOff, boolean pfLive, long pickMs) { return startBody(cap, facts, allowedOff, pfLive, pickMs, ""); }

    /** pickNo: 같은 구간을 가는 버스가 여러 번호일 때 사용자가 팝업에서 고른 번호(없으면 ""). 엔진이 그 번호로 안내하도록 r.pick.no 로 실어 보낸다(번호를 바꿔 계산하는 것은 엔진). */
    public static String startBody(int cap, String facts, java.util.List<String> allowedOff, boolean pfLive, long pickMs, String pickNo) {
        String f = facts == null || facts.length() < 2 ? "null" : facts;
        if (!"null".equals(f) && allowedOff != null && !allowedOff.isEmpty() && f.endsWith("}")) {
            StringBuilder a = new StringBuilder(",\"allowed\":{");
            for (int i = 0; i < allowedOff.size(); i++) { if (i > 0) a.append(','); a.append(ShellCore.q(allowedOff.get(i))).append(":false"); }
            f = f.substring(0, f.length() - 1) + a.append("}}");
        }
        if (!"null".equals(f) && pfLive && f.endsWith("}")) f = f.substring(0, f.length() - 1) + ",\"pf\":true}";
        if (!"null".equals(f) && pickMs > 0L && f.endsWith("}")) f = f.substring(0, f.length() - 1) + ",\"pick\":{\"ms\":" + pickMs + (pickNo != null && pickNo.length() > 0 ? ",\"no\":" + ShellCore.q(pickNo) : "") + "}}";
        return "{\"cap\":" + cap + ",\"r\":" + f + "}";
    }

    /** 설정의 알림 스위치(np_arrive · np_transfer, "0" 이 끔)를 끈 알림 종류 목록으로. */
    public static java.util.List<String> offKinds(ShellCore.Store st) {
        java.util.List<String> o = new java.util.ArrayList<String>();
        if ("0".equals(st.get("np_arrive", "1"))) { o.add("near_arrive2"); o.add("near_arrive"); o.add("arrive"); }
        if ("0".equals(st.get("np_transfer", "1"))) { o.add("transfer2"); o.add("transfer"); }
        if ("0".equals(st.get("np_arrive_reco", "1"))) o.add("arrive_reco");
        return o;
    }

    /** /ride/start 응답을 읽는다. 성공이면 "" · 실패면 사용자에게 보일 글(엔진 msg 또는 기본 글). */
    @SuppressWarnings("unchecked")
    public String onStart(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return "탑승 안내를 시작하지 못했어요";
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok")) || !(m.get("state") instanceof Map)) {
                Object msg = m.get("msg");
                return msg instanceof String && ((String) msg).length() > 0 ? (String) msg : "탑승 안내를 시작하지 못했어요";
            }
            stateJson = HomeSearchCore.toJson(m.get("state"));
            Object t = m.get("text");
            text = t instanceof String ? (String) t : "";
            title = "길동무 경로 안내 중"; done = false; offAt = 0L; cur = -1; posJson = "null"; arrJson = "null"; dtJson = ""; dtOn = false;
            synchronized (fixes) { fixes.clear(); }
            lastSentTs = 0L; lastFixTs = 0L; nextMs = STEP_DEFAULT_MS; rev++;
            return "";
        } catch (ScreenCore.ParseError e) {
            return "탑승 안내를 시작하지 못했어요";
        }
    }

    // ═════════════ 위치 모으기 ═════════════
    /** 새 위치 하나(오래된 것 먼저 들어온다). 시각이 거꾸로이거나 좌표가 이상하면 버린다. */
    public void addFix(long ts, double lat, double lng, double acc) {
        if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || (lat == 0 && lng == 0)) return;
        synchronized (fixes) {
            if (ts <= lastFixTs) return;
            lastFixTs = ts; lastLat = lat; lastLng = lng;
            fixes.add(new double[] { ts, lat, lng, acc });
            while (fixes.size() > MAX_FIX) fixes.remove(0);
        }
    }
    public int pendingFixes() { synchronized (fixes) { return fixes.size(); } }

    // ═════════════ 5초마다 ═════════════
    /** 엔진 POST /ride-standby 본문 { nowMs, fixes, state }. 위치는 가장 새 SEND_FIX 개만 싣는다. */
    /** s320: 다음에 탈 버스 구간(환승 대기 · 승차 대기 중인 버스 승차 노드 boardI 와 그 버스가 몇 번째 버스 구간인지 boardJ, 없으면 -1). 엔진 state 의 xw · wait · eta.nodes 를 읽을 뿐이다. */
    public int boardI = -1, boardJ = -1;
    @SuppressWarnings("unchecked")
    private void boardCalc(Map<String, Object> st) {
        boardI = -1; boardJ = -1;
        try {
            Object eo = st.get("eta");
            if (!(eo instanceof Map) || !(((Map<String, Object>) eo).get("nodes") instanceof List)) return;
            List<Object> nodes = (List<Object>) ((Map<String, Object>) eo).get("nodes");
            Object wo = st.get("wait"), xo = st.get("xw");
            int bi = -1;
            if (wo instanceof Map && ((Map<String, Object>) wo).get("i") instanceof Number) bi = ((Number) ((Map<String, Object>) wo).get("i")).intValue();
            else if (xo instanceof Map && ((Map<String, Object>) xo).get("i") instanceof Number && "bus".equals(((Map<String, Object>) xo).get("mode"))) bi = ((Number) ((Map<String, Object>) xo).get("i")).intValue();
            if (bi < 1 || bi >= nodes.size() || !busNode(nodes.get(bi))) return;
            int j = -1;
            for (int k = 1; k <= bi; k++) {
                if (!busNode(nodes.get(k))) continue;
                Object pv = nodes.get(k - 1);
                if (k > 1 && busNode(pv) && String.valueOf(((Map<String, Object>) pv).get("lineName")).equals(String.valueOf(((Map<String, Object>) nodes.get(k)).get("lineName"))) && j >= 0) continue;
                j++;
            }
            Object pb = nodes.get(bi - 1);
            if (bi > 1 && busNode(pb) && String.valueOf(((Map<String, Object>) pb).get("lineName")).equals(String.valueOf(((Map<String, Object>) nodes.get(bi)).get("lineName")))) return;      // 승차 노드가 아니다(같은 버스를 타는 중)
            boardI = bi; boardJ = j;
        } catch (Throwable t) { boardI = -1; boardJ = -1; }
    }
    @SuppressWarnings("unchecked")
    private static boolean busNode(Object n) { return n instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) n).get("isBus")) && !Boolean.TRUE.equals(((Map<String, Object>) n).get("isSub")); }
    // ── s320: 중간 환승 버스 고르기 — 엔진이 번호마다 만든 변경분(patch)을 달리는 안내(state)에 끼운다(계산 없음). 걸음이 돌고 있는 중에 상태를 바꾸면 그 답이 덮어쓰므로 다음 걸음을 보낼 때 끼운다. ──
    private volatile String pendingSwap = "";
    public boolean swapPending() { return pendingSwap.length() > 0; }
    @SuppressWarnings("unchecked")
    public boolean busSwap(String patchJson, long pickMs) {
        try {
            Object o = ScreenCore.parse(patchJson);
            if (!(o instanceof Map)) return false;
            Map<String, Object> p = (Map<String, Object>) o;
            if (!(p.get("bl") instanceof Map)) return false;
            if (pickMs > 0L) ((Map<String, Object>) p.get("bl")).put("pickMs", Long.valueOf(pickMs));
            pendingSwap = HomeSearchCore.toJson(p);
            return true;
        } catch (Throwable t) { return false; }
    }
    @SuppressWarnings("unchecked")
    static String applySwap(String stateJson, String patchJson) {
        try {
            Object so = ScreenCore.parse(stateJson), po = ScreenCore.parse(patchJson);
            if (!(so instanceof Map) || !(po instanceof Map)) return stateJson;
            Map<String, Object> st = (Map<String, Object>) so, p = (Map<String, Object>) po;
            Object co = st.get("cfg"), eo = st.get("eta");
            if (!(co instanceof Map) || !(eo instanceof Map) || !(p.get("bl") instanceof Map)) return stateJson;
            Map<String, Object> cfg = (Map<String, Object>) co, eta = (Map<String, Object>) eo;
            cfg.put("bl", p.get("bl"));
            mergeBy(eta.get("nodes"), p.get("nodes"), "i", true);
            mergeBy(st.get("stops"), p.get("stops"), "i", false);
            mergeBy(cfg.get("targets"), p.get("targets"), "nodeIdx", false);
            if (st.get("bl") instanceof Map) { ((Map<String, Object>) st.get("bl")).remove("ms"); ((Map<String, Object>) st.get("bl")).remove("arr"); }      // 지난 구간에서 따라간 차 기록은 버린다 — 고른 차를 따라가게
            return HomeSearchCore.toJson(st);
        } catch (Throwable t) { return stateJson; }
    }
    /** 목록(dst)의 칸을 변경분(src) 항목의 key 값과 같은 것에 덮어쓴다. byPos 면 key 값을 목록 위치로 본다(노드는 번호 = 위치). */
    @SuppressWarnings("unchecked")
    private static void mergeBy(Object dst, Object src, String key, boolean byPos) {
        if (!(dst instanceof List) || !(src instanceof List)) return;
        List<Object> d = (List<Object>) dst;
        for (Object x : (List<Object>) src) {
            if (!(x instanceof Map)) continue;
            Map<String, Object> m = (Map<String, Object>) x;
            if (!(m.get(key) instanceof Number)) continue;
            int kv = ((Number) m.get(key)).intValue();
            Map<String, Object> hit = null;
            if (byPos) { if (kv >= 0 && kv < d.size() && d.get(kv) instanceof Map) hit = (Map<String, Object>) d.get(kv); }
            else for (Object y : d) if (y instanceof Map && ((Map<String, Object>) y).get(key) instanceof Number && ((Number) ((Map<String, Object>) y).get(key)).intValue() == kv) { hit = (Map<String, Object>) y; break; }
            if (hit == null) continue;
            for (Map.Entry<String, Object> e : m.entrySet()) if (!e.getKey().equals(key)) hit.put(e.getKey(), e.getValue());
        }
    }
    /** 중간 환승 버스 질문 요청 본문: 확정 때 쓴 경로 사실에 leg(몇 번째 버스 구간) · arr(칸별 시각) · now 를 더한다. */
    public static String legBody(int cap, String facts, int leg, String arrJson, long nowMs) {
        String f = facts == null || facts.length() < 2 ? "null" : facts;
        if (!"null".equals(f) && f.endsWith("}")) f = f.substring(0, f.length() - 1) + ",\"leg\":" + leg + ",\"now\":" + nowMs + (arrJson != null && arrJson.length() > 2 && !"null".equals(arrJson) ? ",\"arr\":" + arrJson : "") + "}";
        return "{\"cap\":" + cap + ",\"r\":" + f + "}";
    }
    public String stepBody(long nowMs) {
        String sw = pendingSwap;
        if (sw.length() > 0) { pendingSwap = ""; if (stateJson.length() > 0) stateJson = applySwap(stateJson, sw); }
        StringBuilder b = new StringBuilder("{\"nowMs\":").append(nowMs).append(",\"fixes\":[");
        synchronized (fixes) {
            int from = Math.max(0, fixes.size() - SEND_FIX);
            for (int i = from; i < fixes.size(); i++) {
                double[] f = fixes.get(i);
                if (i > from) b.append(',');
                b.append('[').append((long) f[0]).append(',').append(f[1]).append(',').append(f[2]).append(',');
                if (f[3] > 0) b.append(Math.round(f[3])); else b.append("null");
                b.append(']');
                lastSentTs = (long) f[0];
            }
        }
        b.append("],\"state\":").append(stateJson.length() > 0 ? stateJson : "null");
        RecoAd ad = pendingAd; adInFlight = ad;
        if (ad != null) b.append(",\"rc\":{\"a\":").append(ShellCore.q(ad.a)).append(",\"b\":").append(ShellCore.q(ad.b)).append(",\"m\":").append(ShellCore.q(ad.m)).append(",\"go\":").append(ShellCore.q(ad.go)).append(ad.n ? ",\"n\":1" : "").append('}');
        if (rcDisAny) b.append(",\"rcDis\":-1"); else if (rcDis > 0) b.append(",\"rcDis\":").append(rcDis);
        if (rcRetry) { b.append(",\"rcRetry\":1"); rcRetry = false; }
        String act = pendingAct; actInFlight = act;
        if (act.length() > 0) b.append(",\"act\":").append(ShellCore.q(act));
        String bl = pendingBl; blInFlight = bl;
        if (bl.length() > 0) b.append(",\"bl\":").append(bl);
        return b.append('}').toString();
    }

    /** /ride-standby 응답을 읽는다. 읽지 못하면 ok=false (state 는 그대로 — 다음 호출에 다시 보낸다). */
    @SuppressWarnings("unchecked")
    public Step onStep(String resp) {
        Step s = new Step();
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return s;
            Map<String, Object> m = (Map<String, Object>) o;
            if (m.get("error") != null || !(m.get("state") instanceof Map)) return s;
            stateJson = HomeSearchCore.toJson(m.get("state"));
            Object wo = ((Map<String, Object>) m.get("state")).get("wait");           // 승차 대기: 타임라인 마커를 탑승 지점에 주황 맥박 + '대기 중 · 120m' 로
            if (wo instanceof Map && ((Map<String, Object>) wo).get("i") instanceof Number) {
                Map<String, Object> wm = (Map<String, Object>) wo;
                waitI = ((Number) wm.get("i")).intValue();
                waitLat = wm.get("lat") instanceof Number ? ((Number) wm.get("lat")).doubleValue() : Double.NaN;
                waitLng = wm.get("lng") instanceof Number ? ((Number) wm.get("lng")).doubleValue() : Double.NaN;
            } else {
                Object xo = ((Map<String, Object>) m.get("state")).get("xw");        // s320 (YJ: 환승대기 중이면 마커가 대기 쪽에): 환승역에서 다음 열차를 기다리는 중(엔진 state.xw.i = 탑승 노드) — 마커를 그 탑승 칸에 세운다
                if (xo instanceof Map && ((Map<String, Object>) xo).get("i") instanceof Number) { waitI = ((Number) ((Map<String, Object>) xo).get("i")).intValue(); waitLat = Double.NaN; waitLng = Double.NaN; }
                else waitI = -1;
            }
            boardCalc((Map<String, Object>) m.get("state"));
            synchronized (fixes) {                                   // 보낸 위치는 지운다(그 뒤 들어온 것은 남긴다)
                for (int i = fixes.size() - 1; i >= 0; i--) if (fixes.get(i)[0] <= lastSentTs) fixes.remove(i);
            }
            Object on = m.get("ongoing");
            if (on instanceof Map) {
                Object t = ((Map<String, Object>) on).get("text"), ti = ((Map<String, Object>) on).get("title");
                if (t instanceof String) text = (String) t;
                if (ti instanceof String && ((String) ti).length() > 0) title = (String) ti;
            }
            Object ovObj = m.get("overlay");
            if (ovObj instanceof Map) {
                Map<String, Object> om = (Map<String, Object>) ovObj;
                ovActive = Boolean.TRUE.equals(om.get("active")) && om.get("line1") instanceof String;
                ovLine1 = BoardCore.s(om.get("line1"), 60); ovLine2 = BoardCore.s(om.get("line2"), 60); ovBanner = BoardCore.s(om.get("banner"), 60);
                Object al2 = om.get("alert"); ovAlert = al2 instanceof Number ? Math.max(0, Math.min(2, ((Number) al2).intValue())) : 0;
                ovShare = ShareCore.fromMap(om.get("share")); ov = OvCore.fromMap(om);
            } else { ovActive = false; ovLine1 = ovLine2 = ovBanner = ""; ovAlert = 0; ovShare = null; ov = null; }
            Object rw = m.get("row");
            if (rw instanceof Map) {                                  // 경로 카드 버튼 줄 오른쪽 칸(탑승 → 환승 → 도착): 칸의 뜻·전환은 엔진이 정한다
                Map<String, Object> rm = (Map<String, Object>) rw;
                rowJson = HomeSearchCore.toJson(rm); rowSlot = BoardCore.s(rm.get("slot"), 12); rowCan = Boolean.TRUE.equals(rm.get("can"));
            } else { rowJson = ""; rowSlot = ""; rowCan = false; }
            Object nm = m.get("nextMs");
            double nx = nm instanceof Number ? ((Number) nm).doubleValue() : STEP_DEFAULT_MS;
            nextMs = (long) Math.max(STEP_MIN_MS, Math.min(STEP_MAX_MS, nx));
            Object c = m.get("curIdx");
            if (c instanceof Number) cur = ((Number) c).intValue();
            posJson = m.get("pos") instanceof Map ? HomeSearchCore.toJson(m.get("pos")) : "null";
            arrJson = m.get("arr") instanceof List ? HomeSearchCore.toJson(m.get("arr")) : "null";
            done = Boolean.TRUE.equals(m.get("done"));
            Object offO = m.get("off");
            offAt = offO instanceof Map && ((Map<String, Object>) offO).get("at") instanceof Number ? ((Number) ((Map<String, Object>) offO).get("at")).longValue() : 0L;
            offStn = offO instanceof Map && ((Map<String, Object>) offO).get("stn") instanceof String ? BoardCore.s(((Map<String, Object>) offO).get("stn"), 24) : "";
            dtOn = m.get("dt") instanceof Map;
            dtJson = dtOn ? HomeSearchCore.toJson(m.get("dt")) : "";
            quit = done && Boolean.TRUE.equals(m.get("quit"));
            Object al = m.get("alert");
            if (al instanceof Map) {
                Map<String, Object> a = (Map<String, Object>) al;
                s.alert = true;
                s.key = str(a.get("key")); s.type = str(a.get("type")); s.title = str(a.get("title")); s.body = str(a.get("body"));
                s.vib = vibPattern(a.get("vib"));
            }
            if (m.get("reco") instanceof Map) {
                Map<String, Object> rc = (Map<String, Object>) m.get("reco");
                s.recoBody = recoBody(rc);
                recoDest = BoardCore.s(rc.get("dest"), 40); recoSlot = BoardCore.s(rc.get("slot"), 12); recoWhy = BoardCore.s(rc.get("why"), 12); recoDinner = Boolean.TRUE.equals(rc.get("dinner"));
                recoRem = rc.get("remSec") instanceof Number ? ((Number) rc.get("remSec")).longValue() : Long.MIN_VALUE;
                recoAlertAt = rc.get("alertAt") instanceof Number ? ((Number) rc.get("alertAt")).longValue() : 0L;
                recoTick = System.currentTimeMillis();
                Object rl = rc.get("loc");
                if (rl instanceof Map && ((Map<String, Object>) rl).get("lat") instanceof Number && ((Map<String, Object>) rl).get("lng") instanceof Number) recoLoc = new double[] { ((Number) ((Map<String, Object>) rl).get("lat")).doubleValue(), ((Number) ((Map<String, Object>) rl).get("lng")).doubleValue() };
            }
            if (pendingAd == adInFlight) pendingAd = null;
            if (pendingAct.equals(actInFlight)) pendingAct = "";
            if (pendingBl.equals(blInFlight)) pendingBl = "";
            Object ask = m.get("ask");
            if (ask instanceof Map && "boardlive".equals(((Map<String, Object>) ask).get("kind")) && ((Map<String, Object>) ask).get("body") instanceof Map)
                s.askBody = HomeSearchCore.toJson(((Map<String, Object>) ask).get("body"));
            s.done = done; s.ok = true; rev++;
        } catch (ScreenCore.ParseError e) {
            return new Step();
        }
        return s;
    }

    private static String str(Object o) { return o instanceof String ? (String) o : ""; }

    /** 설정 '상태 확인'용 — 엔진 reco 에서 받은 값을 JSON 조각(중괄호 없이)으로. 아직 한 번도 못 받았으면 "". */
    public String recoStatJson() {
        if (recoTick == 0L) return "";
        StringBuilder b = new StringBuilder("\"dest\":").append(ShellCore.q(recoDest)).append(",\"slot\":").append(ShellCore.q(recoSlot)).append(",\"dinner\":").append(recoDinner);
        if (recoRem != Long.MIN_VALUE) b.append(",\"rem\":").append(Math.max(0L, recoRem));
        if (recoAlertAt > 0L) b.append(",\"alertAt\":").append(recoAlertAt);
        return b.append(",\"tickAt\":").append(recoTick).toString();
    }

    /** 엔진 reco(fire·arrMs·dest·loc) → POST /reco-text 본문. 엔진이 정한 값을 그대로 옮기고, 씨앗(무작위 고정)만 도착 시각에서 얻는다. fire 가 아니면 "". */
    @SuppressWarnings("unchecked")
    public static String recoBody(Map<String, Object> reco) {
        if (reco == null || !Boolean.TRUE.equals(reco.get("fire")) || !(reco.get("arrMs") instanceof Number)) return "";
        long arr = ((Number) reco.get("arrMs")).longValue();
        StringBuilder b = new StringBuilder("{\"arrMs\":").append(arr).append(",\"nowMs\":").append(System.currentTimeMillis());
        b.append(",\"dest\":").append(ShellCore.q(str(reco.get("dest")))).append(",\"seed\":").append(Math.abs(arr / 1000L) % 2147483647L);
        Object lo = reco.get("loc");
        if (lo instanceof Map) {
            Object la = ((Map<String, Object>) lo).get("lat"), ln = ((Map<String, Object>) lo).get("lng");
            if (la instanceof Number && ln instanceof Number) b.append(",\"loc\":{\"lat\":").append(((Number) la).doubleValue()).append(",\"lng\":").append(((Number) ln).doubleValue()).append("},\"foodPref\":\"server\"");
        }
        return b.append(",\"aiCopy\":1,\"pickShop\":1}").toString();
    }

    /** /reco-text 응답 → { 제목, 본문 }. 보낼 글이 없으면(시간대 아님·오류) null. */
    @SuppressWarnings("unchecked")
    public static String[] recoText(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok")) || "none".equals(m.get("slot"))) return null;
            String t = str(m.get("title")), b = str(m.get("body"));
            if (t.length() == 0 || b.length() == 0) return null;
            return new String[] { t.length() > 80 ? t.substring(0, 80) : t, b.length() > 600 ? b.substring(0, 600) : b };
        } catch (ScreenCore.ParseError e) { return null; }
    }

    /**
     * 탑승 전에 받아 둔 추천 글의 '하차 N분 전' · '도착 예정 HH:MM' 을 지금 터진 시점의 값으로 고친다.
     * 받아 둘 때는 하차까지 한참 남아 있어(N=7 로 박힘) 그대로 띄우면 2분 남았는데도 '7분 전'이라 나오고 도착 시각도 그때의 추정이라 어긋난다.
     * 가게·메뉴·문구는 그대로. arrMs·nowMs 가 이상하면 글을 그대로 돌려준다.
     */
    public static String[] freshenReco(String[] t, long arrMs, long nowMs) { return RideStandbyJ.recoFresh(t, arrMs, nowMs); }      // s271: 남은 분 · 도착 시각 계산은 엔진(ride-standby rsRecoFresh)의 폰 안 사본

    /** 엔진의 진동 무늬 [켜짐, 꺼짐, 켜짐 …](웹 방식) → 안드로이드 무늬 [대기, 켜짐, 꺼짐 …]. 최대 8칸, 한 칸 최대 1초. */
    @SuppressWarnings("unchecked")
    public static long[] vibPattern(Object v) {
        List<Long> l = new ArrayList<Long>();
        l.add(0L);
        if (v instanceof List) for (Object x : (List<Object>) v) { if (l.size() > 8) break; if (x instanceof Number) l.add(Math.max(0L, Math.min(1000L, ((Number) x).longValue()))); }
        if (l.size() < 2) { l.add(300L); }
        long[] r = new long[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = l.get(i);
        return r;
    }

    // ═════════════ 앱 화면용 ═════════════
    /** 결과 카드의 탑승 상태 { on:1, text } (HomeCore → 엔진 r.ride). */
    public String rideJson() { return "{\"on\":1,\"text\":" + ShellCore.q(text) + (dtOn ? ",\"dt\":" + ShellCore.q(text) : "") + (rowJson.length() > 2 ? ",\"row\":" + rowJson : "") + "}"; }
    /** 버튼 줄 오른쪽 칸: 지금 칸 이름("board"|"transfer"|"arrive"|"") · 지금 누르면 먹히나. */
    public String rowJson = "", rowSlot = ""; public boolean rowCan;
    /**
     * 탑승 중 캐릭터 장면 재료 { here, boarded, key, nodes[{name,isOrigin,isSub,isBus,lineName}] } — 상태에서 이름·종류만 옮겨 담는다(어떤 장면을 보일지는 엔진 sceneDecide 가 정한다).
     * 상태가 없거나 이상하면 빈 글.
     */
    @SuppressWarnings("unchecked")
    public String sceneJson() {
        try {
            Object o = ScreenCore.parse(stateJson);
            if (!(o instanceof Map)) return "";
            Map<String, Object> m = (Map<String, Object>) o;
            Object eo = m.get("eta");
            if (!(eo instanceof Map) || !(((Map<String, Object>) eo).get("nodes") instanceof List)) return "";
            Map<String, Object> eta = (Map<String, Object>) eo;
            List<Object> out = new ArrayList<Object>();
            for (Object x : (List<Object>) eta.get("nodes")) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> n = (Map<String, Object>) x, r = new LinkedHashMap<String, Object>();
                r.put("name", BoardCore.s(n.get("name"), 24));
                if (Boolean.TRUE.equals(n.get("isOrigin"))) r.put("isOrigin", Boolean.TRUE);
                if (Boolean.TRUE.equals(n.get("isSub"))) r.put("isSub", Boolean.TRUE);
                if (Boolean.TRUE.equals(n.get("isBus"))) r.put("isBus", Boolean.TRUE);
                r.put("lineName", BoardCore.s(n.get("lineName"), 16));
                out.add(r);
                if (out.size() >= 80) break;
            }
            if (out.size() < 2) return "";
            boolean boarded = m.get("wait") == null && !Boolean.FALSE.equals(eta.get("boarded"));
            Map<String, Object> res = new LinkedHashMap<String, Object>();
            res.put("here", Integer.valueOf(Math.max(0, cur))); res.put("boarded", Boolean.valueOf(boarded)); res.put("key", BoardCore.s(m.get("tripSig"), 40)); res.put("nodes", out);
            return HomeSearchCore.toJson(res);
        } catch (ScreenCore.ParseError e) { return ""; }
    }
    /** 결과 카드의 내 위치 { cur, pos, arr } (엔진 r.lv). */
    public String lvJson() { return "{\"cur\":" + cur + ",\"pos\":" + posJson + ",\"arr\":" + arrJson + waitJson() + (dtJson.length() > 2 ? ",\"dt\":" + dtJson : "") + "}"; }
    /** 승차 대기 중이면 ,"wait":{"i":노드[,"lat":탑승 지점,"lng":…][,"me":[내 위도,경도]]} — 아니면 "". 거리(m)는 엔진(result.js)이 이 값으로 잰다(s271). */
    private String waitJson() {
        if (waitI < 1) return "";
        StringBuilder b = new StringBuilder(",\"wait\":{\"i\":").append(waitI);
        if (!Double.isNaN(waitLat) && !Double.isNaN(waitLng)) b.append(",\"lat\":").append(waitLat).append(",\"lng\":").append(waitLng);
        if (!Double.isNaN(waitLat) && !Double.isNaN(waitLng) && !Double.isNaN(lastLat) && !Double.isNaN(lastLng)) b.append(",\"me\":[").append(lastLat).append(',').append(lastLng).append(']');
        return b.append('}').toString();
    }

    // ═════════════ 저장 · 복원 (서비스가 되살아날 때) ═════════════
    public String save(long nowMs) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("state", stateJson); m.put("text", text); m.put("title", title); m.put("at", Long.valueOf(nowMs));
        m.put("cur", Integer.valueOf(cur)); m.put("pos", posJson); m.put("arr", arrJson);
        return HomeSearchCore.toJson(m);
    }
    /** 저장한 글에서 되살린다. 너무 오래됐거나 이상하면 null. */
    @SuppressWarnings("unchecked")
    public static RideCore restore(String saved, long nowMs) {
        if (saved == null || saved.length() < 10) return null;
        try {
            Object o = ScreenCore.parseSaved(saved);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            Object at = m.get("at"), st = m.get("state");
            if (!(at instanceof Number) || !(st instanceof String) || ((String) st).length() < 10) return null;
            if (nowMs - ((Number) at).longValue() > MAX_AGE_MS) return null;
            RideCore r = new RideCore();
            r.stateJson = (String) st; r.text = str(m.get("text")); if (str(m.get("title")).length() > 0) r.title = str(m.get("title"));
            r.savedAt = ((Number) at).longValue();
            if (m.get("cur") instanceof Number) r.cur = ((Number) m.get("cur")).intValue();
            r.posJson = str(m.get("pos")).length() > 0 ? str(m.get("pos")) : "null"; r.arrJson = str(m.get("arr")).length() > 0 ? str(m.get("arr")) : "null";
            return r;
        } catch (ScreenCore.ParseError e) {
            return null;
        }
    }
}
