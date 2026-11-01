export const ACTIONS=['hold','left','right','jump','roll'];
export const FEATURE_VERSION='mobilenet-v3-spatial-v1';

export function actionForKey(key,bindings={}) {
  const k=String(key).toLowerCase();
  const map={arrowleft:'left',arrowright:'right',arrowup:'jump',arrowdown:'roll',a:'left',d:'right',w:'jump',s:'roll'};
  for(const [action,bound] of Object.entries(bindings))if(String(bound).toLowerCase()===k)return action;
  return map[k]||null;
}

// Pool pretrained feature maps by road region, retaining lane and depth structure.
export function poolVision(data,dims) {
  const [batch,channels,height,width]=dims;
  if(batch!==1||data.length!==channels*height*width)throw new Error('Unexpected vision feature shape');
  const rows=3,cols=3,buckets=32,out=new Float32Array(rows*cols*buckets),counts=new Uint16Array(rows*cols*buckets);
  for(let c=0;c<channels;c++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const region=Math.min(rows-1,Math.floor(y*rows/height))*cols+Math.min(cols-1,Math.floor(x*cols/width));
    const bucket=(c*2654435761>>>0)%buckets,index=region*buckets+bucket;
    const value=data[(c*height+y)*width+x];
    out[index]+=Math.tanh(value/6)*(c%2?-1:1);counts[index]++;
  }
  for(let i=0;i<out.length;i++)out[i]/=Math.max(1,counts[i]);
  return out;
}

export function stateFeatures(scene) {
  const out=new Float32Array(64);
  if(!scene?.player)return out;
  const speed=Math.max(20,scene.speed||110);
  for(const [kind,offset] of [['coins',0],['obstacles',24]])for(const v of scene[kind]||[]){
    const t=(v.z-scene.player.z)/speed;if(t<-.1||t>2.4)continue;
    const lane=Math.max(0,Math.min(2,Math.round(v.x/20)+1)),bin=Math.max(0,Math.min(7,Math.floor(t/.3)));
    out[offset+lane*8+bin]=1;
  }
  out[48]=Math.max(-1,Math.min(1,scene.player.x/20));out[49]=Math.min(1,scene.player.y/40);out[50]=Math.min(1,speed/300);
  out[51]=scene.jumping?1:0;out[52]=scene.rolling?1:0;out[53]=scene.changing?1:0;
  return out;
}

export function combineFeatures(vision,previous,scene) {
  if(previous&&previous.length!==vision.length)throw new Error('Mismatched vision features');
  const state=stateFeatures(scene),out=new Float32Array(vision.length*2+state.length);
  out.set(vision);for(let i=0;i<vision.length;i++)out[vision.length+i]=vision[i]-(previous?.[i]??vision[i]);out.set(state,vision.length*2);return out;
}

export function prepareTrainingSamples(samples){
  const inputMode=samples.some(s=>s.source?.kind==='video')?'visual':'hybrid';
  return {inputMode,samples:inputMode==='hybrid'?samples:samples.map(s=>{const features=Float32Array.from(s.features);features.fill(0,features.length-64);return {...s,features};})};
}

export const ACTION_LOOKBACK_MS=1000;
export function assignEvents(pending,events) {
  for(const event of events){
    if(!ACTIONS.includes(event.action)||event.action==='hold')continue;
    let candidate=null;
    for(const frame of pending)if(frame.at<=event.at&&event.at-frame.at<=ACTION_LOOKBACK_MS&&(!candidate||frame.at>candidate.at))candidate=frame;
    if(candidate){if(candidate.label&&candidate.label!==event.action)candidate.conflict=true;else candidate.label=event.action;}
  }
}

// Separate complete episodes to avoid reporting frame-neighbour leakage as validation.
export function splitEpisodes(samples,seed=19) {
  const episodes=[...new Set(samples.map(s=>s.episode))];
  if(episodes.length<2)throw new Error('Record at least two separate runs before training');
  let x=seed>>>0;const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
  for(let i=episodes.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[episodes[i],episodes[j]]=[episodes[j],episodes[i]];}
  const validation=new Set(episodes.slice(0,Math.max(1,Math.round(episodes.length*.25))));
  return {train:samples.filter(s=>!validation.has(s.episode)),validation:samples.filter(s=>validation.has(s.episode)),validationEpisodes:[...validation]};
}

export function labelCounts(samples){const counts=Object.fromEntries(ACTIONS.map(a=>[a,0]));for(const s of samples)if(s.label in counts)counts[s.label]++;return counts;}

