/* Fast, mobile-first table list. Never modifies persisted floor positions or QR identities.
   Status, totals and permissions always come from authenticated adisyon snapshots. */
(()=>{
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);
function data({state,total,money}){
 const count=Math.max(1,Math.min(200,Math.trunc(Number(state.count)||1)));
 const tickets=Array.isArray(state.tickets)?state.tickets:[];
 const items=Array.isArray(state.items)?state.items:[];
 const calls=Array.isArray(state.calls)?state.calls:[];
 const requests=Array.isArray(state.requests)?state.requests:[];
 const opened=new Map(tickets.filter(t=>t.status==='open').map(t=>[Number(t.table_no),t]));
 const calling=new Set(calls.map(c=>Number(c.table_no)));
 const ordering=new Set(requests.map(r=>Number(r.table_no)));
 const readyIds=new Set(items.filter(i=>i.status==='ready').map(i=>i.ticket_id));
 const newIds=new Set(items.filter(i=>i.status==='new').map(i=>i.ticket_id));
 let due=0;for(const t of opened.values())due+=Number(total(t.id))||0;
 const tables=Array.from({length:count},(_,j)=>{
  const n=j+1,ticket=opened.get(n),hasCall=calling.has(n),hasOrder=ordering.has(n);
  const hasReady=Boolean(ticket&&readyIds.has(ticket.id));
  const hasNew=Boolean(ticket&&newIds.has(ticket.id));
  const variant=hasCall?'call':hasOrder?'order':hasReady?'ready':ticket?'occupied':'empty';
  const label=hasCall?'Garson çağrısı':hasOrder?'Onay bekliyor':hasReady?'Servise hazır':hasNew?'Hazırlanacak':ticket?'Dolu':'Boş';
  const quantity=ticket?items.filter(i=>i.ticket_id===ticket.id&&i.status!=='void').reduce((sum,i)=>sum+(Number(i.quantity)||0),0):0;
  return {n,ticket,hasCall,hasOrder,hasReady,hasNew,variant,label,quantity,
    price:ticket?money(total(ticket.id)):'',urgent:hasCall||hasOrder||hasReady};
 });
 return {count,tables,opened:opened.size,empty:count-opened.size,requests:requests.length,
  calls:calls.length,due:money(due)};
}
function applyFilters(root,search,filter){
 if(!root)return 0;
 const query=String(search||'').trim().toLocaleLowerCase('tr-TR');
 const mode=['all','occupied','empty','urgent'].includes(filter)?filter:'all';
 let shown=0;
 root.querySelectorAll('[data-ob-mobile-table-card]').forEach(card=>{
  const matchSearch=!query||String(card.dataset.tableNo||'').includes(query)||
   ('masa '+card.dataset.tableNo).includes(query);
  const matchFilter=mode==='all'||mode==='occupied'&&card.dataset.occupied==='true'||
   mode==='empty'&&card.dataset.occupied==='false'||mode==='urgent'&&card.dataset.urgent==='true';
  card.hidden=!(matchSearch&&matchFilter);
  if(!card.hidden)shown++;
 });
 const count=root.querySelector('[data-ob-mobile-results]');
 if(count)count.textContent=shown+' masa gösteriliyor';
 const empty=root.querySelector('[data-ob-mobile-empty]');
 if(empty)empty.hidden=shown!==0;
 root.querySelectorAll('[data-ob-mobile-filter]').forEach(button=>{
  const active=button.dataset.obMobileFilter===mode;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
 });
 return shown;
}
function render({state,total,money}){
 const info=data({state,total,money});
 const currentFilter=['all','occupied','empty','urgent'].includes(state.mobileTableFilter)?
  state.mobileTableFilter:'all';
 const search=String(state.mobileTableSearch||'').slice(0,25);
 let html='<section class="ob-mobile-tables" aria-label="İşletme masaları">'+
  '<header class="ob-mobile-table-heading"><div><small>MASA YÖNETİMİ</small>'+
  '<h3>Masalar</h3><p>Bir masaya dokun, adisyonu aç.</p></div>'+
  '<span class="ob-mobile-table-count">'+info.count+' masa</span></header>';
 if(state.lastError)html+='<p class="ob-mobile-data-warning" role="status">⚠ Son güncelleme başarısız. Veriler güncel olmayabilir: '+esc(state.lastError)+'</p>';
 html+='<div class="ob-mobile-table-summary" aria-label="Masa durumları">'+
  '<span><b>'+info.opened+'</b> Açık</span>'+
  '<span><b>'+info.empty+'</b> Boş</span>'+
  '<span class="urgent"><b>'+info.requests+'</b> QR</span>'+
  '<span class="ob-mobile-sum"><b>'+esc(info.due)+'</b> Açık adisyon</span></div>'+
  '<label class="ob-mobile-table-search"><span aria-hidden="true">⌕</span><input type="search" '+
  'id="ob-mobile-table-search" autocomplete="off" inputmode="search" '+
  'placeholder="Masa numarası ara" aria-label="Masa numarası ara" value="'+esc(search)+'"></label>'+
  '<div class="ob-mobile-table-filters" role="group" aria-label="Masa filtreleri">'+
  [['all','Tümü'],['occupied','Dolu'],['empty','Boş'],['urgent','Dikkat isteyen']].map(([key,name])=>
   '<button type="button" class="ob-mobile-filter'+(currentFilter===key?' active':'')+'" '+
   'data-ob-mobile-filter="'+key+'" aria-pressed="'+(currentFilter===key)+'">'+name+'</button>').join('')+
  '</div><div class="ob-mobile-table-results" data-ob-mobile-results aria-live="polite">'+
  info.count+' masa gösteriliyor</div>'+
  '<div class="ob-mobile-table-grid" role="group" aria-label="Masalardan birini seç">';
 for(const x of info.tables){
  const badges=[];
  if(x.hasCall)badges.push('<span class="ob-mobile-tag call">🔔 Çağrı</span>');
  if(x.hasOrder)badges.push('<span class="ob-mobile-tag order">⏳ QR onayı</span>');
  if(x.hasReady)badges.push('<span class="ob-mobile-tag ready">✓ Hazır</span>');
  html+='<button type="button" class="ob-mobile-table ob-mobile-table--'+x.variant+'" '+
   'data-ob-mobile-table-card data-table-no="'+x.n+'" data-occupied="'+Boolean(x.ticket)+'" '+
   'data-urgent="'+x.urgent+'" data-ob-table="'+x.n+'" aria-label="Masa '+x.n+', '+x.label+
   (x.price?', '+esc(x.price):'')+'. Adisyonu aç">'+
   '<span class="ob-mobile-table-top"><b>Masa '+x.n+'</b><span class="ob-mobile-table-dot" aria-hidden="true"></span></span>'+
   '<span class="ob-mobile-table-mid"><span class="ob-mobile-table-state">'+x.label+'</span>'+
   '<strong class="ob-mobile-table-price">'+(x.price?esc(x.price):'Müsait')+'</strong></span>'+
   (badges.length?'<span class="ob-mobile-table-tags">'+badges.join('')+'</span>':
    x.quantity?'<span class="ob-mobile-table-detail">'+x.quantity+' ürün</span>':
    '<span class="ob-mobile-table-detail">Adisyonu aç <span aria-hidden="true">›</span></span>')+
   '</button>';
 }
 html+='</div><p class="ob-mobile-no-results" data-ob-mobile-empty hidden>Bu filtreye uygun masa bulunamadı.</p>'+
 '<p class="ob-mobile-grid-hint">Renkler: yeşil dolu · turuncu onay · kırmızı çağrı · mavi hazır</p></section>';
 return html;
}
window.OynaBakMobileTables=Object.freeze({render,applyFilters,data});
})();
