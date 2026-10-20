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
    }

    public boolean hasState() { return stateJson.length() > 2; }

    // ═════════════ 시작 ═════════════
    /** 엔진 POST /ride/start 본문. facts = HomeCore.resultFacts() (경로 응답 그대로 + 탭·이름·시각). */
    public static String startBody(int cap, String facts) { return startBody(cap, facts, null); }

    /**
     * allowedOff: 사용자가 끈 알림 종류 이름들(엔진 ride-alert 의 종류: near_arrive2 · near_arrive · arrive · transfer2 · transfer). 끈 것만 false 로 실어 보낸다.
     * 어떤 알림이 어떤 종류인지는 엔진이 정한 이름을 그대로 쓰고, 여기서는 설정 스위치 두 개를 그 이름들로 펼칠 뿐이다(arrive 스위치 → 도착 3종, transfer 스위치 → 환승 2종).
     */
    public static String startBody(int cap, String facts, java.util.List<String> allowedOff) {
        String f = facts == null || facts.length() < 2 ? "null" : facts;
        if (!"null".equals(f) && allowedOff != null && !allowedOff.isEmpty() && f.endsWith("}")) {
            StringBuilder a = new StringBuilder(",\"allowed\":{");
            for (int i = 0; i < allowedOff.size(); i++) { if (i > 0) a.append(','); a.append(ShellCore.q(allowedOff.get(i))).append(":false"); }
            f = f.substring(0, f.length() - 1) + a.append("}}");
        }
        return "{\"cap\":" + cap + ",\"r\":" + f + "}";
    }

    /** 설정의 알림 스위치(np_arrive · np_transfer, "0" 이 끔)를 끈 알림 종류 목록으로. */
    public static java.util.List<String> offKinds(ShellCore.Store st) {
        java.util.List<String> o = new java.util.ArrayList<String>();
        if ("0".equals(st.get("np_arrive", "1"))) { o.add("near_arrive2"); o.add("near_arrive"); o.add("arrive"); }
        if ("0".equals(st.get("np_transfer", "1"))) { o.add("transfer2"); o.add("transfer"); }
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
        return b.append("],\"state\":").append(stateJson.length() > 0 ? stateJson : "null").append('}').toString();
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
            Object nm = m.get("nextMs");
            double nx = nm instanceof Number ? ((Number) nm).doubleValue() : STEP_DEFAULT_MS;
            nextMs = (long) Math.max(STEP_MIN_MS, Math.min(STEP_MAX_MS, nx));
            Object c = m.get("curIdx");
            if (c instanceof Number) cur = ((Number) c).intValue();
            posJson = m.get("pos") instanceof Map ? HomeSearchCore.toJson(m.get("pos")) : "null";
            arrJson = m.get("arr") instanceof List ? HomeSearchCore.toJson(m.get("arr")) : "null";
            done = Boolean.TRUE.equals(m.get("done"));
            Object al = m.get("alert");
            if (al instanceof Map) {
                Map<String, Object> a = (Map<String, Object>) al;
                s.alert = true;
                s.key = str(a.get("key")); s.type = str(a.get("type")); s.title = str(a.get("title")); s.body = str(a.get("body"));
                s.vib = vibPattern(a.get("vib"));
            }
            s.done = done; s.ok = true; rev++;
        } catch (ScreenCore.ParseError e) {
            return new Step();
        }
        return s;
    }

    private static String str(Object o) { return o instanceof String ? (String) o : ""; }

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
    public String rideJson() { return "{\"on\":1,\"text\":" + ShellCore.q(text) + "}"; }
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
