package com.dullyyj.subway;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 폰 안 승차 엔진(RideStandbyJ · RideEtaJ · RideTrackJ) 대조 시험 — 서버 JS 엔진이 같은 입력으로 낸 답(녹화본 jsonl)과 자바 답이 같은지 본다.
 * 한 줄 = {"fn":"standby|eta|track","in":…,"out":…}. 사용: java RideLocalJvmTest <jsonl> [종류당 최대 줄 수]
 * 합격 기준(YJ): 역 도착 시각 차이 3초 이내 — 여기서는 그보다 훨씬 엄격하게 숫자 끝자리(ulp)까지 같아야 통과로 센다.
 */
public class RideLocalJvmTest {
    static final boolean STRICT = Boolean.getBoolean("strict");
    static int diffs;
    static final List<String> samples = new ArrayList<String>();

    @SuppressWarnings("unchecked")
    static void cmp(Object a, Object b, String path) {
        if (diffs > 12) return;
        if (a == null && b == null) return;
        if (!STRICT && b == null && (path.endsWith(".state.rtc") || path.contains(".state.rtc.bu") || path.contains(".state.mkFloor") || path.contains(".state.bl.cand") || path.endsWith(".state.wait.pf") || path.endsWith(".w.pf") || path.contains(".state.wait.lf") || path.endsWith(".w.lf") || path.contains(".w.lf[") || path.endsWith(".state.waitT0") || path.endsWith(".state.mtq"))) return;      // s337: 위치 없이 대기 · 마지막 위치 · 번호 붙이기 예약      // s336: 이전에 녹화한 답에는 새 상태 키(승차 후보 열차 · 승강장 시각 · 종착 바닥 · 버스트)가 없다 — 새 녹화(v:336, -Dstrict=1)는 모두 비교한다      // s334: 녹화본 중 s334 이전에 녹화한 답에는 실시간 호출 장부(state.rtc)가 없다 — 새 녹화(s334 줄)는 있으면 모두 비교한다
        if (!STRICT && a instanceof String && b instanceof String && ((String) a).startsWith((String) b + " · 거리")) return;      // s336: 이전 녹화의 '어긋남' 메모에는 거리 꼬리말이 없다
        if (a instanceof Map || b instanceof Map) {
            Map<String, Object> ma = a instanceof Map ? (Map<String, Object>) a : new HashMap<String, Object>(), mb = b instanceof Map ? (Map<String, Object>) b : new HashMap<String, Object>();
            if (!(a instanceof Map) && a != null || !(b instanceof Map) && b != null) { note(path, a, b); return; }
            Set<String> ks = new LinkedHashSet<String>(mb.keySet()); ks.addAll(ma.keySet());
            for (String k : ks) cmp(ma.get(k), mb.get(k), path + "." + k);
            return;
        }
        if (a instanceof List || b instanceof List) {
            if (!(a instanceof List) || !(b instanceof List)) { if (a == null && b instanceof List && ((List<Object>) b).isEmpty()) return; if (b == null && a instanceof List && ((List<Object>) a).isEmpty()) return; note(path, a, b); return; }
            List<Object> la = (List<Object>) a, lb = (List<Object>) b;
            if (la.size() != lb.size()) { note(path + ".length", la.size(), lb.size()); return; }
            for (int i = 0; i < la.size(); i++) cmp(la.get(i), lb.get(i), path + "[" + i + "]");
            return;
        }
        if (a instanceof Number && b instanceof Number) {
            double x = ((Number) a).doubleValue(), y = ((Number) b).doubleValue();
            if (x == y || Math.abs(x - y) <= 8 * Math.ulp(y) + 1e-12) return;
            note(path, a, b); return;
        }
        if (a == null || b == null || !a.equals(b)) note(path, a, b);
    }
    static void note(String path, Object a, Object b) {
        diffs++;
        String sa = String.valueOf(a), sb = String.valueOf(b);
        if (sa.length() > 160) sa = sa.substring(0, 160) + "…"; if (sb.length() > 160) sb = sb.substring(0, 160) + "…";
        samples.add(path + "  자바=" + sa + "  서버=" + sb);
    }

