package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dullyyj.subway.RideJs.*;

/**
 * engine/ride-track.js 의 자바 포팅 — 탑승 중 GPS 판정(이탈 · 타고 있는 차 · 못 탔다는 증명 · 영점 · 버스 위치 · 움직임 · 승차역 확인).
 * 서버 함수를 한 줄씩 그대로 옮겼다(조정값·순서·반올림까지). 입력·출력은 JSON 과 같은 모양(Map · List · Double · String · Boolean).
 * 의존성 없음(안드로이드·네트워크·시계 안 씀). opts(민감도 시험용 덮어쓰기)는 옮기지 않았다.
 */
final class RideTrackJ {
    private RideTrackJ() { }

    // ── 조정값(RIDE_TRACK_DEFAULTS) ──
    static final double offM = 350, offWinSec = 70, offMinFixes = 4, offMinSpanSec = 50,
        subWinSec = 100, subMinFixes = 6, subMinSpanSec = 80, subMinMoveM = 90, subMaxAcc = 60,
        freshSec = 25, maxAcc = 120,
        fitMean = 120, fitMax = 300, fitTail = 200, fitBetterBy = 60, rideWinSec = 480, rideMinFixes = 4,
        curBadMean = 200, curBadTail = 300,
        walkWinSec = 75, walkMinFixes = 5, walkMinSpanSec = 45, walkMaxSpeed = 3.0, walkDepartM = 400,
        missWinSec = 120, missD80 = 80, missMinSpanSec = 45, missMinFixes = 3, missCellN = 2,
        pressNearM = 300, pressFarM = 800, busStopNearM = 150, busStopAccCap = 50,
        subRideWinSec = 120, subRideMinFixes = 4, subRideMinSpanSec = 90, subRideOffM = 600, subRideMaxAcc = 60,
        busTrailMaxAgeSec = 570, busTrailCap = 240, busCoverSlackSec = 20, busAheadSec = 300, busAheadMinStops = 2,
        busStopNearReachM = 200, busGpsSnapM = 500, busAdvanceSec = 8,
        trailMaxSpeedMps = 60, zeroLeadSec = 25, zeroWinSec = 55, zeroSlideSec = 45, zeroNearM = 200, zeroFinalNearM = 250, zeroFarM = 600,
        zeroApplyLeadSec = 3, zeroKeepSec = 20, zeroFinalKeepMin = 30,
        passAheadSec = 300, passLateSec = 420, passBackSec = 300, passNearM = 150, passAccM = 60, passInterpMaxGapSec = 30,
        notYetFarM = 400, notYetMaxLateSec = 300, notYetBetween = 1.25, notYetAccM = 100,
        motionWinSec = 14, motionMinSpanSec = 4, motionMaxAcc = 60, motionMoveMps = 1.4, motionStopMps = 0.7,
        busPosOffM = 150, busPosFixAccM = 60, busPosMinStops = 2, busPosMinGapM = 15;

    /** 정리된 궤적 점. acc 가 NaN 이면 정확도 모름(JS null). */
    static final class Fix {
        final double ts, lat, lng, acc;
        Fix(double ts, double lat, double lng, double acc) { this.ts = ts; this.lat = lat; this.lng = lng; this.acc = acc; }
        boolean noAcc() { return Double.isNaN(acc); }
    }

    // ── 기하 ──
    static double segDist(double pLat, double pLng, double aLat, double aLng, double bLat, double bLng) {
        double kx = 88000, ky = 111000;
        double px = pLng * kx, py = pLat * ky, ax = aLng * kx, ay = aLat * ky, bx = bLng * kx, by = bLat * ky;
        double dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        double t = len2 != 0 ? (((px - ax) * dx + (py - ay) * dy) / len2) : 0;
        t = Math.max(0, Math.min(1, t));
        double qx = ax + dx * t, qy = ay + dy * t;
        return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
    }
    /** 점 → 꺾은선 최단거리. 점이 2개 미만이면 NaN(JS null). */
    static double pathDist(double lat, double lng, List<double[]> pts) {
        if (pts == null || pts.size() < 2) return Double.NaN;
        double best = Double.POSITIVE_INFINITY;
        for (int j = 0; j < pts.size() - 1; j++) {
            double d = segDist(lat, lng, pts.get(j)[0], pts.get(j)[1], pts.get(j + 1)[0], pts.get(j + 1)[1]);
            if (d < best) best = d;
        }
        return best;
    }
    /** plan.pts([{lat,lng}…]) → [[lat,lng]…]. 좌표가 숫자가 아니면 NaN 으로 둔다(JS 의 undefined 계산과 같이 NaN 이 퍼진다). */
    static List<double[]> pts(Object o) {
        List<double[]> r = new ArrayList<double[]>();
        List<Object> l = l(o);
        if (l != null) for (Object p : l) r.add(new double[] { gn(p, "lat"), gn(p, "lng") });
        return r;
    }
    static double med(List<Double> a) {
        List<Double> v = new ArrayList<Double>(a);
        Collections.sort(v, new Comparator<Double>() { @Override public int compare(Double x, Double y) { return Double.compare(x, y); } });
        return v.size() > 0 ? v.get((int) Math.floor(v.size() / 2.0)) : Double.NaN;
    }

