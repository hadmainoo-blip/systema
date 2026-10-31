import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../extension/controller.js';
import {installLegacyReader} from '../extension/native-reader.js';
import {legacyProfile} from '../extension/legacy-profile.js';
test('native exports are never called while Unity is still on its loading splash',()=>{let calls=0;globalThis.window={unityGame:{Module:{calledRun:false,wasmCodeUrl:`player-${legacyProfile.playerHash}.wasm`,HEAPU8:new Uint8Array(4096),asm:{dynCall_ii:()=>{calls++;}}}}};try{assert.throws(()=>installLegacyReader(legacyProfile),/not ready/);assert.equal(calls,0);}finally{delete globalThis.window;}});
function fixture(t){
  const calls=[];let attachWait=null,tab={id:7,url:'https://ashuni.lol/legacy/sanfrancisco/'};
  const api={
    storage:{local:{get:async()=>({precision:true})}},tabs:{query:async()=>[tab]},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    runtime:{sendMessage:async m=>{calls.push(m);return {ok:true};}},
    offscreen:{hasDocument:async()=>{throw new Error('Native mode must not need offscreen capture');}},
    tabCapture:{getMediaStreamId:async()=>{throw new Error('Native mode must not need video capture');}},
    debugger:{attach:async()=>{calls.push({type:'attach'});if(attachWait)await attachWait;},detach:async()=>{calls.push({type:'detach'});},sendCommand:async(_,method,args)=>{calls.push({type:method,...args});return {result:{value:{running:true,message:'Native autopilot armed',backend:'native',frames:0,changes:0}}};}}
  };
  const pilot=createController(api);t.after(()=>pilot.stop());return {pilot,calls,setUrl:url=>{tab.url=url;},blockAttach:()=>{let resolve;attachWait=new Promise(r=>{resolve=r;});return resolve;}};
}
test('built-in startup uses normal lanes even when old precision settings are enabled',async t=>{const f=fixture(t);const s=await f.pilot.start();assert.equal(s.running,true);assert.equal(s.backend,'native');const injection=f.calls.find(c=>c.expression?.includes('startNativePilot'));assert.equal(injection.awaitPromise,true);assert.match(injection.expression,/snapshot\(\)/);assert.match(injection.expression,/"precision":false/);});
test('unsupported pages produce an actionable error before debugger attachment',async t=>{const f=fixture(t);f.setUrl('https://example.com/legacy/sanfrancisco/');await assert.rejects(()=>f.pilot.start(),/ashuni.lol\/legacy\/sanfrancisco/);assert.ok(!f.calls.some(c=>c.type==='attach'));});
test('Stop during native attachment cancels startup and cleans up the late attachment',async t=>{const f=fixture(t),release=f.blockAttach(),start=f.pilot.start();await new Promise(r=>setTimeout(r,0));assert.ok(f.calls.some(c=>c.type==='attach'));await f.pilot.stop();release();await assert.rejects(start,/cancelled/);assert.equal(f.pilot.status.running,false);assert.ok(!f.calls.some(c=>c.expression?.includes('startNativePilot')));assert.ok(f.calls.some(c=>c.type==='detach'));});
test('Stop cancels the page startup token before detaching',async t=>{const f=fixture(t);await f.pilot.start();f.calls.length=0;await f.pilot.stop();assert.ok(f.calls.find(c=>c.expression?.includes('__noCoinStartupToken=null')));assert.equal(f.calls.at(-1).type,'detach');});
