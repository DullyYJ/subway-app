// 인천 시각표(test/fixtures/incheon_tt.json) → engine/next-train-data.js 의 NT_INCHEON_ENC 를 다시 만든다. 사용: node tools/route-speed/gen_nt_data.js
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');
const A='0123456789abcdefghijklmnopqrstuvwxyz';
function encArr(a){let out='',prev=0;for(const x of a){const dl=x-prev;prev=x;if(dl>=0&&dl<35)out+=A[dl];else{const v=dl+2000;if(v<0||v>=46656)throw new Error('range');out+='z'+v.toString(36).padStart(3,'0');}}return out;}
function enc(o){const r={};for(const k in o)r[k]=Array.isArray(o[k])?encArr(o[k]):enc(o[k]);return r;}
const f=path.join(root,'engine','next-train-data.js');
let s=fs.readFileSync(f,'utf8');
const E=JSON.stringify(enc(JSON.parse(fs.readFileSync(path.join(root,'test','fixtures','incheon_tt.json'),'utf8'))));
s=s.replace(/^var NT_INCHEON_ENC = .*;$/m,()=>'var NT_INCHEON_ENC = '+E+';');
fs.writeFileSync(f,s);console.log('ok',s.length);
