// Runs beside the game so steering does not depend on popup focus or tab capture.
export function startNativePilot(options, planner) {
  window.__noCoinPilotNative?.stop('Restarting');
  const reader=window.__noCoinPilotReader;
  if(!reader)throw new Error('Native reader was not installed');
  const previous=document.getElementById('no-coin-pilot-hud');previous?.remove();
  const hud=document.createElement('div');hud.id='no-coin-pilot-hud';
  hud.style.cssText='position:fixed;right:12px;top:12px;z-index:2147483647;pointer-events:none;background:#08141fe8;border:1px solid #51d9bc;border-radius:10px;color:#eafaff;font:12px/1.5 system-ui;padding:10px 14px;white-space:pre;max-width:280px;box-shadow:0 4px 24px #0006';
  if(options.hud!==false)document.documentElement.append(hud);
  let live=true,timer,heartbeat=performance.now(),lastTick=performance.now(),lastAction=-Infinity,nextPlan=0,decision={action:'hold',targetX:0},scene=null,started=null,lastRun=-1;
  let status={running:true,message:options.dry?'Native observation':'Native autopilot armed',lane:1,changes:0,frames:0,backend:'native',reason:'Waiting for a run',collected:0};
  const api={
    ping(){heartbeat=performance.now();return true;},
    status(){return {...status,nativeScene:scene?{...scene,coins:scene.coins.slice(0,120),obstacles:scene.obstacles.slice(0,100)}:null};},
    stop(reason='Stopped'){
      if(!live)return api.status();live=false;clearInterval(timer);
      status={...status,running:false,message:reason};
      document.removeEventListener('keydown',emergency,true);reader.stop();
      hud.textContent=`NO COIN PILOT\n${reason}\nAlt+Shift+P to restart`;
      return api.status();
    }
  };
  function emergency(e){if(e.key==='Escape'||(e.altKey&&e.shiftKey&&e.code==='KeyX'))api.stop('Emergency stop');}
  document.addEventListener('keydown',emergency,true);
  window.__noCoinPilotNative=api;
  timer=setInterval(()=>{
    try{
      const now=performance.now();
      if(now-heartbeat>3500){api.stop('Extension disconnected — stopped');return;}
      scene=reader.snapshot();status.frames++;
      status.lane=Math.max(0,Math.min(2,Math.round(scene.player.x/20)+1));status.collected=scene.collected;
      if(scene.runId!==lastRun){lastRun=scene.runId;started=null;status.changes=0;nextPlan=0;}
      const focused=document.hasFocus()&&!document.hidden;
      if(scene.running&&focused){
        started??=now;
        if(!options.dry&&options.stopOnCoin!==false&&scene.collected>0){reader.pause();api.stop('Coin collected — run paused');return;}
        if(now>=nextPlan){decision=planner(scene,{precision:options.precision!==false});nextPlan=now+100;}
        if(!options.dry&&options.autoBrake!==false&&decision.risk>0){
          const close=[...scene.coins,...scene.obstacles].some(o=>{
            const front=o.z-(o.hz||4.5)-scene.player.z-(scene.body?.hz||3);
            return front>=-2&&front<scene.speed*.45&&Math.abs(o.x-scene.player.x)<(o.hx||4.5)+(scene.body?.hx||3)&&Math.abs(o.y-(scene.body?.y||scene.player.y+5.5))<(o.hy||4.5)+(scene.body?.hy||5);
          });
          if(close){reader.pause();api.stop('No safe predicted path — game paused, take over');return;}
        }

        if(!options.dry){
          if(options.precision!==false)reader.steer(decision.targetX,Math.min(.06,(now-lastTick)/1000));
          if(now-lastAction>180&&reader.act(decision.action)){status.changes++;lastAction=now;}
        }
        status.message=options.dry?'Native observation — no movement':'Native autopilot active';
      }else status.message=!focused?'Waiting for game focus':'Waiting — resume/start the game';
      lastTick=now;status.reason=decision.reason||'Waiting';
      status.elapsed=started?(now-started)/1000:0;status.risk=decision.risk||0;
      hud.textContent=`NO COIN PILOT ${options.dry?'· OBSERVE':'· NATIVE'}\n${status.message}\nCoins this run: ${scene.collected} · Seen: ${scene.coins.length}\nObstacles: ${scene.obstacles.length} · x: ${scene.player.x.toFixed(1)}\n${decision.reason||'Waiting'}\nEsc / Alt+Shift+X: stop`;
      if(scene.errors>10)throw new Error(scene.lastError||'Repeated sensor errors');
      if(scene.running&&scene.speed>0&&scene.coins.length===0&&scene.samples===0&&status.elapsed>5)throw new Error('Coin update hook is not receiving samples');
    }catch(e){api.stop(`Error: ${e.message}`);}
  },25);
  return api.status();
}
