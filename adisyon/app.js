(()=>{'use strict';
const $=(q,r=document)=>r.querySelector(q);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n||0));
const when=d=>new Date(d).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const bridge=()=>window.OynaBakAdisyonBridge;
const current=()=>bridge()?.context();
let state=null,poll=null,mounting=false,seenRequestIds=null,audioCtx=null,signalChannel=null,seenItemStages=null,alarmTimer=null,audioEnabled=false,refreshRunning=false,alarmAcknowledged=new Set(),floorDrag=null;
async function rpc(fn,args){const db=current()?.db;if(!db)throw Error('Veritabanı bağlantısı bulunamadı.');const {data,error}=await db.rpc(fn,args);if(error)throw Error(error.message||'Sunucu işlemi başarısız.');return data}
function notice(msg,error=false){let n=$('#ob-adisyon-message');if(!n){n=document.createElement('div');n.id='ob-adisyon-message';document.body.appendChild(n)}n.textContent=msg;n.className=error?'error':'';clearTimeout(n._timer);n._timer=setTimeout(()=>n.remove(),4500)}
const venue=id=>(current()?.adminData?.venues||[]).find(v=>String(v.id)===String(id));
async function mount(){
 if(location.hash!=='#panel')return;
 if(mounting)return;const me=current()?.me;if(!me)return;
 mounting=true;
 try{
  if(me.role==='admin'){
   document.querySelectorAll('.card [data-action="venue-edit"]').forEach(el=>{
    const box=el.closest('.card'),id=el.dataset.id;
    if(!box||!id||box.dataset.obAdisyonChecked)return;
    box.dataset.obAdisyonChecked='1';
    rpc('ob_adisyon_status',{p_venue_id:String(id)}).then(status=>{
      if(!box.isConnected||!status?.allowed)return;
      const line=document.createElement('div');line.className='ob-adm-actions';
      line.innerHTML=(status.enabled?'<button class="btn small light" type="button" data-ob-open="'+esc(id)+'">📋 Sipariş Merkezi</button>':'')
        +'<button class="btn small light" type="button" data-ob-toggle="'+esc(id)+'">⚙️ '+(status.enabled?'Adisyonu kapat':'Adisyon paketini aç')+'</button>'
;
      box.appendChild(line);
    }).catch(()=>{});
   });
  }else if(me.role==='merchant'){
    const box=$('.merchant-control-grid'),id=me.venue?.id;
    if(box&&id&&!box.dataset.obBlocked&&!box.querySelector('[data-ob-open]')){
      const b=document.createElement('button');b.type='button';b.className='merchant-control-card';b.dataset.obOpen=String(id);
      b.innerHTML='<span>07</span><b>🛎️ Sipariş Merkezi</b><small>Tek hesap · Siparişler, mutfak, masalar ve garson çağrıları</small>';box.appendChild(b);
      rpc('ob_adisyon_status',{p_venue_id:String(id)}).then(s=>{if(b.isConnected&&!s?.enabled){box.dataset.obBlocked='1';b.remove()}}).catch(()=>{box.dataset.obBlocked='1';b.remove()});
    }
  }
 }finally{mounting=false}
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;mount().catch(console.warn)})}
function setup(){const app=$('#app');if(app){new MutationObserver(schedule).observe(app,{childList:true,subtree:true});schedule()}}
function close(){
 stopAlarm();alarmAcknowledged.clear();audioEnabled=false;floorDrag=null;
 seenRequestIds=null;seenItemStages=null;refreshRunning=false;clearInterval(poll);poll=null;
 if(signalChannel){try{current()?.db?.removeChannel(signalChannel)}catch(e){console.warn('Realtime kapatma:',e)}signalChannel=null}
 state=null;$('#ob-adisyon')?.remove();document.body.style.overflow='';
}
function root(){return $('#ob-adisyon')}
function body(){return $('#ob-adisyon-body')}
async function open(id){
 const ctx=current(),me=ctx?.me;
 if(!me)throw Error('Panel oturumu gerekli.');
 const v=me.role==='admin'?venue(id):(me.role==='merchant'&&String(me.venue?.id)===String(id))?me.venue:null;
 if(!v||String(v.id)!==String(id))throw Error('Bu işletme için mevcut OynaBak hesabınızın yetkisi yok.');
 close();
 const el=document.createElement('section');el.id='ob-adisyon';el.setAttribute('aria-label','OynaBak Sipariş Merkezi');
 el.innerHTML='<div class="ob-shell"><div class="ob-head"><div><div class="ob-muted">OYNABAK · TEK İŞLETME HESABI</div><h2>'+esc(v.name)+'</h2><div class="ob-muted">Sipariş · Mutfak / Bar · Masalar · Tek OynaBak girişi · Ödeme yok</div></div><div class="ob-row"><button class="ob-btn" type="button" data-ob-enable-alerts aria-pressed="false">🔔 Bildirim sesini aç</button><button class="ob-btn" data-ob-close>✕ Panele dön</button></div></div><div id="ob-adisyon-body">Yükleniyor…</div></div>';
 document.body.appendChild(el);document.body.style.overflow='hidden';
 try{
  const s=await rpc('ob_adisyon_status',{p_venue_id:String(id)});
  if(!s?.allowed)throw Error('Bu işletmeye adisyon erişimi kapalı.');
  if(!s.enabled){body().innerHTML='<div class="ob-card"><h3>Adisyon etkin değil</h3><p>OynaBak yönetim panelinden bu işletmeye adisyonu açın.</p></div>';return}
  // The existing OynaBak business account opens the same workspace on every device.
  // Each browser remembers its own selected screen, not an extra employee identity.
  const staffRole=me.role;
  const savedScreen=(()=>{try{return localStorage.getItem('ob-ops-screen-'+id)}catch{return null}})();
  const defaultTab=['requests','kitchen','tables','reports'].includes(savedScreen)?savedScreen:'requests';
  const savedStation=(()=>{try{return localStorage.getItem('ob-ops-station-'+id)}catch{return null}})();
  state={vid:String(id),count:Number(s.table_count)||1,tab:defaultTab,table:0,filter:'',tickets:[],items:[],requests:[],calls:[],products:[],busy:false,permission:{},staffRole,kitchenFilter:['all','kitchen','bar'].includes(savedStation)?savedStation:'all',realtime:false,canManage:Boolean(s.can_manage),floorEditing:false,floorSaved:[],floorDraft:[],floorVersion:0,floorAvailable:true};
  const actions=['add','review','close','move','split','reports','status'];
  const allowed=await Promise.all(actions.map(action=>rpc('ob_adisyon_permission',{p_venue_id:String(id),p_action:action,p_station:action==='status'&&staffRole==='bar'?'bar':action==='status'?'kitchen':null})));
  if(!state||state.vid!==String(id))return;
  actions.forEach((action,i)=>{state.permission[action]=Boolean(allowed[i])});
  try{
   const saved=await rpc('ob_adisyon_floor_get',{p_venue_id:String(id)});
   if(!state||state.vid!==String(id))return;
   state.floorSaved=Array.isArray(saved?.positions)?saved.positions:[];
   state.floorVersion=Number(saved?.version)||0;
  }catch(err){state.floorAvailable=false;console.warn('Masa planı yüklenemedi:',err)}
  state.floorDraft=normalizeFloor(state.floorSaved,state.count);
  const menu=await bridge().menu(id);
  state.products=(menu?.categories||[]).filter(c=>c.active).flatMap(c=>(c.items||[]).filter(i=>i.active&&!i.sold_out).map(i=>({...i,category:c.name,categoryStation:c.station||'auto'})));
  try{const alarmOpt=localStorage.getItem('ob-ops-alarm-'+id)==='1';
   if(alarmOpt){audioEnabled=true;audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();audioCtx.resume().catch(()=>{})}
  }catch(_){}
  updateAlarmButton();
  await refresh();
  subscribeSignals(String(id));
  poll=setInterval(()=>refresh(true).catch(()=>{}),15000);
 }catch(e){if(body())body().innerHTML='<div class="ob-card"><h3>Adisyon açılamadı</h3><p>'+esc(e.message)+'</p><p class="ob-muted">Veritabanı kurulumu veya işletme yetkisini kontrol edin. Mevcut QR menü değişmedi.</p></div>'}
}
function subscribeSignals(vid){
 const db=current()?.db;if(!db?.channel)return;
 try{
  signalChannel=db.channel('oynabak-adisyon-signal-'+vid+'-'+Math.random().toString(36).slice(2))
    .on('postgres_changes',{event:'*',schema:'public',table:'ob_adisyon_signals',filter:'venue_id=eq.'+vid},
     ()=>{if(state?.vid===vid)refresh(true).catch(err=>console.warn('Anlık sipariş:',err))})
    .subscribe(status=>{if(state?.vid===vid){state.realtime=status==='SUBSCRIBED';const n=$('#ob-live-status');if(n)n.textContent=state.realtime?'● Canlı bağlı':'◌ Yedek güncelleme açık'}});
 }catch(err){console.warn('Realtime yok, yedek sorgu devam ediyor:',err)}
}
async function toggle(id){
 if(current()?.me?.role!=='admin'||!venue(id))throw Error('Yönetici yetkisi gerekli.');
 const s=await rpc('ob_adisyon_status',{p_venue_id:id});
 if(!s?.can_manage)throw Error('Bu işletmede yetki bulunamadı.');
 const defaultCount=Math.max(1,Math.min(200,Number(s.table_count)||Number(venue(id).tables)||1));
 let count=defaultCount;
 if(!s.enabled){
   const response=prompt(venue(id).name+' için adisyon masası sayısı (1–200):',String(defaultCount));
   if(response===null)return;
   if(!/^[0-9]+$/.test(response.trim()))throw Error('Masa sayısı tam sayı olmalıdır.');
   count=Number(response.trim());
   if(count<1||count>200)throw Error('Masa sayısı 1–200 arasında olmalıdır.');
 }
 if(!confirm(venue(id).name+' için adisyon '+(s.enabled?'kapatılsın':'('+count+' masa olarak açılsın')+'?'))return;
 const next=await rpc('ob_adisyon_set_enabled',{p_venue_id:id,p_enabled:!s.enabled,p_table_count:count});
 notice(next?.enabled?'Adisyon açıldı.':'Adisyon kapatıldı.');
}
const active=n=>state.tickets.find(t=>t.status==='open'&&Number(t.table_no)===Number(n));
const items=id=>state.items.filter(i=>i.ticket_id===id);
const total=id=>items(id).filter(i=>i.status!=='void').reduce((n,i)=>n+Number(i.line_total||0),0);
const tab=(key,label)=>'<button class="ob-btn '+(state.tab===key?'active':'')+'" data-ob-tab="'+key+'" aria-pressed="'+(state.tab===key?'true':'false')+'">'+label+'</button>';

