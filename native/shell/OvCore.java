package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 떠 있는 안내(오버레이) 값 읽기 — 순수 자바. 글·색·점 모양·현위치 칸·경고 단계는 모두 엔진(/ride-standby 의 overlay)이 정한 값이고,
 * 여기는 그 JSON(Map)을 모델로 옮기고 화면에 맞는 칸 위치(다섯 칸 창)만 고른다. 그리는 일은 RideOverlay 가 한다.
 */
public final class OvCore {
    private OvCore() { }

    public static final int COLS = 5;

    public static final class Cell {
        public String n = "", t = "", g = "";
        public boolean pill, hasL, hasR;
        public int gc = 0xFF8E8E93, lc = 0xFF8E8E93, rc = 0xFF8E8E93, dc = 0xFF0A84FF, dk = 1;
    }
    /** 하단 줄: 0 없음 · 1 하차 추천([보기][확인]) · 2 내릴 준비([앱 종료]). 글·버튼 이름·캐릭터는 엔진이 정한다. */
    public static final class Row {
        public int kind;
        public String ch = "", a = "", b = "", m = "", go = "", ok = "", end = "";
        public long at;
    }
    public static final class Ov {
        public boolean active, moving, pre, alertVibe;
        public String line1 = "", line2 = "", line3 = "", pill = "", pillTxt = "", banner = "", destName = "";
        public int alert, cur, base;
        public long alertAt;
        public Cell[] cells = new Cell[0];
        public boolean hasTheme;
        public int bg = 0xFF1C1C1E, fg = 0xFFF2F2F7, sub = 0xFF8E8E93;
        public String rsSt = "hidden", rsBt = "", rsK = "", rsNm = "";
        public boolean rsEnd;
        // 앱 탑승 시트(RsSheetView)가 그릴 값 — 모두 엔진(/ride-standby overlay.rs)이 정한다
        public String rsKick = "", rsMode = "", rsChip = "";
        public int rsCbg = 0xFF0A84FF, rsCfg = 0xFFFFFFFF;
        public float rsBar = -1f;
        public boolean rsX, rsLate;
        public Row row = new Row();
    }

    /** "#rgb" · "#rrggbb" · "#aarrggbb" → 0xAARRGGBB, 못 읽으면 def. */
    public static int color(Object o, int def) {
        if (!(o instanceof String)) return def;
        String s = ((String) o).trim();
        if (!s.startsWith("#")) return def;
        s = s.substring(1);
        try {
            if (s.length() == 3) { int v = Integer.parseInt(s, 16); return 0xFF000000 | (((v >> 8) & 15) * 17) << 16 | (((v >> 4) & 15) * 17) << 8 | ((v & 15) * 17); }
            if (s.length() == 6) return 0xFF000000 | Integer.parseInt(s, 16);
            if (s.length() == 8) return (int) Long.parseLong(s, 16);
        } catch (NumberFormatException e) { return def; }
        return def;
    }

