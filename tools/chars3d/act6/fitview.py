import asyncio, base64, io, json, math, os
from playwright.async_api import async_playwright
from PIL import Image
EL=0.2; N=16; ASSET='/home/claude/work/app/Subway-app/shell-android/app/src/main/assets/chars3d/'
def ub(im, cell):  # union bbox of cells (in cell px)
    bx=[999,-1,999,-1]
    for i in range(16):
        c=im.crop(((i%4)*cell,(i//4)*cell,(i%4)*cell+cell,(i//4)*cell+cell)); bb=c.split()[3].point(lambda v:255 if v>24 else 0).getbbox()
        if bb: bx=[min(bx[0],bb[0]),max(bx[1],bb[2]-1),min(bx[2],bb[1]),max(bx[3],bb[3]-1)]
    return bx
def bbox(d):
    im=Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA'); return im.split()[3].point(lambda v:255 if v>24 else 0).getbbox()
async def main():
    meta={}
    async with async_playwright() as pw:
        b=await pw.chromium.launch(args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        p=await b.new_page(viewport={'width':512,'height':512}); p.on('pageerror',lambda e:print('err',e))
        await p.goto('file://'+os.getcwd()+'/render.html'); await p.wait_for_function('window.ready',timeout=60000)
        for id in ['dolsom','ppopu','lovel','chaeng','sul','dudung']:
            A=Image.open(ASSET+id+'.webp').convert('RGBA'); ab=ub(A,256)
            V0=[8,1.5,0]; await p.evaluate("v=>{window.OV=v}",V0); await p.evaluate("i=>window.setup(i)",id)
            bx=[999,-1,999,-1]
            for i in range(N):
                bb=bbox(await p.evaluate("ph=>window.frame(ph)",i/N)); bx=[min(bx[0],bb[0]),max(bx[1],bb[2]-1),min(bx[2],bb[1]),max(bx[3],bb[3]-1)]
            k=V0[0]/512
            wpx=bx[1]-bx[0]+1; hpx=bx[3]-bx[2]+1; aw=ab[1]-ab[0]+1; ah=ab[3]-ab[2]+1
            s1=V0[0]*wpx/(2*aw); s2=V0[0]*hpx/(2*ah)
            size=(s1+s2)/2
            # 월드 좌표: 내 중심 → 에셋 중심
            midX=(bx[0]+bx[1])/2; midY=(bx[2]+bx[3])/2; wx=V0[2]+(midX-256)*k; wy=V0[1]+(256-midY)*k/math.cos(EL)
            amx=(ab[0]+ab[1])/2; amy=(ab[2]+ab[3])/2
            # 에셋 칸(256)에서 중심이 (amx,amy): view 중심 cx = wx - (amx-128)*size/256, cy = wy + (amy-128)*size/256/cos
            cx=wx-(amx-128)*size/256; cy=wy+(amy-128)*size/256/math.cos(EL)
            V=[round(size,3),round(cy,3),round(cx,3)]
            oy=(256+V[1]*math.cos(EL)/V[0]*512)/2; ox=(256-V[2]/V[0]*512)/2
            meta[id]={'view':V,'originX':round(ox,1),'originY':round(oy,1),'ratio':[round(s1,3),round(s2,3)],'assetBB':ab}
            print(id,meta[id])
        await b.close()
    json.dump(meta,open('meta_fit.json','w'),indent=1)
asyncio.run(main())
