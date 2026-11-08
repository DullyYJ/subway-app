package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * 길동무 패밀리 푸시(FCM) 받는 쪽 — 앱이 백그라운드이거나 꺼져 있어도 가족구성원의 출발 · 도착 · 미도착 · 대화 · 미션이 알림으로 온다.
 *  · 무엇을 알릴지(제목 · 글)는 가족 서버 엔진이 정해서 데이터 메시지로 보낸다. 여기는 그걸 알림으로 그리기만 한다.
 *  · 연결(가족 시크릿 키)을 시도한 적이 없는 기기는 토큰을 받지도 보내지도 않는다. 설정 파일(google-services.json)이 없는 빌드에서는 조용히 아무 일도 하지 않는다.
 *  · 가족 화면을 보고 있을 땐 알림을 띄우지 않는다(긴 대기로 이미 실시간이다). 다른 탭을 보거나 앱이 뒤에 있으면 알림이 온다.
 */
public final class KidsPush extends FirebaseMessagingService {
    static final String CH = "kids_alert2", CH_OLD = "kids_push", CH_SOS = "kids_sos", K_FT = "kid.ft", K_FTSENT = "kid.ftsent";
    /** 앱이 화면 앞에 있나(KidsHub.resume/pause 가 알린다). */
    static volatile KidsHub hub;