function defaultFloor(count){
 const cols=Math.min(5,count),rows=Math.ceil(count/cols),arr=[];
 for(let i=0;i<count;i++){
  const col=i%cols,row=Math.floor(i/cols);
  arr.push({table:i+1,x:cols===1?45:Math.round(4+92*col/(cols-1)),
   y:rows===1?38:Math.round(6+88*row/(rows-1))});
 }
 return arr;
}
function normalizeFloor(stored,count){
 const defaults=defaultFloor(count),saved=Array.isArray(stored)?stored:[];
 return defaults.map(item=>{
  const p=saved.find(x=>Number(x.table)===item.table);
  return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?
   {table:item.table,x:Math.max(0,Math.min(100,Number(p.x))),
    y:Math.max(0,Math.min(100,Number(p.y)))}:item;
 });
}
function floorSet(table,x,y){
 const pos=state?.floorDraft?.find(x=>x.table===table);if(!pos)return;
 pos.x=Math.round(Math.max(0,Math.min(100,x))*10)/10;
 pos.y=Math.round(Math.max(0,Math.min(100,y))*10)/10;
}
function floorStyle(position){
 return 'left:calc((100% - var(--ob-floor-table-size))*'+(position.x/100)+');'+
 'top:calc((100% - var(--ob-floor-table-size))*'+(position.y/100)+')';
}
function floorBoard(){
 const positions=state.floorDraft.length===state.count?state.floorDraft:normalizeFloor(state.floorSaved,state.count);
 const count=state.count,rows=Math.ceil(count/5),height=Math.max(425,rows*115+85);
 let html='<section class="ob-floor"><header class="ob-floor-header"><div><h3>İşletme masa düzeni</h3><p class="ob-muted">'+(state.floorEditing?'Masalara dokunup sürükleyin. Kaydetmeden çıkarsanız düzen değişmez.':'Masaların yerleşimi bu işletmeye özeldir. Masaya basarak adisyonu açın.')+'</p></div><div class="ob-floor-actions">';
 if(state.canManage&&state.floorAvailable){
   html+=state.floorEditing?'<button type="button" class="ob-btn" data-ob-floor-auto>Otomatik diz</button><button type="button" class="ob-btn" data-ob-floor-cancel>Vazgeç</button><button type="button" class="ob-btn primary" data-ob-floor-confirm>✓ Kaydet ve onayla</button>':
    '<button type="button" class="ob-btn primary" data-ob-floor-edit>✥ Masaları düzenle</button>';
 }else if(!state.floorAvailable)html+='<span class="ob-muted">Plan düzeni yüklenemedi; yeniden açıp deneyin.</span>';
 html+='</div></header>';
 html+='<div class="ob-floor-scroll"><div class="ob-floor-canvas '+(state.floorEditing?'is-editing':'')+'" data-ob-floor-canvas style="height:'+height+'px">';
 html+='<div class="ob-floor-entrance">🚪 GİRİŞ</div>';
 for(const pos of positions){
  const t=active(pos.table),c=t?'open':'';
  html+='<button type="button" class="ob-floor-table '+c+(state.floorEditing?' is-draggable':'')+
   '" style="'+floorStyle(pos)+'"'+(state.floorEditing?' data-ob-floor-drag="'+pos.table+'"':
   ' data-ob-table="'+pos.table+'"')+
   ' aria-label="Masa '+pos.table+(state.floorEditing?' sürükleyerek yerini değiştir':' adisyonunu aç')+'">'+
   '<b>Masa '+pos.table+'</b><small>'+(t?money(total(t.id)):'Boş')+'</small></button>';
 }
 html+='</div></div>'+(state.floorEditing?'<p class="ob-muted">Telefon ve tablette sürükleyin. Klavyede ok tuşlarıyla da ince ayar yapabilirsiniz.</p>':'')+'</section>';
 return html;
}
async function saveFloor(){
 if(!state?.floorEditing||!state.canManage||!state.floorAvailable)return;
 if(!confirm(state.count+' masanın bu yeni yerleşimini işletme için kaydedip onaylıyor musunuz?'))return;
 const currentState=state;
 const positions=state.floorDraft.map(p=>({table:p.table,x:p.x,y:p.y}));
 const result=await rpc('ob_adisyon_floor_save',{p_venue_id:state.vid,p_positions:positions,
  p_expected_version:state.floorVersion});
 if(state!==currentState)return;
 state.floorSaved=positions.map(p=>({...p}));state.floorDraft=positions.map(p=>({...p}));
 state.floorVersion=Number(result.version);state.floorEditing=false;
 notice('Masa planı kaydedildi. Tüm cihazlarda aynı düzen kullanılacak.');
 render();
}

