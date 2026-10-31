"""Exercise the actual service-worker module and IndexedDB with a mocked Chrome bridge.

Native CDP results are mocked; real native gameplay has its separate live check.
"""
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
            page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/unity.html')
            page.evaluate('''async()=>{
              const event=()=>({listeners:[],addListener(f){this.listeners.push(f);},emit(...args){for(const f of this.listeners)f(...args);}});
              window.calls=[];window.savedSettings={};window.gameTab={id:7,url:'https://ashuni.lol/legacy/sanfrancisco/'};
              window.nativeStatus={running:false,message:'Idle',backend:'native',lane:1,changes:0,frames:0};
              window.chrome={
                storage:{local:{get:async keys=>({...savedSettings}),set:async patch=>Object.assign(savedSettings,patch)}},
                action:{setBadgeText:async x=>calls.push({type:'badge',...x}),setBadgeBackgroundColor:async()=>{}},
                tabs:{query:async()=>[gameTab],onRemoved:event(),onActivated:event(),onUpdated:event()},
                commands:{onCommand:event()},
                runtime:{id:'test-extension',onInstalled:event(),onMessage:event(),sendMessage:async m=>{
                  calls.push(m);
                  if(m.to==='learner'&&m.type==='stop'&&window.deferNextLearnerStop){
                    window.deferNextLearnerStop=false;window.learnerStopDeferred=true;
                    return new Promise(resolve=>{window.releaseLearnerStop=()=>resolve({ok:true});});
                  }
                  if(m.to==='learner'||m.to==='vision')return {ok:true};return deliver(m);
                }},
                offscreen:{hasDocument:async()=>{calls.push({type:'offscreen'});return true;}},
                tabCapture:{getMediaStreamId:async()=>{calls.push({type:'capture'});return 'test-stream';}},
                debugger:{onDetach:event(),attach:async x=>calls.push({type:'attach',...x}),detach:async x=>calls.push({type:'detach',...x}),sendCommand:async(target,method,args)=>{
                  calls.push({type:method,...args});
                  if(method==='Runtime.evaluate'){
                    if(args.expression.includes('startNativePilot'))nativeStatus={...nativeStatus,running:true,message:args.expression.includes('"dry":true')?'Native observation':'Native autopilot armed'};
                    else if(args.expression.includes('stop('))nativeStatus={...nativeStatus,running:false,message:'Stopped'};
                    return {result:{value:{...nativeStatus}}};
                  }
                  return {};
                }}
              };
              window.deliver=m=>new Promise((resolve,reject)=>{const handled=chrome.runtime.onMessage.listeners[0](m,{id:'test-extension'},resolve);if(!handled)reject(new Error('Message was not handled'));});
              const store=await import('/extension/learning-store.js');await store.clearSamples();
              window.store=store;await import('/extension/worker.js');
            }''')
            # Fresh no-model startup chooses native and never requests media capture.
            fresh=page.evaluate('deliver({type:"start"})')
            assert fresh['running'] and fresh['backend']=='native',fresh
            page.wait_for_function('calls.some(c=>c.type==="attach") && nativeStatus.running')
            assert not page.evaluate('calls.some(c=>["capture","offscreen"].includes(c.type))')
            page.evaluate('deliver({type:"stop"})')
            # Installation migrates a previous untrained learned choice to the ready controller.
            page.evaluate('savedSettings.backend="learned";savedSettings.precision=false;chrome.runtime.onInstalled.emit()')
            page.wait_for_function('savedSettings.backend==="auto" && savedSettings.precision===true')
            # Even without reinstall, the shortcut resolves that stale setting safely.
            page.evaluate('savedSettings.backend="learned";calls.length=0;chrome.commands.onCommand.emit("toggle-pilot",gameTab)')
            page.wait_for_function('calls.some(c=>c.type==="attach")')
            page.wait_for_function('async()=>(await deliver({type:"status"})).running')
            assert not page.evaluate('calls.some(c=>c.type==="capture")')
            page.evaluate('chrome.commands.onCommand.emit("toggle-pilot",gameTab)')
            page.wait_for_function('async()=>!(await deliver({type:"status"})).running')
            # A second toggle must stop, not perform another attachment/restart.
            assert page.evaluate('calls.filter(c=>c.type==="attach").length')==1
            # Existing trained preferences survive update migration.
            page.evaluate('''async()=>{await store.setMeta('model',{model:{test:true},summary:{inputMode:'visual'}});savedSettings.backend='learned';savedSettings.precision=false;chrome.runtime.onInstalled.emit();}''')
            page.wait_for_function('savedSettings.precision===true')
            assert page.evaluate('savedSettings.backend')=='learned'
            # Tab switching stops a running native controller and detaches the debugger.
            page.evaluate('savedSettings.backend="auto";calls.length=0')
            page.evaluate('deliver({type:"start",backend:"auto"})')
            page.wait_for_function('calls.some(c=>c.type==="attach") && nativeStatus.running')
            page.evaluate('chrome.tabs.onActivated.emit({tabId:9})')
            page.wait_for_function('async()=>!(await deliver({type:"status"})).running')
            page.wait_for_function('calls.some(c=>c.type==="detach")')
            # Explicit observe sends dry mode through native startup; no model is needed.
            page.evaluate('calls.length=0;chrome.commands.onCommand.emit("observe-pilot",gameTab)')
            page.wait_for_function('async()=>(await deliver({type:"status"})).message.includes("observation")')
            assert page.evaluate('calls.some(c=>c.expression?.includes("\\\"dry\\\":true"))')
            page.evaluate('deliver({type:"stop"})')
            # Stop while START awaits earlier learning cleanup must invalidate
            # the worker request itself, before the native controller is called.
            page.evaluate('''()=>{
              calls.length=0;window.learnerStopDeferred=false;window.deferNextLearnerStop=true;
              window.pendingStartReply=deliver({type:'start',backend:'auto'});
            }''')
            page.wait_for_function('learnerStopDeferred')
            page.evaluate('deliver({type:"stop"})')
            cancelled=page.evaluate('''async()=>{releaseLearnerStop();return await pendingStartReply;}''')
            assert cancelled['running'] is False and 'cancelled' in cancelled['message'].lower(),cancelled
            assert not page.evaluate('calls.some(c=>c.type==="attach")'),page.evaluate('calls')
            assert page.evaluate('async()=>!(await deliver({type:"status"})).running')
            page.evaluate('gameTab.url="https://example.com/legacy/sanfrancisco/";calls.length=0')
            unsupported=page.evaluate('deliver({type:"start",backend:"auto"})')
            assert 'ashuni.lol/legacy/sanfrancisco' in unsupported.get('error',''),unsupported
            assert not page.evaluate('calls.some(c=>c.type==="attach")')
            assert not errors,errors
            print('PASS: actual worker routes fresh and stale learned settings to ready native control; shortcuts toggle; trained preference survives; tab switch stops; observe stays dry; Stop cancels START awaiting cleanup; unsupported target is rejected:',json.dumps({'fresh':fresh,'cancelled':cancelled,'unsupported':unsupported}))
        finally:browser.close()
finally:server.shutdown();server.server_close()
