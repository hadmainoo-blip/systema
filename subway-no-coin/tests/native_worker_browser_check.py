"""Actual search Worker + pilot lifecycle with a mock native reader.

This verifies asynchronous control, not gameplay or extension installation.
"""
import functools,http.server,pathlib,threading
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
            page.bring_to_front();page.locator('canvas').first.evaluate('(c)=>c.focus()')
            page.evaluate('''async()=>{
              window.startPilot=(await import('/extension/native-pilot.js')).startNativePilot;
              window.realPlanner=(await import('/extension/native-planner.js')).planNative;
              const NativeWorker=Worker;window.posted=0;
              window.Worker=class extends NativeWorker{postMessage(value){window.posted++;return super.postMessage(value);}};
              window.setup=()=>{
                window.__noCoinPilotNative?.stop();window.posted=0;window.moves=[];window.pauses=0;window.readerStops=0;
                window.scene={running:true,paused:false,dead:false,runId:1,collected:0,lane:1,targetLane:1,changing:false,player:{x:0,y:.8,z:0},body:{x:0,y:6.3,z:1,hx:3,hy:5,hz:3,shape:'CapsuleCollider'},groundY:.8,verticalSpeed:0,speed:110,engineStep:1/60,gravity:200,jumpHeight:20,coins:[],obstacles:[],samples:1,errors:0,at:performance.now()};
                window.__noCoinPilotReader={snapshot:()=>structuredClone(window.scene),pause:()=>window.pauses++,stop:()=>window.readerStops++,act:action=>{window.moves.push(action);if(action==='left'||action==='right'){window.scene.changing=true;window.scene.targetLane=action==='left'?0:2;}return true;}};
              };
              window.slowPlanner=state=>{const until=performance.now()+180;while(performance.now()<until){}return {action:state.runId===1?'left':'right',targetX:state.runId===1?-20:20,risk:0,nextActionIn:0};};
            }''')
            # Execute the actual pure planner inside the actual Worker.
            page.evaluate('''()=>{setup();scene.coins=[{x:0,y:6,z:80,hx:4.5,hy:4.5,hz:4.5,shape:'SphereCollider'}];startPilot({hud:false},realPlanner);}''')
            page.wait_for_function('moves.length>0',timeout=5000)
            assert page.evaluate("__noCoinPilotNative.status().planning==='worker'")
            assert page.evaluate("moves.every(a=>['left','right'].includes(a))")
            page.evaluate('__noCoinPilotNative.stop()')
            print('PASS: production planner runs in a real Worker and issues an ordinary lane move')

            # Stop while the Worker is computing: no late result may move.
            page.evaluate('''()=>{setup();startPilot({hud:false},slowPlanner);window.mainTicks=0;window.tickTimer=setInterval(()=>mainTicks++,10);}''')
            page.wait_for_function('posted>0')
            page.evaluate('__noCoinPilotNative.stop()');page.wait_for_timeout(300)
            assert page.evaluate('moves.length===0&&pauses===1&&readerStops===1')
            assert page.evaluate('mainTicks>10'),'Main-thread timers did not remain responsive'
            page.evaluate('clearInterval(tickTimer)')
            print('PASS: Stop during search prevents late movement; game-thread timers remain responsive')

            # A previous run's answer cannot steer a new run.
            page.evaluate('''()=>{setup();startPilot({hud:false},slowPlanner);}''')
            page.wait_for_function('posted>0');page.evaluate('scene.runId=2')
            page.wait_for_function('moves.length>0',timeout=5000)
            assert page.evaluate("moves.every(a=>a==='right')"),page.evaluate('moves')
            page.evaluate('__noCoinPilotNative.stop()')
            print('PASS: an outstanding answer from the previous run is discarded')

            # Worker setup/execution errors have a synchronous fallback.
            page.evaluate('''()=>{setup();startPilot({hud:false},()=>({action:'jump',targetX:0,risk:0}),()=>{throw new Error('Worker fixture failure');});}''')
            page.wait_for_function('moves.length>0',timeout=5000)
            assert page.evaluate("__noCoinPilotNative.status().planning==='main'&&moves[0]==='jump'")
            page.evaluate('__noCoinPilotNative.stop()')
            assert not errors,errors
            print('PASS: a failed Worker falls back to the supplied planner without a leaked page error')
        finally:browser.close()
finally:server.shutdown();server.server_close()
