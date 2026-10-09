const fs=require('fs');let s=fs.readFileSync(process.argv[2],'utf8');
const a='var ENGINE_VERSION = "route-v2-2026-10-06f";';
if(s.split(a).length!==2)throw new Error('version anchor');
s=s.replace(a,'var ENGINE_VERSION = "route-v2-2026-10-09s15";');
fs.writeFileSync(process.argv[3],s);console.log('ok4');
