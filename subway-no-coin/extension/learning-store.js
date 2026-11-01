import {FEATURE_VERSION,labelCounts} from './learning-core.js';
let database;
export function openStore(){if(!database)database=new Promise((resolve,reject)=>{const request=indexedDB.open('no-coin-learning',1);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('samples',{keyPath:'id',autoIncrement:true});db.createObjectStore('meta',{keyPath:'key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return database;}
async function transaction(store,mode,fn){const db=await openStore();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),r=fn(tx.objectStore(store));let value;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage operation aborted'));});}
export const allSamples=()=>transaction('samples','readonly',s=>s.getAll());
export const addSample=sample=>transaction('samples','readwrite',s=>s.add({...sample,version:FEATURE_VERSION}));
export const getMeta=key=>transaction('meta','readonly',s=>s.get(key));
export const setMeta=(key,value)=>transaction('meta','readwrite',s=>s.put({key,value}));
// Commit a labelled video batch atomically. Re-imports replace the same source/time.
export async function importVideoSamples(samples){
  if(!samples.length||samples.some(s=>s.version!==FEATURE_VERSION||s.source?.kind!=='video'||!s.source.sampleKey||s.features?.length!==640||!Array.from(s.features).every(Number.isFinite)||!['hold','left','right','jump','roll'].includes(s.label)))throw new Error('Invalid labelled video batch');
  const db=await openStore();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('samples','readwrite'),store=tx.objectStore('samples'),read=store.getAll();let failure;
    read.onsuccess=()=>{
      const existing=read.result,byKey=new Map(existing.filter(s=>s.source?.kind==='video').map(s=>[s.source.sampleKey,s.id]));
      const unique=new Map(samples.map(s=>[s.source.sampleKey,s]));
      if(existing.length+[...unique.keys()].filter(k=>!byKey.has(k)).length>6000){failure=new Error('Dataset limit reached (6,000 frames). Export before clearing it.');tx.abort();return;}
      for(const [key,sample]of unique){const value={...sample};delete value.id;if(byKey.has(key))value.id=byKey.get(key);store.put(value);}
    };
    tx.oncomplete=()=>resolve(samples.length);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure||tx.error||new Error('Video import cancelled'));
  });
}
export async function removeTail(episode,after){const db=await openStore();return new Promise((resolve,reject)=>{const tx=db.transaction('samples','readwrite'),store=tx.objectStore('samples'),r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(c.value.episode===episode&&c.value.at>=after)c.delete();c.continue();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function datasetStats(){const samples=await allSamples();return {samples:samples.length,episodes:new Set(samples.map(s=>s.episode)).size,counts:labelCounts(samples),model:(await getMeta('model'))?.value?.summary||null};}
export async function clearSamples(){await transaction('samples','readwrite',s=>s.clear());await transaction('meta','readwrite',s=>s.delete('model'));return datasetStats();}
