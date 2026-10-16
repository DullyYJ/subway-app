package com.dullyyj.subway;

import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.LinearGradientPaint;
import java.awt.RadialGradientPaint;
import java.awt.Paint;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.geom.AffineTransform;
import java.awt.geom.Arc2D;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** 시험용 도화지: SceneCv 를 java.awt(Graphics2D) 로 그린다. 안드로이드의 AndroidCv 와 같은 약속(Canvas2D)을 따른다. */
public class AwtCv implements SceneCv {
    static final class Img implements SceneCv.Img { final BufferedImage im; Img(BufferedImage im) { this.im = im; } public int w() { return im.getWidth(); } public int h() { return im.getHeight(); } }
    static final class AwtLayer implements SceneCv.Layer {
        final BufferedImage im; final AwtCv cv;
        AwtLayer(double w, double h, double dpr) {
            im = new BufferedImage(Math.max(1, (int) Math.round(w * dpr)), Math.max(1, (int) Math.round(h * dpr)), BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = im.createGraphics(); g.scale(dpr, dpr); cv = new AwtCv(g);
        }
        public int w() { return im.getWidth(); } public int h() { return im.getHeight(); } public SceneCv cv() { return cv; }
    }
    static final class Gr implements SceneCv.Grad {
        final boolean radial; final double x0, y0, r0, x1, y1, r1; final List<Double> pos = new ArrayList<>(); final List<Integer> col = new ArrayList<>();
        Gr(boolean radial, double x0, double y0, double r0, double x1, double y1, double r1) { this.radial = radial; this.x0 = x0; this.y0 = y0; this.r0 = r0; this.x1 = x1; this.y1 = y1; this.r1 = r1; }
        public SceneCv.Grad stop(double p, int argb) { pos.add(p); col.add(argb); return this; }
        Paint paint() {
            int n = pos.size(); float[] f = new float[n]; Color[] c = new Color[n];
            for (int i = 0; i < n; i++) { f[i] = (float) Math.min(1, Math.max(0, pos.get(i))); if (i > 0 && f[i] <= f[i - 1]) f[i] = Math.min(1f, f[i - 1] + 0.0001f); c[i] = new Color(col.get(i), true); }
            if (n < 2) return n == 1 ? c[0] : Color.BLACK;
            if (radial) return new RadialGradientPaint(new Point2D.Double(x1, y1), (float) Math.max(.001, r1), new Point2D.Double(x1, y1), f, c, java.awt.MultipleGradientPaint.CycleMethod.NO_CYCLE);
            double ex = x1 - x0, ey = y1 - y0; if (ex * ex + ey * ey < 1e-9) { ey = 1e-3; }
            return new LinearGradientPaint(new Point2D.Double(x0, y0), new Point2D.Double(x0 + ex, y0 + ey), f, c);
        }
    }
    static final class St { AffineTransform tf; Shape clip; Paint fill; Color stroke; double lw, alpha; boolean round; double font; }

    final Graphics2D g; final ArrayDeque<St> stack = new ArrayDeque<>();
    Paint fill = Color.BLACK; Color stroke = Color.BLACK; double lw = 1, alpha = 1, fontPx = 10; boolean round;
    Path2D.Double path = new Path2D.Double(); boolean has; double cx, cy;