    static int bad(String m) { System.out.println("FAIL RideLocal: " + m); return 1; }
    /** 입구(RideLocal) 점검 — 글→글 한 걸음 · 서버가 필요한 걸음 가리기 · 받아 둔 추천 글 쓸 수 있는지. */
    @SuppressWarnings("unchecked")
    static int localChecks() {
        int f = 0;
        for (int k = 0; k < stdIns.size(); k++) {
            String body = HomeSearchCore.toJson(stdIns.get(k));
            String resp = RideLocal.step(body);
            if (resp == null) { f += bad("step null #" + k); continue; }
            diffs = 0; samples.clear();
            try { cmp(ScreenCore.parse(resp), RideStandbyJ.rideStandby(stdIns.get(k)), "step"); } catch (Throwable t) { f += bad("parse " + t); }
            if (diffs != 0) f += bad("step 결과가 엔진과 다르다 #" + k + " " + samples);
            boolean press = "press".equals(stdIns.get(k).get("act")), q = RideStandbyJ.pressQuery(stdIns.get(k)) != null;
            if (RideLocal.needsTable(body) != q) f += bad("needsTable 이 pressQuery 와 다르다 #" + k);
            if (!press && RideLocal.needsTable(body)) f += bad("press 아닌 걸음이 서버를 부른다 #" + k);
        }
        if (RideLocal.step("{") != null || RideLocal.step("[]") != null) f += bad("엉터리 글은 null");
        if (RideLocal.needsTable("{\"act\":\"press\"}") || RideLocal.needsTable("nope")) f += bad("엉터리 글은 서버 불필요");
        // 받아 둔 추천 글: 같은 시간대 · 같은 도착지만 쓴다 (KST 08:30 → 아침, 08:40 → 아침, 12:00 → 점심)
        double m830 = 1792006200000.0;                                      // 어느 날이든 시각만 본다 — 아래에서 KST 분으로 확인
        double base = m830 - RideStandbyJ.kstMin(m830) * 60000 + 8 * 3600000 + 30 * 60000;   // 그날 KST 08:30
        String a = "{\"arrMs\":" + (long) base + ",\"dest\":\"강남\"}", b = "{\"arrMs\":" + (long) (base + 600000) + ",\"dest\":\"강남\"}";
        String c = "{\"arrMs\":" + (long) (base + 3.5 * 3600000) + ",\"dest\":\"강남\"}", d = "{\"arrMs\":" + (long) base + ",\"dest\":\"역삼\"}";
        if (!RideLocal.cacheMatches(a, b)) f += bad("같은 시간대·도착지는 쓴다");
        if (RideLocal.cacheMatches(a, c)) f += bad("시간대가 다르면 쓰지 않는다");
        if (RideLocal.cacheMatches(a, d)) f += bad("도착지가 다르면 쓰지 않는다");
        if (RideLocal.cacheMatches("x", b) || RideLocal.cacheMatches(a, "{}")) f += bad("엉터리는 쓰지 않는다");
        if (RideLocal.prefetchBody("{", "{") .length() != 0) f += bad("엉터리는 prefetch 없음");
        // prefetch: 대기 중 · 시간대 · 도착지 좌표가 다 있을 때만 본문이 나온다 (녹화본에서 하나 이상 나와야 한다)
        int pre = 0;
        for (int k = 0; k < stdIns.size(); k++) {
            String body = HomeSearchCore.toJson(stdIns.get(k)), resp = RideLocal.step(body);
            if (resp == null) continue;
            String pb = RideLocal.prefetchBody(body, resp);
            if (pb.length() > 0) {
                pre++;
                try { Map<String, Object> pm = (Map<String, Object>) ScreenCore.parse(pb); if (!(pm.get("loc") instanceof Map) || !(pm.get("arrMs") instanceof Number) || !RideLocal.cacheMatches(pb, pb)) f += bad("prefetch 본문 모양"); } catch (Throwable t) { f += bad("prefetch 파싱 " + t); }
            }
        }
        System.out.println("RideLocal: 한 걸음 " + stdIns.size() + "건 · 추천 미리 받기 본문 " + pre + "건 · 이상 " + f);
        return f;
    }
    static final List<Map<String, Object>> stdIns = new ArrayList<Map<String, Object>>();

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        String file = args[0]; int max = args.length > 1 ? Integer.parseInt(args[1]) : Integer.MAX_VALUE;
        Map<String, int[]> stat = new HashMap<String, int[]>(); Map<String, List<String>> bad = new HashMap<String, List<String>>();
        BufferedReader br = new BufferedReader(new InputStreamReader(new FileInputStream(file), "UTF-8"), 1 << 20);
        String line; int lineNo = 0;
        while ((line = br.readLine()) != null) {
            lineNo++;
            if (line.length() < 5) continue;
            Map<String, Object> rec;
            try { rec = (Map<String, Object>) ScreenCore.parse(line); } catch (Throwable t) { System.out.println("읽기 실패 줄 " + lineNo + ": " + t); continue; }
            String fn = (String) rec.get("fn");
            int[] s = stat.get(fn); if (s == null) { s = new int[2]; stat.put(fn, s); }
            if (s[0] + s[1] >= max) continue;
            Map<String, Object> in = (Map<String, Object>) rec.get("in"); Object out = rec.get("out"), got;
            if ("standby".equals(fn) && stdIns.size() < 60 && (stdIns.size() < 40 || "press".equals(in.get("act")))) stdIns.add(in);
            try {
                if ("standby".equals(fn)) got = RideStandbyJ.rideStandby(in);
                else if ("eta".equals(fn)) got = RideEtaJ.rideEta(in);
                else got = RideTrackJ.rideTrack(in);
            } catch (Throwable t) { got = null; samples.clear(); diffs = 1; samples.add("자바 예외: " + t); StackTraceElement[] st = t.getStackTrace(); for (int i = 0; i < Math.min(4, st.length); i++) samples.add("   at " + st[i]); }
            if (got != null) { diffs = 0; samples.clear(); cmp(got, out, fn); }
            if (diffs == 0) s[0]++; else {
                s[1]++;
                List<String> bl = bad.get(fn); if (bl == null) { bl = new ArrayList<String>(); bad.put(fn, bl); }
                if (bl.size() < 6) bl.add("줄 " + lineNo + ": " + String.join(" | ", samples.subList(0, Math.min(samples.size(), 4))));
            }
        }
        int tot = 0, fail = 0;
        if (!STRICT) fail += localChecks();
        for (String fn : stat.keySet()) { int[] s = stat.get(fn); tot += s[0] + s[1]; fail += s[1]; System.out.println(fn + ": 같음 " + s[0] + " · 다름 " + s[1]); }
        for (String fn : bad.keySet()) for (String b : bad.get(fn)) System.out.println("  [" + fn + "] " + b);
        System.out.println(fail == 0 ? "ALL OK (" + tot + ")" : "FAIL (" + fail + "/" + tot + ")");
        System.exit(fail == 0 ? 0 : 1);
    }
}
