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
    public int cur = -1, rev = 0;
    public String posJson = "null", arrJson = "null";
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
    public static final class RecoAd { public String a = "", b = "", m = "", go = "맛집 보기", url = ""; }
    private volatile RecoAd pendingAd;                 // 엔진에 아직 못 알린 추천 줄
    private volatile RecoAd lastAd;                    // 마지막으로 받은 추천 줄([보기]가 쓴다)
    private volatile String pendingAct = "";           // 오버레이 탑승 줄 손짓(press · undo · open · close · pill) — 한 번만 보낸다
    private volatile long rcDis;                       // [확인]/[보기]로 닫은 추천의 at
    public volatile double[] recoLoc;                  // 도착지 좌표(엔진 reco.loc)
    private RecoAd adInFlight; private String actInFlight = "";
    private volatile String pendingBl = "";            // /board-live 가 준 답(다음 걸음 요청의 bl 로 한 번만 실어 보낸다) — 승차 대기 중 실시간 재보정(s196)
    private String blInFlight = "";
    public void setBl(String resp) { if (resp != null && resp.length() > 2 && resp.length() < 4000) pendingBl = resp; }
    public void setRecoAd(RecoAd ad) { if (ad != null) { pendingAd = ad; lastAd = ad; } }
    public RecoAd lastRecoAd() { return lastAd; }
    public void queueAct(String a) { if ("press".equals(a) || "undo".equals(a) || "open".equals(a) || "close".equals(a) || "pill".equals(a)) pendingAct = a; }
    public void dismissReco(long at) { if (at > 0) rcDis = at; }

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
            r.go = shop ? "쿠팡 보기" : "맛집 보기";
            if (shop && m.get("shopItem") instanceof Map) {
                String u = BoardCore.s(((Map<String, Object>) m.get("shopItem")).get("u"), 600);
                if (u.startsWith("https://")) r.url = u;
            }
            return r;
        } catch (ScreenCore.ParseError e) { return null; }
    }
    /** 하차 추천 상태(엔진 reco 그대로) — 설정 '상태 확인'이 보여 준다. 판단은 엔진이 했고 여기는 받은 값을 들고만 있는다. */
    private String recoDest = "", recoSlot = "";
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
    public static String startBody(int cap, String facts, java.util.List<String> allowedOff, boolean pfLive, long pickMs) {
        String f = facts == null || facts.length() < 2 ? "null" : facts;
        if (!"null".equals(f) && allowedOff != null && !allowedOff.isEmpty() && f.endsWith("}")) {
            StringBuilder a = new StringBuilder(",\"allowed\":{");
            for (int i = 0; i < allowedOff.size(); i++) { if (i > 0) a.append(','); a.append(ShellCore.q(allowedOff.get(i))).append(":false"); }
            f = f.substring(0, f.length() - 1) + a.append("}}");
        }
        if (!"null".equals(f) && pfLive && f.endsWith("}")) f = f.substring(0, f.length() - 1) + ",\"pf\":true}";
        if (!"null".equals(f) && pickMs > 0L && f.endsWith("}")) f = f.substring(0, f.length() - 1) + ",\"pick\":{\"ms\":" + pickMs + "}}";
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
            title = "길동무 경로 안내 중"; done = false; cur = -1; posJson = "null"; arrJson = "null";
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
            lastFixTs = ts;
            fixes.add(new double[] { ts, lat, lng, acc });
            while (fixes.size() > MAX_FIX) fixes.remove(0);
        }
    }
    public int pendingFixes() { synchronized (fixes) { return fixes.size(); } }

    // ═════════════ 5초마다 ═════════════
    /** 엔진 POST /ride-standby 본문 { nowMs, fixes, state }. 위치는 가장 새 SEND_FIX 개만 싣는다. */
    public String stepBody(long nowMs) {
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
        if (ad != null) b.append(",\"rc\":{\"a\":").append(ShellCore.q(ad.a)).append(",\"b\":").append(ShellCore.q(ad.b)).append(",\"m\":").append(ShellCore.q(ad.m)).append(",\"go\":").append(ShellCore.q(ad.go)).append('}');
        if (rcDis > 0) b.append(",\"rcDis\":").append(rcDis);
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
                recoDest = BoardCore.s(rc.get("dest"), 40); recoSlot = BoardCore.s(rc.get("slot"), 12); recoDinner = Boolean.TRUE.equals(rc.get("dinner"));
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
    public String rideJson() { return "{\"on\":1,\"text\":" + ShellCore.q(text) + (rowJson.length() > 2 ? ",\"row\":" + rowJson : "") + "}"; }
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
    public String lvJson() { return "{\"cur\":" + cur + ",\"pos\":" + posJson + ",\"arr\":" + arrJson + "}"; }

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
            Object o = ScreenCore.parse(saved);
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
