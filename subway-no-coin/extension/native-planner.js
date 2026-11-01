// Bounded motion search using the verified build's live collider bounds.
export function planNative(scene, settings={}) {
  if(!scene.running)return {action:'hold',targetX:scene.player.x,risk:0,reason:'Waiting for a running game'};
  // Ordinary commands need to commit farther ahead than direct steering: a
  // pair of lane changes plus a jump can take over a second to execute.
  const ordinary=settings.precision===false;
  const speed=Math.max(1,scene.speed),dt=ordinary?1/30:.1,steps=ordinary?90:22,beamWidth=ordinary?192:36;
  const gravity=Math.max(10,scene.gravity||200),jumpV=Math.sqrt(2*gravity*(scene.jumpHeight||20));
  const engineStep=Math.max(1/240,Math.min(1/3,scene.engineStep||1/60));
  const body=scene.body||{hx:3,hy:5,hz:3,y:scene.player.y+5.5};
  const baseY=scene.groundY??Math.min(scene.player.y,1),centerOffset=body.y-scene.player.y;
  const targets=settings.precision===false?[-20,0,20]:[-20,-12,-8,0,8,12,20];
  const horizon=steps*dt;
  const skin=scene.skinWidth??.2,roadY=scene.roadY??baseY;
  function surfaceAt(v,z){
    const points=v.surface;if(!points?.length)return null;
    let lo=0,hi=points.length-1;if(z<points[lo].z||z>points[hi].z)return null;
    while(hi-lo>1){const mid=(lo+hi)>>>1;if(points[mid].z>z)hi=mid;else lo=mid;}
    const a=points[lo],b=points[hi];if(a.y===null||b.y===null)return null;
    const mix=b.z===a.z?0:(z-a.z)/(b.z-a.z);
    return {y:a.y+(b.y-a.y)*mix+skin,ny:Math.min(a.ny,b.ny)};
  }
  const items=[...(scene.coins||[]).map(c=>({...c,velocityZ:0,weight:100000})),...(scene.obstacles||[]).map(c=>{
    const velocityZ=Number.isFinite(c.velocityZ)?c.velocityZ:0;
    const age=Number.isFinite(c.observedAt)&&Number.isFinite(scene.at)?Math.max(0,Math.min(.6,(scene.at-c.observedAt)/1000)):0;
    return {...c,z:c.z+velocityZ*age,velocityZ,weight:1000000};
  })].filter(v=>Math.max(v.z,v.z+v.velocityZ*horizon)+(v.hz||4.5)>=scene.player.z-10&&Math.min(v.z,v.z+v.velocityZ*horizon)-(v.hz||4.5)<=scene.player.z+speed*horizon+20);
  const platforms=items.filter(v=>v.weight>=1000000&&(v.surface||v.shape==='BoxCollider'&&(/HitTrain/.test(v.tag||'')||/^(trains|train_sub|topCollider)/.test(v.name||''))));
  const floors=Array.from({length:steps},(_,i)=>[-20,0,20].map(x=>{
    const t=(i+1)*dt,z=scene.player.z+speed*t;let support={y:roadY,id:0,ny:1};
    for(const v of platforms){
      if(Math.abs(x-v.x)>v.hx)continue;
      const localZ=z-v.velocityZ*t,profile=v.surface?surfaceAt(v,localZ):null;
      const top=v.surface?profile:Math.abs(localZ-v.z)<=v.hz?{y:v.y+v.hy+skin,ny:1}:null;
      if(top&&top.y>support.y)support={...top,id:v.id??v};
    }
    return support;
  }));
  // Longitudinal motion is the same for every candidate. Bin its possible
  // overlap once instead of testing every visible collider for every state.
  const timeBins=Array.from({length:steps},()=>[]),bodyZ=body.z??scene.player.z;
  for(const v of items){
    const relative=bodyZ-v.z,closing=speed-v.velocityZ,extent=body.hz+(v.hz??4.5)+.4;
    let enter=0,exit=horizon;
    if(Math.abs(closing)<1e-9){if(Math.abs(relative)>=extent)continue;}
    else{const a=(-extent-relative)/closing,b=(extent-relative)/closing;enter=Math.min(a,b);exit=Math.max(a,b);}
    if(exit<0||enter>horizon)continue;
    const first=Math.max(0,Math.floor(enter/dt)-1),last=Math.min(steps-1,Math.floor(exit/dt)+1);
    for(let step=first;step<=last;step++)timeBins[step].push(v);
  }
  const capsule=body.shape==='CapsuleCollider'&&Math.abs(body.hx-body.hz)<.15,capsuleRadius=Math.max(body.hx,body.hz);
  // Sweep a point against a rounded box. A vertical capsule against a box is
  // exactly this Minkowski sum; capsule/sphere is the degenerate box case.
  // Splitting at box planes makes squared distance quadratic on each interval.
  function roundedBoxHit(from,to,half,radius,lo,hi){
    const delta=[to[0]-from[0],to[1]-from[1],to[2]-from[2]],cuts=[lo,hi];
    for(let axis=0;axis<3;axis++)if(Math.abs(delta[axis])>1e-10)for(const side of [-1,1]){
      const t=(side*half[axis]-from[axis])/delta[axis];if(t>lo&&t<hi)cuts.push(t);
    }
    cuts.sort((a,b)=>a-b);
    for(let i=0;i<cuts.length-1;i++){
      const a=cuts[i],b=cuts[i+1],mid=(a+b)/2;let qa=0,qb=0,qc=-radius*radius;
      for(let axis=0;axis<3;axis++){
        const at=from[axis]+delta[axis]*mid;
        if(Math.abs(at)<=half[axis])continue;
        const offset=from[axis]-(at<0?-half[axis]:half[axis]),d=delta[axis];
        qa+=d*d;qb+=2*offset*d;qc+=offset*offset;
      }
      const value=t=>(qa*t+qb)*t+qc;
      if(value(a)<=0)return a;
      if(qa<1e-12)continue;
      const minimum=Math.max(a,Math.min(b,-qb/(2*qa)));
      if(value(minimum)>0)continue;
      const root=(-qb-Math.sqrt(Math.max(0,qb*qb-4*qa*qc)))/(2*qa);
      if(root<=b)return Math.max(a,root);
    }
    return Infinity;
  }
  let collisionTime=Infinity,obstacleHit=false;
  function riskAt(from,to,t){
    collisionTime=Infinity;obstacleHit=false;
    const standingHy=scene.rolling?Math.max(5,body.hy):body.hy;
    // Verified game roll shape is a radius-three capsule/sphere centered four
    // units above player.y. It is not a 2.5-high box sitting on the ground.
    const halfHeight=to.roll>0?3:standingHy;
    const centerHeight=to.roll>0?4:scene.rolling?5.5:centerOffset;
    const start=Math.max(0,t-dt/2),z=(body.z??scene.player.z)+speed*start;
    let cost=0,enter=0,exit=1;
    function axis(a,b,half){
      const delta=b-a;if(Math.abs(delta)<1e-8)return Math.abs(a)<half;
      const first=(-half-a)/delta,last=(half-a)/delta;
      enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));return enter<exit;
    }
    for(const v of timeBins[Math.max(0,Math.min(steps-1,Math.floor(t/dt)))]){
      if(v.surface&&Math.abs(from.x-v.x)<v.hx-3&&Math.abs(to.x-v.x)<v.hx-3){
        const supportZ=scene.player.z+speed*start;
        const a=surfaceAt(v,supportZ-v.velocityZ*start),b=surfaceAt(v,supportZ+speed*dt-v.velocityZ*(start+dt));
        // A sampled ramp supports grounded movement. Its world AABB includes
        // empty air above the slope and must not become a fictional wall.
        if((!a||from.y>=a.y-.25)&&(!b||to.y>=b.y-.25))continue;
      }
      enter=0;exit=1;
      // Intersect collision times across all axes. Combining independent swept
      // boxes would falsely collide at diagonally opposite corners of a step.
      const obstacleZ=v.z+v.velocityZ*start;
      if(axis(from.x-v.x,to.x-v.x,body.hx+(v.hx??4.5)+.2)&&
         axis(z-obstacleZ,z+speed*dt-obstacleZ-v.velocityZ*dt,body.hz+(v.hz??4.5)+.4)&&
         axis(from.y+centerHeight-v.y,to.y+centerHeight-v.y,halfHeight+(v.hy??4.5)+gravity*dt*dt/8)){
        let hit=enter;
        if(capsule&&halfHeight+.001>=capsuleRadius&&(v.shape==='SphereCollider'||v.shape==='BoxCollider')){
          const sphere=v.shape==='SphereCollider',halfSegment=Math.max(0,halfHeight-capsuleRadius);
          const half=sphere?[.2,halfSegment+gravity*dt*dt/8,.4]:[(v.hx??4.5)+.2,(v.hy??4.5)+halfSegment+gravity*dt*dt/8,(v.hz??4.5)+.4];
          const radius=capsuleRadius+(sphere?Math.max(v.hx??4.5,v.hy??4.5,v.hz??4.5):0);
          hit=roundedBoxHit([from.x-v.x,from.y+centerHeight-v.y,z-obstacleZ],[to.x-v.x,to.y+centerHeight-v.y,z+speed*dt-obstacleZ-v.velocityZ*dt],half,radius,Math.max(0,enter),Math.min(1,exit));
        }
        if(Number.isFinite(hit)){cost+=v.weight;if(v.weight>=1000000)obstacleHit=true;collisionTime=Math.min(collisionTime,start+Math.max(0,hit)*dt);}
      }
    }
    return cost;
  }
  const compare=(a,b)=>Number(!!a.coinCompromised)-Number(!!b.coinCompromised)||Math.min(horizon,b.firstHit??Infinity)-Math.min(horizon,a.firstHit??Infinity)||a.cost-b.cost;
  function selectBeam(candidates,keyFor,actionDiversity=false){
    candidates.sort(compare);
    const phases={},unique=new Set();
    for(const s of candidates){
      const key=keyFor(s);if(unique.has(key))continue;unique.add(key);
      const phase=(s.roll>0?'roll-':'')+(s.y<=(s.floor??baseY)+.05&&s.vy<=0?'ground':s.vy>0?'up':'down')+(actionDiversity?`:${s.first}:${s.lane}`:'');(phases[phase]??=[]).push(s);
    }
    // Retain possible takeoffs before reaching an obstacle. A purely cost-sorted
    // beam fills with cheap ground paths and discards every timely jump.
    const selected=[],groups=Object.values(phases);
    for(let rank=0;selected.length<beamWidth;rank++){
      let added=false;for(const group of groups)if(group[rank]){selected.push(group[rank]);added=true;if(selected.length===beamWidth)break;}
      if(!added)break;
    }
    return selected.sort(compare);
  }
  if(settings.precision===false){
    // The ordinary controller can issue one game command at a time. Keep the
    // simulation executable: a first-step jump may not secretly change lanes.
    const targetLane=scene.changing&&Number.isInteger(scene.targetLane)&&scene.targetLane>=0&&scene.targetLane<=2?scene.targetLane:settings.pendingLane;
    const lane=Number.isInteger(targetLane)&&targetLane>=0&&targetLane<=2?targetLane:Number.isInteger(scene.lane)?Math.max(0,Math.min(2,scene.lane)):Math.max(0,Math.min(2,Math.round(scene.player.x/20)+1));
    // Live lane motion scales with forward speed (~20 units per 30 travelled),
    // rather than the fixed 50 units/s previously assumed by the search.
    const laneSpeed=Number.isFinite(scene.laneSpeed)&&scene.laneSpeed>0?scene.laneSpeed:speed/1.5;
    if(!items.length)return {action:'hold',targetX:(lane-1)*20,risk:0,imminentRisk:0,cost:0,reason:'Clear road ahead'};
    const initial={x:scene.player.x,y:scene.player.y,vy:scene.verticalSpeed||0,floor:baseY,floorId:null,lane,roll:scene.rolling?.35:0,wait:Math.max(0,Math.min(.5,settings.commandDelay||0)),cost:0,risk:0,imminentRisk:0,firstHit:Infinity,coinCompromised:scene.collected>0,first:'hold',firstX:(lane-1)*20,nextAction:null,nextActionIn:Infinity};
    function integrate(state,s,step,action){
      const target=(s.lane-1)*20;
      s.x+=Math.sign(target-s.x)*Math.min(Math.abs(target-s.x),laneSpeed*dt);
      s.y+=s.vy*dt-.5*gravity*dt*dt-.5*gravity*engineStep*dt;s.vy-=gravity*dt;
      const support=floors[step][Math.max(0,Math.min(2,Math.round(s.x/20)+1))],onGround=state.y<=state.floor+.05&&state.vy<=0&&action!=='jump';
      const maxStep=Math.abs(s.x-state.x)>.01&&support.id!==state.floorId ? .75 : .75+speed*dt*.8;
      const climbing=onGround&&support.ny>=.65&&support.y-state.floor<=maxStep;
      s.floor=support.y;s.floorId=support.id;
      if(climbing&&support.y>=state.floor-1){s.y=support.y;s.vy=0;}
      else if(s.y<support.y&&state.y>=support.y-.05){s.y=support.y;s.vy=0;}
      s.roll=Math.max(0,s.roll-dt);if(s.roll<.001)s.roll=0;s.wait=Math.max(0,s.wait-dt);
    }
    // Most frames need either no command or one ordinary dodge. Verify those
    // complete trajectories first; expanding thousands of redundant hold
    // states here used to consume time needed by the game and the next search.
    const simple=['hold'],aligned=Math.abs(initial.x-(lane-1)*20)<.5;
    if(initial.wait<=.001){
      if(aligned&&!scene.changing){if(lane>0)simple.push('left');if(lane<2)simple.push('right');}
      if(initial.y<=initial.floor+.05&&initial.vy<=0)simple.push('jump');
      if(initial.roll<=0)simple.push('roll');
    }
    for(const action of simple){
      let state=initial,clear=true;
      for(let step=0;step<steps;step++){
        const s={...state};
        if(step===0){
          if(action==='left')s.lane--;if(action==='right')s.lane++;
          if(action==='jump'){s.vy=jumpV;s.roll=0;}
          if(action==='roll'){s.roll=.5;if(s.y>state.floor+.05)s.vy=-jumpV;}
        }
        integrate(state,s,step,step===0?action:'hold');
        if(riskAt(state,s,(step+.5)*dt)>0){clear=false;break;}state=s;
      }
      if(clear){const target=(lane-1+(action==='left'?-1:action==='right'?1:0))*20;return {action,targetX:target,nextAction:action==='hold'?null:action,nextActionIn:action==='hold'?Infinity:0,risk:0,imminentRisk:0,cost:action==='hold'?0:.12,blocked:false,zeroCoinRoute:true,reason:action==='hold'?'Clear predicted path':`Avoiding danger: ${action}`};}
    }
    let beam=[initial],blocked=false;
    for(let step=0;step<steps;step++){
      const candidates=[],collisions=[];
      for(const state of beam){
        const actions=['hold'],aligned=Math.abs(state.x-(state.lane-1)*20)<.5;
        if(state.wait<=.001){
          if(aligned&&!(step===0&&scene.changing)){if(state.lane>0)actions.push('left');if(state.lane<2)actions.push('right');}
          if(state.y<=state.floor+.05&&state.vy<=0)actions.push('jump');
          if(state.roll<=0)actions.push('roll');
        }
        for(const action of actions){
          const s={...state};
          if(action==='left')s.lane--;if(action==='right')s.lane++;
          if(action==='jump'){s.vy=jumpV;s.roll=0;}
          if(action==='roll'){s.roll=.5;if(s.y>state.floor+.05)s.vy=-jumpV;}
          if(action!=='hold'&&s.nextAction===null){s.nextAction=action;s.nextActionIn=step*dt;}
          if(action!=='hold'){s.wait=.05;s.cost+=(action==='left'||action==='right'?.06:.12)+step*.006;}
          const target=(s.lane-1)*20;
          integrate(state,s,step,action);
          const risk=riskAt(state,s,(step+.5)*dt);s.risk+=risk;
          s.firstHit=Math.min(state.firstHit,collisionTime);
          if((step+1)*dt<=.5)s.imminentRisk+=risk;
          s.cost+=risk*(1-step/(steps*2))+Math.abs(s.x-state.x)*.001;
          if(step===0){s.first=action;s.firstX=target;}
          // Train/body collisions end the physical trajectory. A collected
          // coin invalidates the no-coin objective, but does not make later
          // movement impossible. Preserve a small survival reserve so failure
          // to find a clean route never encourages diving into a train.
          if(obstacleHit)collisions.push(s);
          else{if(risk>0)s.coinCompromised=true;candidates.push(s);}
        }
      }
      if(!candidates.length){beam=collisions.sort(compare).slice(0,1);blocked=true;break;}
      // Cooldown is part of the physical state: merging a ready path with one
      // that must wait silently removes executable two-move escapes.
      const key=s=>`${s.lane}:${Math.round(s.x/2.5)}:${Math.round(s.y/1.25)}:${Math.round(s.vy/10)}:${Math.round(s.roll*1000)}:${Math.round(s.wait*1000)}:${s.first}`;
      const clean=selectBeam(candidates.filter(s=>!s.coinCompromised),key,true),survival=selectBeam(candidates.filter(s=>s.coinCompromised),key,true);
      beam=(clean.length?clean.slice(0,survival.length?beamWidth-32:beamWidth).concat(survival.slice(0,32)):survival).sort(compare);
    }
    const best=beam[0];
    return {action:best.first,targetX:best.firstX,nextAction:best.nextAction,nextActionIn:best.nextActionIn,risk:best.risk,imminentRisk:best.imminentRisk,collisionIn:best.firstHit,cost:best.cost,blocked,zeroCoinRoute:!blocked&&!best.coinCompromised,reason:blocked?`No collision-free route in view; attempting ${best.first}`:best.coinCompromised?`No zero-coin route in view; avoiding trains`:best.first==='hold'?'Clear predicted path':`Avoiding danger: ${best.first}`};
  }
  // Prefer an already-clear corridor and commit early, rather than postponing
  // every lane change to the next search step under receding-horizon ties.
  const corridors=[];
  for(const target of targets){
    let state={x:scene.player.x,y:scene.player.y,vy:scene.verticalSpeed||0,roll:scene.rolling?.35:0},risk=0;
    for(let i=0;i<steps;i++){
      const next={...state};next.x+=Math.sign(target-next.x)*Math.min(Math.abs(target-next.x),100*dt);
      next.y+=next.vy*dt-.5*gravity*dt*dt;next.vy-=gravity*dt;if(next.y<baseY){next.y=baseY;next.vy=0;}
      next.roll=Math.max(0,next.roll-dt);if(next.roll<.001)next.roll=0;
      risk+=riskAt(state,next,(i+.5)*dt);state=next;
    }
    if(!risk)corridors.push({target,cost:Math.abs(target-scene.player.x)});
  }
  if(corridors.length){corridors.sort((a,b)=>a.cost-b.cost);const targetX=corridors[0].target;return {action:settings.precision===false&&Math.abs(targetX-scene.player.x)>5?(targetX<scene.player.x?'left':'right'):'hold',targetX,risk:0,imminentRisk:0,reason:'Clear corridor ahead',cost:0};}
  let beam=[{x:scene.player.x,y:scene.player.y,vy:scene.verticalSpeed||0,target:scene.player.x,roll:scene.rolling?.35:0,cost:0,first:'hold',firstX:scene.player.x,risk:0,imminentRisk:0}];
  for(let step=0;step<steps;step++){
    const next=[];
    for(const state of beam){
      const xChoices=[state.target,...targets.filter(x=>Math.abs(x-state.x)<=21)];
      for(const xTarget of [...new Set(xChoices)]){
        const vertical=['hold'];
        if(state.y<=baseY+.9&&state.vy<=0&&state.roll<=0)vertical.push('jump','roll');
        for(const action of vertical){
          const s={...state,target:xTarget};
          if(action==='jump'){s.vy=jumpV;s.roll=0;s.cost+=.12+step*.006;}
          if(action==='roll'){s.roll=.6;s.cost+=.12+step*.006;}
          s.x+=Math.sign(xTarget-s.x)*Math.min(Math.abs(xTarget-s.x),100*dt);
          s.y+=s.vy*dt-.5*gravity*dt*dt;s.vy-=gravity*dt;
          if(s.y<baseY){s.y=baseY;s.vy=0;}
          s.roll=Math.max(0,s.roll-dt);
          if(s.roll<.001)s.roll=0;
          const risk=riskAt(state,s,(step+.5)*dt);
          if(step<5)s.imminentRisk+=risk;
          s.cost+=risk*(1-step/(steps*2))+Math.abs(s.x-state.x)*.001*(1+step*.1);s.risk+=risk;
          if(step===0){s.first=action;s.firstX=xTarget;}
          next.push(s);
        }
      }
    }
    beam=selectBeam(next,s=>`${s.target}:${Math.round(s.x/4)}:${Math.round(s.y/4)}:${Math.round(s.vy/25)}:${Math.round(s.roll*10)}:${s.first}:${s.firstX}`);
  }
  const best=beam[0];
  let action=best.first;
  if(settings.precision===false&&action==='hold'&&Math.abs(best.firstX-scene.player.x)>5)action=best.firstX<scene.player.x?'left':'right';
  if(action==='hold'&&!scene.jumping&&!scene.rolling){
    const close=(scene.obstacles||[]).filter(o=>Math.abs(o.x-scene.player.x)<body.hx+o.hx+.3&&o.z-o.hz-scene.player.z>0&&o.z-o.hz-scene.player.z<speed*.45).sort((a,b)=>(a.z-a.hz)-(b.z-b.hz));
    const hit=close[0];
    if(hit&&/HitBarrierJump/.test(hit.tag)&&hit.y+hit.hy<baseY+(scene.jumpHeight||20))action='jump';
    else if(hit&&/HitBarrierRoll/.test(hit.tag))action='roll';
  }
  return {action,targetX:best.firstX,risk:best.risk,imminentRisk:best.imminentRisk,reason:best.imminentRisk?'No safe immediate path':best.risk?'Danger further ahead':'Clear predicted path',cost:best.cost};
}
