package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.view.MotionEvent;
import android.widget.FrameLayout;

/**
 * 네이티브 장면을 담는 투명한 틀. WebView 위에 얹히지만 손가락은 가져가지 않는다(false 를 돌려준다) —
 * 손가락을 장면과 웹뷰 중 누구에게 줄지는 MainActivity.dispatchTouchEvent → SceneNativePlugin.route 가 정한다.
 * (이 틀이 손가락을 먹어 버리면 장면 위에서 시작한 스크롤이 먹통이 된다.)
 */
public final class SceneHost extends FrameLayout {
    public SceneHost(Context c) {
        super(c);
        setClickable(false); setFocusable(false); setWillNotDraw(true);
    }
    @Override public boolean dispatchTouchEvent(MotionEvent e) { return false; }
    @Override public boolean onTouchEvent(MotionEvent e) { return false; }
    @Override public boolean onInterceptTouchEvent(MotionEvent e) { return false; }
}
