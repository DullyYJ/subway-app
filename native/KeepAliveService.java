package com.dullyyj.subway;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * 경로 이동 중 앱 프로세스를 살려 두는 포그라운드 서비스 (2026-10-13, YJ: "경로 이동 중 앱이 죽는 예외를 다 막아버리고 어떻게든 살려야 해").
 *
 * 위치 플러그인(BackgroundGeolocationService)의 포그라운드 서비스는 '앱이 화면에서 사라질 때' 뒤늦게 켜지고,
 * 시작이 막히면 아무 보호가 없다. 이 서비스는 경로를 확정해 여정이 시작되는 순간(앱이 화면에 있을 때)
 * OverlayPlugin.keepAlive(on:true) 가 먼저 켜 두어 프로세스를 포그라운드 우선순위로 올린다 — 두 겹으로 지킨다.
 *  · foregroundServiceType=location (Android 14 규칙) · 알림은 최소 중요도(알림창 맨 아래, 소리·진동 없음)
 *  · START_NOT_STICKY: 프로세스가 죽으면 웹뷰(JS)도 같이 죽어 되살려 봐야 알림만 남는다 — 되살리지 않는다.
 *  · 여정이 끝나거나(keepAlive off) 액티비티가 사라지면(handleOnDestroy) OverlayPlugin 이 끈다.
 * 실제 CPU 를 깨우는 부분 웨이크락은 OverlayPlugin 의 5초 틱(holdCpu)이 쥔다.
 */
public class KeepAliveService extends Service {
    static final String CHANNEL = "gdm_keepalive";
    static final int NOTI_ID = 7001;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
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
                    .setContentText("화면을 꺼도 안내가 이어져요")
                    .setSmallIcon(icon)
                    .setOngoing(true)
                    .setShowWhen(false);
            if (pi != null) b.setContentIntent(pi);
            Notification n = b.build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTI_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTI_ID, n);
        } catch (Throwable e) {
            // 알림·포그라운드 승격이 거부되면(권한·정책) 서비스만 조용히 끝낸다 — 앱은 영향 없다.
            try { stopSelf(); } catch (Throwable ignored) { }
        }
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        try { stopForeground(true); } catch (Throwable ignored) { }
        super.onDestroy();
    }
}
