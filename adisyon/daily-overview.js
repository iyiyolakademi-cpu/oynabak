(() => {
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const summary=[['qr','QR açılışı','qr-code'],['games','Oyun başlangıcı','gamepad'],['menu','Menü görüntüleme','utensils'],['waiter','Garson çağrısı','bell'],['order_requests','QR siparişi','receipt'],['pending_orders','Onay bekleyen sipariş','clock'],['pending_waiter','Bekleyen çağrı','alert']];
let busy=false,renderedVenue='',period=1;
async function load(days=1){
 const node=$('#ob-venue-overview'),ctx=window.OynaBakAdisyonBridge?.context();
 if(!node||!ctx?.db||!ctx?.me?.venue?.id)return;
 const vid=String(ctx.me.venue.id);
 if(busy)return;
 busy=true;period=days;
 const buttons=[...node.querySelectorAll('[data-ob-summary-days]')];
 buttons.forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.obSummaryDays)===days));b.disabled=true});
 const status=$('#ob-overview-status',node);
 if(status)status.textContent='Veriler güncelleniyor…';
 try{
  const {data,error}=await ctx.db.rpc('ob_ops_daily_summary',{p_venue_id:vid,p_days:days});
  if(error)throw error;
  if(!node.isConnected||renderedVenue!==vid)return;
  const view=$('#ob-overview-cards',node);
  if(view)view.innerHTML=summary.map(([key,label])=>'<article class="ob-overview-card"><span>'+esc(label)+'</span><strong>'+Number(data?.[key]||0).toLocaleString('tr-TR')+'</strong></article>').join('');
  if(status)status.textContent='Sipariş ve garson çağrıları tahsilat değildir. Veriler işletme saat dilimine göre hesaplanır.';
 }catch(err){
  if(status)status.textContent='Özet alınamadı: '+(err?.message||'Bağlantı sorunu')+'. Yeniden deneyin.';
 }finally{
  busy=false;
  buttons.forEach(b=>{b.disabled=false;b.setAttribute('aria-pressed',String(Number(b.dataset.obSummaryDays)===period))});
 }
}
function mount(){
 if(location.hash!=='#panel')return;
 const ctx=window.OynaBakAdisyonBridge?.context(),grid=$('.merchant-control-grid');
 if(!grid||ctx?.me?.role!=='merchant'||!ctx.me?.venue?.id)return;
 const id=String(ctx.me.venue.id);
 if($('#ob-venue-overview'))return;
 renderedVenue=id;
 const section=document.createElement('section');
 section.id='ob-venue-overview';
 section.className='ob-overview';
 section.setAttribute('aria-label','İşletme kullanım özeti');
 section.innerHTML='<div class="ob-overview-header"><div><small>İŞLETME ÖZETİ</small><h3>İşletmende neler oluyor?</h3></div><div class="ob-overview-period"><button type="button" data-ob-summary-days="1" aria-pressed="true">Bugün</button><button type="button" data-ob-summary-days="7" aria-pressed="false">7 gün</button><button type="button" data-ob-summary-days="30" aria-pressed="false">30 gün</button></div></div><div id="ob-overview-cards" class="ob-overview-cards" aria-live="polite"></div><p id="ob-overview-status" class="muted">Veriler yükleniyor…</p>';
 grid.parentNode.insertBefore(section,grid);
 load(period);
}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-ob-summary-days]');if(b){e.preventDefault();load(Number(b.dataset.obSummaryDays))}});
const app=$('#app');
if(app)new MutationObserver(()=>queueMicrotask(mount)).observe(app,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
