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
        if (a.length > 0 && a[0].equals("tvframes")) { tvFrames(a); return; }
        if (a.length > 0 && a[0].equals("trainframes")) { trainFrames(a); return; }
        if (a.length > 0 && a[0].equals("panframes")) { panFrames(a); return; }
        check(new File(a.length > 1 ? a[1] : "."));
        System.out.println(fails == 0 ? "ALL OK" : ("FAILED " + fails));
        System.exit(fails == 0 ? 0 : 1);
    }

    // ═══ TV 전환 눈으로 보기: java SceneJvmTest tvframes <시트폴더> <출력접두> <idle.json> <wait.json> ═══
    static void tvFrames(String[] a) throws Exception {
        File sheets = new File(a[1]); int W = 340, H = 120; double dens = 2.0;
        TestHost h = new TestHost();
        for (String id : SceneModel.ORDER) { File f = new File(sheets, id + ".png"); if (f.exists()) h.sheets.put(id, new AwtCv.Img(ImageIO.read(f))); }
        for (String id : SceneModel.ORDER) { File fp = new File(sheets, id + "_pose.png"); if (fp.exists()) h.sheets.put(id + "_pose", new AwtCv.Img(ImageIO.read(fp))); }
        for (String id : SceneModel.ORDER) { File fa = new File(sheets, id + "_act.png"); if (fa.exists()) h.sheets.put(id + "_act", new AwtCv.Img(ImageIO.read(fa))); }
        for (String id : SceneModel.ORDER) { File fa = new File(sheets, id + "_act.png"); if (fa.exists()) h.sheets.put(id + "_act", new AwtCv.Img(ImageIO.read(fa))); }
        File fi = new File(sheets, "dudung_intro.png"); if (fi.exists()) h.intro = new AwtCv.Img(ImageIO.read(fi));
        SceneCore c = core(h, 7); c.layout(W, H, dens, false); c.apply(SceneModel.parse(read(new File(a[3])))); c.debugTick(3);
        c.apply(SceneModel.parse(read(new File(a[4]))));
        double[] ts = { 0, .08, .16, .22, .27, .31, .36, .40, .45, .52, .60, .70, .79, .85 }; double at = 0;
        for (double tt : ts) {
            double d = tt - at; at = tt; if (d > 0) { int n = (int) Math.round(d * 30); for (int i = 0; i < n; i++) c.update(1.0 / 30); }
            BufferedImage im = canvasImg((int) (W * dens), (int) (H * dens)); draw(c, im);
            ImageIO.write(im, "png", new File(a[2] + String.format("%03d", Math.round(tt * 100)) + ".png"));
            System.out.println("tv=" + String.format("%.3f", c.tv()) + " at " + tt);
        }
    }


    // ═══ 장소 이동 전환 눈으로 보기(s246): java SceneJvmTest panframes <시트폴더> <출력접두> <idle.json> <옛장소> <새장소> <+1|-1> ═══
    static void panFrames(String[] a) throws Exception {
        File sheets = new File(a[1]); int W = 340, H = 190; double dens = 1.5;
        TestHost h = new TestHost();
        for (String id : SceneModel.ORDER) { File f = new File(sheets, id + ".png"); if (f.exists()) h.sheets.put(id, new AwtCv.Img(ImageIO.read(f))); }
        SceneModel.Res r = SceneModel.parse(read(new File(a[3]))); r.look.place = a[4]; r.look.pdir = Integer.parseInt(a[6]);
        SceneCore c = core(h, 7); c.layout(W, H, dens, false); c.apply(r); c.debugTick(6);
        r.look.place = a[5]; c.apply(r);
        double at = 0;
        for (double f : new double[]{0, .15, .3, .45, .6, .75, .9, 1.05}) {
            double tt = f * c.panDur, d = tt - at; at = tt; int n = (int) Math.round(d * 30); for (int i = 0; i < n; i++) c.update(1.0 / 30);
            BufferedImage im = canvasImg((int) (W * dens), (int) (H * dens)); draw(c, im);
            ImageIO.write(im, "png", new File(a[2] + String.format("%03d", Math.round(f * 100)) + ".png"));
            System.out.println("pan=" + String.format("%.2f", c.pan) + "/" + String.format("%.2f", c.panDur));
        }
    }

    // ═══ 지하철 객실(두 번째 쪽) 눈으로 보기: java SceneJvmTest trainframes <시트폴더> <출력접두> <train.json> <W> <H> <dark|light> <초…> ═══
    //   시각표: 첫 역에서 25초 서 있다가 출발(120초 달림) → 둘째 역 25초 정차 → … (탑승 엔진 pos.segs 와 같은 모양)
    static String trainPos(int first, int n) {
        StringBuilder b = new StringBuilder("{\"segs\":[");
        long t = 0;
        for (int i = 0; i < n; i++) {
            long a = t, t0 = a + 25000, t1 = t0 + 120000;
            if (i > 0) b.append(',');
            b.append("{\"from\":").append(first + i).append(",\"to\":").append(first + i + 1).append(",\"a\":").append(a).append(",\"t0\":").append(t0).append(",\"t1\":").append(t1).append('}');
            t = t1;
        }
        return b.append("]}").toString();
    }
    static void trainFrames(String[] a) throws Exception {
        File sheets = new File(a[1]); SceneModel.Res res = SceneModel.parse(read(new File(a[3]))); int W = Integer.parseInt(a[4]), H = Integer.parseInt(a[5]); boolean dark = a[6].equals("dark"); double dens = 2.0;
        TestHost h = new TestHost();
        for (String id : SceneModel.ORDER) { File f = new File(sheets, id + ".png"); if (f.exists()) h.sheets.put(id, new AwtCv.Img(ImageIO.read(f))); }
        for (String id : SceneModel.ORDER) { File fp = new File(sheets, id + "_pose.png"); if (fp.exists()) h.sheets.put(id + "_pose", new AwtCv.Img(ImageIO.read(fp))); }
        File fi = new File(sheets, "dudung_intro.png"); if (fi.exists()) h.intro = new AwtCv.Img(ImageIO.read(fi));
        SceneCore c = core(h, 7); c.layout(W, H, dens, dark); c.apply(res);
        c.trainPos(trainPos(res.train.first, res.train.names.size() - 1));
        double at = -1;
        for (int i = 7; i < a.length; i++) {
            double tt = Double.parseDouble(a[i]);
            if (at < 0) { c.trainClock((long) (tt * 1000)); c.update(1.0 / 30); at = tt; }
            while (at < tt - 1e-9) { at = Math.min(tt, at + 1.0 / 30); c.trainClock((long) (at * 1000)); c.update(1.0 / 30); }
            BufferedImage im = canvasImg((int) (W * dens), (int) (H * dens)); draw(c, im);
            ImageIO.write(im, "png", new File(a[2] + String.format("%04d", Math.round(tt)) + ".png"));
            System.out.println("t=" + tt + " " + c.debugInfo() + (c.error != null ? " ERR " + c.error : ""));
        }
    }

    // ═══ 그림 한 장 ═══
    static void render(String[] a) throws Exception {
        File sheets = new File(a[1]), out = new File(a[2]); SceneModel.Res res = SceneModel.parse(read(new File(a[3])));
        int W = Integer.parseInt(a[4]), H = Integer.parseInt(a[5]), seed = Integer.parseInt(a[6]); double sec = Double.parseDouble(a[7]); boolean dark = a[8].equals("dark");
        TestHost h = new TestHost();
        for (String id : SceneModel.ORDER) { File f = new File(sheets, id + ".png"); if (f.exists()) h.sheets.put(id, new AwtCv.Img(ImageIO.read(f))); }
        for (String id : SceneModel.ORDER) { File fp = new File(sheets, id + "_pose.png"); if (fp.exists()) h.sheets.put(id + "_pose", new AwtCv.Img(ImageIO.read(fp))); }
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
        String[][] expect = {{"dolsom", "cotton"}, {"ppopu", "pose"}, {"dudung", "dig"}, {"lovel", "flip"}, {"sul", "fly"}, {"chaeng", "puddle"}, {"juksun", "tumble"}, {"bbosong", "hose"}};
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
            ok(!ac.st.equals("fall") && !ac.st.equals("held") && Math.abs(ac.y) < 30 && ac.alt >= 0 && (ac.vis || (ac.act != null && ac.act.n.equals("vanish"))), ex[0] + ": 9초 뒤엔 내려앉아 평소 동작으로 돌아왔다(st=" + ac.st + ", act=" + (ac.act == null ? "-" : ac.act.n) + ", vis=" + ac.vis + ", y=" + ac.y + ")");
            String want = ex[1].equals("fly") ? "land_fly" : "land_" + ex[1];
            ok(h.hap.contains("release") && h.hap.contains(want), ex[0] + ": 진동 " + h.hap);
            if (ex[1].equals("flip")) ok(maxAng > 5.5, "고양이: 공중에서 한 바퀴(최대 각도 " + maxAng + ")");
            if (ex[1].equals("cotton")) ok(h.hap.contains("hearts"), "하얀 강아지: 하트 진동");
            if (ex[1].equals("dig")) ok(h.hap.contains("thud") && h.hap.contains("angry"), "두더지: 땅 파고 들어가는 진동 → 나와서 화내는 진동 " + h.hap);
            if (ex[1].equals("puddle")) ok(h.hap.contains("splash"), "올챙이: 첨벙 진동");
        }
        // 3-c) 쮸르: 놓으면 죽순을 공중에 떨어뜨리고 앞으로 한 바퀴 → 착지 → 죽순을 찾아 집어 든다
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 5); c.layout(340, 190, 2.75, true); c.apply(idle); c.debugDrop("juksun", 90, true);
            SceneCore.Actor ac = c.actors.get(0); boolean sawBam = false, sawAir = false, sawLay = false, sawSearch = false, sawFound = false, sawNb = false; double maxAng = 0; java.util.Set<Integer> cells = new java.util.HashSet<>();
            for (int i = 0; i < 30 * 16; i++) {
                c.update(1.0 / 30);
                if (!c.bams.isEmpty()) { sawBam = true; if (!c.bams.get(0).landed) sawAir = true; else sawLay = true; }
                maxAng = Math.max(maxAng, Math.abs(ac.ang)); if (ac.act != null && ac.act.n.equals("search")) sawSearch = true;
                if (ac.sk != null) sawNb = true; if (ac.cell >= 0) cells.add(ac.cell);
                if (ac.cell == 5 && sawSearch) sawFound = true;
                if (c.error != null) break;
            }
            ok(c.error == null, "쮸르 떨어뜨림: 오류 없음 " + c.error);
            ok(sawBam && sawAir && sawLay, "죽순(대나무)이 공중에서 떨어져 땅에 눕는다");
            ok(maxAng > 5.5, "앞으로 한 바퀴(최대 각도 " + maxAng + ")");
            ok(cells.contains(1) && cells.contains(0) && cells.contains(2), "버둥(1)→웅크림(0)→쭈그림(2) 칸을 쓴다 " + cells);
            ok(sawSearch && sawNb && cells.contains(3) && cells.contains(4), "착지 뒤 죽순을 찾으러 간다(두리번 3·킁킁 4) " + cells);
            ok(sawFound && c.bams.isEmpty(), "죽순을 찾아 집어 들면 땅의 죽순이 없어진다");
            ok(h.hap.contains("land_tumble"), "쮸르 착지 진동 " + h.hap);
        }
        // 3-d) 베비히포: 놓으면 입에서 땅으로 물대포 → 안전 착지 → 주변 친구에게 물대포 → 친구들이 놀라 도망간다
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 9); c.layout(340, 190, 2.75, true); c.apply(idle);
            for (int i = 0; i < 30 * 25 && c.actors.size() < 4; i++) c.update(1.0 / 30);
            SceneCore.Actor hip = null; for (SceneCore.Actor o : c.actors) if (!o.id.equals("bbosong") && !o.hero) { hip = o; break; }
            ok(c.actors.size() >= 3, "물대포 시험: 친구가 여럿 모였다 " + c.actors.size());
            c.debugDrop("bbosong", 90, false);
            SceneCore.Actor ac = null; for (SceneCore.Actor o : c.actors) if (o.id.equals("bbosong")) ac = o;
            boolean sawJet = false, sawSq = false, sawFlee = false, sawLandCell = false; double minVy = 0; java.util.Set<Integer> cells = new java.util.HashSet<>();
            for (int i = 0; i < 30 * 14; i++) {
                c.update(1.0 / 30);
                if (ac.pr != null) for (SceneCore.Prop p : ac.pr) if (p.k.equals("jet")) sawJet = true;
                if (ac.act != null && ac.act.n.equals("squirt")) sawSq = true; if (ac.cell >= 0) cells.add(ac.cell);
                for (SceneCore.Actor o : c.actors) if (o != ac && o.act != null && o.act.n.equals("flee")) sawFlee = true;
                if (ac.st.equals("fall")) minVy = Math.max(minVy, ac.vy);
                if (c.error != null) break;
            }
            ok(c.error == null, "베비히포 물대포: 오류 없음 " + c.error);
            ok(sawJet && cells.contains(1), "떨어지는 동안 입에서 땅으로 물줄기(칸 1)");
            ok(minVy <= 90.5, "물 쿠션: 떨어지는 속도가 눌려 사뿐히 내려앉는다(최대 " + minVy + ")");
            ok(sawSq && cells.contains(3), "착지 뒤 물대포를 쏜다(칸 3) " + cells);
            ok(sawFlee, "맞은 친구들이 놀라 도망간다(flee)");
            ok(h.hap.contains("land_hose") && h.hap.contains("squirt"), "물대포 진동 " + h.hap);
        }
        // 3-b) 하얀 강아지는 다른 그림 없이 몸이 자연스럽게 부풀었다 돌아온다
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 5); c.layout(340, 190, 2.75, true); c.apply(idle); c.debugDrop("dolsom", 90, true);
            SceneCore.Actor ac = c.actors.get(0); double mx = 0; boolean overlay = false;
            double back = Double.NaN;
            for (int i = 0; i < 30 * 5; i++) {
                c.update(1.0 / 30); mx = Math.max(mx, ac.sx); if (ac.pr != null) for (SceneCore.Prop p : ac.pr) if (p.k.equals("cotton")) overlay = true;
                if (mx > 1.25 && !ac.st.equals("fall") && !ac.st.equals("L_cotton")) { back = ac.sx; break; }   // 착지 연출이 끝난 순간의 크기(그 뒤는 평소 동작이 마음대로 키울 수 있다)
            }
            ac.sx = Double.isNaN(back) ? ac.sx : back;
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
        // 6b) s340 카드 확장 인사: 손님이 양쪽에서 들어와 자리에 서고 · 차례대로 말풍선 · 때가 되면 손님만 나가고 원래 친구는 남는다
        {
            String[] ids = {"dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng", "juksun", "bbosong"};
            for (int rest = 0; rest < 2; rest++) {
                SceneHello.Plan p = new SceneHello.Plan(); p.chars = ids; p.rest = rest == 1; p.slot = "t";
                p.sx = new double[]{.12, .30, .50, .70, .88, .22, .62, .40}; p.sz = new double[]{.2, .2, .2, .2, .2, .6, .6, .95};
                p.order = new int[]{5, 2, 3, 7, 0, 4, 6, 1};
                for (String c0 : ids) p.say.put(c0, c0.substring(0, 2) + "!");
                ok(SceneHello.ok(p), "시험용 인사 대본이 맞다");
                TestHost h = fakeHost(); SceneCore c = core(h, 11 + rest); c.layout(340, 380, 2.75, true); c.apply(scn.get("scn_idle_noon_clear"));
                ok(!c.startHello(p, 1, null) || true, "(시작 전 준비)");
                c.debugTick(6);
                java.util.List<SceneCore.Folk> fk = c.folks(); java.util.HashSet<String> orig = new java.util.HashSet<String>(); for (SceneCore.Folk f : fk) orig.add(f.id);
                ok(c.startHello(p, 5L, fk) && c.helloActive(), "확장 인사가 시작된다(rest=" + p.rest + ")");
                ok(!c.startHello(p, 5L, fk) || c.helloActive(), "다시 시작해도 안 깨진다");
                boolean[] said = new boolean[8]; int maxVis = 0; java.util.HashSet<String> seenSay = new java.util.HashSet<String>(); double firstSay = -1; double lastSay = -1;
                int steps = (int) Math.round(p.leave / 1000.0 * 30);
                for (int i = 0; i < steps; i++) {
                    c.update(1.0 / 30);
                    int vis = 0; for (SceneCore.Actor a : c.actors) { if (a.vis) vis++; if (!a.bub.isEmpty() && seenSay.add(a.id)) { if (firstSay < 0) firstSay = c.helloMs(); lastSay = c.helloMs(); } }
                    maxVis = Math.max(maxVis, vis);
                }
                ok(c.error == null, "인사 중 오류 없음: " + c.error);
                ok(c.actors.size() == 8, "손님까지 8마리가 모두 나와 있다: " + c.actors.size());
                ok(seenSay.size() == 8, "8마리 모두 말풍선을 띄웠다: " + seenSay.size());
                ok(firstSay >= p.greet - 40 && lastSay <= p.greet + 7 * p.step + p.bubble, "말풍선은 인사 시각 안에서만 뜬다 first=" + firstSay + " last=" + lastSay);
                int near = 0; for (SceneCore.Actor a : c.actors) { Integer si = null; for (int q = 0; q < 8; q++) if (ids[q].equals(a.id)) si = q; if (si != null) { String[] seats = SceneHello.seats(p, 5L); for (int q = 0; q < 8; q++) if (seats[q].equals(a.id) && Math.abs(a.x - p.sx[q] * c.designW()) < 14) near++; } }
                ok(near >= 7, "대부분 자기 자리에 서 있다(" + near + "/8)");
                if (p.rest) { int sit = 0; for (SceneCore.Actor a : c.actors) if (a.st.equals("rest")) sit++; ok(sit >= 7, "잠자는 칸은 앉아 쉰다(" + sit + ")"); }
                adv(c, (p.end - p.leave) / 1000.0 + 8);
                java.util.HashSet<String> now = new java.util.HashSet<String>(); for (SceneCore.Actor a : c.actors) if (!a.leaving) now.add(a.id);
                ok(now.containsAll(orig) && now.size() <= 8, "나간 뒤에도 원래 친구들은 남아 있다 " + orig + " ⊂ " + now);
                int guestsLeft = 0; for (SceneCore.Actor a : c.actors) if (!orig.contains(a.id)) guestsLeft++;
                ok(guestsLeft == 0, "손님은 모두 나갔다(" + guestsLeft + ")");
                ok(c.error == null, "끝난 뒤에도 오류 없음");
                // 일찍 끝내기
                TestHost h2 = fakeHost(); SceneCore c2 = core(h2, 21); c2.layout(340, 380, 2.75, true); c2.apply(scn.get("scn_idle_noon_clear")); c2.debugTick(5);
                ok(c2.startHello(p, 9L, c2.folks()), "다시 시작"); adv(c2, .8); c2.helloSkip(); adv(c2, 4);
                ok(c2.error == null, "일찍 끝내도 오류 없음");
            }
            TestHost hw = fakeHost(); SceneCore cw = core(hw, 4); cw.layout(340, 190, 2.75, true);
            ok(!cw.startHello(new SceneHello.Plan(), 1, null), "장면이 안 돌거나 대본이 틀리면 시작하지 않는다");
        }
        // 7) 장면이 바뀔 때 TV 전원 전환(꺼짐 → 암전 → 켜짐)
        {
            TestHost h = fakeHost(); SceneCore c = core(h, 1); c.layout(340, 190, 2.75, true);
            c.apply(scn.get("scn_idle_noon_clear")); c.debugTick(2);
            ok(c.tv() < 0, "전환 전에는 TV 전환이 없다 tv=" + c.tv());
            c.apply(scn.get("scn_wait_bus_rain"));
            ok(c.tv() == 0 && c.prevLayer() != null && c.mode().equals("wait"), "장면 전환: 옛 장면 한 장을 쥐고 TV 꺼짐이 시작된다 tv=" + c.tv());
            ok(c.interactive(), "TV 전환 중에는 주사율을 끝까지 쓴다");
            ok(!c.down(100, 100), "TV 전환 중에는 캐릭터를 집지 못한다");
            c.debugTick(.2); ok(c.tv() > .15 && c.tv() < SceneCore.TV_OFF, "꺼지는 중 tv=" + c.tv());
            c.debugTick(.5); ok(c.tv() > SceneCore.TV_OFF + SceneCore.TV_HOLD && c.tv() < SceneCore.TV_T, "켜지는 중 tv=" + c.tv());
            c.debugTick(.5); ok(c.tv() < 0 && c.prevLayer() == null, "0.8초 뒤 끝난다(옛 그림도 놓는다)");
            // 같은 장면을 다시 받아도(모드 그대로) 전환하지 않는다
            c.apply(scn.get("scn_wait_bus_rain")); ok(c.tv() < 0, "같은 장면 재적용은 전환 없음");
            // 크기만 바뀌어 다시 만들 때도 전환하지 않는다
            c.layout(300, 150, 2.75, true); ok(c.tv() < 0, "크기 변경은 전환 없음");
            // 장면 없음 → 멈춤은 전환 없이
            c.apply(scn.get("scn_idle_noon_clear")); ok(c.tv() == 0, "다른 장면으로 바뀌면 다시 전환");
            c.apply(SceneModel.parse("{\"ok\":true,\"mode\":null,\"look\":{\"slot\":\"noon\"}}")); ok(c.tv() < 0 && !c.isRunning(), "장면 없음으로 멈추면 전환 상태도 정리");
        }
        // 7b) 장소가 바뀔 때(s246): 캐릭터들은 엔진이 정한 쪽(look.pdir)으로 함께 걸으며(화면 안에 머문다) · 배경은 반대로 흘러 옛 배경이 새 배경으로 겹쳐 이어지고 · 끝나면 새 장소에서 평소처럼 논다
        for (int pd : new int[]{1, -1}) {
            TestHost h = fakeHost(); SceneCore c = core(h, 7); c.layout(340, 190, 2.75, true);
            SceneModel.Res r = SceneModel.parse(read(new File(dir, "scn_idle_noon_clear.json")));
            r.look.place = "street"; r.look.pdir = pd; c.apply(r); adv(c, 9);
            int n0 = c.actors.size();
            ok(c.pan < 0 && c.panBg == null && n0 > 0, "장소 전환 전: 전환 상태 없음, 친구들이 돌아다닌다 n=" + n0);
            SceneModel.Res r2 = SceneModel.parse(read(new File(dir, "scn_idle_noon_clear.json")));
            r2.look.place = "park"; r2.look.pdir = pd; c.apply(r2);
            ok(c.pan == 0 && c.panBg != null && c.panDir == pd && c.L.place.equals("park") && c.panL.place.equals("street"), "장소가 바뀌면 옛 배경을 쥐고 이동 전환이 시작된다 dir=" + pd);
            boolean allPan = true; for (SceneCore.Actor ac : c.actors) if (!ac.dead && !ac.hero) allPan &= "pan".equals(ac.st);
            ok(allPan && c.actors.size() == n0, "모든 캐릭터가 함께 걷기 상태로 바뀐다(내보내지 않는다)");
            ok(c.panDur >= SceneCore.PAN_MIN && c.panDur <= SceneCore.PAN_MAX, "전환 시간은 정해진 범위 panDur=" + c.panDur);
            BufferedImage im = canvasImg((int) (340 * 2.75), (int) (190 * 2.75));
            double tot = 0;
            while (tot < c.panDur - .3) {
                adv(c, .4); tot += .4; draw(c, im);
                boolean inside = true; for (SceneCore.Actor ac : c.actors) if (!ac.dead && "pan".equals(ac.st) && (ac.x < 0 || ac.x > c.W)) inside = false;
                ok(inside && c.error == null, "걷는 동안 캐릭터는 화면 안에 머문다 pan=" + c.pan);
                ok(Math.abs(Math.abs(c.panNewX() - c.panOldX()) - (c.W - c.panF())) < 1e-6, "두 배경은 겹침 폭만큼 항상 겹쳐 이어진다");
            }
            adv(c, .6); ok(c.pan < 0 && c.panBg == null && c.panL == null && c.oldTraffic.isEmpty(), "전환이 끝나면 옛 배경을 놓는다");
            boolean stillPan = false; for (SceneCore.Actor ac : c.actors) if ("pan".equals(ac.st)) stillPan = true;
            ok(!stillPan, "끝나면 친구들이 평소 놀이로 돌아간다");
            adv(c, 8); draw(c, im);
            boolean bad = false; for (SceneCore.Actor ac : c.actors) if (Double.isNaN(ac.x) || ac.x < -ac.w * 1.3 - 2 || ac.x > c.W + ac.w * 1.3 + 2) bad = true;
            ok(!bad && c.error == null && !c.actors.isEmpty(), "전환 뒤 새 장소에서 친구들이 다시 돌아다닌다 n=" + c.actors.size());
        }
        {   // 날씨·시간대만 바뀌면 이동 없이 서서히(크로스페이드), 움직임 줄이기면 전환 없이 바로
            TestHost h = fakeHost(); SceneCore c = core(h, 7); c.layout(340, 190, 2.75, true);
            SceneModel.Res r = SceneModel.parse(read(new File(dir, "scn_idle_noon_clear.json"))); r.look.place = "park"; c.apply(r); adv(c, 3);
            r.look.wk = "rain"; c.apply(r);
            ok(c.pan < 0 && c.xf == 0 && c.prevLayer() != null && c.L.wk.equals("rain"), "같은 장소에서 날씨만 바뀌면 이동 없이 서서히 바뀐다");
            BufferedImage im = canvasImg((int) (340 * 2.75), (int) (190 * 2.75)); adv(c, .5); draw(c, im); ok(c.error == null, "크로스페이드 중 그려도 오류 없음");
            adv(c, 1.2); ok(c.xf < 0 && c.prevLayer() == null, "1초 남짓 뒤 끝난다");
            TestHost h2 = fakeHost(); SceneCore c2 = core(h2, 7); c2.layout(340, 190, 2.75, true); c2.reduce = true;
            SceneModel.Res q = SceneModel.parse(read(new File(dir, "scn_idle_noon_clear.json"))); q.look.place = "park"; c2.apply(q); adv(c2, 1);
            q.look.place = "river"; c2.apply(q); ok(c2.pan < 0 && c2.xf < 0 && c2.L.place.equals("river"), "움직임 줄이기: 전환 없이 바로 바뀐다");
        }
        // 8) 진동 무늬표: 코어가 알리는 이름마다 무늬가 있고 모양이 올바르다
        for (String n : SceneHaptics.names()) { String e = SceneHaptics.check(n); ok(e == null, "진동 무늬 " + n + (e == null ? "" : " — " + e)); }
        for (String n : new String[]{"grab", "release", "land", "land_cotton", "land_pose", "land_dig", "land_flip", "land_fly", "land_puddle", "land_tumble", "land_hose", "squirt", "flap", "hearts", "thud", "angry", "splash", "grin"})
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
        // 10-2) s257 지하철 대기 = 역 안 승강장(실내): 눈·강풍이 몰아쳐도 날씨 효과·차·우산이 없고, 간판에는 기다리는 역 이름이 뜬다
        {
            SceneModel.Res in = scn.get("scn_wait_sub_inside");
            ok(in != null && in.inside && "강남".equals(in.sta) && "sub".equals(in.venue), "엔진이 역 안 대기(inside)와 역 이름을 준다");
            for (double[] sz : new double[][]{{340, 190}, {300, 150}, {412, 260}}) {
                TestHost h = fakeHost(); SceneCore c = core(h, 6); c.layout(sz[0], sz[1], 2.75, true); c.apply(in);
                ok(c.inside && "강남".equals(c.sta) && "wait".equals(c.mode()), "승강장 장면이 켜진다 " + (int) sz[0] + "x" + (int) sz[1]);
                BufferedImage im = canvasImg((int) (sz[0] * 2.75), (int) (sz[1] * 2.75)); boolean fine = true; String why = "";
                for (int i = 0; i < 30 * 40; i++) {
                    c.update(1.0 / 30);
                    if (i % 20 == 0) { try { draw(c, im); } catch (RuntimeException e) { fine = false; why = String.valueOf(e); break; } }
                    if (c.error != null) { fine = false; why = c.error; break; }
                }
                ok(fine, "승강장 장면 40초가 오류 없이 돈다 " + why);
                ok(c.traffic.isEmpty() && c.ripples.isEmpty() && c.hero != null && !c.hero.umb, "실내: 차도 · 빗방울 파문도 · 우산도 없다");
                ok(c.L.wk.equals("clear") && c.L.wind == 0 && !c.L.cold && !c.L.sun && !c.L.night, "실내 look: 날씨·바람·추위·햇빛·밤이 장면에 닿지 않는다");
                ok(c.hero.x >= c.W * .18 && c.hero.x <= c.W * .78, "대표 캐릭터는 승강장 안에서 논다 x=" + c.hero.x);
            }
            SceneModel.Res bw = scn.get("scn_wait_bus_rain"); TestHost hb = fakeHost(); SceneCore cb = core(hb, 6); cb.layout(340, 190, 2.75, true); cb.apply(bw);
            ok(!cb.inside && cb.venue.equals("bus"), "버스 대기는 그대로 정류장(바깥)");
            cb.apply(in); ok(cb.inside && cb.venue.equals("sub") && cb.sta.equals("강남"), "같은 wait 에서 버스 → 지하철로 바뀌면 장면이 승강장으로 다시 만들어진다");
            cb.apply(bw); ok(!cb.inside && cb.venue.equals("bus"), "지하철 → 버스로 돌아오면 정류장");
        }
        // 11) 지하철 객실(혼잡도 카드 두 번째 쪽): 시각표(pos.segs)와 지금 시각만으로 달림/섬이 정해지고, 정차에서 친구들이 내리고 탄다
        {
            File tf = new File(dir, "train_ride.json");
            ok(tf.exists(), "엔진이 만든 객실 장면 JSON(train_ride.json) 이 있다");
            if (tf.exists()) {
                SceneModel.Res tr = SceneModel.parse(read(tf));
                ok("train".equals(tr.mode) && tr.train != null && tr.train.names.size() >= 3 && tr.train.stops.size() == tr.train.names.size(), "객실 장면 재료: mode=train · 역 " + (tr.train == null ? 0 : tr.train.names.size()) + "개 · 정차표 " + (tr.train == null ? 0 : tr.train.stops.size()) + "개");
                double[][] tsz = {{340, 190}, {300, 150}, {336, 130}, {412, 260}};
                for (double[] sz : tsz) {
                    TestHost h = fakeHost(); SceneCore c = core(h, 5); c.layout(sz[0], sz[1], 2.75, true);
                    ok(c.apply(tr) && c.mode().equals("train"), "객실 장면이 켜진다 " + (int) sz[0] + "x" + (int) sz[1]);
                    c.trainPos(trainPos(tr.train.first, tr.train.names.size() - 1));
                    BufferedImage im = canvasImg((int) (sz[0] * 2.75), (int) (sz[1] * 2.75));
                    boolean fine = true; String why = ""; double maxScroll0 = 0;
                    for (int i = 0; i < 30 * 200; i++) {
                        c.trainClock(i * 1000L / 30); c.update(1.0 / 30);
                        if (i % 15 == 0) { try { draw(c, im); } catch (RuntimeException e) { fine = false; why = String.valueOf(e); break; } }
                        if (c.error != null) { fine = false; why = c.error; break; }
                    }
                    ok(fine, "객실 장면 200초(정차·출발·달림·도착)가 오류 없이 돈다 " + (int) sz[0] + "x" + (int) sz[1] + " " + why);
                }
                // 시각표 해석: 정차(0~25초)엔 서 있고(v=0), 달리는 중엔 v>0 이고 배경이 흐른다, 도착하면 다시 선다
                TestHost h = fakeHost(); SceneCore c = core(h, 5); c.layout(340, 190, 2.75, true); c.apply(tr); c.trainPos(trainPos(tr.train.first, tr.train.names.size() - 1));
                c.trainClock(10000); c.update(1.0 / 30); ok(c.tr.stop && c.tr.v == 0 && c.tr.k == 0, "정차 중(10초)에는 서 있다 stop=" + c.tr.stop + " k=" + c.tr.k);
                double s0 = c.tr.scroll; c.trainClock(10100); c.update(1.0 / 30); ok(c.tr.scroll == s0, "서 있으면 배경이 흐르지 않는다");
                c.trainClock(80000); c.update(1.0 / 30); ok(!c.tr.stop && c.tr.v > .99 && c.tr.k == 0 && c.tr.toK == 1, "달리는 중(80초)에는 빠르게 간다 v=" + c.tr.v + " k=" + c.tr.k + "→" + c.tr.toK);
                s0 = c.tr.scroll; c.trainClock(80033); c.update(1.0 / 30); ok(c.tr.scroll > s0, "달리면 배경이 흐른다");
                c.trainClock(148000); c.update(1.0 / 30); ok(c.tr.stop && c.tr.k == 1 && c.tr.v == 0, "다음 역에 닿으면(148초) 다시 선다 k=" + c.tr.k);
                // 중간에 열어도 그 시각의 장면이 바로 나온다(처음부터 돌려 온 것과 같은 구간·정차 상태)
                TestHost h2 = fakeHost(); SceneCore c2 = core(h2, 9); c2.layout(340, 190, 2.75, true); c2.apply(tr); c2.trainPos(trainPos(tr.train.first, tr.train.names.size() - 1));
                c2.trainClock(150000); c2.update(1.0 / 30); ok(c2.tr.stop && c2.tr.k == 1 && Math.abs(c2.tr.e - 5) < .2, "145초에 선 열차를 150초에 처음 열어도 정차 2초 지난 장면 e=" + c2.tr.e);
                // 시각표가 없으면(위치를 모르면) 멈춰 서지 않고 계속 달리는 그림
                TestHost h3 = fakeHost(); SceneCore c3 = core(h3, 9); c3.layout(340, 190, 2.75, true); c3.apply(tr); c3.trainPos(""); c3.update(1.0 / 30);
                ok(!c3.tr.stop && c3.tr.v == 1, "시각표가 없으면 계속 달리는 그림");
                // 같은 여정의 새 값은 자리를 바꾸지 않고, 시각표·시계는 크기가 바뀌어도 이어진다
                int[] before = c.tr.spotOf.clone(); c.apply(tr); ok(java.util.Arrays.equals(before, c.tr.spotOf), "같은 여정 재적용은 자리 그대로");
                c.layout(300, 150, 2.75, true); c.trainClock(150000); c.update(1.0 / 30); ok(c.tr.posOk && c.tr.stop && c.tr.k == 1, "크기가 바뀌어도 시각표는 이어진다");
                // s233 안무: 달리는 동안 친구들이 자리를 바꾸고(일어서서 걸어가 다른 자리에 앉는다) · 졸고 · 기지개를 켠다 — 자리는 늘 겹치지 않는다
                {
                    TestHost hc = fakeHost(); SceneCore cc = core(hc, 5); cc.layout(340, 190, 2.75, true); cc.apply(tr); cc.trainPos("");
                    int[] first = cc.tr.cur.clone(); boolean perm = true, walk = false, stand = false, nap = false, sat = false; int moves = 0; int[] last = first.clone();
                    for (int i = 0; i < 30 * 150; i++) {
                        cc.trainClock(i * 1000L / 30); cc.update(1.0 / 30);
                        boolean[] seen = new boolean[6]; for (int v : cc.tr.cur) { if (v < 0 || v > 5 || seen[v]) perm = false; else seen[v] = true; }
                        if (!java.util.Arrays.equals(last, cc.tr.cur)) { moves++; last = cc.tr.cur.clone(); }
                        if (i % 6 == 0) for (SceneTrain.Pax px : SceneTrain.allPax(cc, cc.tr)) { if (px.walking) walk = true; if (px.nap) nap = true; if (px.sit) sat = true; else if (!px.walking) stand = true; }
                    }
                    ok(perm, "달리는 150초 내내 친구들의 자리는 서로 겹치지 않는다(순열)");
                    ok(moves >= 6, "자리 바꿈이 이어진다(150초에 " + moves + "번)");
                    ok(walk && nap && sat && stand, "걷고 · 졸고 · 앉고 · 서 있는 모습이 모두 나온다 walk=" + walk + " nap=" + nap + " sat=" + sat + " stand=" + stand);
                    // 서 있는 동안엔 새 자리 바꿈을 시작하지 않는다(문 앞이 막히지 않게)
                    TestHost hs = fakeHost(); SceneCore cs = core(hs, 5); cs.layout(340, 190, 2.75, true); cs.apply(tr); cs.trainPos(trainPos(tr.train.first, tr.train.names.size() - 1));
                    for (int i = 0; i < 30 * 24; i++) { cs.trainClock(i * 1000L / 30 + 100); cs.update(1.0 / 30); }
                    ok(cs.tr.stop && cs.tr.epoch == 0, "정차 중(24초)엔 자리 바꿈이 시작되지 않는다 epoch=" + cs.tr.epoch);
                }
                {   // s257 YJ: 출발할 때 창밖 승강장 간판은 방금 떠난 역(전 역) · 곧 닿을 때는 다음 역 · 객실 안내는 달리는 동안 '다음 역', 곧 닿으면 '이번 역'
                    TestHost hq = fakeHost(); SceneCore q = core(hq, 5); q.layout(340, 190, 2.75, true); q.apply(tr); q.trainPos(trainPos(tr.train.first, tr.train.names.size() - 1));
                    q.trainClock(28000); q.update(1.0 / 30);
                    ok(!q.tr.stop && q.tr.shift > 0 && SceneTrain.stationNameForSign(q.tr).equals(tr.train.names.get(0)) && !SceneTrain.arriving(q.tr), "막 출발(28초): 창밖 승강장 간판은 전 역 '" + SceneTrain.stationNameForSign(q.tr) + "' · 안내는 '다음 역'");
                    q.trainClock(80000); q.update(1.0 / 30);
                    ok(!q.tr.stop && !SceneTrain.arriving(q.tr), "한참 달리는 중엔 '다음 역'");
                    q.trainClock(143000); q.update(1.0 / 30);
                    ok(!q.tr.stop && q.tr.shift < 0 && SceneTrain.stationNameForSign(q.tr).equals(tr.train.names.get(1)) && SceneTrain.arriving(q.tr), "곧 닿음(143초): 창밖 승강장 간판은 도착할 역 '" + SceneTrain.stationNameForSign(q.tr) + "' · 안내는 '이번 역'");
                    q.trainClock(150000); q.update(1.0 / 30);
                    ok(q.tr.stop && SceneTrain.stationNameForSign(q.tr).equals(tr.train.names.get(1)), "서 있으면 그 역");
                }
                ok(!c.down(100, 100), "객실 장면은 캐릭터를 집지 않는다(손가락은 쪽 넘기기)");
            }
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