    /** 토큰을 받아 가족 엔진에 맡긴다(백그라운드 스레드). 이미 보낸 같은 토큰이면 건너뛴다. */
    static void start(final Context c, final ShellCore.Store st) {
        if (st.get("kid.id", "").length() == 0) return;                     // 연결을 시도한 적 없으면 아무것도 하지 않는다
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(new com.google.android.gms.tasks.OnSuccessListener<String>() {
                @Override public void onSuccess(String tk) { if (tk != null && tk.length() > 20) { st.put(K_FT, tk); upload(st); } }
            });
        } catch (Throwable ignored) { /* Firebase 설정이 없으면 푸시만 건너뛴다 */ }
    }

    /** 저장된 토큰을 엔진에 올린다(연결 등록이 끝난 뒤). 올렸으면 기록해 두고 같은 토큰은 다시 보내지 않는다. */
    static void upload(final ShellCore.Store st) {
        final String tk = st.get(K_FT, "");
        if (tk.length() == 0 || tk.equals(st.get(K_FTSENT, ""))) return;
        new Thread(new Runnable() {
            @Override public void run() {
                if (KidsHub.postFt(st, tk)) st.put(K_FTSENT, tk);
            }
        }, "kids-ft").start();
    }

    @Override public void onNewToken(String tk) {
        try {
            ShellCore.Store st = CommuteAlarm.store(getApplicationContext());
            st.put(K_FT, tk == null ? "" : tk);
            st.put(K_FTSENT, "");
            if (st.get("kid.id", "").length() > 0) upload(st);
        } catch (Throwable ignored) { }
    }

    @Override public void onMessageReceived(RemoteMessage m) {
        try {
            Map<String, String> d = m.getData();
            if (d == null || d.isEmpty()) return;
            KidsHub h = hub;
            String k = d.get("k");
            if ("wear".equals(k)) {                                            // s412: 가족구성원이 꾸민 모습 — 알림 없이 조용히. 앱이 떠 있으면 장면에 바로, 아니면 폰에 남겨 다음에 켤 때 바로 보이게
                String ww = d.get("w"), wc = d.get("cid");
                if (h != null) h.onWearPush(wc, ww);
                else if (ww != null && FriendWear.valid(ww)) { ShellCore.Store st = CommuteAlarm.store(getApplicationContext()); String mine = st.get("kid.cid", ""); if (mine.length() == 0 || wc == null || wc.equals(mine)) st.put("kid.wear", ww); }
                return;
            }
            boolean urgent = "sos".equals(k);                                  // s399: 가족구성원의 긴급 호출은 화면을 보고 있어도 항상 크게 알린다
            boolean popped = h != null && h.onCallPush(d);                    // s415: 긴급 · 데리러 와줘 · 안전 도착은 앱이 앞에 있으면(어느 탭이든) 가운데 팝업으로 — 가족구성원이 취소하면 팝업도 닫힌다
            if (popped && !urgent) { cue(getApplicationContext()); return; }   // 팝업으로 보여 줬으니 알림은 생략(긴급만 알람 소리를 위해 알림도 낸다) — 대신 진동 + 알림음은 낸다
            if (!urgent && h != null && h.viewing()) { cue(getApplicationContext()); return; }                  // s385: 가족 화면(대화 칸·대화방)을 보고 있을 땐 알림 카드는 숨기되 s416: 진동 + 알림음은 낸다 — 앱이 앞에 있어도 다른 탭이면 알림이 온다(카톡처럼)
            show(getApplicationContext(), d.get("title"), d.get("body"), d.get("tag"), d.get("k"), d);
        } catch (Throwable ignored) { }
    }

    /** 알림 카드를 숨기는 때(가족 화면을 보는 중 · 팝업으로 보여 줬을 때)에도 진동 + 알림음은 낸다. 소리는 기기의 알림 음량 · 무음 설정을 따른다. */
    static void cue(Context c) {
        try {
            android.os.Vibrator v = (android.os.Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                long[] pat = {0, 300, 150, 300};
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(android.os.VibrationEffect.createWaveform(pat, -1)); else v.vibrate(pat, -1);
            }
        } catch (Throwable ignored) { }
        try {
            android.media.Ringtone r = android.media.RingtoneManager.getRingtone(c, android.provider.Settings.System.DEFAULT_NOTIFICATION_URI);
            if (r != null) {
                if (Build.VERSION.SDK_INT >= 28) r.setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                r.play();
            }
        } catch (Throwable ignored) { }
    }

    static void show(Context c, String title, String body, String tag, String kind, Map<String, String> d) {
        if (body == null || body.length() == 0) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        final boolean urgent = "sos".equals(kind);
        final String chId = urgent ? CH_SOS : CH;
        if (Build.VERSION.SDK_INT >= 26) {
            try { nm.deleteNotificationChannel(CH_OLD); } catch (Throwable ignored) { }        // s416: 옛 채널은 소리 · 진동 설정을 바꿀 수 없어 새 채널(kids_alert2)로 갈아탄다
            NotificationChannel ch = new NotificationChannel(chId, urgent ? "길동무 긴급 호출" : "길동무 패밀리 알림", NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.enableLights(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            if (!urgent) {                                                      // s416: 알림이 올 때마다 진동 + 알림음(기기 알림음) — 대화 · 출발 · 도착 · 미도착 · 미션 모두
                ch.setVibrationPattern(new long[] {0, 300, 150, 300, 150, 300});
                ch.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            }
            if (urgent) {                                                       // 긴급 호출: 알람 소리(무음 모드여도 알람 소리는 난다) + 길게 떠는 진동
                ch.setVibrationPattern(new long[] {0, 500, 200, 500, 200, 500, 200, 500});
                ch.setSound(android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI, new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_ALARM).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            }
            nm.createNotificationChannel(ch);
        }
        Intent it = new Intent(c, ShellActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("kids_open", kind == null ? "1" : kind);
        if (d != null && d.get("pk") != null && ("sos".equals(kind) || "pick".equals(kind) || "arr".equals(kind))) it.putExtra("kids_pop", KidsHub.popFromMap(d).toString());          // s415: 알림을 누르면 호출 팝업이 바로 뜬다
        PendingIntent pi = PendingIntent.getActivity(c, 7701, it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, chId) : new Notification.Builder(c);
        if (urgent) b.setCategory(Notification.CATEGORY_ALARM); else b.setCategory("chat".equals(kind) ? Notification.CATEGORY_MESSAGE : Notification.CATEGORY_EVENT);
        b.setVisibility(Notification.VISIBILITY_PUBLIC);
        b.setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(title == null || title.length() == 0 ? "길동무" : title).setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(pi).setWhen(System.currentTimeMillis());
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        try { nm.notify(tag == null || tag.length() == 0 ? "kids" : tag, 7701, b.build()); } catch (Throwable ignored) { }
    }
}
