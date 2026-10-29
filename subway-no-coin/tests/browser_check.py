"""Local Chromium regression check; does not claim full extension or live-game coverage."""
import functools
import http.server
import pathlib
import threading
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        try:
            page=browser.new_page(viewport={'width':1000,'height':800})
            page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/unity.html')
            page.evaluate("async()=>{window.probe=(await import('/extension/bridge.js')).inspectPage;}")
            state=page.evaluate('probe(true)')
            assert state['canvas'] and state['focused'],state
            assert state['crop']['left']==.25 and state['crop']['right']==.75,state
            assert state['keys']['left']['code']=='KeyA',state
            page.evaluate("localStorage.setItem('keyLeft','J')")
            assert page.evaluate('probe().keys.left.code')=='KeyJ'
            page.evaluate("ashuniRebornStatus.paused=true")
            assert page.evaluate('probe().runtime.paused') is True
            cdp=page.context.new_cdp_session(page)
            cdp.send('Input.dispatchKeyEvent',{'type':'rawKeyDown','key':'a','code':'KeyA','windowsVirtualKeyCode':65})
            page.wait_for_timeout(80)
            cdp.send('Input.dispatchKeyEvent',{'type':'keyUp','key':'a','code':'KeyA','windowsVirtualKeyCode':65})
            assert page.evaluate("sampledKeys.some(keys=>keys.includes('KeyA'))")
            print('PASS: Chromium canvas focus, automatic crop, remapped keys, pause state, and held input observed across animation frames')
        finally: browser.close()
finally: server.shutdown();server.server_close()
