(() => {
  function bedrockName(img){
    const name=(img.getAttribute('alt')||'').trim();
    return name.startsWith('.') ? name : '';
  }
  function apply(img){
    const name=bedrockName(img);
    if(!name || img.dataset.bedrockSkinApplied==='1') return;
    img.dataset.bedrockSkinApplied='1';
    const enc=encodeURIComponent(name);
    const isBody=!!img.closest('.body-render');
    const url=isBody
      ? `https://api.creepernation.net/body/${enc}?size=180&prefix=.`
      : `https://api.creepernation.net/head/${enc}?size=128&prefix=.`;
    img.src=url;
  }
  function scan(root=document){
    root.querySelectorAll?.('img[alt^="."]').forEach(apply);
  }
  scan();
  new MutationObserver(muts=>{
    for(const m of muts){
      for(const n of m.addedNodes){
        if(n.nodeType!==1) continue;
        if(n.matches?.('img[alt^="."]')) apply(n);
        scan(n);
      }
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
})();