    /** 엔진 overlay 객체 → 모델. 객체가 아니거나 active 가 아니면 active=false 인 빈 모델. */
    @SuppressWarnings("unchecked")
    public static Ov fromMap(Object o) {
        Ov v = new Ov();
        if (!(o instanceof Map)) return v;
        Map<String, Object> m = (Map<String, Object>) o;
        v.line1 = BoardCore.s(m.get("line1"), 60); v.line2 = BoardCore.s(m.get("line2"), 60); v.line3 = BoardCore.s(m.get("line3"), 60);
        v.pill = BoardCore.s(m.get("pill"), 40); v.pillTxt = BoardCore.s(m.get("pillTxt"), 60); v.alertVibe = Boolean.TRUE.equals(m.get("alertVibe")); v.banner = BoardCore.s(m.get("banner"), 60); v.destName = BoardCore.s(m.get("destName"), 40);
        v.active = Boolean.TRUE.equals(m.get("active")) && v.line1.length() > 0;
        v.moving = Boolean.TRUE.equals(m.get("moving")); v.pre = Boolean.TRUE.equals(m.get("pre"));
        v.alert = m.get("alert") instanceof Number ? Math.max(0, Math.min(2, ((Number) m.get("alert")).intValue())) : 0;
        v.alertAt = m.get("alertAt") instanceof Number ? ((Number) m.get("alertAt")).longValue() : 0L;
        v.base = m.get("base") instanceof Number ? Math.max(0, ((Number) m.get("base")).intValue()) : 0;
        List<Cell> cs = new ArrayList<Cell>();
        if (m.get("cells") instanceof List) {
            for (Object x : (List<Object>) m.get("cells")) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> cm = (Map<String, Object>) x;
                Cell c = new Cell();
                c.n = BoardCore.s(cm.get("n"), 24); c.t = BoardCore.s(cm.get("t"), 8); c.g = BoardCore.s(cm.get("g"), 14);
                c.pill = Boolean.TRUE.equals(cm.get("gp"));
                c.gc = color(cm.get("gc"), c.gc);
                c.hasL = cm.get("lc") instanceof String && ((String) cm.get("lc")).length() > 0; c.lc = color(cm.get("lc"), c.lc);
                c.hasR = cm.get("rc") instanceof String && ((String) cm.get("rc")).length() > 0; c.rc = color(cm.get("rc"), c.rc);
                c.dc = color(cm.get("dc"), c.dc);
                c.dk = cm.get("dk") instanceof Number ? Math.max(0, Math.min(3, ((Number) cm.get("dk")).intValue())) : 1;
                cs.add(c);
                if (cs.size() >= 150) break;
            }
        }
        v.cells = cs.toArray(new Cell[0]);
        v.cur = m.get("cur") instanceof Number ? Math.max(0, Math.min(Math.max(0, v.cells.length - 1), ((Number) m.get("cur")).intValue())) : 0;
        if (m.get("theme") instanceof Map) {
            Map<String, Object> t = (Map<String, Object>) m.get("theme");
            v.hasTheme = true; v.bg = color(t.get("bg"), v.bg); v.fg = color(t.get("fg"), v.fg); v.sub = color(t.get("sub"), v.sub);
        }
        if (m.get("rs") instanceof Map) {
            Map<String, Object> r = (Map<String, Object>) m.get("rs");
            v.rsSt = BoardCore.s(r.get("st"), 10); v.rsBt = BoardCore.s(r.get("bt"), 12); v.rsK = BoardCore.s(r.get("k"), 40); v.rsNm = BoardCore.s(r.get("nm"), 24); v.rsEnd = Boolean.TRUE.equals(r.get("end"));
            if (v.rsSt.length() == 0) v.rsSt = "hidden";
            v.rsKick = BoardCore.s(r.get("kick"), 48); v.rsMode = BoardCore.s(r.get("mode"), 4); v.rsChip = BoardCore.s(r.get("chip"), 16);
            v.rsCbg = color(r.get("cbg"), v.rsCbg); v.rsCfg = color(r.get("cfg"), v.rsCfg);
            v.rsBar = r.get("bar") instanceof Number ? Math.max(-1f, Math.min(1f, ((Number) r.get("bar")).floatValue())) : -1f;
            v.rsX = r.get("x") instanceof Number && ((Number) r.get("x")).intValue() == 1; v.rsLate = Boolean.TRUE.equals(r.get("late"));
        }
        Object go = m.get("getoff"), rc = m.get("reco");
        if (go instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) go).get("on")) && BoardCore.s(((Map<String, Object>) go).get("a"), 30).length() > 0) {
            Map<String, Object> g = (Map<String, Object>) go;
            v.row.kind = 2; v.row.ch = chId(g.get("ch")); v.row.a = BoardCore.s(g.get("a"), 30); v.row.b = BoardCore.s(g.get("b"), 60);
            v.row.end = BoardCore.s(g.get("end"), 10); if (v.row.end.length() == 0) v.row.end = "앱 종료";
            v.row.at = g.get("at") instanceof Number ? ((Number) g.get("at")).longValue() : 0L;
        } else if (rc instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) rc).get("on")) && BoardCore.s(((Map<String, Object>) rc).get("a"), 40).length() > 0) {
            Map<String, Object> g = (Map<String, Object>) rc;
            v.row.kind = 1; v.row.ch = chId(g.get("ch")); v.row.a = BoardCore.s(g.get("a"), 40); v.row.b = BoardCore.s(g.get("b"), 64); v.row.m = BoardCore.s(g.get("m"), 32);
            v.row.go = BoardCore.s(g.get("go"), 10); if (v.row.go.length() == 0) v.row.go = "맛집 보기";
            v.row.ok = BoardCore.s(g.get("ok"), 10); if (v.row.ok.length() == 0) v.row.ok = "확인";
            v.row.at = g.get("at") instanceof Number ? ((Number) g.get("at")).longValue() : 0L;
        }
        return v;
    }
    /** 캐릭터 이름은 자산에 있는 여섯 가지만(아니면 빈 글 → 그림 없이 글만). */
    static String chId(Object o) {
        String s = BoardCore.s(o, 12);
        return ("dolsom".equals(s) || "lovel".equals(s) || "dudung".equals(s) || "sul".equals(s) || "ppopu".equals(s) || "chaeng".equals(s)) ? s : "";
    }

    /** 평소 막대(칸 줄이 없을 때): 줄 글만 가진 모델(개발자 도구 · 엔진이 칸을 안 준 경우). */
    public static Ov plain(boolean on, String l1, String l2, String banner, int alert) {
        Ov v = new Ov();
        v.active = on && l1 != null && l1.length() > 0;
        v.line1 = l1 == null ? "" : l1; v.line2 = l2 == null ? "" : l2; v.banner = banner == null ? "" : banner;
        v.alert = Math.max(0, Math.min(2, alert));
        return v;
    }

    /** 현위치 칸이 가운데(다섯 칸 중 셋째)에 오는 맨 왼쪽 칸 위치(경로 전체 기준, 칸 단위). */
    public static float centerPos(int cur, int base, int n) { return clampPos(base + cur - COLS / 2, base, n); }
    /** 스크롤 위치를 [base, base+n-5] 안으로. 칸이 다섯 이하면 base 고정. */
    public static float clampPos(float p, int base, int n) {
        float hi = Math.max(base, base + n - COLS);
        return p < base ? base : (p > hi ? hi : p);
    }
    /** 접힌 알약에 보일 글: 이동 중 문구 → 현위치 칸 이름 → 첫 줄. */
    public static String pillText(Ov v) {
        if (v.pillTxt.length() > 0) return v.pillTxt;      // 엔진이 만든 한 줄(대기 · 탈 것 / 현위치 · 도착 시각)
        if (v.pill.length() > 0) return v.pill;
        if (v.cells.length > 0 && v.cur < v.cells.length && v.cells[v.cur].n.length() > 0) return v.cells[v.cur].n;
        return v.line1;
    }
    /** 칸 줄을 그릴 수 있나. */
    public static boolean hasStrip(Ov v) { return v.cells.length > 0; }
    /** 도착 줄([안내 종료] 버튼)이 보이는 상태인가. */
    public static boolean arrived(Ov v) { return "board".equals(v.rsSt) && v.rsEnd && v.rsBt.length() > 0; }
    /** 앱 탑승 시트가 보일 상태인가(올라온 시트 · 기록 직후 되돌리기 · 대기 알약). 도착 줄(안내 종료)은 앱에서는 따로 있으니 제외. */
    public static boolean rsShown(Ov v) { return v != null && !v.rsEnd && ("board".equals(v.rsSt) || "wait".equals(v.rsSt) || "undo".equals(v.rsSt)); }
    /** 경고 테두리 한 바퀴 시간(ms): 2정거장 전 6초 · 1정거장 전 1.1초(웹과 같다), 없으면 0. */
    public static long spinMs(int alert) { return alert == 1 ? 1100L : (alert == 2 ? 6000L : 0L); }
}
