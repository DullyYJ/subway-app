package com.dullyyj.subway;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;

/**
 * 경로 이동 중 프로세스를 살려 두는 포그라운드 서비스 + '대기 모드' (2026-10-13).
 *
 * ── 1) 프로세스 유지 (YJ: "경로 이동 중 앱이 죽는 예외를 다 막아야 해")
 *   위치 플러그인(BackgroundGeolocationService)의 포그라운드 서비스는 '앱이 화면에서 사라질 때' 뒤늦게 켜지고 시작이 막히면 보호가 없다.
 *   이 서비스는 경로를 확정해 여정이 시작되는 순간(앱이 화면에 있을 때) OverlayPlugin.keepAlive(on:true) 가 먼저 켜 둔다 — 두 겹으로 지킨다.
 *   foregroundServiceType=location(Android 14) · 알림은 최소 중요도.
 *
 * ── 2) 대기 모드 (YJ: "카카오지하철처럼 안내 로직을 네이티브로")
 *   앱을 최근 목록에서 밀어 닫으면 웹뷰(JS)가 사라져 안내가 멈췄다. 웹뷰가 살아 있는 동안 JS 가 '여정 상태'를 savePacket 으로 맡겨 두고,
 *   액티비티가 사라지면(OverlayPlugin.handleOnDestroy) 이 서비스가 ACTIVATE 로 이어받는다:
 *     · 위치(GPS·네트워크)를 직접 모으고, 5초마다 엔진(/ride-standby)에 {nowMs, fixes, state} 를 보낸다.
 *     · 엔진이 영점·도착 시각 밀고 당기기·하차 알림 판정을 모두 한다. 이 서비스는 state 를 해석하지 않고 그대로 들고 있다가 다음 호출에 보낸다.
 *     · 받은 값을 그리기만 한다: 상주 알림 문구(ongoing.text) · 하차/환승 알림(alert) · 끝내기(done).
 *   → 계산은 엔진, 그림은 앱(네이티브)이라는 원칙 그대로다. 1단계는 지하철 탑승 확정(시각표 기준) 여정만 맡는다.
 *
 * START_STICKY: 시스템이 메모리 때문에 프로세스를 죽여도 서비스가 되살아나면(intent==null) 저장된 마지막 상태(30분 안)로 웹 없이 대기 모드를 이어간다(되살아난 프로세스에는 오버레이 창을 그릴 화면 컨텍스트가 없어 알림·하차 알림만 이어진다).
 * 여정이 끝나거나(JS standbyEnd) 알림의 [안내 종료]를 누르거나 엔진이 done 을 주면 끝낸다.
 */
public class KeepAliveService extends Service {
    static final String CHANNEL = "gdm_keepalive";
    static final String CHANNEL_ALERT = "gdm_alert";
    static final int NOTI_ID = 7001;
    static final String ACT_ACTIVATE = "gdm.standby.ACTIVATE";
    static final String ACT_DEACTIVATE = "gdm.standby.DEACTIVATE";
    static final String ACT_STOP = "gdm.standby.STOP";
    private static final String PREFS = "gdm_standby";
    private static final long STEP_MS = 5000L;
    private static final long STEP_MIN_MS = 2000L, STEP_MAX_MS = 8000L;   // 엔진이 알려 주는 다음 호출 간격(nextMs)의 안전 범위
    private static final long PACKET_MAX_AGE_MS = 30 * 60 * 1000L;   // 이보다 오래 갱신 안 된 상태는 쓰지 않는다(웹뷰가 오래전에 멈춘 여정)

    /** 대기 모드가 돌고 있는가 — OverlayPlugin 이 읽는다(웹이 다시 켜져도 keepAlive(off) 로 끄지 않게). */
    static volatile boolean standbyActive = false;
    /** ★ 2026-10-19 (숨김 인계): 앱이 아직 살아 있는데 화면에서 가려져 이 서비스가 안내를 이어받았다. 웹이 돌려받을 때까지 웹이 맡기는 상태(savePacket)로 덮지 않는다. */
    static volatile boolean handoff = false;
    /** 서비스가 엔진에서 받아 쥐고 있는 가장 새 상태(JSON 글자) — 웹이 돌려받을 때 읽는다(SharedPreferences 에 적는 것보다 늘 새것). */
    static volatile String liveState = null;
    static volatile long liveAt = 0L;
    /** 인계 중 엔진이 끝(done)을 알렸다 — 웹이 돌려받을 때 알 수 있게. */
    static volatile boolean liveDone = false;

