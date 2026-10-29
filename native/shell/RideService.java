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
    static final String ACT_START = "gdm.ride.START", ACT_STOP = "gdm.ride.STOP", ACT_DETOUR = "gdm.ride.DETOUR";
    static final String PREFS = "gdm_ride", KEY_SAVED = "saved";

    /** 서비스가 돌고 있나, 그리고 앱 화면이 읽는 가장 새 값(같은 프로세스). */
    static volatile boolean running = false;
    static volatile int liveRev = 0;
    static volatile String liveRowSlot = ""; static volatile boolean liveRowCan;
    /** 서비스가 끝난 까닭 — "user"(사용자가 끝냄) · "arrive"(도착) 만 확정을 풀어도 되는 끝이다. 그 밖("engine-done" · "no-saved" · 시스템이 내림)은 뜻밖의 끝 — 앱은 확정을 풀지 않고 다시 켠다. */
    static volatile String endReason = "";
    static volatile String liveOffStn = "";                  // s229: 이탈 때 첫 지하철역 이름(없으면 "")
    static volatile int liveBoardI = -1, liveBoardJ = -1;     // s320: 다음에 탈 버스 승차 노드 · 몇 번째 버스 구간(없으면 -1)
    static volatile String liveArr = "null";                  // 칸별 시각(중간 버스 질문 요청에 싣는다)
    static volatile long liveOff = 0L;                       // 엔진이 알린 이탈 시작 시각(없으면 0)
    static volatile String liveRide = "", liveLv = "", liveScene = "", livePos = "", liveReco = "", recoStage = "";
    static volatile ShareCore.Share liveShare;
    static volatile OvCore.Ov liveOv;                        // 앱 탑승 시트(RsSheetView)가 그릴 엔진 값(overlay.rs 포함)
    /** 앱 화면이 보이는 동안(ShellActivity onResume~onStop)은 오버레이 창을 숨긴다 — 오버레이는 앱을 내렸을 때만 뜬다(웹 OverlayPlugin 과 같다). 앱 안에서는 탑승 시트·경로 카드가 같은 줄을 그린다. */
    static volatile boolean appFront = false;
    /** 안내 중이고 설정에서 '다른 앱 위에 표시'를 켰으며 권한도 있으면 앱 밖에서 오버레이가 추천 줄을 그린다. */
    static boolean overlayReady(Context c) {
        try { return running && RideOverlay.allowed(c) && ShellCore.ovlOn(c.getSharedPreferences(ShellActivity.PREFS, MODE_PRIVATE).getString(ShellCore.K_OVL, "")); } catch (Throwable t) { return false; }
    }
    static void setAppFront(boolean f) { appFront = f; final RideService s = inst; if (s != null) mainH.post(new Runnable() { @Override public void run() { s.updateOverlay(); } }); }
    static volatile Runnable rsListener;                     // 값이 바뀔 때 메인 스레드에서 불린다(ShellActivity 가 화면에 있을 때만 건다)
    private static volatile RideService inst;
    private static final Handler mainH = new Handler(Looper.getMainLooper());
    /** 앱 탑승 시트의 손짓(press · undo · open · close · pill)을 엔진의 다음 걸음에 알린다 — 오버레이 줄과 같은 길. */
    /** s320: 중간 환승 버스 고르기 — 엔진이 만든 변경분을 달리는 안내에 끼운다(다음 걸음 때). 서비스가 없으면 false. */
    static boolean busSwap(String patchJson, long pickMs) { RideService s = inst; return s != null && s.core != null && s.core.busSwap(patchJson, pickMs); }
    static void rsAct(String a) { RideService s = inst; if (s != null) s.ovHost.act(a); }
    /** 확정 · [탑승]을 눌렀을 때의 짧은 진동(s228) — 손끝으로 눌렸다는 걸 알리려는 것이라 짧고(45ms) 한 번뿐이다. 진동이 없거나 끈 기기에서는 조용히 넘어간다. */
    static void buzz(Context c) {
        try {
            Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(45L, 180)); else v.vibrate(45L);
        } catch (Throwable ignored) { }
    }
    static void rsNotify() { Runnable l = rsListener; if (l != null) mainH.post(l); }
    static volatile long recoStageAt = 0L;
    /** s295 (YJ: 도착인데 추천이 알림으로만 오고 팝업·오버레이가 안 떴다 — 이유를 남긴다): 마지막 추천을 어디로 보냈고 왜 거기였는지/실패했는지 한 줄. 설정 '상태 확인'과 오류 기록에 붙는다. */
    static volatile String recoRoute = "";
    /** 오버레이 추천 줄이 실제로 그려진 적이 있나 — 줄로 보냈는데 끝내 안 그려지면 알림으로 대신 보낸다. */
    static volatile boolean recoRowSeen = false;
    /** 추천을 오버레이 줄로 보냈다 — 20초 안에 줄이 한 번도 안 그려졌으면(권한·창 문제 등) 알림으로 대신 보낸다. */
    static void watchRecoRow(final Context c, final String title, final String text) {
        recoRowSeen = false;
        final Context app = c.getApplicationContext();
        mainH.postDelayed(new Runnable() { @Override public void run() {
            try {
                if (recoRowSeen) return;
                recoRoute += " → 20초 안에 오버레이 줄이 안 그려져 알림으로";
                RecoNotify.show(app, title, text);
                ErrLog.record(app, new IllegalStateException("RIDE_RECO 오버레이 줄 안 그려짐 " + recoRoute), false);
            } catch (Throwable ignored) { }
        } }, 20000L);
    }

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
        endReason = "";
        Intent i = new Intent(c, RideService.class).setAction(ACT_START);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static void stop(Context c) {
        endReason = "user";
        clearSaved(c);
        running = false; liveOff = 0L; liveRide = ""; liveRowSlot = ""; liveRowCan = false; liveLv = ""; liveBoardI = -1; liveBoardJ = -1; liveScene = ""; livePos = ""; liveReco = ""; liveShare = null; liveOv = null; liveRev++; rsNotify();
        c.stopService(new Intent(c, RideService.class));
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        ErrLog.install(this);
        String act = intent == null ? null : intent.getAction();
        if (ACT_STOP.equals(act)) { finishRide("user"); return START_NOT_STICKY; }
        if (ACT_DETOUR.equals(act)) {                              // s229: 이탈 알림의 [역까지 이동] — 안내 중일 때만(아니면 아무것도 켜지 않는다)
            if (running && core != null && inst == this) { ovHost.act("detour"); return START_STICKY; }
            stopSelf(); return START_NOT_STICKY;
        }
        RideCore restored = RideCore.restore(getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_SAVED, ""), System.currentTimeMillis());
        if (restored == null) {                                   // 저장본이 없거나 너무 낡았다 — 더 이어갈 안내가 없다
            endReason = "no-saved"; try { ErrLog.record(this, new IllegalStateException("RIDE_END no-saved"), false); } catch (Throwable ignored) { }
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

    /** 5초 걸음이 값을 못 내는 까닭을 오류 기록에 남긴다(s222) — 같은 까닭은 한 번만(기록이 넘치지 않게). 하단 안내 문구를 없앤 뒤로 실패가 보이지 않아서. */
    private String diagLast = "";
    private void diagOnce(String why) {
        try { if (why.equals(diagLast)) return; diagLast = why; ErrLog.record(this, new IllegalStateException(why), false); } catch (Throwable ignored) { }
    }

    /** s257 (YJ: "영점 조정이 안 되는 것 같다" — 기기 안 사정을 볼 길이 없었다): 엔진이 알려 주는 역별 영점 판정(state·표본 수·가까움/멂·최단 거리)과 '영점/마커/도착 확정' 메모가 바뀔 때만 오류 기록에 남긴다.
     *  같은 내용은 한 번만, 한 번의 탑승에 최대 60줄. 판단·계산은 엔진이 한 것을 적기만 한다(다음에 원인을 기록으로 본다). */
    private final java.util.HashSet<String> zeroSeen = new java.util.HashSet<>();
    private void zeroDiag(String resp) {
        try {
            if (resp == null || zeroSeen.size() >= 60 || (resp.indexOf("\"zero\"") < 0 && resp.indexOf("영점") < 0 && resp.indexOf("마커 되돌아감") < 0 && resp.indexOf("연착") < 0 && resp.indexOf("재동기") < 0 && resp.indexOf("통과") < 0 && resp.indexOf("\"reco\"") < 0)) return;
            org.json.JSONObject o = new org.json.JSONObject(resp);
            org.json.JSONObject rcj = o.optJSONObject("reco");
            if (rcj != null) {                                                   // s258: 도착 전 추천이 왜 안 떴는지 — 판정 이유(off·noeta·window·dup·recent·ok)와 남은 시간이 바뀔 때만 한 줄
                String rm = "RIDE_RECO 이유=" + rcj.optString("why", "?") + " 시간대=" + rcj.optString("slot", "?") + " 발사=" + rcj.optBoolean("fire", false) + (rcj.has("remSec") ? " 남은=" + (rcj.optInt("remSec") / 60) + "분" : "");
                if ((!"window".equals(rcj.optString("why", "")) || rcj.optInt("remSec", 99999) <= 600) && zeroSeen.add(rm)) ErrLog.record(this, new IllegalStateException(rm), false);
            }
            org.json.JSONObject z = o.optJSONObject("zero");
            org.json.JSONArray st = z == null ? null : z.optJSONArray("stops");
            for (int i = 0; st != null && i < st.length(); i++) {
                org.json.JSONObject q = st.optJSONObject(i); if (q == null) continue;
                String msg = "RIDE_ZERO 역#" + q.optInt("i", -1) + " 상태=" + q.optString("state", "?") + " 표본=" + q.optInt("n", 0) + " 가까움=" + q.optInt("near", 0) + " 멂=" + q.optInt("far", 0)
                    + " 최단=" + (q.isNull("distM") ? "없음" : q.optInt("distM") + "m") + (q.has("passMs") ? " 통과확정" : "") + (q.optBoolean("notYet") ? " 아직안옴" : "") + (q.optBoolean("apply") ? " 반영" : "");
                if (zeroSeen.add(msg)) ErrLog.record(this, new IllegalStateException(msg), false);
            }
            org.json.JSONArray ns = o.optJSONArray("notes");
            for (int i = 0; ns != null && i < ns.length(); i++) {
                String n = ns.optString(i, "");
                if (n.indexOf("영점") >= 0 || n.indexOf("마커 되돌아감") >= 0 || n.indexOf("도착 확정") >= 0 || n.indexOf("GPS 탐색") >= 0
                    || n.indexOf("연착") >= 0 || n.indexOf("재동기") >= 0 || n.indexOf("아직 안 닿") >= 0 || n.indexOf("통과") >= 0 || n.indexOf("지연") >= 0) {   // s258: 시간표가 갑자기 밀린 원인(연착 보정·통과 증거·재동기)도 남긴다
                    String msg = "RIDE_NOTE " + n;
                    if (zeroSeen.add("N" + n.replaceAll("[0-9]+", "#"))) ErrLog.record(this, new IllegalStateException(msg + " @" + new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.KOREA).format(new java.util.Date())), false);
                }
            }
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
                if (resp == null) diagOnce("RIDE_STEP resp=null (폰 안 엔진이 값을 못 냈다)");
                if (resp != null) {
                    zeroDiag(resp);
                    RideCore.Step s = core.onStep(resp);
                    if (!s.ok) diagOnce("RIDE_STEP onStep ok=false");
                    if (s.ok) {
                        prefetchReco(body, resp);
                        save(RideService.this, core);
                        if (s.alert) fireAlert(s);
                        if (s.recoBody.length() > 0) fireReco(s.recoBody);
                        if (s.askBody.length() > 0) fetchBoardLive(s.askBody);
                        publish();
                        updateOngoing();
                        updateOverlay();
                        if (s.done) { stepping = false; boolean q = core.quit; finishRide(q ? "arrive" : "engine-done"); if (q) ShellActivity.quitAll(); return; }
                        delay = core.nextMs;
                    }
                }
            } catch (Throwable t) { diagOnce("RIDE_STEP " + t); }
            stepping = false;
            if (!stopped) h.postDelayed(this, delay);
        }
    };

    /** 오버레이 손짓 → 엔진에 다음 걸음으로 알리거나(탑승 줄 · 추천 닫기) 곧바로 처리(보기 · 종료). 오버레이 클릭은 메인 스레드, 엔진 호출은 서비스 스레드. */
    private final RideOverlay.Host ovHost = new RideOverlay.Host() {
        @Override public void act(String a) {
            if (core == null) return;
            if ("press".equals(a)) buzz(RideService.this);                                         // [탑승]: 앱 시트 · 알약 · 경로 카드 칸 · 오버레이가 모두 이 길을 지난다
            core.queueAct(a);
            if (h != null) { h.removeCallbacks(stepRunnable); h.post(stepRunnable); }             // 5초를 기다리지 않고 바로 한 걸음
        }
        @Override public void recoGo(OvCore.Row r) {
            if (core != null) core.dismissReco(r.at);
            recoClosedHere();
            RecoGo.open(RideService.this, core == null ? null : core.lastRecoAd(), core == null ? null : core.recoLoc, r);
        }
        @Override public void recoOk(long at) { if (core != null) core.dismissReco(at); recoClosedHere(); if (h != null) h.post(new Runnable() { @Override public void run() { updateOverlay(); } }); }
        @Override public void quitApp() { finishRide("user"); ShellActivity.quitAll(); }
        @Override public void endRide() { finishRide("user"); }
    };

    /** 설정에서 '다른 앱 위에 표시'를 켰으면 엔진이 정한 안내 값을 창에 그린다(끄면 치운다). */
    private void updateOverlay() {
        try {
            if (ov == null) { ov = new RideOverlay(this); ov.setHost(ovHost); }
            boolean on = ShellCore.ovlOn(getSharedPreferences(ShellActivity.PREFS, MODE_PRIVATE).getString(ShellCore.K_OVL, ""));
            on = on && !appFront;
            try { if (on && core.ovActive && core.ov != null && core.ov.row != null && core.ov.row.kind == 1) recoRowSeen = true; } catch (Throwable ignored) { }      // s295: 추천 줄이 실제로 그려질 상태가 됐다
            if (core.ov != null && core.ov.cells.length > 0) ov.show(on && core.ovActive, core.ov);
            else ov.update(on && core.ovActive, core.ovLine1, core.ovLine2, core.ovBanner, core.ovAlert);
        } catch (Throwable ignored) { }
    }

    private void publish() {
        liveOff = core.offAt; liveOffStn = core.offStn; liveRide = core.rideJson(); liveRowSlot = core.rowSlot; liveRowCan = core.rowCan; liveLv = core.lvJson(); liveBoardI = core.boardI; liveBoardJ = core.boardJ; liveArr = core.arrJson; liveScene = core.sceneJson(); livePos = core.posJson; liveReco = core.recoStatJson(); liveShare = core.ovShare; liveOv = core.ov; liveRev++; rsNotify();
        try { RideWidget.update(this, core.title, core.text); } catch (Throwable ignored) { }
    }

    private void finishRide(String reason) {
        final boolean legit = "arrive".equals(reason) || "user".equals(reason), arrived = "arrive".equals(reason);
        stopped = true; running = false; endReason = reason;
        if (ov != null) ov.hide();
        if (legit) clearSaved(this);                                                          // 사용자가 끝냈거나 도착했다 — 저장본을 지운다. 뜻밖의 끝은 남겨 두어 앱이 다시 켠다
        else { try { ErrLog.record(this, new IllegalStateException("RIDE_END " + reason), false); } catch (Throwable ignored) { } }
        liveOff = 0L; liveOffStn = ""; liveRide = ""; liveRowSlot = ""; liveRowCan = false; liveLv = ""; liveBoardI = -1; liveBoardJ = -1; liveScene = ""; livePos = ""; liveReco = ""; liveShare = null; liveOv = null; liveRev++; rsNotify();
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
    // ── 승차 대기 중 실시간 다음 차(웹 _htlResyncBoard): 엔진이 묻자고 할 때만(15초 간격) — 승차가 확정되면 엔진이 더는 묻지 않는다(탑승 뒤 서버 요청 0) ──
    private volatile boolean blFetching = false;
    private void fetchBoardLive(final String body) {
        if (blFetching) return;
        blFetching = true;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    NetPost.Res r = NetPost.post(ShellCore.BASE + "/board-live", body, 4500);
                    if (r.status == 200 && core != null) core.setBl(r.body);
                } catch (Throwable ignored) { }
                blFetching = false;
            }
        }, "ride-bl").start();
    }
    // ── 하차 추천 문구: 탑승 전에 한 번 받아 두고, 탑승 뒤에는 받아 둔 글만 쓴다(서버 요청 0) ──
    private volatile String recoCacheBody = "", recoCacheResp = "";
    private volatile int recoTries = 0;
    private volatile boolean recoFetching = false;
    private void prefetchReco(String reqBody, String resp) {
        if (recoCacheResp.length() > 0 || recoFetching || recoTries >= 2) return;
        final String pb = RecoNotify.withRecent(getApplicationContext(), RideLocal.prefetchBody(reqBody, resp));
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
    private volatile boolean recoSentOk = false;                      // s259 (YJ: 세 번까지 시도하되 한 번이라도 성공하면 그다음은 보내지 않는다) — 한 여정에 한 번 성공하면 끝
    private void fireReco(final String body) {
        if (recoSentOk) return;
        final Context app = getApplicationContext();
        boolean ok = recoCacheResp.length() > 0 && RideLocal.cacheMatches(recoCacheBody, body) && RecoNotify.sendCached(app, recoCacheResp, core, jnum(body, "arrMs"), jnum(body, "nowMs"));
        if (ok) recoSentOk = true;
        recoStage = ok ? "받아 둔 문구로 보냄" : "받아 둔 문구 없음/시간대 다름 — 바로 받는 중"; recoStageAt = System.currentTimeMillis();
        if (ok || recoLive) return;
        // s237(YJ: 도착 전 맛집·카페·쿠팡이 안 나온다): 받아 둔 글이 없거나 시간대가 달라졌어도 추천은 한 여정에 한 번뿐이라 다시 안 온다 → 지금 서버에서 바로 받아 알림과 오버레이 추천 줄에 쓴다.
        recoLive = true;
        new Thread(new Runnable() {
            @Override public void run() {
                boolean sent = false;
                try { sent = RecoNotify.send(app, body, core); } catch (Throwable ignored) { }
                if (sent) recoSentOk = true;
                recoStage = sent ? "바로 받아 보냄" : "바로 받기 실패/보낼 시간대 아님"; recoStageAt = System.currentTimeMillis();
                recoLive = false;
                if (!sent && !recoSentOk && recoRetryN < 2 && core != null) { recoRetryN++; core.retryReco(); }          // s258·s259: 못 보냈으면(통신 실패) 도착 전 창이 열려 있는 동안 다시 판정한다 — 처음 + 다시 2번 = 모두 3번까지, 한 번이라도 성공하면 그만
                try { if (!sent) ErrLog.record(RideService.this, new IllegalStateException("RIDE_RECO 보내기 실패(시도 " + (recoRetryN + 1) + "/3) 단계=" + recoStage + " 이유=" + (core == null ? "?" : core.recoWhy())), false); } catch (Throwable ignored) { }
                if (sent && h != null) h.post(new Runnable() { @Override public void run() { updateOverlay(); } });
            }
        }, "ride-reco-live").start();
    }
    private volatile boolean recoLive = false;
    /** 추천 본문(JSON 글)에서 정수 값 하나 — 없으면 0. */
    private static long jnum(String body, String key) {
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"" + key + "\":(\\d+)").matcher(body == null ? "" : body);
            return m.find() ? Long.parseLong(m.group(1)) : 0L;
        } catch (RuntimeException e) { return 0L; }
    }
    /** s258 (YJ: 추천은 보는 화면 한 곳에만 뜨고, 한쪽에서 확인·접속하면 다른 쪽(오버레이·앱 팝업·알림)도 사라진다): 오버레이에서 처리했으니 앱 팝업과 알림을 닫는다. */
    private void recoClosedHere() {
        try { ShellActivity.recoPopupClose(); } catch (Throwable ignored) { }
        try { NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.cancel(RecoNotify.RECO_ID); } catch (Throwable ignored) { }
    }
    /** 앱 팝업·알림에서 처리했다 — 엔진에 '지금 보이는 추천 줄 닫기'를 알려 오버레이 줄도 사라지게 한다. */
    static void recoDone() {
        final RideService s = inst;
        if (s == null || s.core == null) return;
        s.core.dismissAnyReco();
        if (s.h != null) s.h.post(new Runnable() { @Override public void run() { s.h.removeCallbacks(s.stepRunnable); s.h.post(s.stepRunnable); } });
    }
    private int recoRetryN = 0;
    private void fireAlert(RideCore.Step s) {
        try {
            Notification.Builder b = builder(CH_ALERT).setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(s.title).setContentText(s.body).setAutoCancel(true).setContentIntent(openIntent());
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
            if ("offroute".equals(s.type) && core != null && core.offStn.length() > 0) {         // s229: 자차 등으로 벗어났다면 첫 지하철역까지 GPS 로 안내받는 길
                Intent dt = new Intent(this, RideService.class).setAction(ACT_DETOUR);
                b.addAction(new Notification.Action.Builder(android.R.drawable.ic_dialog_map, "역까지 이동", PendingIntent.getService(this, 2, dt, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
            }
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
