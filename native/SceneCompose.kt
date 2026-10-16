package com.dullyyj.subway   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.ComposeView

/**
 * 장면을 Jetpack Compose Canvas 로 화면에 올리는 얇은 막(2026-10-16, YJ: "Kotlin / Jetpack Compose Canvas 로 완전 전환").
 *
 * 여기에는 '계산'도 '그림 규칙'도 없다. 하는 일은 딱 둘:
 *   1) 프레임 시계 — withFrameNanos 가 화면 주사율(60·90·120Hz)에 맞춰 부르면 SceneDriver.frame(now) 에 시각을 넘긴다.
 *      (장면이 새 프레임을 원할 때만 상태를 바꿔 다시 그린다. 쉬는 프레임은 그리지 않아 배터리를 아낀다.)
 *   2) 그리기 — Compose Canvas 의 nativeCanvas(하드웨어 가속 기록용 Canvas)를 SceneDriver.draw 에 넘긴다.
 * 움직임·그림은 SceneCore(순수 자바)가 하고, 엔진이 정한 장면만 그린다 — "계산은 엔진이, 그림은 앱이".
 */
object SceneCompose {
    /** 비어 있는 ComposeView 를 만든다(화면에 붙인 뒤 show 로 내용을 채운다). */
    @JvmStatic
    fun create(context: Context): ComposeView = ComposeView(context)

    /** 프레임 시계와 그림을 켠다. */
    @JvmStatic
    fun show(view: ComposeView, driver: SceneDriver) {
        view.setContent { SceneCanvas(driver) }
    }

    /** 끈다 — 프레임 시계가 멈춘다(숨어 있는 동안 배터리를 쓰지 않는다). */
    @JvmStatic
    fun hide(view: ComposeView) {
        view.disposeComposition()
    }
}

@Composable
fun SceneCanvas(driver: SceneDriver) {
    var tick by remember { mutableLongStateOf(0L) }
    LaunchedEffect(driver) {
        while (true) {
            androidx.compose.runtime.withFrameNanos { now ->
                if (driver.frame(now)) tick = now
            }
        }
    }
    Canvas(modifier = Modifier.fillMaxSize()) {
        // tick 을 읽어 두면 값이 바뀔 때마다(= 장면이 새 프레임을 원할 때마다) 이 블록이 다시 불린다.
        if (tick >= 0L) {
            drawIntoCanvas { canvas -> driver.draw(canvas.nativeCanvas) }
        }
    }
}
