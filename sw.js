'use strict';
// Only ciphertext is published. Keys stay in the link fragment and browser memory.
const sessions=new Map(),clientSessions=new Map(),pending=new Map();
const base=new URL('./',self.location.href),encoder=new TextEncoder();
const deny=()=>new Response('CAM Workbench: a complete private link is required.',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function decrypt(url,key,aad){
  let r;try{r=await fetch(url,{cache:'no-store'});}catch{throw new Error('connection');}
  if(!r.ok)throw new Error('connection');
  let bytes;try{bytes=new Uint8Array(await r.arrayBuffer());}catch{throw new Error('connection');}
  if(bytes.length<29)throw new Error('Truncated encrypted file');
  return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:encoder.encode(aad)},key,bytes.slice(12));
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
  if(e.data?.type!=='unlock'||!e.ports[0])return;
  e.waitUntil((async()=>{
    try{
      const source=new URL(e.source.url);
      if(source.origin!==base.origin||!source.pathname.startsWith(base.pathname)||!/^[a-f0-9]{48}$/.test(e.data.session))throw new Error('Invalid source');
      const raw=decode(e.data.key);if(raw.length!==32)throw new Error('Invalid key');
      const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
      const manifest=JSON.parse(new TextDecoder().decode(await decrypt(new URL('manifest.bin',base),key,'cam-workbench-manifest-v1')));
      if(manifest.schema!==1||!manifest.files)throw new Error('Invalid manifest');
      sessions.set(e.data.session,{key,manifest,owner:e.source.id});clientSessions.set(e.source.id,e.data.session);
      e.ports[0].postMessage({ok:true});
    }catch(error){e.ports[0].postMessage({ok:false,reason:error.message==='connection'?'connection':'key'});}
  })());
});
async function recover(clientId,session){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const c of clients){
    const u=new URL(c.url);if(u.origin!==base.origin||!(u.pathname===base.pathname||u.pathname===base.pathname+'index.html'))continue;
    await new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(resolve,3500);channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();resolve();};c.postMessage({type:'session-needed'},[channel.port2]);});
    if(sessions.has(session)){clientSessions.set(clientId,session);return;}
  }
}
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url),prefix=base.pathname+'app/';
  if(url.origin!==base.origin||!url.pathname.startsWith(prefix))return;
  e.respondWith((async()=>{
    if(e.request.method!=='GET'&&e.request.method!=='HEAD')return new Response('Analyze and import projects in the desktop application.',{status:405});
    let session=clientSessions.get(e.clientId)||url.searchParams.get('s');
    // Recover association from a known client's URL after a worker restart.
    if(!session&&e.clientId){const c=await self.clients.get(e.clientId);if(c)session=new URL(c.url).searchParams.get('s');}
    if(session&&!sessions.has(session))await recover(e.clientId,session);
    const state=sessions.get(session);if(!state)return deny();
    if(e.resultingClientId)clientSessions.set(e.resultingClientId,session);
    if(e.clientId)clientSessions.set(e.clientId,session);
    let path;try{path=decodeURIComponent(url.pathname.slice(prefix.length));}catch{return deny();}
    if(path.includes('..')||path.includes('\\')||path.includes('\0'))return deny();
    if(!path||path.endsWith('/'))path+='index.html';
    const file=state.manifest.files[path];if(!file)return new Response('Not found',{status:404});
    const id=session+':'+file.blob;
    try{
      if(!pending.has(id))pending.set(id,(async()=>{
        const clear=await decrypt(new URL('data/'+file.blob+'.bin',base),state.key,path);
        return file.gzip?await new Response(new Blob([clear]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():clear;
      })());
      const bytes=await pending.get(id);
      const headers={'Content-Type':file.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
      if(file.type.startsWith('text/html'))headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
      return new Response(e.request.method==='HEAD'?null:bytes,{headers});
    }catch{return deny();}finally{pending.delete(id);}
  })());
});
