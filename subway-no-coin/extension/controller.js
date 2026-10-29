import {defaults, validate} from './core.js';
import {inspectPage} from './bridge.js';
import {legacyProfile} from './legacy-profile.js';
import {installLegacyReader} from './native-reader.js';
import {startNativePilot} from './native-pilot.js';
import {planNative} from './native-planner.js';

export function createController(api, now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve,ms))) {
  let nativeHeartbeat=null;
  let session = null, lastAction = -Infinity, busy = false, starting = false;
  let status = {running: false, message: 'Idle', lane: 1, changes: 0, frames: 0};
  const badge = text => api.action.setBadgeText({text}).catch(()=>{});
  async function stop(message = 'Stopped') {
    const old = session;clearInterval(nativeHeartbeat);nativeHeartbeat=null;
    session = null;
    status = {...status, running: false, message};
    await badge('');
    await api.runtime.sendMessage({to:'vision', type:'stop'}).catch(()=>{});
    if(old?.backend==='native')await api.debugger.sendCommand({tabId:old.tabId},'Runtime.evaluate',{expression:`window.__noCoinPilotNative?.stop(${JSON.stringify(message)})`,returnByValue:true}).catch(()=>{});
    if (old?.pressed) {
      await api.debugger.sendCommand({tabId:old.tabId},'Input.dispatchKeyEvent',{...old.pressed,type:'keyUp'}).catch(()=>{});old.pressed=null;
    }
    if (old) await api.debugger.detach({tabId:old.tabId}).catch(()=>{});
    return status;
  }
  async function inspect(tabId, focus) {
    const response = await api.debugger.sendCommand({tabId},'Runtime.evaluate',{expression:`(${inspectPage.toString()})(${!!focus})`,returnByValue:true});
    if (response.exceptionDetails || !response.result?.value) throw new Error('Could not inspect the game canvas');
    return response.result.value;
  }
  async function start(options = {}, tab) {
    if (starting) throw new Error('Already starting capture');
    starting = true;
    try {
      await stop();
      const saved = await api.storage.local.get(['config','lane','autoCrop','controls','backend','precision','stopOnCoin','autoBrake','hud']);
      const config = validate(options.config || saved.config || defaults);
      const lane = Number(options.lane ?? saved.lane ?? 1);
      if (!Number.isInteger(lane) || lane < 0 || lane > 2) throw new Error('Select a valid starting lane');
      if (!tab) [tab] = await api.tabs.query({active:true,currentWindow:true});
      if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Focus the game tab first');
      const nativeRequested=(options.backend||saved.backend||'auto')!=='vision' && new URL(tab.url).pathname.replace(/\/$/,'')==='/legacy/sanfrancisco';
      if (!nativeRequested && !(await api.offscreen.hasDocument())) await api.offscreen.createDocument({url:'vision.html', reasons:['USER_MEDIA'], justification:'Analyze the selected game tab locally to choose movement inputs.'});
      await api.debugger.attach({tabId:tab.id}, '1.3');
      session = {tabId:tab.id, config, dry:options.dry === true, controls:options.controls || saved.controls || 'site', checked:-Infinity};
      if(nativeRequested){
        session.backend='native';
        const nativeOptions={dry:options.dry===true,precision:options.precision??saved.precision??true,stopOnCoin:options.stopOnCoin??saved.stopOnCoin??true,autoBrake:options.autoBrake??saved.autoBrake??true,hud:options.hud??saved.hud??true};
        const expression=`window.__noCoinPilotNative?.stop('Restarting');(${installLegacyReader.toString()})(${JSON.stringify(legacyProfile)});(${startNativePilot.toString()})(${JSON.stringify(nativeOptions)},${planNative.toString()})`;
        const result=await api.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression,returnByValue:true});
        if(result.exceptionDetails||!result.result?.value)throw new Error(result.exceptionDetails?.exception?.description||'Native startup failed');
        status=result.result.value;
        nativeHeartbeat=setInterval(async()=>{const active=session;if(active?.backend!=='native')return;try{const r=await api.debugger.sendCommand({tabId:active.tabId},'Runtime.evaluate',{expression:'window.__noCoinPilotNative?.ping();window.__noCoinPilotNative?.status()',returnByValue:true});if(session!==active)return;if(r.exceptionDetails||!r.result?.value)throw new Error('Native pilot disconnected');status=r.result.value;if(!status.running){const message=status.message;await stop(message);}}catch(e){if(session===active)await stop(e.message);}},750);
        await badge(nativeOptions.dry?'OBS':'ON');return status;
      }
      const page = await inspect(tab.id,true);
      if (!page.canvas) throw new Error('No game canvas found. Open the actual game page first.');
      session.page = page;
      if ((options.autoCrop ?? saved.autoCrop ?? true) && page.crop) session.config = validate({...config,...page.crop});
      const streamId = await api.tabCapture.getMediaStreamId({targetTabId:tab.id});
      status = {running:true, message:session.dry?'Observe only — NO movement':'Autopilot — waiting for video', lane, changes:0, frames:0};
      lastAction = -Infinity;
      const response = await api.runtime.sendMessage({to:'vision',type:'start',streamId,config:session.config});
      if (!response?.ok) throw new Error(response?.error || 'Video capture did not respond');
      await api.action.setBadgeBackgroundColor({color:session.dry?'#8e9db2':'#14966c'});
      await badge(session.dry?'OBS':'ON');
      return status;
    } catch (e) {await stop(`Error: ${e.message}`);throw e;}
    finally {starting = false;}
  }
  async function frame(m) {
    if (!session) return status;
    const active = session;
    status = {...status, frames:status.frames+1, ...m.telemetry};
    status.message = active.dry?'Observe only — NO movement':'Autopilot active';
    if (m.error) return stop(`Capture error: ${m.error}`);
    if (m.pause) return stop(m.pause);
    if (now()-active.checked > 250) {
      active.page = await inspect(active.tabId,true);active.checked = now();
    }
    if (session !== active) return status;
    if (!active.page.focused || (active.page.runtime && (!active.page.runtime.ready || active.page.runtime.paused || active.page.runtime.phase !== 'running'))) {
      status.message = active.page.runtime?.paused?'Game paused — resume inside the game':!active.page.focused?'Waiting for game focus':'Waiting for a running game';
      return status;
    }
    if (active.dry || busy || !['left','right'].includes(m.action) || now()-lastAction < active.config.cooldown) return status;
    busy = true;
    const target = {tabId:active.tabId};
    const keyInfo = active.controls==='arrows' ? {key:m.action==='left'?'ArrowLeft':'ArrowRight',code:m.action==='left'?'ArrowLeft':'ArrowRight',virtual:m.action==='left'?37:39} : active.page.keys[m.action];
    const {key,code,virtual} = keyInfo;
    try {
      active.pressed={key,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual};
      await api.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'rawKeyDown',...active.pressed});
      // Unity samples keys in its update loop. A same-tick down/up may never be observed.
      await delay(80);
      // Always release the key, including when Stop is clicked mid-input.
      if(active.pressed){await api.debugger.sendCommand(target,'Input.dispatchKeyEvent',{type:'keyUp',...active.pressed});active.pressed=null;}
      if (session === active) {status.lane = Math.max(0,Math.min(2,status.lane+(m.action==='left'?-1:1)));status.changes++;lastAction=now();}
    } catch(e) {if(session===active)await stop(`Input error: ${e.message}`);}
    finally {busy = false;}
    return status;
  }
  async function command(name, tab) {
    if (name==='stop-pilot' || (name==='toggle-pilot' && status.running)) return stop();
    if (name==='toggle-pilot' || name==='observe-pilot') return start({dry:name==='observe-pilot'},tab);
    return status;
  }
  return {start,stop,frame,command,get status(){return status;},get tabId(){return session?.tabId;}};
}
