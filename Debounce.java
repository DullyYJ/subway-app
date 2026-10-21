package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.HashMap;
import java.util.Map;

/**
 * 디바운스 · 연타 막기 (2026-10-22 s132) — 순수 자바(안드로이드를 쓰지 않아 JVM 에서 그대로 시험한다). 한 스레드(주 스레드)에서만 부른다.
 *
 *  trailing(key, ms, task): 같은 key 로 ms 안에 또 부르면 앞의 것은 취소하고 마지막 것만 — 입력이 끝난 뒤 한 번만 실행한다(글자를 칠 때마다 통신이 나가지 않게).
 *  gate(key, ms)          : 처음 한 번만 통과하고, ms 안에 다시 오는 같은 key 는 막는다(버튼 연타).
 * 시계와 예약은 Clock 이 한다 — 앱은 주 스레드 예약으로, 시험은 가짜 시계로.
 */
final class Debounce {
    interface Clock { long now(); void post(Runnable r, long delayMs); void cancel(Runnable r); }

    static final long TYPE_MS = 300L;       // 글자 입력 · 위치 변경이 멈춘 뒤 기다리는 시간
    static final long TAP_MS = 350L;        // 같은 버튼을 이 안에 또 누르면 한 번으로 본다
    static final long TAB_GAP_MS = 120L;    // 탭을 연달아 옮길 때 새로 받기를 미루는 시간(캐시 화면은 0초에 먼저 올라간다)

    private final Clock clk;
    private final Map<String, Runnable> pend = new HashMap<String, Runnable>();
    private final Map<String, Long> last = new HashMap<String, Long>();

    Debounce(Clock c) { clk = c; }

    /** 마지막으로 부른 뒤 ms 가 지나면 task 를 한 번 실행한다. 그 안에 같은 key 로 또 부르면 앞의 것은 사라진다. */
    void trailing(final String key, long ms, final Runnable task) {
        Runnable old = pend.remove(key);
        if (old != null) clk.cancel(old);
        Runnable w = new Runnable() {
            @Override public void run() {
                if (pend.get(key) != this) return;          // 이미 다른 것으로 바뀌었거나 취소됐다
                pend.remove(key);
                task.run();
            }
        };
        pend.put(key, w);
        clk.post(w, Math.max(0L, ms));
    }

    boolean pending(String key) { return pend.containsKey(key); }

    void cancel(String key) {
        Runnable old = pend.remove(key);
        if (old != null) clk.cancel(old);
    }

    void cancelAll() {
        for (Runnable r : pend.values()) clk.cancel(r);
        pend.clear();
    }

    /** 통과하면 true(이 시각을 기억한다). 같은 key 가 ms 안에 다시 오면 false. */
    boolean gate(String key, long ms) {
        long n = clk.now();
        Long t = last.get(key);
        if (t != null && n >= t && n - t < ms) return false;
        last.put(key, n);
        return true;
    }
}
