// 사용: cd tools/chars3d && npm i three@0.160.0 playwright && cp node_modules/three/build/three.min.js . && node export.js lovel,dolsom,ppopu,chaeng,sul,dudung 16 14 && python3 assemble.py  → out/*.webp 를 www/chars3d 로 복사
const {chromium}=require('playwright');const fs=require('fs');
const ids=process.argv[2].split(',');const N=+process.argv[3]||16;const NI=+process.argv[4]||14;
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();p.on('pageerror',e=>console.log('err',e.message));
await p.goto('file://' + __dirname + '/render.html');await p.waitForFunction('window.ready');
for(const id of ids){fs.mkdirSync(`fr/${id}`,{recursive:true});await p.evaluate(id=>window.setup(id),id);
 for(let i=0;i<N;i++){const d=await p.evaluate(ph=>window.frame(ph),i/N);fs.writeFileSync(`fr/${id}/loop_${String(i).padStart(2,'0')}.png`,Buffer.from(d.split(',')[1],'base64'));}
 if(id==='dudung'){for(let i=0;i<NI;i++){const d=await p.evaluate(u=>window.frameIntro(u),i/(NI-1));fs.writeFileSync(`fr/${id}/intro_${String(i).padStart(2,'0')}.png`,Buffer.from(d.split(',')[1],'base64'));}await p.evaluate(()=>window.cleanup());}
 console.log('done',id);}
await b.close();})();
