// 사용: node preview.js lovel,dolsom 0,4,8,12  → pv/<id>_<n>.png
const {chromium}=require('playwright');const fs=require('fs');
const ids=process.argv[2].split(',');const frames=(process.argv[3]||'0,4,8,12').split(',').map(Number);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();p.on('pageerror',e=>console.log('err',e.message));p.on('console',m=>{if(m.type()==='error')console.log('con',m.text())});
await p.goto('file://'+__dirname+'/render.html');await p.waitForFunction('window.ready',null,{timeout:30000});
fs.mkdirSync('pv',{recursive:true});
for(const id of ids){await p.evaluate(id=>window.setup(id),id);for(const f of frames){const d=await p.evaluate(ph=>window.frame(ph),f/16);fs.writeFileSync(`pv/${id}_${f}.png`,Buffer.from(d.split(',')[1],'base64'));}console.log('ok',id);}
await b.close();})();
