# 얼굴 표정 변형: 원본 얼굴 그림의 눈을 감은/웃는/찡그린/꽉 감은 눈, 벌린 입으로 바꾼 그림을 만든다(tex.js 에 <id>_head_<변형> 으로 더한다).
import base64, io, json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC='src2d'
R={'dolsom':(0,3,158,128),'lovel':(8,24,111,113),'ppopu':(0,3,147,100),'chaeng':(0,3,108,100),'sul':(15,2,112,102),'dudung':(8,36,112,112)}
# 4배 확대 좌표계(크롭 x4)에서 잰 눈 중심·반지름, 입 위치. (아래 detect 가 못 맞추면 손으로 쓴 값을 쓴다)
EYES={
 'dolsom':[(220,283,30),(398,283,30)],
 'ppopu':[(198,232,38),(366,218,38)],
 'lovel':[(88,195,50),(300,200,50)],
 'chaeng':[(100,172,72),(330,175,72)],
 'sul':[(88,170,36),(322,172,36)],
 'dudung':[(94,70,22),(292,72,22)],
}
MOUTH={'dolsom':(300,395,44,30),'ppopu':(296,338,40,28),'lovel':(198,322,24,16),'chaeng':(210,258,32,22)}   # 입 중심 x,y, 반폭, 반높이
def fur(im, cx, cy, r):
    a=np.array(im.convert('RGB')).astype(float); H,W=a.shape[:2]
    ys,xs=np.mgrid[0:H,0:W]; d=np.hypot(xs-cx,ys-cy); ring=(d>r*1.15)&(d<r*1.9)
    return tuple(int(v) for v in np.median(a[ring],axis=0))
def paint(id_, v):
    mouth = v.endswith('open') and v!='open'
    if mouth: v = v[:-4]
    x0,y0,x1,y1=R[id_]; im=Image.open(f'{SRC}/{id_}.webp').convert('RGBA').crop((x0,y0,x1,y1)); im=im.resize((im.width*4,im.height*4),Image.LANCZOS)
    rgb=im.convert('RGB'); al=im.split()[3]
    if v!='open':
        for (cx,cy,r) in EYES[id_]:
            col=fur(rgb,cx,cy,r)
            m=Image.new('L',im.size,0); ImageDraw.Draw(m).ellipse((cx-r*1.35,cy-r*1.2,cx+r*1.35,cy+r*1.2),fill=255); m=m.filter(ImageFilter.GaussianBlur(r*.18))
            rgb=Image.composite(Image.new('RGB',im.size,col),rgb,m); al.paste(255,mask=m.point(lambda v:255 if v>8 else 0))   # 원본 눈 반짝임은 투명 구멍이라 알파도 메운다
    dr=ImageDraw.Draw(rgb); lw=max(5,int(EYES[id_][0][2]*.28)); dark=(40,30,28) if id_!='chaeng' else (18,26,70)
    def arc(cx,cy,r,start,end): dr.arc((cx-r,cy-r*.8,cx+r,cy+r*.8),start,end,fill=dark,width=lw)
    for k,(cx,cy,r) in enumerate(EYES[id_]):
        s=-1 if k==0 else 1
        if v=='closed': dr.arc((cx-r*.9,cy-r*.9,cx+r*.9,cy+r*.5),15,165,fill=dark,width=lw)          # ‿ (졸린 눈)
        elif v=='happy': dr.arc((cx-r*.9,cy-r*.2,cx+r*.9,cy+r*1.2),200,340,fill=dark,width=lw)       # ^ (웃는 눈)
        elif v=='squint': dr.line((cx-r*.9,cy+r*.1,cx+r*.9,cy-r*.05*s),fill=dark,width=lw)
        elif v=='tight':                                                                          # > <
            dx=r*.8; dr.line((cx-dx*s*-1 if False else cx+s*dx*-1,cy-r*.7,cx+s*dx,cy),fill=dark,width=lw); dr.line((cx+s*dx,cy,cx+s*dx*-1,cy+r*.7),fill=dark,width=lw)
    if (v in ('open','pant') or mouth) and id_ in MOUTH:
        mx,my,rx,ry=MOUTH[id_]; dr.ellipse((mx-rx,my-ry,mx+rx,my+ry),fill=(96,28,40)); dr.ellipse((mx-rx*.62,my+ry*.05,mx+rx*.62,my+ry*1.25),fill=(238,120,140))
    out=rgb.convert('RGBA'); out.putalpha(al); return out
def bleed(a, it=14):
    rgb=a[...,:3].astype(np.float32); al=a[...,3]; known=al>200
    for _ in range(it):
        if known.all(): break
        acc=np.zeros_like(rgb); cnt=np.zeros(known.shape,np.float32)
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                if dx==0 and dy==0: continue
                k=np.roll(np.roll(known,dy,0),dx,1); vv=np.roll(np.roll(rgb,dy,0),dx,1); acc+=vv*k[...,None]; cnt+=k
        new=(~known)&(cnt>0); rgb[new]=acc[new]/cnt[new][:,None]; known=known|new
    out=a.copy(); out[...,:3]=np.clip(rgb,0,255).astype(np.uint8); return out
if __name__=='__main__':
    ids=sys.argv[1].split(',') ; vs=sys.argv[2].split(',')
    prev=len(sys.argv)>3
    T={}
    for i in ids:
        for v in vs:
            im=paint(i,v)
            if prev: im.convert('RGBA').save(f'ft/{i}_{v}.png'); continue
            c=Image.fromarray(bleed(np.array(im)),'RGBA'); c=c.resize((c.width//2,c.height//2),Image.LANCZOS)   # 원래 tex.js 와 같은 2배 크기
            b=io.BytesIO(); c.save(b,'PNG'); T[f'{i}_head_{v}']='data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
    if not prev: json.dump(T,open('faces.json','w'))
