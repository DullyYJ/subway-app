package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import static com.dullyyj.subway.RideJs.*;

/**
 * engine/ride-standby.js + engine/arrive-reco.js 의 자바 포팅 — 탑승 중 5초 판정(영점 · 도착 시각 · 알림 · 오버레이 · 탑승 줄 · 하차 추천 판단).
 *
 * ★ 2026-10-22 (YJ 확정 아키텍처): 탑승이 확정된 뒤에는 외부 서버 요청을 일체 하지 않는다 — 시각표(state)는 이미 폰에 있고,
 *   이 엔진이 폰 안에서 마커를 시각표대로 전진시키고 GPS 로 영점만 맞춘다(서버 호출 0). 서버에서 같은 코드가 돌던 그대로이고(상태는 요청에 실려 오가는 무상태 함수),
 *   입출력은 JSON 과 같은 모양이라 RideCore 는 그대로다. 시험은 서버 JS 엔진과 같은 입력으로 결과를 맞춰 본다(test/java/RideLocalJvmTest).
 *   서버가 필요한 것은 오직 '탑승 버튼'을 눌렀을 때의 시각표 조회(pressTT) 하나뿐이다 — rsPressQuery 가 그 질문을 만든다.
 */
final class RideStandbyJ {
    private RideStandbyJ() { }

    // ── 조정값(RIDE_STANDBY_DEFAULTS) ──
    static final double trailMax = 60, trailMaxAgeSec = 600, notYetKeepSec = 45, gpsGapDeadReckonSec = 180, offGiveUpSec = 900, doneAfterSec = 180, maxStaleSec = 3 * 3600,
        stepMs = 5000, nearStepMs = 2500, nearBeforeSec = 30, nearAfterSec = 40,
        waitNearM = 150, waitAwayM = 400, waitMoveMps = 4.0, waitSpanSec = 15, waitWinSec = 60, waitFreshSec = 25, waitStartLateSec = 90, waitGraceSec = 480;
    static final String ongoingTitle = "길동무 경로 안내 중";
    static final double RS_LEAD_MS = 120000, RS_EARLY_MS = 90000, RS_SHRINK_MS = 180000, RS_ALIGHT_M = 150, RS_NEAR_M = 600, RS_LATE_BACK_MIN = 1, RS_PICK_MAX_MIN = 12;
    private static final String[] RS_CHARS = { "dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng" };

    // ── 작은 도우미 ──
    static String clampTxt(Object s0, int n) { String s = s0 == null ? "" : str(s0); return s.length() > n ? s.substring(0, n - 1) + "…" : s; }
    static String charOf(double at) { return RS_CHARS[(int) (Math.abs(Math.floor((truthy(d(at)) ? at : 0) / 1000)) % RS_CHARS.length)]; }
    static String or(Object a, String b) { return truthy(a) ? str(a) : b; }
    static double etaAt(Object etaMs, int i) { Object v = at(etaMs, i); return v == null ? Double.NaN : num(v); }
    static boolean hasEta(Object etaMs, int i) { Object v = at(etaMs, i); return v != null && fin(v); }
    private static Map<String, Object> mm(Object o) { return m(o); }

    // ═════════════ 알림 ═════════════
    static String minTxt(Object etaMs, int idx, double now, int remain) {
        if (remain == 0 || etaMs == null || at(etaMs, idx) == null) return "";
        double td = (etaAt(etaMs, idx) - now) / 60000;
        return (td >= 0 && td < 4) ? " (약 " + ns(Math.max(1, round(td))) + "분 후)" : "";
    }
    static String alertType(Map<String, Object> tg, int remain) {
        return "transfer".equals(tg.get("kind")) ? (remain == 2 ? "transfer2" : "transfer") : (remain == 2 ? "near_arrive2" : (remain == 1 ? "near_arrive" : "arrive"));
    }
    static final class Al { Map<String, Object> alert; List<String> extra = new ArrayList<String>(); int curPos = -1; }
    static Al alerts(Map<String, Object> cfg, Map<String, Object> fired, double curIdx, Object etaMs, double now) {
        List<Object> targets = l(cfg.get("targets")), seq = l(cfg.get("seq")); Map<String, Object> allowed = mm(cfg.get("allowed"));
        if (targets == null) targets = new ArrayList<Object>(); if (seq == null) seq = new ArrayList<Object>(); if (allowed == null) allowed = obj();
        Al res = new Al(); int curPos = -1, i;
        for (i = 0; i < seq.size(); i++) { if (num(seq.get(i)) <= curIdx) curPos = i; else break; }
        res.curPos = curPos;
        if (curPos < 0) return res;
        final List<Object[]> due = new ArrayList<Object[]>();            // {tg, remain, key, type}
        for (Object to : targets) {
            Map<String, Object> tg = mm(to); if (tg == null) continue;
            int remain = (int) (num(tg.get("seqPos")) - curPos);
            if (remain == 2 || remain == 1 || (remain == 0 && "dest".equals(tg.get("kind")))) {
                String type = alertType(tg, remain), key = ns(num(tg.get("nodeIdx"))) + "_" + remain;
                if (!truthy(fired.get(key)) && !Boolean.FALSE.equals(allowed.get(type))) due.add(new Object[] { tg, remain, key, type });
            }
        }
        if (due.isEmpty()) return res;
        Collections.sort(due, new Comparator<Object[]>() { @Override public int compare(Object[] a, Object[] b) { return (Integer) a[1] - (Integer) b[1]; } });
        Object[] dd = due.get(0); Map<String, Object> tg = (Map<String, Object>) dd[0]; int remain = (Integer) dd[1];
        String mt = minTxt(etaMs, (int) num(tg.get("nodeIdx")), now, remain), title, body; List<Object> vib;
        String nm = str(tg.get("name")), nl = or(tg.get("nextLine"), "다음 노선");
        if ("transfer".equals(tg.get("kind"))) {
            if (remain == 2) { title = "환승 2정거장 전"; body = nm + "에서 " + nl + " 환승이에요. 곧 준비하세요" + mt; vib = list(400, 150, 400); }
            else { title = "환승 준비"; body = "다음 정거장 " + nm + "에서 " + nl + " 환승 — 내릴 준비하세요" + mt; vib = list(300, 100, 300, 100, 300); }
        } else {
            if (remain == 2) { title = "목적지 2정거장 전"; body = nm + "까지 2정거장 남았어요" + mt; vib = list(400, 150, 400); }
            else if (remain == 1) { title = "곧 하차"; body = "다음 정거장 " + nm + " — 내릴 준비하세요" + mt; vib = list(300, 100, 300, 100, 300); }
            else { title = "목적지 도착"; body = nm + "에 도착했습니다. 수고하셨어요"; vib = list(300, 100, 300, 100, 300); }
        }
        res.alert = obj("key", dd[2], "type", dd[3], "title", title, "body", body, "vib", vib);
        for (int q = 1; q < due.size(); q++) res.extra.add((String) due.get(q)[2]);
        return res;
    }

    // ═════════════ 환승 구간 · 탑승 시트 ═════════════
    static final class Leg { int k, bi, ai; String mode, line, name; }
    static List<Leg> legsOf(Map<String, Object> eta) {
        List<Object> nodes = eta == null ? null : l(eta.get("nodes")); if (nodes == null) nodes = new ArrayList<Object>();
        List<Leg> out = new ArrayList<Leg>(); Leg cur = null;
        for (int i = 1; i < nodes.size(); i++) {
            Object n = nodes.get(i);
            if (!truthy(n) || truthy(g(n, "isWalk")) || !(truthy(g(n, "isSub")) || truthy(g(n, "isBus")))) { cur = null; continue; }
            String mode = truthy(g(n, "isSub")) ? "sub" : "bus", ln = or(g(n, "lineName"), "");
            if (cur != null && cur.mode.equals(mode) && cur.line.equals(ln)) cur.ai = i;
            else { cur = new Leg(); cur.k = out.size(); cur.bi = i; cur.ai = i; cur.mode = mode; cur.line = ln; cur.name = or(g(n, "name"), ""); out.add(cur); }
        }
        return out;
    }
    static double maxPass(Map<String, Object> eta) {
        List<Object> ps = eta == null ? null : l(eta.get("passes")); double m = -1;
        if (ps != null) for (Object p : ps) if (truthy(p) && gn(p, "idx") > m) m = gn(p, "idx");
        return m;
    }
    static Map<String, Object> stopOf(Map<String, Object> st, double i) {
        List<Object> stops = l(st.get("stops"));
        if (stops != null) for (Object s : stops) if (s != null && g(s, "i") != null && num(g(s, "i")) == i) return mm(s);
        return null;
    }
    static List<Object> trailOf(Map<String, Object> st) { List<Object> t = l(st.get("trail")); return t == null ? new ArrayList<Object>() : t; }
    static boolean alightGps(Map<String, Object> st, List<Object> tr, double bi) {
        Map<String, Object> s = stopOf(st, bi);
        if (s == null || tr.isEmpty() || !fin(s.get("lat")) || !fin(s.get("lng"))) return false;
        Object q = tr.get(tr.size() - 1), o = null;
        if (rsHav(num(at(q, 1)), num(at(q, 2)), num(s.get("lat")), num(s.get("lng"))) > RS_ALIGHT_M) return false;
        for (int i = tr.size() - 2; i >= 0; i--) if (num(at(q, 0)) - num(at(tr.get(i), 0)) >= 20000) { o = tr.get(i); break; }
        if (o == null || num(at(q, 0)) - num(at(o, 0)) > 120000) return false;
        return rsHav(num(at(o, 1)), num(at(o, 2)), num(at(q, 1)), num(at(q, 2))) / ((num(at(q, 0)) - num(at(o, 0))) / 1000) <= 2.5;
    }