function stopAlarm(){if(alarmTimer){clearInterval(alarmTimer);alarmTimer=null}}
function audibleBeep(){
 if(!audioEnabled||!audioCtx||audioCtx.state!=='running')return;
 if(typeof window.OynaBakPlayWaiterTone==='function'){
  window.OynaBakPlayWaiterTone(audioCtx); // EXACT same POS sound as Garson Çağırma
 }
}
function updateAlarmButton(){
 if(!root())return;
 root().querySelectorAll('[data-ob-enable-alerts],[data-ob-floor-edit],[data-ob-floor-cancel],[data-ob-floor-auto],[data-ob-floor-confirm]').forEach(btn=>{
  btn.textContent=audioEnabled?'🔊 Alarm açık · Sesi dene':'🔔 Bildirim sesini aç';
  btn.setAttribute('aria-pressed',audioEnabled?'true':'false');
 });
}
async function enableAlarm(){
 const AC=window.AudioContext||window.webkitAudioContext;
 if(!AC)throw Error('Bu tarayıcı sesli bildirimleri desteklemiyor');
 if(!audioCtx)audioCtx=new AC();
 // AudioContext.resume MUST be initiated from this genuine user interaction.
 await audioCtx.resume();
 if(audioCtx.state!=='running')throw Error('Tarayıcı sesi engelliyor. Ekrana dokunup yeniden deneyin');
 audioEnabled=true;
 try{localStorage.setItem('ob-ops-alarm-'+state.vid,'1')}catch(_){}
 updateAlarmButton();
 stopAlarm();
 syncAlarm();
 if(!state.alarmCount)audibleBeep(); // audible test even without a new order
 notice('Garson çağırmadaki POS alarmı açıldı. Yeni bildirimler susturulana kadar tekrar edecek.');
}
function unlockAlarmFromGesture(){
 if(!state||!audioEnabled||!audioCtx||audioCtx.state==='running')return;
 audioCtx.resume().then(()=>{if(state?.alarmCount)syncAlarm()}).catch(()=>{});
}
document.addEventListener('pointerdown',unlockAlarmFromGesture,{passive:true});
document.addEventListener('keydown',unlockAlarmFromGesture);
function activeAlarmKeys(){
 if(!state)return[];
 const role=state.staffRole,keys=[];
 if(state.permission.review){
  (state.requests||[]).forEach(r=>keys.push('qr:'+r.id));
  (state.calls||[]).forEach(c=>keys.push('waiter:'+c.id));
  (state.items||[]).filter(i=>i.status==='ready').forEach(i=>keys.push('ready:'+i.id));
 }
 if(['kitchen','bar','admin','manager','merchant'].includes(role)){
  (state.items||[]).filter(i=>i.status==='new'&&
   (!['kitchen','bar'].includes(role)||i.station===role)).forEach(i=>keys.push('new:'+i.id));
 }
 return keys;
}
function syncAlarm(){
 if(!state){stopAlarm();return}
 const keys=activeAlarmKeys(),active=new Set(keys);
 for(const key of alarmAcknowledged)if(!active.has(key))alarmAcknowledged.delete(key);
 state.alarmCount=keys.filter(k=>!alarmAcknowledged.has(k)).length;
 if(!state.alarmCount){stopAlarm();return}
 if(!alarmTimer){audibleBeep();alarmTimer=setInterval(audibleBeep,1800)}
}
function muteAlarm(){activeAlarmKeys().forEach(k=>alarmAcknowledged.add(k));stopAlarm();syncAlarm();render()}

