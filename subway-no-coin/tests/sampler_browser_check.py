"""Check frame sampling on real blob-backed video without YouTube credentials/media."""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
fixture=root.parent/'work'/'video-fixture.webm'
assert fixture.exists(),'Run video_browser_check.py once to generate its fixture.'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def translate_path(self,path):return str(fixture) if path=='/fixture.webm' else super().translate_path(path)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        try:
            page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/unity.html')
            page.evaluate('''async()=>{
              const video=document.createElement('video');document.body.append(video);video.muted=true;
              const media=new MediaSource();video.src=URL.createObjectURL(media);
              await new Promise(resolve=>media.addEventListener('sourceopen',resolve,{once:true}));
              const bytes=await (await fetch('/fixture.webm')).arrayBuffer(),buffer=media.addSourceBuffer('video/webm; codecs="vp8"');
              await new Promise((resolve,reject)=>{buffer.addEventListener('updateend',resolve,{once:true});buffer.addEventListener('error',reject,{once:true});buffer.appendBuffer(bytes);});media.endOfStream();
              await new Promise(resolve=>{if(video.readyState>=2)resolve();else video.addEventListener('loadeddata',resolve,{once:true});});
              window.saved=[];window.originalCreate=URL.createObjectURL;URL.createObjectURL=blob=>{saved.push(blob);return originalCreate(blob);};window.alert=()=>{};
            }''')
            source=(root/'scripts/sample-youtube-frames.js').read_text().rsplit('\nsampleNoCoinVideo()',1)[0]
            page.evaluate(source)
            with page.expect_download() as download_info:
                result=page.evaluate('sampleNoCoinVideo({start:23,end:25,fps:8})')
            target=root.parent/'work'/'sample-test-frames.json';download_info.value.save_as(target)
            data=json.loads(target.read_text())
            assert result['frames']==16 and data['frames'][0]['time']==23 and data['frames'][-1]['time']<25,result
            assert all(f['image'].startswith('data:image/jpeg;base64,') for f in data['frames'])
            assert len({f['image'] for f in data['frames']})>4,'Frames must reflect actual seeking, not repeat one image'
            assert page.locator('button').count()==0
            assert page.evaluate('noCoinSamplerBusy') is False
            limited=page.evaluate('sampleNoCoinVideo({start:23,end:25,fps:8,maxBytes:30000,download:false})')
            assert limited['reason']=='size limit' and limited['bytes']<30000,limited
            print('PASS: blob-backed MediaSource → real seeks → JPEG frame download; timestamps, size cap and cleanup:',json.dumps(result))
        finally:browser.close()
finally:server.shutdown();server.server_close()