    // ── 탑승 버튼 보정 ──
    static double pressTarget(Map<String, Object> st) {
        if (st == null) return -1;
        if (st.get("wait") != null) return gn(st.get("wait"), "i");
        if (st.get("xw") != null && st.get("xPend") == null) return gn(st.get("xw"), "i");
        return -1;
    }
    /** 시각표에 물을 것 { i, line, from, to, atMin, baseMs } — 지하철 구간이 아니거나 누르는 손짓이 아니면 null. 서버 호출이 필요한 유일한 경우를 가려낸다. */
    static Map<String, Object> pressQuery(Map<String, Object> req) {
        if (req == null || !"press".equals(req.get("act")) || mm(req.get("state")) == null || mm(mm(req.get("state")).get("eta")) == null || !fin(req.get("nowMs"))) return null;
        Map<String, Object> st = mm(req.get("state"));
        int i = (int) pressTarget(st); List<Object> nodes = l(mm(st.get("eta")).get("nodes")); if (nodes == null) nodes = new ArrayList<Object>();
        Object n = i >= 0 && i < nodes.size() ? nodes.get(i) : null, nx = i + 1 >= 0 && i + 1 < nodes.size() ? nodes.get(i + 1) : null;
        if (i < 0 || !truthy(n) || !truthy(g(n, "isSub")) || truthy(g(n, "isBus")) || !truthy(g(n, "lineName")) || !truthy(g(n, "name"))) return null;
        Object tzo = mm(st.get("eta")).get("tzOffsetMin");
        double tz = tzo != null && fin(tzo) ? num(tzo) : 540, now = num(req.get("nowMs"));
        double atMin = Math.floor((((now / 60000 + tz) % 1440) + 1440) % 1440);
        return obj("i", i, "line", g(n, "lineName"), "from", g(n, "name"), "to", truthy(nx) && truthy(g(nx, "name")) ? g(nx, "name") : "", "atMin", atMin, "baseMs", now);
    }
    static double pickMs(Map<String, Object> tt, double i, double now) {
        if (tt == null || num(tt.get("i")) != i) return now;
        Object late = tt.get("late"), dep = tt.get("depMin");
        double mn = (late != null && fin(late)) ? num(late) : ((dep != null && fin(dep)) ? num(dep) : Double.NaN);
        if (Double.isNaN(mn)) return now;
        double dd = mn - num(tt.get("nowM"));
        if (dd < -720) dd += 1440; if (dd > 720) dd -= 1440;
        if (dd > RS_PICK_MAX_MIN) return now;
        return now - (now % 60000) + dd * 60000 + 30000;
    }
    /** 승차역까지의 거리(m) — 위치나 좌표를 모르면 NaN. */
    static double distToStop(Map<String, Object> st, List<Object> tr, double i) {
        Map<String, Object> s = stopOf(st, i);
        if (s == null || tr.isEmpty() || !fin(s.get("lat")) || !fin(s.get("lng"))) return Double.NaN;
        Object q = tr.get(tr.size() - 1);
        return rsHav(num(at(q, 1)), num(at(q, 2)), num(s.get("lat")), num(s.get("lng")));
    }
    /** 눌러서(또는 예약 시각이 되어) 그 구간 차량을 탔다고 기록한다. 되돌릴 때 쓸 이전 통과 기록을 돌려준다. */
    static Map<String, Object> xCommit(Map<String, Object> st, double i, double now, double ms) {
        Map<String, Object> eta = mm(st.get("eta"));
        List<Object> passes = l(eta.get("passes")); if (passes == null) { passes = new ArrayList<Object>(); eta.put("passes", passes); }
        int hit = -1;
        for (int k = 0; k < passes.size(); k++) if (gn(passes.get(k), "idx") == i) { hit = k; break; }
        Map<String, Object> prev = hit >= 0 ? mm(passes.get(hit)) : null, np = obj("idx", i, "ms", !Double.isNaN(ms) ? ms : now, "src", "gps");
        if (hit >= 0) passes.set(hit, np); else passes.add(np);
        Map<String, Object> done = mm(st.get("rsDone")); if (done == null) { done = obj(); st.put("rsDone", done); }
        done.put(ik(i), 1.0);
        st.remove("xw"); st.remove("xPend"); st.put("rsOpen", 0.0);
        return prev;
    }
    static boolean doneAt(Map<String, Object> st, double bi) { Map<String, Object> d = mm(st.get("rsDone")); return d != null && truthy(d.get(ik(bi))); }

