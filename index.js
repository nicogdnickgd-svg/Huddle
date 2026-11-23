// Huddle: one file with the website, accounts, servers, chat, profiles and call signaling.
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const MAXP=200*1024,GUID="258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients=new Set(),wss={clients};
// Minimal WebSocket implementation so no npm packages are needed.
class Sock{
 constructor(s){this.s=s;this.readyState=1;this.h={};this.buf=Buffer.alloc(0);this.frag=[];this.fl=0;
  s.on("data",d=>{this.buf=Buffer.concat([this.buf,d]);try{this.parse()}catch(e){this.terminate()}});
  s.on("close",()=>this.end());s.on("error",()=>this.end());s.setNoDelay(true)}
 on(e,f){this.h[e]=f}
 emit(e,a){if(this.h[e])this.h[e](a)}
 end(){if(this.readyState===3)return;this.readyState=3;clients.delete(this);this.emit("close")}
 raw(op,data){if(this.readyState!==1||!this.s.writable)return;const n=data.length;let hd;
  if(n<126)hd=Buffer.from([0x80|op,n]);else if(n<65536){hd=Buffer.alloc(4);hd[0]=0x80|op;hd[1]=126;hd.writeUInt16BE(n,2)}else{hd=Buffer.alloc(10);hd[0]=0x80|op;hd[1]=127;hd.writeBigUInt64BE(BigInt(n),2)}
  this.s.write(Buffer.concat([hd,data]))}
 send(t){this.raw(1,Buffer.from(t))}
 ping(){this.raw(9,Buffer.alloc(0))}
 close(){if(this.readyState===1){this.raw(8,Buffer.alloc(0));this.readyState=2;this.s.end()}}
 terminate(){this.s.destroy();this.end()}
 parse(){for(;;){const b=this.buf;if(b.length<2)return;const op=b[0]&15,fi=b[0]&128,masked=b[1]&128;let n=b[1]&127,o=2;
  if(n===126){if(b.length<4)return;n=b.readUInt16BE(2);o=4}else if(n===127){if(b.length<10)return;n=Number(b.readBigUInt64BE(2));o=10}
  if(n>MAXP||!masked)return this.terminate();
  if(b.length<o+4+n)return;const mk=b.subarray(o,o+4),p=Buffer.from(b.subarray(o+4,o+4+n));for(let i=0;i<n;i++)p[i]^=mk[i&3];
  this.buf=b.subarray(o+4+n);
  if(op===8){this.close();return}
  if(op===9){this.raw(10,p);continue}
  if(op===10){this.emit("pong");continue}
  if(op===1||op===0){this.frag.push(p);this.fl+=n;if(this.fl>MAXP)return this.terminate();
   if(fi){const t=Buffer.concat(this.frag).toString();this.frag=[];this.fl=0;this.emit("message",t)}}}}}
const PARTS=[["page1.html", 22017, "02f13645ddb50c83fc98f7d4c6a22a72fdf9db80588d40fc248625a5fa0831c3"], ["page2.html", 22005, "4e43c1bc1565619f517e3073adfb6e19b269b01308df1fc0ff72dcdfc229a1ab"], ["page3.html", 22008, "ffdc339807b92f59b1e64c8fdf9f454a78cff31bebf98552eba48b580fe34e3f"], ["page4.html", 19355, "2b4ea7ab1a1abf768804a355d8f43c998bde3d1c2509669ef08c6d940a9b4346"]];
let HTML="";
for(const [f,len,sha] of PARTS){let t;try{t=fs.readFileSync(path.join(__dirname,f),"utf8")}catch(e){console.error("MISSING FILE: "+f+". Add it to your GitHub repo (same folder as index.js).");process.exit(1)}
 t=t.replace(/\r\n/g,"\n").trimEnd();const b=Buffer.from(t);
 if(b.length!==len||crypto.createHash("sha256").update(b).digest("hex")!==sha){console.error("INCOMPLETE OR CHANGED FILE: "+f+" should be "+len+" bytes but is "+b.length+". Delete it and paste the whole file again.");process.exit(1)}
 HTML+=(HTML?"\n":"")+t}

const PORT=process.env.PORT||3000;
const DB=path.join(process.env.DATA_DIR||__dirname,"data.json");
const TPL={own:{text:["general"],voice:["voice"]},gaming:{text:["welcome","general","clips","looking-for-group"],voice:["lobby","squad-1","squad-2"]},
 school:{text:["announcements","general","homework-help","events"],voice:["hall","study-room"]},study:{text:["general","resources","questions","goals"],voice:["focus-room","break-room"]},
 friends:{text:["general","memes","photos"],voice:["hangout","chill"]},artists:{text:["showcase","feedback","wips","commissions"],voice:["studio","stream"]},local:{text:["welcome","announcements","events","general"],voice:["meetup"]}};
