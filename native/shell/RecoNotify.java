package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 하차 7분 전 추천 알림 보내기 (2026-10-21 s103). 글은 엔진 POST /reco-text 가 만든다 — 여기는 본문을 보내고 받은 제목·본문을 알림으로 띄울 뿐이다.
 * 탑승 서비스(실제 추천)와 설정의 시험 버튼이 같은 길을 쓴다. 네트워크를 쓰므로 메인 스레드에서 부르지 않는다.
 */
final class RecoNotify {
    static final int RECO_ID = 7103;
    private static final String CH = RideService.CH_ALERT;

    /** @return 알림을 띄웠으면 true · 보낼 글이 없는 시간대면 false · 서버/네트워크 오류면 false(두 번까지 다시 받아 본다) */
    static boolean send(Context c, String body) { return send(c, body, null); }
    /** core 가 있으면 받은 추천 줄(ad)을 건네 둔다 — 엔진이 오버레이 하단 줄로 보여 준다. */
    static boolean send(Context c, String body, RideCore core) {
        for (int i = 0; i < 2; i++) {
            try {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/reco-text", body, 9000);
                if (r.status != 200) continue;
                String[] t = RideCore.recoText(r.body);
                if (t == null) return false;
                if (core != null) core.setRecoAd(RideCore.recoAd(r.body));
                show(c, t[0], t[1]);
                return true;
            } catch (Throwable ignored) { }
        }
        return false;
    }

    /** 탑승 전에 받아 둔 /reco-text 응답으로 알림을 띄운다 — 네트워크를 쓰지 않는다. 보낼 글이 없으면 false. */
    static boolean sendCached(Context c, String resp, RideCore core) { return sendCached(c, resp, core, 0L, 0L); }
    /** arrMs·nowMs(지금 터진 추천의 도착 예정 · 현재)가 오면 받아 둔 글의 남은 분 · 도착 시각을 지금 값으로 고쳐 띄운다. */
    static boolean sendCached(Context c, String resp, RideCore core, long arrMs, long nowMs) {
        try {
            String[] t = RideCore.freshenReco(RideCore.recoText(resp), arrMs, nowMs);
            if (t == null) return false;
            if (core != null) core.setRecoAd(RideCore.recoAd(resp));
            show(c, t[0], t[1]);
            return true;
        } catch (Throwable ignored) { return false; }
    }

    private static void show(Context c, String title, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "하차 · 환승 알림", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(false);
            nm.createNotificationChannel(ch);                     // 이미 있으면 그대로
        }
        Intent i = new Intent(c, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(pi);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
        nm.notify(RECO_ID, b.build());
    }
}
