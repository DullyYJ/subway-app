#!/usr/bin/env python3
"""cap add android 가 만든 Gradle 파일에 Kotlin + Jetpack Compose 를 끼운다 (2026-10-16, 네이티브 장면용).

  python3 native/inject_kotlin_compose.py android

하는 일(여러 번 돌려도 같은 결과 — 이미 들어 있으면 건너뛴다)
  1) android/build.gradle         : buildscript classpath 에 kotlin-gradle-plugin
  2) android/app/build.gradle     : kotlin-android 플러그인, buildFeatures.compose, composeOptions, kotlinOptions.jvmTarget(자바 목표와 같게),
                                    Compose 의존성(BOM)
  3) android/gradle.properties    : kotlin.jvm.target.validation.mode=warning (자바·코틀린 목표가 어긋나도 빌드를 막지 않는 안전망)

버전 짝(Kotlin 1.9.22 ↔ Compose 컴파일러 1.5.8 은 공식 호환표대로, BOM 2024.02.00 = Compose 1.6.x, compileSdk 34 필요 — Capacitor 6 은 34).
못 찾는 자리가 있으면 조용히 넘어가지 않고 바로 실패한다(Capacitor 템플릿이 바뀐 것일 수 있다 — 메시지에 어느 자리인지 나온다).
"""
import os
import re
import sys

KOTLIN = "1.9.22"
COMPOSE_COMPILER = "1.5.8"
COMPOSE_BOM = "2024.02.00"


def die(msg):
    sys.stderr.write("ERROR: " + msg + "\n")
    sys.exit(1)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def java_target(root):
    """capacitor.build.gradle / app build.gradle 의 JavaVersion.VERSION_xx 에서 자바 목표를 읽는다. 못 찾으면 None."""
    for rel in ("app/capacitor.build.gradle", "app/build.gradle"):
        p = os.path.join(root, rel)
        if not os.path.exists(p):
            continue
        m = re.search(r"targetCompatibility\s+JavaVersion\.VERSION_(\d+(?:_\d+)?)", read(p))
        if m:
            v = m.group(1)
            return "1.8" if v == "1_8" else v.replace("_", ".")
    return None


def edit_root(root):
    path = os.path.join(root, "build.gradle")
    if not os.path.exists(path):
        die(path + " 가 없다")
    c = read(path)
    if "kotlin-gradle-plugin" in c:
        print("root build.gradle: 이미 kotlin-gradle-plugin 이 있다 — 건너뜀")
        return
    m = re.search(r"^([ \t]*)classpath\s+['\"]com\.android\.tools\.build:gradle:[^'\"]+['\"][^\n]*$", c, re.M)
    if not m:
        die("root build.gradle 에서 'classpath com.android.tools.build:gradle' 줄을 못 찾았다 — Capacitor 템플릿이 바뀌었을 수 있다")
    ins = m.group(0) + "\n" + m.group(1) + "classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:" + KOTLIN + "'"
    write(path, c[:m.start()] + ins + c[m.end():])
    print("root build.gradle: kotlin-gradle-plugin " + KOTLIN + " 추가")


def edit_app(root):
    path = os.path.join(root, "app", "build.gradle")
    if not os.path.exists(path):
        die(path + " 가 없다")
    c = read(path)
    if "kotlin-android" in c or "org.jetbrains.kotlin.android" in c:
        print("app/build.gradle: 이미 Kotlin 이 있다 — 건너뜀")
        return
    m = re.search(r"^apply plugin:\s*['\"]com\.android\.application['\"][^\n]*$", c, re.M)
    if not m:
        die("app/build.gradle 에서 \"apply plugin: 'com.android.application'\" 줄을 못 찾았다")
    c = c[:m.end()] + "\napply plugin: 'kotlin-android'" + c[m.end():]

    jt = java_target(root)
    block = ["    // ── 네이티브 장면(Kotlin + Jetpack Compose Canvas) ──",
             "    buildFeatures {", "        compose true", "    }",
             "    composeOptions {", "        kotlinCompilerExtensionVersion = '" + COMPOSE_COMPILER + "'", "    }"]
    if jt:
        block += ["    kotlinOptions {", "        jvmTarget = '" + jt + "'", "    }"]
    a = re.search(r"^android\s*\{[ \t]*$", c, re.M)
    if not a:
        die("app/build.gradle 에서 'android {' 줄을 못 찾았다")
    c = c[:a.end()] + "\n" + "\n".join(block) + c[a.end():]

    c = c.rstrip("\n") + "\n\n" + "\n".join([
        "dependencies {",
        "    // 네이티브 장면: Compose Canvas + 프레임 시계(withFrameNanos). 쓰는 것만 넣는다(material 등 없음).",
        "    implementation platform('androidx.compose:compose-bom:" + COMPOSE_BOM + "')",
        "    implementation 'androidx.compose.ui:ui'",
        "    implementation 'androidx.compose.foundation:foundation'",
        "    implementation 'androidx.compose.runtime:runtime'",
        "}",
    ]) + "\n"
    write(path, c)
    print("app/build.gradle: kotlin-android + Compose(BOM " + COMPOSE_BOM + ", 컴파일러 " + COMPOSE_COMPILER + ")" + (", jvmTarget " + jt if jt else ", jvmTarget 미지정(자바 목표를 못 읽음)") + " 추가")


def edit_props(root):
    path = os.path.join(root, "gradle.properties")
    c = read(path) if os.path.exists(path) else ""
    if "kotlin.jvm.target.validation.mode" in c:
        return
    write(path, c.rstrip("\n") + "\n\n# 네이티브 장면: 자바·코틀린 목표 버전이 어긋나도 빌드를 막지 않고 경고만(안전망)\nkotlin.jvm.target.validation.mode=warning\n")
    print("gradle.properties: kotlin.jvm.target.validation.mode=warning 추가")


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "android"
    if not os.path.isdir(root):
        die(root + " 폴더가 없다")
    edit_root(root)
    edit_app(root)
    edit_props(root)


if __name__ == "__main__":
    main()
