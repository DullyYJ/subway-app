package com.dullyyj.subway;

import static com.dullyyj.subway.SceneUtil.*;
import static com.dullyyj.subway.SceneCore.po;

import com.dullyyj.subway.SceneCore.Actor;
import com.dullyyj.subway.SceneCore.AS;
import com.dullyyj.subway.SceneCore.Ball;
import com.dullyyj.subway.SceneCore.Feather;
import com.dullyyj.subway.SceneCore.Gfx;
import com.dullyyj.subway.SceneCore.Prop;

import java.util.ArrayList;
import java.util.List;

/**
 * 캐릭터별 동작·착지 연출 한 벌(웹 _CS 의 ACT 표를 그대로 옮김).
 * ★ 어떤 동작을 어떤 순서로 하는지(acts)·놓으면 어떤 연출인지(land)는 엔진(/scene 의 traits)이 정한 '이름'이다.
 *   여기는 그 이름대로 몸을 기울이고 늘리고 소품·반짝이·땅 위 그림을 그리는 곳뿐이다(판단 없음, 위치·길이는 그림 연출).
 */
final class SceneActs {
    /** 웹의 춤 음표 키 충돌(위 주석)을 그대로 재현할지. true 면 웹과 동일(음표 없음). */
    static final boolean WEB_DANCE_NOTE_BUG = true;
    private SceneActs() {}

    static void A_(SceneCore S, String name, double dur, SceneCore.Init init, SceneCore.Step step, SceneCore.End end) {
        SceneCore.Act a = new SceneCore.Act(); a.dur = dur; a.init = init; a.step = step; a.end = end; S.ACT.put(name, a);
    }
    static void emergeIn(SceneCore S, Actor a, double u, double lim) {
        SceneModel.Spec D = a.D; a.intro = true; a.ii = (int) Math.min(D.intro - 1, Math.floor(clamp(u / lim, 0, .999) * D.intro));
        if (S.R.next() < .3) S.ptx("dirt", a.x, S.feetY(a) - 2, 1, po().a(-PI * .95, -PI * .05).s(12, 26).g(150).l(.4, .7).jx(6));
    }
    static double[] eagleHead(double h) { return new double[]{h * .3, -h * .66}; }

