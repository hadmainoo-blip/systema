import {copyFile,mkdir,access} from 'node:fs/promises';
const root=new URL('../',import.meta.url),dist=new URL('node_modules/onnxruntime-web/dist/',root),out=new URL('extension/vendor/',root);
await mkdir(out,{recursive:true});
for(const name of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await copyFile(new URL(name,dist),new URL(name,out));
await access(new URL('ONNXRUNTIME-LICENSE',out));
console.log('Packaged ONNX Runtime Web 1.22.0 (single-thread WASM).');
