import glob,os,json
from PIL import Image
CELL=256
def down(im):
    im=im.convert('RGBA').convert('RGBa').resize((CELL,CELL),Image.LANCZOS).convert('RGBA');return im
os.makedirs('out',exist_ok=True)
res={}
for cd in sorted(glob.glob('fr/*')):
    id=os.path.basename(cd)
    for kind in ('loop','intro'):
        fs=sorted(glob.glob(f'{cd}/{kind}_*.png'))
        if not fs: continue
        n=len(fs);cols=4;rows=(n+cols-1)//cols
        sh=Image.new('RGBA',(CELL*cols,CELL*rows),(0,0,0,0))
        for i,f in enumerate(fs): sh.paste(down(Image.open(f)),((i%cols)*CELL,(i//cols)*CELL))
        name=f'{id}.webp' if kind=='loop' else f'{id}_intro.webp'
        sh.save('out/'+name,'WEBP',quality=84,method=6,alpha_quality=90)
        res[name]=(n,os.path.getsize('out/'+name))
print(json.dumps(res,indent=1));print(sum(v[1] for v in res.values())//1024,'KB')