    static void register(final SceneCore S) {
        // ── 하얀 강아지(돌솜) ──
        A_(S, "shake", 2.8, null, (a, u, dt, A) -> {
            // 털을 털다가 털이 자연스럽게 부풀었다가 원래대로 돌아온다(다른 그림을 덧붙이지 않고 캐릭터 자체가 커졌다 줄어든다)
            double T = S.t, b = u < .35 ? ease(u / .35) : u < .62 ? 1 : 1 - ease((u - .62) / .38);
            S.standF(a); a.sx = a.sy = 1 + .34 * b; a.ox = u < .5 ? Math.sin(T * 26) * 2 * Math.min(1, u / .08) : 0; a.ang = u < .5 ? Math.sin(T * 22) * .05 : 0;
        }, null);
        A_(S, "tailchase", 3.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; boolean dz = u > .74; S.standF(a);
            if (!dz) {
                double cs = Math.cos(T * 11); a.sx = (cs < 0 ? -1 : 1) * Math.max(.22, Math.abs(cs)); a.y = -Math.abs(Math.sin(T * 11)) * 2.4;
                if (S.every(A, "tp", .2)) S.ptx("dust", a.x, S.feetY(a) - 1, 1, po().a(-PI * .9, -PI * .1).s(6, 14));
            } else { a.ang = Math.sin(T * 4.2) * .22; a.ox = Math.sin(T * 2.1) * 3; S.pr(a, S.prop("stars", 0, -h * 1.06)); }
        }, null);
        A_(S, "loaf", 4.6, null, (a, u, dt, A) -> {
            double T = S.t; S.standF(a); a.sy = .74; a.sx = 1.12; a.ox = u < .55 ? Math.sin(T * 14) * 1.5 : 0; if (u > .5) { a.pose = 1; a.sx = a.sy = 1; }    // 졸다가 엎드려 잔다
            if (u > .5 && S.every(A, "zz", .6)) S.ptx("zzz", a.x + a.dir * S.HH(a) * .3, S.feetY(a) - S.HH(a) * .8, 1, po().a(-PI * .6, -PI * .4).s(6, 9).g(-4).l(1, 1.4).r(1));
        }, null);
        A_(S, "ball", 3.8, (a, t, A) -> { A.b = null; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, nx = a.dir * h * .52, ny = -h * .62, fy = S.feetY(a);
            S.standF(a);
            if (u < .62) {
                double bp = Math.abs(Math.sin(T * 6.5)); a.y = -bp * 1.4; S.pr(a, S.prop("ball", h * .52, ny - bp * h * .4)); a.sy = 1 + (bp < .12 ? -.03 : 0);
            } else {
                if (A.b == null) { Ball nb = new Ball(); nb.x = a.x + nx; nb.y = fy + ny; nb.vx = a.dir * 60; nb.vy = -80; A.b = nb; S.say(a, "!", .9); }
                Ball b = A.b; b.vy += 260 * dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y > fy - 4) { b.y = fy - 4; b.vy *= -.55; b.vx *= .8; }
                b.x = clamp(b.x, 6, S.W - 6); S.pr(a, S.propAbs("ball", b.x, b.y));
                if (u > .78) S.moveX(a, b.x, a.spd * 1.1, dt);
            }
        }, null);
        A_(S, "mirror", 3.8, (a, t, A) -> {
            A.mx = S.aheadX(a, S.HH(a) * .85); A.g = S.addGfx(S.gfx("mirror", A.mx, a.z, 3.8 + .3)); A.g.own = a; a.dir = A.mx >= a.x ? 1 : -1;
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.dir = A.mx >= a.x ? 1 : -1;
            double b = Math.abs(Math.sin(T * 8)); a.y = -b * h * .26; a.sy = 1 + (b < .15 ? -.08 : .04); a.ang = Math.sin(T * 8) * .1 * a.dir * -1;
            if (u > .1 && u < .92 && S.every(A, "ba", .62)) S.say(a, "왜왜!", .5);
        }, null);

        // ── 갈색 강아지(뽀푸) ──
        A_(S, "dig", 3.6, (a, t, A) -> {
            A.hx = a.x + a.dir * S.HH(a) * .72; A.g = S.addGfx(S.gfx("hole", A.hx, a.z, 3.6 + .5));
            Gfx m = S.gfx("mound", a.x - a.dir * S.HH(a) * .5, a.z, 3.6 + .5); m.r = 9; S.addGfx(m);
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; double[] ba = S.behindAng(a); S.standF(a); a.pvx = h * .38;
            if (u < .45) {
                a.ang = .32 + Math.sin(T * 16) * .07;
                if (S.every(A, "d", .1)) S.ptx("dirt", a.x - a.dir * h * .1, S.feetY(a) - 3, 1, po().a(ba[0], ba[1]).s(22, 40).g(180).l(.4, .7));
            } else if (u < .84) {
                a.ang = 1.02 + Math.sin(T * 20) * .06;
                if (S.every(A, "d", .16)) S.ptx("dirt", a.x + a.dir * h * .7, S.feetY(a) - 3, 1, po().a(-PI * .9, -PI * .1).s(14, 26).g(160).l(.4, .7));
                Prop mh = S.prop("moundhat", h * .62, -3); mh.r = h * .26; S.pr(a, mh);
            } else { double p = (u - .84) / .16; a.ang = 1.02 * (1 - ease(p)); a.ox = Math.sin(T * 40) * 1.6 * (1 - p); }
        }, null);
        A_(S, "bone", 4.2, (a, t, A) -> { A.tx = S.aheadX(a, 70 + S.rnd() * 20); }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; double[] r = S.inRange(a); a.y = -Math.abs(Math.sin(T * 10)) * 3.5;
            if (S.moveX(a, A.tx, a.spd * 1.5, dt)) {
                A.tx = clamp(a.x - a.dir * (70 + S.rnd() * 20), r[0], r[1]);
                if (Math.abs(A.tx - a.x) < 8) A.tx = a.x + (a.x < (r[0] + r[1]) / 2 ? 1 : -1) * 60;
            }
            a.fr += dt * a.D.fps * .3; S.pr(a, S.prop("bone", h * .42, -h * .3 + Math.sin(T * 10) * 1.4));
        }, null);
        A_(S, "dance", 3.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double b = Math.abs(Math.sin(T * 7)); a.ang = -.55 + Math.sin(T * 7) * .1; a.y = -b * h * .12; a.ox = Math.sin(T * 3.5) * 2;
            // 웹(index.html)의 같은 줄은 every(a.act,'n',.38) 인데 키 'n' 이 act 이름(a.act.n)과 겹쳐 조건이 늘 거짓이다 →
            // 웹에는 춤 음표가 한 번도 안 나온다. 웹과 똑같이 그리는 게 이번 이식의 기준이라 같은 동작을 유지한다(고치려면 키를 바꾸면 된다: 웹·Java 동시에).
            if (WEB_DANCE_NOTE_BUG ? false : (u > .08 && u < .92 && S.every(A, "nt", .38))) S.ptx("note", a.x + a.dir * h * .35, S.feetY(a) - h * 1.1, 1, po().a(-PI * .7, -PI * .3).s(12, 20).g(-6).l(.9, 1.3).r(1).jx(6));
        }, null);
        A_(S, "slide", 2.4, null, (a, u, dt, A) -> {
            double[] r = S.inRange(a); S.standF(a); a.sx = 1.22; a.sy = .74; double v = 120 * (1 - u) * (1 - u) + 6;
            if (a.x + a.dir * v * dt < r[0] || a.x + a.dir * v * dt > r[1]) a.dir = -a.dir;
            a.x = clamp(a.x + a.dir * v * dt, r[0], r[1]);
            if (u < .8 && S.every(A, "d", .09)) S.ptx("dust", a.x - a.dir * S.HH(a) * .5, S.feetY(a) - 1, 1, po().a(-PI * .9, -PI * .1).s(8, 18));
        }, null);
        A_(S, "dive", 3.8, (a, t, A) -> {
            A.px = S.aheadX(a, S.HH(a) * 1.9); A.dir0 = a.dir; A.snow = S.L.wk.equals("snow");
            Gfx pg = S.gfx("pile", A.px, a.z + .004, 3.8 + 1.2); pg.front = true; pg.snow = A.snow; A.g = S.addGfx(pg);
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, fy = S.feetY(a); a.dir = A.px >= a.x ? 1 : -1;
            if (u < .4) { double tx = A.px - A.dir0 * h * 1.0; S.moveX(a, tx, a.spd * 1.2, dt); }
            else if (u < .62) {
                double p = (u - .4) / .22; if (Double.isNaN(A.x1)) A.x1 = a.x; a.x = A.x1 + (A.px - A.x1) * ease(p);
                a.y = -Math.sin(PI * p) * h * .9 + (p > .85 ? h * .25 * (p - .85) / .15 : 0); a.pvy = -h * .5; a.ang = ease(p) * 1.2; S.standF(a);
            } else if (u < .86) {
                a.vis = false;
                if (S.once(A, "burst")) { S.ptx("leaf", A.px, fy - h * .25, 12, po().a(-PI * .95, -PI * .05).s(26, 54).g(130).l(.7, 1.1).jx(6)); if (A.g != null) A.g.bump = T; }
                if (S.every(A, "rs", .5) && A.g != null) A.g.bump = T;
            } else {
                double q = (u - .86) / .14; a.x = A.px; a.cut = h * .55 * (1 - q * .2); a.y = h * .55 * (1 - ease(q)); S.standF(a);
                if (S.once(A, "pop")) { S.ptx("leaf", A.px, fy - h * .5, 8, po().a(-PI * .95, -PI * .05).s(20, 44).g(120).l(.6, 1).jx(5)); if (A.g != null) A.g.bump = T; }
                if (q > .7) { a.cut = Double.NaN; a.y = 0; }
            }
        }, (a, A) -> { a.dir = A.dir0; if (A.g != null) A.g.life = Math.min(A.g.life, S.t - A.g.t0 + .8); });

        // ── 고양이(러블) ──
        A_(S, "punch", 2.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double sw = Math.max(0, Math.sin(T * 24)); a.ox = a.dir * sw * 4; a.sx = 1 + sw * .06;
            if (u > .08 && u < .92 && S.every(A, "sp", .12)) S.ptx("spark", a.x + a.dir * h * .62, S.feetY(a) - h * .55, 1, po().a(a.dir > 0 ? -.6 : PI - .6, a.dir > 0 ? .6 : PI + .6).s(12, 22).g(0).l(.25, .4).jy(8).r(1.1));
            if (u > .1 && S.every(A, "sy", 1.0)) S.say(a, "냥냥냥!", .8);
        }, null);
        A_(S, "box", 4.8, (a, t, A) -> {
            A.bx = S.aheadX(a, S.HH(a) * 1.2); A.b1 = S.addGfx(S.gfx("boxb", A.bx, a.z, 4.8 + .4));
            Gfx bf = S.gfx("boxf", A.bx, a.z + .004, 4.8 + .4); bf.front = true; A.b2 = S.addGfx(bf);
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a);
            double bh = h * SceneCore.BOX_H;                                                  // 상자 앞판 높이 — 이 선 아래의 몸은 그리지 않는다(상자 밖으로 삐져나오지 않게)
            if (Double.isNaN(A.s0)) A.s0 = a.x;
            if (u < .3) { S.moveX(a, A.bx - (A.bx >= a.x ? 1 : -1) * h * .55, a.spd, dt); if (u > .27) A.s1 = a.x; }
            else if (u < .46) { double p = (u - .3) / .16; if (Double.isNaN(A.s1)) A.s1 = a.x; a.dir = A.bx >= a.x ? 1 : -1; a.x = A.s1 + (A.bx - A.s1) * ease(p); a.y = -Math.sin(PI * p) * h * .55; }
            else if (u < .9) { a.x = A.bx; double k2 = ease(clamp((u - .46) / .08, 0, 1)); a.y = h * .03 * k2; a.ox = Math.sin(T * 12) * .8; a.sy = 1 - .04 * k2; }
            else {                                                                                // 폴짝 뛰어나와 상자 옆(들어온 쪽)에 내려앉는다
                double q = (u - .9) / .1; int side = (Double.isNaN(A.s1) || A.s1 >= A.bx) ? 1 : -1;
                a.x = A.bx + side * h * 1.1 * ease(clamp((q - .12) / .55, 0, 1));
                a.y = h * .05 * (1 - ease(Math.min(1, q * 2.4))) - Math.sin(PI * q) * h * .62; a.dir = -side;
            }
            boolean inBox = u >= .38 && Math.abs(a.x - A.bx) < h * SceneCore.BOX_W * .62 && a.y > -bh * .98;
            a.cut = inBox ? bh : Double.NaN;
        }, null);
        A_(S, "stretch", 3.4, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.pvx = h * .4;
            if (u < .6) { double b = ease(Math.min(1, u / .15)); a.ang = .5 * b; a.sx = 1 + .16 * b; if (u > .15) a.ang += Math.sin(T * 9) * .015; }
            else { double q = ease((u - .6) / .15); a.ang = .5 * (1 - q); a.sx = 1.16 - .16 * q; a.sy = 1 + .06 * Math.sin(PI * clamp((u - .6) / .4, 0, 1)); if (S.once(A, "y")) S.say(a, "하암~", 1.4); }
        }, null);
        A_(S, "melt", 3.8, null, (a, u, dt, A) -> {
            double d = u < .12 ? 0 : u < .42 ? ease((u - .12) / .3) : u < .78 ? 1 : 1 - ease((u - .78) / .12); S.standF(a);
            double mk = clamp((d - .45) / .3, 0, 1), sq = .7 * (1 - mk) + .1 * mk; if (mk > .5) a.pose = 1;       // 녹아내리다 엎드려 잔다
            a.sy = 1 - sq * d + (u > .9 ? Math.sin((u - .9) * 40) * .05 * (1 - (u - .9) * 10) : 0); a.sx = 1 + (.5 * (1 - mk) + .05 * mk) * d;
            if (u > .5 && u < .76 && S.every(A, "zz", .7)) S.ptx("zzz", a.x + a.dir * S.HH(a) * .3, S.feetY(a) - S.HH(a) * .35, 1, po().a(-PI * .6, -PI * .4).s(6, 9).g(-4).l(1, 1.3).r(1));
        }, null);
        A_(S, "pounce", 2.8, null, (a, u, dt, A) -> {
            double h = S.HH(a); S.standF(a);
            if (u < .2) {
                double f = ease(Math.min(1, u / .1)); a.sx = a.sy = 1 + .3 * f;
                if (S.once(A, "e")) { S.say(a, "!", 1); S.ptx("puff", a.x, S.feetY(a) - h * .6, 4, po().a(-PI, 0).s(8, 16).g(6).jx(h * .3).l(.4, .7)); }
            } else if (u < .72) { double p = (u - .2) / .52; a.y = -Math.sin(PI * p) * h * .95; a.sx = 1.3 - .22 * Math.sin(PI * p); a.sy = 1.3 - .1 * p; }
            else { double q = ease((u - .72) / .28); a.sx = a.sy = 1 + .3 * (1 - q); }
        }, null);

        // ── 두더지(두덩) ──
        A_(S, "shades", 3.6, null, (a, u, dt, A) -> {
            double h = S.HH(a); if (u < .3) { emergeIn(S, a, u, .3); return; } S.standF(a);
            double adj = u > .4 && u < .66 ? Math.sin((u - .4) / .26 * PI) : 0; a.ang = -.1 * adj; a.y = -adj * 2;
            Prop gl = S.prop("glasses", h * .2, -h * .62); gl.s = 1.1; S.pr(a, gl);
            if (u > .74 && S.every(A, "g", .3)) S.ptx("spark", a.x + a.dir * h * .28, S.feetY(a) - h * .66, 1, po().a(-PI, 0).s(4, 8).g(0).l(.3, .5).jx(4).r(1.2));
        }, null);
        A_(S, "flag", 4.2, (a, t, A) -> { A.fx = a.x + a.dir * S.HH(a) * .8; }, (a, u, dt, A) -> {
            double h = S.HH(a); if (u < .26) { emergeIn(S, a, u, .26); return; } S.standF(a);
            if (u >= .3 && S.once(A, "pl")) {
                A.g = S.addGfx(S.gfx("flag", A.fx, a.z, 4.2 - .3 * 4.2 + .6)); S.ptx("dirt", A.fx, S.feetY(a) - 2, 5, po().a(-PI * .95, -PI * .05).s(12, 24).g(150).jx(3)); S.say(a, "짠!", 1.2);
            }
            if (u > .5 && u < .92) { double b = Math.abs(Math.sin((u - .5) * 22)); a.y = -b * h * .24; a.sy = 1 + .1 * b; }
        }, null);
        A_(S, "lens", 4, (a, t, A) -> { A.lx = S.aheadX(a, S.HH(a) * .7); }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a);
            double d = u < .14 ? ease(u / .14) : u < .84 ? 1 : 1 - ease((u - .84) / .16); a.pvy = -h * .5; a.ang = 1.32 * d; a.y = h * .12 * d; a.dir = A.lx >= a.x ? 1 : -1;
            if (d > .5) { Prop ln = S.propAbs("lens", a.x + a.dir * h * .8, S.feetY(a) - h * .17 + Math.sin(T * 2) * 1.2); ln.r = h * .24; S.pr(a, ln); }
        }, null);
        A_(S, "dust", 3, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a);
            if (u < .62) {
                a.ox = Math.sin(T * 45) * 2.4;
                if (S.every(A, "d", .05)) S.ptx("dirt", a.x, S.feetY(a) - h * .5, 2, po().a(-PI, 0).s(14, 30).g(120).l(.4, .8).jx(h * .3).jy(h * .25));
            } else { a.y = -Math.abs(Math.sin(T * 14)) * 2; if (S.once(A, "c")) S.say(a, "콜록!", 1.2); }
        }, null);
        A_(S, "vanish", 3.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, fy = S.feetY(a); S.standF(a);
            if (u < .5) {
                a.y = -Math.abs(Math.sin(T * 9)) * h * .07; Prop mh = S.prop("moundhat", 0, -h * 1.0); mh.r = h * .2; S.pr(a, mh);
                if (u > .2 && S.once(A, "hi")) S.say(a, "안녕~", 1.1);
            } else if (u < .64) {
                double p = ease((u - .5) / .14); a.y = h * 1.05 * p; a.cut = 0; Prop mh = S.prop("moundhat", 0, -h * 1.0); mh.r = h * .2 * (1 - p * .2); S.pr(a, mh);
                if (S.once(A, "sk")) {
                    Gfx mg = S.gfx("mound", a.x, a.z, 1.6); mg.r = 11; A.g = S.addGfx(mg); S.ptx("dirt", a.x, fy - 2, 8, po().a(-PI * .95, -PI * .05).s(16, 34).g(150).jx(6));
                }
            } else a.vis = false;
        }, (a, A) -> { a.vis = true; a.st = "emerge"; a.t0 = S.t; a.until = S.t + (double) a.D.intro / a.D.introFps; a.afterEmerge = null; });
        A_(S, "angry", 2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a);
            if (S.once(A, "s")) { S.stk(a, "angry", 1.9); S.say(a, "씨씨!", 1.7); S.haptic("angry"); }
            a.ox = u < .8 ? Math.sin(T * 40) * 1.8 : 0; a.sy = 1 + .05 * Math.sin(T * 22);
            if (S.every(A, "p", .22)) S.ptx("puff", a.x + a.dir * h * .1, S.feetY(a) - h * 1.0, 1, po().a(-PI * .8, -PI * .2).s(8, 16).g(-8).l(.4, .7).jx(5));
        }, null);

        // ── 독수리(술) ──
        A_(S, "glasses", 3.4, (a, t, A) -> { A.alt0 = a.alt; }, (a, u, dt, A) -> {
            double h = S.HH(a), b = ease(Math.min(1, u / .25)) * (u > .85 ? 1 - ease((u - .85) / .15) : 1); a.fr += dt * a.D.fps * .15; a.sx = a.sy = 1 + .08 * b; a.ang = -.1 * b;
            double[] e = eagleHead(h); Prop gl = S.prop("glasses", e[0], e[1]); gl.s = 1.1 * b; S.pr(a, gl);
            if (u > .3 && S.every(A, "w", .18)) S.ptx("spark", a.x - a.dir * h * .1, S.feetY(a) - S.liftOf(a) - h * .4, 1, po().a(a.dir > 0 ? PI * .9 : -.1, a.dir > 0 ? PI * 1.1 : .1).s(24, 40).g(0).l(.3, .5).jy(h * .3).r(.8));
        }, null);
        A_(S, "stumble", 4, (a, t, A) -> { A.alt0 = a.alt; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; double[] r = S.inRange(a); a.pvy = -h * .5;
            if (u < .28) { double p = ease(u / .28); a.alt = A.alt0 * (1 - p); a.ang = .5 * p; a.fr += dt * a.D.fps * .5; a.x = clamp(a.x + a.dir * 40 * dt, r[0], r[1]); }
            else if (u < .36) {
                double q = ease((u - .28) / .08); a.alt = 0; a.ang = .5 + .95 * q; S.standF(a);
                if (S.once(A, "i")) {
                    S.say(a, "으앗!", 1.4); S.ptx("star", a.x + a.dir * h * .3, S.feetY(a) - h * .3, 5, po().a(-PI * .95, -PI * .05).s(18, 34).g(90).l(.5, .9).r(1));
                    S.ptx("dust", a.x, S.feetY(a) - 1, 4, po().a(-PI * .9, -PI * .1).s(10, 22));
                }
            } else if (u < .74) { a.alt = 0; a.ang = 1.45 + Math.sin(T * 14) * .05; S.standF(a); S.pr(a, S.prop("stars", h * .3, -h * .5)); }
            else { double w = ease((u - .74) / .22); a.alt = A.alt0 * ease((u - .8) / .2); a.ang = 1.45 * (1 - w); a.ox = Math.sin(T * 30) * 1.2 * (1 - w); }
        }, (a, A) -> { a.alt = A.alt0; });
        A_(S, "feather", 3.8, (a, t, A) -> { A.alt0 = a.alt; A.f = null; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, fy = S.feetY(a);
            if (u < .2) {
                if (A.f == null) { Feather nf = new Feather(); nf.x = a.x + a.dir * h * .1; nf.y = fy - S.liftOf(a) - h * .75; nf.vy = 0; nf.ph = S.rnd() * 6; A.f = nf; }
                a.fr += dt * a.D.fps * .3;
            }
            Feather F = A.f;
            if (F != null && !F.got) {
                if (!F.land) { F.vy = Math.min(F.vy + 40 * dt, 24); F.y += F.vy * dt; F.x += Math.sin(T * 4 + F.ph) * 18 * dt; if (F.y >= fy - 3) { F.y = fy - 3; F.land = true; } }
                F.x = clamp(F.x, 6, S.W - 6);
            }
            if (u >= .14 && u < .44) { if (S.once(A, "ex")) S.say(a, "!", 1.2); a.fr += dt * a.D.fps * .2; }
            if (u >= .44 && u < .8) { a.alt = A.alt0 * (1 - ease((u - .44) / .2)); if (F != null) S.moveX(a, F.x, a.spd * .9, dt); }
            if (u >= .8) {
                if (F != null) F.got = true; a.alt = A.alt0 * ease((u - .88) / .12); double[] e = eagleHead(h);
                S.pr(a, S.prop("feathr", e[0] + h * .12, e[1] + h * .18)); a.y = -Math.abs(Math.sin((u - .8) * 24)) * 2;
            }
            if (F != null && !F.got) S.pr(a, S.propAbs("feathg", F.x, F.y));
        }, (a, A) -> { a.alt = A.alt0; });
        A_(S, "binoc", 4, (a, t, A) -> { A.d0 = a.dir; A.alt0 = a.alt; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; a.dir = ((int) Math.floor(u * 4.4) % 2 != 0 ? -1 : 1) * A.d0; a.fr += dt * a.D.fps * .12; double[] e = eagleHead(h);
            S.pr(a, S.prop("binoc", e[0] + h * .06, e[1] + 1)); a.y = Math.sin(T * 3) * 1;
        }, (a, A) -> { a.dir = A.d0; });
        A_(S, "hover", 3.6, (a, t, A) -> { A.alt0 = a.alt; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; a.fr += dt * a.D.fps * 1.5; a.alt = 8 + Math.sin(T * 9) * 2.5; a.ox = Math.sin(T * 60) * .8;
            if (S.every(A, "w", .12)) S.ptx("spark", a.x + (S.rnd() - .5) * h * .6, S.feetY(a) - 2, 1, po().a(PI * .35, PI * .65).s(14, 26).g(0).l(.25, .4).r(.8));
        }, (a, A) -> { a.alt = A.alt0; });

        // ── 올챙이(챙챙) ──
        A_(S, "dash", 2.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; double[] r = S.inRange(a); a.fr += dt * a.D.fps * 2.2; double nx = a.x + a.dir * a.spd * 2.6 * dt; if (nx < r[0] || nx > r[1]) a.dir = -a.dir;
            a.x = clamp(nx, r[0], r[1]); a.y = Math.sin(T * 14) * 1.8; a.ang = Math.sin(T * 18) * .06;
            if (S.every(A, "b", .1)) S.ptx("bub", a.x - a.dir * h * .5, S.feetY(a) - S.liftOf(a) - h * .3, 1, po().a(-PI * .8, -PI * .2).s(4, 10).g(-14).l(.5, .9).jx(3).jy(5));
        }, null);
        A_(S, "flop", 3.4, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.pvy = -h * .45;
            if (u < .4) { double p = u / .4; a.y = -Math.sin(PI * p) * h * 1.0; a.ang = 1.45 * ease(Math.max(0, p - .5) * 2); }
            else if (u < .8) {
                a.ang = 1.4 + Math.sin(T * 16) * .1; a.sx = 1.1;
                if (S.once(A, "l")) { S.say(a, "툭!", 1.2); S.ptx("dust", a.x, S.feetY(a) - 1, 5, po().a(-PI * .9, -PI * .1).s(10, 22)); }
            } else { double q = ease((u - .8) / .2); a.ang = 1.4 * (1 - q); a.y = -Math.sin(PI * q) * 3; }
        }, null);
        A_(S, "hide", 4, (a, t, A) -> {
            Gfx gr = S.gfx("grass", a.x + a.dir * S.HH(a) * .1, a.z + .006, 4 + .5); gr.front = true; A.g = S.addGfx(gr);
        }, (a, u, dt, A) -> {
            double T = S.t; boolean bl = (T * .9) % 1 < .14; a.sy = bl ? .86 : 1; a.y = 9 * SceneCore.zs(a.z); a.ang = Math.sin(T * 4) * .04; a.fr += dt * a.D.fps * .15;
            if (u > .3 && S.every(A, "q", 1.2)) S.say(a, "…", .9);
        }, null);
        A_(S, "bubbles", 3.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; a.fr += dt * a.D.fps * .3; a.ang = Math.sin(T * 3) * .07;
            if (S.every(A, "b", .13)) S.ptx("bub", a.x + a.dir * h * .4, S.feetY(a) - S.liftOf(a) - h * .58, 1, po().a(-PI * .65, -PI * .35).s(6, 12).g(-6).l(.9, 1.5).jx(2).r(1.2 + S.rnd() * .6));
        }, null);
        A_(S, "dew", 3.8, (a, t, A) -> { A.d0 = a.dir; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a);
            if (u < .86) {
                double cs = Math.cos(T * 9); a.sx = (cs < 0 ? -1 : 1) * Math.max(.22, Math.abs(cs));
                Prop dw = S.prop("dew", 0, -h * 1.0 + Math.sin(T * 12) * .8); dw.r = 4 * SceneCore.zs(a.z); S.pr(a, dw);
            } else if (S.once(A, "dr")) {
                S.ptx("drop", a.x, S.feetY(a) - h * 1.0, 3, po().a(-PI * .75, -PI * .25).s(6, 12).g(220).l(.5, .7));
                S.ptx("ring", a.x + a.dir * 8, S.feetY(a), 1, po().a(0, 0).s(0, 0).g(0).l(.7, .7).delay(.25));
            }
        }, null);

        // ── 판다(죽순이): 활발한 대나무 먹보 · 잠꾸러기 ──
        A_(S, "munch", 4.4, null, (a, u, dt, A) -> {
            // 대나무 줄기를 입에 대고 오물오물(자세 6 ↔ 7: 입을 다물었다 벌렸다) 하다가 흡족해서 하트
            double h = S.HH(a), T = S.t; S.standF(a); boolean eat = u > .08 && u < .86, open = Math.sin(T * 9.5) > 0;
            a.pose = eat ? (open ? 7 : 6) : 0; a.sy = 1 + (eat && open ? .014 : 0); a.ang = eat ? Math.sin(T * 4.7) * .02 : 0;
            if (eat && S.every(A, "lf", .5)) S.ptx("leaf", a.x + a.dir * h * .3, S.feetY(a) - h * .85, 1, po().a(-PI * .85, -PI * .15).s(10, 22).g(90).l(.6, 1.0).jx(4).r(.8));
            if (u > .1 && S.once(A, "sy")) S.say(a, "냠냠! 대나무 최고!", 2.4);
            if (u > .9 && S.once(A, "hh")) S.ptx("heart", a.x, S.feetY(a) - h * .8, 3, po().a(-PI * .98, -PI * .02).s(24, 54).g(55).l(.9, 1.4).r(1.2).jx(5));
        }, null);
        A_(S, "snooze", 4.8, null, (a, u, dt, A) -> {
            // 앉은 채 꾸벅꾸벅, 대나무를 끌어안고 잠깐 잔다
            double T = S.t; S.standF(a); boolean zz = u > .12 && u < .93; a.pose = zz ? 1 : 0; a.sy = 1 + (zz ? Math.sin(T * 2.3) * .014 : 0); a.ang = zz ? Math.sin(T * 1.1) * .03 : 0;
            if (zz && S.every(A, "zz", .6)) S.ptx("zzz", a.x + a.dir * S.HH(a) * .3, S.feetY(a) - S.HH(a) * .85, 1, po().a(-PI * .6, -PI * .4).s(6, 9).g(-4).l(1, 1.4).r(1));
            if (u > .94 && S.once(A, "wk")) S.say(a, "음냐… 더 잘래", 1.6);
        }, null);
        A_(S, "hooray", 3.2, null, (a, u, dt, A) -> {
            // 신나서 폴짝폴짝(활발!)
            double h = S.HH(a), T = S.t; S.standF(a); a.pose = u < .92 ? 2 : -1; a.y = -Math.abs(Math.sin(T * 6.6)) * 9; a.sy = 1 + .03 * Math.sin(T * 13.2);
            if (S.every(A, "sp", .22)) S.ptx("spark", a.x + (S.rnd() - .5) * h * .9, S.feetY(a) - h * (.5 + S.rnd() * .6), 1, po().a(-PI * .8, -PI * .2).s(8, 16).g(0).l(.3, .5).r(.9));
            if (u > .05 && S.once(A, "sy")) S.say(a, "야호! 신난다!", 1.8);
        }, null);
        // ── 아기하마(뽀송): 꽃을 사랑하는 깔끔쟁이 · 신발 수집가 ──
        A_(S, "sniff", 3.8, null, (a, u, dt, A) -> {
            // 데이지 한 송이를 코에 대고 킁킁(자세 6) — 향기가 좋아서 하트
            double h = S.HH(a), T = S.t; S.standF(a); a.pose = u > .06 && u < .92 ? 6 : 0; a.sy = 1 + (a.pose == 6 ? Math.sin(T * 7) * .012 : 0); a.ang = a.pose == 6 ? Math.sin(T * 3.1) * .025 : 0;
            if (u > .2 && S.every(A, "hh", .7)) S.ptx("heart", a.x + a.dir * h * .35, S.feetY(a) - h * .85, 1, po().a(-PI * .9, -PI * .1).s(14, 26).g(30).l(.9, 1.3).r(1).jx(5));
            if (u > .1 && S.once(A, "sy")) S.say(a, "꽃 향기 좋아~", 2.2);
        }, null);
        A_(S, "shoeshow", 3.4, null, (a, u, dt, A) -> {
            // 한 발을 번쩍 들어 새 신발 자랑(자세 7) — 반짝반짝
            double h = S.HH(a), T = S.t; S.standF(a); boolean sh = u > .08 && u < .9; a.pose = sh ? 7 : 0; a.ang = sh ? Math.sin(T * 5) * .035 : 0; a.y = sh ? -Math.abs(Math.sin(T * 5)) * 1.2 : 0;
            if (sh && S.every(A, "sp", .16)) S.ptx("spark", a.x + a.dir * h * .45, S.feetY(a) - h * .12 - S.rnd() * h * .12, 1, po().a(-PI * .85, -PI * .15).s(8, 16).g(0).l(.3, .5).jx(4).r(.9));
            if (u > .12 && S.once(A, "sy")) S.say(a, "새 신발이에요!", 2.2);
        }, null);
        A_(S, "sparkle", 3.4, null, (a, u, dt, A) -> {
            // 깨끗한 게 최고! 몸을 털고 반짝반짝 윤을 낸다
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .06 && u < .9; a.pose = on ? 2 : -1; a.y = on ? -Math.abs(Math.sin(T * 5.4)) * 5 : 0; a.ox = on ? Math.sin(T * 10.8) * 1.2 : 0;
            if (on && S.every(A, "sp", .12)) S.ptx("spark", a.x + (S.rnd() - .5) * h * .9, S.feetY(a) - h * (.15 + S.rnd() * .8), 1, po().a(-PI * .9, -PI * .1).s(6, 14).g(0).l(.3, .55).r(1));
            if (u > .1 && S.once(A, "sy")) S.say(a, "깨끗한 게 최고!", 2.0);
        }, null);

        // ── 놓았을 때 연출(land) — 어떤 연출인지는 엔진(traits[id].land) 값 ──
        A_(S, "flyaway", 3.6, (a, t, A) -> {
            A.alt0 = clamp(a.altStart != 0 ? a.altStart : 14, 14, 160); a.alt = A.alt0; double W = S.W; A.x0 = a.x; A.z0 = a.z;
            A.tx = clamp(a.x + (a.x < W / 2 ? 1 : -1) * S.rnd(.3, .55) * W, a.w * .6, W - a.w * .6); A.tz = S.rnd(.1, .95); A.dir0 = a.dir;
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; a.pvy = -h * .5; a.y = 0;
            if (u < .2) { double p = u / .2; a.alt = 12 + (A.alt0 - 12) * (1 - p * p); a.ang = .32 * p; a.fr += dt * a.D.fps * .3; }
            else if (u < .32) {
                double q = ease((u - .2) / .12); a.alt = 12 + 18 * q; a.ang = .32 * (1 - q) - .08 * q; a.fr += dt * a.D.fps * 1.4;
                if (S.once(A, "o")) { S.say(a, "푸득!", 1.2); S.ptx("puff", a.x, S.feetY(a) - 6, 4, po().a(-PI, 0).s(10, 20).g(10).jx(h * .3)); }
            } else if (u < .82) {
                double m = ease((u - .32) / .5); a.x = A.x0 + (A.tx - A.x0) * m; a.z = A.z0 + (A.tz - A.z0) * m; a.dir = A.tx >= A.x0 ? 1 : -1; a.alt = 30 + Math.sin(T * 4) * 3; a.ang = -.05; a.fr += dt * a.D.fps * 1.3;
            } else if (u < .96) {
                double d = ease((u - .82) / .14); a.alt = 30 * (1 - d); a.ang = 0; a.fr += dt * a.D.fps * .7;
                if (d > .8 && S.once(A, "td")) { S.ptx("dust", a.x, S.feetY(a) - 1, 5, po().a(-PI * .9, -PI * .1).s(10, 22)); S.haptic("land_fly"); }
            } else { a.alt = 0; S.standF(a); }
        }, (a, A) -> { a.alt = a.altSave != 0 ? a.altSave : 18; });
        registerWx(S);
        registerMo(S);
        registerMo2(S);
        registerDrop(S);
        applyCells(S);
    }


    /**
     * ★ 나머지 여섯 친구(돌솜·뽀푸·러블·두덩·술·챙챙)의 고화질 3D 전용 동작 시트(<id>_act, 4×4=16칸)를 동작별로 어느 구간에 쓰는지.
     *   각 항목 = {시작u, 끝u, 칸A, 자세(옛 설치 대비), [칸B, 초당 번갈음 횟수, 칸A 비율]}. 없는 구간·시트가 없는 옛 설치는 원래 그림(자세/걷기 시트) 그대로.
     *   칸: 강아지(돌솜·뽀푸)·고양이(러블) 0 앉기 1 앞발 모음 2 아우~ 3 킁킁 4 두리번 5 낮잠 6 엎드림 7·8 달리기 9 놀자 10 긁기 11 짖기 12 덮치기 13 와작 14 점프 15 신남
     *       두더지(두덩) 0 앉기 1 만세 2·3 삽질 4 빼꼼 5 기지개 6 킁킁 7 깜짝 8 어질 9 인사 10·11 달리기 12 손흔들기 13 시무룩 14 낮잠 15 덜덜
     *       독수리(술) 0 앉기 1 졸기 2·3 날갯짓 4 활공 5 급강하 6 꾸욱 7 부풀림 8 깃 다듬기 9 착지 10 이륙 11 날개 펴기 12 두리번 13 깡충 14 시무룩 15 신남
     *       올챙이(챙챙) 0 둥실 1 빙글 2 잠수 3 점프 4 방울 5 잠 6 꼬물 7 깜짝 8 손흔들기 9 시무룩 10 질주 11 하품 12 데굴 13 신남 14 빼꼼 15 덜덜
     */
    static final java.util.Map<String, double[][]> CELLS = new java.util.LinkedHashMap<>();
    private static void cs(String n, double[]... seg) { CELLS.put(n, seg); }
    static {
        // 돌솜
        cs("shake", new double[]{0, 1, 4, -1});
        cs("tailchase", new double[]{0, .74, 7, -1, 8, 6}, new double[]{.74, 1, 0, 0});
        cs("loaf", new double[]{0, .5, 6, -1}, new double[]{.5, 1, 5, 1});
        cs("ball", new double[]{0, .62, 7, -1, 8, 5}, new double[]{.62, .78, 12, -1}, new double[]{.78, 1, 15, 2});
        cs("mirror", new double[]{.1, .92, 11, -1, 4, 1.6, .4});
        cs("sit", new double[]{.08, .58, 0, 0}, new double[]{.58, 1, 15, 2});
        cs("howl", new double[]{.1, .88, 2, 0});
        cs("snuffle", new double[]{0, .72, 3, -1}, new double[]{.72, 1, 4, 2});
        cs("rollover", new double[]{0, .16, 9, -1}, new double[]{.16, .34, 14, -1}, new double[]{.34, .72, 15, 2}, new double[]{.72, .9, 14, -1}, new double[]{.9, 1, 15, 2});
        cs("zoomies", new double[]{0, 1, 7, -1, 8, 7});
        // 뽀푸
        cs("dig", new double[]{0, .45, 9, -1, 10, 5}, new double[]{.45, .84, 10, -1, 9, 8}, new double[]{.84, 1, 15, 2});
        cs("bone", new double[]{0, .35, 3, -1}, new double[]{.35, 1, 13, 2});
        cs("dance", new double[]{.08, .92, 15, 2, 9, 3});
        cs("slide", new double[]{0, 1, 12, -1});
        cs("dive", new double[]{0, .4, 7, -1, 8, 6}, new double[]{.4, .62, 14, -1}, new double[]{.62, 1, 15, 2});
        cs("beg", new double[]{.08, .9, 1, 0});
        cs("scratch", new double[]{.08, .88, 10, 0});
        cs("bark", new double[]{.06, .92, 11, -1, 4, 2.3, .28});
        cs("frisbee", new double[]{0, .5, 7, -1, 8, 6}, new double[]{.5, .68, 14, -1}, new double[]{.68, 1, 15, 2});
        cs("chew", new double[]{.08, .9, 13, 0});
        // 러블
        cs("punch", new double[]{.08, .92, 12, -1, 9, 6});
        cs("box", new double[]{.3, .46, 14, -1}, new double[]{.46, .9, 0, 0});
        cs("stretch", new double[]{0, .6, 9, -1}, new double[]{.6, 1, 0, 0});
        cs("melt", new double[]{.2, .42, 6, -1}, new double[]{.42, .9, 5, 1});
        cs("pounce", new double[]{0, .2, 9, -1}, new double[]{.2, .72, 14, -1}, new double[]{.72, 1, 15, 2});
        cs("groom", new double[]{.1, .9, 1, 0, 10, 2});
        cs("purr", new double[]{.1, .9, 5, 1});
        cs("knead", new double[]{.1, .9, 9, -1, 6, 3});
        cs("yarn", new double[]{.1, .4, 3, -1}, new double[]{.4, .8, 12, -1, 9, 6}, new double[]{.8, 1, 15, 2});
        cs("cuke", new double[]{0, .4, 4, -1}, new double[]{.4, .7, 14, -1}, new double[]{.7, 1, 4, -1});
        // 두덩
        cs("shades", new double[]{.3, 1, 0, 0});
        cs("flag", new double[]{.26, .5, 0, 0}, new double[]{.5, .92, 1, 2});
        cs("lens", new double[]{.14, .84, 6, -1});
        cs("dust", new double[]{0, .62, 15, -1}, new double[]{.62, 1, 0, 0});
        cs("vanish", new double[]{0, .5, 12, -1});
        cs("digdig", new double[]{.08, .9, 2, -1, 3, 2.8});
        cs("lantern", new double[]{.1, .9, 12, -1});
        cs("popup", new double[]{0, 1, 4, -1});
        cs("nap", new double[]{.1, .9, 14, 1});
        cs("treasure", new double[]{0, .4, 6, -1}, new double[]{.4, .7, 2, -1, 3, 3}, new double[]{.7, 1, 1, 2});
        // 술
        cs("stumble", new double[]{.36, .74, 7, -1});
        cs("preen", new double[]{.1, .9, 8, 0});
        cs("flapshow", new double[]{.1, .9, 11, -1, 2, 2.5});
        cs("scan", new double[]{.1, .9, 12, -1});
        cs("soar", new double[]{.1, .9, 4, -1});
        cs("swoop", new double[]{.2, .6, 5, -1});
        // 챙챙
        cs("dash", new double[]{0, 1, 10, -1});
        cs("flop", new double[]{0, .4, 3, -1}, new double[]{.4, .8, 12, -1}, new double[]{.8, 1, 5, 1});
        cs("hide", new double[]{.1, .9, 14, -1});
        cs("bubbles", new double[]{.1, .9, 4, -1});
        cs("dew", new double[]{.1, .86, 0, -1});
        cs("wiggle", new double[]{0, 1, 6, -1});
        cs("leap", new double[]{.2, .7, 3, -1});
        cs("whirl", new double[]{0, 1, 1, -1, 12, 4});
        cs("tailsplash", new double[]{0, 1, 10, -1, 6, 3});
    }

    /** register 끝에서 한 번: 위 표대로 동작마다 전용 시트 칸을 정한다(원래 몸짓·소품·말풍선은 그대로, 그림 칸만 바꾼다). */
    static void applyCells(final SceneCore S) {
        for (java.util.Map.Entry<String, double[][]> e : CELLS.entrySet()) {
            final SceneCore.Act ac = S.ACT.get(e.getKey()); if (ac == null || ac.step == null) continue;
            final SceneCore.Step orig = ac.step; final double[][] sg = e.getValue();
            ac.step = (a, u, dt, A) -> {
                orig.f(a, u, dt, A);
                if (a.intro) return;
                for (double[] s : sg) {
                    if (u < s[0] || u >= s[1]) continue;
                    int c = (int) s[2];
                    if (s.length > 4 && s[4] >= 0) { double ph = (S.t - A.t0) * s[5]; ph -= Math.floor(ph); if (ph >= (s.length > 6 ? s[6] : .5)) c = (int) s[4]; }
                    cell(a, c, (int) s[3]); break;
                }
            };
        }
    }

    /** 전용 동작 시트(<id>_act)가 있으면 그 칸을, 없으면(옛 설치) 자세 시트 칸으로 대신 그린다(둘 다 a.cell/a.pose 를 같이 정한다). */
    static void cell(Actor a, int cell, int pose) { a.cell = cell; a.pose = pose; }

    /**
     * ★ 쮸르(죽순이)·베비히포(뽀송)의 전용 동작 10가지씩 + 놓았을 때 연출(L_tumble·L_hose) + 놀라 달아나기(flee).
     *   칸 번호: juksun_act = 0 웅크림 · 1 버둥 · 2 쭈그림 · 3 두리번 · 4 킁킁 · 5 찾았다 · 6 기지개 · 7 빼꼼 · 8 배 두드림 · 9 하품 · 10·11 쿵푸 · 12·13 재채기 · 14 오물오물 · 15 만세
     *            bbosong_act = 0 버둥 · 1 물대포 아래로 · 2 쭈그림 · 3 물대포 앞으로 · 4 으쓱 · 5 분수 · 6·7 탭댄스 · 8 하품 · 9 신발 갈아신기 · 10 닦기 · 11 머리꽃 · 12 신발 자랑 · 13 반짝 · 14 킁킁 · 15 후~
     *   무엇을 어떤 순서로 하는지는 엔진(traits)이 정한 이름이고, 여기는 그 이름대로 그리는 곳뿐이다.
     */
    static void registerMo(final SceneCore S) {
        // ── 쮸르(죽순이) ──
        A_(S, "roll", 3.6, (a, t, A) -> { A.tx = S.aheadX(a, 70 + S.rnd() * 40); }, (a, u, dt, A) -> {
            // 몸을 동그랗게 말아 데굴데굴 굴러간다
            double h = S.HH(a), T = S.t; S.standF(a);
            if (u < .1) { cell(a, 2, 0); a.sy = .9 + .1 * (u / .1); if (S.once(A, "sy")) S.say(a, "데굴데굴~!", 2.2); }
            else if (u < .84) {
                cell(a, 0, 2); a.pvy = -h * .5; a.ang = (T - A.t0 - .36) * 9.5; a.y = 0;
                if (S.moveX(a, A.tx, a.spd * 1.55, dt)) { A.tx = S.aheadX(a, 70 + S.rnd() * 40); }
                if (S.every(A, "dt", .13)) S.ptx("dust", a.x - a.dir * h * .22, S.feetY(a) - 1, 1, po().a(-PI * .9, -PI * .1).s(8, 18));
            } else {
                cell(a, 15, 2); a.y = -Math.abs(Math.sin((u - .84) / .16 * PI * 2)) * 4;
                if (S.once(A, "h")) S.ptx("heart", a.x, S.feetY(a) - h * .8, 3, po().a(-PI * .98, -PI * .02).s(24, 50).g(55).l(.9, 1.3).r(1).jx(5));
            }
        }, null);
        A_(S, "twirl", 3.4, null, (a, u, dt, A) -> {
            // 대나무를 번쩍 들어 빙글빙글 돌린다
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .9; cell(a, on ? 6 : -1, on ? 2 : -1);
            if (on) {
                a.ang = Math.sin(T * 5) * .03; a.y = -Math.abs(Math.sin(T * 5)) * 1.5;
                Prop bp = S.prop("bamboo", h * .34, -h * 1.0); bp.r = T * 10; S.pr(a, bp);
                if (S.every(A, "sp", .2)) S.ptx("spark", a.x + a.dir * h * .34 + (S.rnd() - .5) * h * .8, S.feetY(a) - h * (.9 + S.rnd() * .4), 1, po().a(-PI * .85, -PI * .15).s(8, 16).g(0).l(.3, .5).r(.9));
            }
            if (u > .1 && S.once(A, "sy")) S.say(a, "빙글빙글~ 대나무 돌리기!", 2.2);
        }, null);
        A_(S, "peek", 3.4, null, (a, u, dt, A) -> {
            // 두리번두리번 살피다 빼꼼
            double T = S.t; S.standF(a);
            if (u < .3) { cell(a, 3, 0); a.dir = A.d0; }
            else if (u < .62) { cell(a, 3, 0); a.dir = -A.d0; }
            else { cell(a, 7, 0); a.dir = A.d0; a.sy = 1 + Math.sin(T * 6) * .012; }
            if (u > .04 && S.once(A, "q")) S.say(a, "뭐가 있나~?", 1.6);
            if (u > .66 && S.once(A, "e")) S.say(a, "빼꼼! 아무도 없네", 1.8);
        }, null);
        A_(S, "bellypat", 4.0, null, (a, u, dt, A) -> {
            // 배불러서 앉아 배를 통통 두드린다
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .92; cell(a, on ? 8 : -1, on ? 0 : -1);
            if (on) {
                double b = Math.max(0, Math.sin(T * 9)); a.sy = 1 - .035 * b; a.sx = 1 + .03 * b;
                if (S.every(A, "pt", .7)) S.ptx("note", a.x + a.dir * h * .3, S.feetY(a) - h * .7, 1, po().a(-PI * .75, -PI * .25).s(10, 18).g(-6).l(.8, 1.1).r(1));
            }
            if (u > .1 && S.once(A, "sy")) S.say(a, "배불러~ 퉁퉁!", 2.4);
            if (u > .88 && S.once(A, "hh")) S.ptx("heart", a.x, S.feetY(a) - h * .8, 3, po().a(-PI * .98, -PI * .02).s(24, 54).g(55).l(.9, 1.4).r(1.2).jx(5));
        }, null);
        A_(S, "yawn", 4.2, null, (a, u, dt, A) -> {
            // 하아암~ 큰 하품 뒤에 기지개
            double h = S.HH(a), T = S.t; S.standF(a);
            if (u < .08) cell(a, -1, -1);
            else if (u < .56) { cell(a, 9, 0); a.sy = 1 + .02 * Math.sin((u - .08) / .48 * PI); }
            else if (u < .9) { cell(a, 6, 2); a.sy = 1 + .03 * Math.sin((u - .56) / .34 * PI); }
            if (u > .1 && u < .56 && S.every(A, "zz", .8)) S.ptx("zzz", a.x + a.dir * h * .3, S.feetY(a) - h * .85, 1, po().a(-PI * .6, -PI * .4).s(6, 9).g(-4).l(1, 1.4).r(1));
            if (u > .12 && S.once(A, "sy")) S.say(a, "하아암~", 1.8);
            if (u > .58 && S.once(A, "st")) S.say(a, "으아~ 시원하다!", 1.6);
        }, null);
        A_(S, "kungfu", 3.6, null, (a, u, dt, A) -> {
            // 쿵푸 자세 — 한 발 들고 서서(10) 앞으로 내지른다(11)
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .06 && u < .92; double ph = (T - A.t0) * 2.6; boolean strike = (int) Math.floor(ph) % 2 == 1;
            cell(a, on ? (strike ? 11 : 10) : -1, on ? 2 : -1);
            if (on) {
                a.ox = strike ? a.dir * 3.5 : 0; a.y = strike ? -1.2 : 0;
                if (strike && S.every(A, "sk", .38)) { S.ptx("spark", a.x + a.dir * h * .62, S.feetY(a) - h * .55, 2, po().a(a.dir > 0 ? -.7 : PI - .7, a.dir > 0 ? .7 : PI + .7).s(12, 24).g(0).l(.25, .4).jy(6).r(1.1)); S.say(a, "하이얍!", .5); }
            }
            if (u > .94 && S.once(A, "e")) S.say(a, "쿵푸 판다!", 1.2);
        }, null);
        A_(S, "sneeze", 3.2, null, (a, u, dt, A) -> {
            // 에… 에… 에취! (코가 간질간질)
            double h = S.HH(a), T = S.t; S.standF(a);
            if (u < .44) { cell(a, 12, 0); double k = u / .44; a.sy = 1 + .035 * k; a.ang = -.05 * k + Math.sin(T * 30) * .006 * k; if (u > .08 && S.once(A, "a")) S.say(a, "에… 에…", 1.2); }
            else if (u < .64) {
                cell(a, 13, 0); a.ox = -a.dir * 3.5; a.sy = .94;
                if (S.once(A, "x")) {
                    S.say(a, "에취!!", 1.4); S.haptic("thud");
                    S.ptx("puff", a.x + a.dir * h * .6, S.feetY(a) - h * .5, 6, po().a(a.dir > 0 ? -.5 : PI - .5, a.dir > 0 ? .5 : PI + .5).s(26, 54).g(10).l(.3, .5).jy(5));
                    S.ptx("leaf", a.x + a.dir * h * .4, S.feetY(a) - h * .55, 4, po().a(a.dir > 0 ? -.6 : PI - .6, a.dir > 0 ? .6 : PI + .6).s(26, 50).g(90).l(.6, .9).jx(3).r(.8));
                }
            } else { cell(a, 12, 0); a.ang = -.03; if (u > .7 && S.once(A, "n")) S.say(a, "…훌쩍. 감기 걸렸나", 1.8); }
        }, null);
        // ── 놓았을 때: 죽순을 공중에 떨어뜨리고 앞구르기 → 착지 → 죽순 찾으러 가기 ──
        A_(S, "L_tumble", 1.3, (a, t, A) -> {
            S.ptx("dirt", a.x, S.feetY(a) - 2, 6, po().a(-PI * .95, -PI * .05).s(14, 30).g(150).l(.35, .6).jx(8));
            S.ptx("star", a.x, S.feetY(a) - S.HH(a) * .9, 3, po().a(-PI * .95, -PI * .05).s(14, 30).g(40).l(.6, .9).r(.9).jx(8));
            S.say(a, "어이쿠! 내 죽순!", 1.8); a.chain = "search";
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.sk = "juksun_nb";
            if (u < .45) { cell(a, 2, 0); a.sy = .86 + .14 * ease(u / .45); a.sx = 1.1 - .1 * ease(u / .45); }
            else { cell(a, 3, 0); a.ang = Math.sin(T * 7) * .04; S.pr(a, S.prop("stars", 0, -h * 1.06)); }
        }, null);
        A_(S, "search", 9.0, (a, t, A) -> { A.mx = 0; A.lx = t; A.dir0 = a.dir; }, (a, u, dt, A) -> {
            // 두리번 → 킁킁 → 걸어가서 → 집어 들고 "찾았다!"
            double h = S.HH(a), T = S.t; SceneCore.Bam b = S.bamOf(a); S.standF(a); a.sk = "juksun_nb";
            int ph = (int) A.mx; double pe = T - A.lx;
            if (b == null && !(ph == 3 && A.on.containsKey("pick"))) { A.dur = (T - A.t0) + .01; return; }          // 대나무가 사라졌다(잡혀서 옮겨짐 등) — 찾기를 접는다
            if (ph == 0) {
                cell(a, 3, 0); a.dir = pe < .65 ? A.dir0 : -A.dir0; if (S.once(A, "q")) S.say(a, "어디 갔지…?", 1.4);
                if (pe > 1.3) { A.mx = 1; A.lx = T; a.dir = b.x >= a.x ? 1 : -1; }
            } else if (ph == 1) {
                cell(a, 4, 0); a.dir = b.x >= a.x ? 1 : -1; a.ang = Math.sin(T * 9) * .02; if (S.once(A, "sn")) S.say(a, "킁킁… 이쪽이다!", 1.2);
                if (pe > 1.1) { A.mx = 2; A.lx = T; }
            } else if (ph == 2) {
                a.cell = -1; double tx = b.x - (b.x >= a.x ? 1 : -1) * h * .34;
                if (S.moveX(a, tx, a.spd * 1.3, dt) || pe > 6.5) { a.x = tx; A.mx = 3; A.lx = T; a.dir = b.x >= a.x ? 1 : -1; }
            } else {
                if (pe < .35) { cell(a, 2, 0); a.sy = .9; double q = ease(pe / .35); b.x += (a.x + a.dir * h * .3 - b.x) * q * .5; b.y += (S.feetY(a) - h * .45 - b.y) * q * .5; b.rot += (1.2 * a.dir - b.rot) * q * .5; }
                else {
                    if (S.once(A, "pick")) { b.taken = true; S.say(a, "찾았다! 내 죽순!", 2.0); S.haptic("hearts"); S.ptx("heart", a.x, S.feetY(a) - h * .85, 5, po().a(-PI * .98, -PI * .02).s(24, 54).g(55).l(.9, 1.4).r(1.2).jx(5)); }
                    cell(a, 5, 2); a.sk = null; a.y = -Math.abs(Math.sin((pe - .35) * 9)) * 4;
                }
                if (pe > 1.7) A.dur = (T - A.t0) + .01;
            }
        }, null);

        // ── 베비히포(뽀송) ──
        A_(S, "fountain", 3.6, null, (a, u, dt, A) -> {
            // 고개를 젖히고 입으로 분수를 뿜는다
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .1 && u < .88; cell(a, on ? 5 : -1, on ? 0 : -1);
            if (on) {
                double mx = a.x + a.dir * h * .3, my = S.feetY(a) - h * .92; S.pr(a, S.jetProp(mx, my, mx + a.dir * 3, my - h * (.55 + .12 * Math.sin(T * 12))));
                if (S.every(A, "dr", .08)) S.ptx("drop", mx + a.dir * 3, my - h * .55, 1, po().a(-PI * .85, -PI * .15).s(10, 30).g(190).l(.5, .8).jx(2));
            }
            if (u > .12 && S.once(A, "sy")) S.say(a, "쏴아~ 분수 쇼!", 2.0);
            if (u > .9 && S.once(A, "sp")) S.ptx("spark", a.x, S.feetY(a) - h * .9, 4, po().a(-PI, 0).s(12, 26).g(0).l(.3, .5).jx(h * .3).r(1));
        }, null);
        A_(S, "tapdance", 3.8, null, (a, u, dt, A) -> {
            // 새 신발로 탭탭탭 탭댄스
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .06 && u < .92; double ph = (T - A.t0) * 4.6; boolean r2 = (int) Math.floor(ph) % 2 == 1;
            cell(a, on ? (r2 ? 7 : 6) : -1, on ? 2 : -1);
            if (on) {
                a.y = -Math.abs(Math.sin(ph * PI)) * 2.4; a.ox = Math.sin(ph * PI * .5) * 1.6;
                if (S.every(A, "tp", .22)) S.ptx("spark", a.x + (r2 ? -1 : 1) * h * .3, S.feetY(a) - 1, 1, po().a(-PI * .9, -PI * .1).s(8, 16).g(0).l(.25, .4).r(.9));
                if (S.every(A, "nt", .6)) S.ptx("note", a.x + a.dir * h * .35, S.feetY(a) - h * 1.0, 1, po().a(-PI * .7, -PI * .3).s(12, 20).g(-6).l(.9, 1.3).r(1).jx(6));
            }
            if (u > .08 && S.once(A, "sy")) S.say(a, "탭탭탭~ 신발 소리 좋다!", 2.2);
        }, null);
        A_(S, "blowbub", 3.8, null, (a, u, dt, A) -> {
            // 후~ 비눗방울을 불어 날린다
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .1 && u < .88; cell(a, on ? 15 : -1, on ? 0 : -1);
            if (on) {
                a.sy = 1 + Math.sin(T * 5) * .012;
                if (S.every(A, "bb", .2)) S.ptx("bub", a.x + a.dir * h * .38, S.feetY(a) - h * .62, 1, po().a(a.dir > 0 ? -.55 : PI - .55, a.dir > 0 ? -.1 : PI - .1).s(14, 34).g(-26).l(1.4, 2.2).r(1 + S.rnd() * 1.4).jx(2));
            }
            if (u > .12 && S.once(A, "sy")) S.say(a, "후~ 비눗방울이다!", 2.2);
        }, null);
        A_(S, "gape", 3.6, null, (a, u, dt, A) -> {
            // 하마답게 입을 쩌억~ 크게 하품
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .1 && u < .84; cell(a, on ? 8 : -1, on ? 0 : -1);
            if (on) { double k = Math.sin((u - .1) / .74 * PI); a.sy = 1 + .03 * k; a.ang = -.03 * k; }
            if (on && S.every(A, "zz", .8)) S.ptx("zzz", a.x + a.dir * h * .3, S.feetY(a) - h * .85, 1, po().a(-PI * .6, -PI * .4).s(6, 9).g(-4).l(1, 1.4).r(1));
            if (u > .14 && S.once(A, "sy")) S.say(a, "하아~암! 졸려요", 2.0);
        }, null);
        A_(S, "shoeswap", 4.2, null, (a, u, dt, A) -> {
            // 앉아서 신발을 갈아 신어 본다 — 이것도 예쁘고 저것도 예뻐!
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .06 && u < .92; boolean alt = (int) Math.floor((T - A.t0) / .85) % 2 == 1;
            cell(a, on ? (alt ? 12 : 9) : -1, on ? 7 : -1);
            if (on && S.every(A, "sp", .2)) S.ptx("spark", a.x + a.dir * h * .1 + (S.rnd() - .5) * h * .5, S.feetY(a) - h * .12 - S.rnd() * h * .14, 1, po().a(-PI * .85, -PI * .15).s(8, 16).g(0).l(.3, .5).r(.9));
            if (u > .1 && S.once(A, "sy")) S.say(a, "이 신발도 예쁘고~", 1.8);
            if (u > .56 && S.once(A, "s2")) S.say(a, "저 신발도 예쁘다!", 1.8);
        }, null);
        A_(S, "polish", 3.6, null, (a, u, dt, A) -> {
            // 허리를 굽혀 신발을 쓱쓱 닦아 반짝반짝
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .06 && u < .9; cell(a, on ? 10 : -1, on ? 0 : -1);
            if (on) {
                a.ox = Math.sin(T * 13) * 1.4; a.sy = 1 - .015 * Math.abs(Math.sin(T * 13));
                if (S.every(A, "sp", .14)) S.ptx("spark", a.x + a.dir * h * .3 + (S.rnd() - .5) * h * .3, S.feetY(a) - h * .12 - S.rnd() * h * .1, 1, po().a(-PI * .9, -PI * .1).s(8, 18).g(0).l(.3, .5).r(1));
            }
            if (u > .1 && S.once(A, "sy")) S.say(a, "쓱쓱~ 반짝반짝 닦자!", 2.2);
        }, null);
        A_(S, "flower", 3.4, null, (a, u, dt, A) -> {
            // 머리의 데이지 꽃을 매만지며 으쓱
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .9; cell(a, on ? 11 : -1, on ? 2 : -1);
            if (on) { a.ang = Math.sin(T * 3.2) * .02; a.y = -Math.abs(Math.sin(T * 4)) * 1.2; }
            if (on && S.every(A, "hh", .8)) S.ptx("heart", a.x + a.dir * h * .2, S.feetY(a) - h * 1.0, 1, po().a(-PI * .9, -PI * .1).s(14, 26).g(30).l(.9, 1.3).r(1).jx(5));
            if (u > .1 && S.once(A, "sy")) S.say(a, "내 꽃이 제일 예쁘죠?", 2.2);
        }, null);
        // ── 놓았을 때: 입에서 땅으로 물대포로 안전하게 착지 → 주변 친구들에게 물대포 발사 → 친구들이 놀라 도망 ──
        A_(S, "L_hose", 1.4, (a, t, A) -> {
            SceneCore.Gfx pg = S.gfx("puddle", a.x, a.z, 3.4); pg.r = 13; S.addGfx(pg);
            S.ptx("splash", a.x, S.feetY(a) - 1, 8, po().a(-PI * .95, -PI * .05).s(20, 50).g(170).l(.35, .7).jx(7)); S.ptx("ring", a.x, S.feetY(a), 1, po().a(0, 0).s(0, 0).g(0).l(.8, .8));
            S.say(a, "사뿐~ 안전 착지!", 1.5); a.chain = "squirt";
        }, (a, u, dt, A) -> {
            S.standF(a);
            if (u < .5) { cell(a, 2, 0); a.sy = .86 + .14 * ease(u / .5); a.sx = 1.1 - .1 * ease(u / .5); } else { cell(a, 4, 2); a.ang = Math.sin(S.t * 6) * .02; }
        }, null);
        A_(S, "squirt", 9.0, (a, t, A) -> {
            java.util.List<Actor> L = new java.util.ArrayList<>();
            for (Actor o : S.actors) if (o != a && !o.dead && !o.hidden && !o.hero && o.vis && !o.leaving) L.add(o);
            final double ax = a.x; java.util.Collections.sort(L, (p, q) -> Double.compare(Math.abs(p.x - ax), Math.abs(q.x - ax)));
            A.tg = new java.util.ArrayList<>(L.subList(0, Math.min(3, L.size()))); A.lx = t;
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, e = T - A.t0; S.standF(a); int n = A.tg.size();
            double fire0 = .8, per = .95, fireEnd = fire0 + (n == 0 ? 1.3 : per * n);
            double mx = a.x + a.dir * h * .3, my = S.feetY(a) - h * .6;
            if (e < fire0) {
                cell(a, 3, 0); if (n > 0) a.dir = A.tg.get(0).x >= a.x ? 1 : -1; a.sx = 1 + .05 * Math.sin(e * 24) * (e / fire0); if (S.once(A, "rd")) S.say(a, "이번엔 내 차례! 물대포~!", 2.0);
            } else if (e < fireEnd) {
                double fe = e - fire0;
                if (n == 0) {
                    cell(a, 5, 0); S.pr(a, S.jetProp(mx, my, mx + a.dir * h * 1.4, my - h * .5)); if (S.once(A, "sy")) { S.say(a, "쏴아~!", 1.2); S.haptic("squirt"); }
                } else {
                    int i = Math.min(n - 1, (int) Math.floor(fe / per)); Actor o = A.tg.get(i); cell(a, 3, 0); a.dir = o.x >= a.x ? 1 : -1;
                    mx = a.x + a.dir * h * .3; double tx = o.x + o.ox, ty = S.feetY(o) - S.HH(o) * .5 + o.y, k = clamp((fe - i * per) / .14, .05, 1);
                    S.pr(a, S.jetProp(mx, my, mx + (tx - mx) * k, my + (ty - my) * k));
                    if (S.once(A, "st" + i)) { S.startle(a, o); S.haptic("squirt"); }
                    if (k >= 1 && S.every(A, "sp", .09)) S.ptx("splash", tx, ty, 2, po().a(-PI * .95, -PI * .05).s(16, 40).g(170).l(.3, .6).jx(5));
                }
            } else {
                cell(a, 4, 2); a.ang = Math.sin(T * 6) * .02; if (S.once(A, "sm")) { S.say(a, "헤헤~ 시원하지?", 1.8); S.ptx("heart", a.x, S.feetY(a) - h * .8, 3, po().a(-PI * .98, -PI * .02).s(24, 50).g(55).l(.9, 1.3).r(1).jx(5)); }
                if (e > fireEnd + 1.2) A.dur = e + .01;
            }
        }, null);
        // ── 물대포를 맞은 친구들: 깜짝 놀라 달아난다 ──
        A_(S, "flee", 2.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, side = a.x >= A.fx ? 1 : -1; S.standF(a);
            if (u < .13) {
                a.dir = (int) -side; a.y = -Math.sin(PI * u / .13) * 10 * SceneCore.zs(a.z); a.sy = 1 + .08 * Math.sin(PI * u / .13);
                if (S.once(A, "bang")) { S.say(a, "!!", .9); S.ptx("sweat", a.x, S.feetY(a) - h * .9, 3, po().a(-PI * .85, -PI * .15).s(10, 22).g(120).l(.5, .8).jx(4)); }
            } else {
                double[] r = S.inRange(a); double tx = clamp(a.x + side * 220, r[0], r[1]); a.dir = (int) side;
                S.moveX(a, tx, a.spd * 2.4, dt); a.y = -Math.abs(Math.sin(T * 15)) * 2.2;
                if (S.once(A, "yell")) { int ln = (a.id.length() + a.ai) % 3; S.say(a, a.fearK.equals("scary") ? (ln == 0 ? "으악 무서워!" : ln == 1 ? "눈이 빛나!!" : "살려줘~!") : (ln == 0 ? "으앗, 차가워!" : ln == 1 ? "꺄악! 도망가자!" : "물이다~!"), 1.6); }
                if (S.every(A, "sw", .3)) S.ptx("sweat", a.x - side * h * .1, S.feetY(a) - h * .9, 1, po().a(-PI * .85, -PI * .15).s(8, 16).g(120).l(.4, .7).jx(3));
            }
        }, null);
    }


    /**
     * ★ s354 떨어뜨리기 연출(YJ 2026-10-30 "친구들을 떨어트릴때 모션 변경", 쮸르·베비히포는 그대로).
     *   어떤 연출인지는 엔진(traits[id].land)이 정하고, 여기는 그 이름(cotton·pose·dig·flip·fly·puddle)대로 그리는 곳뿐이다.
     *   cotton 둘숑 = 풍선 3배 → 하트 · pose 뽀푸 = 지진 착지+히힛 · dig 두덩 = 땅속 이동 후 점프 · flip 러블 = 어둠+노란 눈빛 · fly 독슐 = 친구 납치 비행(carry) · puddle 챙챙 = 꼬리 헬리콥터(heli)→화냄(rage)
     */
    static void registerDrop(final SceneCore S) {
        // ── 둘숑: 풍선처럼 3배로 부푼 몸이 땅에 닿는 순간 하트 모양으로 변한다 ──
        A_(S, "L_cotton", 3.0, (a, t, A) -> {
            double h = S.HH(a), fy = S.feetY(a);
            Gfx bh = S.gfx("bigheart", a.x, a.z, 2.3); bh.r = h * 2.35; S.addGfx(bh);
            S.ptx("heart", a.x, fy - h * 1.2, 12, po().a(-PI * .98, -PI * .02).s(40, 90).g(55).l(1.0, 1.7).r(1.5).jx(h * .8)); S.haptic("hearts");
            S.ptx("ring", a.x, fy, 1, po().a(0, 0).s(0, 0).g(0).l(.8, .8)); S.ptx("ring", a.x, fy, 1, po().a(0, 0).s(0, 0).g(0).l(.8, .8).delay(.15));
            S.ptx("dust", a.x, fy - 1, 6, po().a(-PI * .98, -PI * .02).s(14, 36).g(30).l(.4, .8).jx(h * .6));
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, tt = u * 3.0; S.standF(a); a.feetScale = true; a.pose = 2;
            double sh = ease(clamp((tt - .16) / .55, 0, 1)), out = ease(clamp((tt - 2.25) / .6, 0, 1)), base = 3 - 1.5 * sh - .5 * out;      // 3배 → 하트 크기 → 원래 몸
            a.heart = tt < .2 ? ease(tt / .2) : 1 - out;
            if (tt < .16) { double q = Math.sin(PI * tt / .16); a.sx = base + .35 * q; a.sy = base - .5 * q; }                              // 닿는 순간 납작
            else { double pl = 1 + .05 * Math.sin(T * 10) * (1 - out); a.sx = a.sy = base * pl; }
            if (out >= 1) { a.sx = a.sy = 1; a.heart = 0; a.feetScale = false; }
            if (tt > .25 && tt < 2.2 && S.every(A, "h", .22)) S.ptx("heart", a.x, S.feetY(a) - h * .9, 2, po().a(-PI * .98, -PI * .02).s(24, 60).g(55).l(.9, 1.5).r(1.2).jx(h * .6));
            if (tt > .5 && S.once(A, "sy")) { S.say(a, "두근두근~", 1.7); S.ptx("heart", a.x, S.feetY(a) - h * 1.2, 8, po().a(-PI * .98, -PI * .02).s(30, 70).g(55).l(.9, 1.5).r(1.3).jx(h * .7)); }
        }, null);

        // ── 뽀푸: 두 발로 멋지게 착지 — 땅이 갈라지고 흔들려 주변 친구가 깜짝 놀란 뒤, "히힛" 멋있는 척 ──
        A_(S, "L_pose", 4.6, (a, t, A) -> {
            double h = S.HH(a), fy = S.feetY(a);
            S.shake(8.5, 1.5); S.haptic("thud");
            S.ptx("dust", a.x, fy - 1, 14, po().a(-PI * .98, -PI * .02).s(26, 76).g(40).l(.5, 1.0).jx(h * .3).r(1.4));
            for (int i = 0; i < 3; i++) S.ptx("ring", a.x, fy, 1, po().a(0, 0).s(0, 0).g(0).l(.9, .9).delay(i * .13));
            Gfx cg = S.gfx("crack", a.x, a.z, 3.2); cg.r = h * 1.7; S.addGfx(cg);
            for (Actor o : new ArrayList<>(S.actors)) if (o != a && Math.abs(o.x - a.x) < S.W * .85) S.startleK(a, o, "shock");
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, tt = u * 4.6; S.standF(a);
            if (tt < .3) { double q = ease(tt / .3); a.sx = 1.2 - .2 * q; a.sy = .7 + .3 * q; }                                           // 쭈그려 착지
            else { a.sx = .98; a.sy = 1.05; }
            if (tt < .9 && S.every(A, "du", .16)) S.ptx("dust", a.x + (S.rnd() - .5) * h, S.feetY(a) - 1, 1, po().a(-PI * .98, -PI * .02).s(10, 30).g(30).l(.4, .8).jx(h * .4));
            if (tt >= 1.5) {
                a.pose = 2; a.ang = -.08 + Math.sin(T * 3) * .03;
                if (S.once(A, "p")) { S.say(a, "히힛~", 2.2); S.stk(a, "smirk", 2.6); S.haptic("grin"); S.ptx("spark", a.x, S.feetY(a) - h * .6, 8, po().a(-PI, 0).s(14, 30).g(0).l(.4, .7).jx(h * .35).jy(h * .3).r(1.2)); }
                double gb = ease(clamp((tt - 1.85) / .22, 0, 1)); if (gb > 0) { Prop gl = S.prop("glasses", h * .2, -h * .62); gl.s = 1.1 * gb; S.pr(a, gl); }
                if (tt > 2.2 && S.every(A, "gl", .32)) S.ptx("spark", a.x + a.dir * h * .28, S.feetY(a) - h * .66, 1, po().a(-PI, 0).s(4, 8).g(0).l(.3, .5).jx(4).r(1.2));
            }
            if (tt > 3.9) a.ang *= 1 - ease((tt - 3.9) / .7);
        }, null);

        // ── 두덩: 떨어지자마자 땅을 파고 들어가 → 땅속을 지나 → 다른 곳 구멍을 뚫고 높이 점프해 착지 ──
        A_(S, "L_dig", 5.4, (a, t, A) -> {
            double W = S.W, h = S.HH(a); A.x0 = a.x; A.z0 = a.z; double[] r = S.inRange(a); int sd = a.x < W / 2 ? 1 : -1;
            double lo = Math.max(r[0], W * .14), hi = Math.min(r[1], W * .86); if (hi < lo) { lo = r[0]; hi = r[1]; }
            A.tx = clamp(a.x + sd * S.rnd(.28, .42) * W, lo, hi); if (Math.abs(A.tx - a.x) < W * .15) A.tx = clamp(a.x - sd * S.rnd(.28, .42) * W, lo, hi);
            A.tz = a.hero ? a.z : S.rnd(.35, .92);
            A.g = S.addGfx(S.gfx("hole", a.x, a.z, 5.4 + 1.2)); A.m = null; A.b1 = null;
            S.ptx("dirt", a.x, S.feetY(a) - 2, 10, po().a(-PI * .95, -PI * .05).s(16, 38).g(150).jx(8)); S.haptic("thud");
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, tt = u * 5.4; S.standF(a); a.nograb = true;
            if (tt < .5) {                                                                                                             // 파고 들어간다
                if (tt < .12) a.sy = 1 - .15 * (tt / .12);
                a.y = h * 1.1 * ease(clamp((tt - .1) / .4, 0, 1)); a.cut = 0;
                if (S.every(A, "d", .1)) S.ptx("dirt", a.x, S.feetY(a) - 2, 3, po().a(-PI * .95, -PI * .05).s(8, 20).g(120).jx(5));
            } else if (tt < 2.6) {                                                                                                     // 땅속 이동 — 두둑이 움직인다
                a.vis = false; a.y = h * 1.1; a.cut = 0;
                if (A.m == null) { Gfx mg = S.gfx("mound", a.x, a.z, 3.0); mg.r = 9; A.m = S.addGfx(mg); }
                double m = ease(clamp((tt - .6) / 1.8, 0, 1)); a.x = A.x0 + (A.tx - A.x0) * m; a.z = A.z0 + (A.tz - A.z0) * m; a.dir = A.tx >= A.x0 ? 1 : -1;
                A.m.x = a.x; A.m.z = a.z; A.m.life = (S.t - A.m.t0) + .4;
                if (S.every(A, "ug", .09)) S.ptx("dirt", a.x - a.dir * h * .2, S.feetY(a) - 2, 2, po().a(-PI * .95, -PI * .05).s(8, 22).g(130).jx(5));
                if (S.every(A, "rb", .45)) S.haptic("thud");
            } else if (tt < 3.85) {                                                                                                    // 구멍을 뚫고 하늘로 높이 점프
                double q = (tt - 2.6) / 1.25, h4 = Math.max(h * 1.5, Math.min(h * 3.4, S.feetY(a) - h * 1.4 - 4));
                if (S.once(A, "ex")) {
                    if (A.m != null) A.m.life = (S.t - A.m.t0) + .12;
                    Gfx hg = S.gfx("hole", a.x, a.z, 3.6); A.b1 = S.addGfx(hg);
                    S.ptx("dirt", a.x, S.feetY(a) - 2, 14, po().a(-PI * .9, -PI * .1).s(30, 80).g(150).jx(6)); S.shake(3.2, .5); S.haptic("land_dig"); S.say(a, "짜잔~!", 1.0);
                }
                a.y = -h4 * (1 - (2 * q - 1) * (2 * q - 1)); a.pvy = a.y - h * .5; a.ang = PI2 * 2 * ease(q); a.cell = q > .42 && q < .62 ? 7 : 1; a.pose = 2;
                if (S.every(A, "tr", .1)) S.ptx("dirt", a.x, S.feetY(a) + a.y, 1, po().a(-PI * .9, -PI * .1).s(6, 14).g(100).l(.3, .5).jx(h * .3));
            } else if (tt < 4.25) {                                                                                                    // 착지
                double q = ease((tt - 3.85) / .32); a.sx = 1.2 - .2 * q; a.sy = .72 + .28 * q; a.cell = 0; a.pose = 0;
                if (S.once(A, "ld")) { S.shake(5.5, .8); S.haptic("thud"); S.ptx("dust", a.x, S.feetY(a) - 1, 12, po().a(-PI * .98, -PI * .02).s(24, 64).g(40).l(.5, .9).jx(h * .4)); S.ptx("ring", a.x, S.feetY(a), 1, po().a(0, 0).s(0, 0).g(0).l(.8, .8)); }
            } else {                                                                                                                   // 인사
                cell(a, 9, 2); double bn = Math.abs(Math.sin((tt - 4.25) * 6)); a.y = -bn * 3 * (tt < 5.0 ? 1 : 0);
                if (S.once(A, "hi")) { S.say(a, "두더지 등장!", 1.6); S.ptx("star", a.x, S.feetY(a) - h * .9, 6, po().a(-PI * .95, -PI * .05).s(20, 44).g(70).l(.5, .9).r(1).jx(h * .4)); }
            }
        }, (a, A) -> {
            a.y = 0; a.cut = Double.NaN; a.ang = 0; if (A.m != null) A.m.life = Math.min(A.m.life, S.t - A.m.t0 + .1);
            if (A.g != null) A.g.life = Math.min(A.g.life, S.t - A.g.t0 + 1.2); if (A.b1 != null) A.b1.life = Math.min(A.b1.life, S.t - A.b1.t0 + 1.4);
        });

        // ── 러블: 같은 자리에서 앞구르기 3번 착지(fallStep) → 앉아 노려보면 주변이 어두워지고 눈에서 노란 빛, 친구들은 무서워 도망간다 ──
        A_(S, "L_flip", 4.8, (a, t, A) -> {
            S.ptx("star", a.x, S.feetY(a) - S.HH(a) * .5, 6, po().a(-PI * .95, -PI * .05).s(18, 36).g(70).l(.5, .9).r(1).jx(6));
            S.ptx("dust", a.x, S.feetY(a) - 1, 5, po().a(-PI * .98, -PI * .02).s(14, 34).g(30).l(.4, .8).jx(S.HH(a) * .4));
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, tt = u * 4.8, fy = S.feetY(a); S.standF(a);
            if (tt < .3) { double q = ease(tt / .3); a.sx = 1.15 - .15 * q; a.sy = .76 + .24 * q; }
            if (tt > .45) { a.pose = 0; a.sy *= 1 + .012 * Math.sin(T * 2.2); }
            double dk = ease(clamp((tt - .35) / .9, 0, 1)) * (1 - ease(clamp((tt - 3.9) / .8, 0, 1)));
            if (dk > .01) S.dim(dk, a.x, fy - h * .5);
            double ea = ease(clamp((tt - .8) / .5, 0, 1)) * (1 - ease(clamp((tt - 3.9) / .7, 0, 1)));
            if (ea > .01) S.eyes(ea, a.x + a.dir * h * .14, fy - h * .56, a.x + a.dir * h * .36, fy - h * .56, h * .05, a.dir);
            if (tt > 1.0 && S.once(A, "sc")) {
                S.say(a, "…", 3.0); S.haptic("angry");
                for (Actor o : new ArrayList<>(S.actors)) if (o != a) S.startleK(a, o, "scary");
            }
        }, null);

        // ── 독슐: 고공낙하 → 친구를 안고 하늘로 → 한 바퀴 → 내려놓으면 친구가 어질어질 ──
        A_(S, "carry", 8.8, (a, t, A) -> {
            List<Actor> cs = new ArrayList<>(); for (Actor o : S.actors) if (o != a && !o.kind.equals("eagle") && S.freeFor(o)) cs.add(o);
            A.tgt = cs.isEmpty() ? null : cs.get(Math.min(cs.size() - 1, (int) (S.rnd() * cs.size())));
            A.alt0 = clamp(a.altStart != 0 ? a.altStart : 40, 24, 150); a.alt = A.alt0; A.x0 = a.x; A.z0 = a.z; A.dir0 = a.dir;
            if (A.tgt != null) { Actor o = A.tgt; o.chain = null; o.pr = null; o.cut = Double.NaN; o.fearK = ""; S.startAct(o, "carried"); if (o.act != null) o.act.tgt = a; A.px = o.x; A.tz = o.z; }
            else { A.px = clamp(a.x + (a.x < S.W / 2 ? 1 : -1) * S.W * .2, a.w * .6, S.W - a.w * .6); A.tz = a.z; }
            A.fr1 = false; A.px1 = A.px; A.pz1 = A.tz; A.pal1 = 0; A.pang1 = 0;
            double zs = SceneCore.zs(A.tz), h = S.HH(a); A.hx = h * .62;                                                                      // 안았을 때 친구가 매달리는 거리(px)
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, tt = u * 8.8, zs = SceneCore.zs(a.z), Le = a.D.lift; Actor o = A.tgt;
            if (o != null && (o.dead || o.held || o.act == null || !"carried".equals(o.act.n) || o.act.tgt != a)) { o = null; A.tgt = null; A.fr1 = false; }
            double lf = o != null ? o.D.lift : 0, hang = o != null ? A.hx : 0;
            double gAlt = (hang + lf * zs * zs) / zs - Le, loR = clamp(((S.feetY(a) - 14 - h * .9) / zs - Le - (gAlt + 20)) / 2, 18, 44);           // 낮은 화면에서도 위로 벗어나지 않게 반지름을 줄인다
            double bot = gAlt + 20, R = loR, altC = bot + R, Rpx = R * zs;
            double gx = A.px; int fd = gx < S.W / 2 ? 1 : -1; double cx = clamp(gx, Rpx + 14, S.W - Rpx - 14);
            double fx = a.x, fal = gAlt, ang = 0; int cl = 5; double th = 0; boolean att = false;
            a.pvy = -h * .5; a.nograb = true;
            if (tt < 1.3) {                                                                                                             // 고공낙하 → 친구를 향해 급강하
                double q = tt / 1.3; a.dir = gx >= A.x0 ? 1 : -1; fx = A.x0 + (gx - A.x0) * ease(q); a.z = A.z0 + (A.tz - A.z0) * ease(q);
                fal = gAlt + (A.alt0 - gAlt) * (1 - q * q); ang = q < .85 ? .95 * ease(Math.min(1, q / .3)) : .95 - 1.25 * ease((q - .85) / .15); cl = q < .85 ? 5 : 11;
                if (S.every(A, "wd", .09)) S.ptx("puff", a.x - a.dir * h * .3, S.feetY(a) - liftPx(S, a, fal) , 1, po().a(-PI, 0).s(2, 6).g(0).l(.25, .4).r(.8));
                a.alt = fal;
            } else if (tt < 1.75) {                                                                                                     // 낚아챈다
                att = true; a.dir = gx >= A.x0 ? 1 : -1; fx = gx; fal = gAlt; ang = -.3 * ease((tt - 1.3) / .45); cl = 9;
                if (S.once(A, "gr")) { A.fr1 = o != null; S.haptic("flap"); S.ptx("star", gx, S.feetY(a) - h * .6, 6, po().a(-PI, 0).s(18, 40).g(40).l(.4, .7).jx(h * .3).r(1)); if (o != null) S.say(o, "으앗?!", 1.2); S.say(a, o != null ? "잡았다!" : "휙!", 1.2); }
                a.alt = fal;
            } else if (tt < 3.0) {                                                                                                      // 안고 올라간다
                att = true; double q = ease((tt - 1.75) / 1.25); a.dir = fd; fx = gx + (cx - gx) * q; fal = gAlt + (bot - gAlt) * q; ang = -.6 * Math.sin(PI * q) * (1 - q); cl = q < .5 ? 10 : 2 + (int) (T * 10 % 2);
                a.alt = fal; if (S.every(A, "fl", .22)) S.haptic("flap");
            } else if (tt < 5.4) {                                                                                                      // 하늘에서 한 바퀴
                att = true; double q = (tt - 3.0) / 2.4; th = PI2 * ease(q) * 1.0; a.dir = fd; fx = cx + fd * Rpx * Math.sin(th); fal = altC - R * Math.cos(th); ang = -th; cl = 2 + (int) (T * 12 % 2);
                a.alt = fal; if (S.once(A, "lp")) { S.say(a, "한 바퀴~!", 1.4); if (o != null) S.say(o, "꺄아아~!", 2.0); } if (S.every(A, "tr", .12)) S.ptx("puff", a.x, S.feetY(a) - liftPx(S, a, fal), 1, po().a(-PI, 0).s(2, 6).g(0).l(.3, .5).r(.8));
            } else if (tt < 7.0) {                                                                                                      // 안고 천천히 내려온다
                att = true; double q = ease((tt - 5.4) / 1.6); a.dir = fd; fx = clamp(cx + fd * S.W * .15, a.w * .6, S.W - a.w * .6); fx = cx + (fx - cx) * q; fal = bot + (gAlt - bot) * q; ang = .3 * Math.sin(PI * q) * (1 - q * .4); cl = 4;
                a.alt = fal;
            } else {                                                                                                                    // 내려놓고 뿌듯
                if (S.once(A, "rl")) {
                    A.lx = a.x; if (o != null) { Actor f = o; f.alt = 0; S.startAct(f, "dizzy"); f.dir = a.dir; A.tgt = null; } S.say(a, "어때? 재밌지?", 1.9); S.haptic("land_fly");
                    S.ptx("dust", A.lx, S.feetY(a) - 1, 6, po().a(-PI * .98, -PI * .02).s(14, 34).g(30).l(.4, .8).jx(h * .4));
                }
                fx = a.x; a.alt = gAlt + (16 - gAlt) * ease(clamp((tt - 7.0) / .5, 0, 1)); cell(a, 15, 0); ang = 0; a.pvy = 0; if (tt > 7.3) S.standF(a);
            }
            a.x = fx; a.ang = ang; a.pvy = a.ang != 0 ? -S.liftOf(a) - h * .5 : 0; if (tt < 7.0) { cell(a, cl, 0); a.fr += dt * a.D.fps * .5; }
            if (att && o != null) {                                                                                                     // 친구가 매달린 자리(독슐 몸 아래쪽)
                double ca = Math.cos(th), sa = Math.sin(th), hp = A.hx, fh = liftPx(S, a, a.alt) - hp * ca;                              // 화면 위 높이(px)
                A.px1 = a.x + a.dir * hp * sa; A.pz1 = a.z; A.pal1 = Math.max(0, (fh) / (zs * zs) - o.D.lift); A.pang1 = -th; A.fr1 = true;
            }
        }, (a, A) -> {
            a.alt = a.altSave != 0 ? a.altSave : 18; a.ang = 0; a.pvy = 0; Actor o = A.tgt; if (o != null && o.act != null && "carried".equals(o.act.n)) { o.alt = 0; o.act.dur = (S.t - o.act.t0) + .001; }
        });
        A_(S, "carried", 20, null, (a, u, dt, A) -> {                                                                                   // 독수리에게 붙들린 친구: 놀라서 덜덜 → 매달려 함께 난다
            Actor e = A.tgt; AS EA = e != null ? e.act : null; double h = S.HH(a);
            if (e == null || e.dead || e.held || EA == null || !"carry".equals(EA.n) || EA.tgt != a) { a.alt = 0; A.dur = (S.t - A.t0) + .001; return; }
            a.nograb = true; a.pose = 3; S.standF(a);
            if (!EA.fr1) { a.dir = e.x >= a.x ? 1 : -1; a.ox = Math.sin(S.t * 40) * .9; if (S.every(A, "sw", .3)) S.ptx("sweat", a.x, S.feetY(a) - h * .9, 1, po().a(-PI * .85, -PI * .15).s(8, 16).g(120).l(.4, .7).jx(4)); return; }
            a.x = EA.px1; a.z = EA.pz1; a.alt = EA.pal1; a.dir = e.dir; a.ang = EA.pang1; a.pvy = -S.liftOf(a) - h * .5;
            if (S.every(A, "sw", .25)) S.ptx("sweat", a.x, S.feetY(a) - liftPx(S, a, a.alt) - h * .5, 1, po().a(-PI, 0).s(8, 16).g(80).l(.4, .7).jx(5));
        }, (a, A) -> { a.alt = 0; });
        A_(S, "dizzy", 3.6, (a, t, A) -> { a.alt = 0; S.haptic("grin"); }, (a, u, dt, A) -> {                                           // 어질어질~: 비틀비틀 별이 빙글
            double h = S.HH(a), T = S.t, tt = u * 3.6, amp = 1 - ease(clamp((tt - 2.7) / .9, 0, 1)); S.standF(a); a.pose = 3;
            a.ang = Math.sin(T * 3.4) * .2 * amp; a.ox = Math.sin(T * 2.2) * 5 * amp; a.pvy = 0;
            S.pr(a, S.prop("stars", 0, -h * 1.06)); a.y = Math.abs(Math.sin(T * 3.4)) * 0;
            if (S.once(A, "sy")) S.say(a, "어질어질~", 2.4);
        }, (a, A) -> { a.alt = 0; });

        // ── 챙챙: 꼬리를 헬리콥터 날개처럼 돌려 하늘을 돌아다니다 천천히 내려오고, 마구 화를 낸다 ──
        A_(S, "heli", 7.6, (a, t, A) -> {
            double W = S.W; double[] r = S.inRange(a); A.alt0 = clamp(a.altStart != 0 ? a.altStart : 40, 14, 150); a.alt = A.alt0; A.x0 = a.x; A.z0 = a.z; A.s0 = 0;
            A.tx = clamp(a.x + (a.x < W / 2 ? 1 : -1) * S.rnd(.25, .4) * W, r[0], r[1]); A.bx = clamp(A.tx + (a.x < W / 2 ? -1 : 1) * S.rnd(.2, .4) * W, r[0], r[1]); A.lx = clamp((A.bx + A.x0) / 2 + S.rnd(-.1, .1) * W, r[0], r[1]);
            A.tz = a.hero ? a.z : S.rnd(.4, .9); a.chain = "rage";
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, tt = u * 7.6, Hh = clamp(A.alt0 * .55, 34, 58), om; S.standF(a); a.nograb = true; a.pose = 2; a.pvy = -h * .5;
            double alt, x = a.x;
            if (tt < 1.0) { double q = tt; om = 10 + 50 * ease(q); alt = Hh + (A.alt0 - Hh) * (1 - ease(q)); a.ang = .12 + Math.sin(T * 9) * .05; if (S.once(A, "o")) { S.say(a, "우다다다~!", 1.6); S.haptic("flap"); } }
            else if (tt < 5.2) {
                om = 62 + Math.sin(T * 2) * 4; double q = (tt - 1.0) / 4.2, s3 = q * 3; int leg = Math.min(2, (int) s3); double lq = ease(s3 - leg);
                double[] xs = {A.x0, A.tx, A.bx, A.lx}; x = xs[leg] + (xs[leg + 1] - xs[leg]) * lq; a.dir = xs[leg + 1] >= xs[leg] ? 1 : -1; a.z = A.z0 + (A.tz - A.z0) * ease(clamp(q * 1.6, 0, 1));
                alt = Hh + Math.sin(T * 2.6) * 6 + Math.sin(T * 1.3) * 4; a.ang = .1 * a.dir * 0 + Math.sin(T * 4) * .06 + .08;
            } else if (tt < 6.7) {
                double q = ease((tt - 5.2) / 1.5); om = 62 - 52 * q; alt = Hh * (1 - q) + Math.sin(T * 2.6) * 3 * (1 - q); a.ang = .06 * (1 - q); x = a.x;
                if (S.every(A, "dw", .2)) S.ptx("puff", a.x, S.feetY(a) - 1, 1, po().a(-PI * .9, -PI * .1).s(10, 22).g(10).l(.3, .5).r(.8).jx(h * .4));
            } else {
                om = 10 * (1 - ease((tt - 6.7) / .9)); alt = 0; double q = clamp((tt - 6.7) / .2, 0, 1); a.sx = 1.12 - .12 * q; a.sy = .8 + .2 * q;
                if (S.once(A, "td")) { S.haptic("land_puddle"); S.ptx("dust", a.x, S.feetY(a) - 1, 10, po().a(-PI * .98, -PI * .02).s(20, 56).g(40).l(.4, .8).jx(h * .5)); S.say(a, "…!", 1.0); }
            }
            A.s0 = Double.isNaN(A.s0) ? 0 : A.s0; A.s0 += om * dt; a.x = x; a.alt = alt;
            if (om > 4) { Prop rp = S.prop("rotor", -h * .5, -h * .42); rp.s = A.s0; rp.r = h * .55; S.pr(a, rp); }
            if (tt < 6.7 && S.every(A, "wl", .14)) S.ptx("puff", a.x - a.dir * h * .55, S.feetY(a) - liftPx(S, a, alt) - h * .42, 1, po().a(-PI * .85, -PI * .15).s(6, 14).g(0).l(.25, .4).r(.7));
        }, (a, A) -> { a.alt = a.altSave != 0 ? a.altSave : 0; a.ang = 0; a.pvy = 0; });
        A_(S, "rage", 4.2, null, (a, u, dt, A) -> {                                                                                     // 마구마구 화낸다
            double h = S.HH(a), T = S.t, tt = u * 4.2, amp = 1 - ease(clamp((tt - 3.5) / .7, 0, 1)); S.standF(a); a.pose = 5;
            double b = Math.abs(Math.sin(T * 9.5)); a.y = -b * h * .16 * amp; a.sy = 1 - .12 * (1 - b) * amp; a.sx = 1 + .08 * (1 - b) * amp; a.ox = Math.sin(T * 38) * 1.4 * amp; a.ang = Math.sin(T * 19) * .05 * amp;
            if (S.once(A, "st")) { S.stk(a, "angry", 3.4); S.haptic("angry"); }
            if (S.every(A, "say", 1.3)) S.say(a, new String[]{"화났다!!", "누가 던졌어!!", "으아아아!!", "놓지 말랬잖아!"}[(int) ((S.t * 3) % 4)], 1.3);
            if (S.every(A, "pf", .17)) S.ptx("puff", a.x + (S.rnd() - .5) * h * .5, S.feetY(a) - h * 1.0, 1, po().a(-PI * .85, -PI * .15).s(14, 30).g(-10).l(.4, .7).r(1.1).jx(3));
            if (b < .12 && S.every(A, "sp", .3)) { S.ptx("dust", a.x, S.feetY(a) - 1, 3, po().a(-PI * .95, -PI * .05).s(14, 34).g(40).l(.3, .6).jx(h * .4)); S.shake(1.6, .18); }
            if (S.every(A, "sk", .2)) S.ptx("spark", a.x + (S.rnd() - .5) * h, S.feetY(a) - h * (.7 + S.rnd() * .5), 1, po().a(-PI, 0).s(6, 14).g(0).l(.25, .4).r(1.2));
        }, null);

        // ── 뽀푸의 지진에 놀란 친구들: 펄쩍 뛰고 덜덜 ──
        A_(S, "shock", 1.9, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, tt = u * 1.9; S.standF(a); a.dir = A.fx >= a.x ? 1 : -1;
            if (tt < .32) { a.y = -Math.sin(PI * tt / .32) * 11 * SceneCore.zs(a.z); a.sy = 1 + .08 * Math.sin(PI * tt / .32); if (S.once(A, "bang")) { S.say(a, "깜짝이야!", 1.2); S.ptx("sweat", a.x, S.feetY(a) - h * .9, 3, po().a(-PI * .85, -PI * .15).s(10, 22).g(120).l(.5, .8).jx(4)); } }
            else { double am = 1 - ease(clamp((tt - 1.3) / .6, 0, 1)); a.pose = 3; a.ox = Math.sin(T * 45) * 1.2 * am; }
        }, null);
    }
    /** 화면에서 (alt 만큼 떠 있을 때) 발이 땅에서 올라간 높이(px). */
    static double liftPx(SceneCore S, Actor a, double alt) { double zs = SceneCore.zs(a.z); return (a.D.lift + alt) * zs * (a.kind.equals("eagle") ? 1 : zs); }


    /**
     * ★ 나머지 여섯 친구(돌솜·뽀푸·러블·두덩·술·챙챙)도 전용 동작 5가지씩을 더해 10가지로 늘렸다(YJ 2026-10-29 "모든 캐릭터 각각 10가지").
     *   이 친구들의 몸 그림은 걷기 16프레임 + 자세 6칸(앉기·잠·웃음·덜덜·헥헥·찡그림)뿐이라, 새 동작은 그 칸들을 골라 쓰고 몸을 기울이고 늘리고 소품·입자로 연출한다(기존 동작과 같은 방식).
     */
    static void registerMo2(final SceneCore S) {
        // ── 돌솜(하얀 강아지): 앉아 · 아우~ · 킁킁 · 배 보이기 · 우다다 ──
        A_(S, "sit", 3.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a);
            if (u < .08) { /* 서 있다가 */ } else if (u < .58) { a.pose = 0; a.ox = Math.sin(T * 17) * .7; a.sy = 1 + Math.sin(T * 2.6) * .012; if (S.once(A, "sy")) S.say(a, "앉아! 기다려~", 2.0); }
            else { a.pose = 2; a.y = -Math.abs(Math.sin(T * 7)) * 6; if (S.once(A, "ok")) { S.say(a, "잘했어요!", 1.6); S.haptic("grin"); } if (S.every(A, "hh", .5)) S.ptx("heart", a.x, S.feetY(a) - h * .8, 1, po().a(-PI * .98, -PI * .02).s(22, 44).g(55).l(.9, 1.3).r(1).jx(6)); }
        }, null);
        A_(S, "howl", 3.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .1 && u < .88;
            if (on) { a.pose = 0; a.pvx = 0; a.pvy = -h * .4; a.ang = -.3 * ease(Math.min(1, (u - .1) / .15)) + Math.sin(T * 5) * .02; a.sy = 1.02;
                if (S.every(A, "nt", .45)) S.ptx("note", a.x + a.dir * h * .35, S.feetY(a) - h * 1.05, 1, po().a(-PI * .8, -PI * .2).s(12, 20).g(-6).l(.9, 1.3).r(1).jx(6)); }
            if (u > .12 && S.once(A, "sy")) S.say(a, "아우~~~!", 2.4);
        }, null);
        A_(S, "snuffle", 4.4, (a, t, A) -> { A.tx = S.aheadX(a, 55 + S.rnd() * 20); }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; double[] r = S.inRange(a);
            if (u < .72) {
                S.moveX(a, A.tx, a.spd * .38, dt); a.pvx = h * .3; a.pvy = -h * .3; a.ang = .3 + Math.sin(T * 9) * .03; a.y = Math.sin(T * 9) * .8;
                if (S.every(A, "dt", .4)) S.ptx("dust", a.x + a.dir * h * .55, S.feetY(a) - 1, 1, po().a(-PI * .9, -PI * .1).s(4, 10));
                if (S.once(A, "sy")) S.say(a, "킁킁킁…", 1.6);
            } else {
                S.standF(a); a.pose = 2; a.y = -Math.abs(Math.sin(T * 8)) * 5;
                if (S.once(A, "f")) { S.say(a, "뭔가 있다!", 1.6); S.ptx("spark", a.x + a.dir * h * .5, S.feetY(a) - h * .3, 4, po().a(-PI, 0).s(12, 26).g(0).l(.3, .5).jx(5).r(1)); S.haptic("grin"); }
            }
        }, null);
        A_(S, "rollover", 3.6, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.pvy = -h * .4;
            if (u < .16) { a.sy = 1 - .06 * (u / .16); }
            else if (u < .34) { a.ang = PI * ease((u - .16) / .18); a.y = -Math.sin(PI * (u - .16) / .18) * 3; }
            else if (u < .72) { a.ang = PI + Math.sin(T * 9) * .14; a.pose = 2; if (S.once(A, "sy")) S.say(a, "배 쓰다듬어 주세요~", 2.2); if (S.every(A, "hh", .55)) S.ptx("heart", a.x, S.feetY(a) - h * .9, 1, po().a(-PI * .98, -PI * .02).s(22, 44).g(55).l(.9, 1.3).r(1).jx(6)); }
            else if (u < .9) { a.ang = PI + PI * ease((u - .72) / .18); a.y = -Math.sin(PI * (u - .72) / .18) * 3; }
            else { a.pose = 2; a.y = -Math.abs(Math.sin(T * 8)) * 3; }
        }, null);
        A_(S, "zoomies", 3.6, (a, t, A) -> { A.tx = S.aheadX(a, 110); }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; double[] r = S.inRange(a);
            if (S.moveX(a, A.tx, a.spd * 3.0, dt)) A.tx = clamp(a.x - a.dir * (90 + S.rnd() * 60), r[0], r[1]);
            a.y = -Math.abs(Math.sin(T * 18)) * 3.2; a.ang = .08;
            if (S.every(A, "dt", .1)) S.ptx("dust", a.x - a.dir * h * .45, S.feetY(a) - 1, 1, po().a(-PI * .9, -PI * .1).s(8, 18));
            if (S.once(A, "sy")) S.say(a, "우다다다다!", 1.8);
        }, null);
        // ── 뽀푸(갈색 강아지): 간식 조르기 · 벅벅 · 왈왈 · 원반 잡기 · 뼈다귀 와작 ──
        A_(S, "beg", 3.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .9; a.pose = on ? 0 : -1;
            if (on) { a.ang = Math.sin(T * 6) * .03; a.y = -Math.abs(Math.sin(T * 6)) * 1.6; S.pr(a, S.prop("bone", h * .55, -h * 1.0 + Math.sin(T * 4) * 1.5)); }
            if (u > .1 && S.once(A, "sy")) S.say(a, "간식 주세요~!", 2.4);
        }, null);
        A_(S, "scratch", 3.4, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .88; a.pose = on ? 0 : -1;
            if (on) { a.pvx = 0; a.pvy = -h * .4; a.ang = -.08 + Math.sin(T * 36) * .045; a.ox = Math.sin(T * 36) * .8;
                if (S.every(A, "dt", .14)) S.ptx("dust", a.x + a.dir * h * .1, S.feetY(a) - h * .75, 1, po().a(-PI * .9, -PI * .1).s(6, 14)); }
            if (u > .1 && S.once(A, "sy")) S.say(a, "벅벅~ 간지러워!", 2.0);
            if (u > .9 && S.once(A, "e")) S.say(a, "시원하다~", 1.2);
        }, null);
        A_(S, "bark", 3.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double ph = (T - A.t0) * 2.3, f = ph - Math.floor(ph); boolean on = u > .06 && u < .92;
            if (on) { double k = f < .28 ? Math.sin(PI * f / .28) : 0; a.sx = 1 + .09 * k; a.sy = 1 - .05 * k; a.ox = -a.dir * 2.6 * k; a.ang = -.06 * k;
                if (f < .05 && S.every(A, "br", .3)) { S.say(a, (int) Math.floor(ph) % 2 == 0 ? "왈!" : "왈왈!", .6); S.haptic("grin"); S.ptx("spark", a.x + a.dir * h * .7, S.feetY(a) - h * .62, 2, po().a(a.dir > 0 ? -.5 : PI - .5, a.dir > 0 ? .5 : PI + .5).s(14, 26).g(0).l(.25, .4).r(1)); } }
        }, null);
        A_(S, "frisbee", 4.8, (a, t, A) -> { A.tx = S.aheadX(a, 80); A.x0 = a.x; A.dir0 = a.dir; }, (a, u, dt, A) -> {
            // 원반이 휙 날아오면 폴짝 뛰어 입으로 잡는다
            double h = S.HH(a), T = S.t, fy = S.feetY(a); S.standF(a);
            double x1 = A.tx, x0 = A.x0 - A.dir0 * 60;
            if (u < .5) {
                double p = u / .5; double dx = x0 + (x1 + A.dir0 * 10 - x0) * p, dy = fy - h * (.5 + .9 * Math.sin(PI * Math.min(1, p)) * .8); S.pr(a, S.propAbs("disc", dx, dy));
                if (u < .3) { S.moveX(a, x1, a.spd * .8, dt); } else { a.dir = A.dir0; }
                if (u > .3) { double q = ease((u - .3) / .2); a.y = -Math.sin(PI * q) * h * .75; a.ang = -.35 * Math.sin(PI * q); }
                if (S.once(A, "sy")) S.say(a, "원반이다!", 1.4);
            } else {
                a.y = 0; S.pr(a, S.prop("disc", a.dir * h * .52, -h * .42)); a.pose = u < .7 ? 2 : -1; if (u >= .7) S.moveX(a, A.x0, a.spd * 1.1, dt);
                if (S.once(A, "ca")) { S.say(a, "잡았다!", 1.6); S.haptic("grin"); S.ptx("spark", a.x + a.dir * h * .5, S.feetY(a) - h * .45, 4, po().a(-PI, 0).s(12, 26).g(0).l(.3, .5).jx(5).r(1)); }
            }
        }, null);
        A_(S, "chew", 4.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .9; a.pose = on ? 0 : -1;
            if (on) { double b = Math.abs(Math.sin(T * 10)); a.sy = 1 - .02 * b; a.ang = Math.sin(T * 5) * .02; S.pr(a, S.prop("bone", h * .42, -h * .22 + b * 1.2));
                if (S.every(A, "cr", .6)) S.ptx("dust", a.x + a.dir * h * .45, S.feetY(a) - h * .3, 2, po().a(-PI * .9, -PI * .1).s(6, 12)); }
            if (u > .1 && S.once(A, "sy")) S.say(a, "와작와작! 맛있다", 2.2);
        }, null);
        // ── 러블(고양이): 그루밍 · 갸르릉 · 꾹꾹이 · 털실 · 오이 깜짝 ──
        A_(S, "groom", 3.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .9; a.pose = on ? 0 : -1;
            if (on) { a.pvx = 0; a.pvy = -h * .45; a.ang = .12 + Math.sin(T * 8) * .07; if (S.every(A, "sp", .3)) S.ptx("spark", a.x + a.dir * h * .35, S.feetY(a) - h * (.2 + S.rnd() * .6), 1, po().a(-PI * .85, -PI * .15).s(8, 16).g(0).l(.3, .5).r(.9)); }
            if (u > .1 && S.once(A, "sy")) S.say(a, "핥핥~ 털 정리!", 2.0);
        }, null);
        A_(S, "purr", 4.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .92; a.pose = on ? 2 : -1;
            if (on) { a.sy = 1 + Math.sin(T * 3.6) * .02; a.ox = Math.sin(T * 38) * .5; if (S.every(A, "hh", .7)) S.ptx("heart", a.x + a.dir * h * .3, S.feetY(a) - h * .85, 1, po().a(-PI * .9, -PI * .1).s(14, 26).g(30).l(.9, 1.3).r(1).jx(5)); }
            if (u > .1 && S.once(A, "sy")) S.say(a, "갸르릉~ 갸르릉~", 2.8);
        }, null);
        A_(S, "knead", 4.0, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .9; a.pose = on ? 0 : -1;
            if (on) { double b = Math.max(0, Math.sin(T * 8)); a.sy = 1 - .04 * b; a.ang = .04 * Math.sin(T * 4); if (S.every(A, "pt", .36)) S.ptx("note", a.x + a.dir * h * .35, S.feetY(a) - h * .3, 1, po().a(-PI * .75, -PI * .25).s(8, 14).g(-4).l(.7, 1.0).r(.9)); }
            if (u > .1 && S.once(A, "sy")) S.say(a, "꾹꾹꾹~ 폭신폭신", 2.2);
        }, null);
        A_(S, "yarn", 4.4, (a, t, A) -> { A.bx = S.aheadX(a, 60 + S.rnd() * 30); A.mx = a.x + a.dir * S.HH(a) * .5; A.px = 0; }, (a, u, dt, A) -> {
            // 털실 뭉치를 굴리고 따라가 덮친다
            double h = S.HH(a), T = S.t, fy = S.feetY(a); S.standF(a);
            double yx = A.mx + (A.bx - A.mx) * ease(Math.min(1, u / .6)); double bob = u < .6 ? Math.abs(Math.sin(u * 22)) * 3 : 0;
            Prop yp = S.propAbs("yarn", yx, fy - 4 - bob); yp.r = T * 8; S.pr(a, yp);
            if (u < .1) { S.say(a, "털실이다냥!", 1.4); }
            if (u < .62) { a.dir = A.bx >= a.x ? 1 : -1; if (u > .14) S.moveX(a, A.bx - a.dir * h * .45, a.spd * 1.0, dt); }
            else if (u < .78) { double q = ease((u - .62) / .16); a.dir = A.bx >= a.x ? 1 : -1; a.y = -Math.sin(PI * q) * h * .5; a.ang = .35 * q; }
            else { a.ang = .2 * (1 - ease((u - .78) / .22)); a.sy = .94; a.pose = u > .85 ? 2 : -1; if (S.once(A, "gt")) { S.say(a, "잡았다냥!", 1.4); S.haptic("grin"); } }
        }, null);
        A_(S, "cuke", 3.4, (a, t, A) -> { A.bx = S.aheadX(a, S.HH(a) * 1.0); }, (a, u, dt, A) -> {
            // 뒤에 슬쩍 놓인 오이에 화들짝!
            double h = S.HH(a), T = S.t; S.standF(a);
            Prop cp = S.propAbs("cuke", A.bx, S.feetY(a) - 3); S.pr(a, cp);
            if (u < .3) { a.dir = A.bx >= a.x ? 1 : -1; a.sy = 1 + .02 * Math.sin(T * 4); if (S.once(A, "q")) S.say(a, "…뭐지?", 1.0); }
            else if (u < .56) { double q = (u - .3) / .26; a.y = -Math.sin(PI * Math.min(1, q * 1.2)) * h * .8; a.sy = 1.16; a.sx = .88; a.ang = -.16 * a.dir * Math.sin(PI * q); if (S.once(A, "!")) { S.say(a, "냥?!!", 1.0); S.haptic("thud"); S.ptx("sweat", a.x, S.feetY(a) - h, 3, po().a(-PI * .85, -PI * .15).s(10, 22).g(120).l(.5, .8).jx(4)); } }
            else { a.pose = 3; a.ox = Math.sin(T * 40) * .8 * (1 - (u - .56) / .44); if (S.once(A, "e")) S.say(a, "오이는 무서워냥…", 1.8); }
        }, null);
        // ── 두덩(두더지): 삽질 · 랜턴 · 두더지 잡기 · 낮잠 · 보물 ──
        A_(S, "digdig", 4.0, (a, t, A) -> {
            A.hx = a.x + a.dir * S.HH(a) * .72; A.g = S.addGfx(S.gfx("hole", A.hx, a.z, 4.0 + .6)); Gfx m = S.gfx("mound", a.x - a.dir * S.HH(a) * .55, a.z, 4.0 + .6); m.r = 8; S.addGfx(m);
        }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double sw = Math.sin(T * 9); a.pvx = h * .3; a.ang = .22 + sw * .1;
            if (S.every(A, "d", .22)) S.ptx("dirt", a.x + a.dir * h * .72, S.feetY(a) - 3, 2, po().a(-PI * .9, -PI * .1).s(14, 28).g(170).l(.35, .6).jx(3));
            if (u > .08 && S.once(A, "sy")) S.say(a, "삽질 삽질~ 영차!", 2.2);
        }, null);
        A_(S, "lantern", 4.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.dir = A.d0 * (Math.sin(T * 1.9) > 0 ? 1 : -1); a.pose = -1;
            Prop lp = S.prop("lantern", h * .52, -h * .52 + Math.sin(T * 3) * 1.4); S.pr(a, lp); a.ang = Math.sin(T * 3) * .02;
            if (u > .08 && S.once(A, "sy")) S.say(a, "어두운 굴 탐험 중~", 2.4);
        }, null);
        A_(S, "popup", 4.6, (a, t, A) -> {
            A.hx = a.x; A.g = S.addGfx(S.gfx("hole", A.hx, a.z, 4.6 + .6)); Gfx m = S.gfx("mound", a.x + S.HH(a) * .5, a.z, 4.6 + .6); m.r = 8; S.addGfx(m);
        }, (a, u, dt, A) -> {
            // 구멍에서 쏙 나왔다 쏙 들어갔다 — 두더지 잡기!
            double h = S.HH(a), T = S.t, e = T - A.t0; S.standF(a); a.x = A.hx; a.cut = 0;
            double v = u < .1 ? 0 : u > .9 ? 1 : Math.max(0, Math.sin((e - .45) * 3.6)); a.y = h * 1.1 * (1 - ease(Math.min(1, v * 1.25)));
            if (u > .9) { a.cut = Double.NaN; a.y = 0; }
            if (v > .85 && S.every(A, "pk", 1.4)) { S.say(a, "짠! 여기야~", .9); S.ptx("dirt", a.x, S.feetY(a) - 2, 3, po().a(-PI * .95, -PI * .05).s(10, 22).g(130).jx(5)); }
        }, null);
        A_(S, "nap", 4.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean zz = u > .1 && u < .92; a.pose = zz ? 1 : 0; a.sy = 1 + (zz ? Math.sin(T * 2.1) * .014 : 0);
            if (zz && S.every(A, "zz", .6)) S.ptx("zzz", a.x + a.dir * h * .3, S.feetY(a) - h * .8, 1, po().a(-PI * .6, -PI * .4).s(6, 9).g(-4).l(1, 1.4).r(1));
            if (u > .94 && S.once(A, "wk")) S.say(a, "드르렁… 헉! 파헤치던 중이었는데", 2.0);
        }, null);
        A_(S, "treasure", 4.6, (a, t, A) -> { A.hx = a.x + a.dir * S.HH(a) * .7; Gfx m = S.gfx("mound", A.hx, a.z, 4.6 + .4); m.r = 9; A.g = S.addGfx(m); }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a);
            if (u < .5) { a.ang = .22 + Math.sin(T * 9) * .08; a.pvx = h * .3; if (S.every(A, "d", .2)) S.ptx("dirt", A.hx, S.feetY(a) - 3, 2, po().a(-PI * .9, -PI * .1).s(14, 26).g(170).l(.35, .6).jx(3)); if (S.once(A, "sy")) S.say(a, "여기가 수상해…", 1.6); }
            else { double q = ease((u - .5) / .3); a.pose = 2; a.y = -Math.abs(Math.sin(T * 7)) * 3;
                Prop gp = S.propAbs("gem", A.hx, S.feetY(a) - 6 - h * .7 * q - Math.sin(T * 5) * 1.2); S.pr(a, gp);
                if (S.once(A, "f")) { S.say(a, "보물이다! 반짝반짝!", 2.4); S.haptic("hearts"); S.ptx("spark", A.hx, S.feetY(a) - h * .6, 8, po().a(-PI, 0).s(16, 34).g(0).l(.4, .7).jx(h * .3).jy(h * .2).r(1.2)); } }
        }, null);
        // ── 술(독수리): 선회 · 깃 다듬기 · 급강하 · 망보기 · 날개 자랑 ──
        A_(S, "soar", 4.8, (a, t, A) -> { A.x0 = a.x; A.tx = a.x + (a.x < S.W / 2 ? 1 : -1) * S.W * .38; A.alt0 = Math.max(16, a.alt); }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; double p = ease(clamp(u / .85, 0, 1)); a.pvy = -h * .5;
            double up = u < .3 ? ease(u / .3) : u > .8 ? 1 - ease((u - .8) / .2) : 1; a.alt = A.alt0 + 44 * up + Math.sin(T * 2.2) * 4; a.x = A.x0 + (A.tx - A.x0) * p; a.dir = A.tx >= A.x0 ? 1 : -1; a.ang = -.12 + Math.sin(T * 2.2) * .06; a.fr += dt * a.D.fps * (u < .25 ? 1.2 : .35);
            if (S.once(A, "sy")) S.say(a, "높이 높이~!", 1.6);
        }, null);
        A_(S, "preen", 3.8, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .9; a.pose = on ? 0 : -1;
            if (on) { a.ang = Math.sin(T * 7) * .05 + .05; if (S.every(A, "fe", .7)) S.ptx("feather", a.x + a.dir * h * .1, S.feetY(a) - h * .6, 1, po().a(-PI * .7, -PI * .3).s(6, 14).g(40).l(.9, 1.4).jx(5)); }
            if (u > .1 && S.once(A, "sy")) S.say(a, "깃털 정리 정리~", 2.2);
        }, null);
        A_(S, "swoop", 3.4, (a, t, A) -> { A.alt0 = 78; A.x0 = a.x; A.tx = a.x + (a.x < S.W / 2 ? 1 : -1) * S.W * .28; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; a.pvy = -h * .5;
            if (u < .22) { a.alt = 18 + (A.alt0 - 18) * ease(u / .22); a.x = A.x0; a.dir = A.tx >= A.x0 ? 1 : -1; a.fr += dt * a.D.fps * 1.2; if (S.once(A, "sy")) S.say(a, "급강하 간다!", 1.4); }
            else if (u < .56) { double q = (u - .22) / .34; a.alt = A.alt0 * (1 - q * q); a.x = A.x0 + (A.tx - A.x0) * ease(q); a.dir = A.tx >= A.x0 ? 1 : -1; a.ang = .55 * Math.sin(PI * Math.min(1, q)) + .1; a.fr += dt * a.D.fps * .5; }
            else { double q = (u - .56) / .44; a.alt = 6 * Math.max(0, 1 - q * 4); a.x = A.tx; a.ang = 0; a.fr += dt * a.D.fps * .6; if (S.once(A, "td")) { S.ptx("dust", a.x, S.feetY(a) - 1, 6, po().a(-PI * .9, -PI * .1).s(10, 22)); S.ptx("feather", a.x, S.feetY(a) - 6, 3, po().a(-PI * .9, -PI * .1).s(10, 24).g(40).l(.9, 1.3).jx(5)); S.haptic("land_fly"); S.say(a, "착!", 1.0); } }
        }, (a, A) -> { a.alt = 0; });
        A_(S, "scan", 4.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.pose = 0; a.dir = A.d0 * ((int) Math.floor((T - A.t0) / .85) % 2 == 0 ? 1 : -1); a.ang = Math.sin(T * 3) * .015;
            if (u > .08 && S.once(A, "sy")) S.say(a, "수상한 놈은 없나…", 2.2);
            if (u > .78 && S.once(A, "ok")) S.say(a, "이상 무!", 1.4);
        }, null);
        A_(S, "flapshow", 3.6, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; boolean on = u > .08 && u < .9; a.fr += dt * a.D.fps * (on ? 1.5 : .6); a.pvy = -h * .5;
            if (on) { double b = Math.abs(Math.sin(T * 9)); a.alt = 14 + b * 9; a.sx = 1.1; a.sy = 1 + .04 * b; if (S.every(A, "fe", .35)) S.ptx("feather", a.x + (S.rnd() - .5) * h * 1.2, S.feetY(a) - h * (.6 + S.rnd() * .4), 1, po().a(-PI * .85, -PI * .15).s(8, 18).g(40).l(.9, 1.4)); }
            if (u > .1 && S.once(A, "sy")) S.say(a, "내 날개 멋지지?", 2.2);
        }, (a, A) -> { a.alt = 0; });
        // ── 챙챙(올챙이): 헤엄 · 꼬물꼬물 · 점프 · 빙글빙글 · 꼬리 첨벙 ──
        A_(S, "swim", 4.0, (a, t, A) -> { A.tx = S.aheadX(a, 100); }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; if (S.moveX(a, A.tx, a.spd * 1.5, dt)) A.tx = S.aheadX(a, 100);
            a.y = Math.sin(T * 5) * 5; a.ang = Math.cos(T * 5) * .1; a.fr += dt * a.D.fps * .6;
            if (S.every(A, "bb", .25)) S.ptx("bub", a.x - a.dir * h * .5, S.feetY(a) - h * .5, 1, po().a(-PI * .8, -PI * .2).s(8, 18).g(-24).l(.8, 1.3).r(1).jx(3));
            if (S.once(A, "sy")) S.say(a, "쏘옥~ 쏘옥~", 1.6);
        }, null);
        A_(S, "wiggle", 3.4, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.pose = u > .08 && u < .9 ? 2 : -1; a.ang = Math.sin(T * 20) * .22; a.ox = Math.sin(T * 20 + 1) * 1.6;
            if (S.every(A, "bb", .3)) S.ptx("bub", a.x, S.feetY(a) - h * .8, 1, po().a(-PI * .8, -PI * .2).s(8, 18).g(-24).l(.8, 1.3).r(1).jx(4));
            if (u > .1 && S.once(A, "sy")) S.say(a, "꼬물꼬물~", 1.8);
        }, null);
        A_(S, "leap", 3.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.pvy = -h * .4;
            if (u < .2) { a.sy = 1 - .16 * (u / .2); a.sx = 1 + .1 * (u / .2); }
            else if (u < .7) { double q = (u - .2) / .5; a.y = -Math.sin(PI * q) * h * 1.3; a.ang = PI2 * ease(q); a.sy = 1 + .1 * Math.sin(PI * q); if (S.once(A, "sy")) S.say(a, "점~프!", 1.2); }
            else { double q = (u - .7) / .3; a.sy = .86 + .14 * ease(q); a.sx = 1.12 - .12 * ease(q); if (S.once(A, "td")) { S.ptx("drop", a.x, S.feetY(a) - 2, 12, po().a(-PI * .95, -PI * .05).s(26, 56).g(170).l(.5, .9).jx(4)); S.ptx("ring", a.x, S.feetY(a), 1, po().a(0, 0).s(0, 0).g(0).l(.8, .8)); S.haptic("splash"); } }
        }, null);
        A_(S, "whirl", 3.4, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .86; double k = on ? Math.sin(PI * (u - .08) / .78) : 0;
            a.pvy = -h * .45; a.ang = (T - A.t0) * 13 * k; a.y = -k * 4;
            if (on && S.every(A, "bb", .12)) S.ptx("bub", a.x + (S.rnd() - .5) * h * .8, S.feetY(a) - h * (.3 + S.rnd() * .5), 1, po().a(-PI * .8, -PI * .2).s(10, 24).g(-24).l(.8, 1.3).r(1));
            if (u > .1 && S.once(A, "sy")) S.say(a, "빙글빙글~ 어지러워!", 2.0);
        }, null);
        A_(S, "tailsplash", 3.6, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); boolean on = u > .08 && u < .9; a.pose = on ? 2 : -1;
            if (on) { a.y = -Math.abs(Math.sin(T * 8)) * 4; double ph = (T - A.t0) * 4.2; if (ph - Math.floor(ph) < .08 && S.every(A, "sp", .22)) { S.ptx("drop", a.x - a.dir * h * .45, S.feetY(a) - h * .3, 6, po().a(-PI * .9, -PI * .1).s(24, 52).g(170).l(.5, .9).jx(3)); S.haptic("splash"); } }
            if (u > .1 && S.once(A, "sy")) S.say(a, "꼬리로 첨벙첨벙!", 2.0);
        }, null);
    }

    /** 엔진이 정한 날씨 반응 말(traits[id].say[동작])을 말풍선에 띄운다. 엔진이 말을 주지 않았으면 말하지 않는다(앱이 지어내지 않는다). */
    static void wsay(SceneCore S, Actor a, String act, double sec) {
        if (S.res == null) return;
        SceneModel.Traits T = S.res.traits.get(a.id); if (T == null) return;
        String v = T.say.get(act); if (v != null && !v.isEmpty()) S.say(a, v, sec);
    }
    /** 머리 위치(소품·입김 기준). 독수리는 부리, 그 밖은 머리 위쪽. */
    static double[] headOf(Actor a, double h) { return a.kind.equals("eagle") ? eagleHead(h) : new double[]{h * .2, -h * .64}; }

    /**
     * ★ 날씨 반응 동작(YJ 2026-10-25 "날씨에 맞춰 … 길동무 친구들 리액션도 달라져야해").
     *   어느 날씨에 무슨 동작을 끼울지·무슨 말을 할지는 엔진(traits)이 정한다. 여기는 이름대로 몸을 떨고·헐떡이고·찡그리고·기울고·첨벙이는 그림뿐이다.
     *   이름을 모르는 옛 앱은 walk 로 대신하므로 새 엔진 값이 와도 깨지지 않는다.
     */
    static void registerWx(final SceneCore S) {
        // 추위: 덜덜 떨고 입김이 난다
        A_(S, "shiver", 3.0, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double k = Math.min(1, u / .1) * (u > .9 ? (1 - u) / .1 : 1);
            a.pose = 3; double s = Math.sin(T * 44); a.ox = s * 1.5 * k; a.sy = 1 - .05 * k + Math.abs(s) * .012 * k; a.sx = 1 + .04 * k; a.ang = Math.sin(T * 31) * .025 * k;
            double[] hd = headOf(a, h);
            if (S.every(A, "br", .55)) S.ptx("breath", a.x + a.dir * (hd[0] + h * .1), S.feetY(a) - S.liftOf(a) + hd[1] + h * .1, 1, po().a(a.dir > 0 ? -.5 : PI + .5, a.dir > 0 ? -.2 : PI + .2).s(8, 14).g(-6).l(.9, 1.3).r(1 + S.rnd() * .5));
            if (u > .08 && S.once(A, "sy")) wsay(S, a, "shiver", 2.0);
        }, null);
        // 더위: 헥헥대고 땀이 나고 부채질
        A_(S, "pant", 3.4, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double k = Math.min(1, u / .12) * (u > .9 ? (1 - u) / .1 : 1);
            a.pose = u > .1 && u < .9 ? 4 : -1; double b = Math.sin(T * 13); a.sy = 1 + .05 * b * k; a.sx = 1 - .035 * b * k; a.ang = -.05 * k;
            double[] hd = headOf(a, h);
            if (S.every(A, "sw", .42)) S.ptx("sweat", a.x + a.dir * (hd[0] - h * .08), S.feetY(a) - S.liftOf(a) + hd[1] - h * .05, 1, po().a(-PI * .8, -PI * .2).s(10, 20).g(120).l(.5, .8).jx(3));
            if (u > .3 && u < .88 && !a.kind.equals("eagle")) { Prop f = S.prop("fan", h * .55, -h * .4 + Math.sin(T * 18) * 1.6); f.r = Math.sin(T * 18) * .55; S.pr(a, f); }
            if (u > .08 && S.once(A, "sy")) wsay(S, a, "pant", 2.2);
        }, null);
        // 햇빛: 눈이 부셔 고개를 살짝 들고 선글라스
        A_(S, "squint", 3.2, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double b = ease(Math.min(1, u / .22)) * (u > .86 ? 1 - ease((u - .86) / .14) : 1);
            a.ang = -.09 * b; a.sy = 1 + .03 * b; a.pvy = -h * .3;
            double[] hd = headOf(a, h);
            if (u < .42) a.pose = 5; else { Prop gl = S.prop("glasses", hd[0], hd[1]); gl.s = 1.1 * b; S.pr(a, gl); }      // 처음엔 눈을 찡그리다 선글라스를 낀다
            if (u > .3 && u < .85 && S.every(A, "sp", .35)) S.ptx("spark", a.x + a.dir * (hd[0] + h * .2), S.feetY(a) - S.liftOf(a) + hd[1] - h * .12, 1, po().a(-PI * .7, -PI * .3).s(6, 12).g(0).l(.3, .55).jx(5).r(.9));
            if (u > .2 && S.once(A, "sy")) wsay(S, a, "squint", 2.0);
        }, null);
        // 바람: 바람을 마주 보고 몸을 기울여 버틴다 · 바람에 떠밀려 조금 밀리고 낙엽이 날아간다
        A_(S, "gust", 3.0, (a, t, A) -> { A.d0 = a.dir; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; double[] r = S.inRange(a); S.standF(a); a.dir = -1;
            double k = Math.min(1, u / .15) * (u > .85 ? (1 - u) / .15 : 1), sw = Math.sin(T * 7); a.pose = k > .3 ? 5 : -1;
            a.ang = (.2 + .03 * sw) * k; a.pvy = -h * .05; a.ox = Math.sin(T * 23) * .8 * k; a.sx = 1 + .03 * sw * k;
            a.x = clamp(a.x + (10 + 6 * S.L.wind) * dt * k, r[0], r[1]);
            if (S.every(A, "lf", .16)) S.ptx(S.rnd() < .5 ? "leaf" : "dust", Math.max(2, a.x - h * 1.2), S.feetY(a) - h * (.2 + S.rnd() * .9), 1, po().a(-.15, .15).s(70, 130).g(-4).l(.7, 1.1).jy(4));
            if (u > .08 && S.once(A, "sy")) wsay(S, a, "gust", 2.0);
        }, (a, A) -> { a.dir = A.d0 != 0 ? A.d0 : 1; });
        // 비: 물웅덩이에서 첨벙첨벙
        A_(S, "splash", 3.0, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t, fy = S.feetY(a); S.standF(a); double ph = T * 7, hop = Math.abs(Math.sin(ph));
            if (hop > .35) a.pose = 2; a.y = -hop * h * .2; a.sy = 1 + (hop < .12 ? -.1 : .02); a.sx = 1 + (hop < .12 ? .08 : 0);
            if (hop < .1 && S.every(A, "lnd", .38)) {
                S.ptx("drop", a.x - a.dir * 2, fy - 1, 6, po().a(-PI * .95, -PI * .05).s(26, 56).g(190).l(.4, .75).jx(h * .22));
                S.ptx("ring", a.x, fy, 1, po().a(0, 0).s(0, 0).g(0).l(.7, .7)); S.haptic("splash");
            }
            if (u > .08 && S.once(A, "sy")) wsay(S, a, "splash", 2.0);
        }, null);
        // 비: 젖은 몸을 부르르 털어 물방울이 사방으로 튄다
        A_(S, "shakeoff", 2.6, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double k = u < .2 ? ease(u / .2) : u < .75 ? 1 : 1 - ease((u - .75) / .25);
            if (k > .3) a.pose = 3; a.ox = Math.sin(T * 36) * 2.4 * k; a.ang = Math.sin(T * 28) * .09 * k; a.sx = a.sy = 1 + .1 * k;
            if (k > .3 && S.every(A, "wd", .07)) S.ptx("drop", a.x, S.feetY(a) - S.liftOf(a) - h * .5, 2, po().a(-PI * .98, -PI * .02).s(40, 85).g(150).l(.35, .6).jx(h * .12).jy(h * .2));
            if (u > .1 && S.once(A, "sy")) wsay(S, a, "shakeoff", 1.9);
        }, null);
        // 눈: 고개를 들고 눈송이를 받아 먹는다
        A_(S, "snowcatch", 3.4, null, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); double b = ease(Math.min(1, u / .2)) * (u > .88 ? 1 - ease((u - .88) / .12) : 1);
            if (u > .4 && u < .85) a.pose = 4; a.ang = -.2 * b + Math.sin(T * 5) * .02 * b; a.pvy = -h * .2; a.y = -Math.abs(Math.sin(T * 6.5)) * h * .06 * b;
            double[] hd = headOf(a, h);
            if (S.every(A, "fl", .12)) S.ptx("flake", a.x + a.dir * (hd[0] + h * .05) + S.rnd(-h * .25, h * .25), S.feetY(a) - S.liftOf(a) + hd[1] - h * .8, 1, po().a(PI * .45, PI * .55).s(26, 40).g(10).l(.35, .5));
            if (u > .45 && u < .85 && S.every(A, "cg", .6)) S.ptx("spark", a.x + a.dir * (hd[0] + h * .12), S.feetY(a) - S.liftOf(a) + hd[1] - h * .1, 2, po().a(-PI, 0).s(8, 16).g(0).l(.25, .45).jx(4).r(.8));
            if (u > .15 && S.once(A, "sy")) wsay(S, a, "snowcatch", 2.2);
        }, null);
        // 안개: 두리번거리며 앞을 살핀다
        A_(S, "peer", 3.6, (a, t, A) -> { A.d0 = a.dir; }, (a, u, dt, A) -> {
            double h = S.HH(a), T = S.t; S.standF(a); a.dir = ((int) Math.floor(u * 4.5) % 2 != 0 ? -1 : 1) * (A.d0 != 0 ? A.d0 : 1);
            double lk = Math.sin(u * PI * 4.5 * .5 * 2); a.ang = .06 * lk; a.sy = 1 + .02 * Math.sin(T * 3); a.y = -Math.abs(Math.sin(T * 5)) * 1.2;
            if (S.every(A, "q", .9)) S.ptx("note", a.x + a.dir * h * .35, S.feetY(a) - S.liftOf(a) - h * 1.05, 1, po().a(-PI * .6, -PI * .4).s(6, 10).g(-4).l(.9, 1.2).r(1));
            if (u > .1 && S.once(A, "sy")) wsay(S, a, "peer", 2.2);
        }, (a, A) -> { a.dir = A.d0 != 0 ? A.d0 : 1; });
    }
}
