import {loadEncoder,encodeCanvas} from './vision-encoder.js';
import {FEATURE_VERSION,combineFeatures,assignEvents,splitEpisodes,trainPolicy,serializePolicy,deserializePolicy,predict} from './learning-core.js';
import {addSample,allSamples,datasetStats,getMeta,setMeta,removeTail} from './learning-store.js';
const video=document.createElement('video');video.muted=true;video.autoplay=true;
const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;const ctx=canvas.getContext('2d',{willReadFrequently:true});
document.body.append(video,canvas);
let stream=null,timer=null,generation=0,working=false,mode=null,previous=null,pending=[],episode=null,runId=null,dirty=false,wasRunning=false,holdAt=0,total=0,policy=null;
const progress=patch=>chrome.runtime.sendMessage({type:'learning-progress',patch}).catch(()=>{});
async function flush(before){
  const ready=pending.filter(f=>f.at<before);pending=pending.filter(f=>f.at>=before);
  for(const frame of ready){if(frame.conflict)continue;const label=frame.label||'hold';if(label==='hold'&&frame.at-holdAt<350)continue;if(label==='hold')holdAt=frame.at;
    if(total>=6000)throw new Error('Dataset limit reached (6,000 frames). Export your data before clearing it.');
    await addSample({episode:frame.episode,at:frame.at,features:frame.features,label});total++;
  }
}
async function stop(){generation++;clearTimeout(timer);if(stream){for(const t of stream.getTracks()){t.onended=null;t.stop();}}stream=null;video.srcObject=null;const oldMode=mode;mode=null;if(oldMode==='record')await flush(Infinity);pending=[];previous=null;episode=null;return datasetStats();}
async function tick(run){
  if(working||run!==generation||!mode)return;working=true;
  try{
    const data=await chrome.runtime.sendMessage({type:'learning-sample'});
    if(run!==generation)return;
    if(data?.error)throw new Error(data.error);
    if(!data?.scene)throw new Error('No game observer response');
    if(data.emergency){await chrome.runtime.sendMessage({type:'learning-stop',reason:'Stopped with Esc'});return;}
    const s=data.scene,active=s.running&&data.focused;
    if(mode==='record'){
      assignEvents(pending,data.events||[]);
      if((wasRunning&&!s.running&&!s.paused)||(s.collected>0&&!dirty)){
        if(episode){await removeTail(episode,Date.now()-900);total=(await datasetStats()).samples;}pending=[];previous=null;dirty=s.collected>0;episode=null;
      }
      if(active&&(!episode||s.runId!==runId)){
        if(s.collected===0){episode=crypto.randomUUID();dirty=false;previous=null;holdAt=0;}
        runId=s.runId;
      }
      wasRunning=s.running;
    }
    if(!active||mode==='record'&&(dirty||!episode)){previous=null;await progress({message:dirty?'Coin collected — waiting for a clean run':'Armed — start/resume the game'});return;}
    if(!video.videoWidth)throw new Error('Tab capture has not produced video frames');
    const crop=data.crop||{left:0,top:0,right:1,bottom:1},w=video.videoWidth,h=video.videoHeight;
    // Omit the top HUD band while preserving all three road lanes.
    const top=crop.top+(crop.bottom-crop.top)*.12;
    ctx.drawImage(video,crop.left*w,top*h,(crop.right-crop.left)*w,(crop.bottom-top)*h,0,0,224,224);
    const at=Date.now(),encoded=await encodeCanvas(canvas);
    if(run!==generation)return;
    const features=combineFeatures(encoded.features,previous,s);previous=encoded.features;
    if(mode==='record'){
      pending.push({at,features,episode});assignEvents(pending,data.events||[]);await flush(Date.now()-450);
      await progress({message:'Recording your play — no movement injected',recorded:total,inferenceMs:encoded.ms});
    }else{
      const decision=predict(policy,features);
      await chrome.runtime.sendMessage({type:'learning-decision',decision,mode});
      await progress({message:mode==='observe'?`Learned preview: ${decision.action}`:`Learned control: ${decision.action}`,decision,inferenceMs:encoded.ms});
    }
  }catch(e){await chrome.runtime.sendMessage({type:'learning-stop',reason:`Learning error: ${e.message}`}).catch(()=>{});}
  finally{working=false;if(run===generation&&mode)timer=setTimeout(()=>void tick(run),125);}
}
async function start(m){
  await stop();const run=generation;mode=m.mode;total=(await datasetStats()).samples;wasRunning=false;dirty=false;runId=null;
  try{
    await loadEncoder();
    if(mode!=='record'){
      const stored=(await getMeta('model'))?.value;if(!stored)throw new Error('Record at least two runs and train a model first');
      policy=deserializePolicy(stored.model);
    }
    const capture=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:m.streamId,maxFrameRate:15}}});
    if(run!==generation){capture.getTracks().forEach(t=>t.stop());throw new Error('Recording cancelled');}
    stream=capture;video.srcObject=stream;await video.play();
    stream.getVideoTracks()[0].onended=()=>void chrome.runtime.sendMessage({type:'learning-stop',reason:'Capture ended'});
    timer=setTimeout(()=>void tick(run),350);return {ok:true};
  }catch(e){await stop();throw e;}
}
let training=false,cancelTraining=false;
async function train(){
  if(training)throw new Error('Training is already running');
  await stop();training=true;cancelTraining=false;
  try{
    const samples=(await allSamples()).filter(s=>s.version===FEATURE_VERSION),split=splitEpisodes(samples);
    await progress({training:true,message:'Training the small control head locally'});
    const result=await trainPolicy(split.train,split.validation,{isCancelled:()=>cancelTraining,onProgress:p=>void progress({training:true,message:`Training epoch ${p.epoch}/${p.epochs}`,trainingProgress:p})});
    const summary={trainedAt:Date.now(),version:FEATURE_VERSION,validation:result.validation,trainingCounts:result.trainingCounts,trainingSamples:split.train.length,validationEpisodes:split.validationEpisodes};
    await setMeta('model',{model:serializePolicy(result.model),summary});
    await progress({training:false,message:'Model saved. Test in learned observation mode first.',stats:await datasetStats()});
  }catch(e){await progress({training:false,message:`Training failed: ${e.message}`});}
  finally{training=false;}
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||m.to!=='learner')return;
  const run=async()=>{
    if(m.type==='start'){if(training)throw new Error('Wait for training to finish');return start(m);}
    if(m.type==='stop'){cancelTraining=true;return {ok:true,stats:await stop()};}
    if(m.type==='train'){if(training)throw new Error('Training is already running');void train();return {ok:true};}
    return {ok:true};
  };
  run().then(reply,e=>reply({error:e.message}));return true;
});
