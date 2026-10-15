package com.dullyyj.subway;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 위젯의 알람·재부팅. 알람(ACTION_TICK)이 출퇴근 장면을 열고 동물들을 깨운다(앱 프로세스도 되살린다). (옛 ACTION_POKE 는 이미 깔린 위젯의 낡은 버튼용으로만 남김) */
public class GdmWidgetReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent it) {
        String a = it == null ? null : it.getAction();
        if (a == null) return;
        if (WidgetCore.ACTION_POKE.equals(a)) { WidgetCore.evalScene(c); WidgetCore.refreshAll(c, true); WidgetCore.wake(c, "poke"); return; }
        // 알람(출퇴근 시각 · 장면 끝 · 10분마다) · 재부팅 · 시간/시간대 바뀜 · 앱 업데이트
        WidgetCore.evalScene(c);
        WidgetCore.refreshAll(c, true);
        WidgetCore.scheduleNext(c);
        WidgetCore.wake(c, "alarm");
    }
}
