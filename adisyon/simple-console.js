(()=>{'use strict';
const cfg=window.OynaBakSimpleConfig||{};
const db=window.supabase?.createClient?.(cfg.url,cfg.key,{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n)||0);
const $=s=>document.querySelector(s), isRoute=()=>location.hash==='#siparis-ekrani';
const key='oynabak-simple-device-v1';
let device=null,state=null,tab='tables',ready=false,fetching=false,alarmTimer=null,audioCtx=null,soundEnabled=false,stale=false;
let silenced=new Set(),alertKeys=[],lastRevision='',lastRender=0;
try{device=JSON.parse(localStorage.getItem(key)||'null')}catch(_){}
function save(){try{if(device)localStorage.setItem(key,JSON.stringify(device));else localStorage.removeItem(key)}catch(e){console.warn('Cihaz hafızası:',e)}}
async function rpc(name,args={}){if(!db)throw Error('Supabase bağlantısı kurulamadı');const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message||'İşlem yapılamadı');return data}
function base(html){
 if(!isRoute()||!$('#app'))return;
 $('#app').innerHTML='<main class="ob-simple"><div class="ob-simple-shell">'+html+'</div></main>';
}
function banner(){
 return '<header class="ob-simple-head"><div><small>OYNABAK · HIZLI İŞLETME EKRANI</small><h1>'+esc(state?.name||'Sipariş yönetimi')+'</h1><p>Tek ekran · Kod yok · Çalışan girişi yok</p></div><div class="ob-simple-head-actions"><button type="button" data-simple-audio class="ob-simple-secondary">'+(soundEnabled&&(window.OynaBakPOSAudio?.isApple?window.OynaBakPOSAudio.ready(audioCtx):audioCtx?.state==='running')?'🔊 Ses açık · Dene':'🔔 Sesi etkinleştir')+'</button><span class="ob-simple-connected" role="status">'+(stale||!navigator.onLine?'⚠ Bağlantı kontrol ediliyor':state?.ok?'● Bağlı':'◌ Bağlanıyor')+'</span></div></header>';
}
function notice(text){const el=$('#ob-simple-notice');if(el){el.textContent=text;el.hidden=false} else console.warn(text)}
function hexSecret(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
function uuid(){return crypto.randomUUID()}
function stopAlarm(){if(alarmTimer!==null){clearInterval(alarmTimer);alarmTimer=null}}
function beep(){
 if(window.OynaBakPOSAudio?.isApple){
  window.OynaBakPOSAudio.play(audioCtx);
  return;
 }
 if(!audioCtx||audioCtx.state!=='running')return;
 // Exactly the same shared OynaBak POS signal as the garson çağrısı.
 if(typeof window.OynaBakPlayWaiterTone==='function')window.OynaBakPlayWaiterTone(audioCtx);
 else console.warn('Ortak garson çağrısı sesi yüklenmedi.');
}
function syncAlarm(){
 if(!state?.ok){alertKeys=[];stopAlarm();return}
 const all=[
  ...(state.requests||[]).map(x=>'r:'+x.id),
  ...(state.items||[]).filter(x=>x.status==='new').map(x=>'i:'+x.id)
 ];
 const activeKeys=new Set(all);
 for(const k of silenced)if(!activeKeys.has(k))silenced.delete(k);
 alertKeys=all.filter(k=>!silenced.has(k));
 const has=alertKeys.length>0;
 if(!has){stopAlarm();return}
 const playable=window.OynaBakPOSAudio?.isApple?window.OynaBakPOSAudio.ready(audioCtx):audioCtx?.state==='running';
 if(!soundEnabled||!playable){stopAlarm();return}
 if(!alarmTimer){beep();alarmTimer=setInterval(()=>{if(soundEnabled&&isRoute())beep()},1800)}
}
function mute(){
 for(const k of alertKeys)silenced.add(k);
 alertKeys=[];stopAlarm();render();
}
async function audio(){
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio&&!window.OynaBakPOSAudio?.isApple)throw Error('Tarayıcı ses desteği bulunamadı');
  if(!audioCtx&&Audio)audioCtx=new Audio();
  if(window.OynaBakPOSAudio?.isApple){
   const status=await window.OynaBakPOSAudio.enable(audioCtx);
   soundEnabled=Boolean(status.ok);
  }else{
   await audioCtx.resume();
   soundEnabled=audioCtx.state==='running';
  }
  if(!soundEnabled)throw Error('iPhone sesine izin verilmedi. Sesi yükseltip ekrana tekrar dokunun.');
  if(alertKeys.length){stopAlarm();syncAlarm()}
  else if(!window.OynaBakPOSAudio?.isApple)beep();
  render();
  if(window.OynaBakPOSAudio?.isApple)notice('iPhone zil testi çalındı. Duymadıysanız sessiz mod ve medya sesi ayarlarını kontrol edin.');
 }catch(err){notice(err.message||String(err))}
}
function tableSummary(t){
 const rows=(state.items||[]).filter(i=>i.ticket_id===t.id&&i.status!=='void');
 return {rows,total:rows.reduce((a,i)=>a+Number(i.line_total||0),0)};
}
function tabs(){
 return '<nav class="ob-simple-tabs" aria-label="İşletme ekranları">'+
  [['orders','🔔 Siparişler'],['tables','▦ Masalar'],['kitchen','♨️ Mutfak / Bar']]
  .map(([v,title])=>'<button type="button" data-simple-tab="'+v+'" class="'+(tab===v?'selected':'')+'" aria-pressed="'+(tab===v)+'">'+title+'</button>').join('')+'</nav>';
}
function requestCard(r){
 const lines=(r.items||[]).map(i=>'<li><b>'+esc(i.quantity)+' × '+esc(i.name)+(i.variant_name?' / '+esc(i.variant_name):'')+'</b>'+(i.note?' <small>· '+esc(i.note)+'</small>':'')+'</li>').join('');
 return '<article class="ob-simple-order"><div class="ob-simple-cardhead"><strong>Masa '+esc(r.table_no)+'</strong><span>YENİ SİPARİŞ · '+new Date(r.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})+'</span></div><ul>'+lines+'</ul>'+(r.customer_note?'<p class="ob-simple-note">Not: '+esc(r.customer_note)+'</p>':'')+'<div class="ob-simple-cardbottom"><b>'+money(r.total)+'</b><div><button type="button" data-simple-reject="'+esc(r.id)+'" class="ob-simple-danger">Reddet</button><button type="button" data-simple-approve="'+esc(r.id)+'" class="ob-simple-primary">Siparişi al</button></div></div></article>';
}
function requestList(){
 const list=state.requests||[];
 return '<section><div class="ob-simple-section-title"><h2>Garson onayı bekleyen siparişler</h2><b>'+list.length+'</b></div>'+
 (list.length?'<div class="ob-simple-ordergrid">'+list.map(requestCard).join('')+'</div>':'<div class="ob-simple-empty">Yeni müşteri siparişi yok. Geldiğinde burada görünecek.</div>')+'</section>';
}
function tables(){
 const list=state.tickets||[];
 let cards=Array.from({length:Number(state.table_count)||0},(_,n)=>{
  const no=n+1,t=list.find(x=>x.table_no===no),result=t?tableSummary(t):null;
  return '<button type="button" data-simple-table="'+no+'" class="ob-simple-table '+(t?'occupied':'empty')+'"><strong>Masa '+no+'</strong><span>'+(t?result.rows.length+' ürün':'Boş masa')+'</span><b>'+(t?money(result.total):'–')+'</b></button>';
 }).join('');
 let selected=Number(window.__obSimpleSelectedTable||0);
 let t=list.find(x=>x.table_no===selected),summary=t?tableSummary(t):null;
 const menu=(state.menu?.categories||[]).filter(c=>c.active!==false).flatMap(c=>(c.items||[]).filter(i=>i.active!==false&&!i.sold_out).map(i=>({...i})));
 return '<section><div class="ob-simple-section-title"><h2>Masalar</h2></div><div class="ob-simple-tables">'+cards+'</div>'+
 (selected>0?'<div class="ob-simple-detail"><div class="ob-simple-section-title"><h3>Masa '+selected+'</h3><button class="ob-simple-secondary" type="button" data-simple-table="0">Kapat</button></div>'+
 (summary?'<div class="ob-simple-lines">'+summary.rows.map(x=>'<div><span>'+esc(x.quantity)+' × '+esc(x.name)+'</span><b>'+money(x.line_total)+'</b></div>').join('')+'</div><p class="ob-simple-total">Adisyon toplamı: '+money(summary.total)+'</p>':'<p>Bu masada açık adisyon yok.</p>')+
 '<form id="ob-simple-add-form"><h4>Masaya ürün ekle</h4><input type="hidden" name="table" value="'+selected+'"><select name="item" required><option value="">Menüden ürün seç…</option>'+menu.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+' · '+(i.price!=null?money(i.price):'Varyantlı ürün')+'</option>').join('')+'</select><select name="variant" hidden><option value="">Standart</option></select><label>Adet <input name="quantity" type="number" min="1" max="20" value="1" required></label><label>Not <input name="note" maxlength="200" placeholder="İsteğe bağlı"></label><button class="ob-simple-primary" type="submit">Masaya ekle</button></form>'+
 (t?'<button type="button" class="ob-simple-close-tab" data-simple-close="'+esc(t.id)+'">Adisyonu manuel kapat (ödeme kaydı değil)</button>':'')+'</div>':'')+'</section>';
}
function kitchen(){
 const active=new Set((state.tickets||[]).map(t=>t.id));
 const items=(state.items||[]).filter(x=>active.has(x.ticket_id)&&!['served','void'].includes(x.status));
 return '<section><div class="ob-simple-section-title"><h2>Mutfak ve bar</h2></div><div class="ob-simple-kanban">'+
 ['new','preparing','ready'].map(status=>{
  const title={new:'Yeni',preparing:'Hazırlanıyor',ready:'Hazır'}[status],x=items.filter(i=>i.status===status);
  return '<div class="ob-simple-column"><div class="ob-simple-section-title"><h3>'+title+'</h3><b>'+x.length+'</b></div>'+
  (x.length?x.map(i=>{
   const t=(state.tickets||[]).find(t=>t.id===i.ticket_id);
   const minutes=Math.max(0,Math.floor((Date.now()-new Date(i.created_at).getTime())/60000));
   const next={new:'preparing',preparing:'ready',ready:'served'}[status];
   const label={new:'Hazırlamaya başla',preparing:'Hazır',ready:'Servis edildi'}[status];
   return '<article class="ob-simple-kds-card '+(minutes>=15?'late':'')+'"><div class="ob-simple-cardhead"><strong>Masa '+esc(t?.table_no)+'</strong><small>'+minutes+' dk · '+(i.station==='bar'?'BAR':'MUTFAK')+'</small></div><h4>'+esc(i.quantity)+' × '+esc(i.name)+'</h4>'+(i.note?'<p class="ob-simple-note">'+esc(i.note)+'</p>':'')+'<button class="ob-simple-primary" type="button" data-simple-item="'+esc(i.id)+'" data-simple-next="'+next+'">'+label+'</button></article>';
  }).join(''):'<p class="ob-simple-empty">Bu aşamada sipariş yok.</p>')+'</div>';
 }).join('')+'</div></section>';
}
function render(){
 if(!isRoute()||!state?.ok)return;
 const pending=(state.requests||[]).length;
 const open=(state.tickets||[]).length;
 const newItems=(state.items||[]).filter(x=>x.status==='new').length;
 const alarm=alertKeys.length>0;
 base(banner()+
 '<div class="ob-simple-stats"><div><strong>'+pending+'</strong><span>Yeni QR sipariş</span></div><div><strong>'+newItems+'</strong><span>Hazırlanacak ürün</span></div><div><strong>'+open+'</strong><span>Açık masa</span></div></div>'+
 (alarm?'<div class="ob-simple-alarm" role="alert"><div>🔔 <strong>'+alertKeys.length+' yeni işlem bekliyor</strong><small>'+(soundEnabled&&(window.OynaBakPOSAudio?.isApple?window.OynaBakPOSAudio.ready(audioCtx):audioCtx?.state==='running')?'Alarm, susturulana kadar tekrarlanır.':'Ses henüz açık değil · Üstteki Sesi etkinleştir düğmesine dokun.')+'</small></div><button type="button" data-simple-mute>🔕 Sustur</button></div>':'')+
 tabs()+(tab==='orders'?requestList():tab==='tables'?tables():kitchen())+
 (stale||!navigator.onLine?'<div class="ob-simple-stale" role="alert">⚠ Bağlantı kesildi. Son görüntülenen veriler güncel olmayabilir. Yeni siparişleri internet döndüğünde kontrol edin.</div>':'')+
 '<p class="ob-simple-footer">Sipariş toplamları ödeme veya tahsilat kaydı değildir. Cihaz erişimini yönetici panelinden iptal edebilirsiniz.</p><div id="ob-simple-notice" role="status" hidden></div>');
}
async function firstTime(){
 if(!db)throw Error('Supabase bağlantısı açılamadı');
 const v=await rpc('ob_simple_venues');
 if(!v?.length){base('<section class="ob-simple-intro"><h1>Hızlı Sipariş Ekranı</h1><p>Şu anda etkin işletme bulunmuyor.</p></section>');return}
 base('<section class="ob-simple-intro"><small>OYNABAK · İŞLETME</small><h1>Hızlı Sipariş Ekranı</h1><p>Her açılışta personel girişi, PIN veya kod yok. Yönetici bu cihazı yalnızca ilk kullanımda onaylar.</p><label>İşletmeyi seç<select id="ob-simple-venue">'+v.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label><button class="ob-simple-primary" data-simple-request>Cihazı kullanıma aç</button><p>Onay verildiğinde bu cihaz doğrudan siparişleri göstermeye başlar.</p></section>');
}
async function enroll(){
 const v=$('#ob-simple-venue')?.value;if(!v)return;
 device={id:uuid(),token:hexSecret(),venue_id:v};save();
 try{
  await rpc('ob_simple_request',{p_venue_id:v,p_id:device.id,p_token:device.token});
  await poll();
 }catch(err){device=null;save();throw err}
}
function waiting(status){
 base('<section class="ob-simple-intro"><small>OYNABAK · CİHAZ</small><h1>'+(status.expired?'Cihaz isteğinin süresi doldu':status.revoked?'Cihaz erişimi iptal edildi':status.disabled?'İşletme ekranı kapalı':status.reset?'Cihaz yeniden onaylanmalı':'Yönetici onayı bekleniyor')+'</h1><p>'+(status.expired?'Yeni bir cihaz erişim isteği oluşturmalısın.':status.revoked||status.disabled?'Yönetici panelinden tekrar etkinleştirilmesi gerekiyor.':'Yönetici oynabak.com panelinden bu cihazın isteğini onaylayınca ekran otomatik açılacak.')+'</p><button type="button" class="ob-simple-secondary" data-simple-reset>Başka işletme / yeni cihaz</button><p>Siparişlere onaysız erişim verilmez.</p></section>');
}
async function poll(){
 if(!isRoute()||fetching)return;
 if(!device){if(!ready){ready=true;await firstTime()}return}
 fetching=true;
 try{
  const d=await rpc('ob_simple_state',{p_id:device.id,p_token:device.token});
  if(!d.ok){state=null;alertKeys=[];stopAlarm();waiting(d);return}
  const keys=[...(d.requests||[]).map(x=>'r:'+x.id),...(d.items||[]).filter(i=>i.status==='new').map(x=>'i:'+x.id)];
  const revision=JSON.stringify({
    requests:(d.requests||[]).map(x=>x.id),
    tickets:(d.tickets||[]).map(x=>[x.id,x.table_no,x.status]),
    items:(d.items||[]).map(x=>[x.id,x.status,x.quantity,x.line_total]),
    venue:d.venue_id
  });
  const changed=revision!==lastRevision||stale;
  stale=false;lastRevision=revision;
  state=d;syncAlarm();
  // Do not reset input/scroll on every network poll.
  const focused=document.activeElement;
  const editing=focused?.closest?.('#ob-simple-add-form')&&focused.tagName!=='BUTTON';
  if(!editing&&(changed||Date.now()-lastRender>30000)){
    render();lastRender=Date.now();
  }
 }catch(err){
  stale=true;
  if(!state?.ok)base('<section class="ob-simple-intro"><h1>Bağlantı sorunu</h1><p>'+esc(err.message)+'</p><button type="button" data-simple-retry>Yeniden dene</button></section>');
  else {const badge=$('.ob-simple-connected');if(badge)badge.textContent='⚠ Bağlantı kontrol ediliyor';
   notice('Bağlantı kesildi. Mevcut veriler güncel olmayabilir. Otomatik yeniden bağlanılıyor.')}
 }
 finally{fetching=false}
}
async function action(fn,args,message){
 const el=$('#ob-simple-notice');if(el){el.hidden=false;el.textContent='İşlem yapılıyor…'}
 await rpc(fn,{p_id:device.id,p_token:device.token,...args});
 if(message)notice(message);
 await poll();
}
document.addEventListener('click',async e=>{
 if(!isRoute())return;
 const b=e.target.closest('[data-simple-request],[data-simple-reset],[data-simple-retry],[data-simple-audio],[data-simple-mute],[data-simple-tab],[data-simple-table],[data-simple-approve],[data-simple-reject],[data-simple-item],[data-simple-close]');
 if(!b)return;e.preventDefault();e.stopImmediatePropagation();
 b.disabled=true;
 try{
  if(b.hasAttribute('data-simple-request'))await enroll();
  else if(b.hasAttribute('data-simple-reset')){if(!confirm('Bu cihazın mevcut onayını kaldırıp yeniden başlatmak istiyor musun?'))return;device=null;save();state=null;ready=false;lastRevision='';silenced.clear();stopAlarm();await firstTime()}
  else if(b.hasAttribute('data-simple-retry'))await poll();
  else if(b.hasAttribute('data-simple-audio'))await audio();
  else if(b.hasAttribute('data-simple-mute'))mute();
  else if(b.dataset.simpleTab){tab=b.dataset.simpleTab;render()}
  else if(b.dataset.simpleTable!==undefined){window.__obSimpleSelectedTable=Number(b.dataset.simpleTable);render()}
  else if(b.dataset.simpleApprove)await action('ob_simple_decide',{p_order_id:b.dataset.simpleApprove,p_approve:true},'Sipariş alındı; mutfak ekranına aktarıldı.');
  else if(b.dataset.simpleReject){if(confirm('Bu müşteri siparişi reddedilsin mi?'))await action('ob_simple_decide',{p_order_id:b.dataset.simpleReject,p_approve:false},'Sipariş reddedildi.')}
  else if(b.dataset.simpleItem)await action('ob_simple_item',{p_item_id:b.dataset.simpleItem,p_next:b.dataset.simpleNext},'Sipariş durumu güncellendi.');
  else if(b.dataset.simpleClose){if(confirm('Masa adisyonu kapatılsın mı? Bu ödeme kaydı oluşturmaz.')){await action('ob_simple_close',{p_ticket_id:b.dataset.simpleClose},'Adisyon kapatıldı.');window.__obSimpleSelectedTable=0;render()}}
 }catch(err){notice(err.message||String(err))}
 finally{if(b.isConnected)b.disabled=false}
},true);
document.addEventListener('change',e=>{
 if(!isRoute()||e.target.name!=='item'||e.target.closest('form')?.id!=='ob-simple-add-form')return;
 const s=e.target.closest('form').querySelector('[name=variant]');if(!s)return;
 const menu=(state?.menu?.categories||[]).flatMap(c=>c.items||[]);
 const item=menu.find(x=>String(x.id)===String(e.target.value));
 const variants=Array.isArray(item?.variants)?item.variants:[];
 s.hidden=variants.length===0;
 s.required=variants.length>0&&item?.price==null;
 s.innerHTML='<option value="">Standart'+(item?.price!=null?' · '+money(item.price):'')+'</option>'+variants.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+' · '+money(v.price)+'</option>').join('');
});
document.addEventListener('submit',async e=>{
 if(!isRoute()||e.target.id!=='ob-simple-add-form')return;
 e.preventDefault();e.stopImmediatePropagation();const f=e.target,btn=f.querySelector('[type=submit]');btn.disabled=true;
 try{
  const val=new FormData(f),qty=Number(val.get('quantity'));
  if(!Number.isInteger(qty)||qty<1||qty>20)throw Error('Adet 1–20 arasında olmalı');
  await action('ob_simple_add',{p_table:Number(val.get('table')),p_item:String(val.get('item')||''),p_variant:String(val.get('variant')||'')||null,p_qty:qty,p_note:String(val.get('note')||'')},'Ürün masaya eklendi.');
 }catch(err){notice(err.message||String(err))}
 finally{if(btn.isConnected)btn.disabled=false}
},true);
async function show(){
 if(!isRoute())return;
 ready=false;state=null;tab='tables';stale=false;lastRevision='';alertKeys=[];stopAlarm();
 if(device)await poll();else await firstTime();
}
window.addEventListener('hashchange',()=>{if(isRoute())setTimeout(show,0);else{stopAlarm();state=null}});
document.addEventListener('visibilitychange',()=>{if(isRoute()&&document.visibilityState==='visible'){
  if(soundEnabled){if(window.OynaBakPOSAudio?.isApple)window.OynaBakPOSAudio.resume(audioCtx).catch(()=>{});else if(audioCtx?.state!=='running')audioCtx?.resume().catch(()=>{})}
  poll();
 }});
document.addEventListener('pointerdown',()=>{if(isRoute()&&soundEnabled&&window.OynaBakPOSAudio?.isApple)window.OynaBakPOSAudio.unlockOnGesture(audioCtx)},{passive:true});
document.addEventListener('touchstart',()=>{if(isRoute()&&soundEnabled&&window.OynaBakPOSAudio?.isApple)window.OynaBakPOSAudio.unlockOnGesture(audioCtx)},{passive:true});
window.addEventListener('online',()=>{if(isRoute())poll()});
window.addEventListener('offline',()=>{if(!isRoute())return;stale=true;const badge=$('.ob-simple-connected');if(badge)badge.textContent='⚠ Çevrimdışı';stopAlarm()});
setInterval(()=>{if(isRoute())poll()},4000);
window.OynaBakSimpleConsole=Object.freeze({show});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(isRoute())show()},{once:true});
else if(isRoute())show();
})();