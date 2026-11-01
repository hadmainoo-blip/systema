import {ACTIONS,FEATURE_VERSION} from './learning-core.js';

export const REFERENCE_RUN=Object.freeze({
  id:'ywoxj7nm',url:'https://www.speedrun.com/subsurf/runs/ywoxj7nm',
  videoUrl:'https://www.youtube.com/watch?v=dkfO-fIHAuE&t=23s',
  player:'FR_bilel',start:23,end:11525.9
});

export function validateVideoPlan({sourceId,start,end,crop,annotations}){
  if(typeof sourceId!=='string'||!sourceId.trim()||sourceId.length>200)throw new Error('Give each original run a stable source ID');
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error('Video end must be after its start');
  if(!crop||!['left','top','right','bottom'].every(k=>Number.isFinite(crop[k])&&crop[k]>=0&&crop[k]<=1)||crop.left>=crop.right||crop.top>=crop.bottom)throw new Error('Crop edges must enclose the game, between 0 and 1');
  if(!Array.isArray(annotations)||!annotations.length)throw new Error('Label some actions first; unlabelled footage is skipped');
  const times=new Set();
  for(const a of annotations){
    if(!ACTIONS.includes(a.action)||!Number.isFinite(a.time)||a.time<start||a.time>end)throw new Error('Each label needs an action and a time inside the selected video range');
    const key=Math.round(a.time*1000);if(times.has(key))throw new Error('Only one action can label each timestamp');times.add(key);
  }
  return {sourceId:sourceId.trim(),start,end,crop:{...crop},annotations:annotations.map(a=>({...a})).sort((a,b)=>a.time-b.time)};
}

export function videoSample(plan,annotation,features){
  if(features.length!==640||!Array.from(features).every(Number.isFinite))throw new Error('Invalid video feature vector');
  return {version:FEATURE_VERSION,episode:`video:${plan.sourceId}`,at:Math.round(annotation.time*1000),features,label:annotation.action,
    source:{kind:'video',id:plan.sourceId,time:annotation.time,observationTime:Math.max(plan.start,annotation.time-.125),start:plan.start,crop:plan.crop,labelMethod:'manual',sampleKey:`${plan.sourceId}:${Math.round(annotation.time*1000)}`}};
}

// Paused videos must seek before drawing; no wall-clock replay or key injection is used.
export async function seekVideo(video,time){
  if(video.readyState>=2&&Math.abs(video.currentTime-time)<.001)return;
  await new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',fail);};
    const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('Unable to decode this video frame'));};
    const timer=setTimeout(fail,15000);video.addEventListener('seeked',done,{once:true});video.addEventListener('error',fail,{once:true});video.currentTime=time;
  });
}

export function drawVideoCrop(ctx,video,crop){
  const top=crop.top+(crop.bottom-crop.top)*.12;
  ctx.drawImage(video,crop.left*video.videoWidth,top*video.videoHeight,(crop.right-crop.left)*video.videoWidth,(crop.bottom-top)*video.videoHeight,0,0,224,224);
}
