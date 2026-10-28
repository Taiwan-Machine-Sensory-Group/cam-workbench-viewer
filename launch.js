'use strict';
(async()=>{
  const status=document.getElementById('status');
  const fail=()=>{status.textContent='無法解鎖：請使用完整專用網址，或向擁有者取得最新連結。 / Unable to unlock. Ask the owner for the complete current link. / Không thể mở khóa. Hãy xin liên kết đầy đủ mới nhất.';};
  const key=new URLSearchParams(location.hash.slice(1)).get('key');
  if(!key||!/^[A-Za-z0-9_-]{43}$/.test(key)){fail();return;}
  try{
    if(!window.isSecureContext||!navigator.serviceWorker)throw new Error('Secure browser required');
    await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    const session=Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
    const unlock=()=>new Promise((resolve,reject)=>{
      const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('Unlock timed out')),20000);
      channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data.ok?resolve():reject(new Error('Invalid link'));};
      navigator.serviceWorker.controller.postMessage({type:'unlock',key,session},[channel.port2]);
    });
    await unlock();
    // Workers may be stopped by the browser. Re-establish only this page's session on request.
    navigator.serviceWorker.addEventListener('message',async e=>{if(e.data?.type==='session-needed')try{await unlock();e.ports[0]?.postMessage({ok:true});}catch{e.ports[0]?.postMessage({ok:false});}});
    const target=new URL('app/index.html',location.href);target.searchParams.set('s',session);
    const requested=new URLSearchParams(location.search).get('project');if(requested)target.searchParams.set('project',requested);
    document.getElementById('viewer').src=target.href;
    document.getElementById('viewer').hidden=false;document.getElementById('gate').hidden=true;
  }catch{fail();}
})();
