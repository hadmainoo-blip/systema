import test from 'node:test';
import assert from 'node:assert/strict';
import {installLegacyReader} from '../extension/native-reader.js';
import {legacyProfile as profile} from '../extension/legacy-profile.js';

// A small memory/API fixture executes the actual reader, not a copy of its
// sensor code. No game instructions, counters, or collisions are changed.
function fixture(t,{y=15,groundY=.8,raf=false,longTrain=false}={}){
  const buffer=new ArrayBuffer(1024*1024),u8=new Uint8Array(buffer),u16=new Uint16Array(buffer),u32=new Uint32Array(buffer),i32=new Int32Array(buffer),f32=new Float32Array(buffer);
  let clock=1000,stack=100000,stringAt=20000,frameId=0,nativeCalls=0;const frameCallbacks=new Map(),listeners=new Map();
  const character=2048,game=4096,body=6000,coin=7000,coinCollider=8000,coinTransform=9000,stats=10000,hits=12000,train=14000,rays=[],actions=[];
  const setU=(p,v)=>{u32[p>>>2]=v;},setF=(p,v)=>{f32[p>>>2]=v;};
  function object(p,name){const cls=stringAt;stringAt+=64;const text=stringAt;stringAt+=128;setU(p,cls);setU(cls+8,text);for(let i=0;i<name.length;i++)u8[text+i]=name.charCodeAt(i);}
  function managedString(p,text){setU(p+8,text.length);for(let i=0;i<text.length;i++)u16[((p+12)>>>1)+i]=text.charCodeAt(i);}
  object(character,'Character');object(game,'Game');object(body,'CapsuleCollider');object(coin,'Coin');object(coinCollider,'SphereCollider');object(coinTransform,'Transform');
  if(longTrain){object(train,'BoxCollider');managedString(13000,'trains_5_group');managedString(13500,'HitTrain');}
  setU(character+profile.characterTrigger,body);setU(game+profile.gameStats,stats);setU(coin+profile.coinCollider,coinCollider);setU(coin+profile.coinTransform,coinTransform);u8[coin+profile.coinActive]=1;
  setF(character+profile.characterWorld,0);setF(character+profile.characterWorld+4,y);setF(character+profile.characterWorld+8,100);i32[(character+profile.characterLane)>>>2]=1;
  i32[(character+profile.characterTrackTarget)>>>2]=1;setF(character+profile.characterTrackPosition,1);
  setF(character+profile.characterGravity,200);setF(character+profile.characterJumpHeight,20);setF(character+profile.characterGroundY,groundY);setF(game+profile.gameSpeed,110);
  const asm={legacy_running:{value:1},stackSave:()=>stack,stackAlloc:n=>{const p=stack;stack+=Math.ceil(n/8)*8;return p;},stackRestore:p=>{stack=p;},
    dynCall_ii:index=>{nativeCalls++;return index===profile.characterInstance?character:index===profile.gameInstance?game:0;},
    dynCall_iii:(index,p)=>index===profile.raycastHitCollider?train:index===profile.objectName?13000:index===profile.componentTag?13500:0,
    dynCall_viii:(index,p,out)=>{
      const values=index===profile.transformPosition?[0,6,250,0]:p===body?[0,f32[(character+profile.characterWorld+4)>>>2]+5.5,f32[(character+profile.characterWorld+8)>>>2]+1,3,5,3]:p===train?[0,15.2,430,8.5,14,148]:[0,6,250,4.5,4.5,4.5];
      f32.set(values,out>>>2);
    },
    dynCall_vifffii:()=>{},
    dynCall_vii:(index,p)=>actions.push({index,p}),
    dynCall_iiifiii:(index,origin,direction)=>{
      const ray={x:f32[origin>>>2],y:f32[(origin+4)>>>2],z:f32[(origin+8)>>>2],dz:f32[(direction+8)>>>2]};rays.push(ray);
      const inLane=Math.abs(ray.x)<8.5&&ray.y>1.2&&ray.y<29.2,inside=inLane&&ray.z>282&&ray.z<578;
      const intersects=ray.dz>0?ray.z<282&&ray.z+380>282:ray.z>578&&ray.z-380<578;
      setU(hits+12,longTrain&&inLane&&!inside&&intersects?1:0);return hits;
    }
  };
  const module={asm,calledRun:true,wasmCodeUrl:`player-${profile.playerHash}.wasm`,HEAPU8:u8,HEAPU16:u16,HEAPU32:u32,HEAP32:i32,HEAPF32:f32,dynCall_vifffii:()=>{}};
  globalThis.window={unityGame:{Module:module},addEventListener:(name,listener)=>listeners.set(name,listener),removeEventListener:name=>listeners.delete(name)};globalThis.document={hasFocus:()=>true};
  if(raf){window.requestAnimationFrame=callback=>{const id=++frameId;frameCallbacks.set(id,callback);return id;};window.cancelAnimationFrame=id=>frameCallbacks.delete(id);}
  t.mock.method(performance,'now',()=>clock);installLegacyReader(profile);
  t.after(()=>{window.__noCoinPilotReader?.stop();delete globalThis.window;delete globalThis.document;});
  return {reader:window.__noCoinPilotReader,rays,coin,coinCollider,body,u8,module,actions,
    characterField:(offset,value)=>setF(character+offset,value),
    tick:(ms,z)=>{clock+=ms;if(z!==undefined)setF(character+profile.characterWorld+8,z);},
    frame:(ms,z)=>{clock+=ms;setF(character+profile.characterWorld+8,z);const callbacks=[...frameCallbacks.values()];frameCallbacks.clear();for(const cb of callbacks)cb(clock);},
    nativeCalls:()=>nativeCalls,framesPending:()=>frameCallbacks.size,
    runStarted:()=>listeners.get('tro:unity-runtime-event')?.({detail:{type:'reborn:runStarted'}}),
    updateCoin:()=>module.dynCall_vifffii(profile.coinUpdate,coin)};
}

