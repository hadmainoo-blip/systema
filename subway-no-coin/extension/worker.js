import {createController} from './controller.js';
import {createLearningController} from './learning-controller.js';
import {getMeta} from './learning-store.js';
import {selectBackend,isSupportedGame} from './runtime-settings.js';
const pilot=createController(chrome),learning=createLearningController(chrome);
let learningStats=null,view='pilot',intent=0;
const cancelled=()=>({running:false,message:'Startup cancelled'});
async function refreshStats(){learningStats=await learning.stats();return learningStats;}
async function backendFor(requested){return selectBackend(requested,requested==='learned'&&!!(await getMeta('model'))?.value);}
async function stopAll(reason='Stopped'){intent++;await pilot.stop(reason);await learning.stop(reason);void refreshStats();}
async function command(name,tab){
  if(name==='stop-pilot')return stopAll();
  const request=++intent;
  if(name==='toggle-recording'){view='learning';
    if(learning.active)return learning.stop('Recording saved');
    await pilot.stop();if(request!==intent)return cancelled();return learning.start('record',tab);
  }
  if(learning.active)return learning.stop();
  if(name==='toggle-pilot'&&pilot.status.running)return pilot.stop();
  const saved=await chrome.storage.local.get('backend'),backend=await backendFor(saved.backend);
  if(request!==intent)return cancelled();
  if(backend==='learned'){view='learning';
    await pilot.stop();if(request!==intent)return cancelled();return learning.start(name==='observe-pilot'?'observe':'play',tab);
  }
  view='pilot';return pilot.start({backend,dry:name==='observe-pilot'},tab);
}
chrome.debugger.onDetach.addListener(source=>{if(learning.tabId===source.tabId)void learning.stop('Debugger detached — learning stopped');if(pilot.tabId===source.tabId)void pilot.stop('Debugger detached — controls stopped');});
chrome.tabs.onRemoved.addListener(id=>{if(learning.tabId===id||pilot.tabId===id)void stopAll('Game tab closed');});
chrome.tabs.onActivated.addListener(info=>{if((learning.tabId&&learning.tabId!==info.tabId)||(pilot.tabId&&pilot.tabId!==info.tabId))void stopAll('Switched tabs — stopped');});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='loading'&&(learning.tabId===id||pilot.tabId===id))void stopAll('Page navigated — restart recording/control');});
chrome.commands.onCommand.addListener((name,tab)=>{void command(name,tab).catch(e=>learning.progress({message:e.message}));});
chrome.runtime.onInstalled.addListener(()=>{void (async()=>{const saved=await chrome.storage.local.get('backend');await chrome.storage.local.set({precision:false,backend:await backendFor(saved.backend)});})();});
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||m.to==='vision'||m.to==='learner')return;
  const run=async()=>{
    if(m.type==='status'){const s=learning.active||view==='learning'?learning.status:pilot.status;return {...s,learningStats};}
    if(m.type==='learning-stats')return refreshStats();
    if(m.type==='learning-import-finished'){await refreshStats();return {ok:true};}
    if(m.type==='learning-record'){const request=++intent;view='learning';await pilot.stop();if(request!==intent)return cancelled();return learning.start('record');}
    if(m.type==='learning-train'){const request=++intent;view='learning';await pilot.stop();if(request!==intent)return cancelled();return learning.train();}
    if(m.type==='learning-stop'){intent++;const result=await learning.stop(m.reason||'Recording saved');await refreshStats();return result;}
    if(m.type==='learning-progress'){learning.progress(m.patch);if(m.patch.stats)learningStats=m.patch.stats;return {ok:true};}
    if(m.type==='learning-sample')return learning.readSample();
    if(m.type==='learning-decision')return learning.decide(m);
    if(m.type==='start'){
      const request=++intent;
      const backend=await backendFor(m.backend);
      if(request!==intent)return cancelled();
      if(backend==='learned'){view='learning';await pilot.stop();if(request!==intent)return cancelled();return learning.start(m.dry?'observe':'play');}
      view='pilot';await learning.stop();
      if(request!==intent)return cancelled();
      // Release the popup immediately so the player can focus/start/resume the
      // game while native startup waits for Unity's first playable scene.
      if(backend==='auto'){
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        if(request!==intent)return cancelled();
        if(!isSupportedGame(tab?.url))throw new Error('Open https://ashuni.lol/legacy/sanfrancisco/ and wait for the game to load first.');
        void pilot.start({...m,backend},tab).catch(()=>{});return {running:true,backend:'native',message:'Arming built-in autopilot — focus and start/resume the game'};
      }
      return pilot.start({...m,backend});
    }
    if(m.type==='stop')return stopAll(m.reason);
    if(m.type==='frame')return pilot.frame(m);
    return pilot.status;
  };
  run().then(reply,async e=>{if(m.type.startsWith('learning-'))await learning.stop(`Learning error: ${e.message}`);else if(m.type==='frame')await pilot.stop(`Game inspection error: ${e.message}`);reply({error:e.message});});
  return true;
});
