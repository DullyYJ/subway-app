package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;

import java.util.Map;

/**
 * 웹이 없는 길동무 껍데기 — 2026-10-20 (s84).
 * Activity 가 직접 화면을 쥔다: 위에는 탭 내용(머리 칸 + 본문 칸, 모두 ScreenView), 아래에는 엔진이 그린 탭 막대(ScreenView).
 * 이 클래스는 '원자료를 받아 엔진에 묻고, 받은 화면을 검증해 올리고, 눌림을 ShellCore 에 묻는' 일만 한다.
 * 글·순서·보임/숨김은 엔진이, 눌림의 뜻과 요청 모양은 ShellCore 가 정한다. 못 받거나 틀린 화면은 알림으로 알리고 지금 화면을 둔다.
 */
public class ShellActivity extends Activity {
    private static final String PREFS = "gdm_shell";

    private final Handler main = new Handler(Looper.getMainLooper());
    private ShellCore.Store store;
    private LinearLayout root;
    private ScreenView head, body, tabs;
    private float dpr = 1f;
    private String[] slots = new String[0];            // 지금 탭의 화면 칸들(위 → 아래)
    private final int[] seq = new int[2];              // 칸마다 가장 새 요청 번호(늦게 온 옛 답은 버린다)
    private int seqTabs = 0;
    private volatile ShellCore.NewsRows lastNews = new ShellCore.NewsRows();

