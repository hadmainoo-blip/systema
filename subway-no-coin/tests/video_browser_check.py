"""Exercise the video UI with real seeking, ONNX extraction and IndexedDB import.

Uses generated footage, not the remote speedrun. Does not claim gameplay quality.
"""
import functools,http.server,json,pathlib,subprocess,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
fixture=root.parent/'work'/'video-fixture.webm';fixture.parent.mkdir(exist_ok=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=10','-t','26','-c:v','libvpx','-b:v','200k',str(fixture)],check=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def translate_path(self,path):
        return str(fixture) if path=='/fixture-video.webm' else super().translate_path(path)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        try:
            page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.add_init_script('''window.chrome=window.chrome||{};chrome.runtime={sendMessage:async m=>m.type==='status'?{running:false,training:false,message:'Idle'}:{ok:true}};''')
            page.goto(f'http://127.0.0.1:{server.server_port}/extension/video-training.html')
            page.evaluate('''async()=>{const store=await import('/extension/learning-store.js');await store.clearSamples();}''')
            page.locator('#file').set_input_files(str(fixture))
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Loaded')")
            assert abs(page.locator('#video').evaluate('v=>v.currentTime')-23)<.01
            assert page.locator('#endTime').input_value()=='26'
            # Empty import must fail, preserving an empty dataset.
            page.locator('#import').click()
            page.wait_for_function("document.querySelector('#status').textContent.includes('Label some actions first')")
            for i,action in enumerate(['hold','left','right','jump','roll']):
                page.locator('#seekTime').fill(str(23.2+i*.5));page.locator('#seek').click()
                page.wait_for_function('(t)=>Math.abs(document.querySelector("#video").currentTime-t)<.01',arg=23.2+i*.5)
                page.locator(f'[data-action="{action}"]').click()
            assert page.locator('#annotations li').count()==5
            page.locator('#import').click()
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Saved 5')",timeout=60000)
            result=page.evaluate('''async()=>{const store=await import('/extension/learning-store.js');const samples=await store.allSamples();return {stats:await store.datasetStats(),samples:samples.map(s=>({at:s.at,episode:s.episode,label:s.label,source:s.source,features:s.features.length,stateZero:s.features.slice(-64).every(v=>v===0),finite:s.features.every(Number.isFinite)}))};}''')
            assert result['stats']['samples']==5 and result['stats']['episodes']==1,result
            assert all(n==1 for n in result['stats']['counts'].values()),result
            assert all(s['at']>=23000 and s['stateZero'] and s['finite'] and s['features']==640 for s in result['samples']),result
            assert all(s['episode']=='video:ywoxj7nm' for s in result['samples']),result
            page.locator('#import').click()
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Saved 5')",timeout=60000)
            assert page.evaluate('async()=>(await (await import("/extension/learning-store.js")).datasetStats()).samples')==5
            # Conflicting replacement of one label replaces rather than duplicates that timestamp.
            page.locator('#seekTime').fill('23.2');page.locator('#seek').click()
            page.wait_for_function('Math.abs(document.querySelector("#video").currentTime-23.2)<.01')
            page.locator('[data-action="left"]').click();page.locator('#import').click();page.locator('#cancel').click()
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Import cancelled')",timeout=60000)
            old_counts=page.evaluate('async()=>(await (await import("/extension/learning-store.js")).datasetStats()).counts')
            assert old_counts['hold']==1 and old_counts['left']==1,old_counts
            page.locator('#import').click()
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Saved 5')",timeout=60000)
            counts=page.evaluate('async()=>(await (await import("/extension/learning-store.js")).datasetStats()).counts')
            assert counts['hold']==0 and counts['left']==2,counts
            assert not errors,errors
            print('PASS: video seeks to 00:23; explicit labels → real ONNX features → local data; unlabelled import rejected; deduplicated re-import:',json.dumps(result['stats']))
        finally:browser.close()
finally:server.shutdown();server.server_close()
