import test from 'node:test';
import assert from 'node:assert/strict';
import {controlFiles,verifyGameplay} from '../scripts/verify-gameplay.mjs';
const hashes=Object.fromEntries(controlFiles.map(name=>[name,'a'.repeat(64)]));
function fixture(){return {outcome:'survived_window',elapsedWallSeconds:61,engineFrameStats:{gameSeconds:60},options:{precision:false,stopOnCoin:true},maxCoins:0,sourceFilesSha256:{...hashes},renderMode:'no-state',trace:Array.from({length:61},(_,i)=>({wallSeconds:i,nativeCoins:0,dead:false,paused:false,pilotRunning:true,running:true,z:i*110}))};}
const check=r=>verifyGameplay(r,{minimumSeconds:60,expectedHashes:hashes});
test('evidence gate accepts a matching, continuously observed completed fixture',()=>assert.equal(check(fixture()).passed,true));
test('short zero-coin runs cannot substantiate a longer target',()=>{const r=fixture();r.elapsedWallSeconds=5;r.engineFrameStats.gameSeconds=4;assert.equal(check(r).passed,false);});
test('pauses, actual native coins and deaths invalidate a claimed run',()=>{for(const patch of [{paused:true},{nativeCoins:1},{dead:true},{pilotRunning:false}]){const r=fixture();Object.assign(r.trace[30],patch);assert.equal(check(r).passed,false);}});
test('old source or missing raw counters cannot substantiate the current build',()=>{const r=fixture();r.sourceFilesSha256['native-reader.js']='old';assert.equal(check(r).passed,false);const s=fixture();delete s.trace[2].nativeCoins;assert.equal(check(s).passed,false);});
test('a blind tail or trace gap cannot hide an early stop',()=>{const r=fixture();r.trace=r.trace.filter((_,i)=>i<20||i>30);assert.equal(check(r).passed,false);const s=fixture();s.trace.pop();assert.equal(check(s).passed,false);});
