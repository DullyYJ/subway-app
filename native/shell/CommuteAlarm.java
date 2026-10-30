package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;

/**
 * 출퇴근 브리핑 알림 — 예약과 보내기 (2026-10-21 s104).
 *
 * ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
 *   언제 울릴지(요일 · 시각 · 앞으로 4주치)는 엔진 POST /commute-alarm(op:'occ'), 알림 제목·본문(날씨·혼잡도·추천·마무리 멘트)은 엔진 POST /commute-brief 가 정한다.
 *   여기는 받은 시각마다 알람을 걸고(앞 14번씩), 그 시각에 엔진 글을 받아 알림으로 띄운다. 알람이 울리면 다시 예약해 4주 창을 계속 민다(재부팅·앱 업데이트 뒤에도).
 *   정확한 알람 권한이 없는 기기(안드로이드 12+ 기본)는 "절전 중에도 실행되는 알람"으로 걸어 몇 분 늦을 수 있다.
 */
final class CommuteAlarm {
    static final String ACT_FIRE = "com.dullyyj.subway.COMMUTE_FIRE", EXTRA_KIND = "kind";
    static final String CH = "gdm_commute";
    static final int NOTI_ID = 7104, REQ_BASE = 9200, MAX_EACH = 14;
    private static final String K_OCC_FP = "cm_occ_fp", K_OCC_RESP = "cm_occ_resp";    // 마지막으로 받은 알람 시각 답(설정 지문과 함께)
    private static final String K_COUNT = "cm_sched_n";             // 지난번에 건 알람 수 "아침,저녁" — 다시 걸기 전에 지운다

    private CommuteAlarm() { }

    /** 저장소(앱과 같은 SharedPreferences)를 ShellCore.Store 로. */
    static ShellCore.Store store(Context c) {
        final SharedPreferences sp = c.getSharedPreferences(ShellActivity.PREFS, Context.MODE_PRIVATE);
        return new ShellCore.Store() {
            @Override public String get(String k, String d) { try { return sp.getString(k, d); } catch (Throwable t) { return d; } }
            @Override public void put(String k, String v) { try { sp.edit().putString(k, v).apply(); } catch (Throwable ignored) { } }
        };
    }

    private static PendingIntent pi(Context c, int req, String kind, boolean create) {
        Intent i = new Intent(c, CommuteReceiver.class).setAction(ACT_FIRE).putExtra(EXTRA_KIND, kind);
        int fl = PendingIntent.FLAG_IMMUTABLE | (create ? PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_NO_CREATE);
        return PendingIntent.getBroadcast(c, req, i, fl);
    }
    private static void cancelAll(Context c, AlarmManager am, ShellCore.Store st) {
        String[] n = st.get(K_COUNT, "0,0").split(",");
        for (int k = 0; k < 2; k++) {
            int cnt = 0;
            try { cnt = k < n.length ? Integer.parseInt(n[k].trim()) : 0; } catch (NumberFormatException e) { cnt = 0; }
            for (int i = 0; i < cnt && i < 60; i++) {
                PendingIntent p = pi(c, REQ_BASE + k * 100 + i, k == 0 ? "morn" : "eve", false);
                if (p != null) { am.cancel(p); p.cancel(); }
            }
        }
        st.put(K_COUNT, "0,0");
    }
    private static void set(Context c, AlarmManager am, long at, PendingIntent p) {
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        else if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        else am.setExact(AlarmManager.RTC_WAKEUP, at, p);
    }

    /** 설정에 맞게 알람을 다시 건다. 네트워크를 쓰므로 메인 스레드에서 부르지 않는다. */
    static void reschedule(Context c) {
        try {
            ShellCore.Store st = store(c);
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            cancelAll(c, am, st);
            if (!CmCore.on(st)) return;
            long now = System.currentTimeMillis();
            String fp = CmCore.occBody(st, 0L), resp = null;                   // 설정이 같은지 알아보는 지문(시각 부분만 0 으로)
            try {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/commute-alarm", CmCore.occBody(st, now), 8000);
                if (r.status == 200 && r.body != null && r.body.length() > 0) { resp = r.body; st.put(K_OCC_FP, fp); st.put(K_OCC_RESP, resp); }
            } catch (Throwable ignored) { }
            if (resp == null && fp.equals(st.get(K_OCC_FP, ""))) resp = st.get(K_OCC_RESP, "");          // s356: 못 받아도(재부팅 직후 네트워크 없음 등) 같은 설정의 마지막 답에서 앞으로 남은 시각으로 다시 건다 — 알람이 통째로 사라지지 않게
            if (resp == null || resp.length() == 0) return;       // 처음부터 못 받았으면 알람이 없는 채로 둔다 — 앱을 열 때·알람이 울릴 때 다시 시도
            long[] morn = CmCore.parseOcc(resp, "morn", MAX_EACH), eve = CmCore.parseOcc(resp, "eve", MAX_EACH);
            int nm = 0, ne = 0;
            for (int i = 0; i < morn.length; i++) if (morn[i] > now) { set(c, am, morn[i], pi(c, REQ_BASE + i, "morn", true)); nm++; }
            for (int i = 0; i < eve.length; i++) if (eve[i] > now) { set(c, am, eve[i], pi(c, REQ_BASE + 100 + i, "eve", true)); ne++; }
            st.put(K_COUNT, Math.max(nm, morn.length) + "," + Math.max(ne, eve.length));
        } catch (Throwable ignored) { }
    }
    static void rescheduleAsync(final Context c) {
        final Context app = c.getApplicationContext() != null ? c.getApplicationContext() : c;
        new Thread(new Runnable() { @Override public void run() { reschedule(app); } }, "cm-resched").start();
    }

