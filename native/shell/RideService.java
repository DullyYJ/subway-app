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
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * 탑승 추적 포그라운드 서비스 (2026-10-20 s94) — 앱 화면이 가려지거나 닫혀도 안내가 이어진다.
 *
 * ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다." 이 서비스는 위치를 모아 5초마다 폰 안의 엔진(RideLocal — 서버 엔진의 자바 포팅, 서버 요청 0)에 넣고,
 *   돌려받은 상주 알림 글 · 울릴 알림 · 끝내기를 그리기만 한다. state 는 해석하지 않는다(RideCore 가 그대로 들고 있는다).
 * 시작은 ShellActivity 가 RideCore 를 만들어 SharedPreferences 에 저장한 뒤 start() 로 부른다. START_STICKY 로 되살아나면 저장본(30분 안)으로 이어간다.
 * foregroundServiceType=location (Android 14). 위치 권한은 앱이 화면에 있을 때 이미 받아 둔다.
 */
public class RideService extends Service {
    static final String CH_RIDE = "gdm_ride", CH_ALERT = "gdm_ride_alert";
    static final int NOTI_ID = 7101, ALERT_ID = 7102;
    static final String ACT_START = "gdm.ride.START", ACT_STOP = "gdm.ride.STOP";
    static final String PREFS = "gdm_ride", KEY_SAVED = "saved";

    /** 서비스가 돌고 있나, 그리고 앱 화면이 읽는 가장 새 값(같은 프로세스). */
    static volatile boolean running = false;
    static volatile int liveRev = 0;
    static volatile String liveRowSlot = ""; static volatile boolean liveRowCan;
    static volatile String liveRide = "", liveLv = "", liveScene = "", liveReco = "", recoStage = "";
    static volatile ShareCore.Share liveShare;
    static volatile OvCore.Ov liveOv;                        // 앱 탑승 시트(RsSheetView)가 그릴 엔진 값(overlay.rs 포함)
    static volatile Runnable rsListener;                     // 값이 바뀔 때 메인 스레드에서 불린다(ShellActivity 가 화면에 있을 때만 건다)
    private static volatile RideService inst;
    private static final Handler mainH = new Handler(Looper.getMainLooper());
    /** 앱 탑승 시트의 손짓(press · undo · open · close · pill)을 엔진의 다음 걸음에 알린다 — 오버레이 줄과 같은 길. */
    static void rsAct(String a) { RideService s = inst; if (s != null) s.ovHost.act(a); }
    static void rsNotify() { Runnable l = rsListener; if (l != null) mainH.post(l); }
    static volatile long recoStageAt = 0L;

    private HandlerThread ht;
    private Handler h;
    private RideCore core;
    private LocationManager lm;
    private LocFused fusedLoc;
    private RideOverlay ov;
    private boolean listening = false, stepping = false;
    private volatile boolean stopped = false;

    private final LocationListener ll = new LocationListener() {
        @Override public void onLocationChanged(Location l) { feed(l); }
        @Override public void onStatusChanged(String p, int s, Bundle e) { }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
    };

    /** 새 위치 한 점을 엔진 입력(RideCore)에 넣는다 — Fused · LocationManager 어느 쪽에서 와도 같다. */
    private void feed(Location l) {
        if (core != null && l != null) core.addFix(l.getTime() > 0 ? l.getTime() : System.currentTimeMillis(), l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : 0f);
    }

