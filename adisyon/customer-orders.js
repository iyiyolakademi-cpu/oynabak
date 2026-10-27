(()=>{
'use strict';
const current=()=>window.OynaBakCustomerBridge?.context();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n||0));
const $=(q,r=document)=>r.querySelector(q);
let venueId='',config=null,cart=[],last=null,working=false,pendingSubmit=null;
let lastCheckAt=0,selectedTable='1',customerNote='',tableCode='',sheetOpen=false,lastFocused=null;
const storageKey=id=>'ob-customer-order:'+id;
const cartCount=()=>cart.reduce((n,x)=>n+Math.max(0,Number(x.quantity)||0),0);
const cartTotal=()=>cart.reduce((n,x)=>n+(Number(x.price)||0)*(Number(x.quantity)||0),0);
function restore(id){
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey(id))||'null');
  if(!saved||saved.venue!==id)return;
  last=saved.last||null;
  cart=Array.isArray(saved.cart)?saved.cart.filter(x=>x&&x.id&&Number(x.quantity)>0).slice(0,12):[];
  pendingSubmit=saved.pending||null;
  selectedTable=saved.selectedTable||'1';
  customerNote=String(saved.customerNote||'').slice(0,200);
  tableCode=String(saved.tableCode||'').slice(0,6);
 }catch(err){console.warn('QR sepeti okunamadı:',err)}
}
function persist(){
 try{if(venueId)localStorage.setItem(storageKey(venueId),JSON.stringify({
  venue:venueId,last,cart,pending:pendingSubmit,selectedTable,customerNote,tableCode
 }))}catch(err){console.warn('QR sepeti kaydedilemedi:',err)}
}
async function rpc(name,args){
 const db=current()?.db;if(!db)throw Error('Bağlantı kurulamadı');
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error(error.message||'Sunucu hatası');
 return data;
}
function menuItems(){
 return (current()?.venue?.menu?.categories||[])
  .filter(c=>c.active)
  .flatMap(c=>(c.items||[]).filter(i=>i.active&&!i.sold_out));
}
function inform(text){
 const live=$('#ob-order-announcement');if(live)live.textContent=text;
}
function setSheet(open){
 const panel=$('#ob-qr-order'),scrim=$('#ob-order-scrim');
 if(!panel)return;
 sheetOpen=Boolean(open);
 if(sheetOpen)lastFocused=document.activeElement;
 panel.hidden=!sheetOpen;
 if(scrim)scrim.hidden=!sheetOpen;
 panel.setAttribute('aria-hidden',String(!sheetOpen));
 if(sheetOpen){
  panel.scrollTop=0;
  requestAnimationFrame(()=>$('#ob-cart-title',panel)?.focus({preventScroll:true}));
 }else if(lastFocused?.isConnected){
  lastFocused.focus({preventScroll:true});
 }
}
function render(){
 const panel=$('#ob-qr-order'),jumper=$('[data-ob-cart-jump]');
 if(!panel)return;
 const count=Number(config?.table_count)||0;
 const quantity=cartCount(),total=cartTotal();
 if(jumper){
  const status=Boolean(last);
  jumper.hidden=!status&&!quantity&&!pendingSubmit;
  jumper.innerHTML='<span class="ob-cart-bag" aria-hidden="true">▣</span><span class="ob-cart-caption"><b>'+
   (status?'Sipariş durumu':pendingSubmit?'Gönderim bekliyor':quantity+' ürün · Sepetim')+
   '</b><small>'+(status?money(last.total):money(total))+'</small></span><span aria-hidden="true">›</span>';
  jumper.setAttribute('aria-label',status?'Sipariş durumunu görüntüle':
   'Sepetimi aç, '+quantity+' ürün, toplam '+money(total));
 }
 document.querySelectorAll('.menu-order-quantity').forEach(badge=>{
  const id=badge.getAttribute('data-ob-menu-qty');
  const n=cart.filter(x=>String(x.id)===id).reduce((t,x)=>t+x.quantity,0);
  badge.hidden=!n;
  badge.textContent=n?'Sepette '+n:'';
 });
 let content='<header class="ob-checkout-header"><div><small>OYNABAK · QR SİPARİŞ</small>'+
  '<h3 id="ob-cart-title" tabindex="-1">'+(last?'Siparişiniz':'Sepetim')+'</h3>'+
  '<p>'+(last?'Siparişinizi buradan takip edin.':'Ürünleri onayla, masanı seç ve garsona ilet.')+'</p></div>'+
  '<button type="button" class="ob-cart-close" data-ob-cart-close aria-label="Sepeti kapat">✕</button></header>';
 if(last){
  const status=({pending:'Garson onayı bekleniyor',approved:'Onaylandı, hazırlığa alındı',rejected:'Garson tarafından reddedildi'}[last.status]||last.status||'Durum kontrol ediliyor');
  content+='<div class="ob-checkout-status"><small>Masa '+esc(last.table_no)+' · '+money(last.total)+'</small>'+
   '<strong>'+esc(status)+'</strong></div>'+
   (Array.isArray(last.items_status)&&last.items_status.length?
    '<div class="ob-checkout-lines">'+last.items_status.map(i=>
     '<div class="ob-checkout-line"><b>'+esc(i.name)+'</b><small>'+
     esc(({new:'Alındı',preparing:'Hazırlanıyor',ready:'Hazır',served:'Servis edildi',void:'İptal'}[i.status]||i.status)+'</small></div>').join('')+'</div>':'')+
   (last.reject_reason?'<p class="ob-order-error">'+esc(last.reject_reason)+'</p>':'')+
   '<p class="ob-checkout-hint">Bu ekrandan ödeme alınmaz.</p>'+
   '<div class="ob-checkout-actions"><button type="button" data-ob-order-refresh>↻ Durumu yenile</button>'+
   '<button type="button" data-ob-order-new class="primary">+ Yeni sipariş</button></div>';
 }else{
  content+='<div class="ob-checkout-lines">'+(cart.length?
   cart.map((x,n)=>'<article class="ob-checkout-line"><div class="ob-checkout-item"><b>'+esc(x.name)+'</b>'+
    '<small>'+money(x.price)+' · '+money(x.price*x.quantity)+'</small></div>'+
    '<div class="ob-checkout-quantity"><button type="button" data-ob-qty-minus="'+n+'" aria-label="'+esc(x.name)+' bir adet azalt">−</button>'+
    '<span>'+x.quantity+'</span><button type="button" data-ob-qty-plus="'+n+'" aria-label="'+esc(x.name)+' bir adet artır">+</button></div></article>').join(''):
   '<div class="ob-checkout-empty">Henüz ürün eklemedin. Menüde ürünlerin yanındaki <b>+ Ekle</b> düğmesini kullan.</div>')+
   '</div><div class="ob-checkout-total"><span>Ürün toplamı</span><strong>'+money(total)+'</strong></div>';
  if(pendingSubmit)content+='<p class="ob-checkout-hint" role="status">İnternet bağlantısı nedeniyle önceki siparişin gönderimi doğrulanamadı. Aynı sipariş koduyla tekrar deneniyor; yeni ürün eklemeyin.</p>';
  content+='<div class="ob-checkout-fields"><label>Masa numarası<select id="ob-order-table">'+
   Array.from({length:count},(_,i)=>'<option value="'+(i+1)+'"'+(String(i+1)===String(selectedTable)?' selected':'')+'>Masa '+(i+1)+'</option>').join('')+
   '</select></label>'+
   (config?.require_table_code?'<label>Masadaki 6 haneli doğrulama kodu<input id="ob-order-table-code" type="text" inputmode="numeric" maxlength="6" autocomplete="off" value="'+esc(tableCode)+'" placeholder="6 haneli kod"></label>':'')+
   '<label>Sipariş notu (isteğe bağlı)<textarea id="ob-order-note" maxlength="200" placeholder="Örn. şekersiz">'+esc(customerNote)+'</textarea></label></div>'+
   '<p class="ob-order-privacy-note">Sipariş notuna özel kişisel bilgilerinizi yazmayın. Sipariş garson onayına gönderilir. Online ödeme yoktur.</p>'+
   '<button type="button" class="ob-checkout-send" data-ob-submit '+(!cart.length&&!pendingSubmit?'disabled':'')+'>'+
   (pendingSubmit?'↻ Sipariş durumunu yeniden kontrol et':'Garsona sipariş gönder')+'</button>'+
   '<p id="ob-order-error" class="ob-order-error" role="alert"></p>';
 }
 panel.innerHTML=content;
 panel.hidden=!sheetOpen;
 panel.setAttribute('aria-hidden',String(!sheetOpen));
 const scrim=$('#ob-order-scrim');if(scrim)scrim.hidden=!sheetOpen;
}
async function start(){
 const ctx=current();if(!ctx?.venue?.id||!ctx?.db)return;
 const id=String(ctx.venue.id);
 if(venueId!==id){
  venueId=id;cart=[];last=null;config=null;pendingSubmit=null;
  selectedTable='1';customerNote='';tableCode='';sheetOpen=false;restore(id);
 }
 try{config=await rpc('ob_customer_order_config',{p_venue_id:id})}
 catch(err){console.warn('QR sipariş ayarları alınamadı:',err);return}
 if(id!==venueId||!config?.enabled)return;
 const modal=$('#modal');
 if(!modal?.classList.contains('menu-full'))return;
 const screen=modal.querySelector('.dialog-body .menu-screen');
 const body=modal.querySelector('.dialog-body');
 if(!screen||!body)return;
 screen.classList.add('menu-order-enabled');
 screen.querySelectorAll('.menu-order-controls').forEach(el=>{el.hidden=false});
 let panel=$('#ob-qr-order');
 if(!panel){
  panel=document.createElement('section');panel.id='ob-qr-order';panel.className='ob-qr-order';
  panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Sipariş sepeti');body.appendChild(panel);
 }
 if(!$('#ob-order-scrim')){
  const scrim=document.createElement('button');scrim.type='button';
  scrim.id='ob-order-scrim';scrim.hidden=true;scrim.dataset.obCartClose='';
  scrim.setAttribute('aria-label','Sepeti kapat');body.appendChild(scrim);
 }
 if(!body.querySelector('[data-ob-cart-jump]')){
  const b=document.createElement('button');b.type='button';b.className='ob-qr-cart-jump';
  b.dataset.obCartJump='';body.appendChild(b);
 }
 if(!screen.querySelector('#ob-order-announcement')){
  const region=document.createElement('div');region.id='ob-order-announcement';
  region.className='ob-order-live';region.setAttribute('role','status');
  region.setAttribute('aria-live','polite');screen.appendChild(region);
 }
 render();
 if(last)check();
 else if(pendingSubmit&&navigator.onLine)submit(true);
}
async function submit(fromRetry=false){
 if(working||(!cart.length&&!pendingSubmit))return;
 working=true;
 const btn=$('[data-ob-submit]');if(btn)btn.disabled=true;
 const table=Number($('#ob-order-table')?.value||pendingSubmit?.payload?.p_table_no||selectedTable||0);
 const note=String($('#ob-order-note')?.value??customerNote).slice(0,200);
 const requestKey=pendingSubmit?.requestKey||crypto.randomUUID();
 const payload=pendingSubmit?.payload||{
  p_venue_id:venueId,p_table_no:table,
  p_items:cart.map(x=>({item_id:x.id,variant_id:x.variant_id,quantity:x.quantity})),
  p_note:note,p_request_key:requestKey
 };
 if(config?.require_table_code&&!pendingSubmit){
  const code=String($('#ob-order-table-code')?.value||tableCode||'').trim();
  if(!/^[0-9]{6}$/.test(code)){
   working=false;
   const error=$('#ob-order-error');if(error)error.textContent='Masadaki 6 haneli kodu girin.';
   if(btn)btn.disabled=false;return;
  }
  payload.p_items[0].table_code=code;
 }
 pendingSubmit={requestKey,payload};persist();
 try{
  const data=await rpc('ob_customer_order_submit',payload);
  pendingSubmit=null;last={...data,venue:venueId};cart=[];
  persist();render();inform('Sipariş garson onayına gönderildi.');
 }catch(err){
  const transient=!navigator.onLine||/fetch|network|timeout|bağlantı|connection|Failed to fetch/i.test(String(err.message));
  if(!transient)pendingSubmit=null;
  render();
  const area=$('#ob-order-error');
  if(area)area.textContent=err.message+(transient?' · İnternet geri geldiğinde aynı sipariş güvenle yeniden denenir.':'');
  persist();
 }finally{
  working=false;
  const currentBtn=$('[data-ob-submit]');if(currentBtn)currentBtn.disabled=false;
 }
}
async function check(){
 if(!last||Date.now()-lastCheckAt<3000)return;
 lastCheckAt=Date.now();
 try{
  const d=await rpc('ob_customer_order_status',{
   p_venue_id:last.venue,p_order_id:last.id,p_token:last.token
  });
  if(d?.found){last={...last,...d};persist();render()}
 }catch(err){console.warn('QR sipariş durumu:',err)}
}
function addProduct(id,button){
 if(pendingSubmit){inform('Bekleyen siparişin sonucunu kontrol edin.');return}
 if(last){setSheet(true);inform('Yeni sipariş için önce Yeni sipariş düğmesini kullanın.');return}
 const item=menuItems().find(x=>String(x.id)===String(id));
 if(!item){inform('Ürün şu anda siparişe açık değil.');return}
 const row=button?.closest('.menu-row');
 const selector=row?.querySelector('[data-ob-menu-variant]');
 const variantId=selector?.value||null;
 const variants=Array.isArray(item.variants)?item.variants:[];
 const variant=variants.find(x=>String(x.id)===String(variantId));
 if(variants.length&&!variantId&&!(Number(item.price)>0)){
  inform('Önce '+item.name+' için bir seçenek seçin.');
  selector?.focus();return;
 }
 if(variantId&&!variant){inform('Seçenek güncel değil, menüyü yenileyin.');return}
 const price=Number(variant?.price??item.price);
 if(!Number.isFinite(price)||price<0){inform('Bu ürünün fiyatı güncel değil.');return}
 const prior=cart.find(x=>String(x.id)===String(id)&&String(x.variant_id||'')===String(variantId||''));
 if(prior){
  if(prior.quantity>=20){inform('Tek bir seçenekten en fazla 20 adet eklenebilir.');return}
  prior.quantity++;
 }else{
  if(cart.length>=12){inform('Bir siparişte en fazla 12 ayrı ürün/seçenek olabilir.');return}
  cart.push({id:String(id),variant_id:variantId,quantity:1,
   name:item.name+(variant?' / '+variant.name:''),price});
 }
 persist();render();
 inform(item.name+' sepete eklendi. Toplam '+cartCount()+' ürün.');
 if(button){
  button.classList.add('just-added');
  button.textContent='✓ Eklendi';
  setTimeout(()=>{if(button.isConnected){button.classList.remove('just-added');button.textContent='+ Ekle'}},700);
 }
}
function updateQty(idx,delta){
 if(pendingSubmit)return;
 const item=cart[idx];if(!item)return;
 item.quantity=Math.min(20,item.quantity+delta);
 if(item.quantity<=0)cart.splice(idx,1);
 persist();render();
}
window.addEventListener('online',()=>{if(pendingSubmit&&!working&&current()?.venue?.id===venueId)submit(true)});
document.addEventListener('input',e=>{
 if(e.target.id==='ob-order-note')customerNote=e.target.value;
 else if(e.target.id==='ob-order-table-code')tableCode=e.target.value;
 else return;persist();
});
document.addEventListener('change',e=>{
 if(e.target.id==='ob-order-table'){selectedTable=e.target.value;persist()}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&sheetOpen){e.preventDefault();e.stopPropagation();setSheet(false)}
},true);
document.addEventListener('click',async e=>{
 const button=e.target.closest?.(
  '[data-ob-cart-jump],[data-ob-cart-close],[data-ob-menu-add],[data-ob-add],'+
  '[data-ob-qty-minus],[data-ob-qty-plus],[data-ob-submit],'+
  '[data-ob-order-refresh],[data-ob-order-new]');
 if(!button)return;
 if(!$('#modal')?.classList.contains('menu-full'))return;
 e.preventDefault();
 if(button.hasAttribute('data-ob-menu-add')||button.hasAttribute('data-ob-add')){
  addProduct(button.dataset.obMenuAdd||button.dataset.obAdd,button);return;
 }
 if(button.hasAttribute('data-ob-cart-jump')){setSheet(true);return}
 if(button.hasAttribute('data-ob-cart-close')){setSheet(false);return}
 if(button.hasAttribute('data-ob-qty-minus')){updateQty(Number(button.dataset.obQtyMinus),-1);return}
 if(button.hasAttribute('data-ob-qty-plus')){updateQty(Number(button.dataset.obQtyPlus),1);return}
 if(button.hasAttribute('data-ob-submit')){await submit();return}
 if(button.hasAttribute('data-ob-order-refresh')){await check();return}
 if(button.hasAttribute('data-ob-order-new')){last=null;lastCheckAt=0;persist();render();setSheet(false)}
});
setInterval(()=>{
 if(last&&current()?.venue?.id===venueId&&document.visibilityState==='visible')check();
 if(pendingSubmit&&navigator.onLine&&!working&&document.visibilityState==='visible')submit(true);
},9000);
window.OynaBakCustomerOrders=Object.freeze({start,check});
})();