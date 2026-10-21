package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;

import java.util.ArrayList;
import java.util.List;

/**
 * 현재 위치를 기다림 없이(마지막으로 알려진 위치는 쓰지 않는다 — 오차가 크다):
 *  ① 고정밀 현재 위치 한 번(FusedLocationProviderClient.getCurrentLocation, 캐시 허용 0 · 제한 시간 fastMs)과 네트워크(Wi-Fi/기지국) 위치를 동시에 요청한다.
 *     GPS 위성이 잡히기 전이라도 네트워크 위치가 먼저 오면 곧바로 화면에 반영한다.
 *  ② fastMs 안에 아무것도 없으면 Fused 연속 요청(1초 간격)과 GPS 를 켜 totalMs 까지 첫 위치를 기다린다.
 *  ③ 처음 온 것이 네트워크 위치면 4초까지 더 정확한 것(Fused · GPS)을 기다려 60m 넘게 다르면 한 번 더 알린다.
 * 모든 콜백은 위치 서비스가 주 스레드에 돌려주는 비동기 콜백이다(요청 자체가 주 스레드를 막지 않는다).
 * Play 서비스가 없거나 실패하면 LocationManager(네트워크 + GPS 동시)로 같은 일을 한다.
 * track(): 화면이 켜져 있는 동안만 가볍게(15초 · 30m) 위치를 이어 받는다 — untrack() 으로 즉시 해제(생명주기).
 */
final class LocFused {
    interface Cb { void fix(Location l); void fail(); }

    private final Context ctx;
    private final Handler h = new Handler(Looper.getMainLooper());
    private FusedLocationProviderClient client;
    private boolean fusedBroken;
    private final List<Runnable> cancels = new ArrayList<Runnable>();       // 진행 중인 한 번짜리 요청들의 정리
    private LocationCallback trackCb, rideCb; private LocationListener trackLm;

    LocFused(Context c) { ctx = c.getApplicationContext(); }

    private FusedLocationProviderClient fused() {
        if (fusedBroken) return null;
        if (client == null) { try { client = LocationServices.getFusedLocationProviderClient(ctx); } catch (Throwable t) { fusedBroken = true; return null; } }
        return client;
    }
    private static boolean moved(Location a, Location b, double deg) { return a == null || Math.abs(a.getLatitude() - b.getLatitude()) > deg || Math.abs(a.getLongitude() - b.getLongitude()) > deg; }

