#!/usr/bin/env python3
"""안드로이드와 똑같은 글꼴(Noto Sans KR 400/700)을 iOS 앱에 넣는다.

안드로이드 CI(.github/workflows/build-shell.yml '글꼴 넣기')와 같은 방법: 구글 폰트의 가변 글꼴에서 굵기 400 · 700 을 뽑고,
화면에 쓰는 글자(한글 · 영문 · 기호)만 남겨 줄인다. 결과는 ios/Gildongmu/Resources/Fonts/ 에 쓴다(저장소에는 올리지 않는다).

  pip install fonttools   # 한 번만
  python3 ios/scripts/make_fonts.py
"""
import os, sys, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "Gildongmu", "Resources", "Fonts"))
TMP = os.path.join(os.environ.get("TMPDIR", "/tmp"), "gildongmu-fonts")
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)

src = os.path.join(TMP, "v.ttf")
if not os.path.exists(src):
    req = urllib.request.Request(URL, headers={"User-Agent": "gildongmu-ios-build"})
    with urllib.request.urlopen(req, timeout=300) as r, open(src, "wb") as f:
        f.write(r.read())

uni = (list(range(0x20, 0x7f)) + list(range(0xa0, 0x100)) + list(range(0x2000, 0x2070)) + [0x20a9, 0x20ac] + list(range(0x2190, 0x2200))
       + list(range(0x2460, 0x2500)) + list(range(0x25a0, 0x2600)) + list(range(0x3000, 0x3040)) + list(range(0x3130, 0x3190))
       + list(range(0xac00, 0xd7a4)) + list(range(0xff00, 0xfff0)))

for name, w in (("Regular", 400), ("Bold", 700)):
    f = instancer.instantiateVariableFont(TTFont(src), {"wght": w}, inplace=False)
    tmp = os.path.join(TMP, "i.ttf")
    f.save(tmp)
    o = subset.Options(); o.layout_features = ["*"]; o.notdef_outline = True; o.hinting = False; o.name_IDs = [1, 2, 3, 4, 6]
    ss = subset.Subsetter(o); ss.populate(unicodes=uni)
    g = TTFont(tmp); ss.subset(g)
    ps = "NotoSansKR-" + name                       # 앱 코드(Typo.swift)가 이 이름으로 부른다
    for rec in g["name"].names:
        if rec.nameID == 6: rec.string = ps
        if rec.nameID == 4: rec.string = "Noto Sans KR " + name
    out = os.path.join(OUT, ps + ".ttf")
    g.save(out)
    c = g.getBestCmap()
    assert 0xac00 in c and ord("›") in c and "fvar" not in g, "글꼴 만들기 실패: " + name
    print(name, os.path.getsize(out), "bytes", len(c), "glyph-codes ->", out)
