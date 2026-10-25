// 사용: node exportpose.js lovel,dolsom,...  → fr/<id>/pose_0..5.png (걷기 시트와 같은 카메라: fr/meta_all.json 의 view)
const {chromium}=require('playwright');const fs=require('fs');
const ids=process.argv[2].split(',');const meta=JSON.parse(fs.readFileSync('fr/meta_all.json'));const BASE={dolsom:248.5,lovel:250,ppopu:248.5,chaeng:244.5,sul:230.5,dudung:222.5};const FLOAT={chaeng:['sit','sleep','happy','shiver','pant','squint'],sul:['happy','pant']};const HOP=['happy'];
const NAMES=['sit','sleep','happy','shiver','pant','squint'];
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();p.on('pageerror',e=>console.log('err',e.message));
await p.goto('file://'+__dirname+'/render.html');await p.waitForFunction('window.ready',null,{timeout:60000});
for(const id of ids){await p.evaluate(v=>{window.OV=v;},meta[id].view);fs.mkdirSync(`fr/${id}`,{recursive:true});
 for(let i=0;i<NAMES.length;i++){await p.evaluate(id=>window.setup(id),id);let d=await p.evaluate(n=>window.framePose(n,0),NAMES[i]);
  const fl=(FLOAT[id]||[]).includes(NAMES[i])||HOP.includes(NAMES[i]);
  if(!fl){let tot=0;for(let it=0;it<12;it++){const low=await p.evaluate(async d=>{const im=new Image();im.src=d;await im.decode();const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.drawImage(im,0,0);const a=x.getImageData(0,0,512,512).data;let y1=-1;for(let y=0;y<512;y++)for(let xx=0;xx<512;xx++){if(a[(y*512+xx)*4+3]>24)y1=y;}return y1;},d);
   const e=low-(2*BASE[id]-1);if(Math.abs(e)<=1)break;tot+=e*meta[id].view[0]/512/Math.cos(0.2);d=await p.evaluate(a=>window.framePose(a[0],a[1]),[NAMES[i],tot]);}console.log(id,NAMES[i],'dy',tot.toFixed(3));}
  fs.writeFileSync(`fr/${id}/pose_${i}.png`,Buffer.from(d.split(',')[1],'base64'));}
 console.log('ok',id);}
await b.close();})();
