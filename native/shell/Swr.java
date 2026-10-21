package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Stale-While-Revalidate 글 보관함 (2026-10-22 s132) — 순수 자바(JVM 시험). 한 스레드(주 스레드)에서만 부른다.
 *
 * 같은 요청을 다시 할 때 마지막으로 받은 글(stale)을 기다림 없이 먼저 보이고, 새 글은 뒤에서 받아(revalidate) 조용히 바꾼다.
 *  FRESH : freshMs 안 — 그대로 쓰고 통신하지 않는다.
 *  STALE : staleMs 안 — 먼저 보이고, 뒤에서 새로 받는다.
 *  MISS  : 없거나 너무 낡았다 — 평소처럼 기다려 받는다(낡은 글은 지운다).
 * 무엇이 옛 글인지(열쇠)와 어떤 글을 받을지는 부르는 쪽(엔진이 준 주소)이 정한다. 용량이 차면 가장 오래 안 쓴 것부터 버린다.
 */
final class Swr {
    static final int FRESH = 0, STALE = 1, MISS = 2;

    static final class Hit {
        final int state; final String body; final long at;
        Hit(int s, String b, long a) { state = s; body = b; at = a; }
    }
    private static final Hit NONE = new Hit(MISS, "", 0L);

    private static final class Ent { final String body; final long at; Ent(String b, long a) { body = b; at = a; } }
    private final int cap;
    private final LinkedHashMap<String, Ent> m;

    Swr(int capacity) {
        cap = Math.max(1, capacity);
        m = new LinkedHashMap<String, Ent>(16, 0.75f, true) {
            @Override protected boolean removeEldestEntry(Map.Entry<String, Ent> e) { return size() > cap; }
        };
    }

    void put(String key, String body, long now) {
        if (key == null || body == null || body.length() == 0) return;     // 빈 글은 옛 글을 지우지 않는다(받기 실패가 캐시를 비우지 않게)
        m.put(key, new Ent(body, now));
    }

    Hit get(String key, long now, long freshMs, long staleMs) {
        Ent e = key == null ? null : m.get(key);
        if (e == null) return NONE;
        long age = now - e.at;
        if (age < 0L) { m.remove(key); return NONE; }                       // 시계가 뒤로 갔다 — 믿지 않는다
        if (age <= freshMs) return new Hit(FRESH, e.body, e.at);
        if (age <= staleMs) return new Hit(STALE, e.body, e.at);
        m.remove(key);
        return NONE;
    }

    void drop(String key) { m.remove(key); }
    void clear() { m.clear(); }
    int size() { return m.size(); }
}
