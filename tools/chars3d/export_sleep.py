# 자는 장면 시트: python3 export_sleep.py lovel,chaeng,sul,dolsom,ppopu,dudung  → out/<id>_sleep.webp (4×4 칸 256px, 16프레임 반복) + out/sleep_meta.json
import asyncio, base64, io, json, math, os, sys
from playwright.async_api import async_playwright
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__)); N=16; CELL=256
ids=sys.argv[1].split(',')
async def main():
    meta={}
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        p=await b.new_page(); p.on('pageerror',lambda e:print('pageerror',e))
        await p.goto('file://'+D+'/sleep.html'); await p.wait_for_function('window.ready',timeout=60000)
        await p.evaluate("()=>window.noGround()")
        for id in ids:
            # ① 넉넉한 카메라로 모든 프레임의 범위를 잰다
            V0=[8.0,1.6,0.0]; await p.evaluate("v=>{window.OV=v}",V0); await p.evaluate("id=>window.setup(id)",id)
            bx=[999,-1,999,-1]
            for i in range(N):
                d=await p.evaluate("ph=>window.frame(ph)",i/N); im=Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA'); bb=im.split()[3].point(lambda v:255 if v>20 else 0).getbbox()
                bx=[min(bx[0],bb[0]),max(bx[1],bb[2]-1),min(bx[2],bb[1]),max(bx[3],bb[3]-1)]
            k=V0[0]/512; el=await p.evaluate("()=>window.EL")
            wU=(bx[1]-bx[0]+1)*k; hU=(bx[3]-bx[2]+1)*k; midX=(bx[0]+bx[1])/2; midY=(bx[2]+bx[3])/2
            size=max(wU,hU)*1.05
            cx=V0[2]+(midX-256)*k; cy=V0[1]+(256-midY)*k/math.cos(el)
            V=[round(size,3),round(cy,3),round(cx,3)]
            # ② 맞춘 카메라로 다시 렌더 → 칸
            await p.evaluate("v=>{window.OV=v}",V); await p.evaluate("id=>window.setup(id)",id)
            sh=Image.new('RGBA',(CELL*4,CELL*4),(0,0,0,0)); low=-1
            for i in range(N):
                d=await p.evaluate("ph=>window.frame(ph)",i/N); im=Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA')
                c=im.convert('RGBa').resize((CELL,CELL),Image.LANCZOS).convert('RGBA'); sh.paste(c,((i%4)*CELL,(i//4)*CELL))
            sh.save(f'out/{id}_sleep.webp','WEBP',quality=84,method=6,alpha_quality=92)
            an=await p.evaluate('()=>window.anchor()')
            oy=(256+ (cy*math.cos(el))/size*512)/2; ox=(256-cx/size*512)/2
            meta[id]={'view':V,'el':el,'size':size,'originX':round(ox,1),'originY':round(oy,1),'kb':os.path.getsize(f'out/{id}_sleep.webp')//1024,'bbox':bx,'anchor':[round(an[0],1),round(an[1],1)]}
            print(id,json.dumps(meta[id]))
        await b.close()
    old={}
    if os.path.exists('out/sleep_meta.json'): old=json.load(open('out/sleep_meta.json'))
    old.update(meta); json.dump(old,open('out/sleep_meta.json','w'),indent=1)
asyncio.run(main())
