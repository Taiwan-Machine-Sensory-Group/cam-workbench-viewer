'use strict';
(async()=>{
  const status=document.getElementById('status');
  const messages={
    local:'這是發佈用的本機檔案，無法直接開啟分享專案。請執行資料夾中的 Open_Shared_CAM_Workbench.cmd，或貼上完整的 HTTPS 分享網址。 / This local publishing file cannot open shared projects. Use Open_Shared_CAM_Workbench.cmd or paste the complete HTTPS share link. / Đây là tệp xuất bản cục bộ. Hãy dùng Open_Shared_CAM_Workbench.cmd hoặc dán liên kết chia sẻ HTTPS đầy đủ.',
    missing:'分享網址不完整：缺少 #key= 後的解鎖碼。請貼上擁有者提供的完整分享網址。 / The share link is incomplete: the #key= value is missing or truncated. Paste the complete link from the owner. / Liên kết chưa đầy đủ: thiếu hoặc cắt ngắn mã sau #key=. Hãy dán liên kết đầy đủ từ chủ sở hữu.',
    browser:'瀏覽器無法啟動分享檢視器。請用最新版 Chrome、Edge 或 Safari 開啟 HTTPS 分享網址，並允許此網站儲存資料。 / This browser cannot start the viewer. Open the HTTPS link in an updated browser and allow site storage. / Trình duyệt không thể mở trình xem. Hãy mở liên kết HTTPS bằng trình duyệt mới và cho phép lưu trữ trang web.',
    connection:'分享資料載入失敗或逾時。請確認網路連線後重試。 / Shared data could not load or timed out. Check your connection and retry. / Không tải được dữ liệu hoặc đã hết thời gian chờ. Hãy kiểm tra kết nối và thử lại.',
    key:'這個連結無法解鎖目前的分享資料。請向擁有者取得最新的完整連結。 / This link cannot unlock the current shared data. Ask the owner for the latest complete link. / Liên kết này không mở được dữ liệu hiện tại. Hãy xin chủ sở hữu liên kết đầy đủ mới nhất.',
    invalid:'請貼上這個 CAM Workbench 網站的完整 HTTPS 分享網址，包含 #key=。 / Paste the complete HTTPS share link for this CAM Workbench site, including #key=. / Hãy dán liên kết chia sẻ HTTPS đầy đủ của trang CAM Workbench này, bao gồm #key=.'
  };
  const fail=reason=>{status.textContent=messages[reason]||messages.connection;document.getElementById('recovery').hidden=false;};
  const keyPattern=/^[A-Za-z0-9_-]{43}$/;
  document.getElementById('retry').addEventListener('click',()=>location.reload());
  document.getElementById('link-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{
      const link=new URL(document.getElementById('share-link').value.trim());
      const base=location.protocol==='file:'?new URL('https://taiwan-machine-sensory-group.github.io/cam-workbench-viewer/'):new URL('./',location.href);
      if(link.protocol!=='https:'||link.origin!==base.origin||![base.pathname,base.pathname+'index.html'].includes(link.pathname)||link.username||link.password||!keyPattern.test(new URLSearchParams(link.hash.slice(1)).get('key')||''))throw new Error();
      if(link.origin===location.origin&&link.pathname===location.pathname&&link.search===location.search){location.hash=link.hash;location.reload();}
      else location.replace(link.href);
    }catch{fail('invalid');}
  });
  // A publishing template opened from disk is not a failed decryption attempt.
  if(location.protocol==='file:'){fail('local');return;}
  const key=new URLSearchParams(location.hash.slice(1)).get('key');
  if(!key||!keyPattern.test(key)){fail('missing');return;}
  if(!window.isSecureContext||!navigator.serviceWorker||!crypto.subtle||typeof DecompressionStream==='undefined'){fail('browser');return;}
  let stage='browser';
  try{
    await navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'});
    const deadline=promise=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('connection')),20000);
      promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
    await deadline(navigator.serviceWorker.ready);
    if(!navigator.serviceWorker.controller)await deadline(new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})));
    stage='connection';
    const session=Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
    const unlock=()=>new Promise((resolve,reject)=>{
      const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(new Error('connection'));},20000);
      channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data?.ok?resolve():reject(new Error(e.data?.reason==='connection'?'connection':'key'));};
      navigator.serviceWorker.controller.postMessage({type:'unlock',key,session},[channel.port2]);
    });
    await unlock();
    // Workers may be stopped by the browser. Re-establish only this page's session on request.
    navigator.serviceWorker.addEventListener('message',async e=>{if(e.data?.type==='session-needed')try{await unlock();e.ports[0]?.postMessage({ok:true});}catch{e.ports[0]?.postMessage({ok:false});}});
    const target=new URL('app/index.html',location.href);target.searchParams.set('s',session);
    const requested=new URLSearchParams(location.search).get('project');if(requested)target.searchParams.set('project',requested);
    document.getElementById('viewer').src=target.href;
    document.getElementById('viewer').hidden=false;document.getElementById('gate').hidden=true;
  }catch(error){fail(['connection','key'].includes(error.message)?error.message:stage);}
})();
