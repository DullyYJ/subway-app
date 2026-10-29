# 걷기/포즈 시트 내보내기: python3 export2.py <group> ; group = panda | hippo
import asyncio, base64, io, json, math, os, sys
from playwright.async_api import async_playwright
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__)); N=16; CELL=256; EL=0.2
GROUPS={
 'panda':[('juksun','panda',{'bb':'L'})],
 'hippo':[('bbosong_%d'%i,'hippo',{'shoe':i}) for i in range(4)],
}
group=sys.argv[1]; T=GROUPS[group]
def bbox(png):
    im=Image.open(io.BytesIO(base64.b64decode(png.split(',')[1]))).convert('RGBA'); return im, im.split()[3].point(lambda v:255 if v>24 else 0).getbbox()
async def main():
    os.makedirs('out2',exist_ok=True); meta={}
    async with async_playwright() as pw:
        b=await pw.chromium.launch(args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        p=await b.new_page(viewport={'width':512,'height':512}); p.on('pageerror',lambda e:print('pageerror',e))
        await p.goto('file://'+D+'/render2.html'); await p.wait_for_function('window.ready',timeout=60000)
        async def frames(mode):
            out=[]
            if mode=='walk':
                for i in range(N): out.append(await p.evaluate("ph=>window.frameWalk(ph)",i/N))
            else:
                for n in ['sit','sleep','happy','shiver','pant','squint','x1','x2']: out.append(await p.evaluate("n=>window.framePose(n)",n))
            return out
        # ① 같은 그룹(신발 4종)의 모든 걷기·포즈 프레임으로 한 카메라 범위를 잰다
        V0=[10.0,2.6,0.0]; bx=[999,-1,999,-1]
        for (name,id,opt) in T:
            await p.evaluate("v=>{window.OV=v}",V0); await p.evaluate("a=>window.setup(a[0],a[1])",[id,opt])
            for mode in ('walk','pose'):
                for d in await frames(mode):
                    im,bb=bbox(d); bx=[min(bx[0],bb[0]),max(bx[1],bb[2]-1),min(bx[2],bb[1]),max(bx[3],bb[3]-1)]
        k=V0[0]/512; wU=(bx[1]-bx[0]+1)*k; hU=(bx[3]-bx[2]+1)*k; midX=(bx[0]+bx[1])/2; midY=(bx[2]+bx[3])/2
        size=max(wU,hU)*1.06; cx=V0[2]+(midX-256)*k; cy=V0[1]+(256-midY)*k/math.cos(EL)
        V=[round(size,3),round(cy,3),round(cx,3)]
        oy=(256+V[1]*math.cos(EL)/V[0]*512)/2; ox=(256-V[2]/V[0]*512)/2
        print(group,'view',V,'originX',round(ox,1),'originY',round(oy,1))
        for (name,id,opt) in T:
            await p.evaluate("v=>{window.OV=v}",V); await p.evaluate("a=>window.setup(a[0],a[1])",[id,opt])
            # 걷기
            sh=Image.new('RGBA',(CELL*4,CELL*4),(0,0,0,0)); low=-1; top=999
            for i,d in enumerate(await frames('walk')):
                im,bb=bbox(d); low=max(low,bb[3]-1); top=min(top,bb[1])
                c=im.convert('RGBa').resize((CELL,CELL),Image.LANCZOS).convert('RGBA'); sh.paste(c,((i%4)*CELL,(i//4)*CELL))
            sh.save(f'out2/{name}.webp','WEBP',quality=84,method=6,alpha_quality=90)
            # 포즈(6칸, 4×2)
            ps=Image.new('RGBA',(CELL*4,CELL*2),(0,0,0,0))
            for i,d in enumerate(await frames('pose')):
                im,bb=bbox(d); c=im.convert('RGBa').resize((CELL,CELL),Image.LANCZOS).convert('RGBA'); ps.paste(c,((i%4)*CELL,(i//4)*CELL))
            ps.save(f'out2/{name}_pose.webp','WEBP',quality=84,method=6,alpha_quality=90)
            meta[name]={'view':V,'originX':round(ox,1),'originY':round(oy,1),'bottomRow':round((low+1)/2,1),'topRow':round(top/2,1),'kb':os.path.getsize(f'out2/{name}.webp')//1024,'kbp':os.path.getsize(f'out2/{name}_pose.webp')//1024}
            print(name,json.dumps(meta[name]))
        await b.close()
    old={}
    if os.path.exists('out2/walk_meta.json'): old=json.load(open('out2/walk_meta.json'))
    old.update(meta); json.dump(old,open('out2/walk_meta.json','w'),indent=1)
asyncio.run(main())
