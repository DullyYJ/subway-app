import asyncio, base64, io, json, math, os, sys
from playwright.async_api import async_playwright
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__)); N=16; CELL=256; EL=0.34
T=[('juksun','panda',{}),('bbosong','hippo',{'shoe':0})]
async def main():
    meta={}
    async with async_playwright() as pw:
        b=await pw.chromium.launch(args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        p=await b.new_page(viewport={'width':512,'height':512}); p.on('pageerror',lambda e:print('pageerror',e))
        await p.goto('file://'+D+'/render2.html'); await p.wait_for_function('window.ready',timeout=60000)
        for (name,kind,opt) in T:
            V0=[10.0,1.4,0.0]; await p.evaluate("a=>{window.OV=a[0];window.EL=a[1]}",[V0,EL]); await p.evaluate("a=>window.setupSleep(a[0],a[1])",[kind,opt])
            bx=[999,-1,999,-1]
            for i in range(N):
                d=await p.evaluate("ph=>window.frameSleep(ph)",i/N); im=Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA'); bb=im.split()[3].point(lambda v:255 if v>20 else 0).getbbox()
                bx=[min(bx[0],bb[0]),max(bx[1],bb[2]-1),min(bx[2],bb[1]),max(bx[3],bb[3]-1)]
            k=V0[0]/512; wU=(bx[1]-bx[0]+1)*k; hU=(bx[3]-bx[2]+1)*k; midX=(bx[0]+bx[1])/2; midY=(bx[2]+bx[3])/2
            size=max(wU,hU)*1.05; cx=V0[2]+(midX-256)*k; cy=V0[1]+(256-midY)*k/math.cos(EL)
            V=[round(size,3),round(cy,3),round(cx,3)]
            await p.evaluate("a=>{window.OV=a[0];window.EL=a[1]}",[V,EL]); await p.evaluate("a=>window.setupSleep(a[0],a[1])",[kind,opt])
            sh=Image.new('RGBA',(CELL*4,CELL*4),(0,0,0,0))
            for i in range(N):
                d=await p.evaluate("ph=>window.frameSleep(ph)",i/N); im=Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA')
                c=im.convert('RGBa').resize((CELL,CELL),Image.LANCZOS).convert('RGBA'); sh.paste(c,((i%4)*CELL,(i//4)*CELL))
            sh.save(f'out2/{name}_sleep.webp','WEBP',quality=84,method=6,alpha_quality=92)
            an=await p.evaluate('()=>window.anchor()')
            oy=(256+(cy*math.cos(EL))/size*512)/2; ox=(256-cx/size*512)/2
            meta[name]={'view':V,'el':EL,'size':size,'originX':round(ox,1),'originY':round(oy,1),'kb':os.path.getsize(f'out2/{name}_sleep.webp')//1024,'anchor':[round(an[0],1),round(an[1],1)]}
            print(name,json.dumps(meta[name]))
        await b.close()
    json.dump(meta,open('out2/sleep_meta.json','w'),indent=1)
asyncio.run(main())
