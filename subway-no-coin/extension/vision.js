import {validate, perceive, decide} from './core.js';
const video = document.querySelector('video'), canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', {willReadFrequently:true});
let stream, timer, config, working=false, generation=0;
function stop() {generation++;clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if (sender.id !== chrome.runtime.id || m.to !== 'vision') return;
  if (m.type==='stop') {stop();reply({ok:true});return;}
  if (m.type!=='start') return;
  (async()=>{
    stop();const run=generation;config=validate(m.config);
    const capture=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:m.streamId,maxFrameRate:30}}});
    if(run!==generation){capture.getTracks().forEach(t=>t.stop());throw new Error('Capture cancelled');}
    stream=capture;video.srcObject=stream;await video.play();
    stream.getVideoTracks()[0].onended=()=>void chrome.runtime.sendMessage({type:'stop',reason:'Tab capture ended'});
    const started=Date.now();let darkSince=0;
    timer=setInterval(async()=>{
      if (working || run!==generation) return;
      if (!video.videoWidth) {
        if(Date.now()-started>10000){stop();void chrome.runtime.sendMessage({type:'stop',reason:'No video frames after 10 seconds. Reload the extension and restart capture.'});}
        return;
      }
      working=true;
      try {
        const sw=video.videoWidth,sh=video.videoHeight;
        canvas.width=240;canvas.height=Math.max(80,Math.min(960,Math.round(240*(sh*(config.bottom-config.top))/(sw*(config.right-config.left)))));
        ctx.drawImage(video,sw*config.left,sh*config.top,sw*(config.right-config.left),sh*(config.bottom-config.top),0,0,canvas.width,canvas.height);
        const scene=perceive(ctx.getImageData(0,0,canvas.width,canvas.height),config);
        const current=await chrome.runtime.sendMessage({type:'status'});
        if(run!==generation)return;
        if(!current.running){stop();return;}
        const decision=decide(scene,current.lane,config);
        if(decision.action==='pause')darkSince ||= Date.now();else darkSince=0;
        // Brief black frames during startup or transitions must not kill capture immediately.
        await chrome.runtime.sendMessage({type:'frame',action:decision.action,pause:darkSince&&Date.now()-darkSince>3000?decision.reason:null,telemetry:{costs:decision.costs,reason:decision.reason,preview:canvas.toDataURL('image/jpeg',.6)}});
      } catch(e) {if(run===generation){stop();await chrome.runtime.sendMessage({type:'stop',reason:`Vision error: ${e.message}`});}} finally {working=false;}
    },70);
    return {ok:true};
  })().then(reply,e=>{stop();reply({error:e.message});});return true;
});
