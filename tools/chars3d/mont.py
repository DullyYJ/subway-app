import sys,glob
from PIL import Image
ids=sys.argv[1].split(','); fr=[int(x) for x in (sys.argv[2] if len(sys.argv)>2 else '0,4,8,12').split(',')]
S=int(sys.argv[3]) if len(sys.argv)>3 else 256
W=S*len(fr);H=S*len(ids);m=Image.new('RGBA',(W,H),(236,236,236,255))
for r,i in enumerate(ids):
    for c,f in enumerate(fr):
        im=Image.open(f'pv/{i}_{f}.png').convert('RGBA').resize((S,S),Image.LANCZOS); m.alpha_composite(im,(c*S,r*S))
m.convert('RGB').save('pv/mont.png');print(m.size)
