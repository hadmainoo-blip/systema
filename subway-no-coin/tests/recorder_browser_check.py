"""Run the real offscreen recorder using a generated MediaStream and mocked Chrome bridge."""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        try:
            page=browser.new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/unity.html')
            setup=page.evaluate('''async()=>{
              const store=await import('/extension/learning-store.js');await store.clearSamples();
              window.scene={running:true,paused:false,dead:false,collected:0,runId:1,lane:1,player:{x:0,y:0,z:0},speed:110,coins:[],obstacles:[]};
              const source=document.createElement('canvas');source.width=224;source.height=224;document.body.append(source);
              const ctx=source.getContext('2d');function draw(){ctx.fillStyle='#345c7f';ctx.fillRect(0,0,224,224);ctx.fillStyle='#efb837';ctx.fillRect(80,60,40,110);requestAnimationFrame(draw);}draw();
              Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>source.captureStream(15),configurable:true});
              window.__noCoinPilotReader={snapshot:()=>structuredClone(window.scene),stop:()=>{},act:()=>{throw new Error('Passive recorder must not move')},pause:()=>{throw new Error('Passive recorder must not pause')}};
              const {installDemonstrator}=await import('/extension/demonstrator.js');installDemonstrator();
              window.chrome=window.chrome||{};let handler;window.messages=[];
              window.deliver=m=>new Promise(resolve=>handler({...m,to:'learner'},{id:'fixture-extension'},resolve));
              chrome.runtime={id:'fixture-extension',onMessage:{addListener:f=>{handler=f;}},sendMessage:async m=>{
                if(m.type==='learning-sample')return __noCoinDemonstrator.sample();
                messages.push(m);if(m.type==='learning-stop')return deliver({type:'stop'});return {ok:true};
              }};
              await import('/extension/learner-offscreen.js');
              document.querySelector('canvas').focus();return deliver({type:'start',mode:'record',streamId:'generated-stream'});
            }''')
            assert setup.get('ok'),setup
            page.wait_for_timeout(1000)
            for key in ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']:
                page.keyboard.press(key);page.wait_for_timeout(400)
            page.evaluate('scene.running=false;scene.paused=true')
            page.wait_for_timeout(350)
            page.evaluate('scene.running=true;scene.paused=false')
            page.wait_for_timeout(500)
            page.keyboard.press('ArrowLeft');page.wait_for_timeout(650)
            result=page.evaluate('''async()=>{await deliver({type:'stop'});const {datasetStats,clearSamples}=await import('/extension/learning-store.js');const s=await datasetStats();const decisions=messages.filter(m=>m.type==='learning-decision');await clearSamples();__noCoinDemonstrator.stop();return {stats:s,decisions:decisions.length,errors:messages.filter(m=>m.type==='learning-stop')};}''')
            assert result['stats']['samples']>5,result
            assert result['stats']['episodes']==1,result
            assert all(result['stats']['counts'][a]>=1 for a in ['hold','left','right','jump','roll']),result
            assert result['decisions']==0 and not result['errors'],result
            print('PASS: actual recorder MediaStream → encoder → labelled storage; pause/resume preserves episode; no movement:',json.dumps(result))
            # Document/canvas handlers can consume keys. Window capture still sees them.
            page.evaluate('''async()=>{const {installDemonstrator}=await import('/extension/demonstrator.js');installDemonstrator();window.consume=e=>e.stopImmediatePropagation();document.addEventListener('keydown',consume,true);}''')
            page.keyboard.press('ArrowUp')
            assert page.evaluate('__noCoinDemonstrator.sample().events')[0]['action']=='jump'
            page.evaluate('document.removeEventListener("keydown",consume,true);__noCoinDemonstrator.sample()')
            page.wait_for_timeout(750)
            # No key events: movements made by the game (e.g. touch/remapped controls) still label.
            for patch,action in [({'lane':0},'left'),({'lane':1},'right'),({'jumping':True},'jump'),({'rolling':True},'roll')]:
                page.evaluate('(patch)=>Object.assign(scene,patch)',patch)
                events=page.evaluate('__noCoinDemonstrator.sample().events')
                assert any(e['action']==action and e['source']=='state' for e in events),(action,events)
                page.wait_for_timeout(750)
            page.evaluate('__noCoinDemonstrator.stop()')
            print('PASS: keys consumed at document still captured; native lane/jump/roll transitions label without keyboard events')
            page.evaluate('''async()=>{const {installDemonstrator}=await import('/extension/demonstrator.js');scene.lane=2;scene.jumping=false;scene.rolling=false;installDemonstrator();__noCoinDemonstrator.sample();}''')
            # Two native left moves in quick succession must not be lost to deduplication.
            repeated=page.evaluate('''()=>{scene.lane=1;const a=__noCoinDemonstrator.sample().events;scene.lane=0;return a.concat(__noCoinDemonstrator.sample().events);}''')
            assert [e['action'] for e in repeated]==['left','left'],repeated
            page.keyboard.press('ArrowUp')
            paired=page.evaluate('scene.jumping=true;__noCoinDemonstrator.sample().events')
            assert len(paired)==1 and paired[0]['source']=='keyboard',paired
            later=page.evaluate('scene.jumping=false;__noCoinDemonstrator.sample();scene.jumping=true;__noCoinDemonstrator.sample().events')
            assert len(later)==1 and later[0]['action']=='jump' and later[0]['source']=='state',later
            page.evaluate('__noCoinDemonstrator.stop()')
            print('PASS: fast repeated native moves retained; a keyboard press deduplicates only its own native transition')
            page.evaluate('''async()=>{
              const {installDemonstrator}=await import('/extension/demonstrator.js');installDemonstrator();
              window.captureRequested=false;
              Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
                window.lateCapture=document.querySelectorAll('canvas')[1].captureStream(15);captureRequested=true;
                await new Promise(resolve=>{window.releaseCapture=resolve;});return lateCapture;
              }});
              window.lateStart=deliver({type:'start',mode:'record',streamId:'late-stream'});
            }''')
            page.wait_for_function('captureRequested')
            cancelled=page.evaluate('''async()=>{await deliver({type:'stop'});releaseCapture();const result=await lateStart;return {result,ended:lateCapture.getTracks().every(t=>t.readyState==='ended')};}''')
            assert cancelled['result'].get('error') and cancelled['ended'],cancelled
            page.evaluate('''async()=>{
              await (await import('/extension/learning-store.js')).clearSamples();
              Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>document.querySelectorAll('canvas')[1].captureStream(15)});
              window.originalSend=chrome.runtime.sendMessage;window.sampleHeld=false;
              chrome.runtime.sendMessage=async m=>{if(m.type==='learning-sample'&&!sampleHeld){sampleHeld=true;await new Promise(resolve=>{window.releaseSample=resolve;});}return originalSend(m);};
              return deliver({type:'start',mode:'record',streamId:'first-stream'});
            }''')
            page.wait_for_function('sampleHeld')
            page.evaluate('''async()=>{await deliver({type:'stop'});return deliver({type:'start',mode:'record',streamId:'replacement-stream'});}''')
            # New tick fires while the previous generation is still awaiting a sample.
            page.wait_for_timeout(550);page.evaluate('releaseSample()');page.wait_for_timeout(1800)
            resumed=page.evaluate('''async()=>{await deliver({type:'stop'});return (await import('/extension/learning-store.js')).datasetStats();}''')
            assert resumed['samples']>1,resumed
            page.evaluate('__noCoinDemonstrator.stop()')
            print('PASS: Stop cancels a late capture and releases its tracks; restarting during an in-flight tick resumes recording:',json.dumps(resumed))
        finally:browser.close()
finally:server.shutdown();server.server_close()
