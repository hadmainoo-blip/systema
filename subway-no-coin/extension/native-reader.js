// Serialized into the game page through the debugger; keep all dependencies inside this function.
export function installLegacyReader(profile) {
  if (window.__noCoinPilotReader) window.__noCoinPilotReader.stop();
  const m=window.unityGame?.Module, a=m?.asm;
  if(!m || !a || !m.HEAPU8) throw new Error('Legacy Unity module is not ready. Start the game first.');
  if(!String(m.wasmCodeUrl).includes(`player-${profile.playerHash}.wasm`)) throw new Error('Unsupported game build. Native offsets have not been verified for this player.');
  // Exports/heap exist before Unity has initialized its singleton instances.
  // Calling into them during the splash screen can fault inside the engine.
  if(m.calledRun!==true)throw new Error('Legacy Unity runtime is not ready. Wait for the game to finish loading.');
  for(const k of ['dynCall_ii','dynCall_iii','dynCall_viii','dynCall_vifffii','stackSave','stackAlloc','stackRestore']) {
    if(typeof a[k]!=='function' && typeof m[k]!=='function') throw new Error(`Missing runtime API: ${k}`);
  }
  const ptr=p=>Number.isInteger(p)&&p>=1024&&p+8<m.HEAPU8.length&&(p&3)===0;
  const u=p=>{if(!ptr(p))throw new Error(`Invalid memory reference ${p}`);return m.HEAPU32[p>>>2];};
  const f=p=>{if(!ptr(p))throw new Error('Invalid float reference');const v=m.HEAPF32[p>>>2];if(!Number.isFinite(v))throw new Error('Invalid position');return v;};
  const str=p=>{if(!Number.isInteger(p)||p<1024||p>=m.HEAPU8.length)return '';let s='';for(let i=0;i<160&&p+i<m.HEAPU8.length;i++){const c=m.HEAPU8[p+i];if(!c)break;s+=String.fromCharCode(c);}return s;};
  const cls=p=>ptr(p)?str(u(u(p)+8)):'';
  const managedString=p=>{if(!ptr(p))return '';const n=u(p+8);if(n>200)return '';return String.fromCharCode(...m.HEAPU16.slice((p+12)>>>1,((p+12)>>>1)+n));};
  const vec=p=>({x:f(p),y:f(p+4),z:f(p+8)});
  const native=(name,...args)=>(a[name]||m[name])(...args);
  function bufferRead(bytes,fn){const sp=native('stackSave');try{const p=native('stackAlloc',bytes);fn(p);return Array.from(m.HEAPF32.slice(p>>>2,(p+bytes)>>>2));}finally{native('stackRestore',sp);}}
  function world(transform){if(!ptr(transform))throw new Error('Missing transform');const v=bufferRead(16,out=>native('dynCall_viii',profile.transformPosition,transform,out,0));if(!v.slice(0,3).every(Number.isFinite))throw new Error('Bad transform position');return {x:v[0],y:v[1],z:v[2]};}
  function bounds(collider){const v=bufferRead(24,out=>native('dynCall_viii',profile.colliderBounds,collider,out,0));if(!v.every(Number.isFinite)||v.slice(3).some(x=>x<0||x>10000))throw new Error('Bad collider bounds');return {x:v[0],y:v[1],z:v[2],hx:v[3],hy:v[4],hz:v[5]};}
  function array(p,limit){if(!ptr(p))return [];const n=u(p+profile.arrayLength);if(n>limit)throw new Error('Array exceeds reader limit');if(p+profile.arrayData+n*4>m.HEAPU8.length)throw new Error('Array exceeds memory');return Array.from(m.HEAPU32.slice((p+profile.arrayData)>>>2,((p+profile.arrayData)>>>2)+n)).filter(ptr);}
  function list(p){if(!ptr(p))return [];const n=u(p+profile.listCount);if(n>profile.maxObjects)throw new Error('List exceeds reader limit');return array(u(p+profile.listItems),profile.maxObjects*4).slice(0,n);}
  const coins=new Map(), cache=new Map();let samples=0, errors=0, lastError='', stopped=false, collected=0, runId=0, lastObstacleAt=-Infinity, obstacles=[];
  const original=m.dynCall_vifffii;
  function hook(index,coin,...args){
    const result=original.call(this,index,coin,...args);
    try{
      if(!stopped && index===profile.coinUpdate && cls(coin)==='Coin') {
        if(m.HEAPU8[coin+profile.coinActive]) {
          const previous=coins.get(coin);if(previous&&performance.now()-previous.seen<50)return result;
          if(coins.size>=profile.maxCoins&&!coins.has(coin))coins.delete(coins.keys().next().value);
          const transform=world(u(coin+profile.coinTransform)),collider=u(coin+profile.coinCollider);
          coins.set(coin,{id:coin,...transform,...(ptr(collider)?bounds(collider):{}),seen:performance.now()});samples++;
        }else coins.delete(coin);
      }
    }catch(e){errors++;lastError=e.message;}
    // Older Emscripten wrappers replace themselves on first invocation.
    if(!stopped && m.dynCall_vifffii!==hook)m.dynCall_vifffii=hook;
    return result;
  }
  m.dynCall_vifffii=hook;
  function onEvent(e){const type=e.detail?.type;if(type==='reborn:coinCollected')collected++;if(type==='reborn:runStarted'){collected=0;runId++;coins.clear();cache.clear();obstacles=[];lastObstacleAt=-Infinity;}}
  window.addEventListener('tro:unity-runtime-event',onEvent);
  function physicsObstacles(player) {
    const found=new Map(),sp=native('stackSave');
    try{
      const origin=native('stackAlloc',16),direction=native('stackAlloc',16);
      m.HEAPF32[direction>>>2]=0;m.HEAPF32[(direction+4)>>>2]=0;m.HEAPF32[(direction+8)>>>2]=-1;
      for(const x of [-20,0,20])for(const y of [3,12,25]){
        m.HEAPF32[origin>>>2]=x;m.HEAPF32[(origin+4)>>>2]=player.y+y;m.HEAPF32[(origin+8)>>>2]=player.z+350;
        const hits=native('dynCall_iiifiii',profile.raycastAll,origin,direction,380,-1,2,0);
        if(!ptr(hits))continue;
        const count=u(hits+12);if(count>300)throw new Error('Too many raycast results');
        for(let i=0;i<count;i++){
          const hit=hits+16+i*profile.raycastHitSize;
          const collider=native('dynCall_iii',profile.raycastHitCollider,hit-8,0);
          if(!ptr(collider)||found.has(collider))continue;
          const b=bounds(collider);
          if(b.y+b.hy<1.2||b.hx>150||b.hz>600||b.z+b.hz<player.z-15)continue;
          const name=managedString(native('dynCall_iii',profile.objectName,collider,0));
          const tag=managedString(native('dynCall_iii',profile.componentTag,collider,0));
          if(/player|character|coin/i.test(tag+' '+name))continue;
          const trigger=!!native('dynCall_iii',profile.colliderTrigger,collider,0);
          // Mission zones score jumps/rolls; they are not physical obstacles.
          if(trigger&&!/^Hit/.test(tag)&&!/magnet|jetpack|pickup|powerup/i.test(tag+' '+name))continue;
          found.set(collider,{id:collider,...b,name,tag,kind:'obstacle'});
        }
      }
      return [...found.values()];
    }finally{native('stackRestore',sp);}
  }
  const api={
    queryObstacles(){const ch=native('dynCall_ii',profile.characterInstance,0);return physicsObstacles(vec(ch+profile.characterWorld));},
    snapshot(){
      if(stopped)throw new Error('Reader stopped');
      const character=native('dynCall_ii',profile.characterInstance,0),game=native('dynCall_ii',profile.gameInstance,0);
      if(cls(character)!=='Character'||cls(game)!=='Game')throw new Error('Runtime classes do not match verified profile');
      const player=vec(character+profile.characterWorld),lane=m.HEAP32[(character+profile.characterLane)>>>2];
      if(lane<0||lane>2||Math.abs(player.x)>1000)throw new Error('Invalid lane or character position');
      const now=performance.now(),running=Boolean(a.legacy_running?.value)&&!m.HEAPU8[game+profile.gamePaused]&&!m.HEAPU8[game+profile.gameDead];
      if(running&&now-lastObstacleAt>180){
        const elapsed=(now-lastObstacleAt)/1000,previous=new Map(obstacles.map(o=>[o.id,o]));
        obstacles=physicsObstacles(player);
        for(const o of obstacles){
          o.velocityZ=0;o.observedAt=now;const old=previous.get(o.id);
          if(elapsed>=.05&&elapsed<=.6&&old?.tag===o.tag&&old?.name===o.name&&Math.abs(old.x-o.x)<1){
            const velocity=(o.z-old.z)/elapsed;
            if(Number.isFinite(velocity)&&Math.abs(velocity)<=Math.max(300,f(game+profile.gameSpeed)*3))o.velocityZ=velocity;
          }
        }
        lastObstacleAt=now;
      }
      const active=[];
      for(const [id,c]of coins){if(now-c.seen>500||!m.HEAPU8[id+profile.coinActive]){coins.delete(id);continue;}if(c.z>player.z-15&&c.z<player.z+350)active.push({id:c.id,x:c.x,y:c.y,z:c.z,hx:c.hx??3,hy:c.hy??5,hz:c.hz??3});}
      const stats=u(game+profile.gameStats);const runCoins=ptr(stats)?u(stats+profile.statsCoins):collected;
      return {source:profile.id,running,paused:!!m.HEAPU8[game+profile.gamePaused],dead:!!m.HEAPU8[game+profile.gameDead],runId,collected:runCoins,lane,player,gamePosition:vec(character+profile.characterGame),speed:f(game+profile.gameSpeed),changing:!!m.HEAP32[(character+profile.characterTrackMovement)>>>2],jumping:!!m.HEAPU8[character+profile.characterJumping],rolling:!!m.HEAPU8[character+profile.characterRolling],gravity:f(character+profile.characterGravity),jumpHeight:f(character+profile.characterJumpHeight),verticalSpeed:f(character+profile.characterVerticalSpeed),groundY:f(character+profile.characterGroundY),body:bounds(u(character+profile.characterTrigger)),coins:active,obstacles,samples,errors,lastError,at:now};
    },
    pause(){const game=native('dynCall_ii',profile.gameInstance,0);native('dynCall_viii',profile.pause,game,1,0);},
    steer(targetX,dt=.04){
      if(!Number.isFinite(targetX)||targetX < -20||targetX > 20)return false;
      const ch=native('dynCall_ii',profile.characterInstance,0),game=native('dynCall_ii',profile.gameInstance,0);
      if(!a.legacy_running?.value||m.HEAPU8[game+profile.gamePaused]||m.HEAPU8[game+profile.gameDead])return false;
      // MoveForward consumes this lateral target; collision and pickup handlers stay active.
      const current=f(ch+profile.characterX)-profile.coordinateOffset,delta=Math.max(-100*Math.min(.06,dt),Math.min(100*Math.min(.06,dt),targetX-current));
      m.HEAPF32[(ch+profile.characterX)>>>2]=current+delta+profile.coordinateOffset;return true;
    },
    act(action){
      const state=api.snapshot();if(!state.running||!document.hasFocus())return false;
      const character=native('dynCall_ii',profile.characterInstance,0);
      if(action==='left'||action==='right'){if(state.changing)return false;const delta=action==='left'?-1:1;if(state.lane+delta<0||state.lane+delta>2)return false;native('dynCall_viii',profile.changeTrack,character,delta,0);return true;}
      if(action==='jump'&&!state.jumping&&!state.rolling){native('dynCall_vii',profile.jump,character,0);return true;}
      if(action==='roll'&&!state.rolling){native('dynCall_vii',profile.roll,character,0);return true;}
      return false;
    },
    stop(){stopped=true;if(m.dynCall_vifffii===hook)m.dynCall_vifffii=original;window.removeEventListener('tro:unity-runtime-event',onEvent);coins.clear();cache.clear();if(window.__noCoinPilotReader===api)delete window.__noCoinPilotReader;}
  };
  window.__noCoinPilotReader=api;
  return {installed:true,profile:profile.id};
}