    /** 엔진에서 브리핑 글을 받아 알림으로 띄운다. 켜짐 여부는 보지 않는다(예약은 켰을 때만 걸리고, 미리보기는 꺼져 있어도 보인다). @return 띄웠으면 true */
    static boolean send(Context c, String kind) {
        ShellCore.Store st = store(c);
        double[] gps = lastKnown(c);
        String body = CmCore.briefBody(st, kind, System.currentTimeMillis(), gps, true);
        String[] tb = null;
        for (int i = 0; i < 2 && tb == null; i++) {
            try {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/commute-brief", body, 10000);
                if (r.status == 200) tb = CmCore.parseBrief(r.body);
            } catch (Throwable ignored) { }
        }
        if (tb == null) tb = new String[] { "eve".equals(kind) ? "퇴근길 브리핑" : ("morn".equals(kind) ? "출근길 브리핑" : "출퇴근 브리핑"), "브리핑을 받지 못했어요. 앱에서 확인해 보세요", "eve".equals(kind) ? "eve" : "morn" };
        show(c, tb[2], tb[0], tb[1]);
        return true;
    }

    private static double[] lastKnown(Context c) {
        try {
            if (c.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
                && c.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) return null;
            LocationManager lm = (LocationManager) c.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return null;
            Location best = null;
            for (String p : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER }) {
                try { Location l = lm.getLastKnownLocation(p); if (l != null && (best == null || l.getTime() > best.getTime())) best = l; } catch (Throwable ignored) { }
            }
            return best == null ? null : new double[] { best.getLatitude(), best.getLongitude() };
        } catch (Throwable t) { return null; }
    }

    // ── s281: 알림을 누르면 앱 안 가운데 창으로 브리핑을 보여 주고 [출근하기]/[퇴근하기] 로 경로탐색까지 이어진다 ──
    static final String EXTRA_CB_KIND = "gdm_cb_kind", EXTRA_CB_TITLE = "gdm_cb_title", EXTRA_CB_BODY = "gdm_cb_body";
    private static volatile String[] pendingBrief;
    /** 앱이 알림을 눌러 열렸으면 { 출근/퇴근, 제목, 본문 } 을 적어 두고 인텐트에서 지운다(화면을 돌려도 다시 뜨지 않게). */
    static void captureBrief(Intent it) {
        try {
            if (it == null || !it.hasExtra(EXTRA_CB_KIND)) return;
            String k = it.getStringExtra(EXTRA_CB_KIND), t = it.getStringExtra(EXTRA_CB_TITLE), b = it.getStringExtra(EXTRA_CB_BODY);
            it.removeExtra(EXTRA_CB_KIND); it.removeExtra(EXTRA_CB_TITLE); it.removeExtra(EXTRA_CB_BODY);
            if (b == null || b.length() == 0) return;
            pendingBrief = new String[] { "eve".equals(k) ? "eve" : "morn", t == null ? "" : t, b };
        } catch (Throwable ignored) { }
    }
    static String[] takeBrief() { String[] b = pendingBrief; pendingBrief = null; return b; }

    private static void show(Context c, String kind, String title, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CH, "출퇴근 브리핑", NotificationManager.IMPORTANCE_DEFAULT));
        Intent i = new Intent(c, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_CB_KIND, kind).putExtra(EXTRA_CB_TITLE, title).putExtra(EXTRA_CB_BODY, text);
        PendingIntent p = PendingIntent.getActivity(c, "eve".equals(kind) ? 7711 : 7710, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(title).setContentText(text.indexOf('\n') > 0 ? text.substring(0, text.indexOf('\n')) : text)
            .setStyle(new Notification.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(p);
        try { b.addAction(android.R.drawable.ic_menu_directions, "eve".equals(kind) ? "퇴근하기" : "출근하기", WidgetCore.goIntent(c, "eve".equals(kind) ? "eve" : "morn")); } catch (Throwable ignored) { }          // 알림에서 바로 눌러도 앱이 열려 경로탐색
        nm.notify(NOTI_ID, b.build());
    }
}
