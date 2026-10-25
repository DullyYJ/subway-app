package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.Random;

/**
 * 홈 카드 묶음(AI 승무원 · 혼잡도 · 실시간 대화)의 순수 자바 상태기 — 2026-10-20 (s93).
 * 카드 글·색·막대·줄 수는 모두 엔진(/screen/hcards)이 정한다. 여기는 이 기기가 쥔 사실(위치·다음 갱신 시각·새로고침 눌림·받아 둔 대화)을 요청으로 옮기고 눌림의 뜻만 정한다.
 */
public final class HcardsCore {
    public static final int R_NONE = 0, R_AI = 1, R_TALK_OPEN = 2, R_TALK_SEND = 3, R_SHARE = 4;
    public static final long AI_EVERY_MS = 5 * 60 * 1000L;

    public double[] fix = null;                       // 마지막으로 안 기기 위치(위도, 경도)
    public long fixAt = 0;
    public long aiNextAt = 0;                         // 다음 자동 갱신 시각(기기 시계 ms). 0 이면 아직 정하지 않음
    public double aiRnd = 0.5;                        // 마무리 문구를 고를 난수(새로고침마다 바뀐다)
    public boolean aiBusy = false;
    public boolean share;                              // 탑승 중이고 공유할 재료가 있으면 — 엔진이 [내 위치 공유] 버튼을 낸다
    public String rideScene = "";                     // 탑승 중이면 장면 재료(RideCore.sceneJson) — 엔진이 대기/탑승/하차 장면을 정한다
    public int rev = 0;                               // 요청에 실리는 값이 바뀔 때마다 오른다
    public String sendText = "";
    private final Random rnd = new Random();

    public void setFix(double la, double lo, long now) { fix = new double[] { la, lo }; fixAt = now; rev++; }