function rng(seed){let x=seed>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
export function createPolicy(inputs,hidden=24,seed=71){
  const random=rng(seed),w1=new Float32Array(inputs*hidden),w2=new Float32Array(hidden*ACTIONS.length);
  for(let i=0;i<w1.length;i++)w1[i]=(random()*2-1)*Math.sqrt(6/inputs);
  for(let i=0;i<w2.length;i++)w2[i]=(random()*2-1)*Math.sqrt(6/hidden);
  return {version:FEATURE_VERSION,inputs,hidden,w1,b1:new Float32Array(hidden),w2,b2:new Float32Array(ACTIONS.length)};
}
export function forward(model,input){
  if(input.length!==model.inputs)throw new Error('Model and captured features are incompatible');
  const x=new Float32Array(input.length);for(let i=0;i<input.length;i++)x[i]=model.mean?Math.max(-5,Math.min(5,(input[i]-model.mean[i])/model.std[i])):input[i];
  const h=new Float32Array(model.hidden),p=new Float32Array(ACTIONS.length);
  for(let j=0;j<h.length;j++){let sum=model.b1[j];for(let i=0;i<input.length;i++)sum+=x[i]*model.w1[j*model.inputs+i];h[j]=Math.max(0,sum);}
  for(let k=0;k<p.length;k++){let sum=model.b2[k];for(let j=0;j<h.length;j++)sum+=h[j]*model.w2[k*model.hidden+j];p[k]=sum;}
  const max=Math.max(...p);let total=0;for(let k=0;k<p.length;k++){p[k]=Math.exp(p[k]-max);total+=p[k];}for(let k=0;k<p.length;k++)p[k]/=total;
  return {h,p,x};
}
export function predict(model,input){const {p}=forward(model,input),rank=Array.from(p,(_,i)=>i).sort((a,b)=>p[b]-p[a]);return {action:ACTIONS[rank[0]],confidence:p[rank[0]],margin:p[rank[0]]-p[rank[1]],probabilities:Array.from(p)};}
export function metrics(model,samples){
  const matrix=Array.from({length:5},()=>Array(5).fill(0));
  for(const s of samples){const a=ACTIONS.indexOf(s.label),b=ACTIONS.indexOf(predict(model,s.features).action);if(a>=0)matrix[a][b]++;}
  let f1=0,n=0,correct=0,total=0;
  const perClass=ACTIONS.map((action,i)=>{const support=matrix[i].reduce((a,b)=>a+b,0),tp=matrix[i][i],fp=matrix.reduce((sum,row)=>sum+row[i],0)-tp,fn=support-tp;const score=2*tp/Math.max(1,2*tp+fp+fn);if(support){f1+=score;n++;}correct+=tp;total+=support;return {action,support,f1:score,recall:tp/Math.max(1,support)};});
  return {macroF1:f1/Math.max(1,n),accuracy:correct/Math.max(1,total),samples:total,perClass,matrix};
}
export async function trainPolicy(training,validation,{epochs=24,rate=.012,hidden=24,onProgress=()=>{},isCancelled=()=>false,seed=41}={}){
  if(!training.length||!validation.length)throw new Error('Training and validation runs must both contain frames');
  const groups=ACTIONS.map(a=>training.filter(s=>s.label===a));
  if(groups.some(g=>g.length<3))throw new Error('Training runs need at least three examples of every action: hold, left, right, jump and roll');
  const inputs=training[0].features.length,model=createPolicy(inputs,hidden),random=rng(seed);
  model.mean=new Float32Array(inputs);model.std=new Float32Array(inputs);
  for(let i=0;i<inputs;i++){let sum=0,sq=0;for(const s of training){const v=s.features[i];sum+=v;sq+=v*v;}const mean=sum/training.length;model.mean[i]=mean;model.std[i]=Math.max(.005,Math.sqrt(Math.max(0,sq/training.length-mean*mean)));}
  if(ACTIONS.some(a=>!validation.some(s=>s.label===a)))throw new Error('The held-out run needs at least one example of every action; record more varied runs');
  const perClass=Math.min(240,Math.max(...groups.map(g=>g.length))),steps=perClass*5;
  let best=null,bestScore=-1,stale=0;
  for(let epoch=0;epoch<epochs;epoch++){
    let loss=0;const lr=rate*(1-epoch/(epochs*1.5));
    for(let step=0;step<steps;step++){
      const label=step%5,group=groups[label],s=group[Math.floor(random()*group.length)],{h,p,x}=forward(model,s.features);
      loss-=Math.log(Math.max(1e-8,p[label]));p[label]-=1;
      const dh=new Float32Array(model.hidden);
      for(let j=0;j<dh.length;j++){let sum=0;for(let k=0;k<5;k++)sum+=model.w2[k*model.hidden+j]*p[k];dh[j]=h[j]>0?Math.max(-3,Math.min(3,sum)):0;}
      for(let k=0;k<5;k++){for(let j=0;j<model.hidden;j++)model.w2[k*model.hidden+j]-=lr*p[k]*h[j];model.b2[k]-=lr*p[k];}
      for(let j=0;j<model.hidden;j++){if(!dh[j])continue;for(let i=0;i<inputs;i++)model.w1[j*inputs+i]-=lr*(dh[j]*x[i]+.0001*model.w1[j*inputs+i]);model.b1[j]-=lr*dh[j];}
      if(step%48===0){if(isCancelled())throw new Error('Training cancelled');await new Promise(r=>setTimeout(r,0));}
    }
    const score=metrics(model,validation);
    onProgress({epoch:epoch+1,epochs,loss:loss/steps,validation:score});
    if(score.macroF1>bestScore+.001){bestScore=score.macroF1;best=serializePolicy(model);stale=0;}else stale++;
    if(stale>=6)break;
  }
  const result=deserializePolicy(best);return {model:result,validation:metrics(result,validation),trainingCounts:labelCounts(training)};
}
export function serializePolicy(m){return {...m,w1:Array.from(m.w1),b1:Array.from(m.b1),w2:Array.from(m.w2),b2:Array.from(m.b2),mean:m.mean?Array.from(m.mean):undefined,std:m.std?Array.from(m.std):undefined};}
export function deserializePolicy(m){if(!m||m.version!==FEATURE_VERSION)throw new Error('Unsupported learned model');const r={...m};for(const k of ['w1','b1','w2','b2'])r[k]=Float32Array.from(m[k]);if(m.mean){r.mean=Float32Array.from(m.mean);r.std=Float32Array.from(m.std);if(r.mean.length!==r.inputs||r.std.length!==r.inputs||r.std.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Invalid feature normalization');}if(r.w1.length!==r.inputs*r.hidden||r.w2.length!==r.hidden*5||r.b1.length!==r.hidden||r.b2.length!==5)throw new Error('Invalid learned weights');return r;}
