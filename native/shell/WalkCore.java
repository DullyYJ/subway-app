package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.List;
import java.util.Map;

/**
 * 도보 안내 시트의 순수 자바 상태 — 2026-10-21 (s129). 웹 walkModal(openWalkModal · _walkRefresh · openKakaoNav · openNaverNav)의 앱 쪽 몫.
 * ★ 원칙: 거리 · 도보 시간 · 기준 시각 · 길안내 주소 · 문구는 전부 엔진(POST /screen/dlg, kind:'walk')이 정한다. 여기는 사실(내 위치 ·
 *   목적지 · 지금 시각)을 담아 보내고, 받은 화면에서 길안내 주소 · 다시 받는 간격만 꺼내 두고, 눌림을 행동 코드로 바꾼다. 안드로이드 · 통신 · 시계를 부르지 않는다.
 */
public final class WalkCore {
    public static final int W_NONE = 0, W_CLOSE = 1, W_KAKAO = 2, W_NAVER = 3;
    public static final long REFRESH_MIN_MS = 10000L, REFRESH_MAX_MS = 120000L, REFRESH_DEF_MS = 30000L;

    public String mode = "arrive", destName = "";
    public double destLat, destLng, myLat, myLng;
    public boolean hasDest, hasMe;
    public String[] navKakao = null, navNaver = null;
    public String msg = "";
    public long refreshMs = REFRESH_DEF_MS;

    /** 시트를 열 때: 어디까지 걷나(좌표가 없으면 hasDest=false — 엔진이 '목적지 좌표를 찾을 수 없습니다'를 돌려준다). */
    public void open(String mode, String name, double lat, double lng) {
        this.mode = "start".equals(mode) || "manual".equals(mode) ? mode : "arrive";
        destName = name == null ? "" : name;
        hasDest = lat != 0 && lng != 0; destLat = lat; destLng = lng;
        hasMe = false; navKakao = null; navNaver = null; msg = ""; refreshMs = REFRESH_DEF_MS;
    }
    /** 새로 받은 내 위치(못 받으면 이 시트에서 앞서 받은 값을 그대로 둔다 — 옛 위치는 기기에서 꺼내 쓰지 않는다). */
    public void setMe(double lat, double lng) { if (lat != 0 || lng != 0) { myLat = lat; myLng = lng; hasMe = true; } }

    /** 엔진 POST /screen/dlg 본문. */
    public String request(int cap, long nowMs, int tzoMin, String theme) {
        StringBuilder b = new StringBuilder();
        b.append("{\"cap\":").append(cap).append(",\"f\":{\"kind\":\"walk\",\"walk\":{\"mode\":").append(ShellCore.q(mode));
        if (hasMe) b.append(",\"my\":{\"lat\":").append(HomeCore.num(myLat)).append(",\"lng\":").append(HomeCore.num(myLng)).append('}');
        b.append(",\"dest\":{\"name\":").append(ShellCore.q(destName));
        if (hasDest) b.append(",\"lat\":").append(HomeCore.num(destLat)).append(",\"lng\":").append(HomeCore.num(destLng));
        b.append("},\"nowMs\":").append(nowMs).append(",\"tzoMin\":").append(tzoMin).append(",\"theme\":").append(ShellCore.q("light".equals(theme) ? "light" : "dark")).append("}}}");
        return b.toString();
    }

    /** 받은 화면에서 길안내 주소 · 안내 글 · 다시 받는 간격을 꺼내 둔다. */
    @SuppressWarnings("unchecked")
    public void onScreen(String json) {
        navKakao = null; navNaver = null; msg = ""; refreshMs = REFRESH_DEF_MS;
        try {
            Object o = ScreenCore.parse(json);
            Object info = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            if (!(info instanceof Map)) return;
            Map<String, Object> im = (Map<String, Object>) info;
            Object nav = im.get("nav");
            if (nav instanceof Map) { navKakao = pair(((Map<String, Object>) nav).get("kakao")); navNaver = pair(((Map<String, Object>) nav).get("naver")); }
            if (im.get("msg") instanceof String) msg = (String) im.get("msg");
            if (im.get("refresh") instanceof Double) {
                long r = ((Double) im.get("refresh")).longValue();
                refreshMs = Math.max(REFRESH_MIN_MS, Math.min(REFRESH_MAX_MS, r));
            }
        } catch (Exception e) { navKakao = null; navNaver = null; msg = ""; }
    }
    private static String[] pair(Object o) {
        if (!(o instanceof List) || ((List<Object>) o).size() != 2) return null;
        Object a = ((List<Object>) o).get(0), b = ((List<Object>) o).get(1);
        return (a instanceof String && b instanceof String) ? new String[] { (String) a, (String) b } : null;
    }

    /** 시트의 눌림(wk.*). */
    public int act(String v) {
        if ("wk.close".equals(v)) return W_CLOSE;
        if ("wk.kakao".equals(v)) return W_KAKAO;
        if ("wk.naver".equals(v)) return W_NAVER;
        return W_NONE;
    }
}
