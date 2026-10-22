package com.dullyyj.subway;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import static com.dullyyj.subway.RideJs.*;

/**
 * engine/posfusion.js(위치 판단기 · 은닉 마르코프 다중 지연 모델)의 자바 포팅 — 설정의 '새 위치 판단기 보정'(실험)이 켜졌을 때 대기 모드 엔진이 쓴다.
 * 서버 함수를 한 줄씩 그대로 옮겼다(조정값 · 순서 · 반올림까지). 상태(state)는 요청에 실려 오가는 무상태 함수.
 */
final class RidePosFusionJ {
    private RidePosFusionJ() { }

    static final double DWELL_S = 30, DWELL_XFER_S = 150, DEP_AFTER_ARR_S = 20, SEG_DEFAULT_S = 120, OVERDUE_FLOOR_S = 75, EARLY_BRAKE = 0.12, BACK_LEAK = 5e-4, FLOOR = 1e-4,
        GPS_MAX_ACC = 80, GPS_MAX_AGE_S = 10, GPS_EPS = 0.02, MOTION_CONF = 0.82, CELL_EPS = 0.15, CELL_SIGMA = 0.9, SIG_DWELL_S = 18, SIG_SEG_S = 25, STEP_S = 5;

    static double erfc(double x) {
        double z = Math.abs(x), t = 1 / (1 + 0.5 * z);
        double r = t * exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
        return x >= 0 ? r : 2 - r;
    }
    static double gaussHaz(double z, double sigma, double h) {
        double phi = exp(-0.5 * z * z) / 2.5066282746;
        double tail = 0.5 * erfc(z / 1.4142135624);
        double lam = phi / (sigma * Math.max(tail, 1e-6));
        double v = lam * h;
        return v > 0.6 ? 0.6 : v;
    }
    /** 점 → 선분 거리(m). */
    static double distSeg(double lat, double lng, double aLat, double aLng, double bLat, double bLng) {
        double kx = 111320 * cos(lat * Math.PI / 180), ky = 110540;
        double px = (lng - aLng) * kx, py = (lat - aLat) * ky;
        double bx = (bLng - aLng) * kx, by = (bLat - aLat) * ky;
        double L2 = bx * bx + by * by;
        double t = L2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / L2)) : 0;
        double dx = px - t * bx, dy = py - t * by;
        return Math.sqrt(dx * dx + dy * dy);
    }

    interface Lik { double at(int j); }

    static final class Sub { double delay, w; double[] P; }

    /** 판단기 한 대 — 역 목록으로 만들고 증거를 먹여 상태를 굴린다. */
    static final class Fuser {
        final int N, M, K;
        final double[] sLat, sLng, sched; final boolean[] xfer;       // sched NaN = 시각표 없음, 좌표 NaN = 모름
        final Sub[] subs;
        double lastMs = Double.NaN, lastGpsTs = 0, lastCellAt = 0;

        Fuser(double[] lat, double[] lng, double[] sched, boolean[] xfer) {
            this.sLat = lat; this.sLng = lng; this.sched = sched; this.xfer = xfer;
            N = lat.length; M = Math.max(1, 2 * N - 1);
            List<Double> dl = new ArrayList<Double>();
            for (int dd = -300; dd <= 600; dd += 30) dl.add((double) dd);
            K = dl.size(); subs = new Sub[K];
            for (int i = 0; i < K; i++) { Sub s = new Sub(); s.delay = dl.get(i); s.w = exp(-Math.abs(s.delay) / (s.delay < 0 ? 60 : 200)); s.P = new double[M]; subs[i] = s; }
            seed(0, 0.9, Double.NaN);
            normW();
        }
        void normW() {
            double s = 0; int j;
            for (j = 0; j < K; j++) s += subs[j].w;
            if (!(s > 0)) { for (j = 0; j < K; j++) subs[j].w = 1.0 / K; return; }
            for (j = 0; j < K; j++) subs[j].w = Math.max(subs[j].w / s, 2e-3);
            s = 0; for (j = 0; j < K; j++) s += subs[j].w;
            for (j = 0; j < K; j++) subs[j].w /= s;
        }
        void normP(double[] P) {
            double s = 0; int j;
            for (j = 0; j < M; j++) s += P[j];
            if (!(s > 0)) { for (j = 0; j < M; j++) P[j] = 1.0 / M; return; }
            for (j = 0; j < M; j++) P[j] /= s;
        }
        void seed(double idx0, double conf0, double nowMs) {
            int idx = Math.max(0, Math.min(N - 1, toInt(idx0)));
            double conf = Double.isNaN(conf0) ? 0.9 : conf0;
            for (int k3 = 0; k3 < K; k3++) {
                double[] P = subs[k3].P;
                for (int i = 0; i < M; i++) P[i] = (1 - conf) / Math.max(1, M - 1);
                P[2 * idx] = conf; normP(P);
            }
            if (!Double.isNaN(nowMs)) lastMs = nowMs;
        }
        boolean isXferDwell(int j) { return j > 0 && xfer[j]; }

        void stepOne(Sub sub, double nowMs, double h) {
            double[] P = sub.P, nx = new double[M]; double delayMs = sub.delay * 1000;
            for (int j = 0; j < N; j++) {
                double p = P[2 * j];
                if (p > 0) {
                    if (j >= N - 1) { nx[2 * j] += p; }
                    else {
                        double hd, sj = sched[j];
                        if (!Double.isNaN(sj)) {
                            double Td = sj + delayMs + (j == 0 ? 0 : DEP_AFTER_ARR_S * 1000);
                            hd = gaussHaz((nowMs - Td) / 1000 / SIG_DWELL_S, SIG_DWELL_S, h);
                            if (isXferDwell(j)) hd = gaussHaz((nowMs - (sj + delayMs)) / 1000 / (SIG_DWELL_S * 2), SIG_DWELL_S * 2, h);
                        } else hd = h / DWELL_S;
                        if (hd > 0.6) hd = 0.6;
                        nx[2 * j] += p * (1 - hd); nx[2 * j + 1] += p * hd;
                    }
                }
                if (j < N - 1) {
                    double q = P[2 * j + 1];
                    if (q > 0) {
                        double sn = sched[j + 1], hs;
                        if (!Double.isNaN(sn)) {
                            double sg = SIG_SEG_S;
                            if (xfer[j + 1]) sg *= 2;
                            hs = gaussHaz((nowMs - (sn + delayMs)) / 1000 / sg, sg, h);
                        } else hs = h / SEG_DEFAULT_S;
                        if (hs > 0.6) hs = 0.6;
                        nx[2 * j + 1] += q * (1 - hs); nx[2 * (j + 1)] += q * hs;
                    }
                }
            }
            double[] out = new double[M];
            for (int b = 0; b < M; b++) out[b] = nx[b] * (1 - BACK_LEAK) + (b + 1 < M ? nx[b + 1] * BACK_LEAK : 0) + FLOOR / M;
            sub.P = out; normP(sub.P);
        }
        void stepAll(double nowMs, double h) {
            for (int k4 = 0; k4 < K; k4++) stepOne(subs[k4], nowMs, h);
            double mix = 0.012 * h / STEP_S; double[] nw = new double[K]; int k5;
            for (k5 = 0; k5 < K; k5++) {
                double l = k5 > 0 ? subs[k5 - 1].w : subs[k5].w, r = k5 < K - 1 ? subs[k5 + 1].w : subs[k5].w;
                nw[k5] = subs[k5].w * (1 - 2 * mix) + (l + r) * mix;
            }
            for (k5 = 0; k5 < K; k5++) subs[k5].w = nw[k5];
            normW();
        }
        void predict(double nowMs) {
            if (Double.isNaN(lastMs)) { lastMs = nowMs; return; }
            double dt = (nowMs - lastMs) / 1000;
            if (dt <= 0) return;
            if (dt > 600) dt = 600;
            double t = lastMs;
            while (dt > 1e-6) {
                double h = Math.min(STEP_S, dt);
                t += h * 1000; stepAll(t, h); dt -= h;
            }
            lastMs = nowMs;
        }
        void applyEvidence(Lik L, double w) {
            for (int k6 = 0; k6 < K; k6++) {
                double[] P = subs[k6].P; double Z = 0;
                for (int j = 0; j < M; j++) {
                    double v = L.at(j); if (!(v > 1e-9)) v = 1e-9;
                    if (!Double.isNaN(w) && w != 1) v = pow(v, w);
                    P[j] *= v; Z += P[j];
                }
                subs[k6].w *= Math.max(Z, 1e-12);
                normP(P);
            }
            normW();
        }
        void motion(String state, double nowMs, double conf) {
            if (!"moving".equals(state) && !"stopped".equals(state)) return;
            final double c = Double.isNaN(conf) ? MOTION_CONF : conf; final boolean moving = "moving".equals(state);
            applyEvidence(new Lik() {
                @Override public double at(int j) {
                    boolean isDwell = (j % 2 == 0); int idx = j >> 1;
                    boolean neutral = isDwell ? isXferDwell(idx) : xfer[idx + 1];
                    if (neutral) return 0.5;
                    if (isDwell) return moving ? (1 - c) : c;
                    return moving ? c : (1 - c) * 0.8 + 0.02;
                }
            }, 0.6);
        }
        boolean gps(double lat, double lng, double ts, double accIn, double nowMs) {
            if (Double.isNaN(lat)) return false;
            if (ts != 0 && !Double.isNaN(ts) && ts == lastGpsTs) return false;
            double age = (ts != 0 && !Double.isNaN(ts)) ? (nowMs - ts) / 1000 : 0;
            if (age > GPS_MAX_AGE_S) return false;
            final double acc = Double.isNaN(accIn) ? 60 : accIn;
            if (acc > GPS_MAX_ACC) return false;
            lastGpsTs = (ts != 0 && !Double.isNaN(ts)) ? ts : nowMs;
            final double[] Lc = new double[M];
            for (int j = 0; j < M; j++) {
                int idx = j >> 1; double d, sg;
                if (j % 2 == 0) {
                    if (Double.isNaN(sLat[idx])) { Lc[j] = 1; continue; }
                    d = hav(lat, lng, sLat[idx], sLng[idx]); sg = Math.max(acc, 70) + 60;
                } else {
                    if (Double.isNaN(sLat[idx]) || Double.isNaN(sLat[idx + 1])) { Lc[j] = 1; continue; }
                    d = distSeg(lat, lng, sLat[idx], sLng[idx], sLat[idx + 1], sLng[idx + 1]); sg = Math.max(acc, 70) + 120;
                }
                Lc[j] = GPS_EPS + exp(-(d * d) / (2 * sg * sg));
            }
            applyEvidence(new Lik() { @Override public double at(int j) { return Lc[j]; } }, acc <= 50 ? 1 : 0.7);
            return true;
        }
        void cell(double stnIdx, double conf, double nowMs) {
            if (Double.isNaN(stnIdx) || stnIdx < 0 || stnIdx >= N) return;
            if (nowMs - lastCellAt < 15000) return;
            lastCellAt = nowMs; final double si = stnIdx;
            applyEvidence(new Lik() {
                @Override public double at(int j) {
                    double pos = (j % 2 == 0) ? (j >> 1) : ((j >> 1) + 0.5), d = pos - si;
                    return CELL_EPS + (1 - CELL_EPS) * exp(-(d * d) / (2 * CELL_SIGMA * CELL_SIGMA));
                }
            }, Math.max(0.3, Math.min(1, Double.isNaN(conf) ? 0.7 : conf)));
        }
        void arrived(double stnIdx, double nowMs, double strength) {
            if (Double.isNaN(stnIdx) || stnIdx < 0 || stnIdx >= N) return;
            final double s = Double.isNaN(strength) ? 0.9 : strength; final int si = (int) stnIdx;
            applyEvidence(new Lik() { @Override public double at(int j) { return ((j >> 1) == si) ? 1 : (1 - s) + 0.02; } }, 1);
        }
        double[] combined() {
            double[] Pm = new double[M];
            for (int k7 = 0; k7 < K; k7++) { double[] P = subs[k7].P; double w = subs[k7].w; for (int j = 0; j < M; j++) Pm[j] += w * P[j]; }
            return Pm;
        }
        int mapK() { int mk = 0; for (int j = 1; j < K; j++) if (subs[j].w > subs[mk].w) mk = j; return mk; }
        Map<String, Object> best() {
            double[] Pm = combined(), A = new double[N]; int bi = 0; double bv = -1;
            for (int j = 0; j < N; j++) { A[j] = Pm[2 * j] + (j < N - 1 ? Pm[2 * j + 1] : 0); if (A[j] > bv) { bv = A[j]; bi = j; } }
            double pd = Pm[2 * bi], ps = bi < N - 1 ? Pm[2 * bi + 1] : 0; int mk = mapK();
            return obj("idx", bi, "conf", d(bv), "kind", (pd >= ps || bi >= N - 1) ? "dwell" : "seg", "nextConf", bi < N - 1 ? d(A[bi + 1]) : (Object) Double.valueOf(0), "delayS", subs[mk].delay, "delayW", d(subs[mk].w));
        }
        Map<String, Object> median() {
            double[] Pm = combined(); double c = 0; int bi = N - 1;
            for (int j = 0; j < N; j++) {
                c += Pm[2 * j] + (j < N - 1 ? Pm[2 * j + 1] : 0);
                if (c >= 0.5) { bi = j; break; }
            }
            int mk = mapK();
            return obj("idx", bi, "delayS", subs[mk].delay, "delayW", d(subs[mk].w));
        }
        static double r6(double v) {
            if (Double.isNaN(v) || Double.isInfinite(v) || v == 0) return v;
            return Double.parseDouble(new BigDecimal(v).round(new MathContext(6, RoundingMode.HALF_UP)).toString());
        }
        Map<String, Object> exportState() {
            List<Object> w = new ArrayList<Object>(), P = new ArrayList<Object>();
            for (Sub s : subs) { w.add(d(r6(s.w))); List<Object> row = new ArrayList<Object>(); for (double x : s.P) row.add(d(r6(x))); P.add(row); }
            return obj("lastMs", Double.isNaN(lastMs) ? null : (Object) Double.valueOf(lastMs), "g", lastGpsTs, "c", lastCellAt, "w", w, "P", P);
        }
        boolean importState(Object st) {
            List<Object> w = l(g(st, "w")), P = l(g(st, "P"));
            if (w == null || P == null || w.size() != K || P.size() != K) return false;
            for (int q = 0; q < K; q++) { List<Object> row = l(P.get(q)); if (row == null || row.size() != M) return false; }
            for (int q2 = 0; q2 < K; q2++) {
                double wq = num(w.get(q2)); subs[q2].w = Double.isNaN(wq) ? 0 : wq; double[] Pq = subs[q2].P;
                List<Object> row = l(P.get(q2));
                for (int i = 0; i < M; i++) { double v = num(row.get(i)); Pq[i] = Math.max(0, Double.isNaN(v) ? 0 : v); }
                normP(Pq);
            }
            normW();
            Object lm = g(st, "lastMs");
            lastMs = lm instanceof Number ? num(lm) : Double.NaN;
            double gg = num(g(st, "g")), cc = num(g(st, "c"));
            lastGpsTs = Double.isNaN(gg) ? 0 : gg; lastCellAt = Double.isNaN(cc) ? 0 : cc;
            return true;
        }
    }

    private static String pfStr(Object v, int n) { return v instanceof String ? (((String) v).length() > n ? ((String) v).substring(0, n) : (String) v) : ""; }
    private static double numOrNaN(Object v) { return v instanceof Number ? ((Number) v).doubleValue() : Double.NaN; }

    /** posFuseRun({ nowMs, stations, state?, seed?, ev }) */
    static Map<String, Object> posFuseRun(Map<String, Object> inp0) {
        Map<String, Object> inp = inp0 == null ? obj() : inp0;
        double nowMs = num(inp.get("nowMs"));
        if (!(nowMs > 0)) return obj("ok", Boolean.FALSE, "error", "nowMs");
        List<Object> src = l(inp.get("stations")); if (src == null) src = new ArrayList<Object>();
        if (src.size() < 2 || src.size() > 300) return obj("ok", Boolean.FALSE, "error", "stations");
        int n = src.size(); double[] lat = new double[n], lng = new double[n], sched = new double[n]; boolean[] xf = new boolean[n];
        for (int i = 0; i < n; i++) {
            Object s = src.get(i);
            lat[i] = (g(s, "lat") instanceof Number && fin(g(s, "lat"))) ? num(g(s, "lat")) : Double.NaN;
            lng[i] = (g(s, "lng") instanceof Number && fin(g(s, "lng"))) ? num(g(s, "lng")) : Double.NaN;
            sched[i] = (g(s, "schedMs") instanceof Number && fin(g(s, "schedMs"))) ? num(g(s, "schedMs")) : Double.NaN;
            xf[i] = truthy(g(s, "xferFromPrev"));
        }
        Fuser f = new Fuser(lat, lng, sched, xf);
        int fedGps = 0, fedMotion = 0, fedCell = 0, fedArrived = 0, skipped = 0;
        boolean restored = truthy(inp.get("state")) ? f.importState(inp.get("state")) : false;
        List<Object> evAll = l(inp.get("ev")); if (evAll == null) evAll = new ArrayList<Object>();
        if (!restored) {
            Object sd0 = inp.get("seed"); Map<String, Object> sd = sd0 instanceof Map ? m(sd0) : obj();
            int idx = (int) Math.max(0, Math.min(n - 1, Math.floor(truthy(sd.get("idx")) ? num(sd.get("idx")) : 0)));
            double conf = (sd.get("conf") instanceof Number && num(sd.get("conf")) > 0 && num(sd.get("conf")) < 1) ? num(sd.get("conf")) : (idx > 0 ? 0.8 : 0.9);
            double startMs = num(inp.get("startMs")), e0 = evAll.isEmpty() ? Double.NaN : num(g(evAll.get(0), "at"));
            f.seed(idx, conf, startMs > 0 ? startMs : (!evAll.isEmpty() && e0 > 0 ? e0 : nowMs));
        }
        List<Object> ev = new ArrayList<Object>();
        for (int i = 0; i < Math.min(evAll.size(), 2000); i++) { Object e = evAll.get(i); if (e instanceof Map && num(g(e, "at")) > 0) ev.add(e); }
        Collections.sort(ev, new Comparator<Object>() { @Override public int compare(Object a, Object b) { return Double.compare(gn(a, "at"), gn(b, "at")); } });
        for (int k = 0; k < ev.size(); k++) {
            Object e = ev.get(k); double at = gn(e, "at");
            if (at > nowMs) { skipped++; continue; }
            f.predict(at);
            Object t = g(e, "t");
            if ("gps".equals(t)) {
                Object fx = g(e, "fix");
                double fl = fx == null ? Double.NaN : numOrNaN(g(fx, "lat")), fo = fx == null ? Double.NaN : numOrNaN(g(fx, "lng")), ts = fx == null ? Double.NaN : numOrNaN(g(fx, "ts"));
                Object ao = g(fx, "acc"); double acc = ao == null ? Double.NaN : numOrNaN(ao);
                if (f.gps(fl, fo, ts, acc, at)) fedGps++; else skipped++;
            }
            else if ("motion".equals(t)) { f.motion(pfStr(g(e, "state"), 8), at, numOrNaN(g(e, "conf"))); fedMotion++; }
            else if ("cell".equals(t)) { f.cell(num(g(e, "idx")), numOrNaN(g(e, "conf")), at); fedCell++; }
            else if ("arrived".equals(t)) { f.arrived(num(g(e, "idx")), at, numOrNaN(g(e, "strength"))); fedArrived++; }
            else skipped++;
        }
        f.predict(nowMs);
        Map<String, Object> b = f.best(), m = f.median();
        return obj("ok", Boolean.TRUE, "state", f.exportState(), "best", b, "median", m, "fed", obj("gps", fedGps, "motion", fedMotion, "cell", fedCell, "arrived", fedArrived, "skipped", skipped));
    }
}