const BADGES=["🎮","🔥","💎","⭐","🚀","🎨","🎧","👑","🧠","🌙","🍕","🦊"];
const IMG=/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/;
const chOf=sid=>db.servers[sid]?(db.servers[sid].channels||{text:["general","random","help"],voice:["voice","talk"]}):null;
const slug=n=>String(n||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24);
let db={users:{},tokens:{},servers:{},ms:[],msgs:{},fr:[],emojis:{},admin:null,proAll:false},dirty=false;
if(!(process.env.UPSTASH_REDIS_REST_URL&&process.env.UPSTASH_REDIS_REST_TOKEN)){try{db=Object.assign(db,JSON.parse(fs.readFileSync(DB,"utf8")))}catch(e){}}
const postLoad=()=>{db.fr=db.fr||[];db.emojis=db.emojis||{};db.tokens=db.tokens||{};db.servers=db.servers||{};db.ms=db.ms||[];db.msgs=db.msgs||{};Object.entries(db.users).forEach(([n,u])=>{u.name=n});if(!db.admin){const f=Object.keys(db.users)[0];if(f)db.admin=f}};postLoad();
const isPro=u=>!!(u&&(u.pro||db.proAll||db.admin===u.name));
const PRO_AN=["glow","ring","rainbow"],PRO_DC=["crown","sparkle","orbit"],PRO_FX=["grad","rainbow"];
const EIMG=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
function gate(p){const q=JSON.parse(JSON.stringify(p));if(PRO_AN.includes(q.av.an))q.av.an="none";if(PRO_DC.includes(q.av.dc))q.av.dc="none";if(q.bn.t==="img")q.bn.t="grad";if(q.pt==="neon")q.pt="none";if(PRO_FX.includes(q.nm.fx))q.nm.fx="none";q.badges=(q.badges||[]).slice(0,3);return q}
const SHOP={dc:{horns:150,flame:250,frost:250,neon:200,hearts:300,glitch:400},fx:{snow:300,stars:300,rain:350,confetti:450}};
const dayKey=()=>new Date().toISOString().slice(0,10);
const rid=()=>crypto.randomBytes(5).toString("hex");
function shopGate(p,u){const q=JSON.parse(JSON.stringify(p)),own=u.own||[];if(SHOP.dc[q.av.dc]&&!own.includes("dc:"+q.av.dc))q.av.dc="none";if(q.fx&&q.fx!=="none"&&!own.includes("fx:"+q.fx))q.fx="none";return q}
function wallet(u){if(u.orbs==null)u.orbs=100;u.own=u.own||[];u.q=u.q||{};const day=dayKey(),mt=u.mt&&u.mt.day===day?u.mt.n:0;
 const servers=Object.values(db.servers).filter(s=>s.owner===u.id).length,frs=db.fr.filter(f=>(f.a===u.id||f.b===u.id)&&f.st==="f").length,dayOk=Date.now()-(u.q.daily||0)>72e6;
 const qs=[{id:"daily",title:"Daily check-in",desc:"Come back every day for free Orbs",reward:50,prog:dayOk?1:0,goal:1,done:dayOk,claimed:!dayOk},
  {id:"chat",title:"Chatterbox",desc:"Send 10 messages today",reward:100,prog:Math.min(mt,10),goal:10,done:mt>=10&&u.q.chat!==day,claimed:u.q.chat===day},
  {id:"friend",title:"Make a friend",desc:"Have at least 1 friend",reward:150,prog:Math.min(frs,1),goal:1,done:frs>=1&&!u.q.friend,claimed:!!u.q.friend},
  {id:"server",title:"Server builder",desc:"Create your own server",reward:150,prog:Math.min(servers,1),goal:1,done:servers>=1&&!u.q.server,claimed:!!u.q.server}];
 return{t:"wallet",orbs:u.orbs,own:u.own,quests:qs}}
