# 전용 동작 시트 내보내기: python3 export_act.py   (act_specs.json → out2/juksun_act.webp, juksun_nb.webp, out2/bbosong_{0..3}_act.webp)
# 카메라는 walk_meta.json 의 걷기 시트 뷰를 그대로 써서 셀 좌표계가 걷기/포즈와 같다. 4×4 셀, 셀 256px.
import asyncio, base64, io, json, os
from playwright.async_api import async_playwright
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__)); CELL=256
SP=json.load(open(D+'/act_specs.json')); meta=json.load(open(D+'/walk_meta.json'))
T=[('juksun','panda',{'bb':'L'},'juksun',SP['panda'])]+[('bbosong_%d'%i,'hippo',{'shoe':i},'bbosong_%d'%i,SP['hippo']) for i in range(4)]
async def main():
    os.makedirs(D+'/out2',exist_ok=True)
    async with async_playwright() as pw:
        b=await pw.chromium.launch(args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        p=await b.new_page(viewport={'width':512,'height':512}); p.on('pageerror',lambda e:print('pageerror',e))
        await p.goto('file://'+D+'/render3.html'); await p.wait_for_function('window.ready',timeout=60000)
        for name,id,opt,mk,specs in T:
            await p.evaluate("v=>{window.OV=v}",meta[mk]['view']); await p.evaluate("a=>window.setup(a[0],a[1])",[id,opt])
            sh=Image.new('RGBA',(CELL*4,CELL*4),(0,0,0,0))
            for i,s in enumerate(specs):
                d=await p.evaluate("sp=>window.frameSpec(sp)",s['spec']); im=Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA')
                sh.paste(im.convert('RGBa').resize((CELL,CELL),Image.LANCZOS).convert('RGBA'),((i%4)*CELL,(i//4)*CELL))
            f=f'{D}/out2/{name}_act.webp'; sh.save(f,'WEBP',quality=84,method=6,alpha_quality=90); print(name,os.path.getsize(f)//1024,'KB')
        # 죽순이가 대나무를 떨어뜨린 동안 쓰는 '대나무 없는' 걷기 시트(juksun_nb)
        await p.evaluate("v=>{window.OV=v}",meta['juksun']['view']); await p.evaluate("a=>window.setup(a[0],a[1])",['panda',{'bb':'L'}])
        sh=Image.new('RGBA',(CELL*4,CELL*4),(0,0,0,0))
        for i in range(16):
            d=await p.evaluate("ph=>window.frameWalkNB(ph)",i/16); im=Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA')
            sh.paste(im.convert('RGBa').resize((CELL,CELL),Image.LANCZOS).convert('RGBA'),((i%4)*CELL,(i//4)*CELL))
        f=D+'/out2/juksun_nb.webp'; sh.save(f,'WEBP',quality=84,method=6,alpha_quality=90); print('juksun_nb',os.path.getsize(f)//1024,'KB')
        await b.close()
asyncio.run(main())
