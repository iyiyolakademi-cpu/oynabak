/* OynaBak finance opt-in bridge: merchant/admin authenticated panel only. */
(()=>{'use strict';
let busy=false,checkKey='',financeMap={}, merchantAllowed=false, lastPanel='', ready=false;
const $=s=>document.querySelector(s);
function panel(){return $('#panelBody')||$('.merchant-control-grid')}
async function rpc(name,args={}){const c=window.obFinanceDb;if(!c)throw Error('Oturum bekleniyor');const {data,error}=await c.rpc(name,args);if(error)throw Error(error.message);return data}
function message(x){if(typeof toast==='function')toast(x);else alert(x)}
async function update(){
 const el=panel();if(!el||busy)return;
 const merchant=el.classList.contains('merchant-control-grid');
 const marker=merchant?'merchant':'admin';
 if(checkKey===marker&&ready&&el.querySelector('[data-ob-finance]'))return;
 busy=true;
 try{
   if(merchant){
     const v=window.obFinanceVenue?.();if(!v?.id){return;}
     const state=await rpc('ob_finance_status',{p_venue:v.id});
     merchantAllowed=state?.allowed===true&&state?.enabled===true;
     if(!merchantAllowed)return;
     if(!el.querySelector('[data-ob-finance]'))el.insertAdjacentHTML('beforeend',
       '<button class="merchant-control-card" data-ob-finance="open"><span>07</span><b>💼 Ön Muhasebe</b><small>Kasa, gider, cari hesap, stok ve ödemeler</small></button>');
   }else{
     financeMap=await rpc('ob_finance_admin_list');
     for(const venue of (window.obFinanceVenues?.()||[])){
       const btn=el.querySelector('[data-action="venue-edit"][data-id="'+venue.id+'"]');
       const card=btn?.closest('.card');if(!card||card.querySelector('[data-ob-finance]'))continue;
       const b=document.createElement('button');b.type='button';b.className='btn small light';b.dataset.obFinance='toggle';b.dataset.venue=venue.id;
       b.textContent=financeMap[venue.id]?'Muhasebe: Açık':'Muhasebe: Kapalı';btn.parentElement.appendChild(b);
     }
   }
   checkKey=marker;ready=true;
 }catch(e){console.warn('Finance bridge:',e.message)}finally{busy=false}
}
async function click(e){
 const b=e.target.closest('[data-ob-finance]');if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(b.dataset.obFinance==='toggle'){
   const vid=b.dataset.venue;const enabled=financeMap[vid]===true;
   if(!confirm('Bu işletme için Ön Muhasebe '+(enabled?'kapatılsın':'açılsın')+' mı?'))return;
   b.disabled=true;
   try{await rpc('ob_finance_admin_set',{p_venue:vid,p_enabled:!enabled});financeMap[vid]=!enabled;
     b.textContent=enabled?'Muhasebe: Kapalı':'Muhasebe: Açık';message('İşletme muhasebe yetkisi güncellendi.')}
   catch(err){message(err.message)}finally{b.disabled=false}return;
 }
 if(b.dataset.obFinance==='open'){
  if(!merchantAllowed)return;
  const v=window.obFinanceVenue?.();if(!v?.id)return;
  try{await window.OynaBakFinance.open(window.obFinanceDb,v.id)}
  catch(err){message(err.message)}
 }
}
document.addEventListener('click',click,true);
const observer=new MutationObserver(()=>{if(!location.hash.includes('panel'))return;if(!panel())return;clearTimeout(observer._t);observer._t=setTimeout(update,180)});
observer.observe(document.documentElement,{childList:true,subtree:true});
addEventListener('hashchange',()=>{checkKey='';ready=false});
window.obFinanceRefresh=()=>{ready=false;checkKey='';update()};
})();