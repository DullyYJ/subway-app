package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.GregorianCalendar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import java.util.TreeMap;

import static com.dullyyj.subway.RideJs.*;

/**
 * engine/ride-eta.js 의 자바 포팅 — 탑승 중 도착 시각 계산(통과 증거 → 지연 수준(변화점 HMM) → 노드별 도착 시각) · 시각표 기준 위치(pos) · 정차(hold) · 경로 카드 버튼 줄(row).
 * 서버 함수를 한 줄씩 그대로 옮겼다(조정값 · 순서 · 반올림 · 설명 글까지). opts(민감도 시험용 덮어쓰기)와 labels · arrive 기능은 대기 모드가 쓰지 않아 옮기지 않았다.
 */
final class RideEtaJ {
    private RideEtaJ() { }

    // ── 조정값(RIDE_ETA_DEFAULTS) ──
    static final double pfLagSec = 35, pfLagMinSec = 5, pfLagMaxSec = 70,
        boardLagMinSec = 20, boardLagNormSec = 120, boardLateMinSec = 170, boardLagMaxSec = 370, boardNormW = 0.8, boardSoftMin = 0.25, boardFloor = 0.0008,
        cellLeadMinSec = 60, cellLeadMaxSec = 180, gpsTolSec = 25, levelDeadbandMin = 0.4, zeroFollow = 1, zeroMaxJumpMin = 6, zeroSoloMaxMin = 8,
        moveLagMinSec = -35, moveLagMaxSec = 60, moveTolSec = 10,
        backlogGapSec = 12, burstExactSec = 6.5, burstAmbigW = 0.5, minRunRatio = 0.6, burstTolSec = 45, levelWindow = 3,
        robust = 0, epsJump = 0.04, epsOut = 0.03, robustFloor = 0.03, earlyJumpMaxMin = 0,
        hmm = 1, bimodalSpanMin = 0, looseOnlyAtStart = 1, jumpUpScaleMin = 4, jumpDnScaleMin = 1.5, jumpUpW = 0.75, priorNegWideSd = 3.5,
        driftPerStop = 0.12, driftBiasPerStop = 0.07,
        priorDelayMin = 0.5, priorNarrowW = 0.5, priorNarrowSd = 3, priorWideSd = 8, softMin = 0.2, quantile = 0.1,
        snapBackMin = 2, snapLateMaxMin = 1.5, snapCandMaxMin = 6, snapEps = 0.5, snapOldW = 0.4, staleShiftMin = 40,
        stopDwellSec = 15, markerDwellSec = 15, arriveEarlySec = 5, posSegCount = 80,
        overdueSec = 60, overdueMaxMin = 15, overdueExtraMin = 0.5, overdueGain = 1,
        platMinOverMin = 1, platGraceMin = 4, platExtraMin = 0.5, liveMinSec = 20, liveMaxSec = 900, liveHmm = 1, liveSdSec = 30, epsLive = 0.35,
        boardMaxWaitMin = 30, planSecOffset = 50, holdAfterStops = 1, holdGraceSec = 60;
    static final boolean burstRamp = true, arriveEarlyAfterZero = true;
    static final String rounding = "floor", overdueMode = "clamp";

