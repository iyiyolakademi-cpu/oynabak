(()=>{'use strict';
const current=()=>window.OynaBakCustomerBridge?.context();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(n||0));
let venueId='',config=null,cart=[],last=null,working=false;
const $=(q,r=document)=>r.querySelector(q);
async function rpc(name,args){const db=current()?.db;if(!db)throw Error('Bağlantı kurulamadı');const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message||'Sunucu hatası');return data}
function render(){
 const panel=$('#ob-qr-order');if(!panel)return;
 if(last){panel.innerHTML='<h3>Siparişiniz</h3><p>Masa '+last.table_no+' · '+money(last.total)+'</p><strong>'+({pending:'Garson onayı bekleniyor',approved:'Onaylandı, hazırlığa alındı',rejected:'Garson tarafından reddedildi'}[last.status]||last.status)+'</strong>'+(last.reject_reason?'<p>'+esc(last.reject_reason)+'</p>':'')+'<p class="muted">Ödeme bu uygulamadan alınmaz.</p><button type="button" data-ob-order-new>Yeni sipariş</button><button type="button" data-ob-order-refresh>Durumu yenile</button>';return}
 const menu=current()?.venue?.menu;
 const items=(menu?.categories||[]).filter(c=>c.active).flatMap(c=>(c.items||[]).filter(i=>i.active&&!i.sold_out).map(i=>({...i,category:c.name})));
 const count=Number(config?.table_count)||0;
 panel.innerHTML='<h3>Masadan sipariş ver</h3><p>Ürünleri seçin. Siparişiniz garson onayına gönderilir. Online ödeme yok.</p><label>Masa numarası <select id="ob-order-table">'+Array.from({length:count},(_,i)=>'<option value="'+(i+1)+'">Masa '+(i+1)+'</option>').join('')+'</select></label><div class="ob-qr-products">'+items.map(i=>'<div class="ob-qr-line"><div><b>'+esc(i.name)+'</b><small>'+esc(i.category)+' · '+money(i.price)+'</small></div>'+(Array.isArray(i.variants)&&i.variants.length?'<select data-ob-variant="'+esc(i.id)+'"><option value="">Standart</option>'+i.variants.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+' · '+money(v.price)+'</option>').join('')+'</select>':'')+'<button data-ob-add="'+esc(i.id)+'" type="button">Ekle</button></div>').join('')+'</div><h4>Sepet ('+cart.reduce((n,x)=>n+x.quantity,0)+')</h4>'+cart.map((x,n)=>'<div class="ob-qr-line"><span>'+esc(x.name)+' · '+x.quantity+' × '+money(x.price)+'</span><button type="button" data-ob-remove="'+n+'">Çıkar</button></div>').join('')+'<p><strong>Toplam: '+money(cart.reduce((n,x)=>n+x.price*x.quantity,0))+'</strong></p><label>Not <textarea id="ob-order-note" maxlength="200" placeholder="Örneğin: az pişmiş"></textarea></label><button type="button" data-ob-submit '+(!cart.length?'disabled':'')+'>Garsona sipariş gönder</button><p id="ob-order-error" role="alert"></p>';
}
async function start(){
 const ctx=current();if(!ctx?.venue?.id||!ctx?.db)return;
 const id=String(ctx.venue.id);
 if(venueId!==id){venueId=id;cart=[];last=null;config=null}
 try{config=await rpc('ob_customer_order_config',{p_venue_id:id})}catch(e){console.warn('QR order config',e);return}
 if(!config?.enabled)return;
 const m=$('#modal');if(!m?.classList.contains('menu-full'))return;
 const body=m.querySelector('.dialog-body .menu-screen')||m.querySelector('.dialog-body');if(!body)return;
 let p=$('#ob-qr-order');if(!p){p=document.createElement('section');p.id='ob-qr-order';p.className='ob-qr-order';body.appendChild(p)}
 render();
}
async function submit(){
 if(working||!cart.length)return;working=true;
 const btn=$('[data-ob-submit]');if(btn)btn.disabled=true;
 const table=Number($('#ob-order-table')?.value||0),note=$('#ob-order-note')?.value||'';
 const requestKey=crypto.randomUUID();
 try{const data=await rpc('ob_customer_order_submit',{p_venue_id:venueId,p_table_no:table,p_items:cart.map(x=>({item_id:x.id,variant_id:x.variant_id,quantity:x.quantity})),p_note:note,p_request_key:requestKey});last={...data,venue:venueId};cart=[];render()}
 catch(e){const err=$('#ob-order-error');if(err)err.textContent=e.message}
 finally{working=false;if(btn&&btn.isConnected)btn.disabled=false}
}
async function check(){if(!last)return;try{const d=await rpc('ob_customer_order_status',{p_venue_id:last.venue,p_order_id:last.id,p_token:last.token});if(d?.found){last={...last,...d};render()}}catch(e){console.warn('QR order status',e)}}
document.addEventListener('click',async e=>{
 const add=e.target.closest('[data-ob-add]'),remove=e.target.closest('[data-ob-remove]'),send=e.target.closest('[data-ob-submit]'),fresh=e.target.closest('[data-ob-order-refresh]'),renew=e.target.closest('[data-ob-order-new]');
 if(add){const id=add.dataset.obAdd;const menu=current()?.venue?.menu;const all=(menu?.categories||[]).flatMap(c=>c.items||[]);const item=all.find(x=>String(x.id)===id);if(!item)return;const variantId=$('[data-ob-variant="'+CSS.escape(id)+'"]')?.value||null;const variant=(item.variants||[]).find(x=>String(x.id)===variantId);let row=cart.find(x=>x.id===id&&x.variant_id===variantId);if(row){row.quantity=Math.min(20,row.quantity+1)}else if(cart.length<12){cart.push({id,variant_id:variantId,quantity:1,name:item.name+(variant?' / '+variant.name:''),price:Number(variant?.price??item.price)})}const table=$('#ob-order-table')?.value;render();if(table)$('#ob-order-table').value=table;return}
 if(remove){cart.splice(Number(remove.dataset.obRemove),1);const table=$('#ob-order-table')?.value;render();if(table)$('#ob-order-table').value=table;return}
 if(send)await submit();if(fresh)await check();if(renew){last=null;render()}
});
window.OynaBakCustomerOrders=Object.freeze({start,check});
})();