    public AwtCv(Graphics2D g) {
        this.g = g;
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
    }
    public void save() { St s = new St(); s.tf = g.getTransform(); s.clip = g.getClip(); s.fill = fill; s.stroke = stroke; s.lw = lw; s.alpha = alpha; s.round = round; s.font = fontPx; stack.push(s); }
    public void restore() { if (stack.isEmpty()) return; St s = stack.pop(); g.setTransform(s.tf); g.setClip(s.clip); fill = s.fill; stroke = s.stroke; lw = s.lw; alpha = s.alpha; round = s.round; fontPx = s.font; }
    public void translate(double x, double y) { g.translate(x, y); }
    public void rotate(double r) { g.rotate(r); }
    public void scale(double sx, double sy) { g.scale(sx, sy); }
    public void fillStyle(int argb) { fill = new Color(argb, true); }
    public void fillGrad(SceneCv.Grad gr) { fill = ((Gr) gr).paint(); }
    public void strokeStyle(int argb) { stroke = new Color(argb, true); }
    public void lineWidth(double w) { lw = w; }
    public void lineCapRound(boolean r) { round = r; }
    public void globalAlpha(double a) { alpha = a; }
    public void beginPath() { path = new Path2D.Double(); has = false; }
    public void moveTo(double x, double y) { path.moveTo(x, y); has = true; cx = x; cy = y; }
    public void lineTo(double x, double y) { if (!has) path.moveTo(x, y); else path.lineTo(x, y); has = true; cx = x; cy = y; }
    public void quadTo(double a, double b, double x, double y) { if (!has) path.moveTo(a, b); path.quadTo(a, b, x, y); has = true; cx = x; cy = y; }
    public void bezierTo(double a, double b, double c, double d, double x, double y) { if (!has) path.moveTo(a, b); path.curveTo(a, b, c, d, x, y); has = true; cx = x; cy = y; }
    public void closePath() { if (has) path.closePath(); }
    public void rect(double x, double y, double w, double h) { path.append(new Rectangle2D.Double(x, y, w, h), false); has = true; }
    public void arc(double x, double y, double r, double a0, double a1) { ellipse(x, y, r, r, 0, a0, a1); }
    public void ellipse(double x, double y, double rx, double ry, double rot, double a0, double a1) {
        // Canvas2D 와 같다: 이미 그리던 경로가 있으면 현재 점에서 호의 시작점까지 직선으로 잇는다(웹 그림의 나뭇잎 가장자리 모양이 그래서 나온다)
        double sweep = a1 - a0; if (sweep >= Math.PI * 2 - 1e-9) sweep = Math.PI * 2; else { sweep = sweep % (Math.PI * 2); if (sweep < 0) sweep += Math.PI * 2; }
        Shape s = new Arc2D.Double(x - rx, y - ry, rx * 2, ry * 2, -Math.toDegrees(a0), -Math.toDegrees(sweep), Arc2D.OPEN);
        if (rot != 0) s = AffineTransform.getRotateInstance(rot, x, y).createTransformedShape(s);
        path.append(s, has); has = true;
    }
    private void comp() { g.setComposite(alpha >= 1 ? AlphaComposite.SrcOver : AlphaComposite.getInstance(AlphaComposite.SRC_OVER, (float) Math.max(0, Math.min(1, alpha)))); }
    public void fill() { comp(); g.setPaint(fill); g.fill(path); }
    public void stroke() { comp(); g.setColor(stroke); g.setStroke(new BasicStroke((float) lw, round ? BasicStroke.CAP_ROUND : BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f)); g.draw(path); }
    public void clip() { g.clip(path); }
    public void fillRect(double x, double y, double w, double h) { comp(); g.setPaint(fill); g.fill(new Rectangle2D.Double(x, y, w, h)); }
    public void font(double px) { fontPx = px; }
    private Font f() { return new Font("SansSerif", Font.BOLD, 1).deriveFont((float) fontPx); }
    public void fillTextC(String s, double x, double y) {
        comp(); g.setPaint(fill); g.setFont(f()); FontMetrics fm = g.getFontMetrics();
        g.drawString(s, (float) (x - fm.stringWidth(s) / 2.0), (float) (y + (fm.getAscent() - fm.getDescent()) / 2.0));
    }
    public double measureText(String s) { g.setFont(f()); return g.getFontMetrics().stringWidth(s); }
    public SceneCv.Grad linear(double x0, double y0, double x1, double y1) { return new Gr(false, x0, y0, 0, x1, y1, 0); }
    public SceneCv.Grad radial(double x0, double y0, double r0, double x1, double y1, double r1) { return new Gr(true, x0, y0, r0, x1, y1, r1); }
    private BufferedImage im(SceneCv.Img i) { return i instanceof AwtLayer ? ((AwtLayer) i).im : ((Img) i).im; }
    public void drawImage(SceneCv.Img img, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh) {
        comp(); AffineTransform t0 = g.getTransform(); g.translate(dx, dy); g.scale(dw / sw, dh / sh);
        BufferedImage b = im(img); g.drawImage(b, 0, 0, (int) Math.round(sw), (int) Math.round(sh), (int) Math.round(sx), (int) Math.round(sy), (int) Math.round(sx + sw), (int) Math.round(sy + sh), null);
        g.setTransform(t0);
    }
    public void drawImage(SceneCv.Img img, double dx, double dy, double dw, double dh) {
        BufferedImage b = im(img); drawImage(img, 0, 0, b.getWidth(), b.getHeight(), dx, dy, dw, dh);
    }
    public SceneCv.Layer newLayer(double w, double h, double dpr) { return new AwtLayer(w, h, dpr); }
}
