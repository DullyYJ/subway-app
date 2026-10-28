package com.dullyyj.subway;

/**
 * "가장 나중 것만 쓴다"(latest-wins) 도우미 — 순수 자바(android.* 없음), 어느 스레드에서 불러도 된다. (s291)
 * 코루틴의 취소(`collectLatest`)와 같은 생각이다: 새 일을 시작(begin)하면 앞서 하던 일의 표(Token)가 죽고, 죽은 표를 가진 일은 결과를 내놓지 않는다.
 *   · 예전에는 일마다 순번표(int)를 두고 "내 번호가 아직 최신인가"를 흩어진 곳에서 비교했다 — 하나라도 빠뜨리면 늦게 온 옛 방 화면이 올라왔다.
 *     이제는 일이 시작될 때 표를 받고, 결과를 올리기 직전 `live()` 한 곳만 보면 된다.
 *   · 표에 onCancel(...)을 걸어 두면 취소되는 순간 불린다 — 오래 걸리는 서버 요청(롱폴)을 그 자리에서 끊어 연결과 전지를 아낀다.
 */
public final class Latest {
    public static final class Token {
        private volatile boolean dead;
        private Runnable onCancel;
        Token() { }
        /** 아직 최신인가(취소되지 않았다). */
        public boolean live() { return !dead; }
        /** 취소될 때 한 번 불릴 일을 건다. 이미 취소됐다면 바로 부른다. */
        public void onCancel(Runnable r) {
            boolean now;
            synchronized (this) { onCancel = r; now = dead; }
            if (now && r != null) run(r);
        }
        void kill() {
            Runnable r;
            synchronized (this) { if (dead) return; dead = true; r = onCancel; onCancel = null; }
            if (r != null) run(r);
        }
        private static void run(Runnable r) { try { r.run(); } catch (Throwable ignored) { } }
    }

    private Token cur;

    /** 새 일을 시작한다 — 앞선 일의 표는 죽는다. */
    public synchronized Token begin() {
        if (cur != null) cur.kill();
        cur = new Token();
        return cur;
    }
    /** 지금 하는 일을 취소한다(새 일 없이). */
    public synchronized void cancel() {
        if (cur != null) { cur.kill(); cur = null; }
    }
    /** t 가 아직 가장 나중 일의 표인가. */
    public synchronized boolean isCurrent(Token t) { return t != null && t == cur && t.live(); }
}
