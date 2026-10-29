"""UI smoke test with a mocked extension API; does not validate Chrome permissions."""
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
            page.add_init_script('''window.chrome=window.chrome||{};chrome.storage={local:{get:async()=>({}),set:async()=>{}}};chrome.runtime={sendMessage:async m=>m.type==='learning-stats'?{samples:0,episodes:0,counts:{hold:0,left:0,right:0,jump:0,roll:0}}:{message:'Idle',running:false,lane:1,changes:0,frames:0}};''')
            page.goto(f'http://127.0.0.1:{server.server_port}/extension/popup.html')
            page.wait_for_selector('#cooldown',state='attached');page.wait_for_timeout(700)
            assert page.locator('#backend').input_value()=='learned'
            assert page.locator('#precision').count()==0
            assert page.locator('#record').is_visible() and page.locator('#train').is_visible()
            assert 'not trained' in page.locator('#model').inner_text()
            assert not errors,errors
            print('PASS: recording/training UI, learned backend default, no precision-steering control, no page errors')
        finally:browser.close()
finally:server.shutdown();server.server_close()
