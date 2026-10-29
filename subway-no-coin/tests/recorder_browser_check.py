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
              window.scene={running:true,paused:false,dead:false,collected:0,runId:1,player:{x:0,y:0,z:0},speed:110,coins:[],obstacles:[]};
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
            assert result['stats']['counts']['left']>=1,result
            assert result['decisions']==0 and not result['errors'],result
            print('PASS: actual recorder MediaStream → encoder → labelled storage; pause/resume preserves episode; no movement:',json.dumps(result))
        finally:browser.close()
finally:server.shutdown();server.server_close()