const walletOut=ws=>{const u=byId(ws.uid);if(u)out(ws,wallet(u))};
/* ---- storage: Upstash Redis when configured (survives restarts), otherwise a local file ---- */
const RURL=(process.env.UPSTASH_REDIS_REST_URL||"").replace(/\/$/,""),RTOK=process.env.UPSTASH_REDIS_REST_TOKEN||"",REMOTE=!!(RURL&&RTOK);
const rAuth={Authorization:"Bearer "+RTOK,"Content-Type":"application/json"};
const redis=async cmds=>{const r=await fetch(RURL+"/pipeline",{method:"POST",headers:rAuth,body:JSON.stringify(cmds)});if(!r.ok)throw new Error("Upstash "+r.status);return r.json()};
function parts(){const p={core:JSON.stringify({tokens:db.tokens,fr:db.fr,ms:db.ms,admin:db.admin,proAll:db.proAll}),servers:JSON.stringify(db.servers),emojis:JSON.stringify(db.emojis)};
 Object.entries(db.users).forEach(([n,u])=>{p["u:"+n]=JSON.stringify(u)});
 Object.entries(db.msgs).forEach(([k,l])=>{let a=l.slice(-300),j=JSON.stringify(a);while(j.length>800000&&a.length>5){a=a.slice(Math.ceil(a.length/4));j=JSON.stringify(a)}p["m:"+k]=j});return p}
let lastSaved={},saving=false;
async function saveRemote(){if(saving)return;saving=true;try{const p=parts(),cmds=[];
 for(const k in p)if(lastSaved[k]!==p[k])cmds.push(["SET","huddle:"+k,p[k]]);
 for(const k in lastSaved)if(!(k in p))cmds.push(["DEL","huddle:"+k]);
 let batch=[],size=0;const run=async()=>{if(batch.length){await redis(batch);batch=[];size=0}};
 for(const c of cmds){const n=c[2]?c[2].length:10;if(size+n>700000)await run();batch.push(c);size+=n}await run();lastSaved=p;dirty=false}
 catch(e){console.error("Save failed:",e.message);dirty=true}finally{saving=false}}
async function loadRemote(){const kr=await fetch(RURL+"/keys/huddle:*",{headers:rAuth});if(!kr.ok)throw new Error("Upstash "+kr.status+" (check the URL and token)");
 const keys=(await kr.json()).result||[];const o={};
 for(let i=0;i<keys.length;i+=50){const b=keys.slice(i,i+50),res=await redis(b.map(k=>["GET",k]));b.forEach((k,j)=>{o[k.slice(7)]=res[j].result})}
 const d={users:{},msgs:{}};
 for(const k in o){if(o[k]==null)continue;let v;try{v=JSON.parse(o[k])}catch(e){continue}
  if(k==="core")Object.assign(d,v);else if(k==="servers")d.servers=v;else if(k==="emojis")d.emojis=v;else if(k.startsWith("u:"))d.users[k.slice(2)]=v;else if(k.startsWith("m:"))d.msgs[k.slice(2)]=v}
 db=Object.assign(db,d);postLoad();lastSaved=parts();console.log("Loaded "+keys.length+" records from Upstash")}
const flush=()=>{try{fs.writeFileSync(DB,JSON.stringify(db))}catch(e){console.error(e)}};
setInterval(()=>{if(!dirty)return;if(REMOTE)saveRemote();else{dirty=false;flush()}},3000);
process.on("SIGTERM",async()=>{if(REMOTE)await saveRemote();else flush();process.exit(0)});

const DEFAULT_ICE=[{urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302","stun:stun.cloudflare.com:3478"]},
 {urls:["turn:openrelay.metered.ca:80","turn:openrelay.metered.ca:443","turns:openrelay.metered.ca:443?transport=tcp"],username:"openrelayproject",credential:"openrelayproject"}];
// To use your own TURN server for calls, set the ICE_SERVERS environment variable to a JSON list.
let ICE=JSON.stringify(DEFAULT_ICE);try{if(process.env.ICE_SERVERS){JSON.parse(process.env.ICE_SERVERS);ICE=process.env.ICE_SERVERS}}catch(e){}
const page=Buffer.from(HTML.replace("__ICE__",()=>ICE));
const server=http.createServer((q,r)=>{const u=new URL(q.url,"http://x");
 if(u.pathname==="/backup"||u.pathname==="/restore"){const n=db.tokens[u.searchParams.get("token")||""];
  if(!n||db.admin!==n){r.writeHead(403);return r.end("Admin only")}
  if(u.pathname==="/backup"){r.writeHead(200,{"Content-Type":"application/json","Content-Disposition":"attachment; filename=huddle-backup.json"});return r.end(JSON.stringify(db))}
  if(q.method!=="POST"){r.writeHead(405);return r.end()}
  const ch=[];let size=0;q.on("data",d=>{size+=d.length;if(size>80e6){r.writeHead(413);r.end();q.destroy()}else ch.push(d)});
  q.on("end",()=>{try{const d=JSON.parse(Buffer.concat(ch).toString());if(!d||typeof d.users!=="object"||Array.isArray(d.users))throw 0;
   db=Object.assign({users:{},tokens:{},servers:{},ms:[],msgs:{},fr:[],emojis:{},admin:null,proAll:false},d);postLoad();dirty=true;r.writeHead(200);r.end("ok");setTimeout(()=>wss.clients.forEach(c=>c.terminate()),300)}catch(e){r.writeHead(400);r.end("Bad backup file")}});return}
 r.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});r.end(q.method==="HEAD"?undefined:page)});

