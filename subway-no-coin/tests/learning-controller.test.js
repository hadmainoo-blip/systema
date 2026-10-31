import test from 'node:test';
import assert from 'node:assert/strict';
import {createLearningController} from '../extension/learning-controller.js';
test('stopping recording drains final game events before saving and detaching',async()=>{
  const calls=[],events=[{action:'roll',at:1234}],api={
    runtime:{sendMessage:async m=>{calls.push(m);return {ok:true};}},
    action:{setBadgeText:async()=>{}},offscreen:{hasDocument:async()=>true},
    debugger:{attach:async()=>{},detach:async()=>{calls.push({type:'detach'});},sendCommand:async(_,method,params)=>{
      if(params.expression==='window.__noCoinDemonstrator?.sample()')return {result:{value:{events}}};
      return {result:{value:{installed:true}}};
    }},tabCapture:{getMediaStreamId:async()=> 'fixture-stream'}
  };
  const controller=createLearningController(api);await controller.start('record',{id:8,url:'https://ashuni.lol/legacy/sanfrancisco/'});calls.length=0;
  await controller.stop();assert.equal(calls[0].type,'stop');assert.deepEqual(calls[0].events,events);assert.equal(calls[1].type,'detach');assert.equal(controller.status.running,false);
});

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function fixture(overrides={}){
  const calls=[];
  const api={runtime:{sendMessage:async m=>{calls.push(m);return {ok:true};}},action:{setBadgeText:async m=>calls.push({type:'badge',...m})},offscreen:{hasDocument:async()=>true},debugger:{attach:async()=>{},detach:async()=>calls.push({type:'detach'}),sendCommand:async()=>({result:{value:{installed:true}}})},tabCapture:{getMediaStreamId:async()=> 'fixture-stream'}};
  for(const [k,v]of Object.entries(overrides))api[k]={...api[k],...v};
  return {api,calls,controller:createLearningController(api)};
}
test('Stop during debugger attachment waits for cleanup and cannot resurrect recording',async()=>{
  const attached=deferred(),release=deferred(),f=fixture({debugger:{attach:async()=>{attached.resolve();await release.promise;}}});
  const startup=f.controller.start('record',{id:9,url:'https://ashuni.lol/legacy/sanfrancisco/'}),rejected=assert.rejects(startup,/cancelled/);
  await attached.promise;const stopped=f.controller.stop('User stopped');release.resolve();await Promise.all([rejected,stopped]);
  assert.equal(f.controller.status.running,false);assert.equal(f.controller.status.message,'User stopped');
  assert.equal(f.calls.filter(m=>m.type==='detach').length,1);assert.ok(!f.calls.some(m=>m.type==='start'||m.text==='REC'));
});
test('Stop during stream ID acquisition prevents starting the offscreen recorder',async()=>{
  const entered=deferred(),release=deferred(),f=fixture({tabCapture:{getMediaStreamId:async()=>{entered.resolve();await release.promise;return 'late-stream';}}});
  const startup=f.controller.start('record',{id:9,url:'https://ashuni.lol/legacy/sanfrancisco/'}),rejected=assert.rejects(startup,/cancelled/);
  await entered.promise;const stopped=f.controller.stop();release.resolve();await Promise.all([rejected,stopped]);
  assert.equal(f.controller.status.running,false);assert.ok(!f.calls.some(m=>m.type==='start'));
});
test('duplicate Train requests reserve one job before asynchronous preparation',async()=>{
  const entered=deferred(),release=deferred(),f=fixture({offscreen:{hasDocument:async()=>false,createDocument:async()=>{entered.resolve();await release.promise;}}});
  const training=f.controller.train();await entered.promise;
  await assert.rejects(()=>f.controller.train(),/already in progress/);release.resolve();await training;
  assert.equal(f.calls.filter(m=>m.type==='train').length,1);await f.controller.stop();
});
test('Stop while training preparation awaits offscreen creation cancels the job',async()=>{
  const entered=deferred(),release=deferred(),f=fixture({offscreen:{hasDocument:async()=>false,createDocument:async()=>{entered.resolve();await release.promise;}}});
  const training=f.controller.train(),rejected=assert.rejects(training,/cancelled/);await entered.promise;
  await f.controller.stop();release.resolve();await rejected;assert.ok(!f.calls.some(m=>m.type==='train'));
});