function render(){
 if(!state||!body())return;
 const opened=state.tickets.filter(t=>t.status==='open'),pending=state.items.filter(i=>i.status==='new'&&opened.some(t=>t.id===i.ticket_id));
 const stationOnly=state.staffRole==='kitchen'||state.staffRole==='bar';
 const kitchenItems=state.items.filter(i=>opened.some(t=>t.id===i.ticket_id)&&!['void','served'].includes(i.status));
 let html='<div class="ob-workspace-title"><div><small>'+esc('OYNABAK · TEK İŞLETME GİRİŞİ')+' ÇALIŞMA EKRANI</small><h3>'+esc('Sipariş, mutfak ve masa yönetimi')+'</h3></div><span class="ob-live-label" id="ob-live-status">'+(state.realtime?'● Canlı bağlı':'◌ Yedek güncelleme açık')+'</span></div>';
 if(stationOnly){
 html+='<div class="ob-stats"><div class="ob-card"><span class="ob-muted">Bekleyen ürün</span><strong class="metric">'+kitchenItems.filter(i=>i.station===state.staffRole&&i.status==='new').length+'</strong></div><div class="ob-card"><span class="ob-muted">Hazırlanıyor</span><strong class="metric">'+kitchenItems.filter(i=>i.station===state.staffRole&&i.status==='preparing').length+'</strong></div></div>';
 }else{
 html+='<div class="ob-stats"><div class="ob-card"><span class="ob-muted">Açık masa</span><strong class="metric">'+opened.length+'</strong></div><div class="ob-card"><span class="ob-muted">QR onayı bekleyen</span><strong class="metric">'+state.requests.length+'</strong></div><div class="ob-card"><span class="ob-muted">Adisyon toplamı (tahsilat değil)</span><strong class="metric">'+money(opened.reduce((v,t)=>v+total(t.id),0))+'</strong></div></div>';
 }
 if((state.alarmCount||0)>0)html+='<div class="ob-loop-alarm" role="alert"><div>🔔 <b>'+state.alarmCount+' yeni işlem bekliyor</b><small>Alarm susturulana kadar tekrar eder.</small></div><button type="button" class="ob-btn" data-ob-alarm-mute>🔕 Sustur</button></div>';
 html+='<div class="ob-tabs">'+(state.permission.review?tab('requests','🛎️ Siparişler ('+(state.requests.length+state.calls.length)+')'):'')+tab('kitchen','♨️ Mutfak / Bar')+(!stationOnly?tab('tables','▦ Masalar'):'')+(state.permission.reports?tab('reports','▤ Raporlar'):'')+'</div>';
 if(state.tab==='tables'){
   if(!state.table){
     html+=floorBoard();
   }else{
     const t=active(state.table),list=t?items(t.id):[];
     const products=state.products.map((p,i)=>({...p,index:i})).filter(p=>(p.name+' '+p.category).toLocaleLowerCase('tr-TR').includes(state.filter.toLocaleLowerCase('tr-TR')));
     html+='<button class="ob-btn" data-ob-back>← Masalar</button><div class="ob-cols"><section class="ob-card"><h3>Masa '+state.table+' · Menü</h3><label class="ob-field">Ürün ara<input id="ob-adisyon-search" placeholder="Menüde ara" value="'+esc(state.filter)+'"></label><div class="ob-products">';
     html+=state.permission.add&&products.length?products.map(p=>'<button class="ob-btn" data-ob-product="'+p.index+'"><b>'+esc(p.name)+'</b><div class="ob-muted">'+esc(p.category)+' · '+money(p.price)+'</div></button>').join(''):'<div class="ob-empty">Aktif menü ürünü yok.</div>';
     html+='</div></section><section class="ob-card"><h3>Masa '+state.table+' · Adisyon</h3>';
     html+=list.length?list.map(i=>'<div class="ob-entry"><div><b>'+i.quantity+' × '+esc(i.name)+'</b><div class="ob-muted">'+esc(i.station==='bar'?'Bar':'Mutfak')+' · '+esc(i.status)+' · '+esc(i.note||'')+'</div></div><div><b>'+money(i.line_total)+'</b>'+(i.status==='void'||!state.permission.review?'':'<br><button class="ob-btn danger" data-ob-void="'+esc(i.id)+'">İptal</button>')+'</div></div>').join(''):'<div class="ob-empty">Bu masada açık sipariş yok.</div>';
     html+='<div class="ob-total">Toplam: '+money(t?total(t.id):0)+'</div><p class="ob-muted">Bu bir hesap toplamıdır, tahsilat kaydı değildir.</p>';
     if(t&&state.permission.close)html+='<button class="ob-btn primary" data-ob-close-ticket="'+esc(t.id)+'">Adisyonu manuel kapat</button>';
     html+='</section></div>';
   }
 }else if(state.tab==='tools'){
 html+='<div class="ob-card"><h3>İşletme araçları</h3><div class="ob-row"><button class="ob-btn" data-ob-enable-alerts>🔔 Sipariş bildirimlerini aç</button>'+(state.permission.move?'<button class="ob-btn" data-ob-tool="move">Masa taşı</button>':'')+(state.permission.split?'<button class="ob-btn" data-ob-tool="split">Hesabı bölüştür</button>':'')+(state.permission.reports?'<button class="ob-btn" data-ob-tool="stats">Raporlar</button>':'')+'</div><div id="ob-extra-results"></div></div>';
 }else if(state.tab==='requests'){
   html+='<div class="ob-card"><h3>Garson çağrıları ('+state.calls.length+')</h3>'+(state.calls.length?state.calls.map(c=>'<div class="ob-entry"><div><b>Masa '+esc(c.table_no)+'</b><div class="ob-muted">'+esc(({waiter:'Garson çağırma',bill:'Hesap isteği',water:'Su isteği',napkin:'Peçete isteği'}[c.request_type]||c.request_type))+' · '+when(c.created_at)+'</div></div><button class="ob-btn primary" data-ob-waiter-done="'+esc(c.id)+'">Tamamlandı</button></div>').join(''):'<div class="ob-empty">Bekleyen garson çağrısı yok.</div>')+'</div>';
   html+='<div class="ob-card"><h3>Garson onayı bekleyen QR siparişleri ('+state.requests.length+')</h3><p class="ob-muted">Müşterilerin gönderdiği siparişler onaylanmadan mutfağa düşmez.</p>';
   html+=state.requests.length?state.requests.map(r=>'<div class="ob-entry"><div><b>Masa '+esc(r.table_no)+' · '+money(r.total)+'</b><div class="ob-muted">'+esc(r.customer_note||'')+'</div>'+(r.items||[]).map(i=>'<p>'+esc(i.quantity)+' × '+esc(i.name)+(i.variant_name?' / '+esc(i.variant_name):'')+' · '+money(i.line_total)+' · '+esc(i.note||'')+'</p>').join('')+'</div><div><button class="ob-btn primary" data-ob-request-approve="'+esc(r.id)+'">Onayla</button><button class="ob-btn danger" data-ob-request-reject="'+esc(r.id)+'">Reddet</button></div></div>').join(''):'<div class="ob-empty">Onay bekleyen QR siparişi yok.</div>';
   html+='</div>';
 }else if(state.tab==='kitchen'){
  const station=stationOnly?state.staffRole:state.kitchenFilter;
  html+='<div class="ob-kds-head"><h3>Hazırlık ve servis panosu</h3>'+(!stationOnly?'<div class="ob-row"><button class="ob-btn" data-ob-station="all">Tümü</button><button class="ob-btn" data-ob-station="kitchen">Mutfak</button><button class="ob-btn" data-ob-station="bar">Bar</button></div>':'')+'</div>';
  const listed=kitchenItems.filter(i=>(station==='all'||i.station===station));
  html+='<div class="ob-kds-grid">';
  for(const stage of ['new','preparing','ready']){
   const stageList=listed.filter(i=>i.status===stage);
   const heading={new:'Yeni siparişler',preparing:'Hazırlanıyor',ready:'Servise hazır'}[stage];
   html+='<section class="ob-kds-column ob-stage-'+stage+'"><div class="ob-kds-column-head"><h4>'+heading+'</h4><b>'+stageList.length+'</b></div>';
   html+=stageList.length?stageList.map(i=>{
    const t=opened.find(t=>t.id===i.ticket_id);
    const elapsed=Math.max(0,Math.floor((Date.now()-new Date(i.created_at).getTime())/60000));
    const canAct=stage==='ready'?state.permission.review:state.permission.status&&state.staffRole!=='waiter'&&
       (!stationOnly||state.staffRole===i.station);
    const next={new:'preparing',preparing:'ready',ready:'served'}[stage];
    const label={new:'Hazırlamaya başla',preparing:'Hazır olarak işaretle',ready:'Servis edildi'}[stage];
    return '<article class="ob-kds-ticket '+(elapsed>=15?'ob-kds-delayed':'')+'"><div class="ob-kds-ticket-head"><strong>Masa '+esc(t?.table_no)+'</strong><small>'+elapsed+' dk · '+(i.station==='bar'?'BAR':'MUTFAK')+'</small></div><div class="ob-kds-product">'+esc(i.quantity)+' × '+esc(i.name)+'</div>'+(i.note?'<p class="ob-kds-note">'+esc(i.note)+'</p>':'')+(canAct?'<button class="ob-btn primary ob-kds-action" data-ob-status="'+esc(i.id)+'" data-ob-next="'+next+'">'+label+'</button>':'<span class="ob-muted">İlgili görevli bekleniyor</span>')+'</article>';
   }).join(''):'<p class="ob-empty">Şu anda sipariş yok.</p>';
   html+='</section>';
  }
  html+='</div>';
 }else{
  const closed=state.tickets.filter(t=>t.status==='closed');
  html+='<div class="ob-card"><h3>Son 200 adisyon</h3><p class="ob-muted">Rakamlar tahsil edilmiş ciro değil, sipariş/adisyon tutarıdır.</p><div class="ob-stats"><div class="ob-card"><span class="ob-muted">Kapanan adisyon</span><strong class="metric">'+closed.length+'</strong></div><div class="ob-card"><span class="ob-muted">Kapalı hesap toplamı</span><strong class="metric">'+money(closed.reduce((n,t)=>n+total(t.id),0))+'</strong></div><div class="ob-card"><span class="ob-muted">Açık adisyon</span><strong class="metric">'+opened.length+'</strong></div></div>';
  html+=state.tickets.length?state.tickets.map(t=>'<div class="ob-entry"><span>Masa '+t.table_no+' · '+when(t.opened_at)+' · '+(t.status==='open'?'Açık':'Kapalı')+'</span><b>'+money(total(t.id))+'</b></div>').join(''):'<div class="ob-empty">Henüz adisyon oluşturulmadı.</div>';html+='</div>';
 }
 body().innerHTML=html;
}
async function refresh(silent=false){
 if(!state||state.busy||refreshRunning)return;refreshRunning=true;
 try{
 const snapshot=state,vid=state.vid;
 const d=await rpc('ob_adisyon_list',{p_venue_id:vid});
 if(state!==snapshot)return;
 snapshot.tickets=Array.isArray(d?.tickets)?d.tickets:[];
 snapshot.items=Array.isArray(d?.items)?d.items:[];
 if(snapshot.permission.review){
  try{const req=await rpc('ob_customer_orders_list',{p_venue_id:vid});if(state===snapshot)snapshot.requests=Array.isArray(req)?req:[]}catch(e){console.warn('QR orders:',e)}
  try{const calls=await rpc('ob_ops_waiter_list',{p_venue_id:vid});if(state===snapshot)snapshot.calls=Array.isArray(calls)?calls:[]}catch(e){console.warn('Garson çağrıları:',e)}
 }else {snapshot.requests=[];snapshot.calls=[]}
 if(state!==snapshot)return;
 const nextIds=snapshot.requests.map(x=>x.id);
 if(seenRequestIds!==null&&snapshot.permission.review){
  const count=nextIds.filter(id=>!seenRequestIds.includes(id)).length;
  if(count)notifyRequests(count);
 }
 seenRequestIds=nextIds;
 const activeTickets=new Set(snapshot.tickets.filter(t=>t.status==='open').map(t=>t.id));
 const stages=new Map(snapshot.items.filter(i=>activeTickets.has(i.ticket_id)).map(i=>[i.id,i.status]));
 if(seenItemStages!==null){
  const isStation=snapshot.staffRole==='kitchen'||snapshot.staffRole==='bar';
  const changes=snapshot.items.filter(i=>activeTickets.has(i.ticket_id)&&
    (isStation?i.station===snapshot.staffRole&&i.status==='new'&& !seenItemStages.has(i.id):
     snapshot.permission.review&&i.status==='ready'&&seenItemStages.get(i.id)!=='ready'));
  if(changes.length)notifyRequests(changes.length);
 }
 seenItemStages=stages;
 syncAlarm();
 if((snapshot.tab==='tools'||snapshot.floorEditing||floorDrag)&&silent)return;
 if(!silent||(document.activeElement?.id!=='ob-adisyon-search'&&!$('#ob-adisyon-add-form')))render();
 }finally{refreshRunning=false}
}
function notifyRequests(n){
 notice(n+' yeni işlem var.');
 try{if(window.Notification&&Notification.permission==='granted')new Notification('OynaBak · Yeni Sipariş',{body:n+' yeni işlem bekliyor'})}catch(_){}
 // POS sound and looping are handled by syncAlarm; no separate beep.
}
function productForm(index){
 const p=state.products[index];if(!p)return;
 const variants=Array.isArray(p.variants)?p.variants.filter(v=>v.name):[];
 const dest=(p.station==='bar'||p.station==='kitchen'?p.station:p.categoryStation)==='bar'?'Bar':'Mutfak';
 $('.ob-product-form',root())?.remove();
 const wrap=document.createElement('div');wrap.className='ob-card ob-product-form';wrap.innerHTML='<form id="ob-adisyon-add-form" data-index="'+index+'"><div class="ob-row"><h3>'+esc(p.name)+'</h3><button type="button" class="ob-btn" data-ob-dismiss>✕</button></div><label class="ob-field">Varyant<select name="variant"><option value="">Standart · '+money(p.price)+'</option>'+variants.map((v,i)=>'<option value="'+i+'">'+esc(v.name)+' · '+money(v.price)+'</option>').join('')+'</select></label><label class="ob-field">Adet<input name="quantity" type="number" min="1" max="99" value="1" required></label><p class="ob-muted">Hazırlık bölümü: '+dest+' (dijital menüde ayarlanır)</p><label class="ob-field">Sipariş notu<textarea name="note" maxlength="300"></textarea></label><button class="ob-btn primary" type="submit">Masa '+state.table+' adisyonuna ekle</button></form>';
 body().appendChild(wrap);
}
async function addItem(form){
 const p=state.products[Number(form.dataset.index)],f=new FormData(form);if(!p)throw Error('Ürün bulunamadı.');
 const v=f.get('variant'),variation=v===''?null:p.variants?.[Number(v)];
 const price=Number(variation?variation.price:p.price),quantity=Number(f.get('quantity'));
 if(!Number.isFinite(price)||price<0||!Number.isInteger(quantity)||quantity<1||quantity>99)throw Error('Fiyat veya adet geçersiz.');
 await rpc('ob_adisyon_add_item',{p_venue_id:state.vid,p_table_no:state.table,p_name:p.name,p_unit_price:price,p_quantity:quantity,p_station:(p.station==='bar'||p.categoryStation==='bar')?'bar':'kitchen',p_note:String(f.get('note')||''),p_menu_item_id:String(p.id),p_variant_id:variation?String(variation.id):null});
 $('.ob-product-form',root())?.remove();notice('Sipariş kaydedildi.');await refresh();
}
async function status(id,to){
 let reason='';if(to==='void'){reason=prompt('İptal nedeni (en az 3 karakter):')||'';if(!reason)return;if(reason.trim().length<3)throw Error('İptal nedeni en az 3 karakter olmalı.')}
 await rpc('ob_adisyon_item_status',{p_venue_id:state.vid,p_item_id:id,p_status:to,p_reason:reason});
 notice('Sipariş güncellendi.');await refresh();
}
async function decideRequest(id,approve){
 if(!state)return;
 let reason='';
 if(!approve){const answer=prompt('Sipariş reddetme nedeni (en az 3 karakter):');if(answer===null)return;reason=answer.trim();if(reason.length<3)throw Error('En az 3 karakter gerekçe yazın.')}
 await rpc('ob_customer_order_decide',{p_venue_id:state.vid,p_order_id:id,p_action:approve?'approve':'reject',p_reason:reason});
 notice(approve?'Sipariş onaylandı ve masa adisyonuna eklendi.':'Sipariş reddedildi.');
 await refresh();
}
async function toolAction(action){
 const vid=state.vid,out=()=>$('#ob-extra-results');
 if(action==='move'){
  const opened=state.tickets.filter(t=>t.status==='open');
  if(!opened.length)throw Error('Taşınabilecek açık masa bulunamadı.');
  const sourceOptions=opened.map(t=>'<option value="'+esc(t.id)+'">Masa '+esc(t.table_no)+' · '+money(total(t.id))+'</option>').join('');
  const targetOptions=Array.from({length:state.count},(_,n)=>'<option value="'+(n+1)+'">Masa '+(n+1)+'</option>').join('');
  if(out())out().innerHTML='<form class="ob-tool-form" id="ob-move-form"><h4>Masayı taşı</h4><p>Hedef masada açık adisyon bulunmamalı.</p><label>Kaynak adisyon<select name="ticket" required>'+sourceOptions+'</select></label><label>Hedef masa<select name="target" required>'+targetOptions+'</select></label><button type="submit" class="ob-btn primary">Masayı taşı</button></form>';
 }else if(action==='split'){
  const opened=state.tickets.filter(t=>t.status==='open');
  const options=opened.flatMap(t=>items(t.id).filter(i=>i.status!=='void').map(i=>'<option value="'+esc(i.id)+'" data-ticket="'+esc(t.id)+'">Masa '+t.table_no+' · '+esc(i.quantity)+' × '+esc(i.name)+'</option>')).join('');
  if(!options)throw Error('Bölüştürülecek açık sipariş yok.');
  if(out())out().innerHTML='<form class="ob-tool-form" id="ob-split-form"><h4>Kişi bazlı hesabı bölüştür</h4><p>Ürün ve adetleri kişilere ayır; ödeme kaydı oluşturulmaz.</p><label>Ürün<select name="item" required>'+options+'</select></label><label>Kişi adı<input name="group" required maxlength="40" placeholder="Örneğin Kişi 1"></label><label>Adet<input name="quantity" type="number" min="1" max="99" value="1" required></label><button type="submit" class="ob-btn primary">Kişiye ayır</button><div id="ob-split-results"></div></form>';
 }else if(action==='stats'){
  const d=await rpc('ob_adisyon_analytics',{p_venue_id:vid,p_days:30});
  if(out())out().innerHTML='<h4>Son 30 gün</h4><p>Sipariş tutarı: <b>'+money(d.totals?.ordered)+'</b></p><p>Ürün satırı: '+esc(d.totals?.items||0)+' · İptal: '+esc(d.totals?.cancelled||0)+' · Ortalama işlem süresi: '+esc(d.totals?.average_prep_minutes||0)+' dk</p><h4>Popüler ürünler</h4>'+(d.top_products||[]).map(x=>'<p>'+esc(x.name)+' · '+esc(x.qty)+' adet</p>').join('')+'<h4>Yoğun saatler</h4>'+(d.hours||[]).map(x=>'<p>'+esc(x.hour_of_day)+':00 · '+esc(x.orders)+' sipariş</p>').join('')+'<p class="ob-muted">Tahsil edilmiş gelir değildir.</p>';
 }else if(action==='codes'){
  const d=await rpc('ob_adisyon_table_security',{p_venue_id:vid});
  if(out())out().innerHTML='<h4>Masa doğrulaması: '+(d.required?'Açık':'Kapalı')+'</h4><button class="ob-btn" data-ob-security-toggle="'+(d.required?'disable':'enable')+'">'+(d.required?'Kodu zorunlu olmaktan çıkar':'Masa doğrulamasını aç')+'</button>'+(d.codes||[]).map(x=>'<p>Masa '+x.table_no+' · <b>'+esc(x.code)+'</b> <button class="ob-btn" data-ob-code-rotate="'+x.table_no+'">Kodu yenile</button></p>').join('')+'<p class="ob-muted">Kodları masa üzerinde ayrıca gösterin; QR değişmez.</p>';
 }else if(action==='staff'){
  const d=await rpc('ob_adisyon_staff_list',{p_venue_id:vid});
  if(out())out().innerHTML='<h4>Personel yönetimi</h4><p>Çalışanın önce OynaBak hesabı açması gerekir.</p><label>E-posta <input id="ob-staff-email" type="email" placeholder="calisan@ornek.com"></label><label>Yetki <select id="ob-staff-role"><option value="waiter">Garson</option><option value="kitchen">Mutfak</option><option value="bar">Bar</option><option value="manager">Yönetici</option><option value="remove">Erişimi kaldır</option></select></label><button class="ob-btn primary" data-ob-staff-save>Kaydet</button><h4>Kayıtlı kişiler</h4>'+d.map(x=>'<p>'+esc(x.email)+' · '+esc(x.role)+'</p>').join('');
 }
}
async function closeTicket(id){
 if(!confirm('Adisyon manuel kapatılsın mı? Bu işlem ödeme veya tahsilat kaydı oluşturmaz.'))return;
 await rpc('ob_adisyon_close',{p_venue_id:state.vid,p_ticket_id:id});
 state.table=0;notice('Adisyon manuel kapatıldı.');await refresh();
}

