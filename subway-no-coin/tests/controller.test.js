import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../extension/controller.js';
function fixture() {
  const events=[], page={canvas:true,focused:true,runtime:{phase:'running',ready:true,paused:false},crop:{left:.25,right:.75,top:0,bottom:1},keys:{left:{key:'a',code:'KeyA',virtual:65},right:{key:'d',code:'KeyD',virtual:68}}};
  let now=1000, captureError=false;
  const api={
    action:{setBadgeText:async o=>events.push(['badge',o.text]),setBadgeBackgroundColor:async()=>{}},
    storage:{local:{get:async()=>({lane:1})}},
    runtime:{sendMessage:async m=>{events.push(['message',m]);return m.type==='start'?captureError?{error:'Permission denied'}:{ok:true}:{ok:true};}},
    tabs:{query:async()=>[{id:7,url:'https://ashuni.lol/journey-to-the-east/'}]},
    offscreen:{hasDocument:async()=>true},
    tabCapture:{getMediaStreamId:async()=> 'test-stream'},
    debugger:{attach:async()=>events.push(['attach']),detach:async()=>events.push(['detach']),sendCommand:async(t,method,args)=>{events.push([method,args]);return method==='Runtime.evaluate'?{result:{value:structuredClone(page)}}:{};}}
  };
  return {events,page,advance:ms=>{now+=ms;},denyCapture:()=>{captureError=true;},pilot:createController(api,()=>now,async ms=>{events.push(['delay',ms]);now+=ms;})};
}
test('shortcut starts real movement mode without popup',async()=>{const f=fixture();await f.pilot.command('toggle-pilot');assert.equal(f.pilot.status.running,true);assert.match(f.pilot.status.message,/Autopilot/);assert.ok(f.events.some(e=>e[0]==='badge'&&e[1]==='ON'));});
test('same shortcut stops active session and detaches',async()=>{const f=fixture();await f.pilot.command('toggle-pilot');await f.pilot.command('toggle-pilot');assert.equal(f.pilot.status.running,false);assert.ok(f.events.some(e=>e[0]==='detach'));});
test('Ashuni inputs are A/D and held across Unity frames',async()=>{const f=fixture();await f.pilot.start();await f.pilot.frame({action:'left'});const inputs=f.events.filter(e=>e[0]==='Input.dispatchKeyEvent');assert.equal(inputs.length,2);assert.equal(inputs[0][1].key,'a');assert.equal(inputs[0][1].code,'KeyA');assert.equal(inputs[1][1].type,'keyUp');const down=f.events.indexOf(inputs[0]),up=f.events.indexOf(inputs[1]);assert.ok(f.events.slice(down+1,up).some(e=>e[0]==='delay'&&e[1]>=60));assert.equal(f.pilot.status.changes,1);});
test('paused game waits without sending inputs or losing capture',async()=>{const f=fixture();f.page.runtime.paused=true;await f.pilot.start();await f.pilot.frame({action:'left'});assert.equal(f.pilot.status.running,true);assert.match(f.pilot.status.message,/paused/);assert.equal(f.events.filter(e=>e[0]==='Input.dispatchKeyEvent').length,0);});
test('resuming game permits movement again',async()=>{const f=fixture();f.page.runtime.paused=true;await f.pilot.start();await f.pilot.frame({action:'left'});f.page.runtime.paused=false;f.advance(300);await f.pilot.frame({action:'left'});assert.equal(f.pilot.status.changes,1);});
test('observation shortcut never sends keyboard events',async()=>{const f=fixture();await f.pilot.command('observe-pilot');await f.pilot.frame({action:'left'});assert.equal(f.pilot.status.changes,0);assert.equal(f.events.filter(e=>e[0]==='Input.dispatchKeyEvent').length,0);});
test('canvas geometry is supplied to capture cropping',async()=>{const f=fixture();await f.pilot.start();const m=f.events.find(e=>e[0]==='message'&&e[1].type==='start')[1];assert.equal(m.config.left,.25);assert.equal(m.config.right,.75);});
test('capture failure preserves actionable error and detaches',async()=>{const f=fixture();f.denyCapture();await assert.rejects(()=>f.pilot.start(),/Permission denied/);assert.match(f.pilot.status.message,/Permission denied/);assert.equal(f.pilot.status.running,false);assert.ok(f.events.some(e=>e[0]==='detach'));});
test('no canvas prevents capture instead of silently doing nothing',async()=>{const f=fixture();f.page.canvas=false;await assert.rejects(()=>f.pilot.start(),/No game canvas/);assert.equal(f.pilot.status.running,false);});
test('cooldown prevents duplicate rapid lane changes',async()=>{const f=fixture();await f.pilot.start();await f.pilot.frame({action:'left'});await f.pilot.frame({action:'right'});assert.equal(f.pilot.status.changes,1);});
