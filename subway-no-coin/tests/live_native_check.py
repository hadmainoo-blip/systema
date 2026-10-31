"""Bounded real-game validation of packaged functions; not installed-extension coverage.

python tests/live_native_check.py --seconds 60 --precision --output ../work/live-result.json
Use --precision for the shipped source-controller default; omit it to compare
ordinary lane changes/jumps/rolls. Precision uses native lateral steering.
No counter or collision modifications.
Reports survival, death, safety pause and coin collection as distinct outcomes.
"""
import argparse
import json
import os
import pathlib
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--seconds',type=int,default=45)
parser.add_argument('--output',default='../work/no-coin-live-result.json')
parser.add_argument('--no-auto-brake',action='store_true')
parser.add_argument('--width',type=int,default=360)
parser.add_argument('--height',type=int,default=640)
parser.add_argument('--precision',action='store_true',help='Compare native continuous steering; default uses ordinary lane commands')
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]/'extension'
output=pathlib.Path(args.output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
parts=[]
for name in ['legacy-profile','native-reader','native-pilot','native-planner']:
    source=(root/(name+'.js')).read_text()
    parts.append(source.replace('export const','const',1).replace('export function','function',1))
options={'precision':args.precision,'autoBrake':not args.no_auto_brake,'stopOnCoin':True}
expression='()=>{'+''.join(parts)+"""
installLegacyReader(legacyProfile);
window.__liveActions=[];
window.__liveGameFlags=()=>{const m=window.unityGame.Module,game=(m.asm.dynCall_ii||m.dynCall_ii)(legacyProfile.gameInstance,0);return {paused:!!m.HEAPU8[game+legacyProfile.gamePaused],dead:!!m.HEAPU8[game+legacyProfile.gameDead]};};
const reader=window.__noCoinPilotReader,originalAct=reader.act,originalSnapshot=reader.snapshot;
window.__liveMotion=[];window.__livePlans=[];
reader.snapshot=()=>{const s=originalSnapshot();window.__liveMotion.push({at:performance.now(),player:s.player,lane:s.lane,changing:s.changing,jumping:s.jumping,rolling:s.rolling,verticalSpeed:s.verticalSpeed,speed:s.speed,groundY:s.groundY,body:s.body});if(window.__liveMotion.length>3000)window.__liveMotion.shift();return s;};
reader.act=action=>{const before=reader.snapshot(),accepted=originalAct(action);if(accepted)window.__liveActions.push({action,at:performance.now(),player:before.player,lane:before.lane,changing:before.changing,jumping:before.jumping,rolling:before.rolling,verticalSpeed:before.verticalSpeed});return accepted;};
window.__livePlan=(scene,settings)=>{const decision=planNative(scene,settings);window.__liveLastPlan={scene,decision};window.__livePlans.push(window.__liveLastPlan);if(window.__livePlans.length>40)window.__livePlans.shift();return decision;};
window.__startLivePilot=()=>startNativePilot("""+json.dumps(options)+",window.__livePlan);return true;}"
with sync_playwright() as p:
    proxy=os.environ.get('HTTPS_PROXY')
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
        args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'],
        proxy={'server':proxy} if proxy else None)
    page=browser.new_page(viewport={'width':args.width,'height':args.height},device_scale_factor=1)
    recorded=False
    console=[];page.on('pageerror',lambda e:console.append(str(e)))
    try:
        page.goto('https://ashuni.lol/legacy/sanfrancisco/',wait_until='domcontentloaded',timeout=60000)
        page.wait_for_function("()=>window.unityGame?.Module?.calledRun===true",timeout=120000)
        page.wait_for_timeout(2500)
        page.bring_to_front()
        page.locator('canvas').first.evaluate('(c)=>c.focus()')
        for attempt in range(12):
            page.bring_to_front()
            page.locator('canvas').first.evaluate('(c)=>c.focus()')
            if page.evaluate('!!window.unityGame.Module.asm.legacy_running.value'):break
            page.keyboard.press('Space',delay=500)
            page.wait_for_timeout(1000)
        page.wait_for_function('!!window.unityGame.Module.asm.legacy_running.value',timeout=15000)
        page.evaluate(expression)
        page.evaluate('window.__startLivePilot()')
        trace=[]
        for i in range(max(3,min(120,args.seconds))):
            row=page.evaluate("""second=>{const api=window.__noCoinPilotNative;api.ping();const s=api.status(),g=s.nativeScene;return {second,status:s.message,pilotRunning:s.running,running:g?.running,...window.__liveGameFlags(),coins:g?.collected,z:g?.player.z,x:g?.player.x,lane:g?.lane,seen:g?.coins.length,obstacles:g?.obstacles.length,moves:s.changes,reason:s.reason,errors:g?.errors};}""",i)
            trace.append(row)
            if i%5==0:print(json.dumps(row),flush=True)
            if not row['pilotRunning'] or row.get('dead'):break
            page.wait_for_timeout(1000)
        actions=page.evaluate('window.__liveActions')
        final=trace[-1]
        outcome='coin_collection' if any((r.get('coins') or 0)>0 for r in trace) else 'died' if any(r.get('dead') for r in trace) else 'safety_pause' if final.get('paused') and not final['pilotRunning'] and final['status'].startswith('No safe predicted path') else 'error' if not final['pilotRunning'] else 'survived_window' if final.get('running') else 'not_running'
        motion=page.evaluate('window.__liveMotion')
        changes=[r for i,r in enumerate(motion) if i==0 or abs(r['player']['z']-motion[i-1]['player']['z'])>.001]
        moving=[r for r in changes if r['player']['z']>5]
        estimatedFps=(len(moving)-1)*1000/(moving[-1]['at']-moving[0]['at']) if len(moving)>1 else None
        result={'render':page.evaluate('()=>{const c=document.querySelector("canvas");return {width:c.width,height:c.height,dpr:devicePixelRatio}}'),'viewport':{'width':args.width,'height':args.height},'estimatedMovingFps':estimatedFps,'motion':motion,'recentPlans':page.evaluate('window.__livePlans'),'lastPlan':page.evaluate('window.__liveLastPlan'),'scene':page.evaluate('window.__noCoinPilotNative.status().nativeScene'),'options':options,'outcome':outcome,'secondsObserved':len(trace),'maxZ':max((r.get('z') or 0) for r in trace),'maxCoins':max((r.get('coins') or 0) for r in trace),'acceptedActions':actions,'trace':trace,'pageErrors':console}
        output.write_text(json.dumps(result,indent=2)+'\n');recorded=True
        page.screenshot(path=str(output.with_suffix('.png')))
        summary={k:v for k,v in result.items() if k not in ['trace','pageErrors','scene','lastPlan','motion','recentPlans','acceptedActions']}
        summary['actionCounts']={action:sum(a['action']==action for a in actions) for action in ['left','right','jump','roll']}
        summary['finalStatus']=final['status']
        print(json.dumps(summary,indent=2))
        assert result['maxZ']>20,'No forward gameplay movement observed'
        assert result['maxCoins']==0,'A coin was collected during this test'
        assert outcome in ['survived_window','safety_pause'],'Live gameplay did not remain alive or safely pause: '+outcome
        print('PASS: bounded source-controller gameplay/safety check. Outcome:',outcome,'(not an endless-run guarantee)')
    except Exception as error:
        if not recorded:
            flags=page.evaluate("()=>({calledRun:window.unityGame?.Module?.calledRun,running:window.unityGame?.Module?.asm?.legacy_running?.value,focused:document.hasFocus(),body:document.body.innerText.slice(-1000)})")
            output.write_text(json.dumps({'outcome':'startup_failed','error':str(error),'flags':flags,'pageErrors':console},indent=2)+'\n')
            page.screenshot(path=str(output.with_suffix('.png')))
        raise
    finally:
        try:page.evaluate("window.__noCoinPilotNative?.stop('Browser closing')")
        finally:browser.close()
