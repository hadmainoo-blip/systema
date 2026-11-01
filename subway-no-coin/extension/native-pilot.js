// Runs beside the game so steering does not depend on popup focus or tab capture.
export function startNativePilot(options, planner, workerPlanner=planner) {
  window.__noCoinPilotNative?.stop('Restarting');
  const reader=window.__noCoinPilotReader;
  if(!reader)throw new Error('Native reader was not installed');
  const previous=document.getElementById('no-coin-pilot-hud');previous?.remove();
  const hud=document.createElement('div');hud.id='no-coin-pilot-hud';
  hud.style.cssText='position:fixed;right:12px;top:12px;z-index:2147483647;pointer-events:none;background:#08141fe8;border:1px solid #51d9bc;border-radius:10px;color:#eafaff;font:12px/1.5 system-ui;padding:10px 14px;white-space:pre;max-width:280px;box-shadow:0 4px 24px #0006';
  if(options.hud!==false)document.documentElement.append(hud);
  let live=true,timer,heartbeat=performance.now(),lastTick=performance.now(),lastAction=-Infinity,lastChangingAt=-Infinity,nextPlan=0,decision={action:'hold',targetX:0},scene=null,started=null,lastRun=-1;
  let pendingLane=null;
  const lastKind={lane:-Infinity,jump:-Infinity,roll:-Infinity};
  let lastHudAt=-Infinity,lastHudText='';
  let planWorker=null,workerURL=null,request=null,requestId=0,workerLatency=12,decisionZ=-Infinity;
  let status={running:true,message:options.dry?'Native observation':'Native autopilot armed',lane:1,changes:0,frames:0,backend:'native',reason:'Waiting for a run',collected:0};
  const api={
    ping(){heartbeat=performance.now();return true;},
    status(){return {...status,nativeScene:scene?{...scene,coins:scene.coins.slice(0,120),obstacles:scene.obstacles.slice(0,100)}:null};},
    stop(reason='Stopped'){
      if(!live)return api.status();live=false;clearInterval(timer);
      closeWorker();
      if(!options.dry)try{reader.pause();}catch{}
      status={...status,running:false,message:reason};
      window.removeEventListener?.('keydown',emergency,true);reader.stop();
      hud.textContent=`NO COIN PILOT\n${reason}\nAlt+Shift+P to restart`;
      return api.status();
    }
  };
  function emergency(e){if(e.key==='Escape'||(e.altKey&&e.shiftKey&&e.code==='KeyX'))api.stop('Emergency stop');}
  window.addEventListener?.('keydown',emergency,true);
  function pauseAndStop(reason){return api.stop(reason);}
  function closeWorker(){planWorker?.terminate();planWorker=null;request=null;if(workerURL!==null){URL.revokeObjectURL(workerURL);workerURL=null;}}
  function planInterval(value){const until=Number.isFinite(value.nextActionIn)?value.nextActionIn*1000:200;return Math.max(25,Math.min(100,until/2));}
  function projectedScene(state,seconds){
    const player={...state.player},gravity=Math.max(10,state.gravity||200),floor=state.groundY??Math.min(player.y,1);
    player.z+=state.speed*seconds;
    let verticalSpeed=state.verticalSpeed||0;
    if(player.y>floor+.05||verticalSpeed>0){player.y=Math.max(floor,player.y+verticalSpeed*seconds-.5*gravity*seconds*(seconds+(state.engineStep||1/60)));verticalSpeed=player.y<=floor?0:verticalSpeed-gravity*seconds;}
    const target=state.changing&&Number.isInteger(state.targetLane)?state.targetLane:pendingLane;
    if(state.changing&&Number.isInteger(target))player.x+=Math.sign((target-1)*20-player.x)*Math.min(Math.abs((target-1)*20-player.x),(state.laneSpeed||state.speed/1.5)*seconds);
    const aligned=Number.isInteger(target)&&Math.abs(player.x-(target-1)*20)<.5;
    const body=state.body?{...state.body,x:state.body.x+player.x-state.player.x,y:state.body.y+player.y-state.player.y,z:(state.body.z??state.player.z)+player.z-state.player.z}:state.body;
    return {...state,player,body,verticalSpeed,changing:state.changing&&!aligned,lane:aligned?target:state.lane,at:(state.at||performance.now())+seconds*1000};
  }
  if(options.planningWorker!==false&&typeof Worker==='function'&&typeof Blob==='function'){
    try{
      // Only the pure search runs here. Native state, movement, stop handling
      // and the heartbeat stay on the game thread, which must keep rendering.
      workerURL=URL.createObjectURL(new Blob([`const plan=${workerPlanner.toString()};self.onmessage=({data})=>{const started=performance.now();try{const decision=plan(data.scene,data.settings);self.postMessage({id:data.id,decision,computeMs:performance.now()-started});}catch(e){self.postMessage({id:data.id,error:e.message});}};`],{type:'text/javascript'}));
      planWorker=new Worker(workerURL,{name:'no-coin-route-search'});status.planning='worker';
      planWorker.onerror=e=>{e.preventDefault?.();closeWorker();status.planning='main';nextPlan=0;};
      planWorker.onmessage=({data})=>{
        const pending=request;if(!live||!pending||data.id!==pending.id)return;
        request=null;const now=performance.now(),elapsed=now-pending.at;
        workerLatency=Math.min(150,workerLatency*.4+elapsed*.6);status.planLatencyMs=elapsed;status.planComputeMs=data.computeMs;
        if(data.error){closeWorker();status.planning='main';nextPlan=0;return;}
        // A response from before a command, a restart, a pause or a large
        // scheduling stall must never issue an obsolete movement command.
        if(pending.runId!==lastRun||pending.changes!==status.changes||!scene?.running||elapsed>250){nextPlan=0;return;}
        decision=data.decision;decisionZ=pending.projected.player.z;nextPlan=now+planInterval(decision);
        planner.onDecision?.({scene:pending.scene,predictedScene:pending.projected,settings:pending.settings,decision,computeMs:data.computeMs,latencyMs:elapsed});
      };
    }catch{closeWorker();status.planning='main';}
  }else status.planning='main';
  window.__noCoinPilotNative=api;
  timer=setInterval(()=>{
    try{
      const now=performance.now();
      if(now-heartbeat>3500){pauseAndStop('Extension disconnected — run paused');return;}
      scene=reader.snapshot();status.frames++;
      status.lane=Math.max(0,Math.min(2,Math.round(scene.player.x/20)+1));status.collected=scene.collected;
      if(scene.runId!==lastRun){lastRun=scene.runId;started=null;status.changes=0;nextPlan=0;pendingLane=null;decision={action:'hold',targetX:scene.player.x};decisionZ=-Infinity;}
      const focused=document.hasFocus()&&!document.hidden;
      if(!options.dry&&options.stopOnCoin!==false&&scene.collected>0){pauseAndStop('Coin collected — run paused');return;}
      if(started!==null&&scene.dead){api.stop('Run ended — character died');return;}
      if(scene.running&&!focused&&!options.dry){pauseAndStop('Game lost focus — run paused');return;}
      if(scene.running&&focused){
        started??=now;
        if(scene.changing)lastChangingAt=now;
        if(pendingLane!==null&&!scene.changing&&(Math.abs(scene.player.x-(pendingLane-1)*20)<1||now-lastAction>1200))pendingLane=null;
        // A previous continuous-steering run may have left a persistent lateral
        // offset. Ordinary commands must not silently keep that off-lane pose.
        // Let real game lane transitions settle before checking their centers.
        if(!options.dry&&options.precision!==true&&pendingLane===null&&!scene.changing&&Number.isInteger(scene.lane)&&now-Math.max(lastAction,lastChangingAt)>700&&Math.abs(scene.player.x-(scene.lane-1)*20)>1){
          status.reason='Character is between lanes — start a fresh run';
          pauseAndStop('Start a fresh run to reset the lane position');return;
        }
        if(request&&now-request.at>350){closeWorker();status.planning='main';nextPlan=0;}
        if(now>=nextPlan&&!request){
          const settings={precision:options.precision===true,pendingLane,commandDelay:0};
          if(planWorker){
            const predicted=projectedScene(scene,Math.min(.12,workerLatency/1000));
            request={id:++requestId,at:now,runId:lastRun,changes:status.changes,scene,projected:predicted,settings};
            planWorker.postMessage({id:request.id,scene:predicted,settings});
          }else{
          decision=planner(scene,settings);decisionZ=scene.player.z;
          // A safe jump may have a window narrower than the old 100ms poll.
          // Replan near that deadline using fresh state rather than replaying
          // the search's future commands blindly.
          // Sample before the deadline, not at it: planning and one engine
          // frame can otherwise consume the entire next takeoff window.
          nextPlan=now+planInterval(decision);
          }
        }
        if(planWorker&&scene.player.z-decisionZ>Math.max(1,scene.speed)*.1){decision={action:'hold',targetX:scene.player.x,reason:'Updating route'};nextPlan=0;}
        status.reason=decision.reason||'Waiting';status.risk=decision.risk||0;status.imminentRisk=decision.imminentRisk??decision.risk??0;
        let acted=false;
        if(!options.dry){
          if(options.precision===true)reader.steer(decision.targetX,Math.min(.06,(now-lastTick)/1000));
          const kind=decision.action==='left'||decision.action==='right'?'lane':decision.action;
          if(decision.action!=='hold'&&now-(lastKind[kind]??-Infinity)>=60&&reader.act(decision.action)){
            lastKind[kind]=now;
            status.changes++;lastAction=now;acted=true;
            if(decision.action==='left'||decision.action==='right')pendingLane=Math.max(0,Math.min(2,scene.lane+(decision.action==='left'?-1:1)));
            decision={...decision,action:'hold',nextAction:null,nextActionIn:Infinity};
            nextPlan=0;
          }
        }
        // A speculative collision later in the search is not a reason to stop
        // before trying the selected command. Predictive braking is opt-in.
        if(!options.dry&&options.autoBrake===true&&!acted&&pendingLane===null&&now-lastAction>180&&(decision.imminentRisk??decision.risk)>0){
          const close=[...scene.coins,...scene.obstacles].some(o=>{
            const velocity=Number.isFinite(o.velocityZ)?o.velocityZ:0;
            const age=Number.isFinite(o.observedAt)&&Number.isFinite(scene.at)?Math.max(0,Math.min(.6,(scene.at-o.observedAt)/1000)):0;
            const front=o.z+velocity*age-(o.hz||4.5)-(scene.body?.z??scene.player.z)-(scene.body?.hz||3);
            return front>=-2&&front<Math.max(1,scene.speed-velocity)*.15&&Math.abs(o.x-scene.player.x)<(o.hx||4.5)+(scene.body?.hx||3)&&Math.abs(o.y-(scene.body?.y||scene.player.y+5.5))<(o.hy||4.5)+(scene.body?.hy||5);
          });
          if(close){pauseAndStop('No safe predicted path — game paused, take over');return;}
        }
        status.message=options.dry?'Native observation — no movement':'Native autopilot active';
      }else status.message=!focused?'Waiting for game focus':'Waiting — resume/start the game';
      lastTick=now;status.reason=decision.reason||'Waiting';
      status.elapsed=started?(now-started)/1000:0;status.risk=decision.risk||0;
      if(options.hud!==false&&now-lastHudAt>=200){
        const text=`NO COIN PILOT ${options.dry?'· OBSERVE':'· NATIVE'}\n${status.message}\nCoins this run: ${scene.collected} · Seen: ${scene.coins.length}\nObstacles: ${scene.obstacles.length} · x: ${scene.player.x.toFixed(1)}\n${decision.reason||'Waiting'}\nEsc / Alt+Shift+X: stop`;
        if(text!==lastHudText){hud.textContent=text;lastHudText=text;}
        lastHudAt=now;
      }
      if(scene.errors>10)throw new Error(scene.lastError||'Repeated sensor errors');
      if(scene.running&&scene.speed>0&&scene.coins.length===0&&scene.samples===0&&status.elapsed>5)throw new Error('Coin update hook is not receiving samples');
    }catch(e){pauseAndStop(`Error: ${e.message}`);}
  },25);
  return api.status();
}