test('jumping does not move landing-obstacle probes above low road barriers',t=>{
  const f=fixture(t,{y:15,groundY:.8});f.reader.queryObstacles();
  assert.equal(f.rays.length,18);
  for(const y of [3.8,12.8,25.8])assert.ok(f.rays.some(r=>Math.abs(r.y-y)<1e-4));
  assert.ok(!f.rays.some(r=>r.y>26));
});
test('elevated platforms retain probes for lower road lanes',t=>{
  const f=fixture(t,{y:35,groundY:30});f.reader.queryObstacles();
  for(const y of [3.8,12.8,25.8,33,42,55])assert.ok(f.rays.some(r=>Math.abs(r.y-y)<1e-4));
});
test('actual collider class names travel with coin and player observations',t=>{
  const f=fixture(t);f.updateCoin();const scene=f.reader.snapshot();
  assert.equal(scene.body.shape,'CapsuleCollider');assert.equal(scene.coins[0].shape,'SphereCollider');
});
test('active slow-frame coins survive until at least three observed engine steps',t=>{
  const f=fixture(t);f.updateCoin();f.reader.snapshot();f.tick(300,133);f.reader.snapshot();f.tick(300,166);
  const s=f.reader.snapshot();assert.ok(Math.abs(s.engineStep-.3)<1e-5);assert.equal(s.coins.length,1);
  f.u8[f.coin+profile.coinActive]=0;assert.equal(f.reader.snapshot().coins.length,0);
});
test('animation-frame sampling does not alias 60 FPS to the slower snapshot cadence',t=>{
  const f=fixture(t,{raf:true});f.reader.snapshot();const calls=f.nativeCalls();
  for(let i=1;i<=6;i++)f.frame(1000/60,100+i*110/60);
  assert.equal(f.nativeCalls(),calls,'Per-frame tracking must not call into native APIs');
  assert.ok(Math.abs(f.reader.snapshot().engineStep-1/60)<1e-5);
  assert.equal(f.framesPending(),1);f.reader.stop();assert.equal(f.framesPending(),0);
});
test('a new run clears the previous frame-step estimate',t=>{
  const f=fixture(t,{raf:true});f.reader.snapshot();
  for(let i=1;i<=4;i++)f.frame(100,100+i*11);
  assert.ok(Math.abs(f.reader.snapshot().engineStep-.1)<1e-5);
  f.runStarted();assert.ok(Math.abs(f.reader.snapshot().engineStep-1/60)<1e-5);
});
test('a train containing the far ray origin is found by the forward probe',t=>{
  const f=fixture(t,{y:.8,groundY:.8,longTrain:true}),obstacles=f.reader.queryObstacles();
  assert.equal(obstacles.length,1);assert.equal(obstacles[0].shape,'BoxCollider');assert.equal(obstacles[0].tag,'HitTrain');
  assert.ok(f.rays.some(r=>r.dz===1&&Math.abs(r.z-70)<1e-4));
  assert.ok(f.rays.some(r=>r.dz===-1&&Math.abs(r.z-450)<1e-4));
});
test('obstacle positions refresh within 60 ms instead of a 180 ms blind interval',t=>{
  const f=fixture(t);f.reader.snapshot();const first=f.rays.length;
  f.tick(59);f.reader.snapshot();assert.equal(f.rays.length,first);
  f.tick(2);f.reader.snapshot();assert.equal(f.rays.length,first*2);
});
test('current jump height is read instead of the unboosted configuration field',t=>{
  const f=fixture(t);f.characterField(profile.characterNormalJumpHeight,20);f.characterField(profile.characterJumpHeight,40);
  assert.equal(f.reader.snapshot().jumpHeight,40);
});
test('an airborne character cannot accept another ground jump while its jump flag is stale',t=>{
  const f=fixture(t,{y:4,groundY:.8});
  assert.equal(f.reader.act('jump'),false);assert.equal(f.actions.length,0);
  f.characterField(profile.characterWorld+4,.8);f.characterField(profile.characterVerticalSpeed,-3);
  assert.equal(f.reader.act('jump'),true);assert.equal(f.actions.length,1);assert.equal(f.actions[0].index,profile.jump);
});