const hx=(c,d)=>/^#[0-9a-f]{6}$/i.test(c||"")?c:d,en=(v,l,d)=>l.includes(v)?v:d,str=(s,n)=>String(s==null?"":s).slice(0,n);
function cleanProfile(p){p=p||{};const a=p.av||{},b=p.bn||{},n=p.nm||{};
 const name=str(p.name,24).trim();if(name.length<2)return null;
 const img=IMG.test(a.img||"")&&a.img.length<40000?a.img:"",bimg=IMG.test(b.img||"")&&b.img.length<60000?b.img:"";
 return{name,color:hx(p.color,"#ffb84d"),pr:str(p.pr,16),status:str(p.status,40),bio:str(p.bio,160),
  fx:en(p.fx,["none","snow","stars","rain","confetti"],"none"),nofr:p.nofr?1:0,tag:str(p.tag,4).replace(/[^A-Za-z0-9]/g,"").toUpperCase(),badges:[...new Set(Array.isArray(p.badges)?p.badges:[])].filter(x=>BADGES.includes(x)).slice(0,6),
  stat:en(p.stat,["online","idle","dnd","invisible"],"online"),pt:en(p.pt,["none","tint","neon"],"none"),
  av:{t:en(a.t,["ini","emo","img"],"ini"),e:str(a.e,8),img,bg:en(a.bg,["solid","grad","aurora"],"grad"),c1:hx(a.c1,"#ffb84d"),c2:hx(a.c2,"#ff6b9d"),an:en(a.an,["none","pulse","float","glow","ring","wiggle","rainbow"],"none"),sh:en(a.sh,["c","r","s"],"c"),dc:en(a.dc,["none","crown","halo","sparkle","ears","orbit","horns","flame","frost","neon","hearts","glitch"],"none")},
  bn:{t:en(b.t,["grad","aurora","stripes","dots","img"],"grad"),img:bimg,c1:hx(b.c1,"#ffb84d"),c2:hx(b.c2,"#b9a3ff"),c3:hx(b.c3,"#7ad7f0"),sp:Math.min(20,Math.max(2,+b.sp||8))},
  nm:{fx:en(n.fx,["none","grad","glow","rainbow"],"none"),ff:en(n.ff,["def","mono","serif","fun"],"def")}}}

