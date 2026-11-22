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
const HTML=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Huddle</title>
<style>
:root{--bg:#171528;--rail:#0e0d1b;--side:#1e1c36;--panel:#292644;--line:#35325a;--text:#efecff;--mute:#a29ecb;--acc:#ffb84d;--accx:#1a1200;--ok:#5be0a4;--bad:#ff7a7a;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);color-scheme:dark}
*{box-sizing:border-box;margin:0}
html,body{height:100%}
body{background:var(--bg);color:var(--text);font:15px/1.45 "Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
html{scroll-padding-top:env(safe-area-inset-top,0px)}
button,input{font:inherit;color:inherit}
button{cursor:pointer;border:0;background:none}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.hide{display:none!important}
.scr{height:100%;display:grid;place-items:center;padding:16px;overflow:auto;background:radial-gradient(circle at 15% 10%,#3b2a63,transparent 45%),radial-gradient(circle at 90% 95%,#52332b,transparent 40%),var(--bg)}
.card{width:100%;max-width:410px;background:var(--side);border:1px solid var(--line);border-radius:20px;padding:30px}
.logo{display:flex;align-items:center;gap:10px;font-size:28px;font-weight:800;letter-spacing:-.03em;margin-bottom:6px}
.logo i{width:36px;height:36px;border-radius:50% 50% 50% 8px;background:var(--acc)}
.sub{color:var(--mute);margin-bottom:18px}
label{display:block;font-size:13px;color:var(--mute);margin:12px 0 5px}
input{width:100%;padding:11px 12px;border-radius:10px;background:var(--rail);border:1px solid var(--line)}
.sw{display:flex;gap:8px;flex-wrap:wrap}
.sw button{width:34px;height:34px;border-radius:50%;border:3px solid transparent}
.sw button.on{border-color:var(--text)}
.go{width:100%;margin-top:18px;padding:12px;border-radius:10px;background:var(--acc);color:var(--accx);font-weight:700}
.go:hover{filter:brightness(1.08)}
.err{color:var(--bad);font-size:13px;margin-top:10px;min-height:18px}
#app{height:100%;display:flex}
#rail{width:68px;background:var(--rail);display:flex;flex-direction:column;align-items:center;padding:12px 0;flex:none}
.srv{width:46px;height:46px;border-radius:14px;background:var(--acc);color:var(--accx);font-weight:800;display:grid;place-items:center;font-size:20px}
#side{width:248px;background:var(--side);display:flex;flex-direction:column;flex:none}
#side h2{font-size:16px;padding:16px;border-bottom:1px solid var(--line)}
#chs{flex:1;overflow-y:auto;padding:8px}
.chh{font-size:12px;color:var(--mute);padding:12px 8px 4px;font-weight:600}
.ch{display:flex;width:100%;gap:8px;padding:7px 10px;border-radius:8px;color:var(--mute);text-align:left;align-items:center}
.ch:hover{background:var(--panel);color:var(--text)}
.ch.on{background:var(--line);color:var(--text)}
.vm{display:flex;align-items:center;gap:8px;padding:3px 10px 3px 30px;font-size:13px;color:var(--mute)}
.vm .av{width:20px;height:20px;font-size:9px}
#cbar{background:#10241d;border-top:1px solid #1f4a39;padding:10px 12px;display:flex;align-items:center;gap:8px}
#cbar b{color:var(--ok);font-size:13px;display:block}#cbar small{color:var(--mute);font-size:12px}
#cbar div:first-child{flex:1;min-width:0}
.ib{width:34px;height:34px;border-radius:8px;background:var(--panel);display:grid;place-items:center;font-size:16px}
.ib:hover{background:var(--line)}.ib.red{background:#5b2328}.ib.on{background:var(--bad);color:#2a0a0a}
.me{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--rail)}
.me b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.me small{color:var(--ok);font-size:12px}
.me>div:nth-child(2){min-width:0;flex:1}
.av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#12101f;flex:none;font-size:14px}
#main{flex:1;display:flex;flex-direction:column;min-width:0}
#top{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);font-weight:700}
#menu{display:none;font-size:20px;padding:0 6px}
#body{flex:1;display:flex;min-height:0}
#chat{flex:1;display:flex;flex-direction:column;min-width:0}
#msgs{flex:1;overflow-y:auto;padding:12px 16px}
.m{display:flex;gap:12px;padding:3px 0}
.m.g{margin-top:14px}
.m .sp{width:38px;flex:none}
.t{font-weight:700}.t small{color:var(--mute);font-weight:400;margin-left:8px;font-size:12px}
.m p{overflow-wrap:anywhere;white-space:pre-wrap}
.empty{color:var(--mute);text-align:center;margin-top:48px}
#form{display:flex;gap:8px;padding:12px 16px}
#form input{background:var(--panel);padding:13px 14px}
#form button{padding:0 20px;border-radius:10px;background:var(--acc);color:var(--accx);font-weight:700}
#mem{width:210px;background:var(--side);padding:8px 10px;overflow-y:auto;flex:none}
.mm{display:flex;align-items:center;gap:10px;padding:5px;border-radius:8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.mm .av{width:30px;height:30px;font-size:12px}
.mm.off{opacity:.4}
#voice{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:20px;text-align:center}
#tiles{display:flex;flex-wrap:wrap;gap:14px;justify-content:center}
.tile{width:130px;padding:18px 8px;border-radius:16px;background:var(--panel);display:flex;flex-direction:column;align-items:center;gap:8px;border:2px solid transparent}
.tile.me{border-color:var(--acc)}.tile.speak{border-color:var(--ok);box-shadow:0 0 0 3px #5be0a455}.tile small{color:var(--mute);font-size:12px}
.tile .av{width:60px;height:60px;font-size:22px}
#toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--panel);border:1px solid var(--line);padding:10px 16px;border-radius:10px;z-index:9;max-width:90%}
@media(max-width:820px){#mem{display:none}}
@media(max-width:640px){
 #side{position:fixed;left:68px;top:0;bottom:0;z-index:5;transform:translateX(-130%);transition:transform .2s;padding-top:env(safe-area-inset-top,0px);box-shadow:8px 0 30px #0008}
 #side.open{transform:none}#menu{display:block}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}

#rail{gap:10px;overflow-y:auto}
.sv{width:46px;height:46px;border-radius:50%;background:var(--panel);color:var(--text);font-weight:800;display:grid;place-items:center;flex:none;transition:border-radius .15s,background .15s}
.sv:hover,.sv.on{border-radius:14px;background:var(--acc);color:var(--accx)}.sv.add{color:var(--ok);font-size:22px}.sv.add:hover{background:var(--ok);color:#06251a}
#sh{padding:14px 16px;border-bottom:1px solid var(--line)}#sh h2{padding:0;border:0;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{padding:5px 11px;border-radius:999px;background:var(--panel);font-size:12px;margin-right:6px}.pill:hover{background:var(--line)}
#nos{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center}#nos .go{max-width:260px;margin:0}
#modal{position:fixed;inset:0;background:#000a;display:grid;place-items:center;padding:16px;z-index:8}
#modal .card{max-width:380px;position:relative}#modal h3{margin-bottom:4px}#modal .x{position:absolute;top:12px;right:14px;font-size:20px;color:var(--mute)}
#modal hr{border:0;border-top:1px solid var(--line);margin:22px 0 6px}

@keyframes gradMove{from{background-position:0% 50%}to{background-position:100% 50%}}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{transform:scale(1.1)}}@keyframes float{50%{transform:translateY(-4px)}}
@keyframes glow{50%{box-shadow:0 0 14px 4px var(--c1)}}@keyframes wiggle{25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}@keyframes rainbow{to{filter:hue-rotate(360deg)}}
@keyframes stripes{to{background-position:60px 0}}@keyframes dots{to{background-position:22px 22px,0 0}}
.av{position:relative;border-radius:var(--r,50%);background:none}
.av .in{position:relative;z-index:1;width:100%;height:100%;border-radius:var(--r,50%);display:grid;place-items:center;overflow:hidden;font-weight:700}
.av .in img{width:100%;height:100%;object-fit:cover}
.bg-solid{background:var(--c1)}.bg-grad{background:linear-gradient(135deg,var(--c1),var(--c2))}
.bg-aurora{background:linear-gradient(120deg,var(--c1),var(--c2),var(--c1),var(--c2));background-size:300% 300%;animation:gradMove 5s ease-in-out infinite alternate}
.an-pulse{animation:pulse 1.6s ease-in-out infinite}.an-float{animation:float 2.4s ease-in-out infinite}.an-glow{animation:glow 2s ease-in-out infinite}
.an-wiggle{animation:wiggle 1.2s ease-in-out infinite}.an-rainbow{animation:rainbow 4s linear infinite}
.an-ring::before{content:"";position:absolute;inset:-3px;border-radius:var(--r,50%);background:conic-gradient(var(--c1),var(--c2),var(--c1));animation:spin 3s linear infinite;z-index:0}
.mm{padding:6px 8px}
.nm{color:var(--n1);font-weight:700}
.nfx-grad{background:linear-gradient(90deg,var(--n1),var(--n2),var(--n1));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:gradMove 3s linear infinite alternate}
.nfx-glow{text-shadow:0 0 10px var(--n1)}.nfx-rainbow{animation:rainbow 4s linear infinite}
.ff-mono{font-family:ui-monospace,Menlo,Consolas,monospace}.ff-serif{font-family:Georgia,"Times New Roman",serif}.ff-fun{font-family:"Trebuchet MS",ui-rounded,system-ui,sans-serif;font-style:italic}
.pc{--pcbg:var(--rail);background:var(--pcbg);border-radius:16px;overflow:hidden;border:1px solid var(--line)}
.bn{height:84px;background-size:300% 300%;animation:gradMove var(--sp,8s) ease-in-out infinite alternate}
.bn-grad{background:linear-gradient(110deg,var(--c1),var(--c2),var(--c3),var(--c1));background-size:300% 300%}
.bn-aurora{background:radial-gradient(circle at 20% 30%,var(--c1),transparent 55%),radial-gradient(circle at 80% 20%,var(--c2),transparent 55%),radial-gradient(circle at 50% 100%,var(--c3),transparent 60%),#0e0d1b;background-size:200% 200%}
.bn-stripes{background:linear-gradient(90deg,var(--c1) 33%,var(--c2) 33% 66%,var(--c3) 66%);background-size:60px 100%;animation:stripes var(--sp,8s) linear infinite}
.bn-dots{background:radial-gradient(var(--c3) 2.5px,transparent 3px) 0 0/22px 22px,linear-gradient(120deg,var(--c1),var(--c2));animation:dots var(--sp,8s) linear infinite}
.pbody{padding:0 16px 16px}.pav{margin-top:-47px;display:inline-block}.pav .av{width:94px;height:94px;font-size:34px;border:5px solid var(--pcbg)}
.pnm{font-size:20px;margin-top:6px}.pnm small{color:var(--mute);font-weight:400;font-size:13px;margin-left:6px}.pst{color:var(--ok);font-size:14px}.pbio{color:var(--mute);margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere}
.card.wide{max-width:460px}
.tabs{display:flex;gap:6px;margin:14px 0 2px;overflow-x:auto}.tab{padding:7px 13px;border-radius:999px;background:var(--panel);font-size:13px;flex:none}.tab.on{background:var(--acc);color:var(--accx);font-weight:700}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:6px 11px;border-radius:999px;background:var(--panel);border:1px solid var(--line);font-size:13px}.chip.on{background:var(--acc);color:var(--accx);border-color:var(--acc);font-weight:600}
.row2{display:flex;gap:12px}.row2>div{flex:1}
input[type=color]{padding:2px;height:40px;cursor:pointer}input[type=range]{padding:0;accent-color:var(--acc)}
textarea{width:100%;padding:11px 12px;border-radius:10px;background:var(--rail);border:1px solid var(--line);resize:none;font:inherit;color:inherit}
.nav{display:flex;gap:10px;margin-top:16px;align-items:center}.nav .go{margin:0;flex:1}.nav .pill{margin:0;padding:10px 16px}
#modal,#ucard{position:fixed;inset:0;background:#000a;display:grid;place-items:center;padding:16px;z-index:8}
#ucard .pc{--pcbg:var(--side);width:100%;max-width:340px}#ucard .go{margin:0 16px 16px;width:calc(100% - 32px)}
@media(prefers-reduced-motion:reduce){*,*::before{animation:none!important}}

.dc{position:absolute;pointer-events:none;z-index:3;font-style:normal}
.dc-crown{top:-.95em;left:50%;transform:translateX(-50%) rotate(-8deg)}.dc-crown::before{content:"👑";font-size:1.15em}
.dc-halo{top:-.5em;left:50%;width:1.7em;height:.5em;transform:translateX(-50%);border:.16em solid #ffe27a;border-radius:50%;box-shadow:0 0 .5em #ffe27a}
.dc-sparkle::before{content:"✨";position:absolute;right:-.7em;top:-.5em;animation:pulse 1.4s ease-in-out infinite}.dc-sparkle::after{content:"✨";position:absolute;left:-.7em;bottom:-.4em;animation:pulse 1.9s ease-in-out infinite}
.dc-ears::before,.dc-ears::after{content:"";position:absolute;top:-.5em;border-left:.5em solid transparent;border-right:.5em solid transparent;border-bottom:.9em solid var(--c1)}.dc-ears::before{left:-.1em;transform:rotate(-18deg)}.dc-ears::after{right:-.1em;transform:rotate(18deg)}
.dc-orbit{inset:-.5em;border-radius:50%;animation:spin 3s linear infinite}.dc-orbit::before{content:"⭐";position:absolute;top:-.3em;left:50%;font-size:.9em}
.dot{position:absolute;right:-2px;bottom:-2px;width:28%;height:28%;min-width:9px;min-height:9px;border-radius:50%;border:2px solid var(--pcbg,var(--side));z-index:4}
.s-online{background:#5be0a4}.s-idle{background:#ffb84d}.s-dnd{background:#ff7a7a}
.tg{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;background:color-mix(in srgb,var(--n1) 25%,transparent);color:var(--n1);font-size:.72em;font-weight:700;letter-spacing:.03em;vertical-align:middle}
.bdgs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.bdgs span{background:var(--panel);border-radius:8px;padding:2px 6px;font-size:15px}
.pun{color:var(--mute);font-size:13px}.psn{margin-top:10px;font-size:13px;color:var(--mute)}.psn b{color:var(--text)}
.bn-img{background-size:cover;background-position:center;animation:none}
.pt-tint{background:linear-gradient(180deg,color-mix(in srgb,var(--c1) 35%,#16142b),#16142b 75%);--pcbg:#1d1a36}
.pt-neon{box-shadow:0 0 0 2px var(--c1),0 0 24px color-mix(in srgb,var(--c2) 60%,transparent)}
.tpl{display:flex;align-items:center;gap:12px;width:100%;padding:12px;border-radius:10px;background:var(--panel);margin-bottom:8px;text-align:left;font-weight:600}.tpl span{font-size:22px}.tpl i{margin-left:auto;color:var(--mute);font-style:normal}.tpl:hover{background:var(--line)}
.jn{margin-top:14px;text-align:center}.jn .go{margin-top:8px}.back{position:absolute;top:12px;left:14px;font-size:20px;color:var(--mute)}
.upl{display:grid;place-items:center;cursor:pointer;margin:14px 0 4px}.upc{width:84px;height:84px;border-radius:50%;border:2px dashed var(--mute);display:grid;place-items:center;font-size:24px;overflow:hidden;text-align:center;line-height:1.1}.upc small{font-size:11px;display:block}.upc img{width:100%;height:100%;object-fit:cover}
#modal .card{max-height:92vh;overflow:auto;text-align:left}#modal h3{text-align:center;margin-top:8px}#modal .sub{text-align:center}#modal .chh{padding:10px 2px 6px}
.sv.home{font-size:22px}.rsep{width:30px;height:2px;background:var(--line);flex:none}.sv img{width:100%;height:100%;object-fit:cover;border-radius:inherit}.sv{overflow:hidden}
#fr{flex:1;overflow-y:auto;padding:16px}.frt{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}.frr{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border-radius:12px;background:var(--side);margin-bottom:8px}
.frl{display:flex;align-items:center;gap:12px;min-width:0;cursor:pointer}.frl small{color:var(--mute)}.fra{display:flex;gap:6px;align-items:center}.frf{background:var(--side);padding:16px;border-radius:12px}
.cta{background:var(--panel);border-radius:14px;padding:16px;margin-bottom:14px;text-align:center}.cta .go{margin:10px auto 0;max-width:240px}
.ch .av{width:28px;height:28px;font-size:11px}.addch{margin-left:auto;font-size:18px;color:var(--mute)}.chh{display:flex;align-items:center}
.bdg2{margin-left:auto;background:var(--bad);color:#2a0a0a;border-radius:999px;padding:0 7px;font-size:12px;font-weight:700}
#acf{display:flex;gap:6px;padding:4px 8px}#acf .pill{margin:0}
.mm .nm{display:inline-block;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}.mm{overflow:visible}

.m{position:relative}.m.sel{background:#ffffff0d;border-radius:8px}
.qr{position:absolute;right:6px;top:-20px;display:flex;gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:2px 4px;z-index:5}.qr button{font-size:18px;padding:2px 4px;border-radius:6px}.qr button:hover{background:var(--line)}
.rxs{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.rx{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:8px;background:var(--panel);border:1px solid var(--line);font-size:13px}.rx.on{border-color:var(--acc);background:#ffb84d22}
.ce{height:1.35em;width:1.35em;vertical-align:-.3em;object-fit:contain}.jb{font-size:2.2em;line-height:1.25;display:block}.jb .ce{height:1.2em;width:1.2em}
#epk{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(72px + env(safe-area-inset-bottom,0px));width:min(380px,94vw);height:330px;background:var(--side);border:1px solid var(--line);border-radius:14px;z-index:7;display:flex;flex-direction:column;box-shadow:0 10px 40px #0009}
.ept{display:flex;gap:4px;padding:6px;overflow-x:auto;border-bottom:1px solid var(--line);align-items:center}.ept .tab{padding:5px 9px;font-size:18px}
.epg{flex:1;overflow-y:auto;padding:8px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;align-content:start}.epg button{font-size:22px;padding:3px;border-radius:8px}.epg button:hover{background:var(--line)}
.epc{flex:1;overflow-y:auto;padding:10px}.epc .row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.epc .row button{padding:4px;border-radius:8px;background:var(--panel)}.ceadd{display:flex;gap:8px;align-items:center}.ceadd input{flex:1}
#form #emb{margin:0;padding:0;width:44px;height:auto;background:var(--panel);color:var(--text);border-radius:10px;font-weight:400}
.tg.pro{background:linear-gradient(90deg,#ffb84d,#ff6b9d);color:#1a1200}
.perks{padding-left:20px;color:var(--mute);display:grid;gap:5px;font-size:14px;margin:12px 0}
#promodal{position:fixed;inset:0;background:#000a;display:grid;place-items:center;padding:16px;z-index:8}#promodal .card{position:relative;max-height:92vh;overflow:auto}#promodal h3{text-align:center}#promodal .x{position:absolute;top:12px;right:14px;font-size:20px;color:var(--mute)}#promodal .sub{text-align:center}
.chip.lock{opacity:.85}

@keyframes floaty{0%{opacity:0;transform:translateY(.6em)}40%{opacity:1}100%{opacity:0;transform:translateY(-1.3em)}}
@keyframes neonp{50%{box-shadow:0 0 .3em #ff4fd8,0 0 .6em #ff4fd8 inset;filter:hue-rotate(60deg)}}
@keyframes glitchk{0%,100%{transform:translate(0)}25%{transform:translate(-.1em,.05em)}50%{transform:translate(.1em,-.05em)}75%{transform:translate(.05em,.1em)}}
@keyframes fall{to{background-position:0 60px,0 37px}}@keyframes twink{50%{opacity:.35}}@keyframes rainf{to{background-position:0 40px,0 55px}}@keyframes conf{to{background-position:0 48px,20px 74px,35px 82px}}
.dc-horns::before,.dc-horns::after{content:"";position:absolute;top:-.55em;border-left:.3em solid transparent;border-right:.3em solid transparent;border-bottom:.95em solid #e0314b}.dc-horns::before{left:.05em;transform:rotate(-22deg)}.dc-horns::after{right:.05em;transform:rotate(22deg)}
.dc-flame{inset:-.35em;border-radius:50%;background:conic-gradient(#ff3d00,#ffb300,#ff3d00,#ffb300,#ff3d00);filter:blur(.12em);animation:spin 1.6s linear infinite;z-index:0}
.dc-frost{inset:-.3em;border-radius:50%;border:.12em solid #cfefff;box-shadow:0 0 .6em #8fdcff,inset 0 0 .3em #8fdcff;animation:pulse 2.4s ease-in-out infinite;z-index:0}.dc-frost::before{content:"❄️";position:absolute;right:-.45em;top:-.45em;font-size:.9em}
.dc-neon{inset:-.25em;border-radius:50%;border:.14em solid #ff4fd8;box-shadow:0 0 .6em #ff4fd8,0 0 1.2em #ff4fd8 inset;animation:neonp 1.8s ease-in-out infinite;z-index:0}
.dc-hearts::before{content:"❤️";position:absolute;right:-.5em;top:0;animation:floaty 2.2s ease-in infinite}.dc-hearts::after{content:"💗";position:absolute;left:-.5em;top:.2em;animation:floaty 2.9s ease-in infinite .6s}
.dc-glitch{inset:0;border-radius:var(--r,50%);box-shadow:-.12em 0 #ff2d6f,.12em 0 #2df6ff;animation:glitchk 1s steps(2,end) infinite;z-index:0}
.pc{position:relative}.pc[class*="fx-"]::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:2}
.fx-snow::after{background:radial-gradient(#fff 1.5px,transparent 2px) 0 0/60px 60px,radial-gradient(#fff 1px,transparent 1.5px) 15px 10px/37px 37px;animation:fall 6s linear infinite}
.fx-stars::after{background:radial-gradient(#fff 1px,transparent 1.6px) 0 0/45px 45px,radial-gradient(#ffe9a8 1.2px,transparent 1.8px) 20px 25px/70px 70px;animation:twink 2s ease-in-out infinite}
.fx-rain::after{background:linear-gradient(transparent 0 55%,#8fcfffaa 55%) 0 0/14px 40px,linear-gradient(transparent 0 60%,#8fcfff88 60%) 6px 0/23px 55px;animation:rainf .8s linear infinite}
.fx-confetti::after{background:radial-gradient(#ff6b9d 2.5px,transparent 3px) 0 0/48px 48px,radial-gradient(#ffb84d 2.5px,transparent 3px) 20px 10px/64px 64px,radial-gradient(#7ad7f0 2.5px,transparent 3px) 35px 30px/52px 52px;animation:conf 5s linear infinite}
#set{position:fixed;inset:0;background:var(--bg);z-index:9;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
.sbar{display:flex;align-items:center;gap:14px;padding:14px 16px;font-size:18px}.sbar button{font-size:22px;color:var(--text)}
#setc{flex:1;overflow-y:auto;padding:0 16px 24px;max-width:640px;width:100%;margin:0 auto}
.sgrp{color:var(--mute);font-size:14px;margin:18px 0 8px}.slist{background:var(--side);border-radius:14px;overflow:hidden}
.srow{display:flex;align-items:center;gap:14px;width:100%;padding:14px;text-align:left;border-bottom:1px solid var(--line)}.srow:last-child{border-bottom:0}.srow .si{width:26px;text-align:center}.srow i{margin-left:auto;color:var(--mute);font-style:normal}.srow:hover{background:var(--panel)}
.sbox{background:var(--side);border-radius:14px;padding:14px;margin-bottom:12px}.sbox label:first-child{margin-top:0}
.orbs{display:inline-flex;gap:6px;align-items:center;background:var(--panel);border-radius:10px;padding:6px 12px;font-weight:700}
.shopg{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.sc{background:var(--side);border-radius:14px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.sc .pv{height:84px;display:grid;place-items:center;width:100%}.sc .pv .av{width:56px;height:56px;font-size:20px}.sc .pc{width:100%;height:70px}.sc .pc .bn{height:100%}
.sc b{font-size:14px}.sc .pr{color:var(--mute);font-size:13px}.sc .go{margin:0;padding:8px;font-size:14px}.sc .go[disabled]{opacity:.5}
.qrow{background:var(--side);border-radius:14px;padding:14px;margin-bottom:10px}.qrow .bar{height:8px;border-radius:99px;background:var(--panel);margin:10px 0;overflow:hidden}.qrow .bar i{display:block;height:100%;background:var(--acc)}
.qrow .top{display:flex;justify-content:space-between;gap:10px;align-items:center}.qrow .go{margin:0;max-width:120px;padding:8px}
#ctx{display:flex;align-items:center;gap:10px;padding:8px 16px;background:var(--panel);font-size:13px;color:var(--mute)}#ctx span{flex:1}#ctx .ib{width:28px;height:28px}
.rep{font-size:12.5px;color:var(--mute);margin-bottom:2px;cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:100%}.rep span{opacity:.8}
.mimg{max-width:min(320px,100%);max-height:300px;border-radius:12px;margin-top:4px;display:block;cursor:zoom-in}.mimg.sm{height:40px;width:auto;margin:0;border-radius:6px;cursor:default}.ed{color:var(--mute);font-size:11px}
#lb{position:fixed;inset:0;background:#000d;z-index:10;display:grid;place-items:center;padding:16px}#lb img{max-width:100%;max-height:100%;border-radius:10px}
#form #att{margin:0;padding:0;width:44px;height:auto;background:var(--panel);color:var(--text);border-radius:10px;font-weight:400}
#top #srch{margin-left:auto;background:var(--panel);border-radius:8px;width:34px;height:34px}#top #sq{max-width:160px;padding:7px 10px}
body.compact .m{padding:1px 0}body.compact .m.g{margin-top:8px}body.compact .m .av{width:30px;height:30px;font-size:12px}body.compact .m .sp{width:30px}
body.rm *,body.rm *::before,body.rm *::after{animation:none!important}
#note{margin-top:0}.pbody.nt{padding-top:0}
</style>
</head>
<body>

<div id="load" class="scr"><p class="sub">Connecting…</p></div>

<div id="auth" class="scr hide"><div class="card">
 <div class="logo"><i></i>Huddle</div>
 <p class="sub" id="asub">Welcome back. Log in to join your community.</p>
 <form id="af" novalidate><label for="un">Username</label><input id="un" autocomplete="username" maxlength="20" autocapitalize="none">
  <label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password">
  <div class="err" id="aerr" role="alert"></div><button class="go" id="abtn">Log in</button></form>
 <p class="swap"><span id="swt">New to Huddle?</span> <button id="swb" type="button">Create an account</button></p>
</div></div>

<div id="onb" class="scr hide"><form class="card wide" id="of">
 <div class="logo"><i></i>Huddle</div><p class="sub" id="osub" style="margin-bottom:14px"></p>
 <div id="pv" class="pc"></div><div class="tabs" id="tabs"></div><div id="sb"></div>
 <div class="err" id="oerr" role="alert"></div>
 <div class="nav"><button type="button" class="pill hide" id="cancel">Cancel</button><button type="button" class="pill" id="back">Back</button><button class="go" id="obtn">Next</button></div>
</form></div>

<div id="app" class="hide">
 <nav id="rail" aria-label="Servers"></nav>
 <aside id="side"><div id="sh"><h2 id="sname"></h2><button class="pill" id="inv"></button><button class="pill" id="lv"></button></div><div id="chs"></div>
  <div id="cbar" class="hide"><div><b>Voice connected</b><small id="cname"></small></div><button class="ib" id="mute" title="Mute" aria-label="Mute">🎤</button><button class="ib red" id="hang" title="Leave call" aria-label="Leave call">📞</button></div>
  <div class="me"><div id="mavw" style="flex:none"></div><div><b id="mn"></b><small id="ms">Online</small></div><button class="ib" id="edit" title="Edit profile" aria-label="Edit profile">⚙</button><button class="ib" id="probtn" title="Huddle Pro" aria-label="Huddle Pro">✨</button><button class="ib" id="logout" title="Log out" aria-label="Log out">⎋</button></div>
 </aside>
 <section id="main">
  <header id="top"><button id="menu" aria-label="Channels">☰</button><span id="cn"></span><input id="sq" class="hide" placeholder="Search this channel" aria-label="Search messages"><button class="ib" id="srch" aria-label="Search messages" title="Search">🔍</button></header>
  <div id="body">
   <div id="chat"><div id="msgs" aria-live="polite"></div>
    <div id="ctx" class="hide"></div><form id="form"><button type="button" class="ib" id="att" aria-label="Attach image" title="Attach image">📎</button><input type="file" id="attf" accept="image/*" hidden><button type="button" class="ib" id="emb" aria-label="Emoji" title="Emoji">😀</button><input id="in" autocomplete="off" aria-label="Message"><button>Send</button></form></div>
   <div id="voice" class="hide"><div id="tiles"></div><button class="go" id="join" style="max-width:240px">Join voice</button></div>
   <div id="fr" class="hide"></div>
   <aside id="mem"></aside>
  </div>
 </section>
</div>
<div id="modal" class="hide"><div class="card wide" id="cw"></div></div>
<div id="ucard" class="hide"><div id="ucardc" class="pc"></div></div>
<div id="promodal" class="hide"><div class="card wide" id="proc"></div></div>
<div id="epk" class="hide"></div>
<div id="set" class="hide"><div class="sbar"><button id="sx" aria-label="Back">←</button><b id="sett">Settings</b></div><div id="setc"></div></div>
<div id="lb" class="hide"></div>
<div id="toast" class="hide" role="status"></div>

<script>
const ICE=__ICE__;
const COL=["#ffb84d","#7ad7f0","#f58fb0","#b9a3ff","#5be0a4","#ff9f7a","#e8e36b","#8fa8ff"];
const $=id=>document.getElementById(id);
const esc=t=>String(t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ini=n=>(n||"?").trim().slice(0,2).toUpperCase();
const rnd=(n,al)=>Array.from({length:n},()=>al[Math.floor(Math.random()*al.length)]).join("");
let onbOpen=false,draft=null,step=0,ws,uid=null,me={},profiles={},servers={},online={},msgs=[],cur=null,curS=null,unsub=null,entered=false,editing=false,color=COL[0],call=null,pres={},confirmT=0,mode="login";
const micErr=e=>toast(e&&e.name==="NotFoundError"?"No microphone found on this device.":window.top!==window?"This page is running inside another app, which blocks the microphone. Open the link in your phone’s browser (Chrome) instead.":"Microphone blocked. Tap the lock icon by the address, allow Microphone, then try again.");
function show(id){["load","auth","onb","app"].forEach(x=>$(x).classList.toggle("hide",x!==id))}
function toast(t){const e=$("toast");e.textContent=t;e.classList.remove("hide");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add("hide"),7000)}
const ANIMS=["none","pulse","float","glow","ring","wiggle","rainbow"],SH={c:"50%",r:"28%",s:"10px"};
const PAL=[["#ffb84d","#ff6b9d","#7ad7f0"],["#b9a3ff","#5be0a4","#7ad7f0"],["#f58fb0","#ffb84d","#8fa8ff"],["#5be0a4","#7ad7f0","#b9a3ff"],["#ff9f7a","#e8e36b","#f58fb0"]];
const EMO=["😎","🔥","🐱","👾","🌸","🚀","🦊","🎧","⭐","🍕"];
const pick=l=>l[Math.floor(Math.random()*l.length)];
const hx=(c,d)=>/^#[0-9a-f]{6}$/i.test(c||"")?c:d,en=(v,l,d)=>l.includes(v)?v:d;
const lum=c=>{const n=parseInt(c.slice(1),16);return(.299*(n>>16)+.587*(n>>8&255)+.114*(n&255))/255};
const DEF={name:"Someone",color:"#ffb84d",pr:"",status:"",bio:"",tag:"",badges:[],stat:"online",pt:"none",fx:"none",nofr:0,av:{t:"ini",e:"😎",img:"",bg:"grad",c1:"#ffb84d",c2:"#ff6b9d",an:"none",sh:"c",dc:"none"},bn:{t:"grad",c1:"#ffb84d",c2:"#b9a3ff",c3:"#7ad7f0",sp:8,img:""},nm:{fx:"none",ff:"def"}};
const BADGES=["🎮","🔥","💎","⭐","🚀","🎨","🎧","👑","🧠","🌙","🍕","🦊"];
const IMG=/^data:image\\/jpeg;base64,[A-Za-z0-9+\\/=]+$/;
const isOn=u=>online[u]&&P(u).stat!=="invisible";
const norm=p=>{p=p||{};return{...DEF,...p,av:{...DEF.av,c1:p.color||DEF.av.c1,...(p.av||{})},bn:{...DEF.bn,...(p.bn||{})},nm:{...DEF.nm,...(p.nm||{})}}};
const P=id=>norm(profiles[id]||{name:"Someone",color:"#888"});
function avFrom(p,id,dot){p=norm(p);const a=p.av,c1=hx(a.c1,"#ffb84d"),c2=hx(a.c2,"#ff6b9d");
 const bg=en(a.bg,["solid","grad","aurora"],"grad"),an=en(a.an,ANIMS,"none"),t=en(a.t,["ini","emo","img"],"ini"),r=SH[en(a.sh,Object.keys(SH),"c")],dc=en(a.dc,["none","crown","halo","sparkle","ears","orbit","horns","flame","frost","neon","hearts","glitch"],"none");
 let inner,img=false;
 if(t==="img"&&IMG.test(a.img||"")){inner=\`<img src="\${a.img}" alt="">\`;img=true}
 else if(t==="emo"&&a.e)inner=esc(String(a.e).slice(0,8));else inner=esc(ini(p.name));
 const st=en(p.stat,["online","idle","dnd","invisible"],"online");
 return \`<div class="av an-\${an}" style="--c1:\${c1};--c2:\${c2};--r:\${r}"\${id?\` data-u="\${esc(id)}"\`:""}><span class="in\${img?"":" bg-"+bg}" style="color:\${lum(c1)>.55?"#12101f":"#fff"}">\${inner}</span>\${dc!=="none"?\`<i class="dc dc-\${dc}"></i>\`:""}\${dot&&id&&isOn(id)?\`<b class="dot s-\${st==="invisible"?"online":st}"></b>\`:""}</div>\`}
const av=(id,d)=>avFrom(profiles[id]||{name:"Someone",color:"#888"},id,d);
function nameFrom(p,id){p=norm(p);const fx=en(p.nm.fx,["none","grad","glow","rainbow"],"none"),ff=en(p.nm.ff,["def","mono","serif","fun"],"def");
 const tg=String(p.tag||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase().slice(0,4),n1=hx(p.color,"#ffb84d");
 return \`<span class="nm nfx-\${fx} ff-\${ff}" style="--n1:\${n1};--n2:\${hx(p.av.c2,"#ff6b9d")}"\${id?\` data-u="\${esc(id)}"\`:""}>\${esc(p.name)}</span>\${tg?\`<span class="tg" style="--n1:\${n1}">\${tg}</span>\`:""}\${p.pro?'<span class="tg pro" title="Huddle Pro">PRO</span>':""}\`}
const nameHTML=id=>nameFrom(profiles[id]||{name:"Someone",color:"#888"},id);
function bnFrom(p){p=norm(p);const b=p.bn,t=en(b.t,["grad","aurora","stripes","dots","img"],"grad");const im=t==="img"&&IMG.test(b.img||"")?\`background-image:url('\${b.img}');\`:"";
 return \`<div class="bn bn-\${t}" style="\${im}--c1:\${hx(b.c1,"#ffb84d")};--c2:\${hx(b.c2,"#b9a3ff")};--c3:\${hx(b.c3,"#7ad7f0")};--sp:\${Math.min(20,Math.max(2,+b.sp||8))}s"></div>\`}
function cardHTML(p,id){p=norm(p);const bd=(p.badges||[]).filter(x=>BADGES.includes(x));
 return bnFrom(p)+\`<div class="pbody"><div class="pav">\${avFrom(p,id,1)}</div><div class="pnm">\${nameFrom(p)}\${p.pr?\`<small>\${esc(p.pr)}</small>\`:""}</div>\${p.un?\`<div class="pun">@\${esc(p.un)}</div>\`:""}\${p.status?\`<div class="pst">\${esc(p.status)}</div>\`:""}\${bd.length?\`<div class="bdgs">\${bd.map(x=>\`<span>\${x}</span>\`).join("")}</div>\`:""}\${p.bio?\`<p class="pbio">\${esc(p.bio)}</p>\`:""}\${p.since?\`<div class="psn"><b>Member since</b><br>\${new Date(p.since).toLocaleDateString([],{year:"numeric",month:"short",day:"numeric"})}</div>\`:""}</div>\`}
function setCard(el,p,id){p=norm(p);el.className="pc pt-"+en(p.pt,["none","tint","neon"],"none")+" fx-"+en(p.fx,["none","snow","stars","rain","confetti"],"none");el.style.cssText=\`--c1:\${hx(p.bn.c1,"#ffb84d")};--c2:\${hx(p.bn.c2,"#b9a3ff")}\`;el.innerHTML=cardHTML(p,id)}

const mine=()=>Object.keys(servers).sort((a,b)=>servers[a].ts-servers[b].ts);
const memb=s=>servers[s]?servers[s].members:[];
const S=()=>servers[curS];

const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
const send=o=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))};
function connect(){
 ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
 ws.onopen=()=>{const t=ls.get("huddle_token");if(t)send({t:"token",token:t});else show("auth")};
 ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}handle(m)};
 ws.onclose=()=>{hangup();if(entered)toast("Disconnected. Reconnecting…");else if(!uid)show("load");setTimeout(connect,2000)}}
function handle(m){
 if(m.t==="authok"){uid=m.uid;ls.set("huddle_token",m.token);if(entered&&cur&&cur.t!=="v")send(cur.t==="d"?{t:"open",dm:cur.c}:{t:"open",sid:curS,ch:cur.c})}
 else if(m.t==="autherr"){if(m.bad){ls.del("huddle_token");show("auth")}else $("aerr").textContent=m.m}
 else if(m.t==="profiles"){profiles=m.list;
  if(!entered&&!editing&&!onbOpen){profiles[uid]?enter():startOnb(false)}
  else if(entered){self();members();render();side();renderRail()}}
 else if(m.t==="mine"){servers=m.servers;if(entered)refreshServers()}
 else if(m.t==="pres"){pres=m.list;online={};Object.keys(pres).forEach(u=>online[u]=1);members();side();if(home&&!cur)frPanel();if(call)syncCall();voiceUi()}
 else if(m.t==="friends"){friends=m.list;if(entered){renderRail();side();if(home&&!cur)frPanel()}}
 else if(m.t==="pro"){pro=m;if(!$("promodal").classList.contains("hide"))drawPro()}
 else if(m.t==="emojis"){customEm={};Object.keys(m.list).forEach(n=>{if(EIMG.test(m.list[n].img))customEm[n]=m.list[n]});if(!$("epk").classList.contains("hide"))drawPicker();render()}
 else if(m.t==="rx"){const x=msgs.find(q=>q.id===m.id);if(x&&cur&&cur.t!=="v"){x.rx=m.rx;render()}}
 else if(m.t==="finfo"){toast(m.m);const e=$("fmsg");if(e)e.textContent=m.m}
 else if(m.t==="hist"){if(cur&&cur.t!=="v"&&m.sid===(cur.t==="d"?"@dm":curS)&&cur.c===m.ch){msgs=m.msgs;render()}}
 else if(m.t==="msg"){if(cur&&cur.t!=="v"&&m.sid===(cur.t==="d"?"@dm":curS)&&cur.c===m.ch){msgs.push(m.m);render()}}
 else if(m.t==="joined"){if(servers[m.sid]){closeCreate();switchS(m.sid)}}
 else if(m.t==="err"){toast(m.m);const e=$("merr");if(e)e.textContent=m.m}
 else if(m.t==="sig")onSig(m)}
$("swb").onclick=()=>{mode=mode==="login"?"signup":"login";const s=mode==="signup";
 $("abtn").textContent=s?"Create account":"Log in";$("swt").textContent=s?"Already have an account?":"New to Huddle?";$("swb").textContent=s?"Log in":"Create an account";
 $("asub").textContent=s?"Create your account and start chatting.":"Welcome back. Log in to join your community.";$("aerr").textContent="";$("pw").autocomplete=s?"new-password":"current-password"};
$("af").onsubmit=e=>{e.preventDefault();$("aerr").textContent="";send({t:mode,user:$("un").value,pass:$("pw").value})};
$("logout").onclick=()=>{ls.del("huddle_token");location.reload()};
const STEPS=["Basics","Avatar","Banner","Style"];
const gp=(o,k)=>k.split(".").reduce((a,x)=>a&&a[x],o);
const setp=(o,k,v)=>{const p=k.split("."),l=p.pop();p.reduce((a,x)=>a[x],o)[l]=v};
function randomize(d){const pl=pick(PAL);d.color=pl[0];d.av.c1=pl[0];d.av.c2=pl[1];d.av.bg=pick(["grad","aurora"]);d.av.an=pick(pro.pro?["pulse","float","glow","ring","none"]:["pulse","float","wiggle","none"]);d.av.e=pick(EMO);
 d.bn.t=pick(["grad","aurora","stripes","dots"]);[d.bn.c1,d.bn.c2,d.bn.c3]=pl;d.bn.sp=4+Math.floor(Math.random()*9);d.nm.fx=pick(pro.pro?["none","grad","glow"]:["none","glow"])}
function startOnb(edit){editing=edit;onbOpen=true;
 draft=JSON.parse(JSON.stringify(norm(profiles[uid]||{name:me.name||"",color:"#ffb84d"})));if(!profiles[uid])randomize(draft);
 step=0;$("osub").textContent=edit?"Update how you appear to everyone.":"Welcome! Make your profile yours. You can change everything later.";
 $("cancel").classList.toggle("hide",!edit);show("onb");renderStep()}
const PROV={"av.an":["glow","ring","rainbow"],"av.dc":["crown","sparkle","orbit"],"bn.t":["img"],"pt":["neon"],"nm.fx":["grad","rainbow"]};
const locked=(k,v)=>!pro.pro&&(PROV[k]||[]).includes(v);
const chips=(k,o)=>\`<div class="chips">\`+o.map(([v,l])=>\`<button type="button" class="chip\${gp(draft,k)===v?" on":""}" data-k="\${k}" data-v="\${v}">\${l}\${locked(k,v)?" ✨":""}</button>\`).join("")+\`</div>\`;
const colorF=(k,l)=>\`<div><label>\${l}</label><input type="color" data-k="\${k}" value="\${hx(gp(draft,k),"#ffffff")}"></div>\`;
function shrink(file,w,h,q,cb){const rd=new FileReader();rd.onload=()=>{const im=new Image();im.onload=()=>{const c=document.createElement("canvas");c.width=w;c.height=h;const s=Math.max(w/im.width,h/im.height),sw=w/s,sh=h/s;c.getContext("2d").drawImage(im,(im.width-sw)/2,(im.height-sh)/2,sw,sh,0,0,w,h);cb(c.toDataURL("image/jpeg",q))};im.onerror=()=>toast("Couldn’t read that image.");im.src=rd.result};rd.readAsDataURL(file)}
const pv=()=>setCard($("pv"),draft);
function renderStep(){const d=draft;
 $("tabs").innerHTML=STEPS.map((s,i)=>\`<button type="button" class="tab\${i===step?" on":""}" data-step="\${i}">\${s}</button>\`).join("");
 let b="";
 if(step===0)b=\`<label for="f1">Display name</label><input id="f1" data-k="name" maxlength="24" value="\${esc(d.name)}">
  <div class="row2"><div><label for="f2">Pronouns</label><input id="f2" data-k="pr" maxlength="16" value="\${esc(d.pr)}" placeholder="optional"></div>\${colorF("color","Name color")}</div>
  <label>Presence</label>\`+chips("stat",[["online","Online"],["idle","Idle"],["dnd","Do not disturb"],["invisible","Invisible"]])+\`
  <label for="f3">Status</label><input id="f3" data-k="status" maxlength="40" value="\${esc(d.status)}" placeholder="What are you up to?">
  <label for="f4">About me</label><textarea id="f4" data-k="bio" maxlength="160" rows="3" placeholder="Tell people about yourself">\${esc(d.bio)}</textarea>
  <button type="button" class="pill" id="rand" style="margin-top:12px">🎲 Surprise me</button>\`;
 else if(step===1){b=\`<label>Picture</label>\`+chips("av.t",[["ini","Initials"],["emo","Emoji"],["img","Photo"]]);
  if(d.av.t==="emo")b+=\`<label for="f5">Emoji</label><input id="f5" data-k="av.e" maxlength="8" value="\${esc(d.av.e)}"><div class="chips" style="margin-top:8px">\${EMO.map(e=>\`<button type="button" class="chip\${d.av.e===e?" on":""}" data-k="av.e" data-v="\${e}">\${e}</button>\`).join("")}</div>\`;
  if(d.av.t==="img")b+=\`<label for="pf">Upload a photo</label><input type="file" id="pf" accept="image/*"><p class="sub" style="font-size:13px;margin:6px 0 0">Add an animated ring, glow or decoration below to make it move.</p>\`;
  b+=\`<label>Background</label>\`+chips("av.bg",[["solid","Solid"],["grad","Gradient"],["aurora","Moving aurora"]])+\`<div class="row2">\${colorF("av.c1","Color 1")}\${colorF("av.c2","Color 2")}</div>
  <label>Animation</label>\`+chips("av.an",[["none","None"],["pulse","Pulse"],["float","Float"],["glow","Glow"],["ring","Spin ring"],["wiggle","Wiggle"],["rainbow","Rainbow"]])+\`<label>Decoration</label>\`+chips("av.dc",[["none","None"],["crown","Crown"],["halo","Halo"],["sparkle","Sparkles"],["ears","Cat ears"],["orbit","Orbit"]])+\`<label>Shape</label>\`+chips("av.sh",[["c","Circle"],["r","Rounded"],["s","Square"]])}
 else if(step===2){b=\`<label>Banner style</label>\`+chips("bn.t",[["grad","Gradient"],["aurora","Aurora"],["stripes","Stripes"],["dots","Dots"],["img","Photo"]]);
  if(d.bn.t==="img")b+=\`<label for="bf">Upload a banner photo</label><input type="file" id="bf" accept="image/*">\`;
  b+=\`<div class="row2">\${colorF("bn.c1","Color 1")}\${colorF("bn.c2","Color 2")}\${colorF("bn.c3","Color 3")}</div>
  <label for="f6">Animation speed (faster ← → slower)</label><input id="f6" type="range" min="2" max="20" data-k="bn.sp" value="\${d.bn.sp}">
  <label>Profile card theme</label>\`+chips("pt",[["none","Plain"],["tint","Tinted"],["neon","Neon outline"]])}
 else b=\`<label>Name effect</label>\`+chips("nm.fx",[["none","Plain"],["grad","Gradient"],["glow","Glow"],["rainbow","Rainbow"]])+\`<label>Name font</label>\`+chips("nm.ff",[["def","Default"],["mono","Mono"],["serif","Serif"],["fun","Playful"]])+
  \`<label for="f7">Name tag (up to 4 letters, shown next to your name)</label><input id="f7" data-k="tag" maxlength="4" value="\${esc(d.tag)}" placeholder="e.g. BMW">
  <label>Badges (pick up to 6)</label><div class="chips">\${BADGES.map(e=>\`<button type="button" class="chip\${(d.badges||[]).includes(e)?" on":""}" data-tog="badges" data-v="\${e}">\${e}</button>\`).join("")}</div>\`;
 $("sb").innerHTML=b;$("back").classList.toggle("hide",step===0);$("obtn").textContent=step<3?"Next":(editing?"Save profile":"Create account");pv()}
$("tabs").onclick=e=>{const b=e.target.closest("[data-step]");if(b){step=+b.dataset.step;renderStep()}};
$("sb").addEventListener("input",e=>{const k=e.target.dataset.k;if(!k)return;setp(draft,k,e.target.type==="range"?+e.target.value:e.target.value);pv()});
$("sb").addEventListener("click",e=>{if(e.target.id==="rand"){randomize(draft);renderStep();return}const c=e.target.closest(".chip");if(!c)return;
 if(c.dataset.tog){const a=draft.badges=draft.badges||[],i=a.indexOf(c.dataset.v);if(i>=0)a.splice(i,1);else if(a.length<(pro.pro?6:3))a.push(c.dataset.v);else toast("✨ Free accounts can pick 3 badges. Huddle Pro unlocks 6.");renderStep();return}
 if(locked(c.dataset.k,c.dataset.v)){toast("✨ That’s a Huddle Pro perk. Tap the ✨ button in the sidebar to learn more.");return}
 setp(draft,c.dataset.k,c.dataset.v);renderStep()});
$("sb").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];if(!f)return;
 if(e.target.id==="pf")shrink(f,128,128,.8,d=>{draft.av.img=d;draft.av.t="img";renderStep()});
 else if(e.target.id==="bf")shrink(f,420,150,.7,d=>{draft.bn.img=d;draft.bn.t="img";renderStep()})});
$("back").onclick=()=>{if(step>0){step--;renderStep()}};
$("cancel").onclick=()=>{editing=false;onbOpen=false;show("app")};
$("of").onsubmit=async e=>{e.preventDefault();if(step<3){step++;renderStep();return}
 const n=draft.name.trim();if(n.length<2){step=0;renderStep();return $("oerr").textContent="Display name needs at least 2 characters."}
 draft.name=n;$("oerr").textContent="";
 send({t:"profile",p:draft});const w=editing;editing=false;onbOpen=false;profiles[uid]=draft;if(w){show("app");self();members();side();render()}else if(!entered)enter()};
$("edit").onclick=()=>openSettings();
function self(){$("mavw").innerHTML=av(uid);$("mn").innerHTML=nameHTML(uid);$("ms").textContent=P(uid).status||"Online"}
$("ucard").onclick=e=>{const id=$("ucard").dataset.id;
 if(e.target.id==="ucard"){$("ucard").classList.add("hide");return}
 if(e.target.id==="ced"){$("ucard").classList.add("hide");startOnb(true)}
 else if(e.target.id==="cfa"){send({t:"fadd",id});$("ucard").classList.add("hide")}
 else if(e.target.id==="cdm"){$("ucard").classList.add("hide");openDM(id)}};
document.addEventListener("click",e=>{const el=e.target.closest("[data-u]");if(!el||el.closest("#onb")||el.closest("#ucard")||el.closest("#modal"))return;const id=el.dataset.u;
 setCard($("ucardc"),P(id),id);$("ucard").dataset.id=id;let b="";
 if(id===uid)b='<button class="go" id="ced">Edit profile</button>';
 else{const f=friends.find(x=>x.id===id);b=!f?'<button class="go" id="cfa">Add friend</button>':f.st==="f"?'<button class="go" id="cdm">Message</button>':f.st==="in"?'<button class="go" id="cfa">Accept friend request</button>':'<button class="go" disabled style="opacity:.6">Request sent</button>'}
 $("ucardc").insertAdjacentHTML("beforeend",(id!==uid?\`<div class="pbody nt"><label>Note (only visible to you)</label><textarea id="note" rows="2" maxlength="200" placeholder="Click to add a note">\${esc(ls.get("huddle_note_"+id)||"")}</textarea></div>\`:"")+b);$("ucard").classList.remove("hide")});
function enter(){entered=true;onbOpen=false;show("app");self();members();refreshServers()}

/* servers */
const lbl=s=>String(s).replace(/-/g," ");
let home=true,friends=[],frTab="all",createState=null,booted=false,addingType=null;
const chans=()=>S()?S().channels:{text:[],voice:[]};
const srvIcon=s=>{const v=servers[s];return v.icon&&IMG.test(v.icon)?\`<img src="\${v.icon}" alt="">\`:esc(ini(v.name))};
function renderRail(){const l=mine(),pend=friends.filter(f=>f.st==="in").length;
 $("rail").innerHTML=\`<button class="sv home\${home?" on":""}" id="homeb" title="Home" aria-label="Home">🏠</button><div class="rsep"></div>\`+l.map(s=>\`<button class="sv\${s===curS&&!home?" on":""}" data-s="\${s}" title="\${esc(servers[s].name)}">\${srvIcon(s)}</button>\`).join("")+'<button class="sv add" id="plus" title="Create or join a server" aria-label="Create or join a server">+</button>'}
$("rail").onclick=e=>{const b=e.target.closest("button");if(!b)return;if(b.id==="plus")return openCreate();if(b.id==="homeb")return goHome();switchS(b.dataset.s)};
function refreshServers(){const l=mine();
 if(!booted){booted=true;if(l.length){switchS(l[0]);return}goHome();return}
 if(!home&&(!curS||!l.includes(curS))){goHome();return}
 renderRail();if(home){side();if(!cur)frPanel()}else{header();members();side()}}
function goHome(){home=true;curS=null;cur=null;msgs=[];renderRail();$("sh").classList.add("hide");["chat","voice","mem"].forEach(i=>$(i).classList.add("hide"));$("fr").classList.remove("hide");$("cn").textContent="Friends";$("side").classList.remove("open");side();frPanel()}
function switchS(s){home=false;curS=s;msgs=[];cur=null;renderRail();$("sh").classList.remove("hide");$("fr").classList.add("hide");header();members();open("t",chans().text[0]||"general")}
function openDM(id){home=true;curS=null;cur=null;renderRail();$("sh").classList.add("hide");open("d",id)}
function header(){const s=S();if(!s)return;$("sname").textContent=s.name;$("inv").textContent="Invite code: "+s.code;$("lv").textContent=s.owner===uid?"Delete server":"Leave server"}
$("inv").onclick=async()=>{const c=S().code;try{await navigator.clipboard.writeText(c);toast("Invite code copied: "+c)}catch(e){toast("Invite code: "+c+". Share it with friends.")}};
$("lv").onclick=()=>{const s=S(),b=$("lv");
 if(Date.now()-confirmT>3000){confirmT=Date.now();b.textContent="Tap again to confirm";setTimeout(header,3000);return}
 confirmT=0;send({t:s.owner===uid?"delete":"leave",sid:curS});toast(s.owner===uid?"Server deleted.":"You left the server.")};

/* create / join server */
const TPL=[["own","Create My Own","🛠️"],["gaming","Gaming","🎮"],["school","School Club","📘"],["study","Study Group","🍎"],["friends","Friends","💗"],["artists","Artists & Creators","🎨"],["local","Local Community","🌿"]];
function openCreate(){createState={step:"pick",tpl:"own",kind:"",name:"",icon:""};$("modal").classList.remove("hide");renderCreate()}
function closeCreate(){$("modal").classList.add("hide");createState=null}
function renderCreate(){const s=createState,c=$("cw"),x='<button class="x" data-cc="close" aria-label="Close">×</button>';
 if(s.step==="pick")c.innerHTML=x+\`<h3>Create Your Server</h3><p class="sub">Your server is where you and your friends hang out. Make yours and start talking.</p>\`+TPL.map(([k,n,e],i)=>(i===1?'<div class="chh">Start from a template</div>':"")+\`<button class="tpl" data-tpl="\${k}"><span>\${e}</span>\${n}<i>›</i></button>\`).join("")+\`<div class="jn"><b>Have an invite already?</b><button class="go" data-cc="join">Join a Server</button></div>\`;
 else if(s.step==="kind")c.innerHTML=x+\`<button class="back" data-cc="pick" aria-label="Back">←</button><h3>Tell Us More About Your Server</h3><p class="sub">Is your new server for just a few friends or a larger community?</p><button class="tpl" data-kind="friends"><span>🛋️</span>For me and my friends<i>›</i></button><button class="tpl" data-kind="community"><span>🌍</span>For a club or community<i>›</i></button><p class="swap">Not sure? You can <button data-kind="skip">skip this question</button> for now.</p>\`;
 else if(s.step==="name")c.innerHTML=x+\`<button class="back" data-cc="kind" aria-label="Back">←</button><h3>Customize Your Server</h3><p class="sub">Give your new server a personality with a name and an icon. You can always change it later.</p><label class="upl"><input type="file" id="sic" accept="image/*" hidden><div class="upc">\${s.icon?\`<img src="\${s.icon}" alt="">\`:"📷<small>UPLOAD</small>"}</div></label><label for="sn">Server name</label><input id="sn" maxlength="30" value="\${esc(s.name)}"><div class="err" id="merr" role="alert"></div><button class="go" data-cc="make">Create Server</button>\`;
 else c.innerHTML=x+\`<button class="back" data-cc="pick" aria-label="Back">←</button><h3>Join a Server</h3><p class="sub">Enter an invite code below to join an existing server.</p><label for="jc">Invite code</label><input id="jc" maxlength="12" autocapitalize="characters"><div class="err" id="merr" role="alert"></div><button class="go" data-cc="dojoin">Join Server</button>\`}
$("modal").addEventListener("click",e=>{const s=createState;if(!s)return;if(e.target.id==="modal"){closeCreate();return}
 const t=e.target.closest("[data-tpl]");if(t){s.tpl=t.dataset.tpl;s.step="kind";renderCreate();return}
 const k=e.target.closest("[data-kind]");if(k){s.kind=k.dataset.kind;if(!s.name)s.name=P(uid).name+"’s server";s.step="name";renderCreate();return}
 const c=e.target.closest("[data-cc]");if(!c)return;const a=c.dataset.cc;
 if(a==="close")closeCreate();
 else if(a==="join"){s.step="join";renderCreate()}
 else if(a==="pick"){s.step="pick";renderCreate()}
 else if(a==="kind"){s.name=$("sn")?$("sn").value:s.name;s.step="kind";renderCreate()}
 else if(a==="make"){const n=$("sn").value.trim();s.name=n;if(n.length<2)return $("merr").textContent="Server name needs at least 2 characters.";send({t:"create",name:n,tpl:s.tpl,kind:s.kind,icon:s.icon})}
 else if(a==="dojoin"){const cd=$("jc").value.trim().toUpperCase();if(!cd)return $("merr").textContent="Enter an invite code.";send({t:"join",code:cd})}});
$("modal").addEventListener("change",e=>{if(e.target.id!=="sic")return;const f=e.target.files[0];if(!f)return;createState.name=$("sn")?$("sn").value:createState.name;shrink(f,128,128,.8,d=>{createState.icon=d;renderCreate()})});

/* home: friends + DMs */
function homeSide(){const inc=friends.filter(f=>f.st==="in").length;
 let h=\`<button class="ch\${cur?"":" on"}" id="gofr">👥 Friends\${inc?\`<span class="bdg2">\${inc}</span>\`:""}</button><div class="chh">Direct messages</div>\`;
 friends.filter(f=>f.st==="f").forEach(f=>h+=\`<button class="ch\${cur&&cur.t==="d"&&cur.c===f.id?" on":""}" data-t="d" data-c="\${f.id}">\${av(f.id,1)}\${nameHTML(f.id)}</button>\`);
 $("chs").innerHTML=h}
function srvSide(){if(!curS)return;const k=cur,own=S().owner===uid,ch=chans();
 const add=t=>own?\`<button class="addch" data-type="\${t}" title="Add channel" aria-label="Add \${t} channel">+</button>\`:"";
 const row=t=>addingType===t?\`<form class="acf" id="acf" data-type="\${t}"><input id="acn" placeholder="new-channel" maxlength="24" aria-label="Channel name"><button class="pill">Add</button></form>\`:"";
 let h=\`<div class="chh">Text channels\${add("text")}</div>\`+row("text");
 ch.text.forEach(c=>h+=\`<button class="ch\${k&&k.t==="t"&&k.c===c?" on":""}" data-t="t" data-c="\${c}"># \${esc(lbl(c))}</button>\`);
 h+=\`<div class="chh">Voice channels\${add("voice")}</div>\`+row("voice");
 ch.voice.forEach(s=>{h+=\`<button class="ch\${k&&k.t==="v"&&k.c===s?" on":""}" data-t="v" data-c="\${s}">🔊 \${esc(lbl(s))}</button>\`;vcUsers(s).forEach(u=>h+=\`<div class="vm">\${av(u)}\${nameHTML(u)}</div>\`)});
 $("chs").innerHTML=h;const i=$("acn");if(i&&document.activeElement!==i)i.focus()}
function side(){home?homeSide():srvSide()}
$("chs").onclick=e=>{if(e.target.closest("#gofr")){cur=null;msgs=[];$("chat").classList.add("hide");$("fr").classList.remove("hide");$("cn").textContent="Friends";$("side").classList.remove("open");side();frPanel();return}
 const a=e.target.closest(".addch");if(a){addingType=addingType===a.dataset.type?null:a.dataset.type;srvSide();return}
 const b=e.target.closest(".ch");if(b)open(b.dataset.t,b.dataset.c)};
$("chs").addEventListener("submit",e=>{e.preventDefault();const f=e.target.closest("#acf");if(!f)return;const n=$("acn").value.trim();if(n)send({t:"chadd",sid:curS,type:f.dataset.type,name:n});addingType=null;srvSide()});
const empty=t=>\`<p class="empty">\${t}</p>\`;
function frPanel(){if(!home||cur)return;
 const fl=friends.filter(x=>x.st==="f"),inc=friends.filter(x=>x.st==="in"),out=friends.filter(x=>x.st==="out");
 const tabs=[["online","Online"],["all","All"],["pend","Pending"+(inc.length?" ("+inc.length+")":"")],["add","Add friend"]];
 let h=mine().length?"":\`<div class="cta"><b>Start your own server</b><p class="sub" style="margin:6px 0 0">Pick a template, add an icon, and invite your friends.</p><button class="go" id="frcreate">Create a server</button></div>\`;
 h+=\`<div class="frt">\${tabs.map(([k,l])=>\`<button class="tab\${frTab===k?" on":""}" data-tab="\${k}">\${l}</button>\`).join("")}</div>\`;
 const row=(x,acts)=>\`<div class="frr"><div class="frl" data-u="\${esc(x.id)}">\${av(x.id,1)}<div><div>\${nameHTML(x.id)}</div><small>\${P(x.id).un?"@"+esc(P(x.id).un)+" · ":""}\${isOn(x.id)?"Online":"Offline"}</small></div></div><div class="fra">\${acts}</div></div>\`;
 if(frTab==="add")h+=\`<form id="afr" class="frf"><p class="sub" style="margin:0 0 8px">Add a friend with their username.</p><div class="row2"><input id="fu" placeholder="username" autocapitalize="none" maxlength="20" aria-label="Username"><button class="go" style="margin:0;max-width:110px">Send</button></div><div class="sub" id="fmsg" style="margin:8px 0 0"></div></form>\`;
 else if(frTab==="pend"){h+=inc.map(x=>row(x,\`<button class="ib" data-act="acc" data-id="\${esc(x.id)}" title="Accept" aria-label="Accept">✓</button><button class="ib red" data-act="dec" data-id="\${esc(x.id)}" title="Decline" aria-label="Decline">✕</button>\`)).join("")+out.map(x=>row(x,\`<small>Sent</small><button class="ib" data-act="dec" data-id="\${esc(x.id)}" title="Cancel request" aria-label="Cancel request">✕</button>\`)).join("");if(!inc.length&&!out.length)h+=empty("No pending requests.")}
 else{const l=frTab==="online"?fl.filter(x=>isOn(x.id)):fl;h+=l.map(x=>row(x,\`<button class="ib" data-act="wave" data-id="\${esc(x.id)}" title="Wave" aria-label="Wave">👋</button><button class="ib" data-act="dm" data-id="\${esc(x.id)}" title="Message" aria-label="Message">💬</button><button class="ib" data-act="rm" data-id="\${esc(x.id)}" title="Remove friend" aria-label="Remove friend">✕</button>\`)).join("")||empty(frTab==="online"?"No friends online right now.":"No friends yet. Use Add friend to send a request.")}
 $("fr").innerHTML=h}
$("fr").addEventListener("click",e=>{const t=e.target.closest("[data-tab]");if(t){frTab=t.dataset.tab;frPanel();return}
 if(e.target.id==="frcreate")return openCreate();
 const b=e.target.closest("[data-act]");if(!b)return;const id=b.dataset.id,a=b.dataset.act;
 if(a==="dm")openDM(id);else if(a==="wave"){send({t:"msg",dm:id,text:"👋 Wave!"});toast("Waved at "+P(id).name)}else if(a==="acc")send({t:"fresp",id,ok:1});else if(a==="dec")send({t:"fresp",id,ok:0});else if(a==="rm")send({t:"fremove",id})});
$("fr").addEventListener("submit",e=>{e.preventDefault();const u=$("fu").value.trim();if(u){send({t:"fadd",user:u});$("fu").value="";$("fmsg").textContent="Sending…"}});

/* channels */
const vcId=s=>curS+"."+s;
const vcUsers=s=>Object.keys(pres).filter(u=>pres[u]===vcId(s)&&online[u]);
function open(t,c){cur={t,c};msgs=[];$("side").classList.remove("open");
 const v=t==="v",d=t==="d";
 $("fr").classList.add("hide");$("chat").classList.toggle("hide",v);$("voice").classList.toggle("hide",!v);$("mem").classList.toggle("hide",d||home);
 $("cn").innerHTML=v?"🔊 "+esc(lbl(c)):d?nameHTML(c):"# "+esc(lbl(c));
 side();
 if(v){voiceUi();return}
 $("in").placeholder=d?"Message "+P(c).name:"Message #"+lbl(c);render();
 send(d?{t:"open",dm:c}:{t:"open",sid:curS,ch:c})}
function render(){if(!cur||cur.t==="v")return;const box=$("msgs");const near=box.scrollHeight-box.scrollTop-box.clientHeight<120||!box.children.length;let h="",lu=null,lt=0;
 (()=>{const q=sqv();return q?msgs.filter(x=>String(x.text||"").toLowerCase().includes(q)):msgs})().forEach(m=>{const g=m.uid!==lu||m.ts-lt>3e5;const tm=new Date(m.ts).toLocaleString([],{hour:"numeric",minute:"2-digit",...(Date.now()-m.ts>864e5?{month:"short",day:"numeric"}:{})});
  h+=\`<div class="m\${g?" g":""}" data-mid="\${esc(m.id)}">\${g?av(m.uid):'<div class="sp"></div>'}<div>\${g?\`<div class="t">\${nameHTML(m.uid)}<small>\${esc(tm)}</small></div>\`:""}\${m.re?repHTML(m.re):""}\${m.text?\`<p>\${fmt(m.text)}\${m.ed?' <small class="ed">(edited)</small>':""}</p>\`:""}\${m.img&&IMG.test(m.img)?\`<img class="mimg" src="\${m.img}" alt="Attachment">\`:""}\${rxHTML(m)}</div></div>\`;lu=m.uid;lt=m.ts});
 box.innerHTML=h||\`<p class="empty">\${cur.t==="d"?"This is the start of your conversation with "+esc(P(cur.c).name)+".":"This is the start of #"+esc(lbl(cur.c))+". Send the first message."}</p>\`;if(near)box.scrollTop=1e9}
$("form").onsubmit=e=>{e.preventDefault();const t=$("in").value.trim();if((!t&&!attImg)||!cur||cur.t==="v")return;const tgt=cur.t==="d"?{dm:cur.c}:{sid:curS,ch:cur.c};
 if(editId){if(t)send({t:"edit",...tgt,id:editId,text:t});editId=null}
 else send({t:"msg",...tgt,text:t,img:attImg||undefined,re:rep?rep.id:undefined});
 $("in").value="";rep=null;attImg=null;drawCtx()};
function members(){if(!curS||home)return;const ids=memb(curS).sort((a,b)=>(isOn(b)?1:0)-(isOn(a)?1:0)||P(a).name.localeCompare(P(b).name));
 $("mem").innerHTML=\`<div class="chh">Members, \${ids.filter(isOn).length} online</div>\`+ids.map(i=>\`<div class="mm\${isOn(i)?"":" off"}" data-u="\${esc(i)}">\${av(i,1)}\${nameHTML(i)}</div>\`).join("")}
$("menu").onclick=()=>$("side").classList.toggle("open");

/* emojis, reactions, pro */
let pro={pro:false,admin:false,all:false,list:[]},customEm={},pk={tab:"Smileys",cb:null,keep:false};
const EIMG=/^data:image\\/(png|jpeg|webp);base64,[A-Za-z0-9+\\/=]+$/;
const EMOJI={Smileys:"😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 😐 😑 😶 😏 😒 🙄 😬 😔 😪 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 💀 👻 👽 🤖 💩".split(" "),
 Hands:"👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 ✍️ 💪 👏 🙌 👐 🤲 🫶 🫡 🤌 🤏 ✊ 👊 🤛 🤜 👀 🧠".split(" "),
 Hearts:"❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ✨ 💫 ⭐ 🌟 💥 💯 🔥 ⚡ 🎉 🎊 🎈 🎁 🏆 🥇 🥈 🥉 👑 💎".split(" "),
 Animals:"🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦅 🦉 🐺 🐗 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🦀 🐠 🐬 🐳 🦈 🐘 🦒 🐉 🌵 🌲 🌸 🌻 🌈 ☀️ 🌙 ❄️ 🌊".split(" "),
 Food:"🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🍗 🍖 🌭 🍔 🍟 🍕 🌮 🌯 🍣 🍜 🍝 🍩 🍪 🎂 🍰 🍫 🍬 🍭 ☕ 🍵 🥤 🍺 🍷 🥂".split(" "),
 Things:"⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🎮 🕹️ 🎲 🎯 🎧 🎤 🎸 🎹 🥁 🎬 🎨 📚 💻 📱 ⌚ 📷 💡 🔑 🔒 💰 💸 🚗 🚀 ✈️ 🏠 🌍 📌 ✅ ❌ ❓ ❗ ⚠️ 💤".split(" ")};
const SHORT={smile:"😄",grin:"😁",joy:"😂",lol:"😂",rofl:"🤣",wink:"😉",heart:"❤️",love:"😍",fire:"🔥",cool:"😎",thumbsup:"👍",thumbsdown:"👎",ok:"👌",clap:"👏",pray:"🙏",wave:"👋",cry:"😭",sob:"😭",sad:"😢",angry:"😡",think:"🤔",shrug:"🤷",eyes:"👀","100":"💯",party:"🎉",tada:"🎉",star:"⭐",sparkles:"✨",skull:"💀",ghost:"👻",sleep:"😴",wow:"😮",kiss:"😘",hug:"🤗",sweat:"😅",muscle:"💪",rocket:"🚀",crown:"👑",gem:"💎",pizza:"🍕",coffee:"☕",cat:"🐱",dog:"🐶",fox:"🦊",rainbow:"🌈",sun:"☀️",moon:"🌙",check:"✅",x:"❌"};
function fmt(t){const only=/^(\\s*(:[a-z0-9_]{2,16}:|\\p{Extended_Pictographic}\\uFE0F?))+\\s*$/u.test(t);
 const s=esc(t).replace(/:([a-z0-9_]{2,16}):/g,(x,n)=>customEm[n]?\`<img class="ce" src="\${customEm[n].img}" alt=":\${n}:" title=":\${n}:">\`:SHORT[n]||x);
 return only?\`<span class="jb">\${s}</span>\`:s}
const emo=e=>e[0]===":"&&customEm[e.slice(1,-1)]?\`<img class="ce" src="\${customEm[e.slice(1,-1)].img}" alt="\${esc(e)}">\`:esc(e);
const rxHTML=m=>{const r=m.rx||{},k=Object.keys(r);return k.length?\`<div class="rxs">\${k.map(e=>\`<button class="rx\${r[e].includes(uid)?" on":""}" data-mid="\${esc(m.id)}" data-e="\${esc(e)}">\${emo(e)} \${r[e].length}</button>\`).join("")}</div>\`:""};
const react=(id,e)=>send(cur.t==="d"?{t:"react",dm:cur.c,id,e}:{t:"react",sid:curS,ch:cur.c,id,e});
function selMsg(el){const was=el&&el.classList.contains("sel");document.querySelectorAll(".m.sel").forEach(x=>{x.classList.remove("sel");const q=x.querySelector(".qr");if(q)q.remove()});if(!el||was)return;
 const m=msgs.find(x=>x.id===el.dataset.mid);if(!m)return;const mine=m.uid===uid,owner=curS&&S()&&S().owner===uid;
 el.classList.add("sel");el.insertAdjacentHTML("beforeend",\`<div class="qr">\${["👍","❤️","😂","🔥"].map(e=>\`<button data-e="\${e}" aria-label="React \${e}">\${e}</button>\`).join("")}<button data-e="+" aria-label="More reactions">➕</button><button data-a="rep" aria-label="Reply" title="Reply">↩️</button>\${mine?'<button data-a="edit" aria-label="Edit" title="Edit">✏️</button>':""}\${mine||owner?'<button data-a="del" aria-label="Delete" title="Delete">🗑️</button>':""}</div>\`)}
$("msgs").addEventListener("click",e=>{const rb=e.target.closest(".rx");if(rb){react(rb.dataset.mid,rb.dataset.e);return}
 const im=e.target.closest(".mimg");if(im&&!im.classList.contains("sm")){$("lb").innerHTML=\`<img src="\${im.src}" alt="">\`;$("lb").classList.remove("hide");return}
 const rp=e.target.closest(".rep");if(rp){const t=document.querySelector(\`.m[data-mid="\${rp.dataset.go}"]\`);if(t)t.scrollIntoView({block:"center"});return}
 const qb=e.target.closest(".qr button");if(qb){const id=qb.closest(".m").dataset.mid,m=msgs.find(x=>x.id===id);selMsg(null);if(!m)return;const a=qb.dataset.a;
  if(a==="rep"){rep={id,uid:m.uid};editId=null;drawCtx();$("in").focus()}
  else if(a==="edit"){editId=id;rep=null;$("in").value=m.text||"";drawCtx();$("in").focus()}
  else if(a==="del")send(cur.t==="d"?{t:"del",dm:cur.c,id}:{t:"del",sid:curS,ch:cur.c,id});
  else if(qb.dataset.e==="+")openPicker(em=>react(id,em),false);else react(id,qb.dataset.e);return}
 const m=e.target.closest(".m");if(!m||e.target.closest("[data-u]"))return;selMsg(m)});
function openPicker(cb,keep){pk.cb=cb;pk.keep=keep;$("epk").classList.remove("hide");drawPicker()}
function closePicker(){$("epk").classList.add("hide");pk.cb=null}
function drawPicker(){const tabs=Object.keys(EMOJI).map(k=>[k,EMOJI[k][0]]).concat([["Custom","⭐"]]);
 let h=\`<div class="ept">\${tabs.map(([k,i])=>\`<button class="tab\${pk.tab===k?" on":""}" data-pt="\${k}" title="\${k}" aria-label="\${k}">\${i}</button>\`).join("")}<button class="ib" data-pt="x" aria-label="Close" style="margin-left:auto;flex:none">✕</button></div>\`;
 if(pk.tab==="Custom"){const ns=Object.keys(customEm);
  h+=\`<div class="epc"><div class="row">\${ns.map(n=>\`<button data-ce="\${n}" title=":\${n}:"><img class="ce" src="\${customEm[n].img}" alt=":\${n}:"></button>\`).join("")||'<p class="sub" style="font-size:13px;margin:0">No custom emojis yet.</p>'}</div>\`+(pro.pro?\`<div class="ceadd"><input id="cen" placeholder="name e.g. party_cat" maxlength="16" autocapitalize="none" aria-label="Emoji name"><label class="pill" style="cursor:pointer;margin:0">Upload<input type="file" id="cef" accept="image/*" hidden></label></div>\`:'<p class="sub" style="font-size:13px">✨ Huddle Pro members can create custom emojis for everyone.</p>')+\`</div>\`}
 else h+=\`<div class="epg">\${EMOJI[pk.tab].map(e=>\`<button data-e="\${e}">\${e}</button>\`).join("")}</div>\`;
 $("epk").innerHTML=h}
$("epk").addEventListener("click",e=>{const t=e.target.closest("[data-pt]");if(t){if(t.dataset.pt==="x")closePicker();else{pk.tab=t.dataset.pt;drawPicker()}return}
 const b=e.target.closest("[data-e],[data-ce]");if(!b||!pk.cb)return;const v=b.dataset.ce?":"+b.dataset.ce+":":b.dataset.e,cb=pk.cb;cb(v);if(!pk.keep)closePicker()});
$("epk").addEventListener("change",e=>{if(e.target.id!=="cef")return;const f=e.target.files[0],n=($("cen").value||"").trim().toLowerCase();if(!f)return;
 if(!/^[a-z0-9_]{2,16}$/.test(n))return toast("Pick a name with 2-16 letters, numbers or _.");
 const rd=new FileReader();rd.onload=()=>{const im=new Image();im.onload=()=>{const c=document.createElement("canvas");c.width=c.height=48;const s=Math.min(im.width,im.height);c.getContext("2d").drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,48,48);send({t:"emadd",name:n,img:c.toDataURL("image/png")})};im.src=rd.result};rd.readAsDataURL(f)});
$("emb").onclick=()=>{if(!$("epk").classList.contains("hide")){closePicker();return}openPicker(em=>{const i=$("in");i.value+=em;i.focus()},true)};

function openPro(){$("promodal").classList.remove("hide");drawPro()}
function drawPro(){const p=pro;
 let h=\`<button class="x" data-pa="close" aria-label="Close">×</button><h3>✨ Huddle Pro</h3><p class="sub">\${p.pro?"You have Huddle Pro.":"Unlock premium profile style and custom emojis."}</p><ul class="perks"><li>Animated avatar effects: glow, spin ring, rainbow</li><li>Premium decorations: crown, sparkles, orbit</li><li>Photo banners and neon profile cards</li><li>Gradient and rainbow name effects</li><li>Up to 6 badges (3 for free)</li><li>Create custom emojis everyone can use</li><li>PRO tag next to your name</li></ul>\`;
 if(!p.pro)h+=\`<p class="sub">Pro is granted by the admin, who is the first account created on this server. Ask them to give you Pro.</p>\`;
 if(p.admin)h+=\`<div class="chh">Admin tools</div><p class="sub" style="font-size:13px;margin:0 0 8px">There are no payments here. You decide who gets Pro.</p><div class="row2"><input id="pau" placeholder="username" autocapitalize="none" aria-label="Username"><button class="pill" data-pa="grant" style="flex:none;margin:0">Grant</button><button class="pill" data-pa="revoke" style="flex:none;margin:0">Revoke</button></div><button class="pill" data-pa="all" style="margin-top:12px">\${p.all?"✓ Everyone has Pro (tap to turn off)":"Give everyone Pro"}</button><p class="sub" style="font-size:13px">Pro members: \${p.list.length?p.list.map(esc).join(", "):"none yet"}</p>\`;
 $("proc").innerHTML=h}
$("promodal").addEventListener("click",e=>{if(e.target.id==="promodal"){$("promodal").classList.add("hide");return}const b=e.target.closest("[data-pa]");if(!b)return;const a=b.dataset.pa;
 if(a==="close")$("promodal").classList.add("hide");
 else if(a==="grant"||a==="revoke"){const u=$("pau").value.trim();if(u)send({t:"proset",user:u,on:a==="grant"?1:0})}
 else if(a==="all")send({t:"proall",on:pro.all?0:1})});
$("probtn").onclick=openPro;

/* ===== messages: reply / edit / attach / search ===== */
let rep=null,editId=null,attImg=null;
const sqv=()=>{const e=$("sq");return e&&!e.classList.contains("hide")?e.value.trim().toLowerCase():""};
const repHTML=r=>\`<div class="rep" data-go="\${esc(r.id)}">↩ \${nameHTML(r.uid)} <span>\${esc(String(r.text||"").slice(0,80))||"Image"}</span></div>\`;
function drawCtx(){const c=$("ctx");let h="";
 if(rep)h+=\`<span>↩ Replying to <b>\${esc(P(rep.uid).name)}</b></span><button class="ib" data-cx="rep" aria-label="Cancel reply">✕</button>\`;
 if(editId)h+=\`<span>✏️ Editing message</span><button class="ib" data-cx="edit" aria-label="Cancel edit">✕</button>\`;
 if(attImg)h+=\`<img class="mimg sm" src="\${attImg}" alt="Attachment preview"><span>Image attached</span><button class="ib" data-cx="img" aria-label="Remove image">✕</button>\`;
 c.innerHTML=h;c.classList.toggle("hide",!h)}
$("ctx").onclick=e=>{const b=e.target.closest("[data-cx]");if(!b)return;const k=b.dataset.cx;if(k==="rep")rep=null;else if(k==="edit"){editId=null;$("in").value=""}else attImg=null;drawCtx()};
$("att").onclick=()=>$("attf").click();
$("attf").onchange=e=>{const f=e.target.files[0];e.target.value="";if(!f)return;const rd=new FileReader();rd.onload=()=>{const im=new Image();im.onload=()=>{const s=Math.min(1,640/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext("2d").drawImage(im,0,0,c.width,c.height);attImg=c.toDataURL("image/jpeg",.7);if(attImg.length>85000)attImg=c.toDataURL("image/jpeg",.45);drawCtx()};im.onerror=()=>toast("Couldn’t read that image.");im.src=rd.result};rd.readAsDataURL(f)};
$("lb").onclick=()=>$("lb").classList.add("hide");
$("srch").onclick=()=>{const q=$("sq"),on=q.classList.contains("hide");q.classList.toggle("hide",!on);if(on)q.focus();else q.value="";render()};
$("sq").oninput=()=>render();
$("ucard").addEventListener("input",e=>{if(e.target.id==="note")ls.set("huddle_note_"+$("ucard").dataset.id,e.target.value)});

/* ===== settings, shop, quests ===== */
let wallet={orbs:0,own:[],quests:[]},setOpen=false,sv=null;
let SET=Object.assign({theme:"dark",acc:"#ffb84d",compact:0,fs:15,rm:0,snd:1},(()=>{try{return JSON.parse(ls.get("huddle_set")||"{}")}catch(e){return{}}})());
const THEMES={dark:{},amoled:{"--bg":"#000","--rail":"#000","--side":"#0b0b12","--panel":"#16161f","--line":"#25253a"},light:{"--bg":"#f3f2fb","--rail":"#e4e2f4","--side":"#ffffff","--panel":"#eceaf8","--line":"#d5d2ec","--text":"#1b1930","--mute":"#6a6690"}};
const TVARS=["--bg","--rail","--side","--panel","--line","--text","--mute","--acc","--accx"];
function applyTheme(){const r=document.documentElement.style;TVARS.forEach(v=>r.removeProperty(v));Object.entries(THEMES[SET.theme]||{}).forEach(([k,v])=>r.setProperty(k,v));
 const a=hx(SET.acc,"#ffb84d");r.setProperty("--acc",a);r.setProperty("--accx",lum(a)>.55?"#1a1200":"#ffffff");r.setProperty("color-scheme",SET.theme==="light"?"light":"dark");
 document.body.style.fontSize=(+SET.fs||15)+"px";document.body.classList.toggle("compact",!!+SET.compact);document.body.classList.toggle("rm",!!+SET.rm)}
const saveSet=()=>{ls.set("huddle_set",JSON.stringify(SET));applyTheme()};
let au=null;const beep=()=>{try{au=au||new(window.AudioContext||window.webkitAudioContext)();const o=au.createOscillator(),g=au.createGain();o.connect(g);g.connect(au.destination);o.frequency.value=740;g.gain.setValueAtTime(.08,au.currentTime);g.gain.exponentialRampToValueAtTime(.0001,au.currentTime+.18);o.start();o.stop(au.currentTime+.2)}catch(e){}};
const SHOPI={dc:[["horns","Devil horns",150],["flame","Flame ring",250],["frost","Frost",250],["neon","Neon pulse",200],["hearts","Floating hearts",300],["glitch","Glitch",400]],fx:[["snow","Snowfall",300],["stars","Twinkling stars",300],["rain","Rain",350],["confetti","Confetti",450]]};
let shopTab="dc";
const sch=(k,o)=>\`<div class="chips">\${o.map(([v,l])=>\`<button class="chip\${String(SET[k])===String(v)?" on":""}" data-set="\${k}" data-v="\${v}">\${l}</button>\`).join("")}</div>\`;
const pch=(k,o)=>\`<div class="chips">\${o.map(([v,l])=>\`<button class="chip\${String(P(uid)[k]||0)===String(v)?" on":""}" data-pp="\${k}" data-v="\${v}">\${l}</button>\`).join("")}</div>\`;
function openSettings(v){setOpen=true;sv=v||null;$("set").classList.remove("hide");send({t:"wallet"});drawSettings()}
function closeSettings(){setOpen=false;$("set").classList.add("hide")}
function patchProfile(patch){const p=JSON.parse(JSON.stringify(norm(profiles[uid]||{name:"User"})));delete p.pro;Object.assign(p,patch);send({t:"profile",p});toast("Saved")}
function equip(id){const [k,v]=id.split(":");const p=JSON.parse(JSON.stringify(norm(profiles[uid])));delete p.pro;if(k==="dc")p.av.dc=p.av.dc===v?"none":v;else p.fx=p.fx===v?"none":v;send({t:"profile",p})}
function drawSettings(){const c=$("setc");const claim=(wallet.quests||[]).some(q=>q.done);
 const T={account:"Account",privacy:"Data & Privacy",notif:"Notifications",appear:"Appearance",about:"About Huddle",shop:"Shop",quests:"Quests"};$("sett").textContent=sv?T[sv]:"Settings";
 const row=(k,i,t,r)=>\`<button class="srow" data-sv="\${k}"><span class="si">\${i}</span>\${t}<i>\${r||"›"}</i></button>\`;let h="";
 if(!sv)h=\`<div class="sgrp">Account Settings</div><div class="slist">\${row("account","👤","Account")}\${row("privacy","🔒","Data & Privacy")}\${row("notif","🔔","Notifications")}</div><div class="sgrp">App Settings</div><div class="slist">\${row("appear","🎨","Appearance")}\${row("about","ℹ️","About Huddle")}</div><div class="sgrp">Billing Settings</div><div class="slist">\${row("shop","🛍️","Shop","🔶 "+(wallet.orbs||0))}\${row("quests","🎯","Quests",claim?"🔴":"›")}\${row("pro","✨","Huddle Pro (Nitro)",pro.pro?"Active":"›")}</div>\`;
 else if(sv==="account")h=\`<div class="pc" id="setcard"></div><div class="sbox" style="margin-top:12px"><button class="go" id="sedit" style="margin:0">Edit profile</button></div><div class="sbox"><button class="go" id="slogout" style="margin:0;background:var(--panel);color:var(--text)">Log out</button></div>\${pro.admin?\`<div class="sbox bk"><b>Server backup (admin)</b><p class="sub" style="text-align:left;font-size:13px;margin:6px 0 10px">Render’s free plan can erase everything when it restarts. Download a backup now and then. After a wipe, make a new account (it becomes admin) and restore the file here.</p><button class="go" id="bkd" style="margin:0">Download backup</button><label class="go" style="display:block;text-align:center;cursor:pointer;margin:8px 0 0;background:var(--panel);color:var(--text)">Restore from backup<input type="file" id="bkr" accept="application/json,.json" hidden></label></div>\`:""}\`;
 else if(sv==="privacy")h=\`<div class="sbox"><label>Who can send me friend requests</label>\${pch("nofr",[["0","Everyone"],["1","Nobody"]])}<label>Appear as</label>\${pch("stat",[["online","Online"],["idle","Idle"],["dnd","Do not disturb"],["invisible","Invisible"]])}<p class="sub" style="font-size:13px;text-align:left;margin:10px 0 0">Your profile is visible to people who share a server with you or are your friends.</p></div>\`;
 else if(sv==="notif")h=\`<div class="sbox"><label>Message sounds</label>\${sch("snd",[["1","On"],["0","Off"]])}</div>\`;
 else if(sv==="appear")h=\`<div class="sbox"><label>Theme</label>\${sch("theme",[["dark","Dark"],["amoled","AMOLED"],["light","Light"]])}<label for="sacc">Accent color</label><input type="color" id="sacc" data-set="acc" value="\${hx(SET.acc,"#ffb84d")}"><label>Compact messages</label>\${sch("compact",[["0","Off"],["1","On"]])}<label for="sfs">Text size</label><input type="range" id="sfs" min="13" max="19" data-set="fs" value="\${SET.fs}"><label>Reduce motion</label>\${sch("rm",[["0","Off"],["1","On"]])}</div>\`;
 else if(sv==="about")h=\`<div class="sbox"><b>Huddle</b><p class="sub" style="text-align:left;margin:8px 0 0">Servers, friends, DMs, voice calls, reactions and custom emojis. Version 2.</p></div>\`;
 else if(sv==="shop"){const own=wallet.own||[],pp=P(uid);
  h=\`<div class="sbox"><span class="orbs">🔶 \${wallet.orbs||0} Orbs</span><p class="sub" style="text-align:left;font-size:13px;margin:8px 0 0">Earn Orbs from Quests, then spend them on decorations and profile effects.</p></div><div class="frt"><button class="tab\${shopTab==="dc"?" on":""}" data-st="dc">Avatar decorations</button><button class="tab\${shopTab==="fx"?" on":""}" data-st="fx">Profile effects</button></div><div class="shopg">\`+
  SHOPI[shopTab].map(([k,n,pr])=>{const id=shopTab+":"+k,has=own.includes(id),on=(shopTab==="dc"?pp.av.dc:pp.fx)===k;
   const pv=shopTab==="dc"?avFrom({name:"A",color:"#ffb84d",av:{...pp.av,t:"ini",img:"",dc:k}},null):\`<div class="pc fx-\${k}"><div class="bn bn-grad" style="--c1:#5b4bd6;--c2:#c04bd6;--c3:#4bd6c0;--sp:8s"></div></div>\`;
   const btn=has?\`<button class="go" data-shop="\${id}" data-act="eq">\${on?"Unequip":"Equip"}</button>\`:\`<button class="go" data-shop="\${id}" data-act="buy"\${(wallet.orbs||0)<pr?" disabled":""}>\${(wallet.orbs||0)<pr?"Not enough Orbs":"Buy"}</button>\`;
   return \`<div class="sc"><div class="pv">\${pv}</div><b>\${n}</b><span class="pr">\${has?"Owned":"🔶 "+pr}</span>\${btn}</div>\`}).join("")+\`</div>\`}
 else if(sv==="quests")h=\`<div class="sbox"><span class="orbs">🔶 \${wallet.orbs||0} Orbs</span></div>\`+(wallet.quests||[]).map(q=>\`<div class="qrow"><div class="top"><div><b>\${esc(q.title)}</b><div class="sub" style="text-align:left;font-size:13px;margin:2px 0 0">\${esc(q.desc)}</div></div>\${q.done?\`<button class="go" data-q="\${q.id}">Claim 🔶\${q.reward}</button>\`:\`<span class="pr" style="color:var(--mute);font-size:13px">\${q.claimed?"Claimed ✓":"🔶 "+q.reward}</span>\`}</div><div class="bar"><i style="width:\${Math.min(100,Math.round(100*q.prog/q.goal))}%"></i></div></div>\`).join("");
 c.innerHTML=h;if(sv==="account")setCard($("setcard"),P(uid),uid)}
$("set").addEventListener("click",e=>{const b=e.target.closest("[data-sv]");if(b){if(b.dataset.sv==="pro"){closeSettings();openPro();return}sv=b.dataset.sv;drawSettings();return}
 if(e.target.closest("#sx")){if(sv){sv=null;drawSettings()}else closeSettings();return}
 const s=e.target.closest("[data-set]");if(s&&s.type!=="color"&&s.type!=="range"){SET[s.dataset.set]=s.dataset.v;saveSet();drawSettings();return}
 const p=e.target.closest("[data-pp]");if(p){patchProfile({[p.dataset.pp]:p.dataset.pp==="nofr"?+p.dataset.v:p.dataset.v});return}
 const st=e.target.closest("[data-st]");if(st){shopTab=st.dataset.st;drawSettings();return}
 const sh=e.target.closest("[data-shop]");if(sh){if(sh.dataset.act==="buy")send({t:"buy",id:sh.dataset.shop});else equip(sh.dataset.shop);return}
 const q=e.target.closest("[data-q]");if(q){send({t:"qclaim",id:q.dataset.q});return}
 if(e.target.id==="sedit"){closeSettings();startOnb(true)}if(e.target.id==="slogout")$("logout").click();
 if(e.target.id==="bkd")location.href="/backup?token="+encodeURIComponent(ls.get("huddle_token")||"")});
$("set").addEventListener("change",async e=>{if(e.target.id!=="bkr")return;const f=e.target.files[0];e.target.value="";if(!f)return;
 try{const r=await fetch("/restore?token="+encodeURIComponent(ls.get("huddle_token")||""),{method:"POST",body:f});if(!r.ok)throw 0;toast("Restored. Reloading…");setTimeout(()=>location.reload(),1200)}catch(x){toast("That backup couldn’t be restored.")}});
$("set").addEventListener("input",e=>{const k=e.target.dataset.set;if(!k||(e.target.type!=="color"&&e.target.type!=="range"))return;SET[k]=e.target.value;saveSet()});
const _handle=handle;
handle=function(m){_handle(m);
 if(m.t==="wallet")wallet=m;
 else if(m.t==="msg"&&m.m&&m.m.uid!==uid&&+SET.snd&&cur&&cur.t!=="v"&&m.sid===(cur.t==="d"?"@dm":curS)&&cur.c===m.ch)beep();
 else if(m.t==="mu"&&cur&&cur.t!=="v"&&m.sid===(cur.t==="d"?"@dm":curS)&&cur.c===m.ch){const x=msgs.find(q=>q.id===m.id);if(x){x.text=m.text;x.ed=1;render()}}
 else if(m.t==="md"&&cur&&cur.t!=="v"&&m.sid===(cur.t==="d"?"@dm":curS)&&cur.c===m.ch){msgs=msgs.filter(q=>q.id!==m.id);render()}
 if(setOpen&&(m.t==="profiles"||m.t==="wallet"||m.t==="pro"||m.t==="finfo"))drawSettings()};
applyTheme();

/* voice */
function voiceUi(){if(!cur||cur.t!=="v")return;const here=call&&call.sid===curS&&call.slug===cur.c;$("join").classList.toggle("hide",!!here);
 const ids=vcUsers(cur.c);
 $("tiles").innerHTML=ids.length?ids.map(u=>{let st="";if(here&&u!==uid){const p=call.pcs[u],s=p?p.connectionState:"new";st=s==="connected"?"Connected":s==="failed"?"Failed, retrying…":"Connecting…"}
  return \`<div class="tile\${u===uid?" me":""}" data-u="\${esc(u)}">\${av(u)}<span>\${nameHTML(u)}</span>\${st?\`<small>\${st}</small>\`:""}</div>\`}).join(""):'<p class="empty" style="margin:0">Nobody is here yet. Join to start a call.</p>'}
$("join").onclick=()=>joinCall(cur.c);
const speakers={};let actx=null;
function watch(id,stream){try{actx=actx||new(window.AudioContext||window.webkitAudioContext)();if(actx.state==="suspended")actx.resume();
 const an=actx.createAnalyser();an.fftSize=256;actx.createMediaStreamSource(stream).connect(an);speakers[id]={an,buf:new Uint8Array(an.frequencyBinCount)}}catch(e){}}
setInterval(()=>{document.querySelectorAll(".tile[data-u]").forEach(t=>{const s=speakers[t.dataset.u];let on=false;if(s&&call){s.an.getByteFrequencyData(s.buf);on=s.buf.reduce((a,b)=>a+b,0)/s.buf.length>18}t.classList.toggle("speak",on)})},150);
function mk(peer,init){const c=call;const pc=new RTCPeerConnection({iceServers:ICE});c.pcs[peer]=pc;
 c.stream.getTracks().forEach(t=>pc.addTrack(t,c.stream));
 pc.onicecandidate=e=>{if(e.candidate)send({t:"sig",to:peer,k:"ice",d:e.candidate.toJSON()})};
 pc.ontrack=e=>{let a=c.els[peer];if(!a){a=c.els[peer]=document.createElement("audio");a.autoplay=true;a.playsInline=true;document.body.appendChild(a)}a.srcObject=e.streams[0];a.play&&a.play().catch(()=>{});watch(peer,e.streams[0])};
 pc.onconnectionstatechange=()=>{voiceUi();if(pc.connectionState==="failed"&&call===c&&c.pcs[peer]===pc){dropPeer(peer);if(uid<peer)setTimeout(()=>{if(call===c)syncCall()},1500);else send({t:"sig",to:peer,k:"retry"})}};
 if(init)pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>send({t:"sig",to:peer,k:"offer",d:pc.localDescription.toJSON()}));
 return pc}
function dropPeer(p){const c=call;if(!c)return;if(c.pcs[p]){const pc=c.pcs[p];delete c.pcs[p];pc.onconnectionstatechange=null;pc.close()}if(c.els[p]){c.els[p].remove();delete c.els[p]}delete c.q[p];delete speakers[p]}
function syncCall(){const c=call,us=Object.keys(pres).filter(u=>pres[u]===c.key);
 us.forEach(u=>{if(u!==uid&&uid<u&&!c.pcs[u])mk(u,true)});Object.keys(c.pcs).forEach(p=>{if(!us.includes(p))dropPeer(p)});voiceUi()}
async function onSig(m){const c=call;if(!c)return;const from=m.from,x=m.d;
 try{
  if(m.k==="retry"){dropPeer(from);if(uid<from)setTimeout(()=>{if(call===c)syncCall()},500)}
  else if(m.k==="offer"){dropPeer(from);const pc=mk(from,false);await pc.setRemoteDescription(x);for(const i of c.q[from]||[])await pc.addIceCandidate(i);c.q[from]=[];const a=await pc.createAnswer();await pc.setLocalDescription(a);send({t:"sig",to:from,k:"answer",d:pc.localDescription.toJSON()})}
  else if(m.k==="answer"){const pc=c.pcs[from];if(pc){await pc.setRemoteDescription(x);for(const i of c.q[from]||[])await pc.addIceCandidate(i);c.q[from]=[]}}
  else if(m.k==="ice"){const pc=c.pcs[from];if(pc&&pc.remoteDescription)await pc.addIceCandidate(x);else(c.q[from]=c.q[from]||[]).push(x)}
 }catch(e){}}
async function joinCall(slug){
 if(call)hangup();
 if(!navigator.mediaDevices||!window.RTCPeerConnection)return toast("Calls need a secure (https) address and a modern browser.");
 let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}})}catch(e){return micErr(e)}
 const sid=curS;call={sid,slug,key:sid+"."+slug,stream,pcs:{},q:{},els:{},muted:false};watch(uid,stream);send({t:"vc",sid,slug});
 $("cbar").classList.remove("hide");$("cname").textContent=(servers[sid]?servers[sid].name+" · ":"")+lbl(slug);$("mute").className="ib";$("mute").textContent="🎤";voiceUi()}
function hangup(){const c=call;if(!c)return;Object.keys(c.pcs).forEach(dropPeer);call=null;c.stream.getTracks().forEach(t=>t.stop());Object.keys(speakers).forEach(k=>delete speakers[k]);
 send({t:"vc",sid:null});$("cbar").classList.add("hide");voiceUi()}
$("hang").onclick=hangup;
$("mute").onclick=()=>{if(!call)return;call.muted=!call.muted;call.stream.getAudioTracks().forEach(t=>t.enabled=!call.muted);$("mute").className="ib"+(call.muted?" on":"");$("mute").textContent=call.muted?"🔇":"🎤"};
addEventListener("pagehide",()=>{if(call)hangup()});
connect();
</script>
</body>
</html>
`;
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
    db.users[name]={id:crypto.randomBytes(6).toString("hex"),salt,hash:hash(pass,salt).toString("hex"),profile:null,ts:Date.now
