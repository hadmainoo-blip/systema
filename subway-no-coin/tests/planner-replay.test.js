import test from 'node:test';
import assert from 'node:assert/strict';
import {planNative} from '../extension/native-planner.js';

const train=(x,z,hz)=>({x,y:15.2,z,hx:8.5,hy:14,hz,tag:'HitTrain'});
const delayedEscapeScene=()=>({
  running:true,speed:110,engineStep:.1,player:{x:0,y:.8,z:0},
  groundY:.8,gravity:200,jumpHeight:20,
  body:{x:0,y:6.3,z:0,hx:3,hy:5,hz:3},lane:1,coins:[],
  obstacles:[train(20,188,26),train(-20,295,14),train(0,288,29)]
});
const switchbackScene=()=>({
  ...delayedEscapeScene(),coins:[{x:0,y:6,z:50,hx:4.5,hy:4.5,hz:4.5}],
  obstacles:[train(-20,148,14),train(0,187,29),train(20,71,30)]
});

test('a normal switchback route avoids a coin and three staggered trains',()=>{
  const s=switchbackScene();
  for(let tick=0;tick<=600;tick++){
    const t=tick*.005,z=t*110;
    const x=t<.2?0:t<.6?-(t-.2)*50:t<.7?-20:t<1.1?-20+(t-.7)*50:t<1.5?(t-1.1)*50:20;
    for(const o of [...s.coins,...s.obstacles]){
      const overlapping=Math.abs(x-o.x)<3.2+o.hx&&Math.abs(z-o.z)<3.4+o.hz;
      assert.equal(overlapping,false,`Witness hit ${o.x}/${o.z} at ${t}`);
    }
  }
});

test('search keeps a later switchback instead of jumping into a train with no exit',()=>{
  const d=planNative(switchbackScene(),{precision:false});
  assert.equal(d.risk,0,'A clear sequence of ordinary lane changes exists');
});

test('a delayed ordinary lane escape is feasible between three train intervals',()=>{
  const s=delayedEscapeScene();
  // Independent witness: remain in the middle until the right train has
  // passed, then change right at50units/s before the middle train arrives.
  for(let tick=0;tick<=600;tick++){
    const t=tick*.005,x=t<=2?0:Math.min(20,(t-2)*50),z=t*110;
    for(const o of s.obstacles){
      const overlapping=Math.abs(x-o.x)<3.2+o.hx&&Math.abs(z-o.z)<3.4+o.hz;
      assert.equal(overlapping,false,`Witness hit ${o.x}/${o.z} at ${t}`);
    }
  }
});

test('lookahead retains a later right escape instead of committing to a blocked left track',()=>{
  const d=planNative(delayedEscapeScene(),{precision:false});
  assert.equal(d.risk,0,'A collision-free route exists throughout the search horizon');
  assert.equal(d.action,'hold','The lowest-command route waits for the right train to pass');
  assert.equal(d.targetX,0);
});
