import {legacyProfile} from './legacy-profile.js';
import {installLegacyReader} from './native-reader.js';
import {installDemonstrator} from './demonstrator.js';
import {datasetStats,getMeta} from './learning-store.js';
export function createLearningController(api){
  let tabId=null,mode=null,lastAction=-Infinity,sample=null,starting=false,generation=0,startup=null;
  let state={running:false,training:false,backend:'learned',message:'Learning idle',lane:1,changes:0,frames:0};
  async function evaluate(expression){const r=await api.debugger.sendCommand({tabId},'Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||'Game observer failed');return r.result?.value;}
  async function stop(reason='Stopped',waitForStartup=true){
    generation++;
    const old=tabId,oldMode=mode;tabId=null;mode=null;state={...state,running:false,training:false,message:reason};
    let events=[];
    if(old&&oldMode==='record')try{const r=await api.debugger.sendCommand({tabId:old},'Runtime.evaluate',{expression:'window.__noCoinDemonstrator?.sample()',returnByValue:true});events=r.result?.value?.events||[];}catch{}
    await api.runtime.sendMessage({to:'learner',type:'stop',events}).catch(()=>{});
    if(old){await api.debugger.sendCommand({tabId:old},'Runtime.evaluate',{expression:'window.__noCoinDemonstrator?.stop()',returnByValue:true}).catch(()=>{});await api.debugger.detach({tabId:old}).catch(()=>{});}
    await api.action.setBadgeText({text:''});if(waitForStartup&&startup)await startup;return state;
  }
  async function offscreen(){if(!(await api.offscreen.hasDocument()))await api.offscreen.createDocument({url:'vision.html',reasons:['USER_MEDIA'],justification:'Capture the selected game tab and train a small local visual control model.'});}
  async function start(requestedMode='record',tab){
    if(starting||state.training)throw new Error('Startup or training is already in progress');starting=true;
    let finishStartup;startup=new Promise(resolve=>{finishStartup=resolve;});
    const cleanup=stop('Preparing learning',false),run=generation;
    const check=()=>{if(run!==generation)throw new Error('Learning startup cancelled');};
    try{
      await cleanup;check();if(!['record','observe','play'].includes(requestedMode))throw new Error('Invalid learning mode');
      if(!tab)[tab]=await api.tabs.query({active:true,currentWindow:true});check();
      const url=new URL(tab?.url||'about:blank');if(!['ashuni.lol','www.ashuni.lol'].includes(url.hostname)||url.pathname.replace(/\/$/,'')!=='/legacy/sanfrancisco')throw new Error('Open ashuni.lol/legacy/sanfrancisco/ first');
      if(requestedMode!=='record'&&!(await getMeta('model'))?.value)throw new Error('No trained model yet. Record two or more runs, then train.');
      await offscreen();check();await api.debugger.attach({tabId:tab.id},'1.3');tabId=tab.id;check();
      const expression=`window.__noCoinPilotNative?.stop('Learning mode');(${installLegacyReader.toString()})(${JSON.stringify(legacyProfile)});(${installDemonstrator.toString()})();`;
      await evaluate(expression);check();
      const streamId=await api.tabCapture.getMediaStreamId({targetTabId:tab.id});check();
      lastAction=-Infinity;sample=null;
      mode=requestedMode;state={...state,running:true,message:mode==='record'?'Loading vision model — recording is passive':'Loading learned visual policy',mode,frames:0,changes:0};
      const response=await api.runtime.sendMessage({to:'learner',type:'start',mode,streamId});check();if(!response?.ok)throw new Error(response?.error||'Learning capture did not start');
      await api.action.setBadgeText({text:mode==='record'?'REC':mode==='observe'?'OBS':'AI'});return state;
    }catch(e){await stop(run===generation?e.message:state.message,false);throw e;}finally{starting=false;finishStartup();startup=null;}
  }
  async function readSample(){
    if(!tabId||!mode)return {error:'No active learning session'};
    sample=await evaluate('window.__noCoinDemonstrator?.sample()');if(!sample?.scene)throw new Error('Native observer disconnected');
    state.frames++;state.lane=sample.scene.lane;state.nativeScene=sample.scene;
    return sample;
  }
  async function decide(m){
    if(mode!=='play')return {ok:true};
    if(!sample?.scene?.running||!sample.focused)return {ok:true};
    if(sample.scene.collected>0){await evaluate('window.__noCoinDemonstrator?.pause()');await stop('Coin collected — learned run paused');return {ok:false};}
    const {action,confidence,margin}=m.decision||{};
    if(!['hold','left','right','jump','roll'].includes(action))throw new Error('Invalid model action');
    if(!Number.isFinite(confidence)||!Number.isFinite(margin)||confidence<.6||margin<.12){await evaluate('window.__noCoinDemonstrator?.pause()');await stop('Model uncertain — paused. Record more examples of this situation.');return {ok:false};}
    if(action==='hold'||Date.now()-lastAction<250)return {ok:true};
    const acted=await evaluate(`window.__noCoinDemonstrator?.act(${JSON.stringify(action)})`);
    if(acted){lastAction=Date.now();state.changes++;}return {ok:true,acted};
  }
  async function train(){
    if(starting||state.training)throw new Error('Startup or training is already in progress');
    // Reserve startup synchronously so repeated clicks cannot start two jobs.
    starting=true;const cleanup=stop('Preparing local training',false),run=generation;
    try{await cleanup;if(run!==generation)throw new Error('Training cancelled');await offscreen();if(run!==generation)throw new Error('Training cancelled');state={...state,training:true,message:'Preparing local training'};const r=await api.runtime.sendMessage({to:'learner',type:'train'});if(r?.error)throw new Error(r.error);return state;}
    catch(e){state={...state,training:false,message:e.message};throw e;}finally{starting=false;}
  }
  return {start,stop,readSample,decide,train,get tabId(){return tabId;},get active(){return state.running||state.training;},get mode(){return mode;},get status(){return state;},progress(patch){state={...state,...patch};},async stats(){return datasetStats();}};
}
