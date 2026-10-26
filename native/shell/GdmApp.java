package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.app.Application;
import android.content.Context;

/**
 * 프로세스가 시작되는 순간(화면보다 먼저) 주 스레드가 나중에 기다리게 될 것들을 뒤에서 미리 읽어 둔다 (2026-10-21 s123).
 *  · 설정 파일 2개(gdm_shell · gdm_ride) — SharedPreferences 는 처음 값을 읽을 때 파일이 다 읽힐 때까지 기다리므로, 미리 한 번 건드려 읽혀 둔다.
 *  · 글꼴 2개(Noto Sans KR 보통 · 굵게) — 글자 폭이 글꼴에 달려 있어 첫 배치 전에 있어야 하는데, 주 스레드가 파일을 열지 않게 여기서 불러 둔다.
 * 화면(ShellActivity)이 같은 것을 부르면 이미 끝나 있거나(기다림 0), 끝나기를 잠깐 기다린다(직접 읽는 것보다 항상 짧다).
 */
public final class GdmApp extends Application {
    @Override public void onCreate() {
        super.onCreate();
        final Context app = this;
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                try { android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_FOREGROUND); } catch (Throwable ignored) { }
                try { NetPost.iid = loadIid(app); } catch (Throwable ignored) { }
                try { app.getSharedPreferences(ShellActivity.PREFS, Context.MODE_PRIVATE).getAll(); } catch (Throwable ignored) { }
                try { ScreenView.preloadFaces(app); } catch (Throwable ignored) { }
                try { app.getSharedPreferences(RideService.PREFS, Context.MODE_PRIVATE).getAll(); } catch (Throwable ignored) { }
            }
        }, "gdm-warm");
        t.setDaemon(true);
        t.start();
    }

    /** 설치 때 한 번 만든 무작위 번호(API 남용 방어용 · s226). 따로 작은 파일(gdm_guard)에 둔다. 못 만들면 빈 글자(서버는 IP 로만 센다). */
    static String loadIid(Context app) {
        android.content.SharedPreferences sp = app.getSharedPreferences("gdm_guard", Context.MODE_PRIVATE);
        String v = sp.getString("iid", "");
        if (NetPost.iidOk(v)) return v;
        v = java.util.UUID.randomUUID().toString().replace("-", "");
        sp.edit().putString("iid", v).apply();
        return v;
    }
}