const hash=(p,s)=>crypto.scryptSync(p,s,64);
const byId=id=>Object.values(db.users).find(u=>u.id===id);
const out=(ws,o)=>ws.readyState===1&&ws.send(JSON.stringify(o));
const all=o=>wss.clients.forEach(c=>c.uid&&out(c,o));
const rnd=(n,al)=>Array.from({length:n},()=>al[crypto.randomInt(al.length)]).join("");
const profiles=()=>{const l={};Object.entries(db.users).forEach(([n,u])=>{if(!u.profile)return;const pr=isPro(u);l[u.id]={...shopGate(pr?u.profile:gate(u.profile),u),un:n,since:u.ts||0,pro:pr}});return l};
const pres=()=>{const l={};wss.clients.forEach(c=>{if(c.uid)l[c.uid]=c.vc||l[c.uid]||""});return l};
const isMember=(u,s)=>db.ms.some(m=>m.uid===u&&m.sid===s);
function mineFor(uid){const o={};db.ms.filter(m=>m.uid===uid).forEach(m=>{const s=db.servers[m.sid];if(s)o[m.sid]={name:s.name,owner:s.owner,code:s.code,ts:s.ts,icon:s.icon||"",channels:chOf(m.sid),members:db.ms.filter(x=>x.sid===m.sid).map(x=>x.uid)}});return o}
const allMine=()=>wss.clients.forEach(c=>c.uid&&out(c,{t:"mine",servers:mineFor(c.uid)}));
const pairKey=(a,b)=>[a,b].sort().join("-");
const frFind=(a,b)=>db.fr.find(f=>(f.a===a&&f.b===b)||(f.a===b&&f.b===a));
const friendsFor=u=>db.fr.filter(f=>f.a===u||f.b===u).map(f=>({id:f.a===u?f.b:f.a,st:f.st==="f"?"f":f.a===u?"out":"in"}));
const sendFr=u=>wss.clients.forEach(c=>c.uid===u&&out(c,{t:"friends",list:friendsFor(u)}));
const proInfo=ws=>{const u=byId(ws.uid);if(!u)return;const adm=db.admin===u.name;out(ws,{t:"pro",pro:isPro(u),admin:adm,all:!!db.proAll,list:adm?Object.values(db.users).filter(x=>x.pro).map(x=>x.name):[]})};
const allPro=()=>{wss.clients.forEach(c=>c.uid&&proInfo(c));all({t:"profiles",list:profiles()})};
function target(ws,m){
 if(m.dm){const f=frFind(ws.uid,m.dm);if(!f||f.st!=="f")return null;
  return{key:"@dm/"+pairKey(ws.uid,m.dm),each:fn=>wss.clients.forEach(c=>{if(!c.uid)return;const o=c.uid===ws.uid?m.dm:c.uid===m.dm?ws.uid:null;if(o&&c.sid==="@dm"&&c.ch===o)fn(c,"@dm",o)})}}
 if(isMember(ws.uid,m.sid)&&chOf(m.sid).text.includes(m.ch))return{key:m.sid+"/"+m.ch,each:fn=>wss.clients.forEach(c=>c.uid&&c.sid===m.sid&&c.ch===m.ch&&fn(c,m.sid,m.ch))};
 return null}
const tok=u=>{const t=crypto.randomBytes(24).toString("hex");db.tokens[t]=u;dirty=true;return t};

