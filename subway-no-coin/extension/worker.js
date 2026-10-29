import {createController} from './controller.js';
import {createLearningController} from './learning-controller.js';
const pilot=createController(chrome),learning=createLearningController(chrome);
let learningStats=null,view='pilot';
async function refreshStats(){learningStats=await learning.stats();return learningStats;}
async function stopAll(reason='Stopped'){await pilot.stop(reason);await learning.stop(reason);void refreshStats();}
async function command(name,tab){
  if(name==='stop-pilot')return stopAll();
  if(name==='toggle-recording'){view='learning';
    if(learning.active)return learning.stop('Recording saved');
    await pilot.stop();return learning.start('record',tab);
  }
  if(learning.active)return learning.stop();
  const {backend}=await chrome.storage.local.get('backend');
  if(backend==='learned'){view='learning';
    await pilot.stop();return learning.start(name==='observe-pilot'?'observe':'play',tab);
  }
  view='pilot';return pilot.command(name,tab);
}
chrome.debugger.onDetach.addListener(source=>{if(learning.tabId===source.tabId)void learning.stop('Debugger detached — learning stopped');if(pilot.tabId===source.tabId)void pilot.stop('Debugger detached — controls stopped');});
chrome.tabs.onRemoved.addListener(id=>{if(learning.tabId===id||pilot.tabId===id)void stopAll('Game tab closed');});
chrome.tabs.onActivated.addListener(info=>{if((learning.tabId&&learning.tabId!==info.tabId)||(pilot.tabId&&pilot.tabId!==info.tabId))void stopAll('Switched tabs — stopped');});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='loading'&&(learning.tabId===id||pilot.tabId===id))void stopAll('Page navigated — restart recording/control');});
chrome.commands.onCommand.addListener((name,tab)=>{void command(name,tab).catch(e=>learning.progress({message:e.message}));});
chrome.runtime.onInstalled.addListener(()=>{void chrome.storage.local.set({precision:false,backend:'learned'});});
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||m.to==='vision'||m.to==='learner')return;
  const run=async()=>{
    if(m.type==='status'){const s=learning.active||view==='learning'?learning.status:pilot.status;return {...s,learningStats};}
    if(m.type==='learning-stats')return refreshStats();
    if(m.type==='learning-record'){view='learning';await pilot.stop();return learning.start('record');}
    if(m.type==='learning-train'){view='learning';await pilot.stop();return learning.train();}
    if(m.type==='learning-stop'){const result=await learning.stop(m.reason||'Recording saved');await refreshStats();return result;}
    if(m.type==='learning-progress'){learning.progress(m.patch);if(m.patch.stats)learningStats=m.patch.stats;return {ok:true};}
    if(m.type==='learning-sample')return learning.readSample();
    if(m.type==='learning-decision')return learning.decide(m);
    if(m.type==='start'){
      if(m.backend==='learned'){view='learning';await pilot.stop();return learning.start(m.dry?'observe':'play');}
      view='pilot';await learning.stop();return pilot.start(m);
    }
    if(m.type==='stop')return stopAll(m.reason);
    if(m.type==='frame')return pilot.frame(m);
    return pilot.status;
  };
  run().then(reply,async e=>{if(m.type.startsWith('learning-'))await learning.stop(`Learning error: ${e.message}`);else if(m.type==='frame')await pilot.stop(`Game inspection error: ${e.message}`);reply({error:e.message});});
  return true;
});
