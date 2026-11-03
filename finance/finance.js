/* OynaBak optional finance panel. This module is not loaded by production index.html. */
(function(){
'use strict';
const sections=['Genel Bakış','Gelir / Gider','Kasa / POS / Banka','Cari Hesaplar','Ödeme Takvimi','Stok','Personel Ödemeleri','Gün Sonu'];
const tables=['ob_finance_entries','ob_finance_accounts','ob_finance_contacts','ob_finance_schedule','ob_finance_stock','ob_finance_payroll','ob_finance_closings'];
const fmt=new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let session=null;
function root(){return document.querySelector('#oynabak-finance-root')}
function sum(a){return a.reduce((v,x)=>v+Number(x.amount||0),0)}
function render(){
 const s=session,d=s.data,entries=d[0].filter(x=>!x.voided_at),inc=sum(entries.filter(x=>x.kind==='income')),out=sum(entries.filter(x=>x.kind==='expense'));
 const tabs=sections.map((x,i)=>'<button data-fin-tab="'+i+'" class="'+(s.tab===i?'selected':'')+'">'+x+'</button>').join('');
 let body='';
 if(s.tab===0)body='<div class="fin-stats"><article><small>Toplam gelir</small><h2>'+fmt.format(inc)+'</h2></article><article><small>Toplam gider</small><h2>'+fmt.format(out)+'</h2></article><article><small>Gelir − gider</small><h2>'+fmt.format(inc-out)+'</h2></article></div>';
 const map=[0,0,1,2,3,4,5,6],table=d[map[s.tab]];
 if(s.tab>0){
  body='<div class="fin-toolbar">'+(s.write?'<button data-fin-new>+ Yeni kayıt</button>':'<span>Salt okunur erişim</span>')+'</div>';
  body+='<section class="fin-list">'+(table.length?table.map(x=>'<div class="fin-row"><b>'+esc(x.name||x.title||x.category||x.staff_name||x.closing_date||x.kind)+'</b><span>'+esc(x.amount==null?(x.quantity??x.kind):fmt.format(x.amount))+'</span></div>').join(''):'Henüz kayıt bulunmuyor.')+'</section>';
 }
 root().innerHTML='<div class="fin-page"><header><div><small>OYNABAK / İŞLETME</small><h1>Ön Muhasebe</h1></div><button data-fin-close>Panele dön ×</button></header><nav>'+tabs+'</nav><main>'+body+'</main></div>';
 root().querySelector('[data-fin-close]').onclick=close;
 root().querySelectorAll('[data-fin-tab]').forEach(b=>b.onclick=()=>{s.tab=Number(b.dataset.finTab);render()});
 const add=root().querySelector('[data-fin-new]');if(add)add.onclick=()=>newRecord();
}
function input(label,name,type='text'){return '<label>'+label+'<input name="'+name+'" type="'+type+'" required></label>'}
function newRecord(){
 const s=session,i=s.tab,forms={
 1:input('Tür (income / expense)','kind')+input('Kategori','category')+input('Tutar','amount','number')+input('Hesap kimliği','account_id'),
 2:input('Adı','name')+input('Tür (cash / pos / bank)','kind')+input('Açılış bakiyesi','opening_balance','number'),
 3:input('Adı','name')+input('Tür (customer / supplier)','kind'),
 4:input('Ödeme adı','title')+input('Tutar','amount','number')+input('Vade','due_on','date'),
 5:input('Ürün','name')+input('Birim','unit')+input('Miktar','quantity','number')+input('Kritik seviye','critical_level','number'),
 6:input('Personel','staff_name')+input('Tür (salary / advance / other)','kind')+input('Tutar','amount','number'),
 7:input('Kapanış tarihi','closing_date','date')+input('Sayılan nakit','counted_cash','number')};
 const d=document.createElement('dialog');d.className='fin-dialog';d.innerHTML='<form><h3>Yeni kayıt</h3>'+forms[i]+'<p>Finansal kayıtlar yalnızca bu işletmeye aittir.</p><button type="button" data-no>Vazgeç</button><button>Kaydet</button><p role="alert"></p></form>';document.body.appendChild(d);d.querySelector('[data-no]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());
 d.querySelector('form').onsubmit=async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target));v.venue_id=s.venue;
 for(const k of ['amount','opening_balance','quantity','critical_level','counted_cash'])if(k in v)v[k]=Number(v[k]);
 if(i===1){v.occurred_on=new Date().toISOString().slice(0,10);if(!['income','expense'].includes(v.kind))return d.querySelector('[role=alert]').textContent='Gelir veya gider seçin.'}
 if(i===7){v.expected_cash=0;return d.querySelector('[role=alert]').textContent='Gün sonu için nakit hesaplaması tamamlanmadan kaydetme kapalı.'}
 const {error}=await s.db.from(tables[i===1?0:i-1]).insert(v);
 if(error)return d.querySelector('[role=alert]').textContent=error.message;
 d.close();await reload();
 };d.showModal();
}
async function reload(){const s=session;const rs=await Promise.all(tables.map(x=>s.db.from(x).select('*').eq('venue_id',s.venue).limit(500)));const err=rs.find(x=>x.error);if(err)throw Error(err.error.message);s.data=rs.map(x=>x.data||[]);render()}
function style(){if(document.querySelector('#oynabak-finance-style'))return;const st=document.createElement('style');st.id='oynabak-finance-style';st.textContent='.fin-page{font-family:system-ui;background:#f7f8fc;color:#182230;min-height:100vh;padding:28px;box-sizing:border-box}.fin-page header{display:flex;justify-content:space-between;align-items:center}.fin-page header small{letter-spacing:2px;color:#667085}.fin-page nav{display:flex;gap:8px;overflow:auto;margin:25px 0}.fin-page button,.fin-dialog button{background:white;border:1px solid #e3e7ee;border-radius:12px;padding:12px;cursor:pointer;white-space:nowrap}.fin-page nav button.selected,.fin-toolbar button,.fin-dialog button:last-of-type{background:#ff6a00;color:white}.fin-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}.fin-stats article,.fin-list{background:white;padding:25px;border:1px solid #edf0f4;border-radius:17px}.fin-stats small{color:#667085}.fin-toolbar{margin-bottom:16px}.fin-row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:14px}.fin-dialog{border:0;border-radius:16px;padding:24px;width:min(430px,94vw)}.fin-dialog label{display:block;margin:12px 0}.fin-dialog input{display:block;width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box}';document.head.appendChild(st)}
function close(){root()?.remove();session=null}
async function open(db,venue){
 if(!db||!venue)throw Error('İşletme oturumu gerekli');
 const {data:a,error:e}=await db.from('ob_finance_access').select('enabled').eq('venue_id',venue).maybeSingle();
 if(e||!a?.enabled)throw Error('Ön Muhasebe bu işletmede aktif değil');
 const {data:m,error:me}=await db.from('ob_finance_members').select('role').eq('venue_id',venue).maybeSingle();
 if(me||!m)throw Error('Ön Muhasebe erişim izni bulunamadı');
 session={db,venue,write:['owner','editor'].includes(m.role),tab:0,data:[]};
 style();const div=document.createElement('div');div.id='oynabak-finance-root';div.style='position:fixed;inset:0;z-index:99999;overflow:auto;background:#f7f8fc';document.body.appendChild(div);
 try{await reload()}catch(err){close();throw err}
}
window.OynaBakFinance=Object.freeze({open,close});
})();