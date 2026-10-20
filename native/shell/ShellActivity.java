package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
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
 * 웹뷰 없이 Activity 가 직접 화면을 쥔다: 위에는 탭 내용(ScreenView), 아래에는 엔진이 그린 탭 막대(ScreenView).
 * 이 클래스는 '받아서 올리고, 눌림을 ShellCore 에 묻는' 일만 한다. 글·순서·보임/숨김은 엔진이, 눌림의 뜻은 ShellCore 가 정한다.
 * 기존 앱(MainActivity)과 나란히 설치되는 두 번째 아이콘으로 시작한다 — 이 화면에서 안 되는 것을 하나씩 고쳐 간다.
 */
public class ShellActivity extends Activity {
    private static final String PREFS = "gdm_shell";

    private final Handler main = new Handler(Looper.getMainLooper());
    private ShellCore.Store store;
    private LinearLayout root;
    private FrameLayout holder;
    private ScreenView content, tabs;
    private float dpr = 1f;
    private int seqContent = 0, seqTabs = 0;

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
        holder = new FrameLayout(this);
        content = new ScreenView(this);
        content.setDpr(dpr);
        content.setListener(new Host(true));
        holder.addView(content, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(holder, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        tabs = new ScreenView(this);
        tabs.setDpr(dpr);
        tabs.setListener(new Host(false));
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
        if (!ShellCore.DEFAULT_TAB.equals(t)) showTab(ShellCore.DEFAULT_TAB);
        else super.onBackPressed();
    }

    // ───────────── 색 ─────────────
    private void applyTheme() {
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        content.setPalette(pal);
        tabs.setPalette(pal);
        root.setBackgroundColor(pal[ScreenView.R_BG]);
        getWindow().getDecorView().setBackgroundColor(pal[ScreenView.R_BG]);
    }

    // ───────────── 화면 받기 ─────────────
    private void showTab(String tab) {
        loadTabs(tab);
        loadContent(tab);
    }

    private void loadTabs(final String tab) {
        final int my = ++seqTabs;
        final String url = ShellCore.tabsUrl(), body = ShellCore.tabsBody(tab);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(url, body, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() { if (my == seqTabs) present(tabs, txt, false); } });
            }
        }, "shell-tabs").start();
    }

    private void loadContent(String tab) { loadContent(tab, false); }

    private void loadContent(final String tab, final boolean keep) {
        final int my = ++seqContent;
        if (ShellCore.sourceOf(tab) == ShellCore.SRC_PENDING) { present(content, ShellCore.pendingScreen(tab), false); return; }
        final String url = ShellCore.settingsUrl(store);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.get(url, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() { if (my == seqContent) present(content, txt, keep); } });
            }
        }, "shell-content").start();
    }

    /** 받은 글을 검증해 올린다. 못 읽으면 지금 화면을 그대로 두고 알린다(웹으로 돌아가지 않는다). */
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
        private final boolean isContent;
        Host(boolean isContent) { this.isContent = isContent; }

        @Override public void onAction(ScreenCore.Act a) { handle(a, false); }
        @Override public void onSet(ScreenCore.Act a, boolean on) { handle(a, on); }
        @Override public void onSearch(ScreenCore.Act a, String q) { }
        @Override public void onInputFocus(boolean on) { }
        @Override public void onFirstDraw() { }
        @Override public void onText(String key, String value, String kind) { }
        @Override public void onContentH(float dp) { }

        private void handle(ScreenCore.Act a, boolean on) {
            ShellCore.Effect e;
            if (!isContent) e = ShellCore.routeTabs(store, a.a, a.v);
            else {
                Map<String, String> f = content.fields();
                e = ShellCore.routeSettings(store, a.a, a.v, a.key, on, f);
            }
            apply(e);
        }
    }

    private void apply(ShellCore.Effect e) {
        switch (e.kind) {
            case ShellCore.E_TAB: showTab(e.arg); break;
            case ShellCore.E_REFRESH: applyTheme(); loadContent(ShellCore.currentTab(store), true); break;
            case ShellCore.E_TOAST: toast(e.arg); loadContent(ShellCore.currentTab(store), true); break;
            default: break;
        }
    }
}
