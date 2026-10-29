import * as ort from './vendor/ort.wasm.min.mjs';
import {poolVision} from './learning-core.js';
let sessionPromise;
export function loadEncoder(){
  if(!sessionPromise){
    ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
    ort.env.wasm.wasmPaths=new URL('./vendor/',import.meta.url).href;
    sessionPromise=ort.InferenceSession.create(new URL('./models/vision.onnx',import.meta.url).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'}).catch(e=>{sessionPromise=null;throw e;});
  }
  return sessionPromise;
}
export async function encodeCanvas(canvas){
  if(canvas.width!==224||canvas.height!==224)throw new Error('Encoder requires a 224×224 canvas');
  const session=await loadEncoder(),pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,224,224).data;
  const input=new Float32Array(3*224*224),mean=[.485,.456,.406],std=[.229,.224,.225];
  let brightness=0;
  for(let i=0;i<224*224;i++)for(let c=0;c<3;c++){const v=pixels[i*4+c]/255;input[c*224*224+i]=(v-mean[c])/std[c];brightness+=v;}
  if(brightness/(224*224*3)<.015)throw new Error('Captured game frame is black');
  const started=performance.now(),result=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',input,[1,3,224,224])}),tensor=result[session.outputNames[0]];
  return {features:poolVision(tensor.data,tensor.dims),ms:performance.now()-started};
}
