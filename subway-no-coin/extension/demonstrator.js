// Captures only game control events while the game owns focus. No page text or credentials.
export function installDemonstrator(){
  window.__noCoinDemonstrator?.stop();
  const reader=window.__noCoinPilotReader;if(!reader)throw new Error('Native game observer is not ready');
  let events=[],emergency=false,lastSeen=Date.now(),previous=null;
  const keyboard=[];
  const map={arrowleft:'left',arrowright:'right',arrowup:'jump',arrowdown:'roll',a:'left',d:'right',w:'jump',s:'roll'};
  for(const [key,action]of [['keyLeft','left'],['keyRight','right'],['keyUp','jump'],['keyDown','roll']]){try{const v=localStorage.getItem(key);if(v)map[v.toLowerCase()]=action;}catch{}}
  const editing=()=>document.activeElement?.matches?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  function remember(action,at,source){if(events.length<100){events.push({action,at,source});if(source==='keyboard')keyboard.push({action,at});}}
  function key(e){if(e.key==='Escape'){emergency=true;return;}if(editing()||!e.isTrusted||e.repeat||e.altKey||e.ctrlKey||e.metaKey||!document.hasFocus())return;const action=map[String(e.key).toLowerCase()]||map[String(e.code).replace(/^Key/,'').toLowerCase()];if(action)remember(action,Date.now(),'keyboard');}
  // Window capture sees controls before canvas/document handlers stop propagation.
  window.addEventListener('keydown',key,true);
  const api={
    sample(){
      lastSeen=Date.now();const scene=reader.snapshot(),focused=document.hasFocus()&&!document.hidden;
      // Native transitions also catch remapped controls, gestures, and keys consumed by the game.
      if(focused&&!editing()&&scene.running&&previous?.running&&scene.runId===previous.runId){
        const actions=[];
        if(Number.isInteger(scene.lane)&&Number.isInteger(previous.lane)&&scene.lane!==previous.lane)actions.push(scene.lane<previous.lane?'left':'right');
        if(scene.jumping&&!previous.jumping)actions.push('jump');
        if(scene.rolling&&!previous.rolling)actions.push('roll');
        for(const action of actions){
          // Match each key press once. A cooldown would discard a second fast gesture.
          const match=keyboard.findIndex(e=>e.action===action&&lastSeen-e.at<=1000);
          if(match>=0)keyboard.splice(match,1);else remember(action,lastSeen,'state');
        }
      }
      for(let i=keyboard.length-1;i>=0;i--)if(lastSeen-keyboard[i].at>1000)keyboard.splice(i,1);
      previous=focused&&!editing()?scene:null;
      const input=events;events=[];const c=document.querySelector('canvas'),r=c?.getBoundingClientRect();
      return {scene,emergency,events:input,focused,crop:r?{left:Math.max(0,r.left/innerWidth),top:Math.max(0,r.top/innerHeight),right:Math.min(1,r.right/innerWidth),bottom:Math.min(1,r.bottom/innerHeight)}:null,at:lastSeen};
    },
    act(action){return reader.act(action);},pause(){reader.pause();},
    stop(){clearInterval(watchdog);window.removeEventListener('keydown',key,true);events=[];keyboard.length=0;reader.stop();if(window.__noCoinDemonstrator===api)delete window.__noCoinDemonstrator;}
  };
  const watchdog=setInterval(()=>{if(Date.now()-lastSeen>5000)api.stop();},1000);
  window.__noCoinDemonstrator=api;return {installed:true};
}