document.addEventListener('click',async e=>{
 const b=e.target.closest?.('[data-ob-alarm-mute],[data-ob-waiter-done],[data-ob-open],[data-ob-toggle],[data-ob-close],[data-ob-tab],[data-ob-table],[data-ob-back],[data-ob-product],[data-ob-dismiss],[data-ob-void],[data-ob-status],[data-ob-close-ticket],[data-ob-request-approve],[data-ob-request-reject],[data-ob-tool],[data-ob-security-toggle],[data-ob-code-rotate],[data-ob-staff-save],[data-ob-station],[data-ob-enable-alerts]');
 if(!b||b.disabled)return;e.preventDefault();e.stopImmediatePropagation();
 if(b.hasAttribute('data-ob-close')){close();return}
 if(b.hasAttribute('data-ob-dismiss')){$('.ob-product-form',root())?.remove();return}
 if(b.hasAttribute('data-ob-alarm-mute')){muteAlarm();return}
 if(state?.busy)return;
 b.disabled=true;
 try{
  if(b.dataset.obOpen)await open(b.dataset.obOpen);
  else if(b.dataset.obToggle)await toggle(b.dataset.obToggle);
  else if(state){
   if(b.hasAttribute('data-ob-enable-alerts')){
    try{await enableAlarm()}catch(err){notice('Ses açılamadı: '+err.message,true)}
   }
   else if(b.dataset.obWaiterDone){await rpc('ob_ops_waiter_done',{p_venue_id:state.vid,p_call_id:b.dataset.obWaiterDone});await refresh();notice('Garson çağrısı tamamlandı.')}
   else if(b.hasAttribute('data-ob-floor-edit')){
    state.floorDraft=normalizeFloor(state.floorSaved,state.count);
    state.floorEditing=true;render();
   }
   else if(b.hasAttribute('data-ob-floor-cancel')){
    state.floorDraft=normalizeFloor(state.floorSaved,state.count);
    state.floorEditing=false;render();
   }
   else if(b.hasAttribute('data-ob-floor-auto')){
    state.floorDraft=defaultFloor(state.count);render();
   }
   else if(b.hasAttribute('data-ob-floor-confirm'))await saveFloor();
   else if(b.dataset.obStation){state.kitchenFilter=b.dataset.obStation;try{localStorage.setItem('ob-ops-station-'+state.vid,state.kitchenFilter)}catch{}render()}
   else if(b.dataset.obTool)await toolAction(b.dataset.obTool);
   else if(b.dataset.obSecurityToggle){await rpc('ob_adisyon_table_code_action',{p_venue_id:state.vid,p_table_no:1,p_action:b.dataset.obSecurityToggle});await toolAction('codes')}
   else if(b.dataset.obCodeRotate){await rpc('ob_adisyon_table_code_action',{p_venue_id:state.vid,p_table_no:Number(b.dataset.obCodeRotate),p_action:'rotate'});await toolAction('codes')}
   else if(b.hasAttribute('data-ob-staff-save')){await rpc('ob_adisyon_staff_assign',{p_venue_id:state.vid,p_email:$('#ob-staff-email').value,p_role:$('#ob-staff-role').value});await toolAction('staff')}
   else if(b.dataset.obTab){state.tab=b.dataset.obTab;try{localStorage.setItem('ob-ops-screen-'+state.vid,state.tab)}catch{}state.table=0;render()}
   else if(b.dataset.obTable){state.table=Number(b.dataset.obTable);state.filter='';render()}
   else if(b.hasAttribute('data-ob-back')){state.table=0;render()}
   else if(b.dataset.obProduct)productForm(Number(b.dataset.obProduct));
   else if(b.dataset.obVoid)await status(b.dataset.obVoid,'void');
   else if(b.dataset.obStatus)await status(b.dataset.obStatus,b.dataset.obNext);
   else if(b.dataset.obCloseTicket)await closeTicket(b.dataset.obCloseTicket);
   else if(b.dataset.obRequestApprove)await decideRequest(b.dataset.obRequestApprove,true);
   else if(b.dataset.obRequestReject)await decideRequest(b.dataset.obRequestReject,false);
  }
 }catch(err){notice(err.message||String(err),true)}
 finally{b.disabled=false}
},true);
document.addEventListener('submit',async e=>{
 if(!['ob-move-form','ob-split-form'].includes(e.target.id))return;
 e.preventDefault();e.stopImmediatePropagation();
 if(!state||state.busy)return;
 state.busy=true;
 const form=e.target,btn=form.querySelector('[type=submit]');if(btn)btn.disabled=true;
 try{
  const data=new FormData(form);
  if(form.id==='ob-move-form'){
   const ticket=state.tickets.find(t=>t.id===data.get('ticket')&&t.status==='open');
   if(!ticket)throw Error('Açık adisyon bulunamadı.');
   const target=Number(data.get('target'));
   if(!Number.isInteger(target)||target<1||target>state.count)throw Error('Hedef masa geçersiz.');
   await rpc('ob_adisyon_move_ticket',{p_venue_id:state.vid,p_ticket_id:ticket.id,p_new_table:target});
   notice('Masa taşındı.');state.busy=false;await refresh();await toolAction('move');
  }else{
   const item=state.items.find(i=>i.id===data.get('item'));
   if(!item)throw Error('Ürün bulunamadı.');
   const group=String(data.get('group')||'').trim(),qty=Number(data.get('quantity'));
   if(!group||!Number.isInteger(qty)||qty<1||qty>item.quantity)throw Error('Geçersiz kişi veya adet.');
   const parts=await rpc('ob_adisyon_split_assign',{p_venue_id:state.vid,p_ticket_id:item.ticket_id,p_item_id:item.id,p_group:group,p_quantity:qty});
   const el=$('#ob-split-results');if(el)el.innerHTML='<h4>Hesap dağılımı</h4>'+(parts||[]).map(x=>'<p>'+esc(x.group)+' · '+esc(x.quantity)+' adet · '+money(x.amount)+'</p>').join('')+'<p class="ob-muted">Tahsilat kaydı değildir.</p>';
   notice('Paylaştırma kaydedildi.');
  }
 }catch(err){notice(err.message||String(err),true)}
 finally{if(state)state.busy=false;if(btn?.isConnected)btn.disabled=false}
},true);
document.addEventListener('submit',async e=>{
 if(e.target.id!=='ob-adisyon-add-form')return;e.preventDefault();e.stopImmediatePropagation();
 if(!state||state.busy)return;state.busy=true;
 try{await addItem(e.target)}catch(err){notice(err.message||String(err),true)}finally{if(state)state.busy=false}
},true);
document.addEventListener('input',e=>{
 if(e.target.id!=='ob-adisyon-search'||!state)return;
 const pos=e.target.selectionStart;state.filter=e.target.value;render();
 const field=$('#ob-adisyon-search');field?.focus();try{field?.setSelectionRange(pos,pos)}catch(_){}
},true);