    // ── 밖에서 부르는 곳 ──
    static void save(Context c, RideCore core) {
        try { c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_SAVED, core.save(System.currentTimeMillis())).apply(); } catch (Throwable ignored) { }
    }
    static void clearSaved(Context c) { try { c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_SAVED).apply(); } catch (Throwable ignored) { } }
    static void start(Context c) {
        Intent i = new Intent(c, RideService.class).setAction(ACT_START);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static void stop(Context c) {
        clearSaved(c);
        running = false; liveRide = ""; liveRowSlot = ""; liveRowCan = false; liveLv = ""; liveScene = ""; liveReco = ""; liveShare = null; liveOv = null; liveRev++; rsNotify();
        c.stopService(new Intent(c, RideService.class));
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        ErrLog.install(this);
        String act = intent == null ? null : intent.getAction();
        if (ACT_STOP.equals(act)) { finishRide(false); return START_NOT_STICKY; }
        RideCore restored = RideCore.restore(getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_SAVED, ""), System.currentTimeMillis());
        if (restored == null) {                                   // 저장본이 없거나 너무 낡았다 — 더 이어갈 안내가 없다
            if (Build.VERSION.SDK_INT >= 26) { ensureChannels(); startFg(baseNotification("길동무", "")); }
            stopSelf(); return START_NOT_STICKY;
        }
        if (core == null) core = restored;
        inst = this;
        ensureChannels();
        startFg(ongoing());
        if (!running) {
            running = true; stopped = false;
            ht = new HandlerThread("gdm-ride"); ht.start();
            h = new Handler(ht.getLooper());
            listen();
            publish();
            h.postDelayed(stepRunnable, 1500);
        }
        return START_STICKY;
    }

    @Override public void onDestroy() {
        stopped = true; running = false;
        if (ov != null) ov.hide();
        try { if (fusedLoc != null) fusedLoc.stopRide(); } catch (Throwable ignored) { }
        try { if (lm != null && listening) lm.removeUpdates(ll); } catch (Throwable ignored) { }
        listening = false;
        if (inst == this) inst = null;
        if (h != null) h.removeCallbacksAndMessages(null);
        if (ht != null) ht.quitSafely();
        super.onDestroy();
    }

    // ── 위치 ──
    private void listen() {
        try {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
            final android.os.Looper lp = ht.getLooper();
            fusedLoc = new LocFused(this);
            listening = true;
            fusedLoc.ride(lp, new LocFused.Cb() {                       // ① Fused 고정밀 1초(서비스 스레드로 도착) — 가장 정확하고 빠른 길
                @Override public void fix(Location l) { feed(l); }
                @Override public void fail() { if (!stopped) listenLm(lp); }     // ② Play 서비스가 없거나 실패 → GPS + 네트워크
            });
        } catch (Throwable ignored) { }
    }
    private void listenLm(android.os.Looper lp) {
        try {
            lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, ll, lp);
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000L, 0f, ll, lp);
        } catch (Throwable ignored) { }
    }

    // ── 5초마다 엔진 ──
    private final Runnable stepRunnable = new Runnable() {
        @Override public void run() {
            if (stopped || core == null) return;
            if (stepping) { h.postDelayed(this, 1000); return; }
            stepping = true;
            long delay = RideCore.STEP_DEFAULT_MS;
            try {
                // ★ 탑승이 확정된 뒤에는 외부 서버 요청 0 — 5초 걸음은 폰 안의 엔진(RideLocal)이 계산한다. 서버는 [탑승]을 눌러 열차를 가릴 때 시각표 한 번뿐.
                String body = core.stepBody(System.currentTimeMillis()), resp = null;
                if (RideLocal.needsTable(body)) {
                    try { NetPost.Res r = NetPost.post(ShellCore.BASE + "/ride-standby", body, 5000); if (r.status == 200) resp = r.body; } catch (Throwable ignored) { }
                }
                if (resp == null) resp = RideLocal.step(body);
                if (resp != null) {
                    RideCore.Step s = core.onStep(resp);
                    if (s.ok) {
                        prefetchReco(body, resp);
                        save(RideService.this, core);
                        if (s.alert) fireAlert(s);
                        if (s.recoBody.length() > 0) fireReco(s.recoBody);
                        publish();
                        updateOngoing();
                        updateOverlay();
                        if (s.done) { stepping = false; boolean q = core.quit; finishRide(true); if (q) ShellActivity.quitAll(); return; }
                        delay = core.nextMs;
                    }
                }
            } catch (Throwable ignored) { }
            stepping = false;
            if (!stopped) h.postDelayed(this, delay);
        }
    };

    /** 오버레이 손짓 → 엔진에 다음 걸음으로 알리거나(탑승 줄 · 추천 닫기) 곧바로 처리(보기 · 종료). 오버레이 클릭은 메인 스레드, 엔진 호출은 서비스 스레드. */
    private final RideOverlay.Host ovHost = new RideOverlay.Host() {
        @Override public void act(String a) {
            if (core == null) return;
            core.queueAct(a);
            if (h != null) { h.removeCallbacks(stepRunnable); h.post(stepRunnable); }             // 5초를 기다리지 않고 바로 한 걸음
        }
        @Override public void recoGo(OvCore.Row r) {
            if (core != null) core.dismissReco(r.at);
            RecoGo.open(RideService.this, core == null ? null : core.lastRecoAd(), core == null ? null : core.recoLoc, r);
        }
        @Override public void recoOk(long at) { if (core != null) core.dismissReco(at); if (h != null) h.post(new Runnable() { @Override public void run() { updateOverlay(); } }); }
        @Override public void quitApp() { finishRide(false); ShellActivity.quitAll(); }
        @Override public void endRide() { finishRide(false); }
    };

    /** 설정에서 '다른 앱 위에 표시'를 켰으면 엔진이 정한 안내 값을 창에 그린다(끄면 치운다). */
    private void updateOverlay() {
        try {
            if (ov == null) { ov = new RideOverlay(this); ov.setHost(ovHost); }
            boolean on = "1".equals(getSharedPreferences(ShellActivity.PREFS, MODE_PRIVATE).getString(ShellCore.K_OVL, "0"));
            if (core.ov != null && core.ov.cells.length > 0) ov.show(on && core.ovActive, core.ov);
            else ov.update(on && core.ovActive, core.ovLine1, core.ovLine2, core.ovBanner, core.ovAlert);
        } catch (Throwable ignored) { }
    }

    private void publish() {
        liveRide = core.rideJson(); liveRowSlot = core.rowSlot; liveRowCan = core.rowCan; liveLv = core.lvJson(); liveScene = core.sceneJson(); liveReco = core.recoStatJson(); liveShare = core.ovShare; liveOv = core.ov; liveRev++; rsNotify();
        try { RideWidget.update(this, core.title, core.text); } catch (Throwable ignored) { }
    }

    private void finishRide(boolean arrived) {
        stopped = true; running = false;
        if (ov != null) ov.hide();
        clearSaved(this);
        liveRide = ""; liveRowSlot = ""; liveRowCan = false; liveLv = ""; liveScene = ""; liveReco = ""; liveShare = null; liveOv = null; liveRev++; rsNotify();
        try { RideWidget.update(this, "길동무", arrived ? "안내가 끝났어요" : ""); } catch (Throwable ignored) { }
        try { if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true); } catch (Throwable ignored) { }
        stopSelf();
    }

    // ── 알림 ──
    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel a = new NotificationChannel(CH_RIDE, "경로 안내", NotificationManager.IMPORTANCE_LOW);
        a.setShowBadge(false);
        nm.createNotificationChannel(a);
        NotificationChannel b = new NotificationChannel(CH_ALERT, "하차 · 환승 알림", NotificationManager.IMPORTANCE_HIGH);
        b.enableVibration(false);                                // 진동 무늬는 엔진이 정한 대로 직접 울린다
        nm.createNotificationChannel(b);
    }
    private PendingIntent openIntent() {
        Intent i = new Intent(this, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification.Builder builder(String channel) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, channel) : new Notification.Builder(this);
    }
    private Notification baseNotification(String title, String text) {
        Notification.Builder b = builder(CH_RIDE).setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(title).setContentText(text).setOngoing(true).setContentIntent(openIntent());
        return b.build();
    }
    private Notification ongoing() {
        Intent stop = new Intent(this, RideService.class).setAction(ACT_STOP);
        PendingIntent sp = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = builder(CH_RIDE).setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(core.title).setContentText(core.text.length() > 0 ? core.text : "위치를 확인하고 있어요")
            .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(openIntent());
        if (Build.VERSION.SDK_INT >= 20) b.addAction(new Notification.Action.Builder(null, "안내 종료", sp).build());
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        return b.build();
    }
    private void startFg(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTI_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTI_ID, n);
        } catch (Throwable t) { /* 시작이 막히면 알림 없이도 이어간다 */ }
    }
    private void updateOngoing() {
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NOTI_ID, ongoing()); } catch (Throwable ignored) { }
    }
    // ── 하차 추천 문구: 탑승 전에 한 번 받아 두고, 탑승 뒤에는 받아 둔 글만 쓴다(서버 요청 0) ──
    private volatile String recoCacheBody = "", recoCacheResp = "";
    private volatile int recoTries = 0;
    private volatile boolean recoFetching = false;
    private void prefetchReco(String reqBody, String resp) {
        if (recoCacheResp.length() > 0 || recoFetching || recoTries >= 2) return;
        final String pb = RideLocal.prefetchBody(reqBody, resp);
        if (pb.length() == 0) return;
        recoFetching = true; recoTries++;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    NetPost.Res r = NetPost.post(ShellCore.BASE + "/reco-text", pb, 9000);
                    if (r.status == 200) { recoCacheBody = pb; recoCacheResp = r.body; }
                } catch (Throwable ignored) { }
                recoFetching = false;
            }
        }, "ride-reco-pre").start();
    }
    /** 하차 7분 전 추천: 탑승 전에 받아 둔 글(맛집·커피·쇼핑 문구)을 띄운다(RecoNotify.sendCached) — 네트워크를 쓰지 않는다. */
    private void fireReco(final String body) {
        final Context app = getApplicationContext();
        boolean ok = recoCacheResp.length() > 0 && RideLocal.cacheMatches(recoCacheBody, body) && RecoNotify.sendCached(app, recoCacheResp, core);
        recoStage = ok ? "받아 둔 문구로 알림 보냄" : "받아 둔 문구 없음/시간대 다름"; recoStageAt = System.currentTimeMillis();
    }
    private void fireAlert(RideCore.Step s) {
        try {
            Notification.Builder b = builder(CH_ALERT).setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(s.title).setContentText(s.body).setAutoCancel(true).setContentIntent(openIntent());
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(ALERT_ID, b.build());
        } catch (Throwable ignored) { }
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(s.vib, -1)); else v.vibrate(s.vib, -1);
            }
        } catch (Throwable ignored) { }
    }
}
