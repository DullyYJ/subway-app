package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 오프닝 배경용 '마지막으로 받은 날씨' 보관(2026-10-29 s299). 오프닝은 켜자마자 떠야 해서 네트워크를 기다리지 않는다 —
 * 앱이 엔진 장면(/scene)의 답을 받을 때마다 날씨 종류(wk: clear·cloudy·overcast·rain·snow·fog)를 여기 적어 두고, 다음에 켤 때 오프닝이 읽는다.
 * 날씨를 지어내지 않는다: 값이 없거나 오래됐으면(6시간) 빈 글을 돌려주고 오프닝은 맑은 그림 그대로 간다. 날씨별 색·효과는 대본(engine/open.js 의 wx)이 정한다.
 */
final class OpenWx {
    private OpenWx() {}
    private static final String PREFS = "gdm_open", K_WK = "wk", K_AT = "at";
    static final long MAX_AGE_MS = 6L * 3600_000L;

    static void save(Context c, String wk) {
        try {
            if (c == null || wk == null || wk.length() == 0) return;
            c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(K_WK, wk).putLong(K_AT, System.currentTimeMillis()).apply();
        } catch (Throwable ignored) { }
    }
    /** 6시간 안에 받은 날씨 종류. 없거나 오래됐으면 "". */
    static String read(Context c) {
        try {
            SharedPreferences sp = c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            long at = sp.getLong(K_AT, 0L), age = System.currentTimeMillis() - at;
            if (at <= 0L || age < 0L || age > MAX_AGE_MS) return "";
            String wk = sp.getString(K_WK, ""); return wk == null ? "" : wk;
        } catch (Throwable t) { return ""; }
    }
}
