"""Opt-in live test of the packaged native functions, not installed-extension coverage.

Usage: python3 tests/live_native_check.py --seconds 15 --output /tmp/live-result.json
Starts a practice run on the real target in an isolated browser profile.
"""
import argparse
import json
import os
import pathlib
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--seconds',type=int,default=15)
parser.add_argument('--output',default='/tmp/no-coin-live-result.json')
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]/'extension'
parts=[]
for name in ['legacy-profile','native-reader','native-pilot','native-planner']:
    source=(root/(name+'.js')).read_text()
    parts.append(source.replace('export const','const',1).replace('export function','function',1))
expression='()=>{'+''.join(parts)+"installLegacyReader(legacyProfile);return startNativePilot({precision:true,autoBrake:true,stopOnCoin:true},planNative);}"
with sync_playwright() as p:
    proxy=os.environ.get('HTTPS_PROXY')
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
        args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'],
        proxy={'server':proxy} if proxy else None)
    page=browser.new_page(viewport={'width':720,'height':1000})
    try:
        page.goto('https://ashuni.lol/legacy/sanfrancisco/',wait_until='domcontentloaded',timeout=60000)
        page.wait_for_function("()=>!!window.unityGame?.Module?.asm?.legacy_running",timeout=120000)
        page.evaluate(expression)
        page.keyboard.press('Space',delay=80)
        result=page.evaluate('''async seconds=>{
          const trace=[];
          for(let i=0;i<seconds;i++){
            const api=window.__noCoinPilotNative;api.ping();const s=api.status(),g=s.nativeScene;
            trace.push({second:i,status:s.message,pilotRunning:s.running,coins:g?.collected,z:g?.player.z,seen:g?.coins.length,obstacles:g?.obstacles.length});
            if(!s.running)break;
            await new Promise(resolve=>setTimeout(resolve,1000));
          }
          window.__noCoinPilotNative.stop('Live test complete');return trace;
        }''',max(1,min(120,args.seconds)))
        pathlib.Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result,indent=2))
        # Keep observed outcomes distinct: movement alone is not a full successful run.
        assert any((r.get('z') or 0)>20 for r in result),'No forward gameplay movement observed'
        assert all(not r.get('coins') for r in result),'A coin was collected during this test'
        print('PASS: movement and zero observed run coins in this bounded test. Inspect pause/death status in the trace.')
    finally:
        try:page.evaluate("window.__noCoinPilotNative?.stop('Browser closing')")
        finally:browser.close()
