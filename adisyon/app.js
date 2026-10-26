(()=>{'use strict';
const $=(q,r=document)=>r.querySelector(q);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n||0));
const when=d=>new Date(d).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const bridge=()=>window.OynaBakAdisyonBridge;
const current=()=>bridge()?.context();
let state=null,poll=null,mounting=false;
async function rpc(fn,args){const db=current()?.db;if(!db)throw Error('Veritabanı bağlantısı bulunamadı.');const {data,error}=await db.rpc(fn,args);if(error)throw Error(error.message||'Sunucu işlemi başarısız.');return data}
function notice(msg,error=false){let n=$('#ob-adisyon-message');if(!n){n=document.createElement('div');n.id='ob-adisyon-message';document.body.appendChild(n)}n.textContent=msg;n.className=error?'error':'';clearTimeout(n._timer);n._timer=setTimeout(()=>n.remove(),4500)}
const venue=id=>(current()?.adminData?.venues||[]).find(v=>String(v.id)===String(id));
async function mount(){
 if(mounting)return;const me=current()?.me;if(!me||!['admin','merchant'].includes(me.role))return;
 mounting=true;
 try{
  if(me.role==='admin'){
   document.querySelectorAll('.card [data-action="venue-edit"]').forEach(el=>{
    const box=el.closest('.card'),id=el.dataset.id;
    if(!box||!id||box.querySelector('[data-ob-open]'))return;
    const line=document.createElement('div');line.className='ob-adm-actions';
    line.innerHTML='<button class="btn small light" type="button" data-ob-open="'+esc(id)+'">📋 Adisyon</button><button class="btn small light" type="button" data-ob-toggle="'+esc(id)+'">⚙️ Adisyon ayarı</button>';
    box.appendChild(line);
   });
  }else{
    const box=$('.merchant-control-grid'),id=me.venue?.id;
    if(box&&id&&!box.dataset.obBlocked&&!box.querySelector('[data-ob-open]')){
      const b=document.createElement('button');b.type='button';b.className='merchant-control-card';b.dataset.obOpen=String(id);
      b.innerHTML='<span>07</span><b>📋 Adisyon Yönetimi</b><small>Masalar, siparişler, mutfak ve raporlar · ödeme yok</small>';box.appendChild(b);
      rpc('ob_adisyon_status',{p_venue_id:String(id)}).then(s=>{if(b.isConnected&&!s?.enabled){box.dataset.obBlocked='1';b.remove()}}).catch(()=>{box.dataset.obBlocked='1';b.remove()});
    }
  }
 }finally{mounting=false}
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;mount().catch(console.warn)})}
function setup(){const app=$('#app');if(app){new MutationObserver(schedule).observe(app,{childList:true,subtree:true});schedule()}}
function close(){clearInterval(poll);poll=null;state=null;$('#ob-adisyon')?.remove();document.body.style.overflow=''}
function root(){return $('#ob-adisyon')}
function body(){return $('#ob-adisyon-body')}
async function open(id){
 const ctx=current(),me=ctx?.me;
 if(!me||!['admin','merchant'].includes(me.role))throw Error('Panel oturumu gerekli.');
 const v=me.role==='admin'?venue(id):me.venue;
 if(!v||String(v.id)!==String(id))throw Error('İşletme yetkisi yok.');
 close();
 const el=document.createElement('section');el.id='ob-adisyon';el.setAttribute('aria-label','Adisyon paneli');
 el.innerHTML='<div class="ob-shell"><div class="ob-head"><div><div class="ob-muted">OYNA BAK / ADİSYON</div><h2>'+esc(v.name)+'</h2><div class="ob-muted">Sipariş ve masa yönetimi · Online ödeme yok</div></div><button class="ob-btn" data-ob-close>✕ Panele dön</button></div><div id="ob-adisyon-body">Yükleniyor…</div></div>';
 document.body.appendChild(el);document.body.style.overflow='hidden';
 try{
  const s=await rpc('ob_adisyon_status',{p_venue_id:String(id)});
  if(!s?.allowed)throw Error('Bu işletmeye adisyon erişimi kapalı.');
  if(!s.enabled){body().innerHTML='<div class="ob-card"><h3>Adisyon etkin değil</h3><p>OynaBak yönetim panelinden bu işletmeye adisyonu açın.</p></div>';return}
  state={vid:String(id),count:Number(s.table_count)||1,tab:'tables',table:0,filter:'',tickets:[],items:[],products:[],busy:false};
  const menu=await bridge().menu(id);
  state.products=(menu?.categories||[]).filter(c=>c.active).flatMap(c=>(c.items||[]).filter(i=>i.active&&!i.sold_out).map(i=>({...i,category:c.name})));
  await refresh();
  poll=setInterval(()=>refresh(true).catch(()=>{}),5000);
 }catch(e){if(body())body().innerHTML='<div class="ob-card"><h3>Adisyon açılamadı</h3><p>'+esc(e.message)+'</p><p class="ob-muted">Veritabanı kurulumu veya işletme yetkisini kontrol edin. Mevcut QR menü değişmedi.</p></div>'}
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
const tab=(key,label)=>'<button class="ob-btn '+(state.tab===key?'active':'')+'" data-ob-tab="'+key+'">'+label+'</button>';
function render(){
 if(!state||!body())return;
 const opened=state.tickets.filter(t=>t.status==='open'),pending=state.items.filter(i=>i.status==='new'&&opened.some(t=>t.id===i.ticket_id));
 let html='<div class="ob-stats"><div class="ob-card"><span class="ob-muted">Açık adisyon</span><strong class="metric">'+opened.length+'</strong></div><div class="ob-card"><span class="ob-muted">Bekleyen sipariş</span><strong class="metric">'+pending.length+'</strong></div><div class="ob-card"><span class="ob-muted">Açık hesap tutarı</span><strong class="metric">'+money(opened.reduce((v,t)=>v+total(t.id),0))+'</strong></div></div>';
 html+='<div class="ob-tabs">'+tab('tables','▦ Masalar')+tab('kitchen','♨️ Mutfak / Bar')+tab('reports','▤ Raporlar')+'</div>';
 if(state.tab==='tables'){
   if(!state.table){
     html+='<div class="ob-grid">';
     for(let n=1;n<=state.count;n++){const t=active(n);html+='<button class="ob-table '+(t?'open':'')+'" data-ob-table="'+n+'">▣<b>Masa '+n+'</b><small>'+(t?money(total(t.id)):'Boş')+'</small></button>'}
     html+='</div>';
   }else{
     const t=active(state.table),list=t?items(t.id):[];
     const products=state.products.map((p,i)=>({...p,index:i})).filter(p=>(p.name+' '+p.category).toLocaleLowerCase('tr-TR').includes(state.filter.toLocaleLowerCase('tr-TR')));
     html+='<button class="ob-btn" data-ob-back>← Masalar</button><div class="ob-cols"><section class="ob-card"><h3>Masa '+state.table+' · Menü</h3><label class="ob-field">Ürün ara<input id="ob-adisyon-search" placeholder="Menüde ara" value="'+esc(state.filter)+'"></label><div class="ob-products">';
     html+=products.length?products.map(p=>'<button class="ob-btn" data-ob-product="'+p.index+'"><b>'+esc(p.name)+'</b><div class="ob-muted">'+esc(p.category)+' · '+money(p.price)+'</div></button>').join(''):'<div class="ob-empty">Aktif menü ürünü yok.</div>';
     html+='</div></section><section class="ob-card"><h3>Masa '+state.table+' · Adisyon</h3>';
     html+=list.length?list.map(i=>'<div class="ob-entry"><div><b>'+i.quantity+' × '+esc(i.name)+'</b><div class="ob-muted">'+esc(i.station==='bar'?'Bar':'Mutfak')+' · '+esc(i.status)+' · '+esc(i.note||'')+'</div></div><div><b>'+money(i.line_total)+'</b>'+(i.status==='void'?'':'<br><button class="ob-btn danger" data-ob-void="'+esc(i.id)+'">İptal</button>')+'</div></div>').join(''):'<div class="ob-empty">Bu masada açık sipariş yok.</div>';
     html+='<div class="ob-total">Toplam: '+money(t?total(t.id):0)+'</div><p class="ob-muted">Bu bir hesap toplamıdır, tahsilat kaydı değildir.</p>';
     if(t)html+='<button class="ob-btn primary" data-ob-close-ticket="'+esc(t.id)+'">Adisyonu manuel kapat</button>';
     html+='</section></div>';
   }
 }else if(state.tab==='kitchen'){
  html+='<div class="ob-card"><h3>Hazırlık ekranı</h3>';
  const list=state.items.filter(i=>opened.some(t=>t.id===i.ticket_id)&&!['void','served'].includes(i.status));
  html+=list.length?list.map(i=>{const t=opened.find(t=>t.id===i.ticket_id),next={new:'preparing',preparing:'ready',ready:'served'}[i.status];return '<div class="ob-entry"><div><b>Masa '+esc(t?.table_no)+' · '+i.quantity+' × '+esc(i.name)+'</b><div class="ob-muted">'+esc(i.station==='bar'?'Bar':'Mutfak')+' · '+esc(i.note||'')+'</div></div><button class="ob-btn primary" data-ob-status="'+esc(i.id)+'" data-ob-next="'+next+'">'+({new:'Hazırlanıyor',preparing:'Hazır',ready:'Servis edildi'}[i.status])+'</button></div>'}).join(''):'<div class="ob-empty">Bekleyen sipariş yok.</div>';
  html+='</div>';
 }else{
  const closed=state.tickets.filter(t=>t.status==='closed');
  html+='<div class="ob-card"><h3>Son 200 adisyon</h3><p class="ob-muted">Rakamlar tahsil edilmiş ciro değil, sipariş/adisyon tutarıdır.</p><div class="ob-stats"><div class="ob-card"><span class="ob-muted">Kapanan adisyon</span><strong class="metric">'+closed.length+'</strong></div><div class="ob-card"><span class="ob-muted">Kapalı hesap toplamı</span><strong class="metric">'+money(closed.reduce((n,t)=>n+total(t.id),0))+'</strong></div><div class="ob-card"><span class="ob-muted">Açık adisyon</span><strong class="metric">'+opened.length+'</strong></div></div>';
  html+=state.tickets.length?state.tickets.map(t=>'<div class="ob-entry"><span>Masa '+t.table_no+' · '+when(t.opened_at)+' · '+(t.status==='open'?'Açık':'Kapalı')+'</span><b>'+money(total(t.id))+'</b></div>').join(''):'<div class="ob-empty">Henüz adisyon oluşturulmadı.</div>';html+='</div>';
 }
 body().innerHTML=html;
}
async function refresh(silent=false){
 if(!state||state.busy)return;
 const d=await rpc('ob_adisyon_list',{p_venue_id:state.vid});
 if(!state)return;
 state.tickets=Array.isArray(d?.tickets)?d.tickets:[];state.items=Array.isArray(d?.items)?d.items:[];
 if(!silent||document.activeElement?.id!=='ob-adisyon-search')render();
}
function productForm(index){
 const p=state.products[index];if(!p)return;
 const variants=Array.isArray(p.variants)?p.variants.filter(v=>v.name):[];
 $('.ob-product-form',root())?.remove();
 const wrap=document.createElement('div');wrap.className='ob-card ob-product-form';wrap.innerHTML='<form id="ob-adisyon-add-form" data-index="'+index+'"><div class="ob-row"><h3>'+esc(p.name)+'</h3><button type="button" class="ob-btn" data-ob-dismiss>✕</button></div><label class="ob-field">Varyant<select name="variant"><option value="">Standart · '+money(p.price)+'</option>'+variants.map((v,i)=>'<option value="'+i+'">'+esc(v.name)+' · '+money(v.price)+'</option>').join('')+'</select></label><label class="ob-field">Adet<input name="quantity" type="number" min="1" max="99" value="1" required></label><label class="ob-field">Hazırlık bölümü<select name="station"><option value="kitchen">Mutfak</option><option value="bar">Bar</option></select></label><label class="ob-field">Sipariş notu<textarea name="note" maxlength="300"></textarea></label><button class="ob-btn primary" type="submit">Masa '+state.table+' adisyonuna ekle</button></form>';
 body().appendChild(wrap);
}
async function addItem(form){
 const p=state.products[Number(form.dataset.index)],f=new FormData(form);if(!p)throw Error('Ürün bulunamadı.');
 const v=f.get('variant'),variation=v===''?null:p.variants?.[Number(v)];
 const price=Number(variation?variation.price:p.price),quantity=Number(f.get('quantity'));
 if(!Number.isFinite(price)||price<0||!Number.isInteger(quantity)||quantity<1||quantity>99)throw Error('Fiyat veya adet geçersiz.');
 await rpc('ob_adisyon_add_item',{p_venue_id:state.vid,p_table_no:state.table,p_name:p.name,p_unit_price:price,p_quantity:quantity,p_station:String(f.get('station')),p_note:String(f.get('note')||''),p_menu_item_id:String(p.id),p_variant_id:variation?String(variation.id):null});
 $('.ob-product-form',root())?.remove();notice('Sipariş kaydedildi.');await refresh();
}
async function status(id,to){
 let reason='';if(to==='void'){reason=prompt('İptal nedeni (en az 3 karakter):')||'';if(!reason)return;if(reason.trim().length<3)throw Error('İptal nedeni en az 3 karakter olmalı.')}
 await rpc('ob_adisyon_item_status',{p_venue_id:state.vid,p_item_id:id,p_status:to,p_reason:reason});
 notice('Sipariş güncellendi.');await refresh();
}
async function closeTicket(id){
 if(!confirm('Adisyon manuel kapatılsın mı? Bu işlem ödeme veya tahsilat kaydı oluşturmaz.'))return;
 await rpc('ob_adisyon_close',{p_venue_id:state.vid,p_ticket_id:id});
 state.table=0;notice('Adisyon manuel kapatıldı.');await refresh();
}
document.addEventListener('click',async e=>{
 const b=e.target.closest?.('[data-ob-open],[data-ob-toggle],[data-ob-close],[data-ob-tab],[data-ob-table],[data-ob-back],[data-ob-product],[data-ob-dismiss],[data-ob-void],[data-ob-status],[data-ob-close-ticket]');
 if(!b||b.disabled)return;e.preventDefault();e.stopImmediatePropagation();
 if(b.hasAttribute('data-ob-close')){close();return}
 if(b.hasAttribute('data-ob-dismiss')){$('.ob-product-form',root())?.remove();return}
 if(state?.busy)return;
 b.disabled=true;
 try{
  if(b.dataset.obOpen)await open(b.dataset.obOpen);
  else if(b.dataset.obToggle)await toggle(b.dataset.obToggle);
  else if(state){
   if(b.dataset.obTab){state.tab=b.dataset.obTab;state.table=0;render()}
   else if(b.dataset.obTable){state.table=Number(b.dataset.obTable);state.filter='';render()}
   else if(b.hasAttribute('data-ob-back')){state.table=0;render()}
   else if(b.dataset.obProduct)productForm(Number(b.dataset.obProduct));
   else if(b.dataset.obVoid)await status(b.dataset.obVoid,'void');
   else if(b.dataset.obStatus)await status(b.dataset.obStatus,b.dataset.obNext);
   else if(b.dataset.obCloseTicket)await closeTicket(b.dataset.obCloseTicket);
  }
 }catch(err){notice(err.message||String(err),true)}
 finally{b.disabled=false}
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root()&&!$('.ob-product-form',root()))close()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
