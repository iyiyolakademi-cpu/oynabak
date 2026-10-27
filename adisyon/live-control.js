/* OynaBak · Live business control center.
   Pure view only: all data/actions remain in the authenticated adisyon module.
   No new identity, QR or database permissions. */
(()=>{
'use strict';
const api={
 render({state,opened,kitchenItems,esc,money,when,floorBoard,total}){
  const pending=state.requests||[],calls=state.calls||[];
  const fresh=kitchenItems.filter(i=>i.status==='new');
  const preparing=kitchenItems.filter(i=>i.status==='preparing');
  const ready=kitchenItems.filter(i=>i.status==='ready');
  const metric=(label,value,accent,tab)=>'<button type="button" class="ob-control-metric '+accent+'" data-ob-tab="'+tab+'"><span>'+label+'</span><strong>'+value+'</strong><small>Görüntüle →</small></button>';
  const lastSync=state.lastSyncAt?new Date(state.lastSyncAt).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Bekleniyor';
  let html='<section class="ob-control-hero"><div><span class="ob-control-eyebrow">● OPERASYON PANOSU</span><h3>Canlı İşletme Kontrol Merkezi</h3><p>Masalar, QR siparişleri, garson çağrıları ve mutfak işleri tek ekranda.</p></div><div class="ob-control-updated"><span>Son başarılı yenileme</span><b>'+lastSync+'</b><button type="button" class="ob-btn" data-ob-refresh>↻ Şimdi yenile</button></div></section>';
  if(state.lastError)html+='<div class="ob-control-warning" role="status">⚠ Son yenilemede hata: '+esc(state.lastError)+'. Son alınabilen bilgiler gösteriliyor.</div>';
  else if(!navigator.onLine)html+='<div class="ob-control-warning" role="status">⚠ İnternet bağlantısı kesildi. Veriler güncel olmayabilir.</div>';
  html+='<div class="ob-control-metrics">'+
    metric('Açık masa',opened.length+' / '+state.count,'ob-control-occupied','tables')+
    metric('QR onayı',pending.length,'ob-control-urgent','requests')+
    metric('Garson çağrısı',calls.length,'ob-control-urgent','requests')+
    metric('Yeni mutfak / bar',fresh.length,'ob-control-warm','kitchen')+
    metric('Hazırlanıyor',preparing.length,'ob-control-blue','kitchen')+
    metric('Servis bekliyor',ready.length,'ob-control-ready','kitchen')+
    '</div>';
  html+='<div class="ob-control-columns"><section class="ob-card ob-control-queue"><div class="ob-control-card-head"><div><small>ÖNCELİKLİ İŞLEMLER</small><h3>Garson & QR siparişleri</h3></div><button class="ob-btn" data-ob-tab="requests">Tümünü gör</button></div>';
  if(!state.permission.review)html+='<p class="ob-empty">Bu hesap için sipariş onay yetkisi bulunmuyor.</p>';
  else if(!calls.length&&!pending.length)html+='<p class="ob-control-clear">✓ Bekleyen garson çağrısı veya QR siparişi yok.</p>';
  if(state.permission.review){
   for(const call of calls.slice(0,5)){
    const type=({waiter:'Garson çağrısı',bill:'Hesap isteği',water:'Su isteği',napkin:'Peçete isteği'})[call.request_type]||'Garson isteği';
    html+='<div class="ob-control-task"><div class="ob-control-task-icon">🔔</div><div class="ob-control-task-detail"><b>Masa '+esc(call.table_no)+' · '+esc(type)+'</b><small>'+when(call.created_at)+'</small></div><button class="ob-btn primary" data-ob-waiter-done="'+esc(call.id)+'">Tamamlandı</button></div>';
   }
   for(const order of pending.slice(0,5)){
    const products=(Array.isArray(order.items)?order.items:[]).map(i=>esc(i.quantity)+' × '+esc(i.name)+(i.variant_name?' / '+esc(i.variant_name):'')).join(', ');
    html+='<div class="ob-control-task"><div class="ob-control-task-icon">🧾</div><div class="ob-control-task-detail"><b>Masa '+esc(order.table_no)+' · '+money(order.total)+'</b><small>'+(products||'QR siparişi')+'</small>'+(order.customer_note?'<small>Not: '+esc(order.customer_note)+'</small>':'')+'</div><div class="ob-control-task-buttons"><button class="ob-btn primary" data-ob-request-approve="'+esc(order.id)+'">Onayla</button><button class="ob-btn danger" data-ob-request-reject="'+esc(order.id)+'">Reddet</button></div></div>';
   }
   if(calls.length>5||pending.length>5)html+='<p class="ob-muted">İlk 5 çağrı ve ilk 5 QR siparişi gösteriliyor. Tam liste Siparişler sekmesinde.</p>';
  }
  html+='</section><section class="ob-card ob-control-prep"><div class="ob-control-card-head"><div><small>ANLIK HAZIRLIK</small><h3>Mutfak / Bar</h3></div><button class="ob-btn" data-ob-tab="kitchen">Tümünü gör</button></div>';
  const priority={ready:0,new:1,preparing:2};
  const prioritized=kitchenItems.filter(i=>Object.hasOwn(priority,i.status)).sort((a,b)=>
   priority[a.status]-priority[b.status]||new Date(a.created_at)-new Date(b.created_at));
  if(!prioritized.length)html+='<p class="ob-control-clear">✓ Aktif hazırlık işi bulunmuyor.</p>';
  for(const item of prioritized.slice(0,8)){
   const ticket=opened.find(t=>t.id===item.ticket_id);
   const elapsed=Math.max(0,Math.floor((Date.now()-new Date(item.created_at).getTime())/60000))||0;
   const label={new:'Yeni',preparing:'Hazırlanıyor',ready:'Servise hazır'}[item.status];
   const next={new:'preparing',preparing:'ready',ready:'served'}[item.status];
   const nextLabel={new:'Hazırlamaya başla',preparing:'Hazır',ready:'Servis edildi'}[item.status];
   const canAct=item.status==='ready'?state.permission.review:state.permission.status&&state.staffRole!=='waiter'&&(!['kitchen','bar'].includes(state.staffRole)||item.station===state.staffRole);
   html+='<div class="ob-control-task"><span class="ob-control-status ob-is-'+esc(item.status)+'">'+label+'</span><div class="ob-control-task-detail"><b>Masa '+esc(ticket?.table_no??'?')+' · '+esc(item.quantity)+' × '+esc(item.name)+'</b><small>'+(item.station==='bar'?'Bar':'Mutfak')+' · '+elapsed+' dk'+(elapsed>=15?' · Gecikme':'')+'</small>'+(item.note?'<small>Not: '+esc(item.note)+'</small>':'')+'</div>'+(canAct?'<button class="ob-btn primary" data-ob-status="'+esc(item.id)+'" data-ob-next="'+next+'">'+nextLabel+'</button>':'')+'</div>';
  }
  if(prioritized.length>8)html+='<p class="ob-muted">İlk 8 ürün gösteriliyor. Tam liste Mutfak / Bar sekmesinde.</p>';
  html+='</section></div>';
  html+='<section class="ob-control-floor"><div class="ob-control-card-head"><div><small>MEKÂN PLANI</small><h3>Masaları canlı takip et</h3></div><div class="ob-control-legend"><span>● Boş</span><span>● Açık</span><span>● İşlem bekliyor</span></div></div>'+floorBoard()+'</section>';
  html+='<p class="ob-control-caption">Açık adisyon toplamı: <b>'+money(opened.reduce((n,t)=>n+total(t.id),0))+'</b> · Tahsilat veya gerçekleşmiş ciro değildir. Realtime bağlantısı kurulmazsa 15 saniyelik yedek sorgu kullanılır.</p>';
  return html;
 }
};
window.OynaBakLiveControl=Object.freeze(api);
})();