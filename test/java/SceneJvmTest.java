package com.dullyyj.subway;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;

/**
 * 네이티브 장면(SceneCore) 시험 도구 — 안드로이드 없이 JVM 에서 같은 코드를 돌린다.
 *   java SceneJvmTest check <scenarioDir>     : 엔진이 만든 /scene JSON(scn_*.json)을 먹여 동작·착지·꾹 눌러 옮기기·결정성을 점검
 *   java SceneJvmTest render <sheetsDir> <out.png> <res.json> <W> <H> <seed> <seconds> <dark|light> [play <id> <act> | drop <id> <h> | none]
 *     웹 화면과 같은 난수열(mulberry)로 한 장을 그려 PNG 로 저장 → 브라우저가 그린 그림과 비교한다.
 */
public class SceneJvmTest {
    static int fails = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (!c) fails++; }

    static class TestHost implements SceneCore.Host {
        final Map<String, SceneCv.Img> sheets = new HashMap<>(); SceneCv.Img intro; final List<String> hap = new ArrayList<>(); int held;
        public SceneCv.Img sheet(String id) { return sheets.get(id); }
        public SceneCv.Img intro() { return intro; }
        public boolean ready() { return true; }
        public void haptic(String n) { hap.add(n); }
        public void held() { held++; }
    }
    static BufferedImage blank() { return new BufferedImage(1024, 1024, BufferedImage.TYPE_INT_ARGB); }
    static TestHost fakeHost() {
        TestHost h = new TestHost();
        for (String id : SceneModel.ORDER) h.sheets.put(id, new AwtCv.Img(blank()));
        h.intro = new AwtCv.Img(blank()); return h;
    }
    static SceneCv factory() { return new AwtCv(new BufferedImage(4, 4, BufferedImage.TYPE_INT_ARGB).createGraphics()); }
    static SceneCore core(TestHost h, int seed) { return new SceneCore(h, factory(), new SceneUtil.Seeded(seed)); }
    static String read(File f) throws Exception { return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8); }
    static void adv(SceneCore c, double sec) { int n = (int) Math.round(sec * 60); for (int i = 0; i < n; i++) c.update(1.0 / 60); }
    static BufferedImage canvasImg(int w, int h) { return new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB); }
    static void draw(SceneCore c, BufferedImage im) { Graphics2D g = im.createGraphics(); AwtCv cv = new AwtCv(g); c.render(cv); g.dispose(); }

    public static void main(String[] a) throws Exception {
        System.setProperty("java.awt.headless", "true");
        if (a.length > 0 && a[0].equals("render")) { render(a); return; }
        check(new File(a.length > 1 ? a[1] : "."));
        System.out.println(fails == 0 ? "ALL OK" : ("FAILED " + fails));
        System.exit(fails == 0 ? 0 : 1);
    }

    // ═══ 그림 한 장 ═══
    static void render(String[] a) throws Exception {
        File sheets = new File(a[1]), out = new File(a[2]); SceneModel.Res res = SceneModel.parse(read(new File(a[3])));
        int W = Integer.parseInt(a[4]), H = Integer.parseInt(a[5]), seed = Integer.parseInt(a[6]); double sec = Double.parseDouble(a[7]); boolean dark = a[8].equals("dark");
        TestHost h = new TestHost();
        for (String id : SceneModel.ORDER) { File f = new File(sheets, id + ".png"); if (f.exists()) h.sheets.put(id, new AwtCv.Img(ImageIO.read(f))); }
        File fi = new File(sheets, "dudung_intro.png"); if (fi.exists()) h.intro = new AwtCv.Img(ImageIO.read(fi));
        SceneCore c = core(h, seed);
        c.layout(W, H, 1.0, dark); c.apply(res);
        if (a.length > 11 && a[9].equals("play")) c.debugPlay(a[10], a[11], true);
        if (a.length > 11 && a[9].equals("drop")) c.debugDrop(a[10], Double.parseDouble(a[11]), true);
        c.debugTick(sec);
        BufferedImage im = canvasImg(W, H); draw(c, im); ImageIO.write(im, "png", out);
        System.out.println("rendered " + c.debugInfo());
    }

    // ═══ 점검 ═══
    static final String[] CHARS = SceneModel.ORDER;

    static void check(File dir) throws Exception {
        File[] files = dir.listFiles((d, n) -> n.startsWith("scn_") && n.endsWith(".json")); Arrays.sort(files);
        ok(files != null && files.length >= 6, "엔진이 만든 장면 JSON 이 충분하다: " + (files == null ? 0 : files.length));
        Map<String, SceneModel.Res> scn = new HashMap<>();
        for (File f : files) scn.put(f.getName().replace(".json", ""), SceneModel.parse(read(f)));

        // 1) 모든 장면을 60초 돌려도 오류가 없고 배우가 화면 안에 있다 (작은 폰 360x740 화면 높이/좁은 칸 포함)
        double[][] sizes = {{340, 190}, {300, 150}, {336, 300}, {360, 120}, {412, 260}};
        for (Map.Entry<String, SceneModel.Res> e : scn.entrySet()) {
            for (double[] sz : sizes) {
                TestHost h = fakeHost(); SceneCore c = core(h, 7);
                c.layout(sz[0], sz[1], 2.75, true); boolean on = c.apply(e.getValue());
                boolean shown = e.getValue().mode != null;
                ok(on == shown, e.getKey() + " " + (int) sz[0] + "x" + (int) sz[1] + ": mode=" + e.getValue().mode + " → running=" + on);
                if (!shown) continue;
                BufferedImage im = canvasImg((int) (sz[0] * 2.75), (int) (sz[1] * 2.75));
                boolean fine = true; String why = "";
                for (int i = 0; i < 60 * 15; i++) {
                    c.update(1.0 / 15);
                    if (i % 45 == 0) { draw(c, im); }
                    if (c.error != null) { fine = false; why = c.error; break; }
                    for (SceneCore.Actor ac : c.actors) if (ac.x < -ac.w * 1.3 - 2 || ac.x > c.W + ac.w * 1.3 + 2 || Double.isNaN(ac.x) || Double.isNaN(ac.z)) { fine = false; why = ac.id + " x=" + ac.x + " z=" + ac.z; break; }
                    if (!fine) break;
                }
                ok(fine, e.getKey() + " " + (int) sz[0] + "x" + (int) sz[1] + " 60초: 오류·화면 밖 없음 " + why);
            }
        }

        // 2) 엔진 대본대로: 캐릭터마다 엔진이 준 동작 이름을 모두 실행 → 끝나면 다음으로 넘어간다 (앱이 고르지 않는다)
        SceneModel.Res idle = scn.get("scn_idle_noon_clear");
        for (String id : CHARS) {
            SceneModel.Traits T = idle.traits.get(id);
            ok(T != null && !T.acts.isEmpty() && !T.land.isEmpty(), id + ": 엔진이 동작 대본(" + (T == null ? "-" : T.acts) + ")·착지 연출(" + (T == null ? "-" : T.land) + ")을 줬다");
            if (T == null) continue;
            for (String act : T.acts) {
                if (act.equals("walk") || act.equals("hop") || act.equals("spin") || act.equals("rest")) continue;
                TestHost h = fakeHost(); SceneCore c = core(h, 11); c.layout(340, 190, 2.75, true); c.apply(idle);
                boolean exists = c.ACT.containsKey(act);
                ok(exists, id + ": 동작 '" + act + "' 그림 구현이 있다");
                if (!exists) continue;
                c.debugPlay(id, act, true);
                SceneCore.Actor ac = c.actors.get(0);
                SceneCore.AS first = ac.act; java.util.Set<String> saw = new java.util.HashSet<>(); boolean fine = true;
                double dur = c.ACT.get(act).dur;
                for (int i = 0; i < (int) ((dur + 1.5) * 30); i++) {
                    c.update(1.0 / 30);
                    if (ac.act != null) saw.add(ac.act.n);
                    if (c.error != null || Double.isNaN(ac.x) || Double.isNaN(ac.y) || Double.isNaN(ac.ang)) { fine = false; break; }
                }
                BufferedImage im = canvasImg(340 * 2, 190 * 2); draw(c, im);
                ok(fine && c.error == null && first != null && saw.contains(act), id + ": 동작 '" + act + "' 정상 실행(" + saw + ") " + (c.error == null ? "" : c.error));
                ok(ac.act != first, id + ": '" + act + "' 끝난 뒤 엔진 대본의 다음 동작으로 넘어간다(" + c.debugInfo().split("#")[3] + ")");
                ok(ac.sx == 1 || ac.act != null, id + ": '" + act + "' 이 몸 늘림을 되돌려 놓는다 sx=" + ac.sx);
            }
        }

        // 3) 잡았다 놓기: 캐릭터별 착지 연출 + 진동
        String[][] expect = {{"dolsom", "cotton"}, {"ppopu", "pose"}, {"dudung", "dig"}, {"lovel", "flip"}, {"sul", "fly"}, {"chaeng", "puddle"}};
        for (String[] ex : expect) {
            ok(idle.traits.get(ex[0]).land.equals(ex[1]), ex[0] + ": 엔진의 착지 연출 = " + ex[1]);
            TestHost h = fakeHost(); SceneCore c = core(h, 5); c.layout(340, 190, 2.75, true); c.apply(idle);
            c.debugDrop(ex[0], 90, true);
            SceneCore.Actor ac = c.actors.get(0);
            boolean sawFall = ac.st.equals("fall") || ac.st.equals("act"); boolean sawLand = false, fine = true; double minSx = 9, maxSx = 0, maxAng = 0;
            for (int i = 0; i < 30 * 9; i++) {
                c.update(1.0 / 30);
                if (ac.act != null && ac.act.n.startsWith("L_")) sawLand = true;
                if (ex[1].equals("fly") && ac.act != null && ac.act.n.equals("flyaway")) sawLand = true;
                minSx = Math.min(minSx, ac.sx); maxSx = Math.max(maxSx, ac.sx); maxAng = Math.max(maxAng, Math.abs(ac.ang));
                if (c.error != null) { fine = false; break; }
            }
            ok(fine && sawLand, ex[0] + "(" + ex[1] + "): 놓으면 착지 연출이 시작된다 " + c.debugInfo().split("#")[3]);
            ok(!ac.st.equals("fall") && !ac.st.equals("held") && Math.abs(ac.y) < 30 && ac.alt >= 0 && ac.vis, ex[0] + ": 9초 뒤엔 내려앉아 평소 동작으로 돌아왔다(st=" + ac.st + ", y=" + ac.y + ")");
            String want = ex[1].equals("fly") ? "land_fly" : "land_" + ex[1];
            ok(h.hap.contains("release") && h.hap.contains(want), ex[0] + ": 진동 " + h.hap);
            if (ex[1].equals("flip")) ok(maxAng > 5.5, "고양이: 공중에서 한 바퀴(최대 각도 " + maxAng + ")");
            if (ex[1].equals("cotton")) ok(h.hap.contains("hearts"), "하얀 강아지: 하트 진동");
            if (ex[1].equals("dig")) ok(h.hap.contains("thud") && h.hap.contains("angry"), "두더지: 땅 파고 들어가는 진동 → 나와서 화내는 진동 " + h.hap);
            if (ex[1].equals("puddle")) ok(h.hap.contains("splash"), "올챙이: 첨벙 진동");
        }
        // 3-b) 하얀 강아지는 다른 그림 없이 몸이 자연스럽게 부풀었다 돌아온다
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 5); c.layout(340, 190, 2.75, true); c.apply(idle); c.debugDrop("dolsom", 90, true);
            SceneCore.Actor ac = c.actors.get(0); double mx = 0; boolean overlay = false;
            for (int i = 0; i < 30 * 5; i++) { c.update(1.0 / 30); mx = Math.max(mx, ac.sx); if (ac.pr != null) for (SceneCore.Prop p : ac.pr) if (p.k.equals("cotton")) overlay = true; }
            ok(mx > 1.25 && mx < 1.42 && Math.abs(ac.sx - 1) < 1e-9 && !overlay, "솜사탕: 몸이 1.34배까지 커졌다 원래 크기(" + ac.sx + ")로 돌아온다(덧그림 없음) 최대=" + mx);
        }

        // 4) 꾹 눌러 옮기기(터치): 380ms · 10dp 안에서만 · 잡히면 웹뷰 터치 취소 요청 · 놓으면 떨어지고 바로 움직인다
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 3); c.layout(340, 190, 2.75, true); c.apply(idle);
            c.debugPlay("ppopu", "walk", true); adv(c, .2);
            SceneCore.Actor ac = c.actors.get(0); c.update(1.0 / 30);
            double ax = ac.x * c.k, ay = (c.zy(ac.z) - 20) * c.k;
            ok(c.down(ax, ay), "캐릭터 몸 위에서 손가락이 닿으면 길게 누르기를 기다린다");
            adv(c, .2); ok(!c.isHeld() && c.isPending(), "0.2초: 아직 안 잡힘(화면 스크롤과 구분)");
            adv(c, .25); ok(c.isHeld() && h.held == 1 && h.hap.contains("grab"), "0.45초: 잡혔다 + 웹뷰 터치 취소 요청 + 진동(grab)");
            c.move(100, 60); for (int i = 0; i < 30; i++) c.update(1.0 / 60);
            ok(Math.abs(ac.x * c.k - 100) < 12, "손가락을 따라간다(x=" + Math.round(ac.x * c.k) + ")");
            ok(ac.y < -6, "손가락 위로 떠 있다(y=" + ac.y + ")");
            c.up(); ok(!c.isHeld() && ac.st.equals("fall"), "놓으면 떨어진다(" + ac.st + ")");
            boolean moving = false; for (int i = 0; i < 30 * 4; i++) { c.update(1.0 / 30); if (ac.st.equals("walk") || ac.st.equals("act") || ac.st.equals("hop") || ac.st.equals("spin")) { moving = true; break; } }
            ok(moving, "착지하자마자 움직인다(" + ac.st + ")");
        }
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 3); c.layout(340, 190, 2.75, true); c.apply(idle);
            c.debugPlay("lovel", "walk", true); adv(c, .2); SceneCore.Actor ac = c.actors.get(0);
            ok(c.down(ac.x * c.k, (c.zy(ac.z) - 20) * c.k), "닿음");
            adv(c, .1); c.move(ac.x * c.k + 25, (c.zy(ac.z) - 20) * c.k); adv(c, .5);
            ok(!c.isHeld() && !c.isPending() && h.held == 0, "길게 누르기 전에 10dp 넘게 움직이면 잡히지 않는다(= 웹뷰가 스크롤한다)");
            ok(!c.down(2, 2), "빈 곳은 잡히지 않는다 → 터치가 그대로 웹뷰로 간다");
        }
        // 5) 같은 난수 → 같은 결과(결정성)
        {
            String s1 = "", s2 = "";
            for (int k = 0; k < 2; k++) {
                TestHost h = fakeHost(); SceneCore c = core(h, 99); c.layout(340, 190, 2.75, true); c.apply(scn.get("scn_idle_noon_clear")); c.debugTick(40);
                if (k == 0) s1 = c.debugInfo(); else s2 = c.debugInfo();
            }
            ok(s1.equals(s2), "같은 난수면 같은 장면(결정적)");
        }
        // 6) 엔진이 대표 캐릭터·장면을 안 주면 앱이 대신 고르지 않는다
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 1); c.layout(340, 190, 2.75, true);
            SceneModel.Res r = SceneModel.parse("{\"ok\":true,\"mode\":\"wait\",\"venue\":\"bus\",\"hero\":null,\"cast\":[],\"look\":{\"slot\":\"noon\",\"wk\":\"clear\",\"season\":\"autumn\"},\"traits\":{}}");
            c.apply(r); c.debugTick(30);
            ok(c.mode().equals("idle") && c.actors.isEmpty(), "대표 캐릭터가 없으면 캐릭터 없이 배경만(앱이 대신 고르지 않음): " + c.mode() + " " + c.actors.size());
            ok(!c.apply(SceneModel.parse("{\"ok\":true,\"mode\":null,\"look\":{\"slot\":\"noon\"}}")) && !c.isRunning(), "mode 가 없으면 장면을 멈춘다");
        }
        // 7) 장면이 바뀔 때 옛 장면이 서서히 사라진다
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 1); c.layout(340, 190, 2.75, true);
            c.apply(scn.get("scn_idle_noon_clear")); c.debugTick(2); c.apply(scn.get("scn_wait_bus_rain"));
            ok(c.fade() > .9 && c.prevLayer() != null && c.mode().equals("wait"), "장면 전환: 옛 장면 한 장이 남고 서서히 사라진다 fade=" + c.fade());
            c.debugTick(1); ok(c.fade() == 0, "0.45초 뒤 사라진다");
        }
        // 8) 진동 무늬표: 코어가 알리는 이름마다 무늬가 있고 모양이 올바르다
        for (String n : SceneHaptics.names()) { String e = SceneHaptics.check(n); ok(e == null, "진동 무늬 " + n + (e == null ? "" : " — " + e)); }
        for (String n : new String[]{"grab", "release", "land", "land_cotton", "land_pose", "land_dig", "land_flip", "land_fly", "land_puddle", "flap", "hearts", "thud", "angry", "splash", "grin"})
            ok(SceneHaptics.get(n) != null, "진동 이름 '" + n + "' 에 무늬가 있다");
        ok(SceneHaptics.get("없는이름") == null && SceneHaptics.get(null) == null, "모르는 이름은 울리지 않는다");
        // 9) 주사율 정책: 손가락·착륙 연출 중에만 interactive(= 끝까지 120Hz), 평소엔 아님
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 3); c.layout(340, 190, 2.75, true); c.apply(idle);
            c.debugPlay("lovel", "walk", true); adv(c, .2); SceneCore.Actor ac = c.actors.get(0);
            ok(!c.interactive(), "평소엔 interactive 가 아니다(60Hz 로 아낀다)");
            c.down(ac.x * c.k, (c.zy(ac.z) - 20) * c.k); ok(c.interactive(), "손가락이 닿으면 interactive");
            adv(c, .5); ok(c.isHeld() && c.interactive(), "잡고 있는 동안 interactive");
            c.up(); ok(c.interactive(), "놓은 직후(떨어짐·착륙 연출)도 interactive");
            adv(c, 8); ok(!c.interactive(), "착륙 연출이 끝나면 다시 평소(60Hz)");
        }
        // 10) 호스트 칸 바탕: 웹에서 CSS 가 하던 연파랑 바탕·둥근 모서리를 코어가 직접 그린다 — 장면이 안 그리는 모서리는 투명
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 3); c.layout(340, 190, 1.0, false); c.apply(scn.get("scn_ride_bus"));
            c.debugTick(1); BufferedImage im = canvasImg(340, 190); draw(c, im);
            ok(((im.getRGB(0, 0) >>> 24) & 255) < 40, "둥근 모서리 바깥은 투명(웹의 border-radius 와 같다)");
            ok(((im.getRGB(170, 6) >>> 24) & 255) > 200, "탈 때 화면 가장자리도 바탕색으로 채워진다");
        }
    }
}
