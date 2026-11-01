import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const controlFiles=['legacy-profile.js','native-reader.js','native-pilot.js','native-planner.js'];
export function currentControlHashes(){return Object.fromEntries(controlFiles.map(name=>[name,createHash('sha256').update(readFileSync(new URL('../extension/'+name,import.meta.url))).digest('hex')]));}

// Unit tests establish this gate's behavior; they are never gameplay evidence.
export function verifyGameplay(report,{minimumSeconds=1800,expectedHashes=currentControlHashes()}={}){
  const issues=[],trace=Array.isArray(report?.trace)?report.trace:[];
  if(report?.outcome!=='survived_window')issues.push('The run did not finish alive and active.');
  if(!(report?.elapsedWallSeconds>=minimumSeconds))issues.push('The observed wall duration is too short.');
  if(!(report?.engineFrameStats?.gameSeconds>=minimumSeconds))issues.push('The actual forward-gameplay duration is too short.');
  if(report?.options?.precision!==false)issues.push('The run did not use ordinary lane controls.');
  if(report?.options?.stopOnCoin!==true)issues.push('Coin-failure handling was not enabled.');
  if(report?.maxCoins!==0)issues.push('A coin was collected or the coin maximum is missing.');
  for(const name of controlFiles)if(report?.sourceFilesSha256?.[name]!==expectedHashes[name])issues.push(`Source mismatch: ${name}`);
  if(trace.length<2)issues.push('Continuous trace evidence is missing.');
  for(let i=0;i<trace.length;i++){
    const row=trace[i];
    if(row.nativeCoins!==0||row.dead||row.paused||row.pilotRunning!==true)issues.push(`Failed or unobserved run state at sample ${i}.`);
    if(Number.isFinite(row.z)&&row.running!==true)issues.push(`The game was not running at sample ${i}.`);
    if(!Number.isFinite(row.wallSeconds)||i&&(!(row.wallSeconds>trace[i-1].wallSeconds)||row.wallSeconds-trace[i-1].wallSeconds>3))issues.push(`Trace timing gap at sample ${i}.`);
  }
  const last=trace.at(-1);
  if(!last||last.running!==true||!(last.wallSeconds>=minimumSeconds)||report?.elapsedWallSeconds-last.wallSeconds>2)issues.push('The end of the requested duration was not observed.');
  return {passed:issues.length===0,minimumSeconds,renderMode:report?.renderMode||'unknown',issues:[...new Set(issues)]};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const path=process.argv[2];
  if(!path){console.error('Usage: node scripts/verify-gameplay.mjs report.json [minimum-seconds=1800]');process.exitCode=2;}
  else{
    const minimumSeconds=process.argv[3]===undefined?1800:Number(process.argv[3]);
    if(!Number.isFinite(minimumSeconds)||minimumSeconds<=0)throw new Error('Minimum duration must be positive');
    const result=verifyGameplay(JSON.parse(readFileSync(path,'utf8')),{minimumSeconds});
    console.log(JSON.stringify(result,null,2));
    if(result.passed)console.log('Native-engine evidence verified. Rendering mode is recorded above; this does not establish installed-extension end-to-end coverage.');
    else process.exitCode=1;
  }
}
