// Paste into the browser console on the reference video's YouTube page.
// No uploads, external scripts, account access, or full-video download.
async function sampleNoCoinVideo({start=23,end=143,fps=8,maxBytes=24*1024*1024,download=true}={}){
  const video=document.querySelector('video');
  if(!video?.videoWidth||!Number.isFinite(video.duration))throw new Error('Wait for the video to load, then try again.');
  if(document.querySelector('.ad-showing'))throw new Error('Wait until the YouTube ad finishes.');
  if(location.hostname.endsWith('youtube.com')&&new URL(location.href).searchParams.get('v')!=='dkfO-fIHAuE')throw new Error('Open the reference video dkfO-fIHAuE first.');
  if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(fps)||start<0||end<=start||fps<=0||fps>15||!Number.isFinite(maxBytes)||maxBytes<4096)throw new Error('Invalid sampling range or size limit.');
  end=Math.min(end,video.duration);if(start>=end)throw new Error('This video is shorter than the requested start.');
  if(window.noCoinSamplerBusy)throw new Error('A sampler is already running. Use its Stop button first.');
  window.noCoinSamplerBusy=true;
  const originalTime=video.currentTime,wasPaused=video.paused,canvas=document.createElement('canvas'),button=document.createElement('button');
  canvas.width=Math.min(640,video.videoWidth);canvas.height=Math.round(video.videoHeight*canvas.width/video.videoWidth);
  const ctx=canvas.getContext('2d'),frames=[];let stopped=false,used=2048,reason='complete';
  const seek=time=>new Promise((resolve,reject)=>{
    if(Math.abs(video.currentTime-time)<.001&&video.readyState>=2){resolve();return;}
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',fail);};
    const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('Video seek failed. Keep the YouTube tab open and try again.'));};
    const timer=setTimeout(fail,30000);video.addEventListener('seeked',done,{once:true});video.addEventListener('error',fail,{once:true});video.currentTime=time;
  });
  button.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:16px;background:#6ae4c4;color:#111;font:16px sans-serif';
  button.textContent='Starting frame sampler…';button.onclick=()=>{stopped=true;};document.body.append(button);video.pause();
  try{
    const count=Math.ceil((end-start)*fps);
    for(let i=0;i<count;i++){
      if(stopped){reason='stopped';break;}
      button.textContent=`Stop sampling · ${i}/${count}`;
      const time=start+i/fps;await seek(time);if(stopped){reason='stopped';break;}
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const image=canvas.toDataURL('image/jpeg',.7),size=image.length+200;
      if(used+size>maxBytes){reason='size limit';break;}used+=size;frames.push({time:video.currentTime,image});
    }
    if(!frames.length)throw new Error('No frames were captured.');
    const result={format:'no-coin-video-frames-v1',source:{url:'https://youtu.be/dkfO-fIHAuE',runId:'ywoxj7nm',start,end,fps,width:canvas.width,height:canvas.height,reason},frames};
    const blob=new Blob([JSON.stringify(result)],{type:'application/json'});
    if(download){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='no-coin-frames.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);alert(`Saved ${frames.length} frames (${(blob.size/1048576).toFixed(1)} MB). Attach no-coin-frames.json in the chat.`);}
    return {frames:frames.length,bytes:blob.size,reason,first:frames[0].time,last:frames.at(-1).time};
  }finally{button.remove();window.noCoinSamplerBusy=false;video.currentTime=originalTime;if(!wasPaused)video.play().catch(()=>{});}
}

sampleNoCoinVideo().catch(error=>alert(`Frame sampling failed: ${error.message}`));