document.addEventListener('pointerdown',e=>{
 const btn=e.target.closest?.('[data-ob-floor-drag]');
 if(!btn||!state?.floorEditing||!root()?.contains(btn)||floorDrag)return;
 if(e.pointerType==='mouse'&&e.button!==0)return;
 const canvas=btn.closest('[data-ob-floor-canvas]');if(!canvas)return;
 e.preventDefault();
 const r=btn.getBoundingClientRect();
 floorDrag={pointerId:e.pointerId,el:btn,canvas,
  table:Number(btn.dataset.obFloorDrag),offsetX:e.clientX-r.left,offsetY:e.clientY-r.top};
 btn.classList.add('is-moving');
 try{btn.setPointerCapture(e.pointerId)}catch(_){}
},true);
document.addEventListener('pointermove',e=>{
 if(!floorDrag||floorDrag.pointerId!==e.pointerId||!state?.floorEditing)return;
 e.preventDefault();
 const {el,canvas,table,offsetX,offsetY}=floorDrag,
  stage=canvas.getBoundingClientRect(),tile=el.getBoundingClientRect();
 const availableX=Math.max(1,stage.width-tile.width),
  availableY=Math.max(1,stage.height-tile.height);
 const x=100*(e.clientX-stage.left-offsetX)/availableX,
  y=100*(e.clientY-stage.top-offsetY)/availableY;
 floorSet(table,x,y);
 const pos=state.floorDraft.find(p=>p.table===table);
 if(pos)el.style.cssText=floorStyle(pos);
},true);
function finishFloorDrag(e){
 if(!floorDrag||floorDrag.pointerId!==e.pointerId)return;
 const el=floorDrag.el;
 el.classList.remove('is-moving');
 try{el.releasePointerCapture(e.pointerId)}catch(_){}
 floorDrag=null;
}
document.addEventListener('pointerup',finishFloorDrag,true);
document.addEventListener('pointercancel',finishFloorDrag,true);
document.addEventListener('keydown',e=>{
 const btn=e.target.closest?.('[data-ob-floor-drag]');
 if(!btn||!state?.floorEditing||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
 e.preventDefault();
 const num=Number(btn.dataset.obFloorDrag),pos=state.floorDraft.find(p=>p.table===num);
 if(!pos)return;
 const step=e.shiftKey?1:3;
 floorSet(num,pos.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),
  pos.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0));
 btn.style.cssText=floorStyle(state.floorDraft.find(p=>p.table===num));
},true);

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root()&&!$('.ob-product-form',root()))close()});
window.OynaBakAdisyonModule=Object.freeze({open,close});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
