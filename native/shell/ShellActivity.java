package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
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

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
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
    private final HomeCore home = new HomeCore();       // 홈 탭 입력 상태(고른 출발/도착·후보·기준시각)
    private int seqHome = 0, seqCand = 0, seqBoard = 0;
    private BoardCore board;
    private MapCore map;                                   // 지도 탭(안쪽 탭·지역·호선 필터·눌린 역)
    private int seqMapH = 0, seqMapB = 0;
    private FrameLayout holder;
    private MetroMapView mapView;
    private MetroMapData mapData;
    private boolean mapDataLoading;
    private final FoodCore food = new FoodCore();         // 맛집 탭(도착지·기기 위치·받은 원자료)
    private int seqFood = 0;
    private ChatCore chat;
    private int seqChat = 0;
    private boolean chatPolling;
    private ScreenView sheetView;                       // 글쓰기 같은 아래에서 올라오는 시트
    private android.app.Dialog sheet;
    private String sheetName = "", writeErr = "", writeT = "", writeB = "";
    private boolean writeBusy;
    private final java.util.Map<String, Long> cmtAt = new java.util.HashMap<String, Long>();
    private volatile String resCacheKey = "", resCacheJson = "";   // 결과 화면 캐시(같은 경로·같은 탭이면 엔진에 다시 묻지 않는다)

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
        board = new BoardCore(store);
        chat = new ChatCore(store);
        map = new MapCore(store);
        dpr = getResources().getDisplayMetrics().density;
        ScreenView.preloadFaces(this);

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        head = new ScreenView(this);
        head.setDpr(dpr);
        head.setListener(new Host(0));
        root.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(44f * dpr)));
        holder = new FrameLayout(this);                 // 본문 칸의 검색 입력칸이 붙을 부모
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

    private boolean resumed;
    @Override protected void onResume() { super.onResume(); resumed = true; if (ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) startChatPoll(); }
    @Override protected void onPause() { resumed = false; super.onPause(); }

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
        hideMapView();
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
        if (ShellCore.S_HOME.equals(screen)) { loadHome(v, keep); return; }
        if (ShellCore.S_BOARD.equals(screen)) { loadBoard(v, keep, true); return; }
        if (ShellCore.S_CHAT.equals(screen)) { loadChat(v, keep, true); return; }
        if (ShellCore.S_FOOD.equals(screen)) { loadFood(v, keep, false); return; }
        if (ShellCore.S_MAPH.equals(screen)) { loadMapHead(v, keep, null, null); return; }
        if (ShellCore.S_MAPB.equals(screen)) { loadMapBody(v, keep); return; }
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
        @Override public void onText(String key, String value, String kind) {
            if (!ShellCore.S_HOME.equals(screenName())) return;
            homeText(key, value, kind);
        }
        @Override public void onContentH(float dp) {
            if (which != 0 || slots.length < 2) return;           // 머리 칸만 그린 내용 높이에 맞춘다
            final int h = Math.max(1, Math.round(dp * dpr));
            ViewGroup.LayoutParams lp = head.getLayoutParams();
            if (lp != null && lp.height != h) { lp.height = h; head.setLayoutParams(lp); }
        }

        private void handle(ScreenCore.Act a, boolean on) {
            ShellCore.Effect e;
            if (which == 2) e = ShellCore.routeTabs(store, a.a, a.v);
            else if (ShellCore.S_CHAT.equals(screenName())) {
                chatAct(a, body);
                return;
            } else if (ShellCore.S_BOARD.equals(screenName())) {
                boardAct(a, which == 0 ? head : body);
                return;
            } else if (ShellCore.S_FOOD.equals(screenName())) {
                foodAct(a);
                return;
            } else if (ShellCore.S_MAPH.equals(screenName()) || ShellCore.S_MAPB.equals(screenName())) {
                mapAct(a, which == 0 ? head : body);
                return;
            } else if (ShellCore.S_HOME.equals(screenName())) {
                if ("call".equals(a.a)) homeAct(a.v, body.fields());
                else if ("open".equals(a.a)) apply(ShellCore.linkEffect(a.url));
                return;
            } else {
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




    // ───────────── 실시간소통 ─────────────
    private static final long CHAT_POLL_MS = 6000L;
    private final Runnable chatTick = new Runnable() {
        @Override public void run() {
            chatPolling = false;
            if (!ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "") || !resumed) return;
            loadChat(body, true, true);
            chatPolling = true; main.postDelayed(this, CHAT_POLL_MS);
        }
    };
    private void startChatPoll() { if (!chatPolling) { chatPolling = true; main.postDelayed(chatTick, CHAT_POLL_MS); } }

    /** 실시간소통: 이 방의 대화(전체 /talks · 노선 /lroom)와 공식 공지를 받고 엔진에 그릴 화면을 묻는다. */
    private void loadChat(final ScreenView v, final boolean keep, final boolean fetch) {
        final int my = ++seqChat;
        final String sel = chat.sel(), me = ShellCore.commId(store);
        startChatPoll();
        new Thread(new Runnable() {
            @Override public void run() {
                if (fetch) {
                    if (System.currentTimeMillis() - chat.noticesAt > 60000) {
                        NetPost.Res nr = NetPost.get(ChatCore.noticesUrl(), 8000);
                        if (nr.status == 200) chat.setNotices(nr.body, System.currentTimeMillis());
                    }
                    if ("all".equals(sel)) {
                        NetPost.Res tr = NetPost.get(chat.talksUrlNow(), 7000);
                        if (tr.status == 200) chat.addTalks(tr.body, me); else chat.failed = !chat.loaded;
                    } else {
                        NetPost.Res rr = NetPost.get(chat.roomUrl(sel), 12000);
                        if (rr.status == 200) chat.addRoom(sel, rr.body); else chat.failed = !chat.loaded;
                    }
                }
                final String body = chat.request(ShellCore.CAP, ShellCore.theme(store), -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000, me, System.currentTimeMillis());
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/chat", body, 10000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqChat) return;
                    present(v, txt, keep);
                    if (txt.length() > 0) chat.onScreen(txt);
                } });
            }
        }, "shell-chat").start();
    }
    private void reloadChat() { if (ShellCore.S_CHAT.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadChat(body, true, false); }

    private void chatAct(ScreenCore.Act a, ScreenView src) {
        if ("cat".equals(a.a)) { chat.select(a.v); loadChat(body, false, true); return; }
        if (!"call".equals(a.a)) return;
        final String me = ShellCore.commId(store);
        int r = chat.act(a.v, src.fields(), me);
        switch (r) {
            case ChatCore.R_NEED_ID: toast("설정에서 커뮤니티 아이디를 등록하면 글과 제보를 남길 수 있어요"); break;
            case ChatCore.R_SEND: {
                final String line = "all".equals(chat.pendingLine) ? chat.postLine : chat.pendingLine, text = chat.pendingText;
                final String json = ChatCore.sendBody(me, text, line);
                src.setField("all".equals(chat.pendingLine) ? "chat.all" : "chat.room", "");
                new Thread(new Runnable() {
                    @Override public void run() {
                        NetPost.Res rr = NetPost.post(ShellCore.BOARD_BASE + "/react", json, 9000);
                        final String why = rr.status == 200 && rr.body != null && rr.body.contains("\"stored\"") ? "" : (rr.status == 0 ? "네트워크가 불안정해요" : rr.body != null && rr.body.contains("filtered") ? "부적절한 표현이 있어 올리지 못했어요" : "잠시 후 다시 시도해 주세요");
                        main.post(new Runnable() { @Override public void run() {
                            if (why.length() > 0) toast(why);
                            loadChat(body, true, true);
                            main.postDelayed(new Runnable() { @Override public void run() { loadChat(body, true, true); } }, 1500);
                        } });
                    }
                }, "shell-chat-send").start();
                break;
            }
            case ChatCore.R_REPORT: {
                final String id = chat.pendingId;
                try {
                    new AlertDialog.Builder(this, android.R.style.Theme_Material_Light_Dialog_Alert).setTitle("이 글을 신고할까요?").setMessage("신고가 여러 명 모이면 자동으로 숨겨져요.")
                        .setNegativeButton("취소", null).setPositiveButton("신고", new android.content.DialogInterface.OnClickListener() {
                            @Override public void onClick(android.content.DialogInterface di, int w) {
                                chat.hide(id); toast("신고했어요. 이 글은 더 이상 보이지 않아요"); reloadChat();
                                final String json = ChatCore.reportBody(id);
                                new Thread(new Runnable() { @Override public void run() { NetPost.post(ShellCore.BOARD_BASE + "/lreport", json, 9000); } }, "shell-lrep").start();
                            }
                        }).show();
                } catch (Throwable t) { toast("신고창을 열지 못했어요"); }
                break;
            }
            default: break;
        }
    }

    // ───────────── 게시판 ─────────────
    private String owner() {
        String k = store.get(BoardCore.K_OWNER, "");
        if (k.length() < 16) {
            byte[] b = new byte[16]; new java.security.SecureRandom().nextBytes(b);
            StringBuilder sb = new StringBuilder(); for (byte x : b) sb.append(String.format("%02x", x & 0xff));
            k = sb.toString(); store.put(BoardCore.K_OWNER, k);
        }
        return k;
    }
    /** 게시판: 서버 글을 받고(fetch=true) 엔진에 그릴 화면을 묻는다. */
    private void loadBoard(final ScreenView v, final boolean keep, final boolean fetch) {
        final int my = ++seqBoard;
        new Thread(new Runnable() {
            @Override public void run() {
                if (fetch) {
                    NetPost.Res pr = NetPost.get(BoardCore.postsUrl(), 8000);
                    final boolean got = pr.status == 200 && board.setPosts(pr.body);
                    if (!got && board.loading) board.loading = false;
                }
                final String body = board.request(ShellCore.CAP, System.currentTimeMillis());
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/board", body, 10000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqBoard) return;
                    present(v, txt, keep);
                    if (txt.length() > 0) board.onScreen(txt);
                } });
            }
        }, "shell-board").start();
    }
    private void reloadBoard() { if (ShellCore.S_BOARD.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadBoard(body, true, false); }

    private void boardAct(ScreenCore.Act a, ScreenView src) {
        if ("tog".equals(a.a)) {                                  // 글을 펼침: 서버 댓글을 받아 온다(15초 안에는 다시 받지 않는다)
            final String id = board.idOfPid(a.v);
            if (id.length() == 0 || !board.isServerPost(id)) return;
            Long last = cmtAt.get(id);
            if (last != null && System.currentTimeMillis() - last < 15000) return;
            cmtAt.put(id, System.currentTimeMillis());
            new Thread(new Runnable() {
                @Override public void run() {
                    NetPost.Res r = NetPost.get(BoardCore.commentsUrl(id), 8000);
                    final boolean ok = r.status == 200 && board.setComments(id, r.body);
                    if (ok) main.post(new Runnable() { @Override public void run() { reloadBoard(); } });
                }
            }, "shell-cmts").start();
            return;
        }
        if (!"call".equals(a.a)) return;
        final long now = System.currentTimeMillis();
        int r = board.act(a.v, src.fields(), now);
        final String id = board.pendingId;
        switch (r) {
            case BoardCore.R_RENDER: reloadBoard(); break;
            case BoardCore.R_WRITE: openWrite(); break;
            case BoardCore.R_REPORT:
                postBg(BoardCore.reportBody(id), "/report"); toast("신고가 접수됐어요. 이 글은 더 이상 보이지 않아요"); reloadBoard(); break;
            case BoardCore.R_DELETE:
                postBg(BoardCore.deleteBody(id, owner()), "/post/mine-delete"); toast("글을 삭제했어요"); reloadBoard(); break;
            case BoardCore.R_COMMENT: {
                String nick = ShellCore.commId(store);
                if (nick.length() == 0) { toast("설정에서 커뮤니티 아이디를 먼저 정해 주세요"); break; }
                String text = board.pendingText;
                board.addLocalComment(id, nick, text, now);
                postBg(BoardCore.commentBody(id, nick, text), "/comment");
                src.setField(board.commentKey(id), "");
                reloadBoard(); break;
            }
            default: break;
        }
    }
    /** 결과를 기다리지 않는 서버 쓰기(신고·삭제·댓글). 실패해도 화면은 이미 바뀌어 있다. */
    private void postBg(final String json, final String path) {
        new Thread(new Runnable() { @Override public void run() { NetPost.post(ShellCore.BOARD_BASE + path, json, 9000); } }, "shell-bw").start();
    }

    // 글쓰기 시트(엔진 /screen/write 가 그린다)
    private void openWrite() {
        if (ShellCore.commId(store).length() == 0) { toast("설정에서 커뮤니티 아이디를 먼저 정해 주세요"); return; }
        writeErr = ""; writeT = ""; writeB = ""; writeBusy = false;
        sheetName = ShellCore.S_WRITE;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        sheetView.setPalette(ShellCore.palette(ShellCore.theme(store)));
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(sheetView);
        try { sheet.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE); } catch (Throwable ignored) { }
        try { sheet.show(); } catch (Throwable t) { toast("글쓰기를 열지 못했어요"); return; }
        loadWrite(false);
    }
    private void loadWrite(final boolean keep) {
        final String json = "{\"cap\":" + ShellCore.CAP + ",\"f\":{\"rc\":0,\"err\":" + ShellCore.q(writeErr) + ",\"busy\":" + (writeBusy ? 1 : 0)
            + ",\"t\":" + ShellCore.q(writeT) + ",\"b\":" + ShellCore.q(writeB) + "}}";
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/write", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() { if (sheet != null && sheet.isShowing()) present(sheetView, txt, keep); } });
            }
        }, "shell-write").start();
    }
    // ───────────── 맛집 ─────────────
    private static final int REQ_FOOD_LOC = 72;

    /** 도착지(홈에서 고른 것)·기기 위치를 FoodCore 에 알리고, 엔진에 화면을 묻는다. 중심 좌표를 알면 서버·공공데이터 원자료를 받아 다시 묻는다. */
    private void loadFood(final ScreenView v, final boolean keep, final boolean force) {
        final int my = ++seqFood;
        HomeCore.Loc d = home.loc[HomeCore.DEST];
        if (d != null && d.ok()) food.setDest(d.name, d.lat, d.lng); else food.setDest("", 0, 0);
        if (force) food.refresh();
        if (food.needGps() && !food.noperm && !food.locating) locateForFood();
        final String json = food.request(ShellCore.CAP, true);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", json, 12000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqFood || txt.length() == 0) { if (txt.length() == 0 && my == seqFood) toast("맛집 화면을 받지 못했어요"); return; }
                    food.onScreen(txt);
                    present(v, txt, keep);
                    if (food.needData()) fetchFoodData(my, v);
                } });
            }
        }, "shell-food").start();
    }
    /** 서버 맛집 + 공공데이터(최대 3쪽)를 받아 FoodCore 에 넣고 엔진에 다시 묻는다. */
    private void fetchFoodData(final int my, final ScreenView v) {
        final String su = food.serverUrl();
        final String[] pu = new String[FoodCore.PUB_PAGES];
        for (int i = 0; i < pu.length; i++) pu[i] = food.publicUrl(i + 1);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res sr = NetPost.get(su, 8000);
                List<String> pubs = new ArrayList<String>();
                for (int i = 0; i < pu.length; i++) {
                    NetPost.Res pr = NetPost.get(pu[i], 10000);
                    pubs.add(pr.status == 200 ? pr.body : "");
                    if (FoodCore.pageCount(pr.status == 200 ? pr.body : "") < FoodCore.PUB_PAGE_SIZE) break;
                }
                final FoodCore.Data data = FoodCore.parseData(sr.status == 200 ? sr.body : "", pubs);
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqFood) return;
                    food.setData(data);
                    final String json = food.request(ShellCore.CAP, true);
                    new Thread(new Runnable() {
                        @Override public void run() {
                            NetPost.Res r2 = NetPost.post(ShellCore.BASE + "/screen/food", json, 20000);
                            final String txt2 = r2.status == 200 ? r2.body : "";
                            main.post(new Runnable() { @Override public void run() {
                                if (my != seqFood) return;
                                if (txt2.length() == 0) { toast("맛집 화면을 받지 못했어요"); return; }
                                food.onScreen(txt2); present(v, txt2, true);
                            } });
                        }
                    }, "shell-food2").start();
                } });
            }
        }, "shell-fooddata").start();
    }
    private void reloadFood() { if (ShellCore.S_FOOD.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadFood(body, true, false); }

    private void foodAct(ScreenCore.Act a) {
        if ("refresh".equals(a.a)) { loadFood(body, true, true); return; }
        if ("cat".equals(a.a)) {
            if (food.pickChip(a.v)) present(body, food.altOf(food.flt), false); else loadFood(body, false, false);
            return;
        }
        if (!"call".equals(a.a)) return;
        switch (food.act(a.v)) {
            case FoodCore.R_SHEET: openFoodSheet(); break;
            default: break;
        }
    }
    private void openFoodSheet() {
        closeSheet();
        sheetName = ShellCore.S_FOODSHEET;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        sheetView.setPalette(ShellCore.palette(ShellCore.theme(store)));
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        sheet.setContentView(sheetView);
        try { sheet.show(); } catch (Throwable t) { toast("가게 정보를 열지 못했어요"); return; }
        final double[] me = food.gps;
        final String json = food.sheetRequest(ShellCore.CAP, me);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/food", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet != null && sheet.isShowing() && ShellCore.S_FOODSHEET.equals(sheetName)) { food.onSheet(txt); present(sheetView, txt, false); }
                } });
            }
        }, "shell-foodsheet").start();
    }
    /** 외부 지도 앱을 열어 보고, 없으면 웹 주소로 연다. */
    private void openExternal(String app, String web) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(app))); return; }
        catch (Throwable ignored) { /* 앱 없음 */ }
        openLink(web);
    }

    /** 위치 한 번 받기(홈의 위치 감지와 따로 — 홈 입력칸은 건드리지 않는다). 결과는 cb 로. */
    private interface LocCb { void fix(Location l); void fail(boolean noperm); }
    private LocCb pendingLoc;
    private void locateOnce(final int reqCode, final LocCb cb) {
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            pendingLoc = cb;
            requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, reqCode);
            return;
        }
        final LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            Location best = null;
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
            if (best != null && System.currentTimeMillis() - best.getTime() < 5 * 60 * 1000L) { cb.fix(best); return; }
            String prov = lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            final Location fallback = best;
            final boolean[] done = { false };
            final LocationListener ll = new LocationListener() {
                @Override public void onLocationChanged(Location l) { if (done[0]) return; done[0] = true; try { lm.removeUpdates(this); } catch (Throwable ignored) { } cb.fix(l); }
                @Override public void onProviderEnabled(String p) { }
                @Override public void onProviderDisabled(String p) { }
                @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle b) { }
            };
            lm.requestSingleUpdate(prov, ll, Looper.getMainLooper());
            main.postDelayed(new Runnable() { @Override public void run() {
                if (done[0]) return; done[0] = true;
                try { lm.removeUpdates(ll); } catch (Throwable ignored) { }
                if (fallback != null) cb.fix(fallback); else cb.fail(false);
            } }, 8000);
        } catch (Throwable t) { cb.fail(false); }
    }
    private void locateForFood() {
        food.locating = true;
        locateOnce(REQ_FOOD_LOC, new LocCb() {
            @Override public void fix(Location l) { food.setGps(l.getLatitude(), l.getLongitude()); reloadFood(); }
            @Override public void fail(boolean noperm) { food.noperm = true; food.locating = false; reloadFood(); }
        });
    }

    // ───────────── 지도 ─────────────
    private static final int REQ_MAP_LOC = 73;

    private void loadMapHead(final ScreenView v, final boolean keep, final String q, final Runnable after) {
        final int my = ++seqMapH;
        final String typed = q != null ? q : (head.fields().get("mq") == null ? "" : head.fields().get("mq"));
        final String json = map.headRequest(ShellCore.CAP, ShellCore.theme(store), typed);
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapH) return;
                    present(v, txt, keep);
                    if (txt.length() > 0) { map.onScreen(txt); if (after != null) after.run(); }
                } });
            }
        }, "shell-maph").start();
    }
    private void loadMapBody(final ScreenView v, final boolean keep) { loadMapBodyRound(v, keep, 0); }
    /** 버스는 엔진이 "이 주소들을 받아 와라" 하면 받아서 다시 묻는다(위치 → 정류장 → 도착정보, 최대 3번). */
    private void loadMapBodyRound(final ScreenView v, final boolean keep, final int round) {
        final int my = ++seqMapB;
        final String json = map.bodyRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    if (txt.length() > 0) map.onScreen(txt);
                    present(v, txt, keep);
                    syncMapView();
                    if (txt.length() > 0 && !map.busNeed.isEmpty() && round < 3) fetchBusNeed(v, keep, round, my);
                } });
            }
        }, "shell-mapb").start();
    }
    private void fetchBusNeed(final ScreenView v, final boolean keep, final int round, final int my) {
        final List<String[]> need = new ArrayList<String[]>(map.busNeed);
        new Thread(new Runnable() {
            @Override public void run() {
                final String[] got = new String[need.size()];
                Thread[] ts = new Thread[need.size()];
                for (int i = 0; i < need.size(); i++) {
                    final int k = i;
                    ts[i] = new Thread(new Runnable() { @Override public void run() {
                        String u = MapCore.busFetchUrl(need.get(k)[1]);
                        NetPost.Res r = u.length() == 0 ? null : NetPost.get(u, 9000);
                        got[k] = r != null && r.status == 200 ? r.body : "";
                    } });
                    ts[i].start();
                }
                for (Thread t : ts) { try { t.join(12000); } catch (InterruptedException e) { /* 무시 */ } }
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqMapB) return;
                    for (int i = 0; i < need.size(); i++) map.addBusRes(need.get(i)[0], got[i] == null ? "" : got[i]);
                    map.busNeed.clear();
                    loadMapBodyRound(v, true, round + 1);
                } });
            }
        }, "shell-mapbus").start();
    }
    private void reloadMap(boolean headToo) {
        if (headToo) loadMapHead(head, true, null, null);
        loadMapBody(body, false);
    }

    private void mapAct(ScreenCore.Act a, ScreenView src) {
        if ("cat".equals(a.a)) {
            if (map.cat(a.v) == MapCore.R_RENDER) {
                if (a.v.startsWith("f:") && mapView != null) mapView.setFilter(map.flt());
                reloadMap(true);
            }
            return;
        }
        if (!"call".equals(a.a)) return;
        switch (map.act(a.v, head.fields())) {
            case MapCore.R_FIND: {
                final String q = head.fields().get("mq");
                loadMapHead(head, true, q, new Runnable() { @Override public void run() {
                    if (mapView == null || map.findName.length() == 0 || !mapView.centerOn(map.findName, 1.6f, true)) toast("'" + q.trim() + "' 역을 찾지 못했어요");
                } });
                break;
            }
            case MapCore.R_LOC:
                toast("내 위치 확인 중...");
                locateOnce(REQ_MAP_LOC, new LocCb() {
                    @Override public void fix(Location l) {
                        map.gps = new double[] { l.getLatitude(), l.getLongitude() };
                        loadMapHead(head, true, null, new Runnable() { @Override public void run() {
                            map.gps = null;
                            if (mapView != null && map.nearName.length() > 0 && mapView.centerOn(map.nearName, 1.6f, true)) toast(map.nearName + " (가장 가까운 역)");
                            else toast("가까운 역을 지도에서 찾지 못했어요");
                        } });
                    }
                    @Override public void fail(boolean noperm) { toast(noperm ? "위치 권한이 필요해요" : "현재 위치를 찾지 못했어요"); }
                });
                break;
            case MapCore.R_BUS_LOC:
                toast("내 위치 확인 중...");
                locateOnce(REQ_MAP_LOC, new LocCb() {
                    @Override public void fix(Location l) { map.setBusLoc(l.getLatitude(), l.getLongitude()); loadMapBody(body, true); }
                    @Override public void fail(boolean noperm) { toast(noperm ? "위치 권한이 필요해요" : "현재 위치를 찾지 못했어요"); }
                });
                break;
            case MapCore.R_STN: openMapSheet(S_STN_H); break;
            default: break;
        }
    }
    private static final int S_STN_H = 330, S_TT_H = -58;

    // 노선도 View: 수도권 지하철일 때만 본문 위에 얹는다
    private void syncMapView() {
        boolean want = "metro".equals(map.view) && ShellCore.S_MAPB.equals(slots.length > 1 ? slots[1] : "");
        if (!want) { if (mapView != null) mapView.setVisibility(View.GONE); return; }
        if (mapView != null) { mapView.setVisibility(View.VISIBLE); mapView.setFilter(map.flt()); return; }
        if (mapDataLoading) return;
        mapDataLoading = true;
        new Thread(new Runnable() {
            @Override public void run() {
                MetroMapData d = null;
                try { d = MetroMapData.parse(getAssets().open("metro_native.bin")); } catch (Throwable t) { d = null; }
                final MetroMapData fd = d;
                main.post(new Runnable() { @Override public void run() {
                    mapDataLoading = false;
                    if (fd == null) { toast("노선도를 열지 못했어요"); return; }
                    mapData = fd;
                    mapView = new MetroMapView(ShellActivity.this, fd, dpr);
                    mapView.setListener(new MetroMapView.Listener() {
                        @Override public void onStation(int op, float sx, float sy) {
                            map.tapStation(mapData.labelName(op));
                            openMapSheet(S_STN_H);
                        }
                        @Override public void onGestureStart() { if (ShellCore.S_MAPSTN.equals(sheetName) || ShellCore.S_MAPTT.equals(sheetName)) closeSheet(); }
                        @Override public void onReady() { }
                        @Override public void onError(String msg) { toast("노선도를 그리지 못했어요"); }
                        @Override public void onCentered(int op) { map.tapStation(mapData.labelName(op)); openMapSheet(S_STN_H); }
                    });
                    holder.addView(mapView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                    mapView.setFilter(map.flt());
                    syncMapView();
                } });
            }
        }, "shell-mapdata").start();
    }
    private void hideMapView() {
        closeSheet();
        if (mapView != null) mapView.setVisibility(View.GONE);
    }

    /** 아래에서 올라오는 팝업(역 정보·시간표). hDp > 0 이면 그 높이(dp), 음수면 화면 높이의 -hDp %. */
    private void openMapSheet(int hDp) {
        closeSheet();
        sheetName = ShellCore.S_MAPSTN;
        sheetView = new ScreenView(this);
        sheetView.setDpr(dpr);
        int[] pal = ShellCore.palette(ShellCore.theme(store));
        sheetView.setPalette(pal);
        sheetView.setListener(new SheetHost());
        sheet = new android.app.Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        sheet.setContentView(sheetView);
        try {
            android.view.Window w = sheet.getWindow();
            int hpx = hDp > 0 ? Math.round(hDp * dpr) : Math.round(getResources().getDisplayMetrics().heightPixels * (-hDp) / 100f);
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, hpx);
            w.setGravity(android.view.Gravity.BOTTOM);
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(pal[ScreenView.R_BG]));
            w.clearFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            w.setWindowAnimations(android.R.style.Animation_InputMethod);
            sheet.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() { @Override public void onDismiss(android.content.DialogInterface d) { map.ttSeq++; } });
            sheet.show();
        } catch (Throwable t) { toast("역 정보를 열지 못했어요"); return; }
        final String json = map.stnRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_MAPSTN.equals(sheetName)) return;
                    if (txt.length() == 0) { closeSheet(); return; }          // 역이 아닌 글자 — 조용히 닫는다
                    map.onStn(txt); map.setLinesFromStn(txt);
                    present(sheetView, txt, false);
                    if (mapView != null) mapView.ensureVisible(map.stn);
                } });
            }
        }, "shell-mapstn").start();
    }

    private void mapSheetAct(String v) {
        switch (map.sheetAct(v)) {
            case MapCore.R_CLOSE: closeSheet(); break;
            case MapCore.R_START:
                home.setStation(HomeCore.START, map.pickName, map.pickLine, map.pickLa, map.pickLo);
                closeSheet(); toast("출발역: " + map.pickName + " · 이제 도착역을 선택하세요");
                break;
            case MapCore.R_DEST:
                home.setStation(HomeCore.DEST, map.pickName, map.pickLine, map.pickLa, map.pickLo);
                closeSheet();
                if (home.bothSet()) {
                    toast("도착역: " + map.pickName);
                    store.put(ShellCore.K_TAB, "home"); showTab("home");
                    main.postDelayed(new Runnable() { @Override public void run() { goRoute(); } }, 400);
                } else toast("도착역: " + map.pickName + " · 출발역도 골라 주세요");
                break;
            case MapCore.R_TT: openTimetable(); break;
            case MapCore.R_TT_LOAD: ttFetch(); break;
            case MapCore.R_TT_RENDER: ttRender(); break;
            default: break;
        }
    }
    private void openTimetable() {
        if (sheet == null) return;
        try { android.view.Window w = sheet.getWindow(); w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, Math.round(getResources().getDisplayMetrics().heightPixels * 0.62f)); } catch (Throwable ignored) { }
        sheetName = ShellCore.S_MAPTT;
        ttRender();
        ttFetch();
    }
    private void ttRender() {
        final String json = map.ttRequest(ShellCore.CAP, ShellCore.theme(store));
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/map", json, 8000);
                final String txt = r.status == 200 ? r.body : "";
                main.post(new Runnable() { @Override public void run() {
                    if (sheet == null || !sheet.isShowing() || !ShellCore.S_MAPTT.equals(sheetName) || txt.length() == 0) return;
                    map.onTt(txt);
                    present(sheetView, txt, true);
                } });
            }
        }, "shell-maptt").start();
    }
    /** 시간표 응답이 없으면 묻는다: 처음이면 이 역의 모든 노선을 한 번에, 요일을 골랐으면 그 노선·요일만. */
    private void ttFetch() {
        final int sq = map.ttSeq;
        final String body = map.ttAskBody(System.currentTimeMillis());
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(MapCore.ttUrl(), body, 12000);
                final boolean got = r.status == 200 && map.addTt(r.body, sq);
                main.post(new Runnable() { @Override public void run() {
                    if (sq != map.ttSeq) return;
                    if (!got) map.ttState = "fail";
                    ttRender();
                } });
            }
        }, "shell-ttfetch").start();
    }

    private void closeSheet() { try { if (sheet != null) sheet.dismiss(); } catch (Throwable ignored) { } sheet = null; sheetView = null; sheetName = ""; }

    private final class SheetHost implements ScreenView.Listener {
        @Override public void onAction(ScreenCore.Act a) {
            if (ShellCore.S_MAPSTN.equals(sheetName) || ShellCore.S_MAPTT.equals(sheetName)) { if ("call".equals(a.a)) mapSheetAct(a.v); return; }
            if (!"call".equals(a.a)) return;
            if ("wr.close".equals(a.v) || "fm.close".equals(a.v)) { closeSheet(); return; }
            if ("wr.submit".equals(a.v)) { submitWrite(); return; }
            String[] ln = food.sheetLink(a.v);
            if (ln != null) openExternal(ln[0], ln[1]);
        }
        @Override public void onSet(ScreenCore.Act a, boolean on) { }
        @Override public void onSearch(ScreenCore.Act a, String q) { }
        @Override public void onInputFocus(boolean on) { }
        @Override public void onFirstDraw() { }
        @Override public void onText(String key, String value, String kind) { }
        @Override public void onContentH(float dp) { }
    }
    private void submitWrite() {
        if (writeBusy || sheetView == null) return;
        Map<String, String> f = sheetView.fields();
        final String t = f.get("wt") == null ? "" : f.get("wt").trim(), b = f.get("wb") == null ? "" : f.get("wb").trim();
        writeT = t; writeB = b;
        if (t.length() == 0) { writeErr = "제목을 입력해주세요"; loadWrite(true); return; }
        if (b.length() == 0) { writeErr = "내용을 입력해주세요"; loadWrite(true); return; }
        final String nick = ShellCore.commId(store);
        writeBusy = true; writeErr = ""; loadWrite(true);
        final String json = BoardCore.postBody(nick, t, b, "잡담", owner());
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BOARD_BASE + "/post", json, 9000);
                final String id = r.status == 200 ? ShellCore.jsonId(r.body) : "";
                final boolean rejected = r.status >= 400 && r.status < 500;
                final String why = rejected ? ShellCore.jsonError(r.body) : "";
                main.post(new Runnable() { @Override public void run() {
                    writeBusy = false;
                    if (rejected) { writeErr = why.length() > 0 ? why : "등록할 수 없어요"; loadWrite(true); return; }
                    long now = System.currentTimeMillis();
                    boolean ok = id.length() > 0;
                    board.addMine(ok ? id : "L" + now, "잡담", t, b, nick, now, !ok);
                    toast(ok ? "글이 등록되었어요" : "글을 저장했어요. 연결되면 모두에게 보여요");
                    closeSheet();
                    reloadBoard();
                } });
            }
        }, "shell-post").start();
    }

    // ───────────── 홈 탭 ─────────────
    private HomeCore.Env homeEnv() {
        HomeCore.Env e = new HomeCore.Env();
        Calendar c = Calendar.getInstance();
        e.nowMs = System.currentTimeMillis();
        e.tzoMin = -(c.getTimeZone().getOffset(e.nowMs) / 60000);
        e.y = c.get(Calendar.YEAR); e.m = c.get(Calendar.MONTH); e.d = c.get(Calendar.DAY_OF_MONTH);
        int w = c.get(Calendar.DAY_OF_WEEK);
        e.hol = w == Calendar.SATURDAY || w == Calendar.SUNDAY;
        return e;
    }

    /** 홈 화면: 입력 상태를 엔진에 보내고, 경로 결과가 있으면 결과 화면도 받아 이어 붙여 올린다. */
    private void loadHome(final ScreenView v, final boolean keep) {
        final int my = ++seqHome;
        final String json = home.request(homeEnv(), ShellCore.CAP);
        final boolean hasRes = home.hasRoute();
        final String resBody = hasRes ? home.resultRequest(homeEnv(), ShellCore.CAP, ShellCore.theme(store), 0) : "";
        final String resKey = home.resRev + ":" + home.resTab;
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r = NetPost.post(ShellCore.BASE + "/screen/home", json, 8000);
                String txt = r.status == 200 ? r.body : "";
                if (hasRes && txt.length() > 0) {
                    String rs;
                    if (resKey.equals(resCacheKey)) rs = resCacheJson;
                    else {
                        NetPost.Res rr = NetPost.post(ShellCore.BASE + "/screen/result", resBody, 15000);
                        rs = rr.status == 200 ? rr.body : "";
                        if (rs.length() > 0) { resCacheKey = resKey; resCacheJson = rs; }
                    }
                    if (rs.length() > 0) { final String rsf = rs; txt = ShellCore.mergeBodies(txt, rs); main.post(new Runnable() { @Override public void run() { home.onResult(rsf); chat.routeSec = home.resSec; } }); }
                    else main.post(new Runnable() { @Override public void run() { toast("경로 결과를 그리지 못했어요"); } });
                }
                final String fin = txt;
                main.post(new Runnable() { @Override public void run() {
                    if (my != seqHome) return;
                    present(v, fin, keep);
                    if (fin.length() > 0) home.onScreen(fin);
                } });
            }
        }, "shell-home").start();
    }
    private void reloadHome() { if (ShellCore.S_HOME.equals(slots.length > 0 ? slots[slots.length - 1] : "")) loadHome(body, true); }

    private void homeText(final String key, String value, String kind) {
        final int f = "dest".equals(key) ? HomeCore.DEST : HomeCore.START;
        if ("blur".equals(kind)) {                       // 후보 줄을 누르는 동안 잠깐 기다렸다 닫는다
            main.postDelayed(new Runnable() { @Override public void run() { home.endActive(f); reloadHome(); } }, 250);
            return;
        }
        if (!home.onText(key, value, kind)) return;
        fetchCands();
        reloadHome();
    }

    /** 눌려 있는 칸의 글자에 대한 버스정류장·장소 후보를 받아 온다(글이 같으면 다시 받지 않는다). */
    private void fetchCands() {
        final String q = home.wantQuery();
        if (q.length() == 0) return;
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res rb = NetPost.get(HomeSearchCore.busUrl(HomeSearchCore.DEFAULT_BASE, q), 6000);
                final List<Map<String, Object>> bus = rb.status == 200 ? HomeSearchCore.parseBus(rb.body) : new java.util.ArrayList<Map<String, Object>>();
                NetPost.Res rp = NetPost.get(HomeSearchCore.placeUrl(HomeSearchCore.DEFAULT_BASE, q), 6000);
                final List<Map<String, Object>> pl = rp.status == 200 ? HomeSearchCore.parsePlaces(rp.body) : new java.util.ArrayList<Map<String, Object>>();
                main.post(new Runnable() { @Override public void run() {
                    boolean a = home.setCands(q, true, bus), b = home.setCands(q, false, pl);
                    if (a || b) reloadHome();
                } });
            }
        }, "shell-cand").start();
    }

    private void homeAct(String v, Map<String, String> fields) {
        int r = home.act(v, fields);
        switch (r) {
            case HomeCore.R_RESULT: reloadHome(); break;
            case HomeCore.R_FAV: toast("즐겨찾기는 준비 중이에요"); break;
            case HomeCore.R_RENDER: case HomeCore.R_FIELDS:
                if (r == HomeCore.R_FIELDS) setHomeFields();
                reloadHome(); break;
            case HomeCore.R_GPS: startGps(); break;
            case HomeCore.R_PICK_TIME: pickBase(); break;
            case HomeCore.R_GO: goRoute(); break;
            case HomeCore.R_NEED_BOTH: toast("출발지와 도착지를 입력해 주세요"); break;
            default: break;
        }
    }

    /** 고른 장소·바꾸기 뒤 입력칸 글자를 화면에 다시 쓴다. */
    private void setHomeFields() {
        body.setField(HomeCore.KEYS[HomeCore.START], home.text[HomeCore.START]);
        body.setField(HomeCore.KEYS[HomeCore.DEST], home.text[HomeCore.DEST]);
    }

    // 위치 감지: 권한 → 마지막 위치 → 한 번 갱신
    private static final int REQ_LOC = 71;
    private void startGps() {
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOC);
            return;
        }
        home.gps = true; reloadHome();
        final LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        try {
            Location best = null;
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
            if (best != null && System.currentTimeMillis() - best.getTime() < 120000) { gotGps(best); return; }
            String prov = lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
            final Location fallback = best;
            final LocationListener ll = new LocationListener() {
                @Override public void onLocationChanged(Location l) { try { lm.removeUpdates(this); } catch (Throwable ignored) { } gotGps(l); }
                @Override public void onProviderEnabled(String p) { }
                @Override public void onProviderDisabled(String p) { }
                @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle b) { }
            };
            lm.requestSingleUpdate(prov, ll, Looper.getMainLooper());
            main.postDelayed(new Runnable() { @Override public void run() {
                if (!home.gps) return;
                try { lm.removeUpdates(ll); } catch (Throwable ignored) { }
                if (fallback != null) gotGps(fallback); else { home.gps = false; toast("현재 위치를 찾지 못했어요"); reloadHome(); }
            } }, 12000);
        } catch (Throwable t) { home.gps = false; toast("위치를 쓸 수 없어요"); reloadHome(); }
    }
    private void gotGps(Location l) {
        if (!home.gps) return;
        home.setGpsStart(l.getLatitude(), l.getLongitude());
        setHomeFields(); reloadHome();
    }
    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_FOOD_LOC || code == REQ_MAP_LOC) {
            boolean g = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            LocCb cb = pendingLoc; pendingLoc = null;
            if (cb == null) return;
            if (g) locateOnce(code, cb); else cb.fail(true);
            return;
        }
        if (code != REQ_LOC) return;
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (ok) startGps(); else toast("위치 권한이 필요해요");
    }

    // 기준시각: 날짜 → 시각 고르기(네이티브 대화상자)
    private void pickBase() {
        final Calendar c = Calendar.getInstance();
        if (home.baseMs >= 0) c.setTimeInMillis(home.baseMs);
        new android.app.DatePickerDialog(this, new android.app.DatePickerDialog.OnDateSetListener() {
            @Override public void onDateSet(android.widget.DatePicker dp, final int y, final int m, final int d) {
                new android.app.TimePickerDialog(ShellActivity.this, new android.app.TimePickerDialog.OnTimeSetListener() {
                    @Override public void onTimeSet(android.widget.TimePicker tp, int h, int mi) {
                        Calendar x = Calendar.getInstance();
                        x.set(y, m, d, h, mi, 0); x.set(Calendar.MILLISECOND, 0);
                        home.baseMs = x.getTimeInMillis();
                        reloadHome();
                    }
                }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), false).show();
            }
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show();
    }

    /** 경로 탐색: 좌표가 있는 두 장소로 경로 서버에 묻는다. 빠른 응답(live=0)을 먼저 그리고, 엔진의 follow 지시대로 전체를 뒤따라 받는다. */
    private void goRoute() {
        final boolean picked = home.baseMs >= 0;
        final long base = picked ? home.baseMs : System.currentTimeMillis();
        final String qs = HomeCore.routeQuery(home.loc[HomeCore.START], home.loc[HomeCore.DEST], base, picked);
        if (qs == null) { toast("출발지와 도착지를 목록에서 골라 주세요"); return; }
        final String url = HomeCore.routeUrl(qs), a = home.text[HomeCore.START], b = home.text[HomeCore.DEST];
        final long bt = picked ? base : -1, rb = System.currentTimeMillis();
        final int my = ++seqRoute;
        toast("경로를 찾는 중이에요");
        new Thread(new Runnable() {
            @Override public void run() {
                NetPost.Res r1 = NetPost.get(RouteFetchCore.liveZero(url), 15000);
                String b1 = (r1.status == 200 && r1.body != null) ? r1.body : "";
                Map<String, Object> fo = RouteFetchCore.extractFollow(b1);
                boolean draw = b1.length() > 2 && RouteFetchCore.draws(fo);
                if (draw) postRoute(my, b1, a, b, bt, rb);
                if (!draw || RouteFetchCore.wantsFull(fo)) {
                    NetPost.Res r2 = NetPost.get(url, 30000);
                    String b2 = (r2.status == 200 && r2.body != null) ? r2.body : "";
                    if (b2.length() > 2) postRoute(my, b2, a, b, bt, rb);
                    else if (!draw) postFail(my);
                }
            }
        }, "shell-route").start();
    }
    private int seqRoute = 0;
    private void postRoute(final int my, final String raw, final String a, final String b, final long bt, final long rb) {
        main.post(new Runnable() { @Override public void run() {
            if (my != seqRoute) return;
            if (home.setRoute(raw, a, b, bt, rb)) reloadHome(); else toast("경로 응답을 읽지 못했어요");
        } });
    }
    private void postFail(final int my) {
        main.post(new Runnable() { @Override public void run() { if (my == seqRoute) toast("경로를 받지 못했어요"); } });
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
