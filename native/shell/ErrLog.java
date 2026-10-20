package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** 잡지 못한 오류를 ErrCore 저장소에 적는다(앱이 죽기 직전에 동기로). 원래의 처리기는 그대로 이어서 부른다. */
final class ErrLog {
    private ErrLog() { }
    private static boolean installed;

    static synchronized void install(Context c) {
        if (installed) return;
        installed = true;
        final Context app = c.getApplicationContext() != null ? c.getApplicationContext() : c;
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override public void uncaughtException(Thread t, Throwable e) {
                try { record(app, e, true); } catch (Throwable ignored) { }
                if (prev != null) prev.uncaughtException(t, e);
            }
        });
    }

    /** 잡은 오류도 기록할 수 있다(sync 가 true 면 commit — 죽기 직전용). */
    static void record(Context c, Throwable e, final boolean sync) {
        final SharedPreferences sp = c.getSharedPreferences(ShellActivity.PREFS, Context.MODE_PRIVATE);
        ShellCore.Store st = new ShellCore.Store() {
            @Override public String get(String k, String d) { try { return sp.getString(k, d); } catch (Throwable t) { return d; } }
            @Override public void put(String k, String v) { try { if (sync) sp.edit().putString(k, v).commit(); else sp.edit().putString(k, v).apply(); } catch (Throwable ignored) { } }
        };
        String m = e == null ? "알 수 없는 오류" : (e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : ""));
        String f = "", s = "";
        StackTraceElement[] tr = e == null ? null : e.getStackTrace();
        if (tr != null && tr.length > 0) {
            f = tr[0].getFileName() + ":" + tr[0].getLineNumber();
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < tr.length && i < 6; i++) { if (i > 0) b.append('\n'); b.append(tr[i].getClassName().replace("com.dullyyj.subway.", "")).append('.').append(tr[i].getMethodName()).append(':').append(tr[i].getLineNumber()); }
            s = b.toString();
        }
        String t = new SimpleDateFormat("MM-dd HH:mm", Locale.KOREA).format(new Date());
        ErrCore.add(st, t, m, f, s);
    }
}
