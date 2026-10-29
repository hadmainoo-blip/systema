"""Exercise real pretrained features, local storage, training and trusted key capture."""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def end_headers(self):
        self.send_header("Content-Security-Policy", "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'")
        super().end_headers()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        try:
            page=browser.new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/unity.html')
            result=page.evaluate('''async()=>{
              const {encodeCanvas}=await import('/extension/vision-encoder.js');
              const core=await import('/extension/learning-core.js');
              const store=await import('/extension/learning-store.js');
              const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;const ctx=canvas.getContext('2d');
              await store.clearSamples();
              for(let episode=0;episode<2;episode++)for(let action=0;action<5;action++)for(let n=0;n<4;n++){
                ctx.fillStyle='#32475e';ctx.fillRect(0,0,224,224);
                ctx.fillStyle=['#e8c03e','#e7546a','#73dc92','#f1a1ee','#479be5'][action];
                ctx.fillRect(10+action*40+n,40+episode*2,24,140);
                const visual=await encodeCanvas(canvas),features=core.combineFeatures(visual.features,null,null);
                await store.addSample({episode:'run-'+episode,at:Date.now()+n,features,label:core.ACTIONS[action]});
              }
              const samples=await store.allSamples(),split=core.splitEpisodes(samples);
              const result=await core.trainPolicy(split.train,split.validation,{epochs:32,hidden:24,rate:.045});
              await store.setMeta('model',{model:core.serializePolicy(result.model),summary:{validation:result.validation}});
              const restored=core.deserializePolicy((await store.getMeta('model')).value.model);
              const metrics=core.metrics(restored,split.validation),stats=await store.datasetStats();
              await store.removeTail('run-0',0);const after=await store.datasetStats();
              await store.clearSamples();
              return {metrics,storedSamples:stats.samples,episodes:stats.episodes,afterTailTrim:after.samples};
            }''')
            assert result['storedSamples']==40 and result['episodes']==2 and result['afterTailTrim']==20,result
            assert result['metrics']['macroF1']>.6,result
            page.evaluate('''async()=>{
              const {installDemonstrator}=await import('/extension/demonstrator.js');
              window.__noCoinPilotReader={snapshot:()=>({running:true,coins:[],obstacles:[]}),stop:()=>{},act:()=>{throw new Error('Recording must not act')},pause:()=>{throw new Error('Recording must not pause')}};
              installDemonstrator();document.querySelector('canvas').focus();
            }''')
            page.keyboard.press('ArrowLeft')
            events=page.evaluate('__noCoinDemonstrator.sample().events')
            assert len(events)==1 and events[0]['action']=='left',events
            page.evaluate("const input=document.createElement('input');document.body.append(input);input.focus()")
            page.keyboard.press('a')
            assert page.evaluate('__noCoinDemonstrator.sample().events')==[]
            page.evaluate('__noCoinDemonstrator.stop()')
            print('PASS: actual ONNX features → IndexedDB → train → reload → held-out synthetic image classification; trusted game-key capture excludes text inputs:',json.dumps(result))
        finally:browser.close()
finally:server.shutdown();server.server_close()
