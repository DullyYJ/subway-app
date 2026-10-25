import glob,os,sys,json
from PIL import Image, ImageDraw
CELL=256
BASE={'dolsom':248.5,'lovel':250,'ppopu':248.5,'chaeng':244.5,'sul':230.5,'dudung':222.5}
os.makedirs('out',exist_ok=True); rep={}
def down(im): return im.convert('RGBA').convert('RGBa').resize((CELL,CELL),Image.LANCZOS).convert('RGBA')
for id in BASE:
    fs=sorted(glob.glob(f'fr/{id}/pose_*.png'))
    if not fs: continue
    sh=Image.new('RGBA',(CELL*4,CELL*2),(0,0,0,0)); edge=[]
    for i,f in enumerate(fs):
        c=down(Image.open(f)); sh.paste(c,((i%4)*CELL,(i//4)*CELL))
        a=c.split()[3]; bb=a.point(lambda v:255 if v>24 else 0).getbbox(); edge.append(bb)
    sh.save(f'out/{id}_pose.webp','WEBP',quality=84,method=6,alpha_quality=90)
    rep[id]=(os.path.getsize(f'out/{id}_pose.webp')//1024,edge)
    # 점검용: 칸마다 바닥줄(앱이 발을 놓는 줄)을 그린다
    chk=Image.new('RGBA',sh.size,(236,236,236,255)); chk.alpha_composite(sh); d=ImageDraw.Draw(chk)
    for i in range(len(fs)): x=(i%4)*CELL; y=(i//4)*CELL; d.line((x,y+BASE[id],x+CELL,y+BASE[id]),fill=(255,0,0,255),width=1)
    chk.convert('RGB').save(f'out/chk_{id}.png')
for k,v in rep.items(): print(k,v[0],'KB',v[1])
