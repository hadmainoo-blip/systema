import test from 'node:test';
import assert from 'node:assert/strict';
import {planNative} from '../extension/native-planner.js';

const scene=()=>({running:true,speed:110,engineStep:1/60,player:{x:0,y:.8,z:0},groundY:.8,gravity:200,jumpHeight:20,lane:1,body:{shape:'CapsuleCollider',hx:3,hy:5,hz:3,y:6.3},coins:[],obstacles:[]});
const train=(x,z,hz=30)=>({shape:'BoxCollider',tag:'HitTrain',x,y:15.2,z,hx:8.5,hy:14,hz});
function tripleCoinScene(){const s=scene();s.coins=[90,120,150].map(z=>({shape:'SphereCollider',x:0,y:6,z,hx:4.5,hy:4.5,hz:4.5}));s.obstacles=[train(-20,90,140),train(20,90,140)];return s;}

test('an independently sampled capsule/sphere trajectory clears the three-coin row',()=>{
  const s=tripleCoinScene(),jumpAt=.65,impulse=Math.sqrt(2*s.gravity*s.jumpHeight);let margin=Infinity;
  // Sample the actual rounded shapes densely, independently of planner sweep
  // calculations. Box overlap alone incorrectly rejects this clean jump.
  for(let t=0;t<2;t+=.002){
    const airborne=Math.max(0,t-jumpAt),y=Math.max(.8,.8+impulse*airborne-.5*s.gravity*airborne*airborne-.5*s.gravity*s.engineStep*airborne);
    for(const c of s.coins){const dy=Math.max(0,Math.abs(y+5.5-c.y)-2);margin=Math.min(margin,Math.hypot(dy,s.speed*t-c.z)-7.5);}
  }
  assert.ok(margin>1,`Physical clearance was ${margin}`);
});
test('verified rounded shapes retain a clean, correctly timed three-coin jump',()=>{
  const d=planNative(tripleCoinScene(),{precision:false});
  assert.equal(d.risk,0);assert.equal(d.blocked,false);assert.equal(d.action,'hold');
  assert.equal(d.nextAction,'jump');assert.ok(d.nextActionIn>=.6&&d.nextActionIn<=.7);
});
test('a tall train spanning every lane cannot be treated as a jumpable platform',()=>{
  const s=scene();s.obstacles=[{...train(0,55),hx:40}];
  const d=planNative(s,{precision:false});assert.equal(d.blocked,true);assert.ok(d.risk>=1000000);assert.ok(d.collisionIn<1);
});
test('ordinary control leaves a train lane through the available adjacent lane',()=>{
  const s=scene();s.player.x=20;s.lane=2;s.obstacles=[train(20,100)];
  const d=planNative(s,{precision:false});assert.equal(d.risk,0);assert.equal(d.action,'left');assert.equal(d.targetX,0);
});
test('the actual rolled sphere cannot fit through a gap below its 7.8-unit top',()=>{
  const s=scene();s.obstacles=[{shape:'BoxCollider',tag:'HitBarrierRoll',x:0,y:20,z:30,hx:40,hy:13,hz:2}];
  const d=planNative(s,{precision:false});assert.equal(d.blocked,true);assert.ok(d.risk>0);
});
test('the actual rolled sphere clears a verified eight-unit overhead gap',()=>{
  const s=scene();s.obstacles=[{shape:'BoxCollider',tag:'HitBarrierRoll',x:0,y:21,z:30,hx:40,hy:13,hz:2}];
  const d=planNative(s,{precision:false});assert.equal(d.action,'roll');assert.equal(d.risk,0);
});
test('an unavoidable coin does not cause a deliberate collision with a solid train wall',()=>{
  const s=scene();s.coins=Array.from({length:15},(_,i)=>({shape:'SphereCollider',x:0,y:6,z:60+i*20,hx:4.5,hy:4.5,hz:4.5}));
  s.obstacles=[train(-20,150,180),train(20,150,180)];
  const d=planNative(s,{precision:false});assert.equal(d.blocked,false);assert.equal(d.zeroCoinRoute,false);
  assert.equal(d.targetX,0);assert.ok(d.risk>0);assert.ok(d.risk<1000000);
});
