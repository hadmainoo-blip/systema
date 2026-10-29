import {defaults,validate,laneX} from './core.js';
const $=id=>document.getElementById(id), fields=['left','top','right','bottom','horizon','feet','center','spread','lookahead','coinWeight','obstacleWeight','cooldown'];
const saved=await chrome.storage.local.get(['config','lane','autoCrop','controls','backend','precision','stopOnCoin','autoBrake','hud']);
for (const key of fields) {const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.type='number';input.step=key==='cooldown'?'10':'.01';input.id=key;input.value=(saved.config||defaults)[key]??defaults[key];label.append(input);$('fields').append(label);}
$('lane').value=String(saved.lane??1);$('autoCrop').checked=saved.autoCrop??true;$('controls').value=saved.controls||'site';$('backend').value=saved.backend||'auto';for(const k of ['precision','stopOnCoin','autoBrake','hud'])$(k).checked=saved[k]??true;
function read(){return validate(Object.fromEntries(fields.map(key=>[key,Number($(key).value)])));}
async function save(){const settings={config:read(),lane:Number($('lane').value),autoCrop:$('autoCrop').checked,controls:$('controls').value,backend:$('backend').value,precision:$('precision').checked,stopOnCoin:$('stopOnCoin').checked,autoBrake:$('autoBrake').checked,hud:$('hud').checked};await chrome.storage.local.set(settings);return settings;}
$('save').onclick=async()=>{try{await save();$('status').textContent='Saved. Close popup, resume game, press Alt+Shift+P.';}catch(e){$('status').textContent=e.message;}};
$('start').onclick=async()=>{try{const settings=await save();const s=await chrome.runtime.sendMessage({type:'start',...settings,dry:$('dry').checked});if(s.error)$('status').textContent=s.error;else window.close();}catch(e){$('status').textContent=e.message;}};
$('stop').onclick=()=>chrome.runtime.sendMessage({type:'stop'});
function drawNative(s){
 const c=$('preview');c.height=260;const ctx=c.getContext('2d'),scene=s.nativeScene;
 ctx.fillStyle='#101d2c';ctx.fillRect(0,0,c.width,c.height);
 const project=(x,z)=>({x:c.width/2+x*4,y:240-(z-scene.player.z)*.75});
 ctx.strokeStyle='#33465c';for(const x of [-30,-10,10,30]){ctx.beginPath();ctx.moveTo(c.width/2+x*4,0);ctx.lineTo(c.width/2+x*4,260);ctx.stroke();}
 for(const o of scene.obstacles){const p=project(o.x,o.z);ctx.fillStyle='#ec6a72';ctx.fillRect(p.x-o.hx*4,p.y-o.hz*.75,o.hx*8,Math.max(3,o.hz*1.5));}
 for(const o of scene.coins){const p=project(o.x,o.z);ctx.fillStyle='#ffc857';ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}
 const p=project(scene.player.x,scene.player.z);ctx.fillStyle='#6ae4c4';ctx.fillRect(p.x-5,p.y-6,10,12);
 ctx.fillStyle='#e8f0ff';ctx.font='12px system-ui';ctx.fillText(`Run coins: ${scene.collected} · z: ${scene.player.z.toFixed(0)}`,8,18);
}
let painting=false;
setInterval(async()=>{try{const s=await chrome.runtime.sendMessage({type:'status'});if(document.activeElement?.id!=='save')$('status').textContent=s.message;$('metrics').textContent=`Lane: ${['left','middle','right'][s.lane]} · Moves: ${s.changes} · Frames: ${s.frames||0}\n${s.reason||''}`;
if(s.nativeScene)drawNative(s);
if(!s.nativeScene&&s.preview&&!painting){painting=true;const img=new Image();img.onload=()=>{try{const canvas=$('preview'),ctx=canvas.getContext('2d'),c=read();canvas.height=Math.round(canvas.width*img.height/img.width);ctx.drawImage(img,0,0,canvas.width,canvas.height);for(let lane=0;lane<3;lane++){ctx.strokeStyle=['#67a9ff','#6ae4c4','#df93ff'][lane];ctx.beginPath();ctx.moveTo(laneX(lane,0,c)*canvas.width,c.horizon*canvas.height);ctx.lineTo(laneX(lane,1,c)*canvas.width,c.feet*canvas.height);ctx.stroke();}}finally{painting=false;}};img.onerror=()=>{painting=false;};img.src=s.preview;}}catch(e){$('status').textContent=`Extension error: ${e.message}`;}},500);
