import {defaults,validate,laneX} from './core.js';
const $=id=>document.getElementById(id), fields=['left','top','right','bottom','horizon','feet','center','spread','lookahead','coinWeight','obstacleWeight','cooldown'];
const saved=await chrome.storage.local.get(['config','lane','autoCrop','controls']);
for (const key of fields) {const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.type='number';input.step=key==='cooldown'?'10':'.01';input.id=key;input.value=(saved.config||defaults)[key]??defaults[key];label.append(input);$('fields').append(label);}
$('lane').value=String(saved.lane??1);$('autoCrop').checked=saved.autoCrop??true;$('controls').value=saved.controls||'site';
function read(){return validate(Object.fromEntries(fields.map(key=>[key,Number($(key).value)])));}
async function save(){const settings={config:read(),lane:Number($('lane').value),autoCrop:$('autoCrop').checked,controls:$('controls').value};await chrome.storage.local.set(settings);return settings;}
$('save').onclick=async()=>{try{await save();$('status').textContent='Saved. Close popup, resume game, press Alt+Shift+P.';}catch(e){$('status').textContent=e.message;}};
$('start').onclick=async()=>{try{const settings=await save();const s=await chrome.runtime.sendMessage({type:'start',...settings,dry:$('dry').checked});if(s.error)$('status').textContent=s.error;else window.close();}catch(e){$('status').textContent=e.message;}};
$('stop').onclick=()=>chrome.runtime.sendMessage({type:'stop'});
let painting=false;
setInterval(async()=>{try{const s=await chrome.runtime.sendMessage({type:'status'});if(document.activeElement?.id!=='save')$('status').textContent=s.message;$('metrics').textContent=`Lane: ${['left','middle','right'][s.lane]} · Moves: ${s.changes} · Frames: ${s.frames||0}\n${s.reason||''}`;
if(s.preview&&!painting){painting=true;const img=new Image();img.onload=()=>{try{const canvas=$('preview'),ctx=canvas.getContext('2d'),c=read();canvas.height=Math.round(canvas.width*img.height/img.width);ctx.drawImage(img,0,0,canvas.width,canvas.height);for(let lane=0;lane<3;lane++){ctx.strokeStyle=['#67a9ff','#6ae4c4','#df93ff'][lane];ctx.beginPath();ctx.moveTo(laneX(lane,0,c)*canvas.width,c.horizon*canvas.height);ctx.lineTo(laneX(lane,1,c)*canvas.width,c.feet*canvas.height);ctx.stroke();}}finally{painting=false;}};img.onerror=()=>{painting=false;};img.src=s.preview;}}catch(e){$('status').textContent=`Extension error: ${e.message}`;}},500);
