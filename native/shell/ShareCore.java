package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 내 위치 공유(순수 자바): 엔진 ride-standby 가 overlay.share 로 준 재료({text, from, cur, to, arr, rem, stations[{n,t}], hit, moving, left, next})를 읽고,
 * 그림에 넣을 압축 타임라인 칸을 고른다(출발역 · 지금 역 앞뒤 · 도착역만 남기고 사이는 "··· 몇 역"). 글과 값은 엔진이 정한다 — 여기는 읽고 고르기만.
 */
public final class ShareCore {
    private ShareCore() { }

    public static final class Share {
        public String text = "", from = "", cur = "", to = "", arr = "", rem = "", next = "";
        public String foot = "", lbT = "", lbA = "", lbR = "";                       // 그림 아래 한 줄 · 글머리 — 엔진이 정한 글(s207)
        public final List<String> names = new ArrayList<String>(), times = new ArrayList<String>();
        public int hit, left;
        public boolean moving;
    }

    @SuppressWarnings("unchecked")
    public static Share parse(String json) {
        try { return fromMap(ScreenCore.parse(json)); } catch (ScreenCore.ParseError e) { return null; }
    }

    /** 엔진 overlay.share 객체 → 재료. 모양이 안 맞으면 null(공유 버튼이 안 보인다). */
    @SuppressWarnings("unchecked")
    public static Share fromMap(Object o) {
        {
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            Share s = new Share();
            s.text = BoardCore.s(m.get("text"), 300); s.from = BoardCore.s(m.get("from"), 60); s.cur = BoardCore.s(m.get("cur"), 120); s.to = BoardCore.s(m.get("to"), 60);
            s.arr = BoardCore.s(m.get("arr"), 12); s.rem = BoardCore.s(m.get("rem"), 12); s.next = BoardCore.s(m.get("next"), 60);
            s.moving = Boolean.TRUE.equals(m.get("moving"));
            s.foot = BoardCore.s(m.get("foot"), 80);
            if (m.get("lb") instanceof Map) { Map<String, Object> lb = (Map<String, Object>) m.get("lb"); s.lbT = BoardCore.s(lb.get("t"), 30); s.lbA = BoardCore.s(lb.get("a"), 30); s.lbR = BoardCore.s(lb.get("r"), 30); }
            if (!(m.get("stations") instanceof List)) return null;
            for (Object x : (List<Object>) m.get("stations")) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> sm = (Map<String, Object>) x;
                String n = BoardCore.s(sm.get("n"), 60);
                if (n.length() == 0) continue;
                s.names.add(n); s.times.add(BoardCore.s(sm.get("t"), 12));
                if (s.names.size() >= 200) break;
            }
            if (s.names.isEmpty() || s.text.length() == 0) return null;
            int n = s.names.size();
            s.hit = m.get("hit") instanceof Number ? Math.max(0, Math.min(n - 1, ((Number) m.get("hit")).intValue())) : 0;
            s.left = m.get("left") instanceof Number ? Math.max(0, ((Number) m.get("left")).intValue()) : Math.max(0, n - 1 - s.hit);
            return s;
        }
    }

    /** 그림에 그릴 칸: 값 ≥ 0 이면 역 번호, 값 < 0 이면 -(건너뛴 역 수). 출발 · 도착 · 지금 역과 그 앞뒤만. */
    public static int[] slots(int n, int hit) {
        if (n <= 0) return new int[0];
        boolean[] want = new boolean[n];
        want[0] = true; want[n - 1] = true; want[Math.max(0, Math.min(n - 1, hit))] = true;
        if (hit - 1 >= 0) want[hit - 1] = true;
        if (hit + 1 < n) want[hit + 1] = true;
        List<Integer> out = new ArrayList<Integer>();
        int prev = -1;
        for (int i = 0; i < n; i++) {
            if (!want[i]) continue;
            if (prev >= 0 && i - prev > 1) out.add(-(i - prev - 1));
            out.add(i);
            prev = i;
        }
        int[] r = new int[out.size()];
        for (int i = 0; i < r.length; i++) r[i] = out.get(i);
        return r;
    }

    /** 그림 아래 한 줄. */
    public static String footer(Share s) { return s.foot; }
}
