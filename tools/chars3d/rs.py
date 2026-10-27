import asyncio, base64, sys, os, json
from playwright.async_api import async_playwright
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__))
# 사용: python3 rs.py <id> <phases comma> [view json]  → sc/<id>_<i>.png , sc/<id>_prev.png (밝은 배경 + 축소 미리보기)
async def main():
    id=sys.argv[1]; phs=[float(x) for x in (sys.argv[2] if len(sys.argv)>2 else '0').split(',')]
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        p=await b.new_page(); p.on('pageerror',lambda e:print('pageerror',e)); p.on('console',lambda m:print('console',m.text[:300]) if m.type=='error' else None)
        await p.goto('file://'+D+'/sleep.html'); await p.wait_for_function('window.ready',timeout=60000)
        if len(sys.argv)>3: await p.evaluate("v=>{window.OV=v}",json.loads(sys.argv[3]))
        await p.evaluate("id=>window.setup(id)",id)
        ims=[]
        for i,ph in enumerate(phs):
            d=await p.evaluate("ph=>window.frame(ph)",ph); fn=f'sc/{id}_{i}.png'; open(fn,'wb').write(base64.b64decode(d.split(',')[1])); ims.append(fn)
        await b.close()
    W=Image.new('RGB',(512*len(ims)+ 140,512),(200,212,224))
    for i,f in enumerate(ims):
        im=Image.open(f).convert('RGBA'); W.paste(im,(i*512,0),im)
    sm=Image.open(ims[0]).convert('RGBA').resize((128,128),Image.LANCZOS); W.paste(sm,(512*len(ims)+6,6),sm)
    sm2=sm.resize((64,64),Image.LANCZOS); W.paste(sm2,(512*len(ims)+6,150),sm2)
    W.save(f'sc/{id}_prev.png'); print('ok',id)
asyncio.run(main())
