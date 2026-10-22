package com.dullyyj.subway;

import java.util.List;
import java.util.Map;

/**
 * 내 폰 안의 승차 엔진 입구 (2026-10-22) — 순수 자바, JVM 에서 시험한다.
 *
 * ★ YJ 핵심 규칙: "탑승이 확정된 이후에는 외부 서버 요청을 일체 발생시키지 않는다."
 *   서버 엔진(ride-standby · ride-eta · ride-track · posfusion)을 한 줄씩 옮긴 RideStandbyJ 로 5초 걸음을 폰 안에서 계산한다.
 *   입력(요청 글)과 출력(응답 글)의 모양은 서버 /ride-standby 와 똑같아서 RideCore 는 그대로다.
 *   서버가 필요한 경우는 딱 하나 — 사용자가 [탑승]을 눌러 어느 열차인지 가릴 때 시각표를 읽는 한 번(needsTable). 그 한 번이 '최초 탑승 판정'이다.
 *   하차 추천 문구(/reco-text)도 탑승 전에 한 번만 받아 두고(prefetchBody) 탑승 뒤에는 받아 둔 글만 쓴다(cacheMatches).
 */
final class RideLocal {
    private RideLocal() { }

    /** 요청 글 → 응답 글. 계산을 못 하면 null (RideCore 는 그 걸음을 건너뛰고 다음에 다시 보낸다). */
    @SuppressWarnings("unchecked")
    static String step(String body) {
        try {
            Object o = ScreenCore.parse(body);
            if (!(o instanceof Map)) return null;
            Map<String, Object> out = RideStandbyJ.rideStandby((Map<String, Object>) o);
            return HomeSearchCore.toJson(out);
        } catch (ScreenCore.ParseError e) { return null; }
        catch (RuntimeException e) { return null; }
    }

    /** 이 걸음이 시각표(서버)를 한 번 읽어야 하는 [탑승] 손짓인가 — 최초 탑승 판정. 그 밖의 걸음은 전부 폰 안에서 끝난다. */
    @SuppressWarnings("unchecked")
    static boolean needsTable(String body) {
        if (body == null || body.indexOf("\"act\":\"press\"") < 0) return false;      // 거의 모든 걸음은 여기서 바로 false
        try {
            Object o = ScreenCore.parse(body);
            return o instanceof Map && RideStandbyJ.pressQuery((Map<String, Object>) o) != null;
        } catch (ScreenCore.ParseError e) { return false; }
        catch (RuntimeException e) { return false; }
    }

    /**
     * 하차 추천 문구를 탑승 전에 한 번 받아 둘 본문(/reco-text) — 지금 걸음의 요청·응답에서 만든다. 받을 때가 아니면 "".
     * 받을 때 = 아직 승차역에서 기다리는 중(state.wait)이거나 안내 시작 직후(steps ≤ 3). 시간대가 아니면(slot none) 받지 않는다.
     */
    @SuppressWarnings("unchecked")
    static String prefetchBody(String reqBody, String resp) {
        try {
            Object ro = ScreenCore.parse(resp), qo = ScreenCore.parse(reqBody);
            if (!(ro instanceof Map) || !(qo instanceof Map)) return "";
            Map<String, Object> r = (Map<String, Object>) ro, q = (Map<String, Object>) qo, st = RideJs.m(r.get("state")), rc = RideJs.m(r.get("reco"));
            if (st == null || rc == null || !RideJs.fin(rc.get("remSec")) || "none".equals(rc.get("slot")) || rc.get("slot") == null) return "";
            if (st.get("wait") == null && RideJs.num(st.get("steps")) > 3) return "";
            Map<String, Object> cfg = RideJs.m(st.get("cfg")), dest = null;
            List<Object> targets = cfg == null ? null : RideJs.l(cfg.get("targets"));
            if (targets != null) for (Object t : targets) if ("dest".equals(RideJs.g(t, "kind"))) { dest = RideJs.m(t); break; }
            if (dest == null) return "";
            double dn = RideJs.num(dest.get("nodeIdx")), now = RideJs.num(q.get("nowMs"));
            Object loc = null;
            List<Object> stops = RideJs.l(st.get("stops"));
            if (stops != null) for (Object s : stops) if (RideJs.g(s, "i") != null && RideJs.num(RideJs.g(s, "i")) == dn) { loc = s; break; }
            if (loc == null || !RideJs.fin(now)) return "";
            long arr = (long) (now + RideJs.num(rc.get("remSec")) * 1000);
            String name = RideJs.str(rc.get("dest"));
            StringBuilder b = new StringBuilder("{\"arrMs\":").append(arr).append(",\"nowMs\":").append((long) now);
            b.append(",\"dest\":").append(ShellCore.q(name)).append(",\"seed\":").append(Math.abs(arr / 1000L) % 2147483647L);
            b.append(",\"loc\":{\"lat\":").append(RideJs.num(RideJs.g(loc, "lat"))).append(",\"lng\":").append(RideJs.num(RideJs.g(loc, "lng")));
            return b.append("},\"foodPref\":\"server\",\"aiCopy\":1,\"pickShop\":1}").toString();
        } catch (ScreenCore.ParseError e) { return ""; }
        catch (RuntimeException e) { return ""; }
    }

    /**
     * 탑승 전에 받아 둔 추천 글(cacheBody 를 보낼 때의 도착 시각 → 응답 cacheResp)이 지금 터진 추천(fireBody)에 쓸 만한가 —
     * 시간대(아침·점심·저녁·쇼핑)가 같고 도착지 이름이 같을 때만. 다르면 보내지 않는다(틀린 시간대 문구보다 안 보내는 게 낫다).
     */
    @SuppressWarnings("unchecked")
    static boolean cacheMatches(String cacheBody, String fireBody) {
        try {
            Object c = ScreenCore.parse(cacheBody), f = ScreenCore.parse(fireBody);
            if (!(c instanceof Map) || !(f instanceof Map)) return false;
            Map<String, Object> cm = (Map<String, Object>) c, fm = (Map<String, Object>) f;
            double ca = RideJs.num(cm.get("arrMs")), fa = RideJs.num(fm.get("arrMs"));
            if (!RideJs.fin(ca) || !RideJs.fin(fa)) return false;
            return RideStandbyJ.arrSlot(ca).equals(RideStandbyJ.arrSlot(fa)) && RideStandbyJ.arrIsDinner(ca) == RideStandbyJ.arrIsDinner(fa)
                && RideJs.str(cm.get("dest")).equals(RideJs.str(fm.get("dest")));
        } catch (ScreenCore.ParseError e) { return false; }
        catch (RuntimeException e) { return false; }
    }
}
