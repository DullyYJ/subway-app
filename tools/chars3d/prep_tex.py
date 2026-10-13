# 원본 2D 스프라이트(www/chars 옛 파일)에서 3D 모델에 입힐 부위 그림을 잘라 tex.js 로 만든다.
import base64, io, json, sys
import numpy as np
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'src2d'
# id: {부위: (x0,y0,x1,y1)}  — 스프라이트 픽셀 좌표(위 격자 그림으로 잰 값)
R = {
 'dolsom': {'head': (0,3,158,128)},
 'lovel':  {'head': (8,24,111,113)},
 'ppopu':  {'head': (0,3,147,100)},
 'chaeng': {'head': (0,3,108,100)},
 'sul':    {'head': (15,2,112,102), 'chest': (0,98,126,198)},
 'dudung': {'head': (8,36,112,112), 'snout': (33,58,62,102), 'belly': (5,100,115,196)},
}
def bleed(a, it=14):
    rgb = a[..., :3].astype(np.float32); al = a[..., 3]
    known = al > 200
    for _ in range(it):
        if known.all(): break
        acc = np.zeros_like(rgb); cnt = np.zeros(known.shape, np.float32)
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                if dx == 0 and dy == 0: continue
                k = np.roll(np.roll(known, dy, 0), dx, 1); v = np.roll(np.roll(rgb, dy, 0), dx, 1)
                acc += v * k[..., None]; cnt += k
        new = (~known) & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]; known = known | new
    out = a.copy(); out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8); return out
T = {}
for id_, parts in R.items():
    im = Image.open(f'{SRC}/{id_}.webp').convert('RGBA')
    for name, (x0,y0,x1,y1) in parts.items():
        c = im.crop((x0,y0,x1,y1)); a = bleed(np.array(c))
        c = Image.fromarray(a, 'RGBA'); c = c.resize((c.width*2, c.height*2), Image.LANCZOS)
        b = io.BytesIO(); c.save(b, 'PNG'); T[f'{id_}_{name}'] = 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
        c.save(f'/tmp/claude-0/tex_{id_}_{name}.png')
open('tex.js','w').write('window.TEX=' + json.dumps(T) + ';')
print({k: len(v)//1024 for k, v in T.items()})
# 기본 색(스프라이트 평균) 참고용
for id_ in R:
    im = np.array(Image.open(f'{SRC}/{id_}.webp').convert('RGBA')).astype(float); m = im[...,3] > 250
    print(id_, [int(x) for x in im[m][:, :3].mean(0)])
