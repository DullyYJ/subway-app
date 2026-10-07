import fs from 'fs';
const A=await import('./cur.mjs'),B=await import('./new.mjs');
const xp=JSON.parse(fs.readFileSync('/tmp/prof/kric_xp_r.json','utf8'));
let d=0,n=0;const T=(f,x)=>{try{return f(x)}catch(e){return 'THROW:'+e.constructor.name}};const same=(a,b)=>typeof a==='string'||typeof b==='string'?a===b:a===b||(a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]));
for(const r of xp){for(const k of ['wk','we']){n++;if(!same(A.xpBits(r[k]),B.xpBits(r[k]))){d++;}}for(const k of ['hk','he']){n++;if(!same(A.xpHops(r[k]),B.xpHops(r[k]))){d++;}}}
// 퍼즈: 잘못된 문자·대문자·짧은/긴 문자열·null
function rnd(seed){let s=seed;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
const q=rnd(7);const al='0123456789abcdefABCDEFghijklmnopqrstuvwxyzGHIZ-_ .é';
for(let i=0;i<30000;i++){const len=[0,1,3,4,5,8,119,120,121,200,480][Math.floor(q()*11)];let s='';const pool=q()<.5?al.slice(0,22):al;for(let j=0;j<len;j++)s+=pool[Math.floor(q()*pool.length)];
 n+=2;if(!same(T(A.xpBits,s),T(B.xpBits,s)))d++;if(!same(T(A.xpHops,s),T(B.xpHops,s)))d++;}
for(const s of [null,undefined,'',0,123,{},[]]){n+=2;if(!same(T(A.xpBits,s),T(B.xpBits,s)))d++;if(!same(T(A.xpHops,s),T(B.xpHops,s)))d++;}
console.log('xp decode cases',n,'diff',d);
// isPassStop
let e=0,m=0;const names=['미정차','무정차','정차안함','정차 안함','OO통과','(가상)','[가상정류장]','가상 정류장','강남역','','서울역(중)','（가상）',null,undefined,12,'가상'];
for(const s of names){m++;if(A.isPassStop(s)!==B.isPassStop(s))e++}
const rows=JSON.parse(fs.readFileSync('/tmp/prof/rows.json','utf8'));for(const r of rows){m++;if(A.isPassStop(r.node_nm)!==B.isPassStop(r.node_nm))e++}
console.log('isPassStop cases',m,'diff',e);