    /** 환승 대기: 아직 안 탄 첫 환승 구간이 있고 앞 구간을 내렸으면 st.xw. 예약(xPend)은 그 시각이 되면 확정한다. */
    static void xwait(Map<String, Object> st, List<Object> tr, double now, List<Object> notes) {
        Map<String, Object> eta = mm(st.get("eta"));
        if (st.get("wait") != null || eta == null) { st.remove("xw"); st.remove("xPend"); return; }
        List<Leg> legs = legsOf(eta); double pm = maxPass(eta); Leg L = null; int i;
        for (i = 1; i < legs.size(); i++) { if (pm >= legs.get(i).bi || doneAt(st, legs.get(i).bi)) continue; L = legs.get(i); break; }
        if (L == null) { st.remove("xw"); st.remove("xPend"); return; }
        Object etaMs = st.get("etaMs");
        double dep = hasEta(etaMs, L.bi) ? etaAt(etaMs, L.bi) : Double.NaN;
        if (Double.isNaN(dep)) { Map<String, Object> sp = stopOf(st, L.bi); dep = sp != null && fin(sp.get("arrMs")) ? num(sp.get("arrMs")) : Double.NaN; }
        double prevAt = hasEta(etaMs, L.bi - 1) ? etaAt(etaMs, L.bi - 1) : Double.NaN;
        if (Double.isNaN(dep) || !(pm >= L.bi - 1 || (!Double.isNaN(prevAt) && prevAt <= now) || alightGps(st, tr, L.bi))) {
            st.remove("xw");
            if (st.get("xPend") != null && gn(st.get("xPend"), "i") != L.bi) st.remove("xPend");
            return;
        }
        Map<String, Object> old = mm(st.get("xw")), keep = (old != null && gn(old, "i") == L.bi) ? old : null;
        st.put("xw", obj("i", L.bi, "k", L.k, "mode", L.mode, "line", L.line, "name", L.name, "arrMs", dep, "seen", keep != null && truthy(keep.get("seen")), "shr", keep != null && truthy(keep.get("shr"))));
        if (st.get("xPend") != null && gn(st.get("xPend"), "i") == L.bi && dep - now <= RS_EARLY_MS) {
            Map<String, Object> pv = xCommit(st, L.bi, now, Double.NaN); notes.add("환승 예약 확정(" + L.bi + "번)");
            if (st.get("rsUndo") != null && truthy(mm(st.get("rsUndo")).get("x"))) mm(st.get("rsUndo")).put("prev", pv);
        }
    }
    static String contrast(Object hex) {
        String h = hex == null ? "" : str(hex);
        if (h.startsWith("#")) h = h.substring(1);
        if (h.length() != 6 || !h.matches("[0-9a-fA-F]{6}")) return "#ffffff";
        int n = Integer.parseInt(h, 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? "#121214" : "#ffffff";
    }

    // ═════════════ 앱이 알려 준 추천 줄 · 닫기 · 탑승 줄 손짓 ═════════════
    static void acts(Map<String, Object> st, Map<String, Object> req, double now, List<Object> notes) {
        Object rc = req.get("rc"); Map<String, Object> eta = mm(st.get("eta")); int k;
        Map<String, Object> ru = mm(st.get("rsUndo"));
        if (ru != null && now >= num(ru.get("until"))) st.remove("rsUndo");
        if (rc instanceof Map && str(g(rc, "a")).length() > 0) {
            String sig = str(g(rc, "a")) + "|" + str(g(rc, "b"));
            Map<String, Object> ad = mm(st.get("rcAd"));
            if (ad == null || !sig.equals(ad.get("sig")))
                st.put("rcAd", obj("sig", sig, "at", now, "a", clampTxt(g(rc, "a"), 40), "b", clampTxt(g(rc, "b"), 64), "m", clampTxt(g(rc, "m"), 32), "go", "쿠팡 보기".equals(g(rc, "go")) ? "쿠팡 보기" : "맛집 보기"));
        }
        if (fin(req.get("rcDis")) && num(req.get("rcDis")) > 0) st.put("rcDis", num(req.get("rcDis")));
        Object a = req.get("act");
        Map<String, Object> xw = mm(st.get("xw"));
        if ("open".equals(a) || "pill".equals(a)) { st.put("rsOpen", now + 20000); if (xw != null) xw.put("shr", Boolean.FALSE); }
        else if ("close".equals(a)) {
            st.put("rsOpen", 0.0);
            if (xw != null && xw.get("arrMs") != null && num(xw.get("arrMs")) - now <= RS_LEAD_MS) xw.put("shr", Boolean.TRUE);
        }
        else if ("press".equals(a) && st.get("wait") == null && xw != null && st.get("xPend") == null) {
            Map<String, Object> x = xw, tt = (mm(req.get("pressTT")) != null && num(mm(req.get("pressTT")).get("i")) == num(x.get("i"))) ? mm(req.get("pressTT")) : null;
            double dN = distToStop(st, trailOf(st), num(x.get("i")));
            boolean lateHit = tt != null && tt.get("late") != null && !(!Double.isNaN(dN) && dN > RS_NEAR_M);
            if (!lateHit && x.get("arrMs") != null && num(x.get("arrMs")) - now > RS_EARLY_MS) {
                st.put("xPend", obj("i", x.get("i"), "at", now)); st.put("rsOpen", 0.0); x.put("seen", Boolean.TRUE);
                st.put("rsUndo", obj("w", obj("i", x.get("i")), "x", Boolean.TRUE, "pend", Boolean.TRUE, "prev", null, "until", now + 20000));
                notes.add("환승 예약(" + ns(num(x.get("i"))) + "번 · 도착 " + ns(round((num(x.get("arrMs")) - now) / 1000)) + "초 전)");
            } else {
                Map<String, Object> ruN = obj("w", obj("i", x.get("i")), "x", Boolean.TRUE, "prev", null, "until", now + 20000);
                double pk = pickMs(tt != null && (Double.isNaN(dN) || dN <= RS_NEAR_M || tt.get("late") == null) ? tt : null, num(x.get("i")), now);
                ruN.put("prev", xCommit(st, num(x.get("i")), now, pk));
                st.put("rsUndo", ruN);
                notes.add("환승 수동 확정(" + ns(num(x.get("i"))) + "번)" + (lateHit ? " · 방금 떠난 차 인정" : ""));
                pressVerify(st, num(x.get("i")), now, notes);
            }
        } else if ("undo".equals(a) && st.get("rsUndo") != null && now < num(mm(st.get("rsUndo")).get("until")) && truthy(mm(st.get("rsUndo")).get("x"))) doUndo(st, now, notes);
        else if ("press".equals(a) && st.get("wait") != null) {
            Map<String, Object> w = mm(st.get("wait")); List<Object> passes = l(eta.get("passes")); if (passes == null) { passes = new ArrayList<Object>(); eta.put("passes", passes); }
            Map<String, Object> tw = (mm(req.get("pressTT")) != null && num(mm(req.get("pressTT")).get("i")) == num(w.get("i"))) ? mm(req.get("pressTT")) : null;
            double dW = distToStop(st, trailOf(st), num(w.get("i")));
            int hit = -1;
            for (k = 0; k < passes.size(); k++) if (gn(passes.get(k), "idx") == num(w.get("i"))) { hit = k; break; }
            st.put("rsUndo", obj("w", w, "prev", hit >= 0 ? passes.get(hit) : null, "until", now + 20000));
            double pk = pickMs(tw != null && !(!Double.isNaN(dW) && dW > RS_NEAR_M && tw.get("late") != null) ? tw : null, num(w.get("i")), now);
            Map<String, Object> np = obj("idx", w.get("i"), "ms", pk, "src", "gps");
            if (hit >= 0) passes.set(hit, np); else passes.add(np);
            eta.put("boarded", Boolean.TRUE); eta.put("notDeparted", Boolean.FALSE); st.remove("wait"); st.put("rsOpen", 0.0);
            notes.add("승차 수동 확정(오버레이 탑승 버튼)" + (pk != now ? " · 시각표 " + ns(round((pk - now) / 1000)) + "초" : ""));
            pressVerify(st, num(w.get("i")), now, notes);
        } else if ("undo".equals(a) && st.get("rsUndo") != null && now < num(mm(st.get("rsUndo")).get("until")) && !truthy(mm(st.get("rsUndo")).get("x"))) doUndo(st, now, notes);
    }
    static void doUndo(Map<String, Object> st, double now, List<Object> notes) {
        Map<String, Object> eta = mm(st.get("eta")), ux = mm(st.get("rsUndo"));
        List<Object> pxs = l(eta.get("passes")); if (pxs == null) pxs = new ArrayList<Object>();
        if (ux == null) return;
        double wi = num(mm(ux.get("w")).get("i")); int ki;
        if (truthy(ux.get("x"))) {
            if (truthy(ux.get("pend"))) st.remove("xPend");
            else {
                for (ki = pxs.size() - 1; ki >= 0; ki--) if (gn(pxs.get(ki), "idx") == wi) { if (ux.get("prev") != null) pxs.set(ki, ux.get("prev")); else pxs.remove(ki); }
                Map<String, Object> done = mm(st.get("rsDone")); if (done != null) done.remove(ik(wi));
            }
            st.remove("rsUndo"); st.put("rsOpen", now + 20000); xwait(st, trailOf(st), now, notes);
            if (st.get("xw") != null) { mm(st.get("xw")).put("shr", Boolean.FALSE); mm(st.get("xw")).put("seen", Boolean.TRUE); }
            notes.add("환승 확정 되돌림");
        } else {
            for (ki = pxs.size() - 1; ki >= 0; ki--) if (gn(pxs.get(ki), "idx") == wi) { if (ux.get("prev") != null) pxs.set(ki, ux.get("prev")); else pxs.remove(ki); }
            eta.put("boarded", Boolean.FALSE); eta.put("notDeparted", Boolean.TRUE); st.put("wait", ux.get("w")); st.remove("rsUndo"); st.put("rsOpen", 0.0);
            notes.add("승차 확정 되돌림(오버레이)");
        }
    }

    /** 누른 순간 승차역에 있나: 800m 밖('away')이면 버튼을 거두고 알린다. */
    static void pressVerify(Map<String, Object> st, double i, double now, List<Object> notes) {
        try {
            Map<String, Object> s = stopOf(st, i); List<Object> tr = trailOf(st);
            if (s == null || !fin(s.get("lat")) || !fin(s.get("lng")) || tr.isEmpty() || st.get("rsUndo") == null) return;
            Map<String, Object> P = obj("nowMs", now, "trail", tr, "plan", obj("pts", new ArrayList<Object>(), "pressPt", obj("lat", s.get("lat"), "lng", s.get("lng"))),
                "want", obj("off", Boolean.FALSE, "ridden", Boolean.FALSE, "miss", Boolean.FALSE, "bus", Boolean.FALSE, "press", Boolean.TRUE));
            Map<String, Object> res = RideTrackJ.rideTrack(P), pr = res == null ? null : mm(res.get("press"));
            if (pr == null) return;
            notes.add("승차역확인 " + pr.get("state") + (pr.get("distM") != null ? " " + ns(num(pr.get("distM"))) + "m" : "") + (truthy(pr.get("why")) ? " (" + pr.get("why") + ")" : ""));
            if ("away".equals(pr.get("state"))) {
                doUndo(st, now, notes);
                st.put("rsToast", obj("t", "승차역에서 " + ns(num(pr.get("distM"))) + "m 떨어져 있어요. 도착해서 다시 눌러 주세요", "until", now + 8000));
                notes.add("승차역에서 멀어 버튼을 거둠");
            }
        } catch (RuntimeException e) { notes.add("승차역확인 실패: " + e.getMessage()); }
    }

    // ═════════════ 경로 카드 버튼 줄의 오른쪽 칸 ═════════════
    static Map<String, Object> rowOut(Map<String, Object> st, double now) {
        try {
            List<Leg> legs = legsOf(mm(st.get("eta"))); double pm = maxPass(mm(st.get("eta"))); List<Object> ev = new ArrayList<Object>();
            for (int k = 0; k < legs.size(); k++) ev.add(obj("done", (k == 0 ? st.get("wait") == null : false) || pm >= legs.get(k).bi || doneAt(st, legs.get(k).bi), "mode", legs.get(k).mode));
            String prev = truthy(st.get("rowSlot")) ? str(st.get("rowSlot")) : "none";
            Map<String, Object> r = RideEtaJ.rideRow(obj("op", "row", "locked", Boolean.TRUE, "legs", ev, "prev", prev)), anim = mm(r.get("anim"));
            if (!r.get("slot").equals(prev)) { st.put("rowAnim", obj("kind", anim.get("kind"), "ms", anim.get("ms"), "ease", anim.get("ease"), "sq", now, "o", prev)); st.put("rowSlot", r.get("slot")); }
            Map<String, Object> an = mm(st.get("rowAnim")); if (an == null) an = obj("kind", "none", "ms", 0, "ease", anim.get("ease"), "sq", 0, "o", "none");
            return obj("slot", r.get("slot"), "label", r.get("label"), "leg", r.get("leg"), "can", "arrive".equals(r.get("slot")) || (st.get("wait") != null || (st.get("xw") != null && st.get("xPend") == null)), "anim", an);
        } catch (RuntimeException e) { return null; }
    }

    // ═════════════ 탑승 줄(앱 탑승 시트 · 오버레이 공통) ═════════════
    static String kick(double dt, boolean late, boolean x) {
        if (late) return x ? "환승하셨다면 눌러 주세요" : "타셨다면 눌러 주세요";
        if (dt > 150000) return x ? "환승 예정" : "탑승 예정";
        if (dt > 90000) return "2분 안에 도착";
        if (dt > 45000) return "1분 안에 도착";
        if (dt > -30000) return "곧 도착해요";
        return "도착했어요";
    }
    static Map<String, Object> rsState(Map<String, Object> st, Map<String, Object> r, double now) {
        Map<String, Object> o = rsState0(st, r, now), toast = mm(st.get("rsToast"));
        if (toast != null && now < num(toast.get("until")) && o != null && o.get("st") != null && !"hidden".equals(o.get("st")) && !"undo".equals(o.get("st"))) { o.put("kick", toast.get("t")); o.put("late", Boolean.FALSE); }
        else if (toast != null && now >= num(toast.get("until"))) st.remove("rsToast");
        return o;
    }
    private static Map<String, Object> mk(String stt, String k, String nm, String bt) {
        Map<String, Object> o = obj("bar", -1, "cbg", "", "cfg", "#0a84ff", "ch", "", "um", "", "kick", "", "mode", "", "chip", "", "x", 0, "late", Boolean.FALSE);
        o.put("st", stt); o.put("k", k); o.put("nm", nm); o.put("bt", bt);
        return o;
    }
    private static void rich(Map<String, Object> o, List<Object> nodes, Map<String, Object> st, Map<String, Object> r, double now, int i, double dep, boolean x, boolean late) {
        Object n = i >= 0 && i < nodes.size() && nodes.get(i) != null ? nodes.get(i) : obj();
        String line = or(g(n, "lineName"), "");
        double dt = dep - now;
        List<Object> cells = l(g(st.get("ovl"), "cells")), map = l(g(st.get("ovl"), "map")); if (cells == null) cells = new ArrayList<Object>(); if (map == null) map = new ArrayList<Object>();
        String col = "";
        for (int j = 0; j < map.size(); j++) if (map.get(j) != null && num(map.get(j)) == i) { col = or(g(at(cells, j), "dc"), ""); break; }
        boolean bus = truthy(g(n, "isBus"));
        o.put("mode", bus ? "bus" : "sub"); o.put("x", x ? 1.0 : 0.0); o.put("late", late);
        o.put("chip", bus ? (line + (line.endsWith("번") ? "" : "번")) : line);
        if (col.length() > 0) { o.put("cbg", col); o.put("cfg", contrast(col)); }
        List<Object> arr = l(r.get("arr")); Object hmo = at(arr, i); String hm = truthy(hmo) ? str(hmo) : "";
        o.put("kick", kick(dt, late, x) + (hm.length() > 0 ? " · " + hm : ""));
        if (dt <= 0 && !late) o.put("bar", Math.max(0, Math.min(1, 1 - (-dt) / RS_SHRINK_MS)));
        String nm = or(g(n, "name"), "");
        o.put("nm", nm + (!bus && nm.length() > 0 && !nm.endsWith("역") ? "역" : ""));
    }
    static Map<String, Object> rsState0(Map<String, Object> st, Map<String, Object> r, double now) {
        Map<String, Object> eta = mm(st.get("eta")); List<Object> nodes = eta == null ? null : l(eta.get("nodes")); if (nodes == null) nodes = new ArrayList<Object>();
        Map<String, Object> u0 = mm(st.get("rsUndo"));
        if (u0 != null && now < num(u0.get("until"))) {
            int uwi = (int) num(mm(u0.get("w")).get("i")); Object un0 = uwi >= 0 && uwi < nodes.size() ? nodes.get(uwi) : null;
            String un = truthy(un0) ? or(g(un0, "name"), "") : "";
            String kk = truthy(u0.get("x")) ? (truthy(u0.get("pend")) ? "환승 예정으로 기록했어요" : "환승 완료로 기록했어요") : "탑승으로 기록했어요";
            Map<String, Object> uo = mk("undo", kk, un, "되돌리기");
            if (truthy(un0)) { rich(uo, nodes, st, r, now, uwi, now, truthy(u0.get("x")), false); uo.put("k", kk); uo.put("bar", -1.0); }
            return uo;
        }
        if (st.get("wait") != null) {
            Map<String, Object> w = mm(st.get("wait")); int wi = (int) num(w.get("i")); Object wn = wi >= 0 && wi < nodes.size() ? nodes.get(wi) : null;
            String nm = truthy(wn) ? or(g(wn, "name"), "") : "";
            Object hmo = at(l(r.get("arr")), wi); String hm = truthy(hmo) ? str(hmo) : "";
            boolean open = now >= num(w.get("arrMs")) - RS_LEAD_MS || (truthy(st.get("rsOpen")) ? num(st.get("rsOpen")) : 0) > now;
            Map<String, Object> wo = mk(open ? "board" : "wait", nm + (hm.length() > 0 ? " " + hm : "") + " 출발", nm, "탑승");
            if (truthy(wn)) rich(wo, nodes, st, r, now, wi, num(w.get("arrMs")), false, now - num(w.get("arrMs")) >= RS_SHRINK_MS);
            return wo;
        }
        if (st.get("xw") != null) {
            Map<String, Object> x = mm(st.get("xw")); double dt = num(x.get("arrMs")) - now; boolean late = -dt >= RS_SHRINK_MS, forced = (truthy(st.get("rsOpen")) ? num(st.get("rsOpen")) : 0) > now; String stt;
            if (st.get("xPend") != null) stt = "wait";
            else if (forced) { stt = "board"; x.put("seen", Boolean.TRUE); }
            else if (dt > RS_LEAD_MS || late) stt = truthy(x.get("seen")) ? "wait" : "hidden";
            else if (truthy(x.get("shr"))) stt = "wait";
            else { stt = "board"; x.put("seen", Boolean.TRUE); }
            if (stt.equals("hidden")) return obj("st", "hidden");
            int xi = (int) num(x.get("i")); Object xno = xi >= 0 && xi < nodes.size() ? nodes.get(xi) : null;
            String xn = truthy(xno) ? or(g(xno, "name"), "") : "";
            Object xho = at(l(r.get("arr")), xi); String xh = truthy(xho) ? str(xho) : "";
            Map<String, Object> xo = mk(stt, xn + (xh.length() > 0 ? " " + xh : "") + " 출발", xn, "환승완료");
            rich(xo, nodes, st, r, now, xi, num(x.get("arrMs")), true, late);
            return xo;
        }
        return obj("st", "hidden");
    }

    // ═════════════ 하단 줄(추천 · 내릴 준비) ═════════════
    static Map<String, Object> rows(Map<String, Object> st, Map<String, Object> r, double now, Map<String, Object> dest, int lv, Map<String, Object> bTg, boolean arrived) {
        Map<String, Object> cfg = mm(st.get("cfg")); if (cfg == null) cfg = obj();
        Map<String, Object> ad = mm(st.get("rcAd"));
        int dn = dest != null ? (int) num(dest.get("nodeIdx")) : -1, k = 0;
        Map<String, Object> reco = null, getoff = null;
        Object etaMs = r.get("etaMs");
        double rem = (dn >= 0 && etaMs != null && hasEta(etaMs, dn)) ? round((etaAt(etaMs, dn) - now) / 1000) : Double.NaN;
        if (!arrived && lv == 1 && bTg != null && "dest".equals(bTg.get("kind")) && st.get("wait") == null) {
            String cheer = "오늘도 수고 많았어요";
            try {
                Map<String, Object> eta = mm(st.get("eta"));
                double tz = (eta != null && eta.get("tzOffsetMin") != null) ? num(eta.get("tzOffsetMin")) : 540;     // (st.eta && st.eta.tzOffsetMin) != null
                String c = RideEtaJ.arrCheer(now, tz, null);
                if (truthy(c)) cheer = c;
            } catch (RuntimeException e) { }
            double gat = truthy(mm(st.get("ovlAlert")) == null ? null : mm(st.get("ovlAlert")).get("at")) ? num(mm(st.get("ovlAlert")).get("at")) : 0;
            getoff = obj("on", Boolean.TRUE, "ch", charOf(gat), "a", "내릴 준비를 해주세요", "b", clampTxt(cheer, 40), "end", "앱 종료", "at", gat); k = 2;
        } else if (ad != null && !Boolean.FALSE.equals(mm(cfg.get("allowed")) == null ? null : mm(cfg.get("allowed")).get("arrive_reco")) && !(st.get("rcDis") != null && num(st.get("rcDis")) == num(ad.get("at")))
            && now - num(ad.get("at")) < 25 * 60000 && !Double.isNaN(rem) && rem <= 7 * 60 && rem > -30 && st.get("wait") == null) {
            reco = obj("on", Boolean.TRUE, "ch", charOf(num(ad.get("at"))), "a", ad.get("a"), "b", ad.get("b"), "m", ad.get("m"), "go", ad.get("go"), "ok", "확인", "at", ad.get("at")); k = 1;
        }
        Map<String, Object> rh = mm(st.get("rowHold"));
        if (rh == null) { rh = obj("k", 0, "at", 0, "reco", null, "getoff", null); st.put("rowHold", rh); }
        if (k >= num(rh.get("k")) || now - num(rh.get("at")) >= 30000) {
            if (k > 0) { rh.put("k", (double) k); rh.put("at", now); rh.put("reco", reco); rh.put("getoff", getoff); } else rh.put("k", 0.0);
        } else {
            Map<String, Object> rhr = mm(rh.get("reco"));
            boolean dead = (num(rh.get("k")) == 1 && rhr != null && st.get("rcDis") != null && num(st.get("rcDis")) == num(rhr.get("at"))) || (truthy(st.get("arrivedAt")) && now - num(st.get("arrivedAt")) >= 150000);
            if (dead) rh.put("k", 0.0); else { reco = rhr; getoff = mm(rh.get("getoff")); }
        }
        return obj("reco", reco != null ? reco : obj("on", Boolean.FALSE), "getoff", getoff != null ? getoff : obj("on", Boolean.FALSE));
    }

    // ═════════════ 오버레이 ═════════════
    static String p2(double n) { return (n < 10 ? "0" : "") + ns(n); }
    static Map<String, Object> overlay(Map<String, Object> st, Map<String, Object> r, double curIdx, int curPos, double now, Map<String, Object> dest, String destName, boolean moving, boolean done) {
        Map<String, Object> ov = mm(st.get("ovl"));
        if (done) return obj("active", Boolean.FALSE);
        if (ov == null || l(ov.get("cells")) == null || l(ov.get("cells")).isEmpty()) return null;
        List<Object> map = l(ov.get("map")); if (map == null) map = new ArrayList<Object>();
        List<Object> ocells = l(ov.get("cells")), cells = new ArrayList<Object>();
        int j, cur = -1, firstNode = -1;
        List<Object> arr = l(r.get("arr"));
        for (j = 0; j < ocells.size(); j++) {
            Object cc = copy(ocells.get(j)); Object nio = at(map, j); int ni = nio != null ? (int) num(nio) : -1;
            if (ni >= 0 && truthy(at(arr, ni)) && cc instanceof Map) ((Map<String, Object>) cc).put("t", at(arr, ni));
            cells.add(cc);
            if (ni >= 0) { if (firstNode < 0) firstNode = j; if (ni <= curIdx) cur = j; }
        }
        if (cur < 0) cur = firstNode >= 0 ? firstNode : 0;
        int nextJ = -1;
        for (j = cur + 1; j < cells.size(); j++) { Object mo = at(map, j); if (mo != null && num(mo) >= 0) { nextJ = j; break; } }
        String cn = cur < cells.size() ? jstr(g(cells.get(cur), "n")) : "", nn = nextJ >= 0 ? jstr(g(cells.get(nextJ), "n")) : "";
        String line1 = truthy(nn) && nn.length() > 0 ? cn + " ▸ " + nn : "● " + cn;
        String pill = (moving && nextJ >= 0) ? or(g(cells.get(nextJ), "m"), "") : "";
        String line2 = ""; int dn = dest != null ? (int) num(dest.get("nodeIdx")) : -1;
        Object etaMs = r.get("etaMs");
        if (dn >= 0 && etaMs != null && at(etaMs, dn) != null) {
            double mmn = Math.max(0, round((etaAt(etaMs, dn) - now) / 60000));
            Object ad = at(arr, dn);
            line2 = "남은시간: " + p2(Math.floor(mmn / 60)) + "시간 " + p2(mmn % 60) + "분" + (truthy(ad) ? " · " + str(ad) + "도착" : "");
        }
        int lv = 0, pre = 0; List<Object> tg = l(mm(st.get("cfg")) == null ? null : mm(st.get("cfg")).get("targets")); if (tg == null) tg = new ArrayList<Object>();
        Map<String, Object> bTg = null;
        for (int i = 0; i < tg.size(); i++) {
            Map<String, Object> t = mm(tg.get(i));
            int rem = (int) (num(t.get("seqPos")) - curPos);
            if (curPos >= 0 && (rem == 1 || rem == 2)) { if (lv == 0 || rem < lv) { lv = rem; bTg = t; } }
            if (curPos >= 0 && "dest".equals(t.get("kind")) && rem == 3) pre = 1;
        }
        String banner = "";
        if (bTg != null && !(dest != null && curPos >= num(dest.get("seqPos")))) {
            String bn = str(bTg.get("name")), nl = or(bTg.get("nextLine"), "다음 노선");
            banner = "transfer".equals(bTg.get("kind")) ? (lv == 1 ? "다음 정거장 " + bn + " — " + nl + " 환승 준비" : bn + "에서 " + nl + " 환승 · 2정거장 전")
                : (lv == 1 ? "다음 정거장 " + bn + " — 내릴 준비하세요" : bn + "까지 2정거장 남았어요");
        } else if (dest != null && curPos >= num(dest.get("seqPos"))) banner = (truthy(destName) ? destName : or(dest.get("name"), "목적지")) + "에 도착했어요";
        Map<String, Object> oa = mm(st.get("ovlAlert")); if (oa == null) { oa = obj("lv", 0, "at", 0); st.put("ovlAlert", oa); }
        if (num(oa.get("lv")) != lv) { oa.put("lv", (double) lv); if (lv > 0) oa.put("at", now); }
        boolean arrived = dest != null && curPos >= num(dest.get("seqPos"));
        Map<String, Object> rs = arrived ? obj("st", "board", "end", Boolean.TRUE, "bt", "안내 종료", "k", "목적지에 도착했어요", "ch", "도착", "nm", destName == null ? "" : destName, "bar", -1, "cbg", "", "cfg", "#0a84ff") : rsState(st, r, now);
        Map<String, Object> rowsO = rows(st, r, now, dest, lv, bTg, arrived);
        Map<String, Object> out = obj("active", Boolean.TRUE, "line1", line1, "pill", pill, "track", new ArrayList<Object>(), "cur", cur, "base", truthy(ov.get("base")) ? ov.get("base") : 0, "line2", line2, "line3", "",
            "alert", arrived ? 0 : lv, "alertAt", truthy(oa.get("at")) ? oa.get("at") : 0, "alertVibe", Boolean.FALSE, "banner", banner, "destName", destName == null ? "" : destName,
            "pre", !arrived && pre == 1, "moving", moving, "rs", rs, "reco", rowsO.get("reco"), "getoff", rowsO.get("getoff"), "cells", cells);
        if (truthy(ov.get("theme"))) out.put("theme", ov.get("theme"));
        Map<String, Object> sh = share(st, r, cells, map, cur, moving, dest, destName, now);
        if (sh != null) out.put("share", sh);
        return out;
    }
    private static String jstr(Object o) { return o == null ? "undefined" : str(o); }

    static Map<String, Object> share(Map<String, Object> st, Map<String, Object> r, List<Object> cells, List<Object> map, int cur, boolean moving, Map<String, Object> dest, String destName, double now) {
        List<String[]> stn = new ArrayList<String[]>(); List<Integer> at = new ArrayList<Integer>(); int j;
        for (j = 0; j < cells.size(); j++) {
            Object cj = cells.get(j); String nm = truthy(cj) && truthy(g(cj, "n")) ? str(g(cj, "n")) : "";
            Object mo = RideJs.at(map, j);
            if (!(mo != null && num(mo) >= 0) || nm.length() == 0) { at.add(stn.size() - 1); continue; }
            if (!stn.isEmpty() && stn.get(stn.size() - 1)[0].equals(nm)) { at.add(stn.size() - 1); continue; }
            stn.add(new String[] { nm, truthy(g(cj, "t")) ? str(g(cj, "t")) : "" });
            at.add(stn.size() - 1);
        }
        int dn = dest != null ? (int) num(dest.get("nodeIdx")) : -1; Object etaMs = r.get("etaMs");
        if (stn.isEmpty() || dn < 0 || etaMs == null || at(etaMs, dn) == null || !hasEta(etaMs, dn)) return null;
        int hit = Math.max(0, Math.min(stn.size() - 1, cur < at.size() && at.get(cur) != null ? at.get(cur) : 0));
        double arrMs = etaAt(etaMs, dn), rem = Math.max(0, round((arrMs - now) / 60000));
        double kst = arrMs + 9 * 3600000.0, totMin = Math.floor(kst / 60000), hh = ((Math.floor(totMin / 60) % 24) + 24) % 24, mi = ((totMin % 60) + 60) % 60;
        String hm = p2(hh) + "시" + p2(mi) + "분", dur = p2(Math.floor(rem / 60)) + "시" + p2(rem % 60) + "분";
        String nextName = hit < stn.size() - 1 ? stn.get(hit + 1)[0] : "";
        boolean mv = moving && nextName.length() > 0;
        String curTxt = mv ? stn.get(hit)[0] + "→" + nextName + " 이동 중" : (st.get("wait") != null ? stn.get(hit)[0] + " 승차 대기" : stn.get(hit)[0]);
        String from = stn.get(0)[0], to = truthy(destName) ? destName : (dest != null && truthy(dest.get("name")) ? str(dest.get("name")) : stn.get(stn.size() - 1)[0]);
        List<Object> sl = new ArrayList<Object>();
        for (String[] s : stn) sl.add(obj("n", s[0], "t", s[1]));
        return obj("text", from + " - " + curTxt + " - " + to + " (도착예정시간: " + hm + ")\n[남은시간: " + dur + "]", "from", from, "cur", curTxt, "to", to, "arr", hm, "rem", dur,
            "stations", sl, "hit", hit, "moving", mv, "left", Math.max(0, stn.size() - 1 - hit), "next", nextName);
    }

    // ═════════════ 하차 7분 전 추천 판단(arrive-reco) ═════════════
    static final double ARR_PRE_MIN = 7, ARR_RECENT_MS = 30 * 60 * 1000;
    static double kstMin(double ms) { double m = Math.floor(ms / 60000) + 540; return ((m % 1440) + 1440) % 1440; }
    static String arrSlot(double arrMs) {
        double m = kstMin(arrMs);
        if (m >= 17 * 60 && m <= 21 * 60) return "night";
        if (m >= 21 * 60 + 1) return "shop";
        if (m >= 7 * 60 + 1 && m <= 10 * 60) return "morning";
        if (m >= 10 * 60 + 1 && m <= 16 * 60 + 59) return "lunch";
        return "none";
    }
    static boolean arrIsDinner(double arrMs) { double m = kstMin(arrMs); return m >= 17 * 60 && m < 19 * 60; }
    static double arrRemainMin(double arrMs, double nowMs) {
        double m = round((arrMs - nowMs) / 60000);
        if (!fin(m) || m < 1 || m > ARR_PRE_MIN + 2) return ARR_PRE_MIN;
        return Math.min(ARR_PRE_MIN, m);
    }
    /** arrRecoWhen({ arrMs, remSec, dest, lastKey, lastAt, nowMs }) */
    static Map<String, Object> arrRecoWhen(Map<String, Object> o0) {
        Map<String, Object> o = o0 == null ? obj() : o0;
        double arrMs = num(o.get("arrMs")), nowMs = num(o.get("nowMs")); if (!fin(nowMs)) nowMs = 0;
        Object remO = o.get("remSec"); double rem = (remO == null || "".equals(remO)) ? Double.NaN : num(remO); boolean remNull = (remO == null || "".equals(remO));
        String dest = o.get("dest") == null ? "" : str(o.get("dest")), lastKey = o.get("lastKey") == null ? "" : str(o.get("lastKey"));
        double lastAt = num(o.get("lastAt")); if (!fin(lastAt)) lastAt = 0;
        Map<String, Object> r = obj("v", 1, "fire", Boolean.FALSE, "why", "input", "key", "", "slot", "none", "dinner", Boolean.FALSE, "remMin", ARR_PRE_MIN, "pre", ARR_PRE_MIN, "askMs", 60000);
        if (arrMs == 0 || !fin(arrMs) || remNull || !fin(rem)) return r;
        r.put("slot", arrSlot(arrMs)); r.put("dinner", arrIsDinner(arrMs)); r.put("remMin", arrRemainMin(arrMs, nowMs));
        if (rem > ARR_PRE_MIN * 60 || rem < 60) {
            r.put("why", "window");
            r.put("askMs", rem > ARR_PRE_MIN * 60 ? Math.max(5000, Math.min(60000, round((rem - ARR_PRE_MIN * 60 - 5) * 1000))) : 60000.0);
            return r;
        }
        r.put("key", str(o.get("arrMs")) + "|" + dest);
        if (lastKey.equals(r.get("key"))) { r.put("why", "dup"); return r; }
        if (lastAt != 0 && (nowMs - lastAt) < ARR_RECENT_MS) { r.put("why", "recent"); return r; }
        r.put("fire", Boolean.TRUE); r.put("why", "ok"); r.put("askMs", 60000.0);
        return r;
    }
    static Map<String, Object> reco(Map<String, Object> st, Map<String, Object> r, Map<String, Object> dest, String destName, double now, boolean off) {
        Map<String, Object> cfg = mm(st.get("cfg")); if (cfg == null) cfg = obj();
        Map<String, Object> base = obj("fire", Boolean.FALSE, "dest", destName == null ? "" : destName, "alertAt", truthy(st.get("recoAt")) ? st.get("recoAt") : 0);
        if (dest == null || st.get("wait") != null || off || Boolean.FALSE.equals(mm(cfg.get("allowed")) == null ? null : mm(cfg.get("allowed")).get("arrive_reco"))) { base.put("why", "off"); return base; }
        int dn = (int) num(dest.get("nodeIdx")); Object etaMs = r.get("etaMs");
        double arrMs = (etaMs != null && dn >= 0) ? etaAt(etaMs, dn) : Double.NaN;
        if (Double.isNaN(arrMs) || !fin(arrMs)) { base.put("why", "noeta"); return base; }
        double remSec = round((arrMs - now) / 1000);
        Map<String, Object> w = arrRecoWhen(obj("arrMs", arrMs, "remSec", remSec, "nowMs", now, "dest", destName == null ? "" : destName, "lastKey", truthy(st.get("recoKey")) ? st.get("recoKey") : "", "lastAt", truthy(st.get("recoAt")) ? st.get("recoAt") : 0));
        base.put("remSec", remSec); base.put("slot", w != null ? w.get("slot") : "none"); base.put("dinner", w != null && truthy(w.get("dinner"))); base.put("why", w != null ? w.get("why") : "input");
        if (w == null || !truthy(w.get("fire"))) return base;
        st.put("recoKey", w.get("key")); st.put("recoAt", now); base.put("alertAt", now);
        Object loc = null; List<Object> stops = l(st.get("stops"));
        if (stops != null) for (Object s : stops) if (s != null && g(s, "i") != null && num(g(s, "i")) == dn) { loc = obj("lat", g(s, "lat"), "lng", g(s, "lng")); break; }
        base.put("fire", Boolean.TRUE); base.put("key", w.get("key")); base.put("arrMs", arrMs); base.put("remMin", w.get("remMin")); base.put("loc", loc);
        return base;
    }

    // ═════════════ 재동기 · 다음 호출 간격 · 승차 대기 ═════════════
    static boolean resync(Map<String, Object> st, double now, List<Object> notes) {
        Map<String, Object> eta = mm(st.get("eta")); List<Object> tr = trailOf(st), stops = l(st.get("stops")); if (stops == null) stops = new ArrayList<Object>();
        List<Object> passes = l(eta.get("passes")); if (passes == null) passes = new ArrayList<Object>();
        int i, k;
        if (truthy(eta.get("timetableFirst")) || tr.size() < 2 || stops.isEmpty()) return false;
        double maxIdx = 0; Map<String, Object> lastPass = null;
        for (i = 0; i < passes.size(); i++) if (gn(passes.get(i), "idx") > maxIdx) { maxIdx = gn(passes.get(i), "idx"); lastPass = mm(passes.get(i)); }
        if (lastPass == null) return false;
        Object a = tr.get(tr.size() - 1), b = null;
        if (now - num(at(a, 0)) > 30000 || (at(a, 3) != null && num(at(a, 3)) > 60)) return false;
        for (i = tr.size() - 2; i >= 0; i--) {
            Object ti = tr.get(i);
            if (num(at(a, 0)) - num(at(ti, 0)) >= 5000 && num(at(a, 0)) - num(at(ti, 0)) <= 60000 && (at(ti, 3) == null || num(at(ti, 3)) <= 60)) { b = ti; break; }
        }
        if (b == null) return false;
        Map<String, Object> lastStop = null;
        for (i = 0; i < stops.size(); i++) if (gn(stops.get(i), "i") == maxIdx) lastStop = mm(stops.get(i));
        Map<String, Object> best = null; double bestD = 1e9;
        for (k = 0; k < stops.size(); k++) {
            Map<String, Object> s = mm(stops.get(k)); if (gn(s, "i") <= maxIdx) continue;
            double da = rsHav(num(at(a, 1)), num(at(a, 2)), num(s.get("lat")), num(s.get("lng"))), db = rsHav(num(at(b, 1)), num(at(b, 2)), num(s.get("lat")), num(s.get("lng")));
            if (da > 150 || db > 150) continue;
            double gap = lastStop != null ? (num(s.get("arrMs")) - num(lastStop.get("arrMs"))) : 0;
            if (gap > 0 && lastPass.get("ms") != null && num(at(a, 0)) - num(lastPass.get("ms")) < 0.4 * gap) continue;
            if (da < bestD) { bestD = da; best = s; }
        }
        if (best == null) return false;
        passes.add(obj("idx", best.get("i"), "ms", at(a, 0), "src", "gps"));
        if (eta.get("passes") == null) eta.put("passes", passes);
        Map<String, Object> ny = mm(st.get("notYet")); if (ny != null) ny.remove(ik(num(best.get("i"))));
        notes.add("재동기 " + ns(num(best.get("i"))) + "번(GPS 끊김 뒤 위치로 통과 인정, " + ns(round(bestD)) + "m)");
        return true;
    }
    static double nextMsAt(Map<String, Object> st, Map<String, Object> r, double now) {
        List<Object> stops = l(st.get("stops")); if (stops == null) stops = new ArrayList<Object>();
        Map<String, Object> eta = mm(st.get("eta"));
        if (eta == null || Boolean.FALSE.equals(eta.get("boarded")) || Boolean.TRUE.equals(eta.get("notDeparted"))) return stepMs;
        for (int i = 0; i < stops.size(); i++) {
            Map<String, Object> s = mm(stops.get(i)); double am;
            Object etaMs = r == null ? null : r.get("etaMs");
            am = (etaMs != null && at(etaMs, (int) num(s.get("i"))) != null) ? etaAt(etaMs, (int) num(s.get("i"))) : (s.get("arrMs") == null ? Double.NaN : num(s.get("arrMs")));
            if (Double.isNaN(am) || !fin(am)) continue;
            double dt = now - am;
            if (dt >= -nearBeforeSec * 1000 && dt <= nearAfterSec * 1000) return nearStepMs;
        }
        return stepMs;
    }

    static void wait(Map<String, Object> st, List<Object> tr, double now, List<Object> notes) {
        Map<String, Object> eta = mm(st.get("eta")); List<Object> stops = l(st.get("stops")); if (stops == null) stops = new ArrayList<Object>();
        Map<String, Object> b = null; int i;
        for (i = 0; i < stops.size(); i++) { Map<String, Object> s = mm(stops.get(i)); if (s != null && Boolean.FALSE.equals(s.get("pass")) && fin(s.get("lat")) && fin(s.get("lng"))) { b = s; break; } }
        if (!st.containsKey("waitChk")) {
            if (tr.isEmpty()) return;
            st.put("waitChk", 1.0);
            Map<String, Object> cfg = mm(st.get("cfg"));
            if (cfg == null || !Boolean.TRUE.equals(cfg.get("waitBoard"))) return;
            Object etaMs = st.get("etaMs");
            double am = b == null ? Double.NaN : ((etaMs != null && at(etaMs, (int) num(b.get("i"))) != null) ? etaAt(etaMs, (int) num(b.get("i"))) : (b.get("arrMs") == null ? Double.NaN : num(b.get("arrMs"))));
            if (b == null || Double.isNaN(am) || !fin(am) || now > am + waitStartLateSec * 1000 || Boolean.FALSE.equals(eta.get("boarded"))) return;
            st.put("wait", obj("i", b.get("i"), "lat", b.get("lat"), "lng", b.get("lng"), "arrMs", am, "since", now, "seen", Boolean.FALSE, "nearTs", 0));
            eta.put("boarded", Boolean.FALSE); eta.put("notDeparted", Boolean.TRUE);
            notes.add("승차 대기 시작(" + ns(num(b.get("i"))) + "번 정류장 출발 " + ns(round((am - now) / 1000)) + "초 뒤)");
        }
        Map<String, Object> w = mm(st.get("wait")); if (w == null) return;
        int k; Object q, last = null; double d;
        for (k = 0; k < tr.size(); k++) {
            q = tr.get(k); if (num(at(q, 0)) < num(w.get("since")) - 60000) continue;
            if (at(q, 3) != null && num(at(q, 3)) > 150) continue;
            d = rsHav(num(at(q, 1)), num(at(q, 2)), num(w.get("lat")), num(w.get("lng"))) - (at(q, 3) == null ? 30 : num(at(q, 3)));
            if (d <= waitNearM) { w.put("seen", Boolean.TRUE); if (num(at(q, 0)) > num(w.get("nearTs"))) w.put("nearTs", at(q, 0)); }
            last = q;
        }
        boolean boarded = false; String why = "";
        if (truthy(w.get("seen")) && last != null && now - num(at(last, 0)) <= waitFreshSec * 1000) {
            double dl = rsHav(num(at(last, 1)), num(at(last, 2)), num(w.get("lat")), num(w.get("lng")));
            if (dl >= waitAwayM) {
                List<Object> win = new ArrayList<Object>();
                for (Object z : tr) if (now - num(at(z, 0)) <= waitWinSec * 1000 && (at(z, 3) == null || num(at(z, 3)) <= 150)) win.add(z);
                if (win.size() >= 3) {
                    Object f0 = win.get(0), f1 = win.get(win.size() - 1); double dt = (num(at(f1, 0)) - num(at(f0, 0))) / 1000;
                    if (dt >= waitSpanSec) {
                        double sp = rsHav(num(at(f0, 1)), num(at(f0, 2)), num(at(f1, 1)), num(at(f1, 2))) / dt;
                        if (sp >= waitMoveMps) { boarded = true; why = "역에서 " + ns(round(dl)) + "m · " + toFixed(sp, 1) + "m/s"; }
                    }
                }
            }
        }
        if (!boarded && now > num(w.get("arrMs")) + waitGraceSec * 1000) { boarded = true; why = "출발 시각 " + ns(round((now - num(w.get("arrMs"))) / 60000)) + "분 뒤까지 감지 못 해 시각표대로"; }
        if (!boarded) return;
        List<Object> passes = l(eta.get("passes")); if (passes == null) { passes = new ArrayList<Object>(); eta.put("passes", passes); }
        double ms = num(w.get("nearTs")) > 0 ? num(w.get("nearTs")) : now; int hit = -1;
        for (k = 0; k < passes.size(); k++) if (gn(passes.get(k), "idx") == num(w.get("i"))) { hit = k; break; }
        Map<String, Object> np = obj("idx", w.get("i"), "ms", ms, "src", "gps");
        if (hit >= 0) passes.set(hit, np); else passes.add(np);
        eta.put("boarded", Boolean.TRUE); eta.put("notDeparted", Boolean.FALSE); st.remove("wait");
        notes.add("승차 확정(" + why + ")");
    }


    // ═════════════ 새 위치 판단기 보정(실험, cfg.pfLive) ═════════════
    static boolean cfg0pf(Map<String, Object> st) { Map<String, Object> c = mm(st.get("cfg")); return c != null && Boolean.TRUE.equals(c.get("pfLive")); }
    static boolean fuse(Map<String, Object> st, List<Object> fx, double now, List<Object> notes) {
        List<Object> stops = l(st.get("stops")); if (stops == null) stops = new ArrayList<Object>();
        Map<String, Object> eta = mm(st.get("eta")); if (eta == null) eta = obj();
        List<Object> passes = l(eta.get("passes")); if (passes == null) { passes = new ArrayList<Object>(); eta.put("passes", passes); }
        List<Object> enodes = l(eta.get("nodes")); if (enodes == null) enodes = new ArrayList<Object>();
        int q, k;
        if (stops.size() < 2 || st.get("wait") != null || Boolean.FALSE.equals(eta.get("boarded"))) return false;
        double maxIdx = 0; int maxK = 0;
        for (k = 0; k < passes.size(); k++) if (truthy(passes.get(k)) && gn(passes.get(k), "idx") > maxIdx) maxIdx = gn(passes.get(k), "idx");
        for (q = 0; q < stops.size(); q++) if (gn(stops.get(q), "i") <= maxIdx) maxK = q;
        List<Object> stations = new ArrayList<Object>(); Object etaMs = st.get("etaMs");
        for (int j = 0; j < stops.size(); j++) {
            Object s = stops.get(j);
            Object prev = j > 0 ? at(enodes, (int) gn(stops.get(j - 1), "i")) : null, cur = at(enodes, (int) gn(s, "i"));
            Object mso = (etaMs != null && at(etaMs, (int) gn(s, "i")) != null) ? at(etaMs, (int) gn(s, "i")) : g(s, "arrMs");
            stations.add(obj("lat", g(s, "lat"), "lng", g(s, "lng"), "schedMs", (mso != null && fin(mso)) ? mso : null,
                "xferFromPrev", truthy(prev) && truthy(cur) && !or(g(prev, "lineName"), "").equals(or(g(cur, "lineName"), ""))));
        }
        List<Object> ev = new ArrayList<Object>();
        for (Object f : fx) if (truthy(f) && fin(at(f, 0)) && fin(at(f, 1)) && fin(at(f, 2)))
            ev.add(obj("t", "gps", "at", at(f, 0), "fix", obj("lat", at(f, 1), "lng", at(f, 2), "ts", at(f, 0), "acc", at(f, 3) == null ? 30 : at(f, 3))));
        Map<String, Object> out;
        try { out = RidePosFusionJ.posFuseRun(obj("nowMs", now, "stations", stations, "state", st.get("pf"), "seed", obj("idx", maxK, "conf", 0.8), "ev", ev)); }
        catch (RuntimeException e) { notes.add("위치 판단기 실패: " + e.getMessage()); return false; }
        if (out == null || !truthy(out.get("ok")) || out.get("state") == null) return false;
        st.put("pf", out.get("state"));
        Map<String, Object> b = mm(out.get("best"));
        if (b == null || !(num(b.get("conf")) >= 0.9)) return false;
        int bi = (int) num(b.get("idx")); Map<String, Object> s = bi >= 0 && bi < stops.size() ? mm(stops.get(bi)) : null;
        if (s == null || gn(s, "i") <= maxIdx || bi > maxK + 3) return false;
        for (k = 0; k < passes.size(); k++) if (gn(passes.get(k), "idx") == gn(s, "i")) return false;
        passes.add(obj("idx", s.get("i"), "ms", now, "src", "gps"));
        Map<String, Object> ny = mm(st.get("notYet")); if (ny != null) ny.remove(ik(gn(s, "i")));
        notes.add("위치 판단기 " + ns(gn(s, "i")) + "번 역 도착 반영(확신 " + ns(round(num(b.get("conf")) * 100)) + "%)");
        return true;
    }

    // ═════════════ 5초 판정 본체 ═════════════
    static Map<String, Object> rideStandby(Map<String, Object> req0) {
        Map<String, Object> req = req0 == null ? obj() : req0;
        Map<String, Object> st0 = mm(req.get("state"));
        double now = num(req.get("nowMs"));
        List<Object> notes = new ArrayList<Object>(); int i;
        if (st0 == null || mm(st0.get("eta")) == null || !fin(now)) return obj("v", 1, "error", "state/nowMs 가 없다", "done", Boolean.TRUE);
        Map<String, Object> st = copyM(st0);
        st.put("steps", (double) (toInt(num(st.get("steps"))) + 1));
        // 1) 궤적 갱신
        List<Object> tr = l(st.get("trail")); if (tr == null) { tr = new ArrayList<Object>(); st.put("trail", tr); }
        List<Object> fx = l(req.get("fixes")); if (fx == null) fx = new ArrayList<Object>();
        for (i = 0; i < fx.size(); i++) {
            Object f = fx.get(i);
            if (truthy(f) && fin(at(f, 0)) && fin(at(f, 1)) && fin(at(f, 2)) && (tr.isEmpty() || num(at(f, 0)) > num(at(tr.get(tr.size() - 1), 0))))
                tr.add(list(at(f, 0), at(f, 1), at(f, 2), at(f, 3) == null ? null : at(f, 3)));
        }
        for (i = 0; i < fx.size(); i++) { Object f = fx.get(i); if (truthy(f) && fin(at(f, 0)) && (!truthy(st.get("lastFixMs")) || num(at(f, 0)) > num(st.get("lastFixMs")))) st.put("lastFixMs", at(f, 0)); }
        if (!truthy(st.get("firstAt"))) st.put("firstAt", now);
        while (!tr.isEmpty() && now - num(at(tr.get(0), 0)) > trailMaxAgeSec * 1000) tr.remove(0);
        if (tr.size() > trailMax) { int cut = tr.size() - (int) trailMax; for (int c = 0; c < cut; c++) tr.remove(0); }
        wait(st, tr, now, notes);
        xwait(st, tr, now, notes);
        acts(st, req, now, notes);
        // 2) 영점
        Map<String, Object> eta = mm(st.get("eta"));
        List<Object> passes = l(eta.get("passes")); if (passes == null) { passes = new ArrayList<Object>(); eta.put("passes", passes); }
        Map<String, Object> notYet = mm(st.get("notYet")); if (notYet == null) { notYet = obj(); st.put("notYet", notYet); }
        Map<String, Object> zero = null, tk = null; boolean newPass = false;
        List<Object> enodes = l(eta.get("nodes")); if (enodes == null) enodes = new ArrayList<Object>();
        int progMax = -1; boolean progBus = false;
        for (i = 0; i < passes.size(); i++) if (truthy(passes.get(i)) && gn(passes.get(i), "idx") > progMax) progMax = (int) gn(passes.get(i), "idx");
        if (progMax >= 0 && progMax < enodes.size() && truthy(enodes.get(progMax)) && truthy(g(enodes.get(progMax), "isBus")) && !truthy(g(enodes.get(progMax), "isWalk"))) progBus = true;
        List<Object> stSt = l(st.get("stops"));
        if (stSt != null && !stSt.isEmpty() && !tr.isEmpty()) {
            List<Object> stops = new ArrayList<Object>();
            for (Object so : stSt) { Map<String, Object> o = copyM(so); if (o != null && st.get("etaMs") != null && at(st.get("etaMs"), (int) gn(so, "i")) != null) o.put("arrMs", at(st.get("etaMs"), (int) gn(so, "i"))); stops.add(o); }
            tk = RideTrackJ.rideTrack(obj("nowMs", now, "trail", tr, "plan", obj("pts", new ArrayList<Object>(), "boarded", !Boolean.FALSE.equals(eta.get("boarded")) && !Boolean.TRUE.equals(eta.get("notDeparted")),
                "notDeparted", Boolean.FALSE, "stops", stops, "subConfirmed", !progBus, "progIsBus", progBus, "suppress", list("standby")), "want", obj("zero", Boolean.TRUE, "bus", progBus)));
            zero = tk != null ? mm(tk.get("zero")) : null;
            if (zero != null && l(zero.get("stops")) != null) {
                for (Object zo : l(zero.get("stops"))) {
                    Map<String, Object> z = mm(zo);
                    if (z.get("passMs") != null && fin(z.get("passMs")) && truthy(z.get("apply"))) {
                        int hit = -1; for (int k = 0; k < passes.size(); k++) if (gn(passes.get(k), "idx") == num(z.get("i"))) { hit = k; break; }
                        Map<String, Object> np = obj("idx", z.get("i"), "ms", z.get("passMs"), "src", "gps");
                        if (hit >= 0) passes.set(hit, np); else passes.add(np);
                        newPass = true; notYet.remove(ik(num(z.get("i"))));
                        notes.add("영점 " + ns(num(z.get("i"))) + "번 통과 반영");
                    } else if (truthy(z.get("notYet"))) notYet.put(ik(num(z.get("i"))), now);
                }
            }
        }
        Map<String, Object> bp = tk != null ? mm(tk.get("busPos")) : null;
        if (bp != null && l(bp.get("passed")) != null) {
            for (Object po : l(bp.get("passed"))) {
                Map<String, Object> p = mm(po);
                if (p == null || p.get("i") == null || !fin(p.get("ms"))) continue;
                int pi = (int) num(p.get("i")); Object nd0 = pi >= 0 && pi < enodes.size() ? enodes.get(pi) : null;
                if (!truthy(nd0) || !truthy(g(nd0, "isBus"))) continue;
                int hit = -1; for (int k = 0; k < passes.size(); k++) if (gn(passes.get(k), "idx") == pi) { hit = k; break; }
                if (hit >= 0 && ("gps".equals(g(passes.get(hit), "src")) || "move".equals(g(passes.get(hit), "src")))) continue;
                Map<String, Object> np = obj("idx", pi, "ms", p.get("ms"), "src", "gps");
                if (hit >= 0) passes.set(hit, np); else passes.add(np);
                newPass = true; notYet.remove(ik(pi));
                notes.add("버스위치 " + pi + "번 통과 반영");
            }
        }
        if (resync(st, now, notes)) newPass = true;
        if (cfg0pf(st) && fuse(st, fx, now, notes)) newPass = true;      // 새 위치 판단기 보정(실험 · 설정에서 켠 때만)
        // 3) 도착 시각 계산
        List<Object> nyList = new ArrayList<Object>();
        for (String nk : keys(notYet)) { if (now - num(notYet.get(nk)) <= notYetKeepSec * 1000) nyList.add(Double.valueOf(Double.parseDouble(nk))); else notYet.remove(nk); }
        if (!truthy(eta.get("timetableFirst")) && !Boolean.FALSE.equals(eta.get("boarded"))) {
            double gapMs = now - (truthy(st.get("lastFixMs")) ? num(st.get("lastFixMs")) : (truthy(st.get("firstAt")) ? num(st.get("firstAt")) : now));
            if (gapMs >= gpsGapDeadReckonSec * 1000 && !truthy(st.get("dr"))) { st.put("dr", Boolean.TRUE); notes.add("GPS 끊김 " + ns(round(gapMs / 1000)) + "초 — 계획 시각표대로 이어감"); }
            else if (truthy(st.get("dr")) && newPass) { st.put("dr", Boolean.FALSE); notes.add("GPS 통과 증거 복귀 — 시각표 이어가기 해제"); }
        } else st.put("dr", Boolean.FALSE);
        Map<String, Object> ein = copyM(eta); ein.put("nowMs", now);
        if (truthy(st.get("dr"))) ein.put("timetableFirst", Boolean.TRUE);
        ein.put("passes", passes);
        if (!nyList.isEmpty() && truthy(eta.get("timetableFirst"))) ein.put("notYet", nyList); else ein.remove("notYet");
        Map<String, Object> fired = mm(st.get("fired")); if (fired == null) { fired = obj(); st.put("fired", fired); }
        Map<String, Object> r = RideEtaJ.rideEta(ein);
        if (r == null || r.get("etaMs") == null) return obj("v", 1, "state", st, "ongoing", obj("title", ongoingTitle, "text", ""), "alert", null, "done", Boolean.FALSE, "nextMs", stepMs, "notes", list("도착 시각 계산 실패"));
        st.put("etaMs", r.get("etaMs"));
        if (r.get("delayMin") != null) { eta.put("prevLevelMin", r.get("delayMin")); eta.put("prevAnchorIdx", r.get("anchorIdx")); }
        // 4) 지금 어느 역까지 왔나
        List<Object> nodes = enodes; Map<String, Object> cfg = mm(st.get("cfg")); if (cfg == null) cfg = obj();
        double curIdx = -1; Map<String, Object> rpos = mm(r.get("pos"));
        Object etaMs = r.get("etaMs");
        if (rpos != null && rpos.get("from") != null) curIdx = num(rpos.get("from"));
        else { for (i = 0; i < nodes.size(); i++) if (at(etaMs, i) != null && etaAt(etaMs, i) <= now) curIdx = i; }
        Al al = alerts(cfg, fired, curIdx, etaMs, now);
        // 경로 이탈
        Map<String, Object> offRes = null; boolean offActive = false;
        try {
            List<Object> ptsO = new ArrayList<Object>();
            if (stSt != null) for (Object q : stSt) if (truthy(q) && fin(g(q, "lat")) && fin(g(q, "lng"))) ptsO.add(obj("lat", g(q, "lat"), "lng", g(q, "lng")));
            // ★ 2026-10-25 (YJ: 경로확정이 계속 풀려): 아직 안 탄 대기 중(wait · boarded:false · notDeparted)에는 이탈을 보지 않는다 — 역으로 걸어가는 동안 '이탈'로 읽혀 15분 뒤 안내가 끝나 확정이 풀렸다(엔진 ride-standby.js 와 같은 규칙).
            boolean preBoard = st.get("wait") != null || Boolean.FALSE.equals(eta.get("boarded")) || Boolean.TRUE.equals(eta.get("notDeparted"));
            if (preBoard) { st.put("offOn", 0.0); st.put("offAlertAt", 0.0); }
            if (!preBoard && !tr.isEmpty() && ptsO.size() >= 2 && !truthy(st.get("arrivedAt"))) {
                boolean tfO = Boolean.TRUE.equals(eta.get("timetableFirst"));
                Map<String, Object> ot = RideTrackJ.rideTrack(obj("nowMs", now, "trail", tr, "plan", obj("pts", ptsO, "progIsSub", tfO, "subConfirmed", tfO, "boarded", Boolean.TRUE, "notDeparted", Boolean.FALSE, "suppress", new ArrayList<Object>()),
                    "want", obj("off", Boolean.TRUE, "ridden", Boolean.FALSE, "miss", Boolean.FALSE, "bus", Boolean.FALSE, "board", Boolean.FALSE)));
                offRes = ot != null ? mm(ot.get("off")) : null;
            }
        } catch (RuntimeException eOff) { notes.add("이탈 판정 실패: " + eOff.getMessage()); }
        if (offRes != null && truthy(offRes.get("confirmed"))) { if (!truthy(st.get("offOn"))) st.put("offOn", now); offActive = true; }
        else if (offRes != null && "on_path".equals(offRes.get("why"))) { st.put("offOn", 0.0); st.put("offAlertAt", 0.0); }
        else if (truthy(st.get("offOn"))) offActive = true;
        if (offActive) {
            if (al.alert != null) { al.alert = null; al.extra = new ArrayList<String>(); }
            Object offCfg = mm(cfg.get("allowed")) == null ? null : mm(cfg.get("allowed")).get("offroute");
            if (!Boolean.FALSE.equals(offCfg) && !truthy(st.get("offAlertAt"))) {
                st.put("offAlertAt", now);
                al.alert = obj("key", "offroute_" + ns(now), "type", "offroute", "title", "경로를 벗어났어요", "body", "앱을 열면 지금 위치에서 다시 찾아 드려요", "vib", list(0, 300, 150, 300));
                notes.add("이탈 알림(" + (offRes != null ? str(offRes.get("why")) + " " + ns(num(offRes.get("distM"))) + "m" : "유지") + ")");
            }
        }
        if (st.get("wait") != null) { al.alert = null; al.extra = new ArrayList<String>(); }
        if (al.alert != null && !"offroute".equals(al.alert.get("type"))) {
            String akey = str(al.alert.get("key"));
            fired.put(akey, 1.0); for (String ek : al.extra) fired.put(ek, 1.0);
            if (akey.endsWith("_0") && !truthy(st.get("arrivedAt"))) st.put("arrivedAt", now);
        }
        List<Object> seq = l(cfg.get("seq")); if (seq == null) seq = new ArrayList<Object>();
        Map<String, Object> dest = null; int nextIdx = -1;
        List<Object> targets = l(cfg.get("targets")); if (targets != null) for (Object t : targets) if ("dest".equals(g(t, "kind"))) dest = mm(t);
        for (i = 0; i < seq.size(); i++) if (num(seq.get(i)) > curIdx) { nextIdx = (int) num(seq.get(i)); break; }
        String destNameC = or(cfg.get("destName"), dest != null && truthy(dest.get("name")) ? str(dest.get("name")) : "목적지");
        String text;
        if (dest != null && al.curPos >= num(dest.get("seqPos"))) text = destNameC + " 도착";
        else if (nextIdx >= 0) {
            Object nxn = nextIdx < nodes.size() ? nodes.get(nextIdx) : null; String nm = truthy(nxn) ? or(g(nxn, "name"), "") : "";
            Object aro = at(l(r.get("arr")), nextIdx); String ar = truthy(aro) ? str(aro) : "";
            text = "다음 " + nm + (ar.length() > 0 ? " " + ar : "") + (dest != null && al.curPos >= 0 ? " · " + destNameC + "까지 " + ns(Math.max(0, num(dest.get("seqPos")) - al.curPos)) + "정거장" : "");
        } else text = "";
        if (st.get("wait") != null) {
            int wi = (int) num(mm(st.get("wait")).get("i")); Object wn = wi >= 0 && wi < nodes.size() ? nodes.get(wi) : null; Object wa = at(l(r.get("arr")), wi);
            text = "승차 대기 · " + (truthy(wn) ? or(g(wn, "name"), "") : "") + (truthy(wa) ? " " + str(wa) : "") + " · " + or(cfg.get("destName"), dest != null && truthy(dest.get("name")) ? str(dest.get("name")) : "목적지") + "까지";
        }
        if (offActive) text = "경로를 벗어났어요 · 앱을 열면 다시 찾아 드려요";
        boolean done = false, quit = false;
        if (truthy(st.get("arrivedAt")) && now - num(st.get("arrivedAt")) >= doneAfterSec * 1000) { done = true; quit = true; notes.add("목적지 도착 " + ns(doneAfterSec) + "초 뒤 종료"); }
        if (offActive && truthy(st.get("offOn")) && now - num(st.get("offOn")) >= offGiveUpSec * 1000) { done = true; notes.add("경로를 벗어난 채 " + ns(offGiveUpSec) + "초 — 안내 종료"); }
        double lastAt = truthy(st.get("lastAt")) ? num(st.get("lastAt")) : now;
        if (now - lastAt > maxStaleSec * 1000) done = true;
        st.put("lastAt", now);
        boolean moving = rpos != null && truthy(rpos.get("moving"));
        Map<String, Object> motion = tk != null ? mm(tk.get("motion")) : null;
        if (progBus && motion != null && motion.get("moving") != null) moving = Boolean.TRUE.equals(motion.get("moving"));
        double nextMsV = nextMsAt(st, r, now);
        Map<String, Object> overlay = null;
        try { overlay = overlay(st, r, curIdx, al.curPos, now, dest, or(cfg.get("destName"), dest != null && truthy(dest.get("name")) ? str(dest.get("name")) : ""), moving, done); }
        catch (RuntimeException eOv) { notes.add("오버레이 계산 실패: " + eOv.getMessage()); }
        if (offActive && overlay != null && Boolean.TRUE.equals(overlay.get("active"))) { overlay.put("alert", 0.0); overlay.put("pre", Boolean.FALSE); overlay.put("banner", "경로를 벗어났어요 — 앱을 열면 다시 찾아 드려요"); }
        Map<String, Object> reco = obj("fire", Boolean.FALSE);
        try { if (!done) reco = reco(st, r, dest, or(cfg.get("destName"), dest != null && truthy(dest.get("name")) ? str(dest.get("name")) : ""), now, offActive); }
        catch (RuntimeException eRc) { notes.add("추천 판단 실패: " + eRc.getMessage()); }
        Map<String, Object> view = obj("text", text, "line1", overlay != null && truthy(overlay.get("line1")) ? overlay.get("line1") : "", "line2", overlay != null && truthy(overlay.get("line2")) ? overlay.get("line2") : "", "curIdx", curIdx, "at", now);
        Map<String, Object> row = done ? null : rowOut(st, now);
        return obj("v", 1, "state", st, "ongoing", obj("title", ongoingTitle, "text", text), "row", row, "alert", al.alert, "done", done, "quit", quit, "curIdx", curIdx, "overlay", overlay, "reco", reco, "view", view,
            "pos", rpos != null ? obj("from", rpos.get("from"), "to", rpos.get("to"), "ratio", rpos.get("ratio"), "moving", truthy(rpos.get("moving"))) : null,
            "arr", r.get("arr"), "zero", zero, "nextMs", done ? stepMs : nextMsV, "motion", motion, "notes", notes);
    }
}
