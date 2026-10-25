// node poseprev.js lovel,dolsom → pv/<id>_p<name>.png  (FIXV 환경변수로 카메라 고정 가능)
const {chromium}=require('playwright');const fs=require('fs');
const ids=process.argv[2].split(',');const NAMES=['sit','sleep','happy','shiver','pant','squint'];
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();p.on('pageerror',e=>console.log('err',e.message));p.on('console',m=>{if(m.type()==='error')console.log('con',m.text())});
await p.goto('file://'+__dirname+'/render.html');await p.waitForFunction('window.ready',null,{timeout:60000});
fs.mkdirSync('pv',{recursive:true});
for(const id of ids){for(const n of NAMES){await p.evaluate(id=>window.setup(id),id);const d=await p.evaluate(n=>window.framePose(n),n);fs.writeFileSync(`pv/${id}_p${n}.png`,Buffer.from(d.split(',')[1],'base64'));}console.log('ok',id);}
await b.close();})();
