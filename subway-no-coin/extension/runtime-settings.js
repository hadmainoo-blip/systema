// The built-in controller is ready without any recorded demonstrations.
export function selectBackend(requested,hasModel=false){
  if(requested==='vision')return 'vision';
  if(requested==='learned'&&hasModel)return 'learned';
  return 'auto';
}
// Earlier releases enabled predictive pauses by default. Migrate that default
// once, while retaining a deliberate choice made with the current control.
export function autoBrakeEnabled(saved={}){return saved.brakingPolicy===2&&saved.autoBrake===true;}
export function isSupportedGame(url){
  try{const u=new URL(url);return u.protocol==='https:'&&['ashuni.lol','www.ashuni.lol'].includes(u.hostname)&&u.pathname.replace(/\/$/,'')==='/legacy/sanfrancisco';}catch{return false;}
}
