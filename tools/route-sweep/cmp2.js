const rd=p=>require('child_process').execSync(`cat ${p}`,{maxBuffer:1e9}).toString().trim().split('\n').map(JSON.parse);
const [,,pa,pb]=process.argv;const A=rd(pa),B=rd(pb);const m={};A.forEach(r=>m[r.o+'|'+r.d+'|'+r.t]=r);
const P=s=>Object.fromEntries((s||'').split(' ').map(x=>x.split(':')).map(([k,v])=>[k,+v]));
let better=0,worse=[],bestWorse=[];
for(const r of B){const a=m[r.o+'|'+r.d+'|'+r.t];if(!a||a.times===r.times)continue;
 const x=P(a.times),y=P(r.times);const mn=o=>Math.min(...Object.values(o).filter(v=>!isNaN(v)));
 const dm=mn(y)-mn(x); let w=0;for(const k in y){if(x[k]!=null&&y[k]>x[k]+0)w=Math.max(w,y[k]-x[k]);}
 if(dm>0)bestWorse.push([r.o+'>'+r.d,r.t,a.times,r.times,'min+'+dm]);
 if(w>0)worse.push([r.o+'>'+r.d,r.t,a.times,r.times,'+'+w, a.a?'anom':'ok']);else better++;}
console.log('improved-only',better,'some tab worse',worse.length,'min-time worse',bestWorse.length);
worse.sort((p,q)=>parseInt(q[4].slice(1))-parseInt(p[4].slice(1)));
for(const w of worse.slice(0,25))console.log(w.join(' | '));
console.log('--- min worse');for(const w of bestWorse.slice(0,15))console.log(w.join(' | '));
