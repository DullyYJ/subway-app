# 나머지 여섯 친구 전용 동작 시트(`<id>_act.webp`, 4×4 칸 · s303)

돌솜·뽀푸·러블·두덩·술·챙챙의 16칸 3D 자세 시트를 만든다(쮸르·베비히포는 `../friends/`).

준비(저장소에 넣지 않는 것): `three.min.js`(r1xx, 이 폴더에 복사) · `tex_all.js`(`../prep_tex.py` → `../faces.py` 로 만든 얼굴 텍스처 묶음) · `models.js`(= `../models.js`, 이 폴더에 복사).
Python Playwright(Chromium·swiftshader) 필요.

```
python3 act5.py <id> <specs.json> <contact.png> [<id>_act.webp]
  예) python3 act5.py dolsom dog_acts.json c.png dolsom_act.webp   # 뽀푸도 같은 dog_acts.json
      python3 act5.py lovel lovel_acts.json … / dudung dudung_acts.json … / sul sul_acts.json … / chaeng chaeng_acts.json …
```
- `meta_fit.json`: 기존 걷기 시트에 맞춘 카메라(`fitview.py` 가 기존 에셋의 bbox 에 맞춰 구함, IoU ≈0.98) → 칸 정렬(ox/base)이 앱 D3 사양과 같다.
- 스펙 항목: `quad`(네발: y·rz·f·h·hd·ear·tail·face) / `pose`(=models.js poseX) / `ph`(걷기 위상) · `set`(userData 경로로 관절 직접) · `face` · `m`(루트 이동·회전) · `float`(바닥 맞춤 안 함).
- 바닥 맞춤: 떠 있지 않은 칸은 가장 낮은 불투명 줄을 `BASE`(D3 base)에 맞춘다.
- 칸 번호의 뜻과 구간 연결은 `native/shell/SceneActs.java` 의 `CELLS` 표.