    // ── 현위치의 동 이름(경로가 없을 때 브리핑을 '○○동 일대'로 열어 준다 · s216). 이름 찾기는 카카오 좌표→행정구역(서버가 100m 격자로 모아 두고 나눠 쓴다) ──
    public String dong = "";                          // 알아낸 동 이름(없으면 "")
    public double[] dongLL = null;                    // 그 이름을 알아낸 위치
    /** 지금 위치(fix)에서 300m 안에서 알아낸 동 이름이면 그 이름, 아니면 "". */
    public String dongNow() {
        if (dong.length() == 0 || dongLL == null || fix == null) return "";
        return Math.abs(dongLL[0] - fix[0]) <= 0.003 && Math.abs(dongLL[1] - fix[1]) <= 0.003 ? dong : "";
    }
    public boolean setDong(String name, double la, double lo) {
        if (name == null || name.length() == 0) return false;
        boolean ch = !name.equals(dong); dong = name; dongLL = new double[] { la, lo };
        if (ch) rev++;
        return ch;
    }
    /** 서버에 동 이름을 묻는 주소: <서버>/kakao-local?path=geo/coord2regioncode.json&qs=x=<경도>&y=<위도> (좌표는 서버 캐시 격자와 같이 소수 3자리). */
    public static String dongUrl(String serverBase, double la, double lo) {
        String qs = "x=" + String.format(java.util.Locale.US, "%.3f", lo) + "&y=" + String.format(java.util.Locale.US, "%.3f", la);
        try { return serverBase + "/kakao-local?path=" + java.net.URLEncoder.encode("geo/coord2regioncode.json", "UTF-8") + "&qs=" + java.net.URLEncoder.encode(qs, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { return serverBase + "/kakao-local"; }
    }
    /** 좌표→행정구역 답에서 동 이름 하나: 행정동(H)의 3단계 이름 > 법정동(B)의 3단계 이름 > 아무 문서의 3단계 > 2단계(구·시) 이름. 못 읽으면 "". */
    @SuppressWarnings("unchecked")
    public static String parseDong(String body) {
        if (body == null || body.length() < 2) return "";
        try {
            Object o = ScreenCore.parse(body);
            if (!(o instanceof java.util.Map)) return "";
            Object d = ((java.util.Map<String, Object>) o).get("documents");
            if (!(d instanceof java.util.List)) return "";
            String h3 = "", b3 = "", any3 = "", any2 = "";
            for (Object x : (java.util.List<Object>) d) {
                if (!(x instanceof java.util.Map)) continue;
                java.util.Map<String, Object> m = (java.util.Map<String, Object>) x;
                String t = str(m.get("region_type")), r3 = str(m.get("region_3depth_name")), r2 = str(m.get("region_2depth_name"));
                if ("H".equals(t) && h3.length() == 0) h3 = r3;
                if ("B".equals(t) && b3.length() == 0) b3 = r3;
                if (any3.length() == 0) any3 = r3;
                if (any2.length() == 0) any2 = r2;
            }
            String r = h3.length() > 0 ? h3 : b3.length() > 0 ? b3 : any3.length() > 0 ? any3 : any2;
            return r.length() > 20 ? r.substring(0, 20) : r;
        } catch (Exception e) { return ""; }
    }
    private static String str(Object o) { return o instanceof String ? ((String) o).trim() : ""; }
    /** 저장: "위도,경도,이름". 다음에 앱을 켤 때 위치가 같은 곳이면 묻지 않고 바로 쓴다. */
    public static final String K_DONG = "hc_dong";
    public String dongSaved() { return dongLL == null || dong.length() == 0 ? "" : dongLL[0] + "," + dongLL[1] + "," + dong; }
    /** 저장된 값을 읽어 지금 위치(fix)와 300m 안일 때만 쓴다. */
    public void dongLoad(String raw) {
        try {
            if (raw == null || fix == null) return;
            String[] p = raw.split(",", 3);
            if (p.length < 3 || p[2].length() == 0) return;
            double la = Double.parseDouble(p[0]), lo = Double.parseDouble(p[1]);
            if (Math.abs(la - fix[0]) <= 0.003 && Math.abs(lo - fix[1]) <= 0.003) { dong = p[2]; dongLL = new double[] { la, lo }; rev++; }
        } catch (Exception ignored) { }
    }
    /** 자동 갱신 시각이 없거나 지났으면 새로 정한다. 정했으면 true. */
    public boolean ensureNext(long now) {
        if (aiNextAt > now) return false;
        aiNextAt = now + AI_EVERY_MS; aiRnd = rnd.nextDouble(); rev++;
        return true;
    }
    public void refreshAi(long now) { aiNextAt = now + AI_EVERY_MS; aiRnd = rnd.nextDouble(); rev++; }

    /** 엔진 POST /screen/hcards 본문. resultFacts 는 HomeCore.resultFacts() 값(경로가 없으면 "null"), talks 는 ChatCore.recentTalksJson() 값. */
    public String request(int cap, String theme, HomeCore.Env env, String resultFacts, String talks) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{\"now\":").append(env.nowMs).append(",\"tz\":").append(-env.tzoMin);
        b.append(",\"th\":").append(ShellCore.q("dark".equals(theme) ? "dark" : "pastel"));
        if (rideScene != null && rideScene.length() > 2) b.append(",\"rd\":").append(rideScene);
        if (share) b.append(",\"sh\":1");
        b.append(",\"gps\":").append(fix == null ? "null" : "[" + fix[0] + "," + fix[1] + "]");
        String dn = dongNow();
        if (dn.length() > 0) b.append(",\"dong\":").append(ShellCore.q(dn));
        b.append(",\"r\":").append(resultFacts == null || resultFacts.length() == 0 ? "null" : resultFacts);
        b.append(",\"ai\":{\"nextAt\":").append(aiNextAt).append(",\"busy\":").append(aiBusy).append(",\"rnd\":").append(aiRnd).append('}');
        b.append(",\"tk\":{\"m\":").append(talks == null || talks.length() == 0 ? "[]" : talks).append(",\"fold\":0,\"tzo\":").append(env.tzoMin).append("}}}");
        return b.toString();
    }
    /** 같은 카드면 엔진에 다시 묻지 않으려고 쓰는 열쇠(분 단위 시각 포함). */
    public String key(int resRev, String tab, long now, int talkN, String lastTalk) {
        return resRev + ":" + tab + ":" + (now / 60000) + ":" + rev + ":" + talkN + ":" + (lastTalk == null ? "" : lastTalk) + ":" + aiNextAt + ":" + (rideScene == null ? 0 : rideScene.hashCode()) + ":" + (share ? 1 : 0);
    }
    /** 눌림. tk.send 는 입력된 글(fields['talk.in'])을 받는다. */
    public int act(String v, String input) {
        if ("share.loc".equals(v)) return R_SHARE;
        if ("ai.refresh".equals(v)) return R_AI;
        if ("tk.open".equals(v)) return R_TALK_OPEN;
        if ("tk.send".equals(v)) {
            String t = input == null ? "" : input.trim();
            if (t.length() == 0) return R_NONE;
            sendText = t.length() > 100 ? t.substring(0, 100) : t;
            return R_TALK_SEND;
        }
        return R_NONE;
    }
}