    static double fold(double d) { return d - round(d / 1440) * 1440; }
    static String hhmm(double ms, double tzMin, String rnd) {
        double m = (ms + tzMin * 60000) / 60000;
        m = "floor".equals(rnd) ? Math.floor(m + 1e-9) : round(m);
        m = ((m % 1440) + 1440) % 1440;
        int h = (int) Math.floor(m / 60); double mi = m % 60;
        return (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + ns(mi);
    }
    static double min(double ms, double tzMin) { double m = ((ms + tzMin * 60000) / 60000) % 1440; return (m + 1440) % 1440; }
    static boolean isTransit(Object n) { return truthy(n) && !truthy(g(n, "isWalk")) && !truthy(g(n, "isOrigin")) && (truthy(g(n, "isSub")) || truthy(g(n, "isBus"))); }
    static int srcPri(String src) { return "gps".equals(src) ? 6 : "move".equals(src) ? 5 : "pf".equals(src) ? 4 : "drift".equals(src) ? 3 : "board".equals(src) ? 2 : 1; }
    static String lineOf(Object n) { Object v = g(n, "lineName"); return truthy(v) ? str(v) : ""; }

    static final class Pass {
        final int idx; final double ms; final String src;
        Pass(int idx, double ms, String src) { this.idx = idx; this.ms = ms; this.src = src; }
    }
    static String nameOr(Object node, int idx) { Object nm = g(node, "name"); return truthy(nm) ? str(nm) : String.valueOf(idx); }

    // ═════════════ 경로 카드 버튼 줄 ═════════════
    static Map<String, Object> rideRow(Map<String, Object> input) {
        List<Object> legs = l(g(input, "legs")); if (legs == null) legs = new ArrayList<Object>();
        int L = legs.size(), b = 0, i;
        for (i = 0; i < L; i++) { if (truthy(g(legs.get(i), "done"))) b++; else break; }
        String slot = "none", label = ""; int leg = -1;
        if (input != null && Boolean.TRUE.equals(input.get("locked")) && L > 0) {
            if (b >= L) { slot = "arrive"; label = "도착"; leg = -1; }
            else if (b == 0) { slot = "board"; label = "탑승"; leg = 0; }
            else { slot = "transfer"; label = "환승"; leg = b; }
        }
        String prev = input != null && truthy(input.get("prev")) ? str(input.get("prev")) : "none", kind = "none";
        if (!prev.equals("none") && !prev.equals("board") && !prev.equals("transfer") && !prev.equals("arrive")) prev = "none";
        if (!prev.equals(slot)) {
            if (prev.equals("none")) kind = "push_in";
            else if (slot.equals("none")) kind = "push_out";
            else if ((prev.equals("board") && slot.equals("transfer")) || prev.equals("arrive")) kind = "slide_down";
            else kind = "slide_up";
        }
        return obj("v", 1, "slot", slot, "label", label, "leg", leg, "transfers", Math.max(0, L - 1), "cols", slot.equals("none") ? 2 : 3,
            "anim", obj("kind", kind, "ms", (kind.equals("push_in") || kind.equals("push_out")) ? 420 : (kind.equals("none") ? 0 : 380), "ease", list(0.2, 0, 0, 1)));
    }

    // ═════════════ 응원 문구 ═════════════
    private static final String[][] CHEER = {
        /* 0 rain */ { "빗길 미끄러우니 천천히 내려요", "비 오는 날, 우산 챙기고 조심히 가요" },
        /* 1 snow */ { "눈길 미끄러우니 천천히 내려요", "눈 오는 날, 발밑 조심해요" },
        /* 2 cold */ { "쌀쌀해요, 따뜻하게 다녀요", "추운 날, 목도리 단단히 해요" },
        /* 3 hot */ { "더운 날, 물 한 모금 챙겨요", "더위에 지치지 않게 천천히 가요" },
        /* 4 friEve */ { "한 주 고생했어요, 주말 잘 보내요", "금요일 밤이에요, 푹 쉬어요" },
        /* 5 monMorn */ { "월요일도 가볍게 시작해요", "이번 주도 응원할게요" },
        /* 6 weekend */ { "즐거운 주말 보내요", "쉬는 날, 여유롭게 즐겨요" },
        /* 7 payday */ { "월급날이에요, 오늘은 나를 챙겨요", "월급날, 맛있는 것 하나쯤 괜찮아요" },
        /* 8 morning */ { "오늘도 좋은 하루 보내요", "아침부터 고생 많아요, 화이팅이에요", "좋은 일이 기다리는 하루가 되길요" },
        /* 9 midday */ { "점심 맛있게 먹고 힘내요", "오후도 거뜬히 해낼 수 있어요" },
        /* 10 afternoon */ { "남은 오후도 화이팅이에요", "조금만 더, 잘하고 있어요" },
        /* 11 evening */ { "오늘 하루도 수고 많았어요", "퇴근길 고생했어요, 푹 쉬어요" },
        /* 12 night */ { "늦은 시간까지 고생했어요", "오늘 하루 정말 수고했어요" },
        /* 13 late */ { "늦은 밤 조심히 들어가요", "고단한 하루, 푹 쉬어요" } };
    /** wx 는 보통 null — {rainy, snowy, temp}. */
    static String arrCheer(double nowMs, double tzMin, Object wx) {
        double m = min(nowMs, tzMin); int h = (int) Math.floor(m / 60);
        GregorianCalendar c = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        c.setTimeInMillis((long) (nowMs + tzMin * 60000));
        int dow = c.get(GregorianCalendar.DAY_OF_WEEK) - 1, dom = c.get(GregorianCalendar.DAY_OF_MONTH);
        int key;
        if (wx != null && truthy(g(wx, "snowy"))) key = 1;
        else if (wx != null && truthy(g(wx, "rainy"))) key = 0;
        else if (wx != null && fin(g(wx, "temp")) && gn(wx, "temp") <= 3) key = 2;
        else if (wx != null && fin(g(wx, "temp")) && gn(wx, "temp") >= 28) key = 3;
        else if (dow == 5 && h >= 17) key = 4;
        else if (dow == 1 && h >= 5 && h < 11) key = 5;
        else if (dow == 0 || dow == 6) key = 6;
        else if (dom >= 24 && dom <= 26 && h >= 11) key = 7;
        else key = h < 5 ? 13 : h < 10 ? 8 : h < 14 ? 9 : h < 17 ? 10 : h < 21 ? 11 : 12;
        String[] L = CHEER[key];
        long seed = (long) c.get(GregorianCalendar.YEAR) * 400 + (c.get(GregorianCalendar.MONTH) + 1) * 31L + dom + h * 3L;
        return L[(int) (Math.abs(seed) % L.length)];
    }

    // ═════════════ 진입 ═════════════
    static Map<String, Object> rideEta(Map<String, Object> input) {
        if (input != null && "row".equals(input.get("op"))) return rideRow(input);
        Map<String, Object> r = core(input);
        try { r.put("hold", hold(input, r)); } catch (RuntimeException eH) { r.put("hold", null); }
        try { if (input != null && Boolean.TRUE.equals(input.get("timetableFirst")) && !Boolean.TRUE.equals(input.get("notDeparted")) && r != null && r.get("etaMs") != null) r.put("pos", pos(input, r)); }
        catch (RuntimeException e) { r.put("pos", null); }
        return r;
    }

    private static double[] etaArr(Map<String, Object> r) {
        List<Object> l = l(r.get("etaMs")); double[] a = new double[l == null ? 0 : l.size()];
        for (int i = 0; i < a.length; i++) a[i] = l.get(i) == null ? Double.NaN : num(l.get(i));
        return a;
    }

    // ═════════════ 시각표 기준 위치 ═════════════
    static Map<String, Object> pos(Map<String, Object> input, Map<String, Object> r) {
        List<Object> nodes = l(input.get("nodes")); if (nodes == null) nodes = new ArrayList<Object>();
        final double[] out = etaArr(r); double nowMs = num(input.get("nowMs"));
        List<Integer> idxs = new ArrayList<Integer>(); int i, fl = -1;
        if (!fin(nowMs)) nowMs = System.currentTimeMillis();
        for (i = 0; i < nodes.size(); i++) if (i < out.length && !Double.isNaN(out[i])) idxs.add(i);
        if (idxs.isEmpty()) return null;
        List<Object> ps = l(input.get("passes")); if (ps == null) ps = new ArrayList<Object>();
        for (i = 0; i < ps.size(); i++) { double pi = gn(ps.get(i), "idx"); if (fin(pi) && pi >= 0 && pi < nodes.size() && pi > fl) fl = (int) pi; }
        double early = Math.max(0, truthy(arriveEarlySec) ? arriveEarlySec : 0) * 1000;
        final int last = idxs.size() - 1; int zeroIdx = -1;
        if (arriveEarlyAfterZero) {
            for (i = 0; i < ps.size(); i++) { double zi = gn(ps.get(i), "idx"); if ("gps".equals(g(ps.get(i), "src")) && fin(zi) && zi > zeroIdx) zeroIdx = (int) zi; }
            if (zeroIdx < 0) early = 0;
        }
        final double earlyF = early; final int zeroF = zeroIdx; final List<Integer> ix = idxs;
        final Eff eff = new Eff(out, ix, last, zeroF, earlyF);
        int f = idxs.get(0), k;
        for (k = 0; k < idxs.size(); k++) { if (eff.at(k) <= nowMs) f = idxs.get(k); else break; }
        if (fl > f) f = fl;
        int pos = -1;
        for (k = 0; k < idxs.size(); k++) if (idxs.get(k) == f) { pos = k; break; }
        if (pos < 0) {
            for (k = 0; k < idxs.size(); k++) if (idxs.get(k) > f) { pos = Math.max(0, k - 1); break; }
            if (pos < 0) pos = idxs.size() - 1;
            f = idxs.get(pos);
        }
        // s268: 도착 확정 실패 목록(pos.miss) — 마커는 세우지 않는다(시각표대로 전진, 다음 역 영점에서 맞춘다)
        List<Object> missL = new ArrayList<Object>(); int cf = -1;
        if (holdAfterStops > 0) {
            for (i = 0; i < ps.size(); i++) {
                Object P0 = ps.get(i); String sr0 = truthy(g(P0, "src")) ? str(g(P0, "src")) : ""; double pi0 = gn(P0, "idx");
                if (("gps".equals(sr0) || "move".equals(sr0) || "pf".equals(sr0)) && fin(pi0) && pi0 > cf) cf = (int) pi0;
            }
            for (k = 1; k < idxs.size(); k++) {
                int nI = idxs.get(k); if (nI <= cf || !truthy(nodes.get(nI)) || !truthy(g(nodes.get(nI), "isSub")) || legPos(nodes, nI) < holdAfterStops) continue;
                if (eff.at(k) + holdGraceSec * 1000 <= nowMs) missL.add(Integer.valueOf(nI)); else break;
            }
        }
        if (pos >= idxs.size() - 1) return obj("from", f, "to", f, "t0", null, "t1", null, "ratio", 0, "moving", Boolean.FALSE, "floor", fl, "segs", new ArrayList<Object>());
        int t = idxs.get(pos + 1);
        double t0 = eff.at(pos) + dwMs(nodes, idxs.get(pos)), t1 = eff.at(pos + 1);
        if (!(t1 - t0 >= 5000)) t0 = eff.at(pos);
        double ratio = t1 > t0 ? Math.max(0, Math.min(1, (nowMs - t0) / (t1 - t0))) : 0;
        List<Object> segs = new ArrayList<Object>();
        int lim = (int) Math.min(idxs.size() - 1, pos + posSegCount);
        for (int q = pos; q < lim; q++) {
            int fa = idxs.get(q), fb = idxs.get(q + 1); double s0 = eff.at(q) + dwMs(nodes, fa), s1 = eff.at(q + 1);
            if (!(s1 - s0 >= 5000)) s0 = eff.at(q);
            segs.add(obj("from", fa, "to", fb, "a", d(eff.at(q)), "t0", d(s0), "t1", d(s1)));
        }
        Map<String, Object> outP = obj("from", f, "to", t, "t0", d(t0), "t1", d(t1), "ratio", d(round(ratio * 1000) / 1000), "moving", ratio > 0 && ratio < 1, "floor", fl, "segs", segs);
        if (!missL.isEmpty()) outP.put("miss", missL);
        return outP;
    }
    /** 같은 노선·같은 종류의 이어진 정차 노드에서 이 노드가 승차역 뒤 몇 번째인가(승차역 = 0) — ride-eta _reLegPos */
    static int legPos(List<Object> nodes, int n) {
        int c = 0, j = n; Object nd = n < nodes.size() ? nodes.get(n) : null;
        while (j > 0) {
            Object pv = nodes.get(j - 1);
            if (isTransit(pv) && isTransit(nd) && truthy(g(pv, "isBus")) == truthy(g(nd, "isBus")) && lineOf(pv).equals(lineOf(nd))) { c++; j--; } else break;
        }
        return c;
    }
    private static final class Eff {
        final double[] out; final List<Integer> ix; final int last, zeroF; final double earlyF;
        Eff(double[] out, List<Integer> ix, int last, int zeroF, double earlyF) { this.out = out; this.ix = ix; this.last = last; this.zeroF = zeroF; this.earlyF = earlyF; }
        double at(int kk) { return out[ix.get(kk)] - ((kk > 0 && kk < last && ix.get(kk) > zeroF) ? earlyF : 0); }
    }
    private static double dwMs(List<Object> nodes, int nodeIdx) { Object nn = nodeIdx < nodes.size() ? nodes.get(nodeIdx) : null; return (truthy(nn) && truthy(g(nn, "isBus"))) ? 0 : stopDwellSec * 1000; }

    // ═════════════ 정차 표시 ═════════════
    static Map<String, Object> hold(Map<String, Object> input, Map<String, Object> r) {
        List<Object> ps = l(g(input, "passes")); if (ps == null) ps = new ArrayList<Object>();
        List<Object> nodes = l(g(input, "nodes")); if (nodes == null) nodes = new ArrayList<Object>();
        double now = num(g(input, "nowMs")); if (!fin(now)) now = System.currentTimeMillis();
        double dw = Math.max(0, truthy(markerDwellSec) ? markerDwellSec : 0) * 1000;
        if (dw == 0 || r == null || r.get("etaMs") == null) return null;
        double[] eta = etaArr(r);
        double bestIdx = Double.NaN, bestMs = Double.NaN; String bestSrc = null;
        for (int i = 0; i < ps.size(); i++) {
            Object P = ps.get(i); double ix = num(g(P, "idx")); String sr = truthy(g(P, "src")) ? str(g(P, "src")) : "pf";
            if (!fin(ix) || ix < 0 || ix >= nodes.size() - 1 || sr.equals("board") || sr.equals("cell") || sr.equals("drift")) continue;
            Object nd = nodes.get((int) ix);
            if (truthy(nd) && truthy(g(nd, "isBus"))) continue;
            if ((int) ix >= eta.length || Double.isNaN(eta[(int) ix])) continue;
            if (Double.isNaN(bestIdx) || ix > bestIdx) { bestIdx = ix; bestSrc = sr; bestMs = num(g(P, "ms")); }
        }
        if (Double.isNaN(bestIdx)) return null;
        double at = fin(bestMs) ? bestMs : eta[(int) bestIdx], until = at + dw;
        if (!(now >= at - 2000 && now < until)) return null;
        return obj("idx", bestIdx, "src", bestSrc, "atMs", d(at), "untilMs", d(until));
    }

    // ═════════════ 도착 시각 계산 ═════════════
    static Map<String, Object> core(Map<String, Object> input0) {
        Map<String, Object> input = input0 == null ? obj() : input0;
        double tz = input.get("tzOffsetMin") instanceof Number ? num(input.get("tzOffsetMin")) : 540;
        List<Object> nodes = l(input.get("nodes")); if (nodes == null) nodes = new ArrayList<Object>();
        final int n = nodes.size();
        List<Object> notes = new ArrayList<Object>();
        List<Object> passesIn = l(input.get("passes")); if (passesIn == null) passesIn = new ArrayList<Object>();
        int i, j, ii; String k;

        double nowMs = num(input.get("nowMs"));
        if (!fin(nowMs)) {
            nowMs = 0;
            for (ii = 0; ii < passesIn.size(); ii++) if (gn(passesIn.get(ii), "ms") > nowMs) nowMs = gn(passesIn.get(ii), "ms");
            if (nowMs == 0) nowMs = System.currentTimeMillis();
        }

        // 1. 예정 시각
        double[] planMs = new double[n]; boolean[] valid = new boolean[n];
        int firstValid = -1, prevValid = -1; double chain = 0, nowMin = min(nowMs, tz), ms0 = 0;
        for (i = 0; i < n; i++) {
            Object pmI = g(nodes.get(i), "planMin");
            valid[i] = (pmI != null && fin(pmI));
            if (!valid[i]) { planMs[i] = Double.NaN; continue; }
            if (firstValid < 0) { firstValid = i; chain = num(pmI); ms0 = nowMs + fold(num(pmI) - nowMin) * 60000 + (truthy(planSecOffset) ? planSecOffset : 0) * 1000; }
            else chain += fold(num(pmI) - gn(nodes.get(prevValid), "planMin"));
            planMs[i] = ms0 + (chain - gn(nodes.get(firstValid), "planMin")) * 60000;
            prevValid = i;
        }
        if (firstValid < 0) return obj("arr", new ArrayList<Object>(), "etaMs", new ArrayList<Object>(), "delayMin", 0, "anchorIdx", -1, "notes", list("planMin 이 있는 노드가 없다"));

        // 2. 승차 구간 구조
        boolean[] isLegStart = new boolean[n]; int[] legOf = new int[n]; int boardIdx = -1, curLeg = -1;
        for (i = 0; i < n; i++) {
            Object nd = nodes.get(i), pv = i > 0 ? nodes.get(i - 1) : null;
            isLegStart[i] = isTransit(nd) && (!truthy(pv) || truthy(g(pv, "isWalk")) || truthy(g(pv, "isOrigin")) || !lineOf(pv).equals(lineOf(nd)) || truthy(g(pv, "isBus")) != truthy(g(nd, "isBus")));
            if (isLegStart[i]) curLeg = i;
            legOf[i] = isTransit(nd) ? curLeg : -1;
            if (boardIdx < 0 && isTransit(nd)) boardIdx = i;
        }

        // 3. 아직 안 탔으면
        double[] out = new double[n];
        if (Boolean.TRUE.equals(input.get("notDeparted")) || Boolean.FALSE.equals(input.get("boarded"))) {
            for (int q = 0; q < n; q++) out[q] = valid[q] ? planMs[q] : Double.NaN;
            notes.add("승차 전: 승차역 이후 시각은 예정 그대로");
            boolean bOk = boardIdx >= 0 && valid[boardIdx];
            Object bnx = input.get("boardNext");
            if (bOk && truthy(bnx) && fin(g(bnx, "ms"))) {
                double wN = (gn(bnx, "ms") - planMs[boardIdx]) / 60000, maxW = (g(bnx, "maxWaitMin") != null && fin(g(bnx, "maxWaitMin"))) ? gn(bnx, "maxWaitMin") : boardMaxWaitMin;
                boolean okN = truthy(g(bnx, "allowEarlier")) ? (Math.abs(wN) >= 1 && wN <= maxW && wN >= -180) : (wN > 0.5 && wN <= maxW);
                if (okN) { shiftFrom(out, boardIdx, wN * 60000); notes.add("다음 차 시각 " + ns(round(wN * 10) / 10) + "분 반영(" + (truthy(g(bnx, "src")) ? str(g(bnx, "src")) : "?") + ")"); }
            }
            if (Boolean.TRUE.equals(input.get("platformWaiting")) && bOk) {
                double overP = (nowMs - out[boardIdx]) / 60000, origP = (nowMs - planMs[boardIdx]) / 60000;
                if (overP >= platMinOverMin && origP < platGraceMin) {
                    double addP = (overP + platExtraMin) * 60000;
                    shiftFrom(out, boardIdx, addP);
                    notes.add("승강장 대기: 예정 출발 " + ns(round(overP * 60)) + "초 지남 → 열차 지연으로 보고 승차역 이후 +" + ns(round(addP / 1000)) + "초");
                }
            }
            if (bOk && fin(input.get("boardArriveMs"))) {
                double dA = (num(input.get("boardArriveMs")) - out[boardIdx]) / 60000;
                if (dA > 0.02) { shiftFrom(out, boardIdx, dA * 60000); notes.add("승차역 시각을 내가 닿는 시각(" + ns(round(dA * 10) / 10) + "분 뒤)에 맞춤"); }
            }
            if (bOk) {
                double staleMin = (nowMs - out[boardIdx]) / 60000;
                if (staleMin > staleShiftMin) {
                    shiftFrom(out, 0, staleMin * 60000);
                    notes.add("승차 전 예정이 " + ns(round(staleMin)) + "분 지나 경로 전체를 지금에 맞춤");
                }
            }
            Map<String, Object> rPre = finish(out, tz, -1, 0, notes, n, nowMs);
            double[] pe = etaArr(rPre);
            double bv = bOk ? (((boardIdx < pe.length && !Double.isNaN(pe[boardIdx]) ? pe[boardIdx] : planMs[boardIdx]) - planMs[boardIdx]) / 600) : 0;
            rPre.put("boardShiftMin", bOk ? d(round(bv) / 100) : (Object) Double.valueOf(0));
            return rPre;
        }

        // 4. 통과 증거 정리
        TreeMap<Integer, Pass> byIdx = new TreeMap<Integer, Pass>();
        for (ii = 0; ii < passesIn.size(); ii++) {
            Object P = passesIn.get(ii);
            if (!truthy(P) || !fin(g(P, "idx")) || !fin(g(P, "ms"))) continue;
            double ixd = gn(P, "idx");
            if (ixd < 0 || ixd >= n || ixd != Math.floor(ixd)) continue;
            int ix = (int) ixd;
            if (!valid[ix] || !isTransit(nodes.get(ix))) continue;
            String src = truthy(g(P, "src")) ? str(g(P, "src")) : "pf";
            Pass cur = byIdx.get(ix); double pms = gn(P, "ms");
            if (cur == null || srcPri(src) > srcPri(cur.src) || (srcPri(src) == srcPri(cur.src) && pms < cur.ms)) {
                if (cur != null && "cell".equals(cur.src) && !"cell".equals(src)) notes.add("역 " + ix + ": 기지국 선행 대신 위치 채택을 씀");
                byIdx.put(ix, new Pass(ix, pms, src));
            }
        }
        List<Pass> ps = new ArrayList<Pass>(byIdx.values());
        List<Pass> kept = new ArrayList<Pass>(); double lastMs = Double.NEGATIVE_INFINITY;
        for (ii = 0; ii < ps.size(); ii++) {
            if (ps.get(ii).ms < lastMs - 20000) { notes.add("역 " + ps.get(ii).idx + " 통과 시각이 앞 역보다 이르다 → 버림"); continue; }
            kept.add(ps.get(ii)); if (ps.get(ii).ms > lastMs) lastMs = ps.get(ii).ms;
        }
        ps = kept;
        if (zeroSoloMaxMin > 0 && !ps.isEmpty()) {
            int soloLeg = legOf[ps.get(ps.size() - 1).idx], soloAt = -1, soloN = 0;
            for (ii = 0; ii < ps.size(); ii++) if ("gps".equals(ps.get(ii).src) && legOf[ps.get(ii).idx] == soloLeg) { soloN++; soloAt = ii; }
            if (soloN == 1) {
                Pass soloP = ps.get(soloAt); double soloLv = (soloP.ms - planMs[soloP.idx]) / 60000;
                double soloRef = (input.get("prevLevelMin") != null && fin(input.get("prevLevelMin"))) ? num(input.get("prevLevelMin")) : 0;
                if (fin(soloLv) && Math.abs(soloLv - soloRef) > zeroSoloMaxMin) {
                    notes.add("영점: " + nameOr(nodes.get(soloP.idx), soloP.idx) + " GPS 통과 " + ns(round(soloLv * 10) / 10) + "분이 기준(" + ns(round(soloRef * 10) / 10) + "분)에서 " + ns(zeroSoloMaxMin) + "분 넘게 벗어났고 확인해 줄 다른 GPS 통과가 없어 참고만 함(시각 그대로)");
                    List<Pass> f2 = new ArrayList<Pass>();
                    for (int qi = 0; qi < ps.size(); qi++) if (qi != soloAt) f2.add(ps.get(qi));
                    ps = f2;
                }
            }
        }
        if (ps.isEmpty()) {
            for (int q = 0; q < n; q++) out[q] = valid[q] ? planMs[q] : Double.NaN;
            notes.add("통과 증거 없음: 예정 그대로");
            return finish(out, tz, -1, 0, notes, n, nowMs);
        }

        // 5. 정적 시간표 후보
        int snapIdx = -1; Snap snap = null;
        Object TT = input.get("timetable");
        if (truthy(TT) && fin(g(TT, "boardIdx")) && l(g(TT, "times")) != null && !l(g(TT, "times")).isEmpty() && byIdx.get((int) gn(TT, "boardIdx")) != null) {
            boolean anyAfter = false;
            for (Integer kk : byIdx.keySet()) if (kk > gn(TT, "boardIdx")) { anyAfter = true; break; }
            int bIdx = (int) gn(TT, "boardIdx"); Pass bp = byIdx.get(bIdx);
            double bMin = min(bp.ms, tz), floorMin = Math.floor(min(bp.ms - snapBackMin * 60000, tz)), sub0 = (bMin - Math.floor(bMin)) * 60000;
            double best = Double.NaN; List<double[]> cands = new ArrayList<double[]>();
            List<Object> times = l(g(TT, "times"));
            double pb = bIdx < n ? planMs[bIdx] : Double.NaN;
            for (j = 0; j < times.size(); j++) {
                double t = num(times.get(j));
                double dBack = fold(Math.floor(bMin) - t);
                if (dBack < 0 || dBack > 30) continue;
                if (fold(t - floorMin) >= 0 && (Double.isNaN(best) || dBack < best)) best = dBack;
                if (dBack <= snapCandMaxMin) cands.add(new double[] { (bp.ms - sub0 - dBack * 60000 - pb) / 60000, (fold(t - floorMin) >= 0) ? 1 : snapOldW });
            }
            if (!cands.isEmpty() && !anyAfter) {
                snapIdx = bIdx;
                snap = new Snap(cands, Double.isNaN(best) ? null : "정적 시간표 스냅: " + nameOr(nodes.get(bIdx), bIdx) + " 승차 확정 " + hhmm(bp.ms, tz, "floor") + " → 시각표 " + hhmm(bp.ms - sub0 - best * 60000, tz, "floor") + " 이후 출발로 본다");
            }
        }

        // 6. 구간별 모델
        LinkedHashMap<Integer, List<Pass>> legsMap = new LinkedHashMap<Integer, List<Pass>>();
        for (ii = 0; ii < ps.size(); ii++) { int lg = legOf[ps.get(ii).idx]; if (!legsMap.containsKey(lg)) legsMap.put(lg, new ArrayList<Pass>()); legsMap.get(lg).add(ps.get(ii)); }
        List<Integer> legKeys = new ArrayList<Integer>(legsMap.keySet());
        TreeMap<Integer, Double> est = new TreeMap<Integer, Double>();
        Map<Integer, Double> legLevel = new LinkedHashMap<Integer, Double>();
        Map<Integer, Boolean> liveUsed = new LinkedHashMap<Integer, Boolean>();
        List<Object> liveIn0 = l(input.get("live")); if (liveIn0 == null) liveIn0 = new ArrayList<Object>();
        for (ii = 0; ii < legKeys.size(); ii++) {
            int L = legKeys.get(ii);
            double prior = priorDelayMin;
            if (ii > 0) prior = Math.max(priorDelayMin, legLevel.get(legKeys.get(ii - 1)));
            List<double[]> liveL = null; List<List<Double>> liveMs = null;
            if (liveHmm != 0 && ii == legKeys.size() - 1) {
                liveL = new ArrayList<double[]>(); liveMs = new ArrayList<List<Double>>();
                List<Pass> lp = legsMap.get(L); int lastPs = lp.get(lp.size() - 1).idx;
                Map<Integer, List<Double>> liveSeen = new LinkedHashMap<Integer, List<Double>>();
                for (int lj = 0; lj < liveIn0.size(); lj++) {
                    Object LV0 = liveIn0.get(lj);
                    if (!truthy(LV0) || !fin(g(LV0, "idx")) || !fin(g(LV0, "ms")) || Boolean.TRUE.equals(g(LV0, "fix"))) continue;
                    double li0d = gn(LV0, "idx"); int li0 = (int) li0d;
                    if (li0d != li0 || li0 <= lastPs || li0 >= n || li0 < 0 || !valid[li0] || !isTransit(nodes.get(li0)) || legOf[li0] != L) continue;
                    if (!liveSeen.containsKey(li0)) liveSeen.put(li0, new ArrayList<Double>());
                    if (liveSeen.get(li0).size() < 4) liveSeen.get(li0).add(gn(LV0, "ms"));
                }
                List<Integer> lk = new ArrayList<Integer>(liveSeen.keySet());
                Collections.sort(lk);
                for (int li : lk) { liveL.add(new double[] { li }); liveMs.add(liveSeen.get(li)); liveUsed.put(li, Boolean.TRUE); }
            }
            LegModel mdl = new LegModel(legsMap.get(L), planMs, prior, (snapIdx >= 0 && legOf[snapIdx] == L) ? snap : null, notes, liveL, liveMs);
            mdl.run();
            legLevel.put(L, mdl.level);
            for (Map.Entry<Integer, Double> e : mdl.est.entrySet()) est.put(e.getKey(), e.getValue());
        }
        // 영점(GPS 통과)
        List<Integer> gpsIdx = new ArrayList<Integer>();
        for (ii = 0; ii < ps.size(); ii++) if ("gps".equals(ps.get(ii).src) && legOf[ps.get(ii).idx] == legOf[ps.get(ps.size() - 1).idx]) gpsIdx.add(ii);
        double zeroLevel = Double.NaN;
        if (zeroFollow != 0 && !gpsIdx.isEmpty()) {
            Pass gLast = ps.get(gpsIdx.get(gpsIdx.size() - 1));
            zeroLevel = (gLast.ms - planMs[gLast.idx]) / 60000;
            Double mLv = legLevel.get(legOf[gLast.idx]);
            if (mLv != null && Math.abs(zeroLevel - mLv) > zeroMaxJumpMin) { notes.add("영점: GPS 통과가 추정과 " + ns(zeroMaxJumpMin) + "분 넘게 달라 이상치로 보고 쓰지 않음"); zeroLevel = Double.NaN; gpsIdx = new ArrayList<Integer>(); }
        }
        if (zeroFollow != 0 && !gpsIdx.isEmpty()) {
            for (ii = 0; ii < gpsIdx.size(); ii++) { Pass gP = ps.get(gpsIdx.get(ii)); est.put(gP.idx, gP.ms); }
            for (ii = 0; ii + 1 < gpsIdx.size(); ii++) {
                Pass gA = ps.get(gpsIdx.get(ii)), gB = ps.get(gpsIdx.get(ii + 1)); double spanP = planMs[gB.idx] - planMs[gA.idx];
                if (!(spanP > 0)) continue;
                for (int gq = 0; gq < ps.size(); gq++) {
                    Pass wq = ps.get(gq);
                    if (wq.idx <= gA.idx || wq.idx >= gB.idx || "gps".equals(wq.src)) continue;
                    est.put(wq.idx, gA.ms + (gB.ms - gA.ms) * ((planMs[wq.idx] - planMs[gA.idx]) / spanP));
                }
            }
            Pass gLast = ps.get(gpsIdx.get(gpsIdx.size() - 1));
            notes.add("영점: " + nameOr(nodes.get(gLast.idx), gLast.idx) + " GPS 통과 " + ns(round(zeroLevel * 10) / 10) + "분(예정 대비)을 뒤 시각의 기준으로 삼음");
        }
        if (zeroFollow != 0) {
            List<Integer> eKeys = new ArrayList<Integer>(est.keySet());
            for (ii = eKeys.size() - 2; ii >= 0; ii--) {
                int ea = eKeys.get(ii), eb = eKeys.get(ii + 1);
                Pass pa = byIdx.get(ea);
                if (pa == null || "gps".equals(pa.src) || !(planMs[eb] > planMs[ea])) continue;
                double limE = est.get(eb) - minRunRatio * (planMs[eb] - planMs[ea]);
                if (est.get(ea) > limE) est.put(ea, limE);
            }
        }
        Pass anchor = ps.get(ps.size() - 1);
        double level = legLevel.get(legOf[anchor.idx]);
        if (!Double.isNaN(zeroLevel) && !gpsIdx.isEmpty() && anchor.idx == ps.get(gpsIdx.get(gpsIdx.size() - 1)).idx) level = zeroLevel;
        boolean zeroApplied = (!Double.isNaN(zeroLevel) && !gpsIdx.isEmpty() && anchor.idx == ps.get(gpsIdx.get(gpsIdx.size() - 1)).idx);
        if (!zeroApplied && input.get("prevLevelMin") != null && fin(input.get("prevLevelMin")) && levelDeadbandMin > 0 && !(num(input.get("prevAnchorIdx")) > anchor.idx)
            && Math.abs(level - num(input.get("prevLevelMin"))) < levelDeadbandMin && Math.abs(level - num(input.get("prevLevelMin"))) > 1e-6) {
            notes.add("지연 수준 " + ns(round(level * 100) / 100) + "분은 그려진 값(" + ns(round(num(input.get("prevLevelMin")) * 100) / 100) + "분)과 " + ns(levelDeadbandMin) + "분 안이라 유지");
            level = num(input.get("prevLevelMin"));
        }
        if (legKeys.size() > 1) notes.add("앞 구간 " + (legKeys.size() - 1) + "개는 자기 구간 통과만으로 고정(뒤 구간 지연에 안 끌려감)");

        // 7. 노드별 시각 만들기
        Arrays.fill(out, Double.NaN);
        for (Map.Entry<Integer, Double> e : est.entrySet()) if (e.getKey() >= 0 && e.getKey() < n) out[e.getKey()] = e.getValue();
        double carry = 0; boolean held = false;
        for (int kx = anchor.idx + 1; kx < n; kx++) {
            if (!valid[kx]) continue;
            double base = planMs[kx] + level * 60000 + carry;
            if (isLegStart[kx] && kx > boardIdx) {
                double need = planMs[kx] - base;
                if (need > 3000) { carry += need; base += need; held = true; }
            }
            out[kx] = base;
        }
        if (held) notes.add("환승 유지: 앞으로 탈 열차·버스는 처음 안내한 시각보다 이르게 나오지 않음");
        List<Integer> stamped = new ArrayList<Integer>();
        for (int kx = 0; kx <= anchor.idx; kx++) if (est.get(kx) != null) stamped.add(kx);
        int interp = 0, frozenTail = 0;
        for (int kx = 0; kx < n; kx++) {
            if (!Double.isNaN(out[kx]) || !valid[kx]) continue;
            if (!stamped.isEmpty() && kx < stamped.get(0)) { out[kx] = planMs[kx]; continue; }
            int lo = -1, hi = -1;
            for (j = 0; j < stamped.size(); j++) { if (stamped.get(j) < kx) lo = stamped.get(j); else { hi = stamped.get(j); break; } }
            if (lo < 0 || hi < 0) { out[kx] = planMs[kx] + level * 60000; continue; }
            double tLo = est.get(lo), tHi = Math.max(tLo, est.get(hi));
            if (legOf[kx] >= 0 && legOf[kx] != legOf[anchor.idx] && legLevel.get(legOf[kx]) != null && legOf[lo] == legOf[kx] && legOf[hi] != legOf[kx]) {
                out[kx] = Math.max(tLo, Math.min(tHi, planMs[kx] + legLevel.get(legOf[kx]) * 60000));
                frozenTail++;
                continue;
            }
            double span = planMs[hi] - planMs[lo], f = span > 0 ? (planMs[kx] - planMs[lo]) / span : 0.5;
            out[kx] = tLo + (tHi - tLo) * Math.max(0, Math.min(1, f));
            interp++;
        }
        // (마) 실시간 도착정보
        Object liveBest = null;
        for (ii = 0; ii < liveIn0.size(); ii++) {
            Object LV = liveIn0.get(ii);
            if (!truthy(LV) || !fin(g(LV, "idx")) || !fin(g(LV, "ms")) || gn(LV, "idx") <= anchor.idx || gn(LV, "idx") >= n || Double.isNaN(out[(int) gn(LV, "idx")]) || liveUsed.containsKey((int) gn(LV, "idx"))) continue;
            if (liveBest == null || gn(LV, "idx") < gn(liveBest, "idx")) liveBest = LV;
        }
        if (liveBest != null) {
            int lbi = (int) gn(liveBest, "idx");
            double dLv = (gn(liveBest, "ms") - out[lbi]) / 1000;
            if (Math.abs(dLv) >= liveMinSec && Math.abs(dLv) <= liveMaxSec) {
                for (int kx = lbi; kx < n; kx++) if (!Double.isNaN(out[kx])) out[kx] += dLv * 1000;
                notes.add("실시간 도착정보 " + nameOr(nodes.get(lbi), lbi) + ": " + (dLv > 0 ? "+" : "") + ns(round(dLv)) + "초 반영");
            }
        }
        // (바) 연착
        int nxO = -1;
        for (int kx = anchor.idx + 1; kx < n; kx++) if (valid[kx] && isTransit(nodes.get(kx)) && !Double.isNaN(out[kx])) { nxO = kx; break; }
        boolean nyHit = false;
        if (nxO >= 0 && Boolean.TRUE.equals(input.get("timetableFirst"))) {
            List<Object> nyl = l(input.get("notYet")); if (nyl == null) nyl = new ArrayList<Object>();
            for (int nyi = 0; nyi < nyl.size(); nyi++) if (num(nyl.get(nyi)) == nxO) nyHit = true;
            if (!nyHit) { notes.add("시각표 기준: 증거 없음을 연착으로 보지 않음"); nxO = -1; }
            else notes.add("GPS 가 " + nameOr(nodes.get(nxO), nxO) + " 에 아직 안 닿았다고 함 → 연착으로 봄");
        }
        if (nxO >= 0) {
            double overO = (nowMs - out[nxO]) / 1000;
            if (overO >= (nyHit ? 0 : overdueSec)) {
                if ("shift".equals(overdueMode)) {
                    double addO = Math.min(overdueMaxMin, (overO / 60 + overdueExtraMin) * overdueGain) * 60000;
                    for (int kx = nxO; kx < n; kx++) if (!Double.isNaN(out[kx])) out[kx] += addO;
                    notes.add("연착: " + nameOr(nodes.get(nxO), nxO) + " 예정 " + ns(round(overO)) + "초 지났는데 도착 증거 없음 → 이후 +" + ns(round(addO / 1000)) + "초");
                } else {
                    double floorO = nowMs + overdueExtraMin * 60000, prevT = Double.NaN, prevP = Double.NaN; int movedO = 0;
                    for (int kx = nxO; kx < n; kx++) {
                        if (Double.isNaN(out[kx])) continue;
                        double lo2 = (kx == nxO) ? floorO : (Double.isNaN(prevT) ? Double.NEGATIVE_INFINITY : prevT + minRunRatio * (planMs[kx] - prevP));
                        if (out[kx] < lo2) { out[kx] = lo2; movedO++; }
                        prevT = out[kx]; prevP = planMs[kx];
                    }
                    notes.add("연착 보정: " + nameOr(nodes.get(nxO), nxO) + " 예정 " + ns(round(overO)) + "초 지났는데 도착 증거 없음 → 지금 + " + ns(overdueExtraMin) + "분으로 올림(" + movedO + "곳)");
                }
            }
        }
        if (frozenTail != 0) notes.add("앞 구간 마지막 통과 뒤 역 " + frozenTail + "곳: 그 구간 자신의 지연 수준으로 고정");
        if (interp != 0) notes.add("통과 기록 없는 역 " + interp + "곳: 앞뒤 기록 사이를 예정 비율로 나눔");

        return finish(out, tz, anchor.idx, level, notes, n, nowMs);
    }

    private static void shiftFrom(double[] out, int from, double ms) { for (int q = from; q < out.length; q++) if (!Double.isNaN(out[q])) out[q] += ms; }

    /** 표시 마지막 안전망. */
    static Map<String, Object> finish(double[] out, double tz, int anchorIdx, double level, List<Object> notes, int n, double nowMs) {
        double prev = Double.NaN; int mono = 0, q, last = -1;
        double nextMin = Double.NaN;
        for (q = n - 1; q >= 0; q--) {
            if (Double.isNaN(out[q])) continue;
            if (!Double.isNaN(nextMin) && out[q] > nextMin && q < anchorIdx) out[q] = nextMin;
            if (Double.isNaN(nextMin) || out[q] < nextMin) nextMin = out[q];
        }
        for (q = n - 1; q >= 0; q--) if (!Double.isNaN(out[q])) { last = q; break; }
        if (anchorIdx >= 0 && last > anchorIdx && out[last] < nowMs) { out[last] = nowMs; notes.add("도착 예정이 이미 지난 시각이라 지금으로 맞춤"); }
        for (q = 0; q < n; q++) {
            if (Double.isNaN(out[q])) continue;
            if (!Double.isNaN(prev) && out[q] < prev) { out[q] = prev; mono++; }
            prev = out[q];
        }
        if (mono != 0) notes.add("표시 순서 보정 " + mono + "곳");
        List<Object> arr = new ArrayList<Object>(), eta = new ArrayList<Object>(), sched = new ArrayList<Object>();
        double nowM = min(nowMs, tz);
        for (q = 0; q < n; q++) {
            arr.add(Double.isNaN(out[q]) ? null : hhmm(out[q], tz, rounding));
            eta.add(Double.isNaN(out[q]) ? null : (Object) Double.valueOf(out[q]));
            sched.add(Double.isNaN(out[q]) ? null : (Object) Double.valueOf(round((nowM + (out[q] - nowMs) / 60000) * 1000) / 1000));
        }
        return obj("arr", arr, "etaMs", eta, "schedMin", sched, "delayMin", d(round(level * 100) / 100), "anchorIdx", anchorIdx, "notes", notes);
    }

    static final class Snap {
        final List<double[]> delays; final String note;      // delays: {d, w}
        Snap(List<double[]> delays, String note) { this.delays = delays; this.note = note; }
    }

    // ═════════════ 한 승차 구간의 통과 증거 → 지연 수준 ═════════════
    static final class LegModel {
        final List<Pass> S; final double[] planMs; final double priorMean; final Snap snap; final List<Object> notes;
        final List<double[]> liveL; final List<List<Double>> liveMs;
        double level; final TreeMap<Integer, Double> est = new TreeMap<Integer, Double>();
        List<Pass> B = new ArrayList<Pass>(), C = new ArrayList<Pass>();
        double[] U; boolean[] loose, backlog, ambig;
        static final double MIN = 60000;
        double pfLo = pfLagMinSec / 60, pfHi = pfLagMaxSec / 60, sg = softMin;
        double bnMin = boardLagMinSec / 60, bnNorm = boardLagNormSec / 60, bnLateMin = boardLateMinSec / 60, bnMax = boardLagMaxSec / 60, bsg = boardSoftMin;
        double dNorm = boardNormW / (bnNorm - bnMin), dLate = (1 - boardNormW) / (bnMax - bnLateMin);

        LegModel(List<Pass> S, double[] planMs, double priorMean, Snap snap, List<Object> notes, List<double[]> liveL, List<List<Double>> liveMs) {
            this.S = S; this.planMs = planMs; this.priorMean = priorMean; this.snap = snap; this.notes = notes; this.liveL = liveL; this.liveMs = liveMs;
        }
        double ppm(int idx) { return planMs[idx]; }

        static double win(double d, double a, double b, double sg) { if (d < a) { double z = (a - d) / sg; return -0.5 * z * z; } if (d > b) { double z2 = (d - b) / sg; return -0.5 * z2 * z2; } return 0; }
        static double soft(double x, double a, double b, double sg2) { if (x < a) { double z = (a - x) / sg2; return exp(-0.5 * z * z); } if (x > b) { double z3 = (x - b) / sg2; return exp(-0.5 * z3 * z3); } return 1; }
        double rbQ(double lvl, double k2) { if (robust == 0) return lvl; double q = 1 - pow(1 - epsJump, k2) + epsOut; if (q > 0.9) q = 0.9; return log((1 - q) * exp(lvl) + q * robustFloor); }

        double emitLog(int i, double d, double wid, double sh, double k2) {
            Pass st = B.get(i); double xi = (st.ms - ppm(st.idx)) / MIN;
            if ("board".equals(st.src)) {
                double lc = xi - d;
                double f = boardFloor + dNorm * soft(lc, bnMin, bnNorm, bsg) + dLate * soft(lc, bnLateMin, bnMax, bsg);
                return log(f);
            } else if ("gps".equals(st.src)) {
                return rbQ(win(d, xi + sh - gpsTolSec / 60 - wid, xi + sh + gpsTolSec / 60 + wid, sg), k2);
            } else if ("move".equals(st.src)) {
                return rbQ(win(d, xi + sh - (moveLagMaxSec + moveTolSec) / 60 - wid, xi + sh - (moveLagMinSec - moveTolSec) / 60 + wid, sg), k2);
            } else if (loose[i] || backlog[i]) {
                if (burstRamp) {
                    double cB = (U[i] - ppm(st.idx)) / MIN + sh + wid, accB = 0, zq; int nsB = 14;
                    for (int lq = 0; lq < nsB; lq++) { double lagM = pfLo + (pfHi - pfLo) * (lq + 0.5) / nsB; zq = Math.max(0, d + lagM - cB) / sg; accB += exp(-0.5 * zq * zq); }
                    accB /= nsB;
                    if (ambig[i]) accB = burstAmbigW * accB + (1 - burstAmbigW) * soft(d, xi + sh - pfHi - wid, xi + sh - pfLo + wid, sg);
                    return log(accB + 1e-12);
                } else return win(d, -1e9, (U[i] - ppm(st.idx)) / MIN - pfLo, sg);
            } else if ("drift".equals(st.src)) {
                return rbQ(win(d, xi + sh - 2 * pfHi - wid, xi + sh + 0.2 + wid, sg), k2);
            } else {
                return rbQ(win(d, xi + sh - pfHi - wid, xi + sh - pfLo + wid, sg), k2);
            }
        }

        // HMM 상태
        int NG; double[] al, t1, t2; double gLo; static final double step = 0.05;
        void normA(double[] arr) { double sum = 0; int q; for (q = 0; q < NG; q++) sum += arr[q]; if (!(sum > 0)) { for (q = 0; q < NG; q++) arr[q] = 1.0 / NG; return; } for (q = 0; q < NG; q++) arr[q] /= sum; }
        void hmmStep(double dk) {
            int gg, kk;
            double shC = driftBiasPerStop * dk / step, sdC = Math.max(0.3, driftPerStop * sqrt(dk) / step), pj = 1 - pow(1 - epsJump, dk);
            double s0d = Math.floor(shC), fr = shC - s0d; int s0 = (int) s0d;
            for (gg = 0; gg < NG; gg++) { int a0 = gg - s0, a1 = gg - s0 - 1; t1[gg] = (a0 >= 0 ? al[a0] * (1 - fr) : 0) + (a1 >= 0 ? al[a1] * fr : 0); }
            int R = (int) Math.max(1, Math.ceil(3 * sdC)); double[] ker = new double[2 * R + 1]; double ks = 0;
            for (kk = -R; kk <= R; kk++) { ker[kk + R] = exp(-0.5 * kk * kk / (sdC * sdC)); ks += ker[kk + R]; }
            for (gg = 0; gg < NG; gg++) { double sm = 0; for (kk = -R; kk <= R; kk++) { int gi = gg + kk; if (gi >= 0 && gi < NG) sm += t1[gi] * ker[kk + R]; } t2[gg] = sm / ks; }
            if (pj > 1e-9) {
                double ru = exp(-step / jumpUpScaleMin), rd = exp(-step / jumpDnScaleMin), wU = jumpUpW * (1 - ru), wD = (1 - jumpUpW) * (1 - rd), Uc = 0, Dc = 0; double[] Dv = new double[NG];
                for (gg = NG - 1; gg >= 0; gg--) { Dv[gg] = Dc; Dc = t2[gg] + rd * Dc; }
                for (gg = 0; gg < NG; gg++) { al[gg] = (1 - pj) * t2[gg] + pj * (wU * Uc + wD * Dv[gg]); Uc = t2[gg] + ru * Uc; }
            } else for (gg = 0; gg < NG; gg++) al[gg] = t2[gg];
        }

        void run() {
            int i, g;
            for (i = 0; i < S.size(); i++) (S.get(i).src.equals("cell") ? C : B).add(S.get(i));
            double tolMs = burstTolSec * 1000;
            int nB = B.size();
            U = new double[nB]; loose = new boolean[nB]; backlog = new boolean[nB]; ambig = new boolean[nB]; int nBacklog = 0;
            for (i = nB - 1; i >= 0; i--) {
                U[i] = B.get(i).ms;
                if (i < nB - 1) { double cand = U[i + 1] - minRunRatio * (ppm(B.get(i + 1).idx) - ppm(B.get(i).idx)); if (cand < U[i]) U[i] = cand; }
                loose[i] = (B.get(i).ms - U[i]) > tolMs;
                backlog[i] = i > 0 && (B.get(i).ms - B.get(i - 1).ms) <= backlogGapSec * 1000;
                ambig[i] = backlog[i] && !loose[i] && (B.get(i).ms - B.get(i - 1).ms) > burstExactSec * 1000;
                if ((loose[i] || backlog[i]) && !B.get(i).src.equals("board")) nBacklog++;
            }
            if (hmm != 0 && looseOnlyAtStart != 0) {
                boolean okc = true;
                for (i = 0; i < nB; i++) { boolean isEv = !(B.get(i).src.equals("board") || loose[i] || backlog[i]); if (loose[i] && !okc) loose[i] = false; if (isEv) okc = false; }
                nBacklog = 0; for (i = 0; i < nB; i++) if ((loose[i] || backlog[i]) && !B.get(i).src.equals("board")) nBacklog++;
            }
            List<Integer> infList = new ArrayList<Integer>();
            for (i = 0; i < nB; i++) if (!B.get(i).src.equals("board") && !loose[i] && !backlog[i]) infList.add(i);
            int nInfo = infList.size();
            int useFrom = nInfo != 0 ? infList.get((int) Math.max(0, nInfo - levelWindow)) : 0;
            int lastIdx = S.get(S.size() - 1).idx;

            double mn = Double.POSITIVE_INFINITY, mxx = Double.NEGATIVE_INFINITY;
            for (i = 0; i < S.size(); i++) { double x = (S.get(i).ms - ppm(S.get(i).idx)) / MIN; if (x < mn) mn = x; if (x > mxx) mxx = x; }
            gLo = mn - 8; double gHi = mxx + 3;
            if (gHi - gLo > 250) gHi = gLo + 250;
            NG = (int) Math.max(2, round((gHi - gLo) / step) + 1);
            double[] lp = new double[NG];
            boolean snapOn = snap != null && nInfo == 0;
            if (snapOn && snap.note != null) notes.add(snap.note);

            double[] hmmAl = null;
            if (hmm != 0) {
                al = new double[NG]; t1 = new double[NG]; t2 = new double[NG]; int gg;
                double prW = nInfo != 0 ? 0.02 : priorNarrowW;
                for (gg = 0; gg < NG; gg++) {
                    double d0 = gLo + gg * step, wSd = (d0 < priorMean && priorNegWideSd > 0) ? priorNegWideSd : priorWideSd;
                    al[gg] = prW * exp(-0.5 * pow((d0 - priorMean) / priorNarrowSd, 2)) / priorNarrowSd + (1 - prW) * exp(-0.5 * pow((d0 - priorMean) / wSd, 2)) / wSd;
                }
                normA(al);
                int prevI = -1;
                for (i = Math.max(0, nB - 60); i < nB; i++) {
                    if (prevI >= 0) hmmStep(Math.max(1, B.get(i).idx - prevI));
                    String bs = B.get(i).src; boolean mixOut = (!bs.equals("board") && !(loose[i] || backlog[i]));
                    for (gg = 0; gg < NG; gg++) { double ev = exp(emitLog(i, gLo + gg * step, 0, 0, 0)); al[gg] *= mixOut ? ((1 - epsOut) * ev + epsOut * robustFloor) : ev; }
                    normA(al); prevI = B.get(i).idx;
                }
                if (liveL != null && !liveL.isEmpty() && prevI >= 0) {
                    double sdL = Math.max(0.05, liveSdSec / 60); int nUsed = 0;
                    for (int lq = 0; lq < liveL.size(); lq++) {
                        int lqIdx = (int) liveL.get(lq)[0]; List<Double> lm = liveMs.get(lq); double[] xls = new double[lm.size()]; int mq;
                        for (mq = 0; mq < xls.length; mq++) xls[mq] = (lm.get(mq) - ppm(lqIdx)) / MIN;
                        hmmStep(Math.max(1, lqIdx - prevI));
                        for (gg = 0; gg < NG; gg++) {
                            double dg = gLo + gg * step, mixL = 0;
                            for (mq = 0; mq < xls.length; mq++) { double zl = (dg - xls[mq]) / sdL; mixL += exp(-0.5 * zl * zl); }
                            al[gg] *= (1 - epsLive) * mixL / xls.length + epsLive * robustFloor;
                        }
                        normA(al); prevI = lqIdx; nUsed++;
                    }
                    if (nUsed != 0) notes.add("실시간 도착정보 " + nUsed + "건을 지연 필터에 반영");
                }
                hmmAl = al;
            }
            for (g = 0; g < NG; g++) {
                double d = gLo + g * step, v = 0;
                if (hmmAl != null) v = log(hmmAl[g] + 1e-300);
                else {
                    v = log((nInfo != 0 ? 0.02 : priorNarrowW) * exp(-0.5 * pow((d - priorMean) / priorNarrowSd, 2)) / priorNarrowSd
                        + (1 - priorNarrowW) * exp(-0.5 * pow((d - priorMean) / priorWideSd, 2)) / priorWideSd);
                    for (i = useFrom; i < nB; i++) {
                        double k2 = Math.max(0, lastIdx - B.get(i).idx);
                        v += emitLog(i, d, driftPerStop * sqrt(k2), driftBiasPerStop * k2, k2);
                    }
                }
                for (i = 0; i < C.size(); i++) {
                    double xc = (C.get(i).ms - ppm(C.get(i).idx)) / MIN, wc = driftPerStop * sqrt(Math.max(0, lastIdx - C.get(i).idx));
                    v += win(d, xc + cellLeadMinSec / 60 - wc, xc + cellLeadMaxSec / 60 + wc, sg);
                }
                if (snapOn) { double mixS = snapEps; for (int sj = 0; sj < snap.delays.size(); sj++) mixS += snap.delays.get(sj)[1] * soft(d, snap.delays.get(sj)[0] - 0.15, snap.delays.get(sj)[0] + snapLateMaxMin, sg); v += log(mixS); }
                lp[g] = v;
            }
            double mx = Double.NEGATIVE_INFINITY, tot = 0; double[] w = new double[NG];
            for (g = 0; g < NG; g++) if (lp[g] > mx) mx = lp[g];
            for (g = 0; g < NG; g++) { w[g] = exp(lp[g] - mx); tot += w[g]; }
            double lv = gLo, qLo = gLo, qHi = gLo, acc = 0; boolean gotLo = false, gotHi = false, gotMed = false;
            for (g = 0; g < NG; g++) {
                acc += w[g];
                if (!gotLo && acc >= tot * quantile) { qLo = gLo + g * step; gotLo = true; }
                if (!gotMed && acc >= tot / 2) { lv = gLo + g * step; gotMed = true; }
                if (!gotHi && acc >= tot * (1 - quantile)) { qHi = gLo + g * step; gotHi = true; }
            }
            if (quantile > 0 && quantile < 0.5) lv = (bimodalSpanMin > 0 && qHi - qLo > bimodalSpanMin) ? lv : (qLo + qHi) / 2;
            level = lv;
            if (nBacklog != 0) notes.add("몰림 " + nBacklog + "건: 지연 수준에서 제외(채택 지연을 감안한 상한 가능도로만 사용)");
            if (!C.isEmpty()) notes.add("기지국 선행 " + C.size() + "건: 실제보다 1~3분 이른 값이라 하한으로만 사용");
            notes.add("구간 지연 수준 " + ns(round(level * 100) / 100) + "분 (믿을 만한 통과 " + nInfo + "개" + (nInfo != 0 ? "" : ", 사전값·승차 확정으로 추정") + ")");

            for (i = 0; i < nB; i++) {
                Pass b2 = B.get(i);
                if (b2.src.equals("board") || loose[i] || backlog[i]) est.put(b2.idx, Math.min(b2.ms - 5000, ppm(b2.idx) + level * MIN));
                else est.put(b2.idx, b2.src.equals("gps") ? b2.ms : b2.src.equals("move") ? b2.ms - (moveLagMinSec + moveLagMaxSec) / 2 * 1000 : b2.ms - pfLagSec * 1000);
            }
            for (i = 0; i < C.size(); i++) est.put(C.get(i).idx, Math.max(C.get(i).ms, ppm(C.get(i).idx) + level * MIN));
        }
    }
}
