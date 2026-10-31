// Bounded motion search using the verified build's live collider bounds.
export function planNative(scene, settings={}) {
  if(!scene.running)return {action:'hold',targetX:scene.player.x,risk:0,reason:'Waiting for a running game'};
  const speed=Math.max(1,scene.speed),dt=.1,steps=22,beamWidth=36;
  const gravity=Math.max(10,scene.gravity||200),jumpV=Math.sqrt(2*gravity*(scene.jumpHeight||20));
  const body=scene.body||{hx:3,hy:5,hz:3,y:scene.player.y+5.5};
  const baseY=scene.groundY??Math.min(scene.player.y,1),centerOffset=body.y-scene.player.y;
  const targets=settings.precision===false?[-20,0,20]:[-20,-12,-8,0,8,12,20];
  const horizon=steps*dt;
  const items=[...(scene.coins||[]).map(c=>({...c,velocityZ:0,weight:100000})),...(scene.obstacles||[]).map(c=>{
    const velocityZ=Number.isFinite(c.velocityZ)?c.velocityZ:0;
    const age=Number.isFinite(c.observedAt)&&Number.isFinite(scene.at)?Math.max(0,Math.min(.6,(scene.at-c.observedAt)/1000)):0;
    return {...c,z:c.z+velocityZ*age,velocityZ,weight:1000000};
  })].filter(v=>Math.max(v.z,v.z+v.velocityZ*horizon)+(v.hz||4.5)>=scene.player.z-10&&Math.min(v.z,v.z+v.velocityZ*horizon)-(v.hz||4.5)<=scene.player.z+speed*horizon+20);
  function riskAt(from,to,t){
    const standingHy=scene.rolling?Math.max(5,body.hy):body.hy;
    const halfHeight=to.roll>0?Math.min(standingHy,2.5):standingHy;
    const feetOffset=centerOffset-body.hy;
    const start=Math.max(0,t-dt/2),z=(body.z??scene.player.z)+speed*start;
    let cost=0,enter=0,exit=1;
    function axis(a,b,half){
      const delta=b-a;if(Math.abs(delta)<1e-8)return Math.abs(a)<half;
      const first=(-half-a)/delta,last=(half-a)/delta;
      enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));return enter<exit;
    }
    for(const v of items){
      enter=0;exit=1;
      // Intersect collision times across all axes. Combining independent swept
      // boxes would falsely collide at diagonally opposite corners of a step.
      const obstacleZ=v.z+v.velocityZ*start;
      if(axis(from.x-v.x,to.x-v.x,body.hx+(v.hx??4.5)+.2)&&
         axis(z-obstacleZ,z+speed*dt-obstacleZ-v.velocityZ*dt,body.hz+(v.hz??4.5)+.4)&&
         axis(from.y+feetOffset+halfHeight-v.y,to.y+feetOffset+halfHeight-v.y,halfHeight+(v.hy??4.5)+gravity*dt*dt/8))cost+=v.weight;
    }
    return cost;
  }
  function selectBeam(candidates,keyFor){
    candidates.sort((a,b)=>a.cost-b.cost);
    const phases={ground:[],up:[],down:[],roll:[]},unique=new Set();
    for(const s of candidates){
      const key=keyFor(s);if(unique.has(key))continue;unique.add(key);
      const phase=s.roll>0?'roll':s.y<=baseY+.9&&s.vy<=0?'ground':s.vy>0?'up':'down';phases[phase].push(s);
    }
    // Retain possible takeoffs before reaching an obstacle. A purely cost-sorted
    // beam fills with cheap ground paths and discards every timely jump.
    const selected=[],groups=Object.values(phases);
    for(let rank=0;selected.length<beamWidth;rank++){
      let added=false;for(const group of groups)if(group[rank]){selected.push(group[rank]);added=true;if(selected.length===beamWidth)break;}
      if(!added)break;
    }
    return selected.sort((a,b)=>a.cost-b.cost);
  }
  if(settings.precision===false){
    // The ordinary controller can issue one game command at a time. Keep the
    // simulation executable: a first-step jump may not secretly change lanes.
    const lane=Number.isInteger(scene.lane)?Math.max(0,Math.min(2,scene.lane)):Math.max(0,Math.min(2,Math.round(scene.player.x/20)+1));
    // The game motor eases normal lane transitions; they do not have the
    // precision-steering motor's 100-unit/s movement. Use a conservative bound.
    const laneSpeed=50;
    if(!items.length)return {action:'hold',targetX:(lane-1)*20,risk:0,imminentRisk:0,cost:0,reason:'Clear road ahead'};
    const initial={x:scene.player.x,y:scene.player.y,vy:scene.verticalSpeed||0,lane,roll:scene.rolling?.35:0,wait:Math.max(0,Math.min(.5,settings.commandDelay||0)),cost:0,risk:0,imminentRisk:0,first:'hold',firstX:(lane-1)*20};
    let beam=[initial];
    for(let step=0;step<steps;step++){
      const candidates=[];
      for(const state of beam){
        const actions=['hold'],aligned=Math.abs(state.x-(state.lane-1)*20)<.5;
        if(state.wait<=.001){
          if(aligned&&!(step===0&&scene.changing)){if(state.lane>0)actions.push('left');if(state.lane<2)actions.push('right');}
          if(state.y<=baseY+.9&&state.vy<=0&&state.roll<=0&&!(step===0&&scene.jumping))actions.push('jump','roll');
        }
        for(const action of actions){
          const s={...state};
          if(action==='left')s.lane--;if(action==='right')s.lane++;
          if(action==='jump'){s.vy=jumpV;s.roll=0;}
          if(action==='roll')s.roll=.6;
          if(action!=='hold'){s.wait=.2;s.cost+=(action==='left'||action==='right'?.06:.12)+step*.006;}
          const target=(s.lane-1)*20;
          s.x+=Math.sign(target-s.x)*Math.min(Math.abs(target-s.x),laneSpeed*dt);
          s.y+=s.vy*dt-.5*gravity*dt*dt;s.vy-=gravity*dt;
          if(s.y<baseY){s.y=baseY;s.vy=0;}
          s.roll=Math.max(0,s.roll-dt);if(s.roll<.001)s.roll=0;s.wait=Math.max(0,s.wait-dt);
          const risk=riskAt(state,s,(step+.5)*dt);s.risk+=risk;
          if(step<5)s.imminentRisk+=risk;
          s.cost+=risk*(1-step/(steps*2))+Math.abs(s.x-state.x)*.001;
          if(step===0){s.first=action;s.firstX=target;}
          candidates.push(s);
        }
      }
      beam=selectBeam(candidates,s=>`${s.lane}:${Math.round(s.x/5)}:${Math.round(s.y/3)}:${Math.round(s.vy/20)}:${Math.round(s.roll*10)}:${s.first}`);
    }
    const best=beam[0];
    return {action:best.first,targetX:best.firstX,risk:best.risk,imminentRisk:best.imminentRisk,cost:best.cost,reason:best.imminentRisk?'No safe immediate path':best.risk?'Danger further ahead':best.first==='hold'?'Clear predicted path':`Avoiding danger: ${best.first}`};
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
