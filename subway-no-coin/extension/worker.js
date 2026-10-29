import {createController} from './controller.js';
const pilot = createController(chrome);
chrome.debugger.onDetach.addListener(source => {if (pilot.tabId === source.tabId) void pilot.stop('Debugger detached — controls stopped');});
chrome.tabs.onRemoved.addListener(id => {if (pilot.tabId === id) void pilot.stop('Game tab closed');});
chrome.tabs.onActivated.addListener(info => {if (pilot.tabId && pilot.tabId !== info.tabId) void pilot.stop('Switched tabs — controls stopped');});
chrome.tabs.onUpdated.addListener((id, change) => {if (pilot.tabId === id && change.status === 'loading') void pilot.stop('Page navigated — restart capture');});
chrome.commands.onCommand.addListener((name, tab) => {void pilot.command(name,tab).catch(()=>{});});
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id || m.to === 'vision') return;
  const run = async()=>{
    if (m.type==='status') return pilot.status;
    if (m.type==='start') return pilot.start(m);
    if (m.type==='stop') return pilot.stop(m.reason);
    if (m.type==='frame') return pilot.frame(m);
    return pilot.status;
  };
  run().then(reply,async e=>{if(m.type==='frame')await pilot.stop(`Game inspection error: ${e.message}`);reply({error:e.message});});
  return true;
});