    // ── 웹이 맡겨 두는 상태 (SharedPreferences) ──
    static void savePacket(Context c, String state, String url) {
        if (standbyActive && handoff) return;   // 인계 중에는 서비스가 쥔 상태가 더 새것이다 — 웹의 낡은 값으로 덮지 않는다
        try { c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("state", state).putString("url", url).putLong("at", System.currentTimeMillis()).apply(); } catch (Throwable ignored) { }
    }
    static boolean hasPacket(Context c) {
        try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, MODE_PRIVATE);
            return sp.getString("state", null) != null && sp.getString("url", null) != null && System.currentTimeMillis() - sp.getLong("at", 0L) < PACKET_MAX_AGE_MS;
        } catch (Throwable e) { return false; }
    }
    /** 다시 열린 앱이 읽는 대기 모드 상태: 돌고 있는가 + 엔진이 마지막으로 만든 문구(view). */
    static String standbyViewJson(Context c) {
        try {
            JSONObject r = new JSONObject();
            r.put("active", standbyActive);
            String v = c.getSharedPreferences(PREFS, MODE_PRIVATE).getString("view", null);
            if (v != null) r.put("view", new JSONObject(v));
            String ovs = c.getSharedPreferences(PREFS, MODE_PRIVATE).getString("overlay", null);
            if (ovs != null) r.put("overlay", new JSONObject(ovs));
            return r.toString();
        } catch (Throwable e) { return "{\"active\":false}"; }
    }
    /** 웹이 돌려받을 때 읽는 값: 서비스가 쥔 가장 새 상태와 엔진이 만든 마지막 문구. 상태가 없으면 state 는 빠진다. */
    static String standbyTakeJson(Context c) {
        try {
            JSONObject r = new JSONObject(standbyViewJson(c));
            String st = liveState;
            if (st == null) { try { st = c.getSharedPreferences(PREFS, MODE_PRIVATE).getString("state", null); } catch (Throwable ignored) { } }
            if (st != null) r.put("state", new JSONObject(st));
            r.put("at", liveAt);
            r.put("done", liveDone);
            return r.toString();
        } catch (Throwable e) { return "{\"active\":false}"; }
    }
    static void clearPacket(Context c) {
        try { c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply(); } catch (Throwable ignored) { }
    }
    static void send(Context c, String action) {
        try {
            Intent i = new Intent(c, KeepAliveService.class);
            if (action != null) i.setAction(action);
            // 이미 포그라운드로 돌고 있는 서비스에 보내는 명령이라 startService 로 충분하다(백그라운드에서 startForegroundService 는 Android 12+ 에서 막힌다).
            c.startService(i);
        } catch (Throwable ignored) { }
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String act = intent == null ? null : intent.getAction();
        if (ACT_STOP.equals(act)) {
            endStandby(true);
            return START_NOT_STICKY;
        }
        // ★ 2026-10-13 (YJ: "한계를 우회해줘, 카카오처럼"): 시스템이 메모리 때문에 프로세스를 죽였다가 서비스를 되살리면 intent 가 null 로 온다.
        //   그때 맡겨 둔 여정 상태(30분 안에 갱신된 것)가 있으면 웹 없이 대기 모드로 곧장 이어간다. 명시적 종료(stopService/stopSelf)는 되살리지 않는다.
        if (intent == null) {
            showForeground("앱이 닫혀 있어도 안내를 이어가요");
            if (hasPacket(this)) startStandby(); else { try { stopForeground(true); } catch (Throwable ignored) { } stopSelf(); return START_NOT_STICKY; }
            return START_STICKY;
        }
        showForeground(standbyActive ? "앱이 닫혀 있어도 안내를 이어가요" : "화면을 꺼도 안내가 이어져요");
        if (ACT_ACTIVATE.equals(act)) startStandby();
        else if (ACT_DEACTIVATE.equals(act)) stopStandbyLoop();
        return START_STICKY;
    }

    @Override public void onDestroy() {
        stopStandbyLoop();
        try { stopForeground(true); } catch (Throwable ignored) { }
        super.onDestroy();
    }

    // ── 알림 ──
    private Notification buildNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "경로 안내 유지", NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            nm.createNotificationChannel(ch);
        }
        PendingIntent pi = null;
        try {
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (open != null) {
                open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                pi = PendingIntent.getActivity(this, 0, open,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            }
        } catch (Throwable ignored) { }
        int icon = getResources().getIdentifier("ic_stat_subway", "drawable", getPackageName());
        if (icon == 0) icon = android.R.drawable.ic_menu_mylocation;
        Notification.Builder b = (Build.VERSION.SDK_INT >= 26) ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setContentTitle("길동무 경로 안내 중")
                .setContentText(text == null || text.length() == 0 ? "화면을 꺼도 안내가 이어져요" : text)
                .setSmallIcon(icon)
                .setOngoing(true)
                .setShowWhen(false);
        if (pi != null) b.setContentIntent(pi);
        if (standbyActive) {
            try {
                Intent stop = new Intent(this, KeepAliveService.class).setAction(ACT_STOP);
                PendingIntent sp = PendingIntent.getService(this, 1, stop,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
                b.addAction(android.R.drawable.ic_menu_close_clear_cancel, "안내 종료", sp);
            } catch (Throwable ignored) { }
        }
        return b.build();
    }

    private void showForeground(String text) {
        try {
            Notification n = buildNotification(text);
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTI_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTI_ID, n);
        } catch (Throwable e) {
            // 알림·포그라운드 승격이 거부되면(권한·정책) 서비스만 조용히 끝낸다 — 앱은 영향 없다.
            try { stopSelf(); } catch (Throwable ignored) { }
        }
    }

    private String lastText = "";
    private void updateNotification(String text) {
        try {
            if (text == null) return;
            if (text.equals(lastText)) return;
            lastText = text;
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTI_ID, buildNotification(text));
        } catch (Throwable ignored) { }
    }

    /** 엔진이 정한 알림 하나를 그린다(문구·진동 모두 엔진이 준 값). */
    private void fireAlert(JSONObject al) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            long[] vib = new long[]{0, 300, 100, 300, 100, 300};
            JSONArray va = al.optJSONArray("vib");
            if (va != null && va.length() > 0) {
                vib = new long[va.length() + 1];
                for (int i = 0; i < va.length(); i++) vib[i + 1] = va.optLong(i, 200L);
            }
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(CHANNEL_ALERT, "경로 안내 알림", NotificationManager.IMPORTANCE_HIGH);
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 300, 100, 300, 100, 300});
                nm.createNotificationChannel(ch);
            }
            PendingIntent pi = null;
            try {
                Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (open != null) pi = PendingIntent.getActivity(this, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            } catch (Throwable ignored) { }
            int icon = getResources().getIdentifier("ic_stat_subway", "drawable", getPackageName());
            if (icon == 0) icon = android.R.drawable.ic_menu_mylocation;
            Notification.Builder b = (Build.VERSION.SDK_INT >= 26) ? new Notification.Builder(this, CHANNEL_ALERT) : new Notification.Builder(this);
            b.setContentTitle(al.optString("title", "길동무"))
                    .setContentText(al.optString("body", ""))
                    .setStyle(new Notification.BigTextStyle().bigText(al.optString("body", "")))
                    .setSmallIcon(icon)
                    .setAutoCancel(true)
                    .setVibrate(vib);
            if (pi != null) b.setContentIntent(pi);
            nm.notify(9000 + (al.optString("key", "").hashCode() & 0x3ff), b.build());
        } catch (Throwable ignored) { }
    }

    // ── 대기 모드 ──
    private HandlerThread ht;
    private Handler hh;
    private LocationManager lm;
    private PowerManager.WakeLock lock;
    private String state, url;
    private int fails = 0;
    private volatile long nextDelayMs = STEP_MS;   // 엔진이 정한 다음 호출까지의 간격(영점이 도착 5초 안에 잡히도록 도착 앞뒤엔 짧다). 계산은 엔진, 여기서는 따르기만 한다.
    private final ArrayList<double[]> fixes = new ArrayList<double[]>();   // {ts, lat, lng, acc(0=모름)}

    private final LocationListener ll = new LocationListener() {
        @Override public void onLocationChanged(Location l) {
            if (l == null) return;
            synchronized (fixes) {
                fixes.add(new double[]{System.currentTimeMillis(), l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : 0});
                while (fixes.size() > 120) fixes.remove(0);
            }
        }
        @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
        @Override public void onProviderEnabled(String provider) { }
        @Override public void onProviderDisabled(String provider) { }
    };

    private final Runnable stepRunnable = new Runnable() {
        @Override public void run() {
            if (!standbyActive) return;
            try { step(); } catch (Throwable e) { fails++; }
            if (standbyActive && hh != null) hh.postDelayed(this, nextDelayMs);
        }
    };

    private void startStandby() {
        if (standbyActive) return;
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        state = sp.getString("state", null);
        url = sp.getString("url", null);
        if (state == null || url == null) { endStandby(true); return; }
        standbyActive = true;
        fails = 0;
        nextDelayMs = STEP_MS;
        liveState = state; liveAt = System.currentTimeMillis(); liveDone = false;
        ht = new HandlerThread("gdm-standby");
        ht.start();
        hh = new Handler(ht.getLooper());
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) { lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gildongmu:standby"); lock.setReferenceCounted(false); }
        } catch (Throwable ignored) { }
        try {
            lm = (LocationManager) getSystemService(LOCATION_SERVICE);
            if (lm != null) {
                try { if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 3000L, 0f, ll, hh.getLooper()); } catch (SecurityException ignored) { }
                try { if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 0f, ll, hh.getLooper()); } catch (SecurityException ignored) { }
            }
        } catch (Throwable ignored) { }
        showForeground("앱이 닫혀 있어도 안내를 이어가요");   // [안내 종료] 단추가 붙은 알림으로 바꾼다
        hh.postDelayed(stepRunnable, 1000L);
    }

    /** 웹이 다시 살아나 주도권을 되찾았다 — 대기 모드 루프만 멈춘다(프로세스 유지는 계속). */
    private void stopStandbyLoop() {
        boolean was = standbyActive;
        standbyActive = false;
        try { if (lm != null) lm.removeUpdates(ll); } catch (Throwable ignored) { }
        lm = null;
        try { if (hh != null) hh.removeCallbacksAndMessages(null); } catch (Throwable ignored) { }
        try { if (ht != null) ht.quitSafely(); } catch (Throwable ignored) { }
        ht = null; hh = null;
        try { if (lock != null && lock.isHeld()) lock.release(); } catch (Throwable ignored) { }
        lock = null;
        if (was) { lastText = ""; showForegroundQuiet(); OverlayPlugin.standbyHide(); }
    }

    private void showForegroundQuiet() {
        try { NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE); if (nm != null) nm.notify(NOTI_ID, buildNotification("화면을 꺼도 안내가 이어져요")); } catch (Throwable ignored) { }
    }

    private void endStandby(boolean stopService) {
        stopStandbyLoop();
        clearPacket(this);
        if (stopService) {
            try { stopForeground(true); } catch (Throwable ignored) { }
            try { stopSelf(); } catch (Throwable ignored) { }
        }
    }

    /** 5초마다: 새 위치를 모아 엔진에 보내고, 받은 문구·알림을 그린다. 판정은 전부 엔진이 한다. */
    private void step() throws Exception {
        if (lock != null) { try { lock.acquire(30 * 1000L); } catch (Throwable ignored) { } }
        long now = System.currentTimeMillis();
        ArrayList<double[]> batch;
        synchronized (fixes) { batch = new ArrayList<double[]>(fixes); }
        StringBuilder fx = new StringBuilder("[");
        for (int i = 0; i < batch.size(); i++) {
            double[] f = batch.get(i);
            if (i > 0) fx.append(',');
            fx.append('[').append((long) f[0]).append(',').append(f[1]).append(',').append(f[2]).append(',').append(f[3] > 0 ? String.valueOf((long) Math.round(f[3])) : "null").append(']');
        }
        fx.append(']');
        String body = "{\"nowMs\":" + now + ",\"fixes\":" + fx + ",\"state\":" + state + "}";
        String resp;
        if (gzipOk) {
            try { resp = post(url, body, true); }
            catch (Exception ez) {
                // 서버가 압축 요청을 못 읽는 옛 버전이면(HTTP 400) 평문으로 돌아가 이 서비스가 도는 동안은 압축을 쓰지 않는다
                if (String.valueOf(ez.getMessage()).contains("HTTP 400")) { gzipOk = false; resp = post(url, body, false); } else throw ez;
            }
        } else resp = post(url, body, false);
        if (!standbyActive) return;   // 응답을 기다리는 사이 웹이 안내를 돌려받았다 — 낡은 응답으로 알림·오버레이를 건드리지 않는다(웹이 받아 간 상태와 어긋난 알림이 나가지 않게)
        // 보낸 위치만 비운다(그 사이 들어온 새 위치는 남긴다)
        synchronized (fixes) { for (int i = 0; i < batch.size() && !fixes.isEmpty(); i++) fixes.remove(0); }
        JSONObject o = new JSONObject(resp);
        if (o.has("error")) { fails++; if (o.optBoolean("done", false)) endStandby(true); return; }
        fails = 0;
        long nm = o.optLong("nextMs", 0L);
        nextDelayMs = (nm >= STEP_MIN_MS && nm <= STEP_MAX_MS) ? nm : STEP_MS;
        JSONObject ns = o.optJSONObject("state");
        if (ns != null) {
            state = ns.toString();
            liveState = state; liveAt = System.currentTimeMillis();
            try { getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("state", state).putLong("at", System.currentTimeMillis()).apply(); } catch (Throwable ignored) { }
        }
        JSONObject on = o.optJSONObject("ongoing");
        if (on != null) updateNotification(on.optString("text", ""));
        // 오버레이: 엔진이 만든 값을 쥐고 있는 오버레이 창에 그린다(없으면 아무 일도 안 한다). 다시 열린 앱이 보여 줄 마지막 상태(view)도 적어 둔다.
        JSONObject ov = o.optJSONObject("overlay");
        if (ov != null) {
            OverlayPlugin.standbyPush(ov);
            try { getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("overlay", ov.toString()).apply(); } catch (Throwable ignored) { }   // 다시 열린 앱이 전체 화면을 그리는 재료(엔진이 만든 값 그대로)
        }
        JSONObject vw = o.optJSONObject("view");
        if (vw != null) { try { getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("view", vw.toString()).apply(); } catch (Throwable ignored) { } }
        JSONObject al = o.optJSONObject("alert");
        if (al != null && !al.optString("title", "").isEmpty()) fireAlert(al);
        if (o.optBoolean("done", false)) { liveDone = true; endStandby(true); }
    }

    private static volatile boolean gzipOk = true;   // 요청 본문을 gzip 으로 눌러 보낸다(상태가 크고 5초마다 보내서 — 서버 s12 부터 받는다)

    private static String post(String u, String body, boolean gz) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        try {
            c.setConnectTimeout(6000);
            c.setReadTimeout(8000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("content-type", "application/json");
            byte[] bytes = body.getBytes("UTF-8");
            if (gz && bytes.length > 2048) {
                ByteArrayOutputStream bz = new ByteArrayOutputStream();
                java.util.zip.GZIPOutputStream zo = new java.util.zip.GZIPOutputStream(bz);
                zo.write(bytes);
                zo.close();
                bytes = bz.toByteArray();
                c.setRequestProperty("content-encoding", "gzip");
            }
            c.setFixedLengthStreamingMode(bytes.length);
            OutputStream os = c.getOutputStream();
            os.write(bytes);
            os.close();
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            InputStream is = c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            is.close();
            return bo.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }
}
