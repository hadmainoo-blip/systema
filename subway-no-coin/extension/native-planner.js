// Bounded motion search using the verified build's live collider bounds.
export function planNative(scene, settings={}) {
  if(!scene.running)return {action:'hold',targetX:scene.player.x,risk:0,reason:'Waiting for a running game'};
  const speed=Math.max(1,scene.speed),dt=.1,steps=22,beamWidth=36;
  const gravity=Math.max(10,scene.gravity||200),jumpV=Math.sqrt(2*gravity*(scene.jumpHeight||20));
  const body=scene.body||{hx:3,hy:5,hz:3,y:scene.player.y+5.5};
  const baseY=scene.groundY??Math.min(scene.player.y,1),centerOffset=body.y-scene.player.y;
  const targets=settings.precision===false?[-20,0,20]:[-20,-12,-8,0,8,12,20];
  const items=[...(scene.coins||[]).map(c=>({...c,weight:100000})),...(scene.obstacles||[]).map(c=>({...c,weight:1000000}))].filter(v=>v.z+(v.hz||4.5)>=scene.player.z-10&&v.z-(v.hz||4.5)<=scene.player.z+speed*steps*dt+20);
  function riskAt(from,to,t){
    const x=(from.x+to.x)/2,z=scene.player.z+speed*t,hx=body.hx+Math.abs(to.x-from.x)/2+.2,hz=body.hz+speed*dt/2+.4;
    const y=(from.y+to.y)/2+centerOffset,hy=to.roll>0?Math.min(body.hy,2.5):body.hy;
    let cost=0;
    for(const v of items)if(Math.abs(v.x-x)<hx+(v.hx??4.5)&&Math.abs(v.z-z)<hz+(v.hz??4.5)&&Math.abs(v.y-y)<hy+(v.hy??4.5))cost+=v.weight;
    return cost;
  }
  // Prefer an already-clear corridor and commit early, rather than postponing
  // every lane change to the next search step under receding-horizon ties.
  const corridors=[];
  for(const target of targets){
    let state={x:scene.player.x,y:scene.player.y,vy:scene.verticalSpeed||0,roll:scene.rolling?.35:0},risk=0;
    for(let i=0;i<14;i++){
      const next={...state};next.x+=Math.sign(target-next.x)*Math.min(Math.abs(target-next.x),100*dt);
      next.y+=next.vy*dt-.5*gravity*dt*dt;next.vy-=gravity*dt;if(next.y<baseY){next.y=baseY;next.vy=0;}
      risk+=riskAt(state,next,(i+.5)*dt);state=next;
    }
    if(!risk)corridors.push({target,cost:Math.abs(target-scene.player.x)});
  }
  if(corridors.length){corridors.sort((a,b)=>a.cost-b.cost);const targetX=corridors[0].target;return {action:settings.precision===false&&Math.abs(targetX-scene.player.x)>5?(targetX<scene.player.x?'left':'right'):'hold',targetX,risk:0,reason:'Clear corridor ahead',cost:0};}
  let beam=[{x:scene.player.x,y:scene.player.y,vy:scene.verticalSpeed||0,target:scene.player.x,roll:scene.rolling?.35:0,cost:0,first:'hold',firstX:scene.player.x,risk:0}];
  for(let step=0;step<steps;step++){
    const next=[];
    for(const state of beam){
      const xChoices=[state.target,...targets.filter(x=>Math.abs(x-state.x)<=21)];
      for(const xTarget of [...new Set(xChoices)]){
        const vertical=['hold'];
        if(state.y<=baseY+.9&&state.vy<=0){vertical.push('jump');if(state.roll<=0)vertical.push('roll');}
        for(const action of vertical){
          const s={...state,target:xTarget};
          if(action==='jump'){s.vy=jumpV;s.roll=0;s.cost+=.12;}
          if(action==='roll'){s.roll=.6;s.cost+=.12;}
          s.x+=Math.sign(xTarget-s.x)*Math.min(Math.abs(xTarget-s.x),100*dt);
          s.y+=s.vy*dt-.5*gravity*dt*dt;s.vy-=gravity*dt;
          if(s.y<baseY){s.y=baseY;s.vy=0;}
          s.roll=Math.max(0,s.roll-dt);
          const risk=riskAt(state,s,(step+.5)*dt);
          s.cost+=risk*(1-step/(steps*2))+Math.abs(s.x-state.x)*.001;s.risk+=risk;
          if(step===0){s.first=action;s.firstX=xTarget;}
          next.push(s);
        }
      }
    }
    next.sort((a,b)=>a.cost-b.cost);
    const unique=new Set();beam=[];
    for(const s of next){const key=`${s.target}:${Math.round(s.y/4)}:${Math.round(s.vy/25)}:${s.first}:${s.firstX}`;if(unique.has(key))continue;unique.add(key);beam.push(s);if(beam.length===beamWidth)break;}
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
  return {action,targetX:best.firstX,risk:best.risk,reason:best.risk?'Predicted risk remains':'Clear predicted path',cost:best.cost};
}
