// Executed in the page by the debugger. Read only public game status and key settings.
export function inspectPage(focusCanvas = false) {
  const canvas = document.querySelector('#unity-canvas') || document.querySelector('canvas');
  if (focusCanvas && document.hasFocus() && canvas) canvas.focus({preventScroll:true});
  const rect = canvas?.getBoundingClientRect();
  const runtime = window.ashuniRebornStatus;
  const read = (name, fallback) => {try {return localStorage.getItem(name) || fallback;} catch {return fallback;}};
  const key = (value, fallback) => {
    if (/^[a-z]$/i.test(value)) return {key:value.toLowerCase(), code:'Key'+value.toUpperCase(), virtual:value.toUpperCase().charCodeAt(0)};
    if (value==='ArrowLeft' || value==='ArrowRight') return {key:value,code:value,virtual:value==='ArrowLeft'?37:39};
    return {key:fallback,code:'Key'+fallback.toUpperCase(),virtual:fallback.toUpperCase().charCodeAt(0)};
  };
  const crop = rect && innerWidth > 0 && innerHeight > 0 ? {left:Math.max(0,rect.left/innerWidth),top:Math.max(0,rect.top/innerHeight),right:Math.min(1,rect.right/innerWidth),bottom:Math.min(1,rect.bottom/innerHeight)} : null;
  return {focused:document.hasFocus() && !document.hidden,canvas:!!canvas,crop,
    runtime:runtime?{phase:runtime.phase,ready:!!runtime.ready,paused:!!runtime.paused}:null,
    keys:{left:key(read('keyLeft','A'),'a'),right:key(read('keyRight','D'),'d')}};
}