    // ── 궤적 정리 ──
    static List<Fix> trail(Map<String, Object> P) {
        double now = num(P.get("nowMs")), floor = truthy(P.get("floorMs")) ? num(P.get("floorMs")) : 0;
        List<Fix> out = new ArrayList<Fix>();
        List<Object> raw = l(P.get("trail"));
        if (raw == null) raw = new ArrayList<Object>();
        for (int i = 0; i < raw.size(); i++) {
            Object q = raw.get(i);
            double ts, lat, lng; Object acc;
            if (q instanceof List) { ts = num(at(q, 0)); lat = num(at(q, 1)); lng = num(at(q, 2)); acc = at(q, 3); }
            else if (q instanceof Map) { ts = gn(q, "ts"); lat = gn(q, "lat"); lng = gn(q, "lng"); acc = g(q, "acc"); }
            else continue;
            if (!fin(ts) || !fin(lat) || !fin(lng)) continue;
            if (ts < floor || ts > now + 5000 || now - ts > 600000) continue;
            if (acc != null && fin(acc) && num(acc) > maxAcc) continue;
            out.add(new Fix(ts, lat, lng, (acc != null && fin(acc)) ? num(acc) : Double.NaN));
        }
        Collections.sort(out, new Comparator<Fix>() { @Override public int compare(Fix a, Fix b) { return Double.compare(a.ts, b.ts); } });
        return out;
    }
    /** 같은 좌표가 이어서 반복되는 것은 한 번으로. */
    static List<Fix> distinct(List<Fix> tr) {
        List<Fix> out = new ArrayList<Fix>();
        String last = null;
        for (Fix f : tr) {
            String sig = ns(round(f.lat * 1e5)) + "," + ns(round(f.lng * 1e5));
            if (sig.equals(last)) continue;
            last = sig; out.add(f);
        }
        return out;
    }
    static List<Fix> within(List<Fix> tr, double now, double sec) {
        List<Fix> r = new ArrayList<Fix>();
        for (Fix p : tr) if (now - p.ts <= sec * 1000) r.add(p);
        return r;
    }

    // ── 이탈 ──
    static Map<String, Object> offResult() { return obj("confirmed", Boolean.FALSE, "distM", null, "n", 0, "spanSec", 0, "why", ""); }

