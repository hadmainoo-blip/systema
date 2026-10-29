// Captures only game control events while the game owns focus. No page text or credentials.
export function installDemonstrator(){
  window.__noCoinDemonstrator?.stop();
  const reader=window.__noCoinPilotReader;if(!reader)throw new Error('Native game observer is not ready');
  let events=[],emergency=false,lastSeen=Date.now();
  const map={arrowleft:'left',arrowright:'right',arrowup:'jump',arrowdown:'roll',a:'left',d:'right',w:'jump',s:'roll'};
  for(const [key,action]of [['keyLeft','left'],['keyRight','right'],['keyUp','jump'],['keyDown','roll']]){try{const v=localStorage.getItem(key);if(v)map[v.toLowerCase()]=action;}catch{}}
  function key(e){if(e.key==='Escape'){emergency=true;return;}if(document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]'))return;if(!e.isTrusted||e.repeat||e.altKey||e.ctrlKey||e.metaKey||!document.hasFocus())return;const action=map[e.key.toLowerCase()];if(action&&events.length<100)events.push({action,at:Date.now()});}
  document.addEventListener('keydown',key,true);
  const api={
    sample(){lastSeen=Date.now();const scene=reader.snapshot(),input=events;events=[];const c=document.querySelector('canvas'),r=c?.getBoundingClientRect();return {scene,emergency,events:input,focused:document.hasFocus()&&!document.hidden,crop:r?{left:Math.max(0,r.left/innerWidth),top:Math.max(0,r.top/innerHeight),right:Math.min(1,r.right/innerWidth),bottom:Math.min(1,r.bottom/innerHeight)}:null,at:Date.now()};},
    act(action){return reader.act(action);},pause(){reader.pause();},
    stop(){clearInterval(watchdog);document.removeEventListener('keydown',key,true);events=[];reader.stop();if(window.__noCoinDemonstrator===api)delete window.__noCoinDemonstrator;}
  };
  const watchdog=setInterval(()=>{if(Date.now()-lastSeen>5000)api.stop();},1000);
  window.__noCoinDemonstrator=api;return {installed:true};
}
