/* Compact, read-only table tiles for the authenticated OynaBak operation screen.
   All actions still use the existing server-checked adisyon handlers. */
(()=>{
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);
function render({state,total,money}){
 const count=Math.max(1,Math.min(200,Math.trunc(Number(state.count)||1)));
 const tickets=Array.isArray(state.tickets)?state.tickets:[];
 const items=Array.isArray(state.items)?state.items:[];
 const calls=Array.isArray(state.calls)?state.calls:[];
 const requests=Array.isArray(state.requests)?state.requests:[];
 const opened=new Map(tickets.filter(t=>t.status==='open').map(t=>[Number(t.table_no),t]));
 const calling=new Set(calls.map(c=>Number(c.table_no)));
 const ordering=new Set(requests.map(r=>Number(r.table_no)));
 const readyIds=new Set(items.filter(i=>i.status==='ready').map(i=>i.ticket_id));
 let html='<section class="ob-mobile-tables" aria-label="İşletme masaları">'+
  '<header class="ob-mobile-table-heading"><div><small>İŞLETME MASALARI</small><h3>Masalar</h3><p>İşlem yapmak için masaya dokun.</p></div>'+
  '<span class="ob-mobile-table-count">'+count+' masa</span></header>';
 if(state.lastError)html+='<p class="ob-mobile-data-warning" role="status">⚠ Son güncelleme başarısız. Veriler güncel olmayabilir: '+esc(state.lastError)+'</p>';
 html+='<div class="ob-mobile-table-summary" aria-label="Masa durumları">'+
  '<span><b>'+opened.size+'</b> Dolu</span><span><b>'+(count-opened.size)+'</b> Boş</span>'+
  '<span class="urgent"><b>'+requests.length+'</b> QR</span>'+
  '<span class="urgent"><b>'+calls.length+'</b> Çağrı</span></div>'+
  '<div class="ob-mobile-table-grid" role="group" aria-label="Masalardan birini seç">';
 for(let n=1;n<=count;n++){
  const ticket=opened.get(n),hasCall=calling.has(n),hasOrder=ordering.has(n);
  const hasReady=Boolean(ticket&&readyIds.has(ticket.id));
  const variant=hasCall?'call':hasOrder?'order':hasReady?'ready':ticket?'occupied':'empty';
  const label=hasCall?'Garson çağrısı':hasOrder?'QR onayı':hasReady?'Servis hazır':ticket?'Dolu':'Boş';
  html+='<button type="button" class="ob-mobile-table ob-mobile-table--'+variant+'" data-ob-table="'+n+'"'+
   ' aria-label="Masa '+n+', '+label+'. Adisyonu aç">'+
   '<span class="ob-mobile-table-dot" aria-hidden="true"></span>'+
   '<span class="ob-mobile-table-word">MASA</span>'+
   '<strong>'+n+'</strong>'+
   '<small>'+label+'</small>'+
   (ticket?'<em>'+esc(money(total(ticket.id)))+'</em>':'')+'</button>';
 }
 html+='</div><p class="ob-mobile-grid-hint">Yeşil dolu · Turuncu QR onayı · Kırmızı garson çağrısı · Mavi servis hazır</p></section>';
 return html;
}
window.OynaBakMobileTables=Object.freeze({render});
})();