    static Map<String, Object> offSubRiding(Map<String, Object> P, List<Fix> tr, Map<String, Object> res) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        double now = num(P.get("nowMs"));
        List<double[]> pts = pts(plan.get("pts"));
        if (pts.size() < 2) { res.put("why", "sub_confirmed"); return res; }
        List<Fix> w = distinct(within(tr, now, subRideWinSec));
        res.put("n", d(w.size()));
        if (w.isEmpty()) { res.put("why", "sub_confirmed"); return res; }
        Fix last = w.get(w.size() - 1);
        if (now - last.ts > freshSec * 1000) { res.put("why", "sub_confirmed"); return res; }
        if (w.size() < subRideMinFixes) { res.put("why", "sub_confirmed"); return res; }
        res.put("spanSec", d(round((last.ts - w.get(0).ts) / 1000)));
        if (last.ts - w.get(0).ts < subRideMinSpanSec * 1000) { res.put("why", "sub_confirmed"); return res; }
        List<Double> ds = new ArrayList<Double>();
        for (Fix f : w) {
            if (!f.noAcc() && f.acc > subRideMaxAcc) { res.put("why", "sub_confirmed"); return res; }
            ds.add(pathDist(f.lat, f.lng, pts));
        }
        res.put("distM", d(round(med(ds))));
        if (!(ds.get(ds.size() - 1) > subRideOffM)) { res.put("why", "on_path"); return res; }
        for (double x : ds) if (!(x > subRideOffM)) { res.put("why", "sub_confirmed"); return res; }
        res.put("confirmed", Boolean.TRUE); res.put("why", "off_sub_riding");
        return res;
    }
    static Map<String, Object> off(Map<String, Object> P, List<Fix> tr) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        double now = num(P.get("nowMs"));
        Map<String, Object> res = offResult();
        List<Object> sup = new ArrayList<Object>();
        List<Object> sl = l(plan.get("suppress"));
        if (sl != null) for (Object x : sl) if (!"subRiding".equals(x)) sup.add(x);
        if (!sup.isEmpty()) { StringBuilder b = new StringBuilder("suppressed:"); for (int i = 0; i < sup.size(); i++) { if (i > 0) b.append(','); b.append(str(sup.get(i))); } res.put("why", b.toString()); return res; }
        if (Boolean.TRUE.equals(plan.get("subConfirmed"))) return offSubRiding(P, tr, res);
        if (truthy(plan.get("notDeparted"))) { res.put("why", "not_departed"); return res; }
        List<double[]> pts = pts(plan.get("pts"));
        if (pts.size() < 2) { res.put("why", "no_path"); return res; }
        boolean sub = truthy(plan.get("progIsSub"));
        double win = (sub ? subWinSec : offWinSec) * 1000, minN = sub ? subMinFixes : offMinFixes, minSpan = (sub ? subMinSpanSec : offMinSpanSec) * 1000;
        List<Fix> w = new ArrayList<Fix>();
        for (Fix p : tr) if (now - p.ts <= win) w.add(p);
        w = distinct(w);
        res.put("n", d(w.size()));
        if (w.isEmpty()) { res.put("why", "no_fix"); return res; }
        Fix last = w.get(w.size() - 1);
        if (now - last.ts > freshSec * 1000) { res.put("why", "stale"); return res; }
        if (w.size() < minN) { res.put("why", "few_fixes"); return res; }
        res.put("spanSec", d(round((last.ts - w.get(0).ts) / 1000)));
        if (last.ts - w.get(0).ts < minSpan) { res.put("why", "short_span"); return res; }
        List<Double> ds = new ArrayList<Double>();
        for (Fix f : w) ds.add(pathDist(f.lat, f.lng, pts));
        res.put("distM", d(round(med(ds))));
        for (double x : ds) if (!(x > offM)) { res.put("why", "on_path"); return res; }
        if (sub) {
            List<Double> accs = new ArrayList<Double>();
            for (Fix p : w) if (!p.noAcc()) accs.add(p.acc);
            double ma = accs.isEmpty() ? Double.NaN : med(accs);
            if (!Double.isNaN(ma) && ma > subMaxAcc) { res.put("why", "sub_poor_acc"); return res; }
            double mv = 0;
            for (int i = 1; i < w.size(); i++) { double mm = hav(w.get(0).lat, w.get(0).lng, w.get(i).lat, w.get(i).lng); if (mm > mv) mv = mm; }
            if (mv < subMinMoveM) { res.put("why", "sub_still"); return res; }
        }
        res.put("confirmed", Boolean.TRUE); res.put("why", sub ? "off_surface_sub" : "off");
        return res;
    }

    // ── 지금 차량 속도로 움직이는 중인가 ──
    private static boolean vfit(List<Fix> tr, double now, double winMs, int minPts, double minSpan, double dSeg, double dTot, double minV) {
        List<Fix> pts = new ArrayList<Fix>();
        for (Fix q : tr) if (now - q.ts <= winMs) pts.add(q);
        if (pts.size() < minPts) return false;
        if ((pts.get(pts.size() - 1).ts - pts.get(0).ts) / 1000 < minSpan) return false;
        int k = (int) Math.floor(pts.size() / 3.0);
        double[] P1 = vg(pts, 0, k), P2 = vg(pts, k, pts.size() - k), P3 = vg(pts, pts.size() - k, pts.size());
        double d12 = hav(P1[0], P1[1], P2[0], P2[1]), d23 = hav(P2[0], P2[1], P3[0], P3[1]), d13 = hav(P1[0], P1[1], P3[0], P3[1]);
        double t13 = (P3[2] - P1[2]) / 1000;
        if (t13 < minSpan * 0.6) return false;
        return d12 >= dSeg && d23 >= dSeg && d13 >= dTot && d13 / t13 >= minV && d13 >= 0.8 * (d12 + d23);
    }
    private static double[] vg(List<Fix> pts, int a, int b) {
        List<Double> la = new ArrayList<Double>(), ln = new ArrayList<Double>(), ts = new ArrayList<Double>();
        for (int i = a; i < b && i < pts.size(); i++) { la.add(pts.get(i).lat); ln.add(pts.get(i).lng); ts.add(pts.get(i).ts); }
        return new double[] { med(la), med(ln), med(ts) };
    }
    static boolean vehicleNow(List<Fix> tr, double now) {
        return vfit(tr, now, 50000, 6, 30, 40, 100, 4.5) || vfit(tr, now, 300000, 20, 200, 250, 700, 2.6);
    }

    // ── 타고 있는 차 찾기 ──
    private static double[] trailFit(List<double[]> pts, List<Fix> tr) {
        if (pts == null || pts.size() < 2 || tr == null || tr.isEmpty()) return null;
        double sum = 0, mx = 0; List<Double> ds = new ArrayList<Double>();
        for (Fix f : tr) { double d = pathDist(f.lat, f.lng, pts); ds.add(d); sum += d; if (d > mx) mx = d; }
        double tail = 0;
        for (int i = Math.max(0, ds.size() - 3); i < ds.size(); i++) if (ds.get(i) > tail) tail = ds.get(i);
        return new double[] { sum / ds.size(), mx, tail, ds.size() };     // mean, max, tail, n
    }
    static Map<String, Object> ridden(Map<String, Object> P, List<Fix> tr, boolean vehNow) {
        List<Object> cands = l(P.get("cands")); if (cands == null) cands = new ArrayList<Object>();
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        double now = num(P.get("nowMs"));
        if (cands.size() < 2) return null;
        if (Boolean.TRUE.equals(plan.get("subConfirmed"))) return null;
        boolean onVeh = Boolean.TRUE.equals(plan.get("boarded")) || Boolean.TRUE.equals(plan.get("riding")) || vehNow;
        if (!onVeh) return null;
        double from = Math.max(truthy(plan.get("startMs")) ? num(plan.get("startMs")) - 30000 : 0, now - rideWinSec * 1000);
        List<Fix> w = new ArrayList<Fix>();
        for (Fix q : tr) if (q.ts >= from && now - q.ts <= rideWinSec * 1000) w.add(q);
        if (w.size() < rideMinFixes) return null;
        double[] cur = trailFit(pts(plan.get("pts")), w), bestFit = null; Object best = null;
        for (Object c : cands) {
            if (c == null || Boolean.TRUE.equals(g(c, "longDist"))) continue;
            List<double[]> cp = pts(g(c, "pts"));
            if (!(g(c, "pts") instanceof List) || cp.size() < 3) continue;
            double[] f = trailFit(cp, w); if (f == null) continue;
            if (bestFit == null || f[0] < bestFit[0]) { bestFit = f; best = c; }
        }
        if (best == null) return null;
        boolean ok = bestFit[0] <= fitMean && bestFit[1] <= fitMax && bestFit[2] <= fitTail;
        if (ok && cur != null && !(bestFit[0] + fitBetterBy < cur[0])) ok = false;
        Fix l = w.get(w.size() - 1);
        return obj("id", g(best, "id"), "ok", ok, "mean", d(round(bestFit[0])), "max", d(round(bestFit[1])), "tail", d(round(bestFit[2])),
            "curMean", cur != null ? d(round(cur[0])) : null, "curTail", cur != null ? d(round(cur[2])) : null,
            "curBad", cur != null && cur[0] > curBadMean && cur[2] > curBadTail, "last", obj("lat", l.lat, "lng", l.lng));
    }

    // ── 못 탔다는 증명 ──
    static Map<String, Object> miss(Map<String, Object> P, List<Fix> tr) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        Map<String, Object> sn = m(P.get("sensor")); if (sn == null) sn = obj();
        double now = num(P.get("nowMs"));
        Map<String, Object> res = obj("proof", Boolean.FALSE, "why", "");
        if (Boolean.TRUE.equals(plan.get("riding")) || Boolean.TRUE.equals(plan.get("boarded"))) { res.put("why", "riding"); return res; }
        List<Fix> w = within(tr, now, missWinSec);
        if (w.size() < missMinFixes) { res.put("why", "few_fixes"); return res; }
        Fix last = w.get(w.size() - 1);
        if (now - last.ts > freshSec * 1000) { res.put("why", "stale"); return res; }
        double dt = (last.ts - w.get(0).ts) / 1000;
        if (dt < missMinSpanSec) { res.put("why", "short_span"); return res; }
        List<Double> ds = new ArrayList<Double>();
        for (int i = 1; i < w.size(); i++) ds.add(hav(w.get(0).lat, w.get(0).lng, w.get(i).lat, w.get(i).lng));
        Collections.sort(ds, new Comparator<Double>() { @Override public int compare(Double a, Double b) { return Double.compare(a, b); } });
        double d80 = ds.get(Math.min(ds.size() - 1, (int) Math.floor(ds.size() * 0.8)));
        if (d80 > missD80) { res.put("why", "moving"); return res; }
        double cell = truthy(sn.get("cellN180")) ? num(sn.get("cellN180")) : 0;
        if (cell >= missCellN) { res.put("why", "cell_changes"); return res; }
        if (Boolean.TRUE.equals(sn.get("pfSeg"))) { res.put("why", "pf_moving"); return res; }
        res.put("proof", Boolean.TRUE); res.put("why", "still " + ns(round(d80)) + "m/" + ns(round(dt)) + "s");
        return res;
    }

    // ── 승차 안 하고 걸어서 멀어짐 ──
    static Map<String, Object> board(Map<String, Object> P, List<Fix> tr) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        double now = num(P.get("nowMs"));
        Object bp = plan.get("boardPt");
        if (!truthy(plan.get("notDeparted")) || bp == null || !fin(g(bp, "lat")) || !fin(g(bp, "lng"))) return null;
        double bLat = gn(bp, "lat"), bLng = gn(bp, "lng");
        Map<String, Object> res = obj("walkingAway", Boolean.FALSE, "distM", null, "speed", null, "why", "");
        List<Fix> w = distinct(within(tr, now, walkWinSec));
        if (w.size() < walkMinFixes) { res.put("why", "few_fixes"); return res; }
        Fix last = w.get(w.size() - 1);
        if (now - last.ts > freshSec * 1000) { res.put("why", "stale"); return res; }
        double span = (last.ts - w.get(0).ts) / 1000;
        if (span < walkMinSpanSec) { res.put("why", "short_span"); return res; }
        double dm = truthy(plan.get("departM")) ? num(plan.get("departM")) : walkDepartM;
        List<Double> ds = new ArrayList<Double>();
        for (Fix p : w) ds.add(hav(p.lat, p.lng, bLat, bLng));
        res.put("distM", d(round(med(ds))));
        for (double x : ds) if (x <= dm * 0.5) { res.put("why", "near_station"); return res; }
        int k = Math.max(1, (int) Math.floor(w.size() / 3.0));
        double[] A = vg(w, 0, k), B = vg(w, w.size() - k, w.size());
        double dt = (B[2] - A[2]) / 1000;
        if (dt < span * 0.4) { res.put("why", "short_span"); return res; }
        double speed = Double.parseDouble(toFixed(hav(A[0], A[1], B[0], B[1]) / dt, 2));
        res.put("speed", d(speed));
        if (speed > walkMaxSpeed) { res.put("why", "fast"); return res; }
        res.put("walkingAway", Boolean.TRUE); res.put("why", "walking " + ns(speed) + "m/s " + ns(num(res.get("distM"))) + "m");
        return res;
    }

    // ── 영점 확인 · 도착 확인 ──
    /** 정류장 s = Map{i,lat,lng,arrMs,fin?,pass?…} */
    static Map<String, Object> zeroStop(Map<String, Object> s, List<Fix> tr, double now) {
        double arrMs = gn(s, "arrMs"), lat = gn(s, "lat"), lng = gn(s, "lng");
        boolean sfin = truthy(s.get("fin"));
        double lead = zeroLeadSec * 1000, win = zeroWinSec * 1000, slideWin = zeroSlideSec * 1000, ws = arrMs - lead, we = ws + win;
        boolean active = now >= ws && now <= we, ended = now > we;
        if (now < ws) return null;
        boolean sliding = false;
        if (ended) {
            if (sfin && now - arrMs <= zeroFinalKeepMin * 60000) sliding = true;
            else if (now - we > zeroKeepSec * 1000) return null;
        }
        double from = sliding ? now - slideWin : ws - 2000, to = sliding ? now : (ended ? we : now);
        double R = sfin ? zeroFinalNearM : zeroNearM, best = Double.NaN;
        int n = 0, near = 0, far = 0;
        boolean hasBest = false;
        for (Fix q : tr) {
            if (q.ts < from || q.ts > to + 1000) continue;
            if (!q.noAcc() && q.acc > 150) continue;
            double acc = q.noAcc() ? 50 : q.acc, dd = hav(q.lat, q.lng, lat, lng) - acc;
            n++;
            if (!hasBest || dd < best) { best = dd; hasBest = true; }
            if (dd <= R) near++; else if (dd > zeroFarM) far++;
        }
        double dt = now - arrMs; String st;
        if (near >= 1 && near >= far) st = "near";
        else if (active) st = "pending";
        else if (far >= 1) st = "far";
        else if (n == 0) st = "none";
        else st = "off";
        Map<String, Object> r = obj("i", s.get("i"), "fin", sfin, "state", st, "apply", st.equals("near") && dt >= -zeroApplyLeadSec * 1000,
            "dtSec", round(dt / 1000), "n", n, "near", near, "far", far, "distM", hasBest ? d(round(best)) : null);
        if (sfin) r.put("verdict", (active && !sliding) ? "verify" : (st.equals("near") ? "confirmed" : (st.equals("far") ? "notyet" : "unknown")));
        return r;
    }
    /** 통과 시각 {ms, distM} 또는 null. */
    static double[] passTime(Map<String, Object> s, List<Fix> tr, double now) {
        double arrMs = gn(s, "arrMs"), lat = gn(s, "lat"), lng = gn(s, "lng");
        if (now < arrMs - passAheadSec * 1000 || now - arrMs > passLateSec * 1000) return null;
        double lo = arrMs - passBackSec * 1000;
        double bd = 0, bms = 0; int bi = -1;
        for (int i = 0; i < tr.size(); i++) {
            Fix q = tr.get(i);
            if (q.ts < lo || q.ts > now + 1000) continue;
            if (!q.noAcc() && q.acc > passAccM) continue;
            double d = hav(q.lat, q.lng, lat, lng);
            if (d <= passNearM && (bi < 0 || d < bd)) { bd = d; bms = q.ts; bi = i; }
        }
        if (bi < 0) return null;
        double ms = bms, dMin = bd, gapMs = passInterpMaxGapSec * 1000;
        int[] cand = { bi - 1, bi };
        for (int c = 0; c < cand.length; c++) {
            Fix a = cand[c] >= 0 && cand[c] < tr.size() ? tr.get(cand[c]) : null, b = cand[c] + 1 >= 0 && cand[c] + 1 < tr.size() ? tr.get(cand[c] + 1) : null;
            if (a == null || b == null || b.ts <= a.ts || b.ts - a.ts > gapMs || b.ts > now + 1000) continue;
            if ((!a.noAcc() && a.acc > passAccM) || (!b.noAcc() && b.acc > passAccM)) continue;
            double kx = 111320 * cos(lat * Math.PI / 180), ax = (a.lng - lng) * kx, ay = (a.lat - lat) * 111320, bx = (b.lng - lng) * kx, by = (b.lat - lat) * 111320;
            double vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy;
            if (!(vv > 0)) continue;
            double u = -(ax * vx + ay * vy) / vv;
            if (u <= 0 || u >= 1) continue;
            double px = ax + u * vx, py = ay + u * vy, dd = Math.sqrt(px * px + py * py);
            if (dd < dMin - 0.5) { dMin = dd; ms = round(a.ts + u * (b.ts - a.ts)); }
        }
        return new double[] { ms, round(dMin) };
    }
    /** 아직 안 닿음 — distM 또는 NaN(null). */
    static double notYet(Map<String, Object> s, Map<String, Object> prev, List<Fix> tr, double now) {
        if (prev == null || !fin(prev.get("lat")) || !fin(prev.get("lng"))) return Double.NaN;
        double late = now - gn(s, "arrMs");
        if (late < 0 || late > notYetMaxLateSec * 1000 || tr.isEmpty()) return Double.NaN;
        Fix q = null;
        for (int i = tr.size() - 1; i >= 0; i--) { if (tr.get(i).noAcc() || tr.get(i).acc <= notYetAccM) { q = tr.get(i); break; } }
        if (q == null || now - q.ts > freshSec * 1000) return Double.NaN;
        double sl = gn(s, "lat"), sg = gn(s, "lng"), pl = gn(prev, "lat"), pg = gn(prev, "lng");
        double dn = hav(q.lat, q.lng, sl, sg), dp = hav(q.lat, q.lng, pl, pg), L = hav(pl, pg, sl, sg);
        if (dn <= notYetFarM || L <= 0) return Double.NaN;
        if (dp + dn > L * notYetBetween) return Double.NaN;
        return round(dn);
    }
    /** 같은 시각인데 멀리 떨어진 좌표는 사실일 수 없다 — 뒤에서부터 보며 그런 앞 좌표를 버린다. */
    static List<Fix> sane(List<Fix> tr) {
        List<Fix> out = new ArrayList<Fix>(); Fix nx = null;
        for (int i = tr.size() - 1; i >= 0; i--) {
            Fix q = tr.get(i);
            if (nx != null) {
                double dt = Math.max(1, Math.abs(nx.ts - q.ts) / 1000), accs = (nx.noAcc() ? 50 : nx.acc) + (q.noAcc() ? 50 : q.acc);
                if (hav(q.lat, q.lng, nx.lat, nx.lng) - accs > trailMaxSpeedMps * dt + 60) continue;
            }
            out.add(q); nx = q;
        }
        Collections.reverse(out);
        return out;
    }
    static Map<String, Object> zero(Map<String, Object> P, List<Fix> tr0) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        List<Object> stops = l(plan.get("stops")); if (stops == null) stops = new ArrayList<Object>();
        double now = num(P.get("nowMs"));
        List<Object> outStops = new ArrayList<Object>();
        Map<String, Object> out = obj("stops", outStops, "final", null);
        if (!truthy(plan.get("boarded")) || stops.isEmpty()) return out;
        List<Fix> tr = sane(tr0);
        for (int k = 0; k < stops.size(); k++) {
            Map<String, Object> s = m(stops.get(k));
            if (s == null || !fin(s.get("arrMs")) || !fin(s.get("lat")) || !fin(s.get("lng"))) continue;
            Map<String, Object> r = zeroStop(s, tr, now);
            boolean pass = Boolean.TRUE.equals(s.get("pass")) && !truthy(s.get("fin"));
            double[] ps = pass ? passTime(s, tr, now) : null;
            double ny = (ps == null && pass) ? notYet(s, k > 0 ? m(stops.get(k - 1)) : null, tr, now) : Double.NaN;
            boolean hasNy = !Double.isNaN(ny);
            if (r == null && ps == null && !hasNy) continue;
            if (hasNy && r != null && "near".equals(r.get("state"))) hasNy = false;
            if (r == null && ps == null && !hasNy) continue;
            if (r == null) r = obj("i", s.get("i"), "fin", truthy(s.get("fin")), "state", "pass", "apply", Boolean.FALSE, "dtSec", round((now - gn(s, "arrMs")) / 1000), "n", 0, "near", 0, "far", 0, "distM", null);
            if (hasNy) { r.put("notYet", Boolean.TRUE); r.put("notYetDistM", d(ny)); }
            if (ps != null) {
                r.put("passMs", d(ps[0])); r.put("passDistM", d(ps[1])); r.put("passEarlySec", d(round((ps[0] - gn(s, "arrMs")) / 1000))); r.put("apply", Boolean.TRUE);
                if (!"near".equals(r.get("state"))) r.put("state", "near");
            }
            outStops.add(r);
            if (Boolean.TRUE.equals(r.get("fin"))) out.put("final", r);
        }
        return out;
    }

    // ── 버스를 정말 탔나 ──
    /** 정확도를 일부 빼고 nearM 안에 든 첫 좌표의 시각(없으면 NaN). */
    static double reach(List<Fix> tr, double lat, double lng, double nearM, double capAcc) {
        for (Fix q : tr) {
            double acc = q.noAcc() ? 50 : Math.min(q.acc, capAcc);
            if (hav(q.lat, q.lng, lat, lng) - acc <= nearM) return q.ts;
        }
        return Double.NaN;
    }
    static double motionStart(List<Fix> tr) {
        if (tr.isEmpty()) return Double.NaN;
        Fix t0 = tr.get(0); boolean still = true; int i;
        for (i = 1; i < tr.size() && tr.get(i).ts - t0.ts <= 20000; i++) if (hav(t0.lat, t0.lng, tr.get(i).lat, tr.get(i).lng) >= 40) still = false;
        if (!still) return Double.NaN;
        for (i = 1; i < tr.size(); i++) if (hav(t0.lat, t0.lng, tr.get(i).lat, tr.get(i).lng) > 150) return tr.get(i).ts;
        return Double.NaN;
    }
    static Map<String, Object> bus(Map<String, Object> P, List<Fix> tr, boolean vehNow) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        Object b = plan.get("busLeg"); double now = num(P.get("nowMs"));
        if (!truthy(b)) return null;
        Map<String, Object> res = obj("state", "unknown", "why", "", "stopSeen", null, "ahead", 0);
        List<Object> sup = new ArrayList<Object>();
        List<Object> sl = l(plan.get("suppress"));
        if (sl != null) for (Object x : sl) if (!"subRiding".equals(x)) sup.add(x);
        if (!sup.isEmpty()) { StringBuilder sb = new StringBuilder("suppressed:"); for (int i = 0; i < sup.size(); i++) { if (i > 0) sb.append(','); sb.append(str(sup.get(i))); } res.put("state", "idle"); res.put("why", sb.toString()); return res; }
        Object proof = g(b, "proof");
        if ("button".equals(proof) || "vehicle".equals(proof) || "ridden".equals(proof)) { res.put("state", "confirmed"); res.put("why", "proof_" + proof); return res; }
        boolean moving = vehNow || Boolean.TRUE.equals(plan.get("riding")) || Boolean.TRUE.equals(plan.get("boarded"));
        if (!moving) { res.put("state", "idle"); res.put("why", "not_moving"); return res; }
        if (tr.isEmpty()) { res.put("why", "no_fix"); return res; }
        Fix last = tr.get(tr.size() - 1);
        if (now - last.ts > freshSec * 1000) { res.put("why", "stale"); return res; }
        Object bp = g(b, "boardPt"); Boolean seen = null;
        if (truthy(bp) && fin(g(bp, "lat")) && fin(g(bp, "lng"))) {
            double t = reach(tr, gn(bp, "lat"), gn(bp, "lng"), busStopNearM, busStopAccCap);
            seen = !Double.isNaN(t); res.put("stopSeen", seen);
        }
        List<Object> stops = l(plan.get("stops")); if (stops == null) stops = new ArrayList<Object>();
        int ahead = 0;
        for (Object so : stops) {
            Map<String, Object> s = m(so);
            if (s == null || !Boolean.TRUE.equals(s.get("bus")) || !fin(s.get("planMs")) || !fin(s.get("lat")) || !fin(s.get("lng"))) continue;
            if (g(b, "boardIdx") != null && num(s.get("i")) <= num(g(b, "boardIdx"))) continue;
            double tt = reach(tr, gn(s, "lat"), gn(s, "lng"), busStopNearReachM, busStopAccCap);
            if (!Double.isNaN(tt) && tt < gn(s, "planMs") - busAheadSec * 1000) ahead++;
        }
        res.put("ahead", d(ahead));
        if (Boolean.TRUE.equals(seen)) {
            if (ahead >= busAheadMinStops) { res.put("state", "notBus"); res.put("why", "ahead"); return res; }
            res.put("state", "plausible"); res.put("why", "stop_seen"); return res;
        }
        if (ahead >= busAheadMinStops) { res.put("state", "notBus"); res.put("why", "ahead"); return res; }
        if (Boolean.FALSE.equals(seen)) {
            if (tr.size() >= busTrailCap || now - tr.get(0).ts >= busTrailMaxAgeSec * 1000) { res.put("why", "trail_capped"); return res; }
            double from = truthy(plan.get("startMs")) ? num(plan.get("startMs")) : Double.NaN;
            if (Double.isNaN(from)) from = motionStart(tr);
            if (!Double.isNaN(from) && from != 0 && tr.get(0).ts <= from - busCoverSlackSec * 1000) { res.put("state", "notBus"); res.put("why", "no_stop"); return res; }
            res.put("why", "trail_short"); return res;
        }
        res.put("why", "no_board_pt"); return res;
    }

    /** 탑승·환승 버튼을 누른 순간의 GPS 확인. */
    static Map<String, Object> press(Map<String, Object> P, List<Fix> tr) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        Object pp = plan.get("pressPt"); double now = num(P.get("nowMs"));
        if (!truthy(pp) || !fin(g(pp, "lat")) || !fin(g(pp, "lng"))) return null;
        Map<String, Object> res = obj("state", "unknown", "distM", null, "ageSec", null, "why", "");
        Fix q = null;
        for (int i = tr.size() - 1; i >= 0; i--) { if (tr.get(i).noAcc() || tr.get(i).acc <= maxAcc) { q = tr.get(i); break; } }
        if (q == null) { res.put("why", "no_fix"); return res; }
        res.put("ageSec", d(round((now - q.ts) / 1000)));
        if (now - q.ts > freshSec * 1000) { res.put("why", "stale"); return res; }
        double acc = q.noAcc() ? 50 : Math.min(q.acc, busStopAccCap), dd = Math.max(0, hav(q.lat, q.lng, gn(pp, "lat"), gn(pp, "lng")) - acc);
        res.put("distM", d(round(dd)));
        if (dd <= pressNearM) { res.put("state", "at"); res.put("why", "near_station"); }
        else if (dd > pressFarM) { res.put("state", "away"); res.put("why", "far_from_station"); }
        else { res.put("state", "near"); res.put("why", "between"); }
        return res;
    }

    // ── 움직임(네비게이션식) ──
    static Map<String, Object> motion(List<Fix> tr, double now) {
        Map<String, Object> res = obj("moving", null, "speedMps", null, "n", 0, "ageSec", null);
        List<Fix> pts = new ArrayList<Fix>();
        for (Fix q : tr) if (now - q.ts <= motionWinSec * 1000 && (q.noAcc() || q.acc <= motionMaxAcc)) pts.add(q);
        res.put("n", d(pts.size()));
        if (!tr.isEmpty()) res.put("ageSec", d(round((now - tr.get(tr.size() - 1).ts) / 1000)));
        if (pts.size() < 2) return res;
        Fix a = pts.get(0), b = pts.get(pts.size() - 1); double dt = (b.ts - a.ts) / 1000;
        if (dt < motionMinSpanSec || now - b.ts > freshSec * 1000) return res;
        double d = hav(a.lat, a.lng, b.lat, b.lng) - ((a.noAcc() ? 20 : a.acc) + (b.noAcc() ? 20 : b.acc)) / 2;
        double v = Math.max(0, d) / dt;
        res.put("speedMps", d(Math.round(v * 10) / 10.0));
        if (v >= motionMoveMps) res.put("moving", Boolean.TRUE); else if (v <= motionStopMps) res.put("moving", Boolean.FALSE);
        return res;
    }

    // ── 버스 위치(정류장을 이은 선 위) ──
    /** {seg, ratio, s, off} */
    static double[] busProject(List<Map<String, Object>> L, double[] cum, double lat, double lng) {
        double bestD = Double.POSITIVE_INFINITY; double[] res = null;
        for (int j = 0; j < L.size() - 1; j++) {
            double aLat = gn(L.get(j), "lat"), aLng = gn(L.get(j), "lng"), bLat = gn(L.get(j + 1), "lat"), bLng = gn(L.get(j + 1), "lng");
            double d = segDist(lat, lng, aLat, aLng, bLat, bLng);
            if (d < bestD) {
                double kx = 88000, ky = 111000, ax = aLng * kx, ay = aLat * ky, bx = bLng * kx, by = bLat * ky, px = lng * kx, py = lat * ky;
                double dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 != 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
                t = Math.max(0, Math.min(1, t));
                bestD = d; res = new double[] { j, t, cum[j] + t * (cum[j + 1] - cum[j]), d };
            }
        }
        return res;
    }
    static Map<String, Object> busPos(Map<String, Object> P, List<Fix> tr) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        List<Object> stops = l(plan.get("stops")); if (stops == null) stops = new ArrayList<Object>();
        double now = num(P.get("nowMs"));
        if (!truthy(plan.get("boarded")) || stops.isEmpty() || tr.isEmpty()) return null;
        Fix last = null; int k;
        for (k = tr.size() - 1; k >= 0; k--) { if (tr.get(k).noAcc() || tr.get(k).acc <= busPosFixAccM) { last = tr.get(k); break; } }
        if (last == null || now - last.ts > freshSec * 1000) return null;
        Map<String, List<Map<String, Object>>> legs = new HashMap<String, List<Map<String, Object>>>(); List<String> order = new ArrayList<String>();
        for (k = 0; k < stops.size(); k++) {
            Map<String, Object> s = m(stops.get(k));
            if (s == null || !Boolean.TRUE.equals(s.get("bus")) || s.get("lg") == null || !fin(s.get("lat")) || !fin(s.get("lng"))) continue;
            String key = str(s.get("lg"));
            if (!legs.containsKey(key)) { legs.put(key, new ArrayList<Map<String, Object>>()); order.add(key); }
            legs.get(key).add(s);
        }
        List<Map<String, Object>> bestL = null; double[] bestCum = null, bestPr = null; String bestLg = null;
        for (String lg : order) {
            List<Map<String, Object>> L = legs.get(lg);
            if (L.size() < busPosMinStops) continue;
            double[] cum = new double[L.size()];
            for (int j = 1; j < L.size(); j++) cum[j] = cum[j - 1] + hav(gn(L.get(j - 1), "lat"), gn(L.get(j - 1), "lng"), gn(L.get(j), "lat"), gn(L.get(j), "lng"));
            double[] pr = busProject(L, cum, last.lat, last.lng);
            if (pr != null && pr[3] <= busPosOffM && (bestPr == null || pr[3] < bestPr[3])) { bestL = L; bestCum = cum; bestPr = pr; bestLg = lg; }
        }
        if (bestPr == null) return null;
        List<Map<String, Object>> L2 = bestL; double[] cum2 = bestCum, pr2 = bestPr;
        int seg = (int) pr2[0];
        List<Object> passed = new ArrayList<Object>(), passedUnknown = new ArrayList<Object>();
        Map<String, Object> out = obj("lg", L2.get(0).get("lg"), "offM", d(round(pr2[3])), "fromI", L2.get(seg).get("i"), "toI", L2.get(Math.min(L2.size() - 1, seg + 1)).get("i"),
            "ratio", d(round(pr2[1] * 1000) / 1000), "distAlong", d(round(pr2[2])), "passed", passed, "passedUnknown", passedUnknown);
        // 궤적 → 선 위 거리
        List<double[]> xs = new ArrayList<double[]>();
        for (k = 0; k < tr.size(); k++) {
            Fix q = tr.get(k); if (!q.noAcc() && q.acc > busPosFixAccM) continue;
            double[] p = busProject(L2, cum2, q.lat, q.lng);
            if (p != null && p[3] <= busPosOffM) xs.add(new double[] { q.ts, p[2] });
        }
        double sNow = pr2[2];
        for (k = 1; k < L2.size(); k++) {
            double sk = cum2[k];
            if (sNow < sk + busPosMinGapM) continue;
            int lb = -1;
            for (int x = 0; x < xs.size(); x++) { if (xs.get(x)[1] < sk) lb = x; }
            if (lb < 0) { passedUnknown.add(L2.get(k).get("i")); continue; }
            double[] A = xs.get(lb), B = lb + 1 < xs.size() ? xs.get(lb + 1) : null;
            if (B == null || B[1] < sk) { passedUnknown.add(L2.get(k).get("i")); continue; }
            double ms = (B[1] > A[1]) ? round(A[0] + (sk - A[1]) / (B[1] - A[1]) * (B[0] - A[0])) : B[0];
            if (ms > now + 1000) ms = now;
            passed.add(obj("i", L2.get(k).get("i"), "ms", d(ms)));
        }
        return out;
    }

    // ── 진입 ──
    static Map<String, Object> rideTrack(Map<String, Object> P0) {
        Map<String, Object> P = P0 == null ? obj() : P0;
        if (!fin(P.get("nowMs"))) P.put("nowMs", Double.valueOf(System.currentTimeMillis()));
        double now = num(P.get("nowMs"));
        Object wantO = P.get("want");
        Map<String, Object> want = wantO != null && truthy(wantO) ? m(wantO) : obj("off", Boolean.TRUE, "ridden", Boolean.TRUE, "miss", Boolean.TRUE);
        if (want == null) want = obj();
        List<Fix> tr = trail(P);
        Fix last = tr.isEmpty() ? null : tr.get(tr.size() - 1);
        Map<String, Object> out = obj("v", 1, "fix", obj("n", tr.size(), "ageSec", last != null ? d(round((now - last.ts) / 1000)) : null, "fresh", last != null && now - last.ts <= freshSec * 1000),
            "off", null, "ridden", null, "miss", null, "board", null, "vehicleNow", Boolean.FALSE, "bus", null, "mode", null, "press", null, "motion", null, "busPos", null);
        boolean veh = vehicleNow(tr, now);
        out.put("vehicleNow", veh);
        if (truthy(want.get("off"))) out.put("off", off(P, tr));
        if (truthy(want.get("ridden"))) out.put("ridden", ridden(P, tr, veh));
        if (truthy(want.get("miss"))) out.put("miss", miss(P, tr));
        if (!Boolean.FALSE.equals(want.get("board"))) out.put("board", board(P, tr));
        if (truthy(want.get("zero"))) out.put("zero", zero(P, tr));
        if (!Boolean.FALSE.equals(want.get("bus"))) out.put("bus", bus(P, tr, veh));
        Map<String, Object> bus = m(out.get("bus")), rd = m(out.get("ridden"));
        if (bus != null && "notBus".equals(bus.get("state")) && rd != null && Boolean.TRUE.equals(rd.get("ok"))) { bus.put("state", "plausible"); bus.put("why", "candidate_route"); }
        if (Boolean.TRUE.equals(want.get("press"))) out.put("press", press(P, tr));
        out.put("motion", tr.isEmpty() ? null : motion(tr, now));
        Map<String, Object> plan = m(P.get("plan"));
        if (!Boolean.FALSE.equals(want.get("bus")) && (bus == null || !"notBus".equals(bus.get("state")))
            && (Boolean.TRUE.equals(plan == null ? null : plan.get("progIsBus")) || (bus != null && ("confirmed".equals(bus.get("state")) || "plausible".equals(bus.get("state"))))))
            out.put("busPos", busPos(P, tr));
        out.put("mode", mode(P, bus));
        return out;
    }
    static Map<String, Object> mode(Map<String, Object> P, Map<String, Object> bus) {
        Map<String, Object> plan = m(P.get("plan")); if (plan == null) plan = obj();
        if (bus != null && "notBus".equals(bus.get("state"))) return null;
        if (Boolean.TRUE.equals(plan.get("subConfirmed"))) return obj("kind", "sub", "gps", "zero");
        if (bus != null && ("confirmed".equals(bus.get("state")) || "plausible".equals(bus.get("state"))) && Boolean.TRUE.equals(plan.get("boarded")))
            return obj("kind", "bus", "gps", "heavy", "snapM", busGpsSnapM, "advanceSec", busAdvanceSec);
        return null;
    }
}
