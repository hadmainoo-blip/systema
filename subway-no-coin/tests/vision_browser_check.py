"""Test the bundled pretrained encoder in real Chromium/WASM, without extension APIs."""
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
              const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;
              const ctx=canvas.getContext('2d');ctx.fillStyle='#375979';ctx.fillRect(0,0,224,224);
              ctx.fillStyle='#efbb39';ctx.beginPath();ctx.arc(70,150,12,0,Math.PI*2);ctx.fill();
              const first=await encodeCanvas(canvas),again=await encodeCanvas(canvas);
              ctx.fillStyle='#375979';ctx.fillRect(0,0,224,224);ctx.fillStyle='#efbb39';ctx.beginPath();ctx.arc(170,150,12,0,Math.PI*2);ctx.fill();
              const changed=await encodeCanvas(canvas);
              return {length:first.features.length,finite:Array.from(first.features).every(Number.isFinite),same:Array.from(first.features).every((v,i)=>Math.abs(v-again.features[i])<1e-5),change:Array.from(first.features).reduce((s,v,i)=>s+Math.abs(v-changed.features[i]),0),inferenceMs:again.ms};
            }''')
            assert result['length']==288 and result['finite'] and result['same'] and result['change']>.001,result
            print('PASS: real packaged MobileNet inference, deterministic features, spatial response:',json.dumps(result))
        finally:browser.close()
finally:server.shutdown();server.server_close()
