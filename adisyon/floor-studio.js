/* The large-venue floor is a view of the authenticated adisyon state.
   Never persists zoom or changes table numbering/QR codes. */
(()=>{
'use strict';
const g=()=>window.OynaBakFloorGeometry;
function render({state,active,total,money,floorStyle}){
 const positions=state.floorDraft.length===state.count?state.floorDraft:g().positions(state.count);
 const dimensions=g().dimensions(state.count),zoom=g().clampZoom(state.floorZoom);
 const editing=state.floorEditing,expanded=state.floorExpanded;
 const width=Math.round(dimensions.width*zoom),height=Math.round(dimensions.height*zoom),tile=Math.round(112*zoom);
 let html='<section class="ob-floor'+(expanded?' is-expanded':'')+'" aria-label="İşletme masa planı"><header class="ob-floor-header"><div><h3>İşletme masa düzeni</h3><p class="ob-muted">'+
  (editing?'Masaları parmağın veya fareyle sürükle. Değişiklikler yalnızca Kaydet ve onayla ile uygulanır.':
   'Masa durumlarını izle veya masaya dokunup adisyonu aç. Planda kaydırarak dolaşabilirsin.')+
  '</p></div><div class="ob-floor-actions">';
 if(state.canManage&&state.floorAvailable){
  html+=editing?
   '<button type="button" class="ob-btn" data-ob-floor-auto>↻ Otomatik diz</button><button type="button" class="ob-btn" data-ob-floor-cancel>Vazgeç</button><button type="button" class="ob-btn primary" data-ob-floor-confirm>✓ Kaydet ve onayla</button>':
   '<button type="button" class="ob-btn primary" data-ob-floor-edit>✥ Masaları düzenle</button>';
 }else if(!state.floorAvailable)html+='<span class="ob-muted">Plan yüklenemedi; ekranı yeniden açıp deneyin.</span>';
 html+='</div></header>';
 html+='<div class="ob-floor-toolbar"><div class="ob-floor-toolbar-group"><button type="button" class="ob-btn ob-floor-icon" data-ob-floor-zoom="minus" aria-label="Planı küçült"'+(zoom<=.1?' disabled':'')+'>−</button>'+
  '<span class="ob-floor-zoom-level" aria-label="Yakınlaştırma oranı">'+Math.round(zoom*100)+'%</span>'+
  '<button type="button" class="ob-btn ob-floor-icon" data-ob-floor-zoom="plus" aria-label="Planı büyüt"'+(zoom>=1.6?' disabled':'')+'>+</button>'+
  '<button type="button" class="ob-btn" data-ob-floor-zoom="fit">Tümünü sığdır</button>'+
  '<button type="button" class="ob-btn" data-ob-floor-zoom="reset">100%</button></div>'+
  '<div class="ob-floor-toolbar-group"><label for="ob-floor-select">Masa seç <select id="ob-floor-select" data-ob-floor-select>'+
  positions.map(p=>'<option value="'+p.table+'"'+(p.table===state.floorSelected?' selected':'')+'>Masa '+p.table+'</option>').join('')+
  '</select></label><button type="button" class="ob-btn" data-ob-floor-jump>Masaya git</button>'+
  '<button type="button" class="ob-btn primary" data-ob-floor-expand aria-pressed="'+(expanded?'true':'false')+'">'+(expanded?'✕ Tam ekrandan çık':'⛶ Tam ekran')+'</button></div></div>';
 if(editing)html+='<div class="ob-floor-edit-controls"><button type="button" class="ob-btn" data-ob-floor-toggle-shape>Seçilen masayı yuvarlak / kare yap</button><span class="ob-muted">Otomatik diz yalnızca taslak planı düzenler; kayıt için onay gerekir.</span></div>';
 html+='<div class="ob-floor-summary"><span><strong>'+state.count+' masa</strong></span><span>·</span><span>'+dimensions.columns+' sütun × '+dimensions.rows+' sıra</span><span>·</span><span>Yatay ve dikey kaydırılabilir</span></div>';
 html+='<div class="ob-floor-scroll" data-ob-floor-viewport tabindex="0" aria-label="Kaydırılabilir masa planı"><div class="ob-floor-canvas'+(zoom<.46?' is-mini':'')+(editing?' is-editing':'')+
  '" data-ob-floor-canvas style="width:'+width+'px;height:'+height+'px;--ob-floor-zoom:'+zoom+';--ob-floor-table-size:'+tile+'px">';
 html+='<div class="ob-floor-entrance">🚪 GİRİŞ</div>';
 const openByTable=new Map(state.tickets.filter(t=>t.status==='open').map(t=>[Number(t.table_no),t]));
 const calling=new Set(state.calls.map(c=>Number(c.table_no)));
 const ordering=new Set(state.requests.map(r=>Number(r.table_no)));
 const ready=new Set(state.items.filter(i=>i.status==='ready').map(i=>i.ticket_id));
 for(const pos of positions){
  const t=openByTable.get(pos.table),hasCall=calling.has(pos.table),hasRequest=ordering.has(pos.table),
   hasReady=!!t&&ready.has(t.id),status=t?'open':'';
  html+='<button type="button" class="ob-floor-table '+status+(pos.shape==='round'?' is-round':'')+(editing?' is-draggable':'')+
   (hasCall?' has-call':hasRequest?' has-request':hasReady?' has-ready':'')+
   '" style="'+floorStyle(pos)+'"'+(editing?' data-ob-floor-drag="'+pos.table+'"':' data-ob-table="'+pos.table+'"')+
   ' aria-label="Masa '+pos.table+(editing?' konumunu sürükleyerek değiştir':' adisyonunu aç')+'">'+
   '<b data-number="'+pos.table+'">Masa '+pos.table+'</b><small>'+(hasCall?'🔔 Garson çağrısı':hasRequest?'⏳ QR onayı':hasReady?'✓ Servis hazır':t?money(total(t.id)):'Boş')+'</small></button>';
 }
 html+='</div></div><p class="ob-floor-hint">'+(editing?
  'Düzeni değiştirmek için masayı sürükle; klavyede ok tuşlarıyla ince ayar yapabilirsin. Masaların üst üste gelmediğini kontrol ederek kaydet.':
  'Büyük mekânlarda Tam ekran ve yakınlaştırma kontrollerini kullan. Kaydetmediğin değişiklikler yayınlanmaz.')+'</p></section>';
 return html;
}
window.OynaBakFloorStudio=Object.freeze({render});
})();