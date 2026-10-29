import {FEATURE_VERSION,labelCounts} from './learning-core.js';
let database;
export function openStore(){if(!database)database=new Promise((resolve,reject)=>{const request=indexedDB.open('no-coin-learning',1);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('samples',{keyPath:'id',autoIncrement:true});db.createObjectStore('meta',{keyPath:'key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return database;}
async function transaction(store,mode,fn){const db=await openStore();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),r=fn(tx.objectStore(store));let value;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage operation aborted'));});}
export const allSamples=()=>transaction('samples','readonly',s=>s.getAll());
export const addSample=sample=>transaction('samples','readwrite',s=>s.add({...sample,version:FEATURE_VERSION}));
export const getMeta=key=>transaction('meta','readonly',s=>s.get(key));
export const setMeta=(key,value)=>transaction('meta','readwrite',s=>s.put({key,value}));
export async function removeTail(episode,after){const db=await openStore();return new Promise((resolve,reject)=>{const tx=db.transaction('samples','readwrite'),store=tx.objectStore('samples'),r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(c.value.episode===episode&&c.value.at>=after)c.delete();c.continue();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function datasetStats(){const samples=await allSamples();return {samples:samples.length,episodes:new Set(samples.map(s=>s.episode)).size,counts:labelCounts(samples),model:(await getMeta('model'))?.value?.summary||null};}
export async function clearSamples(){await transaction('samples','readwrite',s=>s.clear());await transaction('meta','readwrite',s=>s.delete('model'));return datasetStats();}
