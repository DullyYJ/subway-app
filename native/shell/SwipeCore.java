package com.dullyyj.subway;

import java.util.Map;

/**
 * 좌우 밀기를 이어 넘기는 기억(순수 Java). 어디로 넘길지는 엔진이 화면에 담은 표(sw.t: 칸 → {왼쪽, 오른쪽})가 정하고,
 * 앱은 '지금 고른 칸'으로 그 표를 찾아보기만 한다 — 계산 없음.
 *
 * 왜 필요한가: 다음 카테고리 화면이 아직 오지 않으면 화면에는 옛 칸의 화면(또는 뼈대)이 남는다.
 * 그 화면의 sw 는 옛 칸 기준이라 다시 밀어도 같은 칸을 또 요청할 뿐이었다(밀어도 안 넘어가는 것처럼 보임).
 * 밀거나 칩을 누를 때마다 '고른 칸'을 적어 두고, 표에서 그 칸의 다음 행동을 쓴다. 화면이 오면 그 화면의 칸으로 맞춘다.
 */
final class SwipeCore {
    private Map<String, ScreenCore.Act[]> tbl;
    private String tblId = "", tblTab = "", cur = "";

    /** 화면이 바뀌었을 때(밀기 직전에 한 번 읽는다). 표가 있으면 그 화면의 표·칸으로 맞추고, 표 없는 sw 화면이면 표를 버린다. 뼈대·오류 화면(sw 없음)은 앞의 표를 그대로 둔다. */
    void onScreen(ScreenCore.Screen sc, String tab) { onScreen(sc, tab, ""); }

    /**
     * want: 앱이 지금 진짜로 골라 둔 칸(커뮤니티는 고른 방). 늦게 도착한 옛 방 화면(sw.k 가 want 와 다름)은 '지금 칸'을 되돌리지 못하게 무시하고,
     * 표에 want 가 있으면 지금 칸을 want 로 맞춘다(옛 화면이 칸을 옛 방으로 되돌려 방이 제멋대로 오가던 문제 · s286). want 가 비면 예전과 같다.
     */
    void onScreen(ScreenCore.Screen sc, String tab, String want) {
        if (sc == null) return;
        if (want != null && want.length() > 0 && sc.swK != null && sc.swK.length() > 0 && !want.equals(sc.swK)) {
            if (tbl != null && tbl.containsKey(want)) cur = want;
            return;
        }
        if (sc.swT != null && !sc.swT.isEmpty()) { tbl = sc.swT; tblId = sc.id == null ? "" : sc.id; tblTab = tab == null ? "" : tab; cur = sc.swK == null ? "" : sc.swK; return; }
        if (sc.swL != null || sc.swR != null) { tbl = null; cur = ""; }
    }

    /**
     * 밀려는 쪽(dir -1 = 왼쪽으로 밀기 · +1 = 오른쪽으로 밀기)의 행동. 표를 쓸 수 없으면 null(그 화면 자체의 sw 를 쓴다).
     * expId: 지금 이 칸에 와야 할 화면의 id(다른 화면의 표를 쓰지 않으려고 맞춰 본다).
     */
    ScreenCore.Act pick(int dir, String tab, String expId) {
        if (tbl == null || cur.length() == 0 || tab == null || !tab.equals(tblTab) || expId == null || !expId.equals(tblId)) return null;
        ScreenCore.Act[] e = tbl.get(cur);
        return e == null ? null : (dir == -1 ? e[0] : e[1]);
    }

    /** 행동을 실행했다(밀기 · 칩 누르기): 그 행동의 칸이 표에 있으면 지금 고른 칸으로 적는다. */
    void note(ScreenCore.Act a) {
        if (tbl == null || a == null || a.v == null) return;
        if ("cat".equals(a.a) && tbl.containsKey(a.v)) cur = a.v;
        else if ("call".equals(a.a) && a.v.startsWith("rh.tab.") && tbl.containsKey(a.v.substring(7))) cur = a.v.substring(7);      // 경로 결과 카드: 탭 이름이 칸 이름
    }

    String current() { return cur; }
}