    /** 현재 위치 한 번. 권한은 부르는 쪽이 이미 확인했다. */
    @SuppressWarnings("MissingPermission")
    void current(final long fastMs, final long totalMs, final Cb cb) {
        final LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        final Location[] shown = { null };
        final boolean[] st = { false, false, false };                         // 0: 첫 위치를 알렸다 · 1: 끝 · 2: 네트워크가 첫 위치였다(다듬기를 기다린다)
        final List<LocationListener> lls = new ArrayList<LocationListener>();
        final List<LocationCallback> fcs = new ArrayList<LocationCallback>();
        final CancellationTokenSource cts = new CancellationTokenSource();
        final Runnable[] self = { null };
        final Runnable stop = new Runnable() { @Override public void run() {
            if (st[1]) return; st[1] = true;
            for (LocationListener x : lls) { try { if (lm != null) lm.removeUpdates(x); } catch (Throwable ignored) { } }
            FusedLocationProviderClient fc = client;
            for (LocationCallback x : fcs) { try { if (fc != null) fc.removeLocationUpdates(x); } catch (Throwable ignored) { } }
            try { cts.cancel(); } catch (Throwable ignored) { }
            synchronized (cancels) { cancels.remove(self[0]); }
        } };
        self[0] = stop;
        synchronized (cancels) { cancels.add(stop); }

        final class Got {
            void on(Location l, boolean precise) {
                if (st[1] || l == null) return;
                if (!st[0]) {
                    st[0] = true; shown[0] = l; cb.fix(l);
                    if (precise) stop.run();
                    else { st[2] = true; h.postDelayed(stop, 4000L); }               // 네트워크 위치가 먼저 — 더 정확한 것을 잠깐 더 기다린다
                } else if (precise) {
                    if (moved(shown[0], l, 0.0006)) { shown[0] = l; cb.fix(l); }
                    stop.run();
                }
            }
        }
        final Got got = new Got();

        final boolean[] slowed = { false };
        final Runnable gpsOnly = new Runnable() { @SuppressWarnings("MissingPermission") @Override public void run() {
            try {
                if (lm == null || st[1] || !lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) return;
                LocationListener gl = new LocationListener() {
                    @Override public void onLocationChanged(Location l) { got.on(l, true); }
                    @Override public void onProviderEnabled(String p) { }
                    @Override public void onProviderDisabled(String p) { }
                    @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle b) { }
                };
                lls.add(gl);
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, gl, Looper.getMainLooper());
            } catch (Throwable ignored) { }
        } };
        final Runnable slow = new Runnable() { @SuppressWarnings("MissingPermission") @Override public void run() {      // fastMs 안에 못 받았다 — Fused 연속 요청(고정밀 · 1초)과 GPS 로 첫 위치를 기다린다
            if (slowed[0] || st[0] || st[1]) return;
            slowed[0] = true;
            FusedLocationProviderClient f = fused();
            if (f == null) { gpsOnly.run(); return; }
            try {
                LocationCallback c = new LocationCallback() { @Override public void onLocationResult(LocationResult r) { got.on(r == null ? null : r.getLastLocation(), true); } };
                fcs.add(c);
                f.requestLocationUpdates(new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L).setMinUpdateIntervalMillis(500L).build(), c, Looper.getMainLooper())
                    .addOnFailureListener(new OnFailureListener() { @Override public void onFailure(Exception e) { fusedBroken = true; gpsOnly.run(); } });
                gpsOnly.run();                                                         // GPS 도 같이 — 먼저 오는 것
            } catch (Throwable t) { fusedBroken = true; gpsOnly.run(); }
        } };

        // ① 고정밀 현재 위치(캐시 0 · fastMs) + 네트워크 위치, 동시에
        FusedLocationProviderClient fc = fused();
        if (fc != null) {
            try {
                fc.getCurrentLocation(new CurrentLocationRequest.Builder().setPriority(Priority.PRIORITY_HIGH_ACCURACY).setMaxUpdateAgeMillis(0L).setDurationMillis(fastMs).build(), cts.getToken())
                    .addOnSuccessListener(new OnSuccessListener<Location>() { @Override public void onSuccess(Location l) { if (l != null) got.on(l, true); else slow.run(); } })
                    .addOnFailureListener(new OnFailureListener() { @Override public void onFailure(Exception e) { fusedBroken = true; slow.run(); } });
            } catch (Throwable t) { fusedBroken = true; }
        }
        try {
            if (lm != null && lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                LocationListener nl = new LocationListener() {
                    @Override public void onLocationChanged(Location l) { got.on(l, false); try { lm.removeUpdates(this); } catch (Throwable ignored) { } }
                    @Override public void onProviderEnabled(String p) { }
                    @Override public void onProviderDisabled(String p) { }
                    @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle b) { }
                };
                lls.add(nl);
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 0L, 0f, nl, Looper.getMainLooper());
            }
        } catch (Throwable ignored) { }
        if (fc == null) slow.run();
        else h.postDelayed(slow, fastMs + 150L);                                   // 응답이 아예 없어도 fastMs 뒤에는 연속 요청으로
        h.postDelayed(new Runnable() { @Override public void run() {
            if (st[1]) return;                                                  // 이미 끝났다(성공 · 취소)
            boolean had = st[0]; stop.run();
            if (!had) cb.fail();
        } }, totalMs);
    }
    @SuppressWarnings("MissingPermission")
    void track(final Cb cb) {
        untrack();
        final LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        FusedLocationProviderClient fc = fused();
        if (fc != null) {
            try {
                trackCb = new LocationCallback() { @Override public void onLocationResult(LocationResult r) { Location l = r == null ? null : r.getLastLocation(); if (l != null) cb.fix(l); } };
                fc.requestLocationUpdates(new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 15000L).setMinUpdateIntervalMillis(8000L).setMinUpdateDistanceMeters(30f).build(), trackCb, Looper.getMainLooper())
                    .addOnFailureListener(new OnFailureListener() { @Override public void onFailure(Exception e) { fusedBroken = true; trackLm(cb); } });
                return;
            } catch (Throwable t) { fusedBroken = true; trackCb = null; }
        }
        trackLm(cb);
    }
    @SuppressWarnings("MissingPermission")
    private void trackLm(final Cb cb) {
        try {
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null || !lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) return;
            trackLm = new LocationListener() {
                @Override public void onLocationChanged(Location l) { cb.fix(l); }
                @Override public void onProviderEnabled(String p) { }
                @Override public void onProviderDisabled(String p) { }
                @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle b) { }
            };
            lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000L, 30f, trackLm, Looper.getMainLooper());
        } catch (Throwable ignored) { trackLm = null; }
    }
    /**
     * 탑승 중 연속 위치(하차 · 환승 판정용): Fused 고정밀 1초 간격(GPS + 네트워크 + 센서를 Play 서비스가 합친 값) + 시작하자마자 현재 위치 한 번.
     * 콜백은 부른 쪽이 준 Looper(서비스 스레드)로 온다 — 주 스레드를 쓰지 않는다. 마지막으로 알려진 위치는 쓰지 않는다.
     * Fused 가 안 되면 fail() 한 번 — 부르는 쪽이 LocationManager 로 대신한다. stopRide() 로 해제.
     */
    @SuppressWarnings("MissingPermission")
    void ride(final Looper lp, final Cb cb) {
        FusedLocationProviderClient fc = fused();
        if (fc == null) { cb.fail(); return; }
        try {
            rideCb = new LocationCallback() { @Override public void onLocationResult(LocationResult r) {
                if (r == null) return;
                List<Location> ls = r.getLocations();
                for (int i = 0; i < ls.size(); i++) { Location l = ls.get(i); if (l != null) cb.fix(l); }
            } };
            fc.requestLocationUpdates(new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L).setMinUpdateIntervalMillis(500L).setMaxUpdateDelayMillis(0L).setWaitForAccurateLocation(false).build(), rideCb, lp)
                .addOnFailureListener(new OnFailureListener() { @Override public void onFailure(Exception e) { fusedBroken = true; stopRide(); cb.fail(); } });
            fc.getCurrentLocation(new CurrentLocationRequest.Builder().setPriority(Priority.PRIORITY_HIGH_ACCURACY).setMaxUpdateAgeMillis(0L).setDurationMillis(3000L).build(), new CancellationTokenSource().getToken())
                .addOnSuccessListener(new OnSuccessListener<Location>() { @Override public void onSuccess(Location l) { if (l != null && rideCb != null) cb.fix(l); } });
        } catch (Throwable t) { fusedBroken = true; rideCb = null; cb.fail(); }
    }
    void stopRide() {
        try { if (rideCb != null && client != null) client.removeLocationUpdates(rideCb); } catch (Throwable ignored) { }
        rideCb = null;
    }

    /** 화면을 벗어나면(백그라운드 · 닫기) 연속 위치 · 진행 중인 한 번짜리 요청을 모두 즉시 해제한다. */
    boolean tracking() { return trackCb != null || trackLm != null; }
    void untrack() {
        try { if (trackCb != null && client != null) client.removeLocationUpdates(trackCb); } catch (Throwable ignored) { }
        trackCb = null;
        try { if (trackLm != null) ((LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE)).removeUpdates(trackLm); } catch (Throwable ignored) { }
        trackLm = null;
    }
    void cancelAll() {
        List<Runnable> cs;
        synchronized (cancels) { cs = new ArrayList<Runnable>(cancels); }
        for (Runnable r : cs) { try { r.run(); } catch (Throwable ignored) { } }
        untrack();
    }
}
