package com.dullyyj.subway;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * 홈 화면 위젯(탑승 현황) — 서비스가 엔진에게서 받은 상주 알림 글을 그대로 보여 준다(계산 없음). 누르면 앱이 열린다.
 * 레이아웃은 shell-android/app/src/main/res/layout/ride_widget.xml (제목 · 글 두 줄).
 */
public class RideWidget extends AppWidgetProvider {
    private static final String PREFS = "gdm_ride_widget";

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        paint(c, m, ids, sp.getString("t", "길동무"), sp.getString("x", "탑승 중이 아니에요"));
    }

    /** 서비스가 새 글을 받을 때마다 부른다. */
    static void update(Context c, String title, String text) {
        String t = (title == null || title.length() == 0) ? "길동무" : title, x = (text == null || text.length() == 0) ? "탑승 중이 아니에요" : text;
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("t", t).putString("x", x).apply();
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, RideWidget.class));
        if (ids != null && ids.length > 0) paint(c, m, ids, t, x);
    }

    /** 자원 번호(R 클래스 없이도 컴파일되게 이름으로 찾는다). */
    private static int rid(Context c, String type, String name) { return c.getResources().getIdentifier(name, type, c.getPackageName()); }

    private static void paint(Context c, AppWidgetManager m, int[] ids, String title, String text) {
        Intent i = new Intent(c, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 2, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        for (int id : ids) {
            int lay = rid(c, "layout", "ride_widget"), t = rid(c, "id", "ride_w_title"), x = rid(c, "id", "ride_w_text"), root = rid(c, "id", "ride_w_root");
            if (lay == 0) return;
            RemoteViews rv = new RemoteViews(c.getPackageName(), lay);
            rv.setTextViewText(t, title);
            rv.setTextViewText(x, text);
            rv.setOnClickPendingIntent(root, pi);
            m.updateAppWidget(id, rv);
        }
    }
}