const onConn=ws=>{
 ws.on("error",()=>{});ws.on("pong",()=>ws.dead=false);ws.fails=0;ws.last=0;
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(raw)}catch(e){return}
  if(!ws.uid){
   const login=name=>{const u=db.users[name];ws.uid=u.id;ws.ch=null;ws.sid=null;ws.vc=null;
    out(ws,{t:"authok",uid:u.id,token:m.token||tok(name)});out(ws,{t:"mine",servers:mineFor(u.id)});out(ws,{t:"friends",list:friendsFor(u.id)});out(ws,{t:"emojis",list:db.emojis});proInfo(ws);walletOut(ws);all({t:"profiles",list:profiles()});all({t:"pres",list:pres()})};
   if(m.t==="token"){const n=db.tokens[m.token];if(n&&db.users[n])return login(n);return out(ws,{t:"autherr",bad:1})}
   if(++ws.fails>10)return ws.close();
   const name=String(m.user||"").toLowerCase().trim(),pass=String(m.pass||"");
   if(m.t==="signup"){
    if(!/^[a-z0-9_]{3,20}$/.test(name))return out(ws,{t:"autherr",m:"Username must be 3-20 letters, numbers or underscores."});
    if(pass.length<6||pass.length>100)return out(ws,{t:"autherr",m:"Password must be at least 6 characters."});
    if(db.users[name])return out(ws,{t:"autherr",m:"That username is taken."});
    const salt=crypto.randomBytes(16).toString("hex");
    db.users[name]={id:crypto.randomBytes(6).toString("hex"),salt,hash:hash(pass,salt).toString("hex"),profile:null,ts:Date.now(),name};if(!db.admin)db.admin=name;dirty=true;
    return login(name)}
   if(m.t==="login"){const u=db.users[name];
    if(!u||!crypto.timingSafeEqual(hash(pass,u.salt),Buffer.from(u.hash,"hex")))return out(ws,{t:"autherr",m:"Wrong username or password."});
    return login(name)}
   return}
  const me=byId(ws.uid);if(!me)return;
  const now=Date.now();
  if(m.t==="profile"){const p=cleanProfile(m.p);if(!p)return;me.profile=p;dirty=true;all({t:"profiles",list:profiles()})}
  else if(m.t==="create"&&me.profile){const name=str(m.name,30).trim();
   if(name.length<2)return out(ws,{t:"err",m:"Server name needs at least 2 characters."});
   if(Object.values(db.servers).filter(s=>s.owner===ws.uid).length>=10)return out(ws,{t:"err",m:"You can own up to 10 servers."});
   let id;do{id=rnd(8,"abcdefghjkmnpqrstuvwxyz23456789")}while(db.servers[id]);
   let code;do{code=rnd(6,"ABCDEFGHJKMNPQRSTUVWXYZ23456789")}while(Object.values(db.servers).some(s=>s.code===code));
   const t=TPL[m.tpl]||TPL.own;
   db.servers[id]={name,owner:ws.uid,code,ts:now,icon:IMG.test(m.icon||"")&&m.icon.length<40000?m.icon:"",channels:{text:[...t.text],voice:[...t.voice]}};
   db.ms.push({uid:ws.uid,sid:id});dirty=true;allMine();out(ws,{t:"joined",sid:id})}
  else if(m.t==="join"&&me.profile){const code=str(m.code,12).trim().toUpperCase();const id=Object.keys(db.servers).find(s=>db.servers[s].code===code);
   if(!id)return out(ws,{t:"err",m:"No server found with that code."});
   if(!isMember(ws.uid,id)){db.ms.push({uid:ws.uid,sid:id});dirty=true;allMine()}out(ws,{t:"joined",sid:id})}
  else if(m.t==="leave"){const s=db.servers[m.sid];if(!s||s.owner===ws.uid)return;db.ms=db.ms.filter(x=>!(x.uid===ws.uid&&x.sid===m.sid));dirty=true;if(ws.vc&&ws.vc.startsWith(m.sid+".")){ws.vc=null;all({t:"pres",list:pres()})}ws.sid=null;allMine()}
  else if(m.t==="delete"){const s=db.servers[m.sid];if(!s||s.owner!==ws.uid)return;delete db.servers[m.sid];db.ms=db.ms.filter(x=>x.sid!==m.sid);
   Object.keys(db.msgs).forEach(k=>{if(k.startsWith(m.sid+"/"))delete db.msgs[k]});dirty=true;
   wss.clients.forEach(c=>{if(c.vc&&c.vc.startsWith(m.sid+"."))c.vc=null});allMine();all({t:"pres",list:pres()})}
  else if(m.t==="msg"&&me.profile){const tg=target(ws,m);if(!tg||now-ws.last<300)return;ws.last=now;
   const text=str(m.text,2000).trim(),img=IMG.test(m.img||"")&&m.img.length<90000?m.img:"";if(!text&&!img)return;
   const o={id:rid(),uid:ws.uid,text,ts:now};if(img)o.img=img;const l=db.msgs[tg.key]=db.msgs[tg.key]||[];
   if(m.re){const q=l.find(x=>x.id===m.re);if(q)o.re={id:q.id,uid:q.uid,text:String(q.text||"").slice(0,100)}}
   l.push(o);if(l.length>1000)l.splice(0,l.length-1000);me.mt=me.mt&&me.mt.day===dayKey()?{day:me.mt.day,n:me.mt.n+1}:{day:dayKey(),n:1};dirty=true;
   tg.each((c,sid,ch)=>out(c,{t:"msg",sid,ch,m:o}))}
  else if(m.t==="edit"){const tg=target(ws,m);if(!tg)return;const q=(db.msgs[tg.key]||[]).find(x=>x.id===m.id);if(!q||q.uid!==ws.uid)return;const t=str(m.text,2000).trim();if(!t)return;
   q.text=t;q.ed=1;dirty=true;tg.each((c,sid,ch)=>out(c,{t:"mu",sid,ch,id:q.id,text:t}))}
  else if(m.t==="del"){const tg=target(ws,m);if(!tg)return;const l=db.msgs[tg.key]||[],i=l.findIndex(x=>x.id===m.id);if(i<0)return;
   if(!(l[i].uid===ws.uid||(m.sid&&db.servers[m.sid]&&db.servers[m.sid].owner===ws.uid)))return;l.splice(i,1);dirty=true;tg.each((c,sid,ch)=>out(c,{t:"md",sid,ch,id:m.id}))}
  else if(m.t==="wallet")walletOut(ws)
  else if(m.t==="qclaim"){const w=wallet(me),q=w.quests.find(x=>x.id===m.id);if(!q||!q.done)return;me.orbs+=q.reward;
   if(q.id==="daily")me.q.daily=Date.now();else if(q.id==="chat")me.q.chat=dayKey();else me.q[q.id]=1;dirty=true;walletOut(ws);out(ws,{t:"finfo",m:"+"+q.reward+" Orbs!"})}
  else if(m.t==="buy"){const [k,v]=String(m.id||"").split(":"),price=SHOP[k]&&SHOP[k][v];if(!price)return;wallet(me);
   if(me.own.includes(m.id))return out(ws,{t:"finfo",m:"You already own that."});if(me.orbs<price)return out(ws,{t:"finfo",m:"Not enough Orbs."});
   me.orbs-=price;me.own.push(m.id);dirty=true;walletOut(ws);all({t:"profiles",list:profiles()});out(ws,{t:"finfo",m:"Purchased!"})}
  else if(m.t==="open"&&m.dm){const f=frFind(ws.uid,m.dm);if(!f||f.st!=="f")return;ws.sid="@dm";ws.ch=m.dm;
   out(ws,{t:"hist",sid:"@dm",ch:m.dm,msgs:(db.msgs["@dm/"+pairKey(ws.uid,m.dm)]||[]).slice(-100)})}
  else if(m.t==="open"&&isMember(ws.uid,m.sid)&&chOf(m.sid).text.includes(m.ch)){ws.sid=m.sid;ws.ch=m.ch;out(ws,{t:"hist",sid:m.sid,ch:m.ch,msgs:(db.msgs[m.sid+"/"+m.ch]||[]).slice(-100)})}
  else if(m.t==="msg"&&m.dm&&me.profile){const f=frFind(ws.uid,m.dm);if(!f||f.st!=="f"||now-ws.last<300)return;ws.last=now;
   const text=str(m.text,2000).trim();if(!text)return;const o={id:crypto.randomBytes(5).toString("hex"),uid:ws.uid,text,ts:now};
   const k="@dm/"+pairKey(ws.uid,m.dm),l=db.msgs[k]=db.msgs[k]||[];l.push(o);if(l.length>1000)l.splice(0,l.length-1000);dirty=true;
   wss.clients.forEach(c=>{if(!c.uid)return;const other=c.uid===ws.uid?m.dm:c.uid===m.dm?ws.uid:null;if(other&&c.sid==="@dm"&&c.ch===other)out(c,{t:"msg",sid:"@dm",ch:other,m:o})})}
  else if(m.t==="msg"&&isMember(ws.uid,m.sid)&&me.profile&&chOf(m.sid).text.includes(m.ch)){
   if(now-ws.last<300)return;ws.last=now;const text=str(m.text,2000).trim();if(!text)return;
   const o={id:crypto.randomBytes(5).toString("hex"),uid:ws.uid,text,ts:now};
   const k=m.sid+"/"+m.ch,l=db.msgs[k]=db.msgs[k]||[];l.push(o);if(l.length>1000)l.splice(0,l.length-1000);dirty=true;
   wss.clients.forEach(c=>c.uid&&c.sid===m.sid&&c.ch===m.ch&&out(c,{t:"msg",sid:m.sid,ch:m.ch,m:o}))}
  else if(m.t==="chadd"){const s=db.servers[m.sid];if(!s||s.owner!==ws.uid)return;const type=m.type==="voice"?"voice":"text",n=slug(m.name);
   if(!n)return out(ws,{t:"err",m:"Channel names can use letters and numbers."});
   s.channels=chOf(m.sid);if(s.channels[type].includes(n))return out(ws,{t:"err",m:"That channel already exists."});
   if(s.channels[type].length>=25)return out(ws,{t:"err",m:"That’s the maximum number of channels."});
   s.channels[type].push(n);dirty=true;allMine()}
  else if(m.t==="fadd"){const tu=m.id?byId(m.id):db.users[String(m.user||"").toLowerCase().trim()];
   if(!tu)return out(ws,{t:"finfo",m:"No user found with that username."});
   if(tu.id===ws.uid)return out(ws,{t:"finfo",m:"That’s you!"});
   const ex=frFind(ws.uid,tu.id);
   if(!ex&&tu.profile&&tu.profile.nofr)return out(ws,{t:"finfo",m:"This user isn’t accepting friend requests."});
   if(ex&&ex.st==="f")return out(ws,{t:"finfo",m:"You’re already friends."});
   if(ex&&ex.a===ws.uid)return out(ws,{t:"finfo",m:"Request already sent."});
   if(db.fr.filter(f=>f.a===ws.uid||f.b===ws.uid).length>=200)return out(ws,{t:"finfo",m:"Friend list is full."});
   if(ex)ex.st="f";else db.fr.push({a:ws.uid,b:tu.id,st:"p"});dirty=true;sendFr(ws.uid);sendFr(tu.id);
   out(ws,{t:"finfo",m:ex?"You’re now friends!":"Friend request sent."})}
  else if(m.t==="fresp"){const ex=frFind(ws.uid,m.id);if(!ex||ex.st!=="p")return;
   if(m.ok&&ex.b===ws.uid)ex.st="f";else if(!m.ok)db.fr=db.fr.filter(f=>f!==ex);else return;dirty=true;sendFr(ws.uid);sendFr(m.id)}
  else if(m.t==="fremove"){const ex=frFind(ws.uid,m.id);if(!ex)return;db.fr=db.fr.filter(f=>f!==ex);dirty=true;sendFr(ws.uid);sendFr(m.id)}
  else if(m.t==="react"){const tg=target(ws,m);if(!tg)return;const e=m.e;
   if(typeof e!=="string"||e.length>12||!(/^:[a-z0-9_]{2,16}:$/.test(e)?db.emojis[e.slice(1,-1)]:/\p{Extended_Pictographic}/u.test(e)))return;
   const msg=(db.msgs[tg.key]||[]).find(x=>x.id===m.id);if(!msg)return;msg.rx=msg.rx||{};const a=msg.rx[e]=msg.rx[e]||[];const i=a.indexOf(ws.uid);
   if(i>=0)a.splice(i,1);else if(Object.keys(msg.rx).length<=20)a.push(ws.uid);if(!a.length)delete msg.rx[e];dirty=true;
   tg.each((c,sid,ch)=>out(c,{t:"rx",sid,ch,id:m.id,rx:msg.rx}))}
  else if(m.t==="emadd"){if(!isPro(me))return out(ws,{t:"err",m:"Custom emojis are a Huddle Pro perk."});const n=String(m.name||"");
   if(!/^[a-z0-9_]{2,16}$/.test(n)||!EIMG.test(m.img||"")||m.img.length>14000)return out(ws,{t:"err",m:"That emoji couldn’t be added."});
   const ex=db.emojis[n];if(ex&&ex.by!==ws.uid)return out(ws,{t:"err",m:"That emoji name is taken."});
   if(!ex&&Object.values(db.emojis).filter(x=>x.by===ws.uid).length>=25)return out(ws,{t:"err",m:"You can make up to 25 custom emojis."});
   db.emojis[n]={img:m.img,by:ws.uid};dirty=true;all({t:"emojis",list:db.emojis});out(ws,{t:"finfo",m:"Added :"+n+":"})}
  else if(m.t==="emdel"){const x=db.emojis[m.name];if(!x||(x.by!==ws.uid&&db.admin!==me.name))return;delete db.emojis[m.name];dirty=true;all({t:"emojis",list:db.emojis})}
  else if(m.t==="proset"){if(db.admin!==me.name)return;const u=db.users[String(m.user||"").toLowerCase().trim()];if(!u)return out(ws,{t:"finfo",m:"No user found with that username."});
   u.pro=!!m.on;dirty=true;allPro();out(ws,{t:"finfo",m:(m.on?"Granted Pro to ":"Removed Pro from ")+u.name})}
  else if(m.t==="proall"){if(db.admin!==me.name)return;db.proAll=!!m.on;dirty=true;allPro()}
  else if(m.t==="vc"){ws.vc=(m.sid&&isMember(ws.uid,m.sid)&&chOf(m.sid).voice.includes(m.slug))?m.sid+"."+m.slug:null;all({t:"pres",list:pres()})}
  else if(m.t==="sig"&&ws.vc){wss.clients.forEach(c=>c.uid===m.to&&c.vc===ws.vc&&out(c,{t:"sig",from:ws.uid,k:m.k,d:m.d}))}
 });
 ws.on("close",()=>{if(ws.uid)all({t:"pres",list:pres()})});
};
setInterval(()=>wss.clients.forEach(c=>{if(c.dead)return c.terminate();c.dead=true;c.ping()}),30000);
server.on("upgrade",(req,s,head)=>{const k=req.headers["sec-websocket-key"];
 if(!k||String(req.headers.upgrade).toLowerCase()!=="websocket"){s.destroy();return}
 s.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+crypto.createHash("sha1").update(k+GUID).digest("base64")+"\r\n\r\n");
 const ws=new Sock(s);if(head&&head.length)ws.buf=head;clients.add(ws);onConn(ws);if(ws.buf.length)ws.parse()});
(async()=>{
 if(REMOTE){try{await loadRemote()}catch(e){console.error("Could not load from Upstash:",e.message);process.exit(1)}console.log("Storage: Upstash Redis (accounts survive restarts)")}
 else console.log("Storage: local file. On Render’s free plan this is wiped on restart. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to keep accounts.");
 server.listen(PORT,"0.0.0.0",()=>console.log("Huddle running on port "+PORT))})();
