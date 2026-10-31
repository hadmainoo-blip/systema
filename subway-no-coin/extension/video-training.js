import {combineFeatures,labelCounts} from './learning-core.js';
import {validateVideoPlan,videoSample,seekVideo,drawVideoCrop} from './video-core.js';
import {encodeCanvas} from './vision-encoder.js';
import {datasetStats,importVideoSamples} from './learning-store.js';
const $=id=>document.getElementById(id),video=$('video'),canvas=$('cropPreview'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let annotations=[],objectUrl=null,busy=false,cancelled=false,watchTraining=false;
const status=message=>{$('status').textContent=message;};
const crop=()=>Object.fromEntries(['left','top','right','bottom'].map(k=>[k,Number($(k).value)]));
const plan=()=>validateVideoPlan({sourceId:$('sourceId').value,start:Number($('startTime').value),end:Math.min(Number($('endTime').value),video.duration),crop:crop(),annotations});
function saveDraft(){localStorage.setItem('no-coin-video-draft',JSON.stringify({sourceId:$('sourceId').value,start:$('startTime').value,end:$('endTime').value,crop:crop(),annotations}));}
function render(){
  const counts=labelCounts(annotations.map(a=>({label:a.action})));$('counts').textContent=`${annotations.length} labels · ${Object.entries(counts).map(([a,n])=>`${a}: ${n}`).join(' · ')}`;
  $('annotations').replaceChildren();
  for(const a of annotations){const li=document.createElement('li');li.textContent=`${a.time.toFixed(3)} s · ${a.action}`;const button=document.createElement('button');button.textContent='Remove';button.onclick=()=>{annotations=annotations.filter(x=>x!==a);render();saveDraft();};li.append(button);$('annotations').append(li);}
}
try{const draft=JSON.parse(localStorage.getItem('no-coin-video-draft')||'null');if(draft){const valid=validateVideoPlan({...draft,start:Number(draft.start),end:Number(draft.end)});$('sourceId').value=valid.sourceId;$('startTime').value=valid.start;$('endTime').value=valid.end;for(const k of Object.keys(valid.crop))$(k).value=valid.crop[k];annotations=valid.annotations;}}catch{}
render();
async function stats(){const s=await datasetStats();$('dataset').textContent=`Saved dataset: ${s.samples} frames · ${s.episodes} runs · ${Object.entries(s.counts).map(([a,n])=>`${a}: ${n}`).join(' · ')}`;}
await stats();
function preview(){if(video.readyState>=2)drawVideoCrop(ctx,video,crop());}
video.addEventListener('seeked',preview);video.addEventListener('timeupdate',preview);
for(const id of ['sourceId','startTime','endTime','left','top','right','bottom'])$(id).onchange=()=>{preview();saveDraft();};
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;video.pause();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);
  try{
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('This video format could not be opened'));video.src=objectUrl;});
    const start=Number($('startTime').value);if(!Number.isFinite(start)||start<0||video.duration<=start)throw new Error('This video ends before the selected start time');
    $('endTime').value=Math.min(Number($('endTime').value),video.duration);$('seekTime').value=start;await seekVideo(video,start);preview();status(`Loaded ${file.name}. Mark actions from ${start.toFixed(3)} s; no unlabelled frames will be saved.`);
  }catch(e){status(e.message);}
};
async function seek(time){if(!video.videoWidth){status('Choose a local video first.');return;}video.pause();try{await seekVideo(video,Math.max(Number($('startTime').value),Math.min(time,video.duration,Number($('endTime').value))));preview();}catch(e){status(e.message);}}
$('back').onclick=()=>seek(video.currentTime-.1);$('forward').onclick=()=>seek(video.currentTime+.1);$('seek').onclick=()=>seek(Number($('seekTime').value));
for(const button of document.querySelectorAll('[data-action]'))button.onclick=()=>{
  if(!video.videoWidth){status('Choose a local video first.');return;}video.pause();const time=Number(video.currentTime.toFixed(3)),action=button.dataset.action;
  try{const next=annotations.filter(a=>Math.abs(a.time-time)>.0005).concat({time,action});validateVideoPlan({sourceId:$('sourceId').value,start:Number($('startTime').value),end:Math.min(Number($('endTime').value),video.duration),crop:crop(),annotations:next});annotations=next.sort((a,b)=>a.time-b.time);render();saveDraft();status(`Marked ${action} at ${time.toFixed(3)} s.`);}catch(e){status(e.message);}
};
$('clearLabels').onclick=()=>{if(annotations.length&&!confirm('Clear the video label draft? Saved training frames are kept.'))return;annotations=[];render();saveDraft();};
$('cancel').onclick=()=>{cancelled=true;status('Cancelling import…');};
$('import').onclick=async()=>{
  if(busy)return;if(!video.videoWidth){status('Choose a local video first.');return;}
  busy=true;cancelled=false;video.pause();$('settings').disabled=true;$('labelling').disabled=true;$('import').disabled=true;$('train').disabled=true;$('cancel').disabled=false;video.controls=false;
  const originalTime=video.currentTime;
  try{
    const p=plan();await chrome.runtime.sendMessage({type:'stop'});const samples=[];
    for(const a of p.annotations){
      if(cancelled)throw new Error('Import cancelled. No new frames were saved.');
      status(`Encoding labelled frame ${samples.length+1}/${p.annotations.length} locally…`);
      const at=Math.max(p.start,a.time-.125),before=Math.max(p.start,at-.125);
      await seekVideo(video,before);drawVideoCrop(ctx,video,p.crop);const previous=await encodeCanvas(canvas);
      await seekVideo(video,at);drawVideoCrop(ctx,video,p.crop);const current=await encodeCanvas(canvas);
      samples.push(videoSample(p,a,combineFeatures(current.features,previous.features,null)));
    }
    if(cancelled)throw new Error('Import cancelled. No new frames were saved.');
    await importVideoSamples(samples);await chrome.runtime.sendMessage({type:'learning-import-finished'});await stats();
    status(`Saved ${samples.length} explicitly labelled frames from ${p.sourceId}. Train with at least one other independent run. Re-importing the same timestamps replaces those samples.`);
  }catch(e){status(e.message);}finally{await seekVideo(video,originalTime).catch(()=>{});busy=false;$('settings').disabled=false;$('labelling').disabled=false;$('import').disabled=false;$('train').disabled=false;$('cancel').disabled=true;video.controls=true;preview();}
};
$('train').onclick=async()=>{const r=await chrome.runtime.sendMessage({type:'learning-train'});watchTraining=!r.error;status(r.error||r.message);};
setInterval(async()=>{try{if(busy)return;const s=await chrome.runtime.sendMessage({type:'status'});if(watchTraining){status(s.message);if(!s.training)watchTraining=false;}await stats();}catch{}},1500);
window.addEventListener('pagehide',()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);});
