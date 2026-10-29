let session = null, lastAction = 0, busy = false;
let status = {running: false, message: 'Idle', lane: 1, changes: 0};
async function stop(message = 'Stopped') {
  const old = session; session = null;
  status = {...status, running: false, message};
  await chrome.runtime.sendMessage({to:'vision', type:'stop'}).catch(()=>{});
  if (old) await chrome.debugger.detach({tabId:old.tabId}).catch(()=>{});
}
chrome.debugger.onDetach.addListener(source => {if (session?.tabId === source.tabId) void stop('Debugger detached — controls stopped');});
chrome.tabs.onRemoved.addListener(id => {if (session?.tabId === id) void stop('Game tab closed');});
chrome.tabs.onActivated.addListener(info => {if (session && session.tabId !== info.tabId) void stop('Switched tabs — controls stopped');});
chrome.tabs.onUpdated.addListener((id, change) => {if (session?.tabId === id && change.status === 'loading') void stop('Page navigated — restart capture');});
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id || m.to === 'vision') return;
  (async()=>{
    if (m.type === 'status') return status;
    if (m.type === 'stop') {await stop(); return status;}
    if (m.type === 'start') {
      await stop();
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open the game tab first.');
      if (!(await chrome.offscreen.hasDocument())) await chrome.offscreen.createDocument({url:'vision.html', reasons:['USER_MEDIA'], justification:'Analyze the game tab locally to choose movement inputs.'});
      await chrome.debugger.attach({tabId:tab.id}, '1.3');
      session = {tabId:tab.id, config:m.config, dry:!!m.dry};
      const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});
      status = {running:true, message:m.dry?'Observe only':'Autopilot active', lane:Number(m.lane), changes:0};
      const response = await chrome.runtime.sendMessage({to:'vision',type:'start',streamId,config:m.config});
      if (!response?.ok) throw new Error(response?.error || 'Capture did not start');
      return status;
    }
    if (m.type === 'frame' && session) {
      status = {...status,...m.telemetry};
      if (m.pause) {await stop(m.pause); return status;}
      if (session.dry || busy || !['left','right'].includes(m.action) || Date.now()-lastAction < session.config.cooldown) return status;
      busy = true;
      try {
        const target = {tabId:session.tabId}, key = m.action === 'left'?'ArrowLeft':'ArrowRight';
        await chrome.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:key,windowsVirtualKeyCode:key==='ArrowLeft'?37:39});
        await chrome.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='ArrowLeft'?37:39});
        status.lane = Math.max(0,Math.min(2,status.lane+(m.action==='left'?-1:1)));
        status.changes++; lastAction = Date.now();
      } finally {busy=false;}
      return status;
    }
    return status;
  })().then(reply, async e => {await stop(e.message);reply({error:e.message});});
  return true;
});
