import {validate, perceive, decide} from './core.js';
const video = document.querySelector('video'), canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', {willReadFrequently:true});
let stream, timer, config, working=false;
function stop() {clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if (sender.id !== chrome.runtime.id || m.to !== 'vision') return;
  if (m.type==='stop') {stop();reply({ok:true});return;}
  if (m.type!=='start') return;
  (async()=>{
    stop();config=validate(m.config);
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:m.streamId,maxFrameRate:30}}});
    video.srcObject=stream;await video.play();
    stream.getVideoTracks()[0].onended=()=>void chrome.runtime.sendMessage({type:'stop'});
    timer=setInterval(async()=>{
      if (working || !video.videoWidth) return;
      working=true;
      try {
        const sw=video.videoWidth,sh=video.videoHeight;
        canvas.width=240;canvas.height=Math.max(80,Math.round(240*(sh*(config.bottom-config.top))/(sw*(config.right-config.left))));
        ctx.drawImage(video,sw*config.left,sh*config.top,sw*(config.right-config.left),sh*(config.bottom-config.top),0,0,canvas.width,canvas.height);
        const scene=perceive(ctx.getImageData(0,0,canvas.width,canvas.height),config);
        const current=await chrome.runtime.sendMessage({type:'status'});
        if (!current.running) {stop();return;}
        const decision=decide(scene,current.lane,config);
        await chrome.runtime.sendMessage({type:'frame',action:decision.action,pause:decision.action==='pause'?decision.reason:null,telemetry:{costs:decision.costs,reason:decision.reason,preview:canvas.toDataURL('image/jpeg',.6)}});
      } catch(e) {stop();await chrome.runtime.sendMessage({type:'stop'});} finally {working=false;}
    },70);
    return {ok:true};
  })().then(reply,e=>{stop();reply({error:e.message});});return true;
});
