package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 출퇴근 브리핑 알람이 울렸을 때 · 재부팅/앱 업데이트 뒤에 알람을 다시 거는 수신기 (2026-10-21 s104). 일은 CommuteAlarm 이 한다. */
public final class CommuteReceiver extends BroadcastReceiver {
    @Override public void onReceive(final Context c, Intent i) {
        final String act = i == null ? "" : String.valueOf(i.getAction());
        final String kind = i == null ? "morn" : String.valueOf(i.getStringExtra(CommuteAlarm.EXTRA_KIND));
        final PendingResult pr = goAsync();
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    if (CommuteAlarm.ACT_FIRE.equals(act)) {
                        if (CmCore.on(CommuteAlarm.store(c))) CommuteAlarm.send(c, "eve".equals(kind) ? "eve" : "morn");
                    }
                    CommuteAlarm.reschedule(c);            // 알람이 울렸든(앞으로 밀기) 재부팅이든 새로 건다
                } catch (Throwable ignored) { }
                finally { pr.finish(); }
            }
        }, "cm-recv").start();
    }
}
