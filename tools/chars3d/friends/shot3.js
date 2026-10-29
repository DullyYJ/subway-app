const {chromium}=require('/home/claude/.npm-global/lib/node_modules/playwright');const fs=require('fs');
const jobs=JSON.parse(process.argv[2]);
(async()=>{const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:512,height:512}});p.on('pageerror',e=>console.log('err',e.message));p.on('console',m=>{if(m.type()==='error')console.log('con',m.text())});
await p.goto('file://'+__dirname+'/render2.html');await p.waitForFunction('window.ready',null,{timeout:30000});
fs.mkdirSync('out2',{recursive:true});
for(const j of jobs){await p.evaluate(a=>{window.OV=a[0];window.EL=a[1]},[j.OV||[8,1.2,0],j.EL||0.34]);await p.evaluate(a=>window.setupSleep(a[0],a[1]),[j.kind,j.opt||{}]);
 const d=await p.evaluate(j=>window.frameSleep(j.ph||0),j);fs.writeFileSync('out2/'+j.name+'.png',Buffer.from(d.split(',')[1],'base64'));console.log('ok',j.name);}
await b.close();})();
