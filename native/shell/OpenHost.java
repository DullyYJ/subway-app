package com.dullyyj.subway;   // ★ 오프닝(켤 때 친구들 인사 2초)을 길동무 · 길동무 패밀리가 똑같이 쓰는 한 곳 — 대본(assets/open.json) · 시간대 · 날씨 · 친구 뽑기 · 그리기가 모두 이 한 갈래다

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.ViewGroup;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Calendar;

/**
 * 오프닝 띄우기. 계산(시간대 고르기 · 날씨 입히기 · 친구 셋 뽑기 · 움직임)은 엔진(OpenCore · 대본)이 하고 앱은 OpenView 로 그리기만 한다.
 * 길동무(ShellActivity)와 길동무 패밀리(MainActivity)가 둘 다 {@link #show(Activity)} 한 줄로 부른다 — 그래서 둘의 오프닝은 늘 같다.
 */
public final class OpenHost {
    private OpenHost() {}
    private static final String PREFS = "gdm_open", K_LAST = "last";
    private static OpenView cur;

    /** 화면 맨 위에 오프닝을 얹는다(실패해도 앱은 그대로 열린다). 주 스레드에서, setContentView 뒤에 부른다. */
    public static void show(Activity a) {
        try {
            OpenCore.Script sc; InputStream in = a.getAssets().open("open.json");
            try { ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); sc = OpenCore.parse(bo.toString("UTF-8")); } finally { in.close(); }
            if (sc == null) return;
            Calendar cal = Calendar.getInstance();
            double hour = cal.get(Calendar.HOUR_OF_DAY) + cal.get(Calendar.MINUTE) / 60.0;
            OpenCore.Slot sl = OpenCore.withWeather(sc, OpenCore.slotFor(sc, hour), OpenWx.read(a));          // 마지막으로 받은 날씨(6시간 안)를 배경에 입힌다 — 없으면 맑은 그림 그대로
            SharedPreferences sp = a.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String prev = ""; try { prev = sp.getString(K_LAST, ""); } catch (Throwable ignored) { }
            String[] ids = OpenCore.pickIds(sc, System.nanoTime() ^ cal.getTimeInMillis(), prev);          // 켤 때마다 친구 셋이 무작위로(방금 나온 조합은 피한다)
            try { sp.edit().putString(K_LAST, ids[0] + "," + ids[1] + "," + ids[2]).apply(); } catch (Throwable ignored) { }
            final OpenView v = new OpenView(a, sc, sl, OpenCore.cast(sc, sl, ids), new OpenView.Done() { @Override public void onDone() { close(); } });
            cur = v;
            a.addContentView(v, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        } catch (Throwable ignored) { cur = null; }
    }

    /** 오프닝이 떠 있으면 닫고 true(뒤로 가기가 오프닝만 닫게). */
    public static boolean back() {
        OpenView v = cur;
        if (v == null) return false;
        v.finish();
        return true;
    }

    /** 엔진 장면(/scene)의 답에서 날씨 종류(wk)를 적어 둔다 — 다음에 켤 때 오프닝 배경이 쓴다. 엔진이 알려 준 날씨(wxKnown)만. */
    public static void saveWx(Context c, String sceneJson) {
        try {
            if (c == null || sceneJson == null || sceneJson.length() < 20) return;
            JSONObject lk = new JSONObject(sceneJson).optJSONObject("look");
            if (lk != null && lk.optBoolean("wxKnown", false)) OpenWx.save(c, lk.optString("wk", ""));
        } catch (Throwable ignored) { }
    }

    private static void close() {
        OpenView v = cur; cur = null;
        if (v == null) return;
        try { ViewGroup pr = (ViewGroup) v.getParent(); if (pr != null) pr.removeView(v); } catch (Throwable ignored) { }
    }
}
