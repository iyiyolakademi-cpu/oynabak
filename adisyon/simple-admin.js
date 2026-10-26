(()=>{'use strict';
const ctx=()=>window.OynaBakSimpleAdminBridge?.();
const $=(sel,root=document)=>root.querySelector(sel);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected=null,viewBusy=false;
async function rpc(fn,args={}){const db=ctx()?.db;if(!db)throw Error('Supabase bağlantısı bulunamadı');const {data,error}=await db.rpc(fn,args);if(error)throw Error(error.message);return data}
function mount(){
 if(location.hash!=='#panel'||ctx()?.me?.role!=='admin')return;
 document.querySelectorAll('.card [data-action="venue-edit"]').forEach(el=>{
  const card=el.closest('.card'),id=el.dataset.id;
  if(!card||!id||card.querySelector('[data-simple-admin]'))return;
  const line=document.createElement('div');
  line.className='ob-simple-admin-entry';
  line.innerHTML='<button class="btn small light" type="button" data-simple-admin="'+esc(id)+'">⚡ Hızlı Sipariş Ekranı</button>';
  card.appendChild(line);
 });
}
function showNote(text){const e=$('#ob-simple-admin-note');if(e){e.textContent=text;e.hidden=false}}
async function draw(vid){
 if(viewBusy)return;
 viewBusy=true;
 try{
  const all=await rpc('ob_simple_admin_overview'),v=(all||[]).find(x=>x.id===vid);
  if(!v)throw Error('İşletme bulunamadı');
  selected=vid;
  const devices=v.devices||[];
  const deviceCards=devices.length?devices.map(d=>{
   const expired=!d.approved&&Date.now()-new Date(d.requested_at).getTime()>1800000;
   const status=d.revoked?'İptal edildi':d.approved?'Onaylı cihaz':expired?'Süresi doldu':'Onay bekliyor';
   return '<article class="ob-simple-admin-device"><div><strong>İşletme ekranı cihazı</strong><p>'+status+' · '+new Date(d.requested_at).toLocaleString('tr-TR')+'</p></div>'+
   (!d.revoked?(d.approved||expired?'<button type="button" class="ob-simple-admin-danger" data-simple-device-action="revoke" data-simple-device-id="'+esc(d.id)+'">Erişimi iptal et</button>':'<div class="ob-simple-admin-group"><button type="button" data-simple-device-action="approve" data-simple-device-id="'+esc(d.id)+'" class="ob-simple-admin-positive">Onayla</button><button type="button" data-simple-device-action="revoke" data-simple-device-id="'+esc(d.id)+'" class="ob-simple-admin-danger">Reddet</button></div>'):'')+'</article>';
  }).join(''):'<p>Bu işletme için henüz cihaz erişim isteği yok.</p>';
  const el=$('#ob-simple-admin');if(!el)return;
  el.innerHTML='<div class="ob-simple-admin-shell"><header><div><small>OYNABAK · İŞLETME YÖNETİMİ</small><h2>'+esc(v.name)+'</h2></div><button type="button" data-simple-admin-close>✕ Kapat</button></header>'+
   '<div class="ob-simple-admin-status"><div><strong>'+ (v.adisyon?'Adisyon açık':'Adisyon kapalı')+'</strong><span>Mevcut işletme paketi</span></div><div><strong>'+(v.simple?'Hızlı ekran açık':'Hızlı ekran kapalı')+'</strong><span>Sade sipariş ekranı</span></div><div><strong>'+devices.filter(x=>x.approved&&!x.revoked).length+'</strong><span>Yetkili cihaz</span></div></div>'+
   (v.simple?'<button type="button" class="ob-simple-admin-danger" data-simple-toggle="off">Bu işletmenin hızlı ekranını kapat</button>':
     '<p>Bu işletmede sade sipariş ekranını açmak için aşağıdaki ayarı kullan. Diğer işletmeler değişmez.</p>'+
     (!v.adisyon?'<label>Masa sayısı <input id="ob-simple-admin-tables" type="number" min="1" max="200" value="'+Math.max(1,Math.min(200,Number(v.tables)||1))+'"></label><p class="ob-simple-admin-muted">Bu işlem adisyon paketini de etkinleştirir. QR kodları yeniden basılmaz.</p>':'')+
     '<button type="button" class="ob-simple-admin-positive" data-simple-toggle="on">Bu işletme için hızlı ekranı aç</button>')+
   '<section><h3>Cihaz erişimi</h3><p>Çalışan, <a href="'+esc(location.origin+location.pathname+'#siparis-ekrani')+'" target="_blank" rel="noopener">oynabak.com/#siparis-ekrani</a> adresini açar ve cihazı için onay ister. E-posta, PIN veya kod girmez. Sen yalnızca buradan onaylarsın.</p>'+
   '<div class="ob-simple-admin-devices">'+deviceCards+'</div></section>'+
   '<p class="ob-simple-admin-muted">Cihaz kaybolursa erişimini buradan kapat. Cihaz silinip tarayıcı verileri temizlenirse yeniden onay gerekir.</p><p id="ob-simple-admin-note" role="alert" hidden></p></div>';
 }finally{viewBusy=false}
}
async function open(id){
 selected=id;
 if(!$('#ob-simple-admin')){const el=document.createElement('section');el.id='ob-simple-admin';document.body.appendChild(el)}
 $('#ob-simple-admin').innerHTML='<div class="ob-simple-admin-shell">İşletme bilgileri yükleniyor…</div>';
 await draw(id);
}
document.addEventListener('click',async e=>{
 const b=e.target.closest?.('[data-simple-admin],[data-simple-admin-close],[data-simple-toggle],[data-simple-device-action]');
 if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(b.hasAttribute('data-simple-admin-close')){$('#ob-simple-admin')?.remove();selected=null;return}
 if(ctx()?.me?.role!=='admin')return;
 b.disabled=true;
 try{
  if(b.dataset.simpleAdmin)await open(b.dataset.simpleAdmin);
  else if(b.dataset.simpleToggle){
   const on=b.dataset.simpleToggle==='on';
   const v=(await rpc('ob_simple_admin_overview')).find(x=>x.id===selected);
   if(!v)throw Error('İşletme bulunamadı');
   if(on&&!v.adisyon){
    const tables=Number($('#ob-simple-admin-tables')?.value||0);
    if(!Number.isInteger(tables)||tables<1||tables>200)throw Error('Masa sayısı 1–200 arasında olmalı');
    if(!confirm(v.name+' için adisyon da açılacak ('+tables+' masa). Devam edilsin mi?'))return;
    await rpc('ob_adisyon_set_enabled',{p_venue_id:selected,p_enabled:true,p_table_count:tables});
   }else if(!confirm(v.name+' için hızlı işletme ekranı '+(on?'açılsın':'kapatılsın')+' mı?'))return;
   await rpc('ob_simple_admin_toggle',{p_venue_id:selected,p_enabled:on});
   await draw(selected);
  }else if(b.dataset.simpleDeviceAction){
   const approve=b.dataset.simpleDeviceAction==='approve';
   if(!confirm(approve?'Bu cihaz siparişlere tam erişim kazansın mı?':'Bu cihazın erişimi iptal edilsin mi?'))return;
   await rpc('ob_simple_admin_device',{p_venue_id:selected,p_id:b.dataset.simpleDeviceId,p_action:approve?'approve':'revoke'});
   await draw(selected);
  }
 }catch(err){showNote(err.message||String(err))}
 finally{if(b.isConnected)b.disabled=false}
},true);
setInterval(mount,1600);
setInterval(()=>{if(selected&&$('#ob-simple-admin')&&!viewBusy&&!$('#ob-simple-admin').contains(document.activeElement))draw(selected).catch(console.warn)},7000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();