    /** SharedPreferences 를 ShellCore.Store 로 감싼다. */
    private static final class PrefStore implements ShellCore.Store {
        private final SharedPreferences sp;
        PrefStore(SharedPreferences sp) { this.sp = sp; }
        @Override public String get(String k, String d) { try { return sp.getString(k, d); } catch (Throwable t) { return d; } }
        @Override public void put(String k, String v) { try { sp.edit().putString(k, v).apply(); } catch (Throwable ignored) { } }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new PrefStore(getSharedPreferences(PREFS, Context.MODE_PRIVATE));
        dpr = getResources().getDisplayMetrics().density;
        ScreenView.preloadFaces(this);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        head = new ScreenView(this);
        head.setDpr(dpr);
        head.setListener(new Host(0));
        root.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(44f * dpr)));
        FrameLayout holder = new FrameLayout(this);                 // 본문 칸의 검색 입력칸이 붙을 부모
        body = new ScreenView(this);
        body.setDpr(dpr);
        body.setListener(new Host(1));
        holder.addView(body, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(holder, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        tabs = new ScreenView(this);
        tabs.setDpr(dpr);
        tabs.setListener(new Host(2));
        root.addView(tabs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(56f * dpr)));
        setContentView(root);

        // 상태 표시줄·내비게이션 막대 자리만큼 비운다
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(), in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
                return in;
            }
        });
        applyTheme();
        showTab(ShellCore.currentTab(store));
    }

    @Override public void onBackPressed() {
        String t = ShellCore.currentTab(store);
        if (!ShellCore.DEFAULT_TAB.equals(t)) {
            store.put(ShellCore.K_TAB, ShellCore.DEFAULT_TAB);
            showTab(ShellCore.DEFAULT_TAB);
        } else super.onBackPressed();
    }

    // ───────────── 색 ─────────────
    private void applyTheme() {
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        head.setPalette(pal);
        body.setPalette(pal);
        tabs.setPalette(pal);
        root.setBackgroundColor(pal[ScreenView.R_BG]);
        getWindow().getDecorView().setBackgroundColor(pal[ScreenView.R_BG]);
    }

    // ───────────── 화면 받기 ─────────────
    private void showTab(String tab) {
        slots = ShellCore.slotsOf(store, tab);
        head.setVisibility(slots.length > 1 ? View.VISIBLE : View.GONE);
        loadTabs(tab);
        for (int i = 0; i < slots.length; i++) loadSlot(i, false);
    }

    private ScreenView viewOfSlot(int i) { return slots.length > 1 && i == 0 ? head : body; }

    private void loadTabs(final String tab) {
        final int my = ++seqTabs;
        final String url = ShellCore.tabsUrl(), json = ShellCore.tabsBody(tab);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(url, json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() { if (my == seqTabs) present(tabs, txt, false); } });
            }
        }, "shell-tabs").start();
    }

    /** 칸 i 의 화면을 받아 올린다. 원자료가 있는 화면은 먼저 원자료를 받는다. */
    private void loadSlot(final int i, final boolean keep) {
        if (i < 0 || i >= slots.length) return;
        final String screen = slots[i];
        final int si = slots.length > 1 ? i : 1;                // seq 번호: 머리 0 · 본문 1
        final int my = ++seq[si];
        final ScreenView v = viewOfSlot(i);
        if (ShellCore.S_PENDING.equals(screen)) { present(v, ShellCore.pendingScreen(ShellCore.currentTab(store)), false); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                String[] urls = ShellCore.feedUrls(screen), feeds = new String[urls.length];
                for (int k = 0; k < urls.length; k++) {
                    NetPost.Res fr = NetPost.get(urls[k], 8000);
                    feeds[k] = fr.status == 200 ? fr.body : "";
                }
                if (ShellCore.S_NEWS.equals(screen)) lastNews = ShellCore.NewsRows.from(feeds);
                ShellCore.Req rq = ShellCore.request(screen, store, feeds);
                NetPost.Res r = rq == null ? null : ("GET".equals(rq.method) ? NetPost.get(rq.url, 10000) : NetPost.post(rq.url, rq.body, 10000));
                final String txt = (r != null && r.status == 200) ? r.body : "";
                main.post(new Runnable() { @Override public void run() { if (my == seq[si]) present(v, txt, keep); } });
            }
        }, "shell-slot").start();
    }

    /** 받은 글을 검증해 올린다. 못 읽으면 지금 화면을 그대로 두고 알린다. */
    private void present(ScreenView v, String json, boolean keep) {
        if (json == null || json.length() == 0) { toast("화면을 받지 못했어요"); return; }
        try {
            ScreenCore.Screen sc = ScreenCore.load(json);
            v.setScreen(sc, keep);
        } catch (Exception e) {
            toast("화면이 올바르지 않아요: " + String.valueOf(e.getMessage()));
        }
    }

    private void toast(String m) { try { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); } catch (Throwable ignored) { } }

    // ───────────── 눌림 ─────────────
    private final class Host implements ScreenView.Listener {
        private final int which;                      // 0 머리 · 1 본문 · 2 탭 막대
        Host(int which) { this.which = which; }

        private String screenName() {
            if (which == 2) return "tabs";
            if (slots.length > 1) return slots[which == 0 ? 0 : 1];
            return slots.length > 0 ? slots[0] : "";
        }
        @Override public void onAction(ScreenCore.Act a) { handle(a, false); }
        @Override public void onSet(ScreenCore.Act a, boolean on) { handle(a, on); }
        @Override public void onSearch(ScreenCore.Act a, String q) { apply(ShellCore.routeSearch(a.tpl, a.empty, q)); }
        @Override public void onInputFocus(boolean on) { }
        @Override public void onFirstDraw() { }
        @Override public void onText(String key, String value, String kind) { }
        @Override public void onContentH(float dp) {
            if (which != 0 || slots.length < 2) return;           // 머리 칸만 그린 내용 높이에 맞춘다
            final int h = Math.max(1, Math.round(dp * dpr));
            ViewGroup.LayoutParams lp = head.getLayoutParams();
            if (lp != null && lp.height != h) { lp.height = h; head.setLayoutParams(lp); }
        }

        private void handle(ScreenCore.Act a, boolean on) {
            ShellCore.Effect e;
            if (which == 2) e = ShellCore.routeTabs(store, a.a, a.v);
            else {
                Map<String, String> f = (which == 0 ? head : body).fields();
                e = ShellCore.route(screenName(), store, a.a, a.v, a.key, on, a.url, f);
            }
            apply(e);
        }
    }

    private void apply(ShellCore.Effect e) {
        switch (e.kind) {
            case ShellCore.E_TAB: showTab(e.arg); break;
            case ShellCore.E_REFRESH: applyTheme(); loadSlot(slots.length - 1, true); break;
            case ShellCore.E_TOAST: toast(e.arg); loadSlot(slots.length - 1, true); break;
            case ShellCore.E_LINK: openLink(e.arg); break;
            case ShellCore.E_NEWS: openNews(e.arg); break;
            default: break;
        }
    }

    private void openLink(String url) {
        if (!ShellCore.linkOk(url)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (ActivityNotFoundException e) { toast("열 수 있는 앱이 없어요"); }
    }

    /** 기사 상세: 엔진에 문구를 묻고 안내창으로 보인다. */
    private void openNews(String idx) {
        final int i;
        try { i = Integer.parseInt(idx); } catch (NumberFormatException e) { return; }
        final ShellCore.NewsRows rows = lastNews;
        if (i < 0 || i >= rows.rows.size()) return;
        final String link = rows.rows.get(i)[1];
        final String json = ShellCore.newsDetailBody(rows.rowJson(i));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/news", json, 8000);
                final ShellCore.Detail d = r.status == 200 ? ShellCore.parseDetail(r.body, link) : null;
                main.post(new Runnable() { @Override public void run() { if (d == null) toast("기사 내용을 받지 못했어요"); else showDetail(d); } });
            }
        }, "shell-news").start();
    }

    private void showDetail(final ShellCore.Detail d) {
        StringBuilder m = new StringBuilder();
        if (d.meta.length() > 0) m.append(d.meta).append("\n\n");
        m.append(d.body);
        if (d.notice.length() > 0) m.append("\n\n").append(d.notice);
        AlertDialog.Builder b = new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog_Alert);
        b.setTitle(d.title).setMessage(m.toString()).setNegativeButton(d.close, null);
        if (d.open) {
            b.setPositiveButton(d.btn.length() > 0 ? d.btn : "원문 보기", new android.content.DialogInterface.OnClickListener() {
                @Override public void onClick(android.content.DialogInterface di, int w) { openLink(d.link); }
            });
        }
        try { b.show(); } catch (Throwable t) { toast(d.title); }
    }
}
