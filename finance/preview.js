(()=>{'use strict';
const V='70abef21-053c-4026-b402-e18311f758d5',T={accounts:'ob_finance_accounts',entries:'ob_finance_entries',contacts:'ob_finance_contacts',schedule:'ob_finance_schedule',stock:'ob_finance_stock',payroll:'ob_finance_payroll',closings:'ob_finance_closings'};
const tabs=['Genel Bakış','İstatistikler','Gelir / Gider','Kasa / POS / Banka','Cari Defter','Ödeme Takvimi','Stok','Personel Ödemeleri','Gün Sonu','Yetkiler'];
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=v=>Number(v||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'});
let statRange='month';const entryLabels={income:'Gelir',expense:'Gider',transfer_in:'Gelen transfer',transfer_out:'Giden transfer',receivable:'Alacak',payable:'Borç',contact_received:'Alacak tahsilatı',contact_paid:'Borç ödemesi'};const typeLabel=x=>entryLabels[x]||x;const nodeDummy=0;
let state=null;const node=()=>document.getElementById('ob-finance-owner-preview');
const sum=(a,k)=>a.filter(x=>k.includes(x.kind)).reduce((v,x)=>v+Number(x.amount),0);
async function rpc(n,args){const r=await state.db.rpc(n,args);if(r.error)throw Error(r.error.message);return r.data}
async function read(){const keys=Object.keys(T);let result=await Promise.all(keys.map(k=>state.db.from(T[k]).select('*').eq('venue_id',V).limit(1000)));let err=result.find(x=>x.error);if(err)throw Error(err.error.message);state.data=Object.fromEntries(keys.map((x,i)=>[x,result[i].data||[]]));state.data.entries.sort((a,b)=>(b.occurred_on||'').localeCompare(a.occurred_on||''));if(state.role==='owner')try{state.people=await rpc('ob_finance_staff_list',{p_venue:V})}catch(_){state.people=[]}render()}
const records=()=>state.data.entries,acc=()=>state.data.accounts;
const balance=a=>Number(a.opening_balance)+sum(records().filter(x=>x.account_id===a.id),['income','transfer_in','contact_received'])-sum(records().filter(x=>x.account_id===a.id),['expense','transfer_out','contact_paid']);
const card=(l,v,kind='')=>'<article class="fcard '+e(kind)+'"><small>'+e(l)+'</small><strong>'+e(v)+'</strong></article>';
const row=(a,b,c,x='',kind='')=>'<div class="frow '+e(kind)+'"><div><b>'+e(a)+'</b><small>'+e(b)+'</small></div><strong>'+e(c)+'</strong>'+x+'</div>';
const blank=()=>'<p class="fempty">Henüz kayıt bulunmuyor.</p>';
const section=(h,c)=>'<section class="fpanel"><h3>'+e(h)+'</h3>'+c+'</section>';
const button=(type,label)=>'<button data-add="'+type+'">'+label+'</button>';
const ranges=[['day','Günlük'],['week','Haftalık'],['month','Aylık'],['year','Yıllık'],['all','Tüm zamanlar']];
function fromDate(){
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 if(statRange==='day')return start;
 if(statRange==='week'){start.setDate(start.getDate()-(start.getDay()+6)%7);return start;}
 if(statRange==='month'){start.setDate(1);return start;}
 if(statRange==='year')return new Date(start.getFullYear(),0,1);
 return new Date(0);
}
function stats(){
 const start=fromDate(),filtered=records().filter(x=>new Date(String(x.occurred_on||'').slice(0,10)+'T12:00:00')>=start);
 const totalIn=sum(filtered,['income']),totalOut=sum(filtered,['expense']),net=totalIn-totalOut;
 const days=new Map();
 filtered.filter(x=>['income','expense'].includes(x.kind)).forEach(x=>{let k=x.occurred_on||'',v=days.get(k)||{income:0,expense:0};v[x.kind]+=Number(x.amount||0);days.set(k,v)});
 const buckets=[...days.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
 const max=Math.max(1,...buckets.flatMap(x=>[x[1].income,x[1].expense]));
 return '<div class="franges">'+ranges.map(([key,label])=>'<button class="'+(statRange===key?'on':'')+'" data-range="'+key+'">'+label+'</button>').join('')+'</div>'+
 '<div class="fcards">'+card('Toplam gelir',fmt(totalIn),'f-income')+card('Toplam gider',fmt(totalOut),'f-expense')+card('Net gelir − gider',fmt(net),net>=0?'f-income':'f-expense')+card('Kayıt sayısı',String(filtered.length))+'</div>'+
 section('Gelir ve gider dağılımı',buckets.length?'<div class="fbarchart">'+buckets.map(([date,values])=>'<div class="fbarrow"><small>'+e(date.slice(5))+'</small><div class="fbars"><span class="fbarin" style="width:'+Math.max(0,values.income/max*100)+'%"></span><span class="fbarout" style="width:'+Math.max(0,values.expense/max*100)+'%"></span></div><strong>'+e(fmt(values.income-values.expense))+'</strong></div>').join('')+'</div>':blank())+
 section('Seçilen dönemin hareketleri',filtered.length?filtered.map(x=>row(typeLabel(x.kind)+' · '+(x.category||'Diğer'),x.occurred_on+' · '+(x.note||''),(x.kind==='income'?'+':x.kind==='expense'?'−':'')+fmt(x.amount),'',x.kind==='income'?'f-income':x.kind==='expense'?'f-expense':'')).join(''):blank());
}

const icons=['▦','◫','⇄','▣','◉','▤','◇','♙','✓','⚙'];
const moneyKinds={income:1,contact_received:1,transfer_in:1,expense:-1,contact_paid:-1,transfer_out:-1};
let searchText='',filterKind='all';
const typeOf=x=>x.kind in moneyKinds?(moneyKinds[x.kind]>0?'f-income':'f-expense'):'';
const statusName=x=>({planned:'Bekliyor',paid:'Ödendi',cancelled:'İptal',cash:'Nakit',pos:'POS',bank:'Banka',customer:'Müşteri',supplier:'Tedarikçi',monthly:'Her ay',none:'Tek seferlik',salary:'Maaş',advance:'Avans',other:'Diğer'}[x]||typeLabel(x));
const transactionList=(items)=>{
 const arr=items.filter(x=>(filterKind==='all'||(filterKind==='income'&&moneyKinds[x.kind]===1)||(filterKind==='expense'&&moneyKinds[x.kind]===-1))
 &&(x.category+' '+x.note+' '+typeLabel(x.kind)+' '+x.occurred_on).toLocaleLowerCase('tr').includes(searchText.toLocaleLowerCase('tr')));
 const tools='<div class="f-filters"><label class="f-search"><span>⌕</span><input id="f-search-input" aria-label="İşlemlerde ara" placeholder="İşlem veya açıklama ara…" value="'+e(searchText)+'"></label><select id="f-kind-filter" aria-label="İşlem türü filtresi">'+[['all','Tüm işlemler'],['income','Para girişleri'],['expense','Para çıkışları']].map(([k,v])=>'<option value="'+k+'" '+(filterKind===k?'selected':'')+'>'+v+'</option>').join('')+'</select></div>';
 return tools+(arr.length?arr.map(x=>row(typeLabel(x.kind)+' · '+(x.category||'Diğer'),x.occurred_on+' · '+(x.note||'Açıklama yok'),(moneyKinds[x.kind]===1?'+':moneyKinds[x.kind]===-1?'−':'')+fmt(x.amount),'<span class="f-type">'+e(typeLabel(x.kind))+'</span>',typeOf(x))).join(''):blank());
};
const chartFor=(items)=>{
 const groups=new Map();items.filter(x=>x.kind==='income'||x.kind==='expense').forEach(x=>{let key=(x.occurred_on||'').slice(0,7),g=groups.get(key)||{income:0,expense:0};g[x.kind]+=Number(x.amount);groups.set(key,g)});
 const a=[...groups.entries()].sort((x,y)=>x[0].localeCompare(y[0])).slice(-6);
 const max=Math.max(1,...a.flatMap(x=>[x[1].income,x[1].expense]));
 return '<div class="f-chart-head"><b>Gelir ve gider eğilimi</b><small>Son 6 kayıtlı ay</small></div><div class="f-chart">'+(a.length?a.map(([date,v])=>'<div class="f-chartcol"><div class="f-chartbars"><i class="f-income-bar" style="height:'+Math.max(2,100*v.income/max)+'%"></i><i class="f-expense-bar" style="height:'+Math.max(2,100*v.expense/max)+'%"></i></div><small>'+e(date.slice(5))+'</small></div>').join(''): '<div class="f-graph-empty">Grafik için gelir veya gider kaydı oluşturun.</div>')+'</div><div class="f-chart-legend"><span><i class="f-dotgreen"></i>Gelir</span><span><i class="f-dotred"></i>Gider</span></div>';
};

function body(){const d=state.data,ent=records();
switch(state.tab){
case 0:return '<div class="f-home-welcome"><div><span class="f-eyebrow">FİNANSAL DURUM</span><h2>İşletmenizi güvenle yönetin.</h2><p>Gelir, gider ve nakit akışını tek bakışta görün.</p></div><div class="f-home-date">'+new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'})+'</div></div>'+
 '<div class="fcards">'+card('Toplam gelir',fmt(sum(ent,['income'])),'f-income')+card('Toplam gider',fmt(sum(ent,['expense'])),'f-expense')+card('Net gelir − gider',fmt(sum(ent,['income'])-sum(ent,['expense'])),sum(ent,['income'])>=sum(ent,['expense'])?'f-income':'f-expense')+card('Nakit bakiyesi',fmt(d.accounts.filter(x=>x.kind==='cash').reduce((a,x)=>a+balance(x),0)))+'</div>'+
 '<div class="f-quick-actions"><button class="f-quick-income" data-add="income">＋ Gelir Ekle</button><button class="f-quick-expense" data-add="expense">－ Gider Ekle</button><button data-fin-goto="1">▤ İstatistiklere Git</button></div>'+
 '<div class="f-home-grid">'+section('Gelir-gider analizi',chartFor(ent))+section('Son finans hareketleri',ent.length?ent.slice(0,6).map(x=>row(typeLabel(x.kind)+' · '+(x.category||'Diğer'),x.occurred_on+' · '+(x.note||''),(moneyKinds[x.kind]===1?'+':moneyKinds[x.kind]===-1?'−':'')+fmt(x.amount),'',typeOf(x))).join(''):blank())+'</div>'; 
case 1:return stats();
case 2:return '<div class="f-quick-actions"><button class="f-quick-income" data-add="income">＋ Gelir Ekle</button><button class="f-quick-expense" data-add="expense">－ Gider Ekle</button><button data-add="transfer">↔ Hesaplar arası transfer</button></div>'+section('Finans hareketleri',transactionList(ent));
case 3:return button('account','+ Kasa / Banka ekle')+button('transfer','Para aktar')+section('Hesap bakiyeleri',d.accounts.length?d.accounts.map(x=>row(x.name,statusName(x.kind),fmt(balance(x)))).join(''):blank());
case 4:return button('contact','+ Cari oluştur')+button('debt','Borç / Alacak')+button('settle','Tahsilat / Ödeme')+section('Cariler',d.contacts.length?d.contacts.map(x=>{let r=ent.filter(y=>y.contact_id===x.id);return row(x.name,statusName(x.kind),'Alacak '+fmt(sum(r,['receivable'])-sum(r,['contact_received']))+' | Borç '+fmt(sum(r,['payable'])-sum(r,['contact_paid'])))}).join(''):blank());
case 5:return button('schedule','+ Ödeme planı')+section('Ödeme takvimi',d.schedule.length?d.schedule.slice().sort((a,b)=>a.due_on.localeCompare(b.due_on)).map(x=>row(x.title,x.due_on+' · '+statusName(x.recurrence),fmt(x.amount),x.status==='planned'?'<button data-pay="'+e(x.id)+'">Ödendi</button>':'<small>'+e(x.status)+'</small>')).join(''):blank());
case 6:return button('stock','+ Ürün ekle')+section('Stok durumu',d.stock.length?d.stock.map(x=>row(x.name,'Kritik: '+x.critical_level+' '+x.unit,x.quantity+' '+x.unit+(Number(x.quantity)<=Number(x.critical_level)?' ⚠':''),'<button data-stock="'+e(x.id)+'">Düzenle</button>')).join(''):blank());
case 7:return button('payroll','+ Maaş / Avans')+section('Personel ödemeleri',d.payroll.length?d.payroll.map(x=>row(x.staff_name,x.paid_on+' · '+statusName(x.kind),fmt(x.amount))).join(''):blank());
case 8:return button('closing','+ Gün sonu kapat')+section('Kapanışlar',d.closings.length?d.closings.map(x=>row(x.closing_date,'Beklenen '+fmt(x.expected_cash)+' · Sayılan '+fmt(x.counted_cash),'Fark '+fmt(x.counted_cash-x.expected_cash))).join(''):blank());
case 9:return section('Personel yetkileri',(state.people||[]).length?state.people.map(x=>row(x.name,'İşletme hesabı',statusName(x.role),'<button data-staff="'+e(x.user_id)+'">Değiştir</button>')).join(''):blank());
}}
function render(){const el=node();if(!el||!state)return;el.innerHTML='<div class="flayout"><aside><div class="f-logo-wrap"><img src="oynabak-logo.png" alt="OynaBak" class="flogo"></div><div class="fbrand">İyi Yol Akademi<small>FİNANS YÖNETİMİ</small></div><nav>'+tabs.map((x,i)=>'<button class="'+(i===state.tab?'on':'')+'" data-tab="'+i+'"><span class="f-nav-icon">'+icons[i]+'</span>'+e(x)+'</button>').join('')+'</nav></aside><main><header><div><small>OYNABAK FİNANS</small><h1>'+tabs[state.tab]+'</h1><p>İşletmenizin finansal kontrol merkezi</p></div><button data-close>Panele dön ✕</button></header><div id="fmessage" role="status"></div><div class="factions">'+body()+'</div></main></div>';
el.querySelector('[data-close]').onclick=close;el.querySelectorAll('[data-fin-goto]').forEach(b=>b.onclick=()=>{state.tab=Number(b.dataset.finGoto);render()});const si=el.querySelector('#f-search-input');if(si)si.oninput=ev=>{searchText=ev.target.value;const pos=ev.target.selectionStart;const target=el.querySelector('.fpanel');if(target){target.innerHTML='<h3>Finans hareketleri</h3>'+transactionList(records());const next=el.querySelector('#f-search-input');next.focus();next.setSelectionRange(pos,pos);next.oninput=si.oninput;next.onchange=si.onchange;const sel=el.querySelector('#f-kind-filter');sel.onchange=()=>{filterKind=sel.value;render()}}};const sf=el.querySelector('#f-kind-filter');if(sf)sf.onchange=()=>{filterKind=sf.value;render()};el.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{state.tab=Number(x.dataset.tab);render()});
el.querySelectorAll('[data-range]').forEach(x=>x.onclick=()=>{statRange=x.dataset.range;render()});el.querySelectorAll('[data-add]').forEach(x=>{x.disabled=state.role==='viewer'||(['payroll','closing'].includes(x.dataset.add)&&state.role!=='owner');x.onclick=()=>form(x.dataset.add)});
el.querySelectorAll('[data-pay]').forEach(x=>x.onclick=()=>pay(x.dataset.pay));el.querySelectorAll('[data-stock]').forEach(x=>x.onclick=()=>stock(x.dataset.stock));el.querySelectorAll('[data-staff]').forEach(x=>x.onclick=()=>staff(x.dataset.staff))}
function msg(x){let n=document.getElementById('fmessage');if(n)n.textContent=x}
const field=(n,type='text',value='',more='')=>'<label>'+n+'<input name="'+n+'" type="'+type+'" value="'+e(value)+'" '+more+' required></label>';
const choose=(n,v)=>'<label>'+n+'<select name="'+n+'">'+v.map(x=>'<option value="'+e(x[0])+'">'+e(x[1])+'</option>').join('')+'</select></label>';
const acopts=()=>acc().map(x=>[x.id,x.name]),copts=()=>state.data.contacts.map(x=>[x.id,x.name]);
const fieldLabels={"kind":"İşlem türü","amount":"Tutar (₺)","account_id":"Hesap","category":"Kategori","note":"Açıklama","occurred_on":"İşlem tarihi","name":"Ad / Ünvan","opening_balance":"Başlangıç bakiyesi","from":"Gönderen hesap","to":"Alıcı hesap","phone":"Telefon","contact_id":"Cari hesap","title":"Ödeme adı","due_on":"Ödeme tarihi","recurrence":"Tekrarlama","unit":"Birim","quantity":"Miktar","critical_level":"Kritik stok seviyesi","staff_name":"Personel adı","paid_on":"Ödeme günü","date":"Tarih","counted":"Sayılan nakit"};
const amount=()=>field('amount','number','','min="0.01" step="0.01"');
async function save(type,v){
 if(['entry','transfer','debt','settle','payroll','closing'].includes(type))return rpc('ob_finance_action',{p_venue:V,p_action:type,p:v});
 const table=type==='account'?'accounts':type==='contact'?'contacts':type==='schedule'?'schedule':'stock';
 let r=await state.db.from(T[table]).insert({...v,venue_id:V});if(r.error)throw Error(r.error.message);
}
function form(type){let html='',title=type;const preset=type==='income'?'income':type==='expense'?'expense':null;if(preset)type='entry';
switch(type){
case 'entry':html=choose('kind',[['income','Gelir'],['expense','Gider']])+amount()+choose('account_id',acopts())+field('category','text','Diğer')+field('note')+field('occurred_on','date',new Date().toISOString().slice(0,10));break;
case 'account':html=field('name')+choose('kind',[['cash','Nakit'],['pos','POS'],['bank','Banka']])+field('opening_balance','number','0','step="0.01"');break;
case 'transfer':html=choose('from',acopts())+choose('to',acopts())+amount()+field('note');break;
case 'contact':html=field('name')+choose('kind',[['customer','Müşteri'],['supplier','Tedarikçi']])+field('phone');break;
case 'debt':html=choose('contact_id',copts())+choose('kind',[['receivable','Alacak'],['payable','Borç']])+amount()+field('note');break;
case 'settle':html=choose('contact_id',copts())+choose('account_id',acopts())+choose('kind',[['contact_received','Tahsilat'],['contact_paid','Ödeme']])+amount()+field('note');break;
case 'schedule':html=field('title')+amount()+field('due_on','date',new Date().toISOString().slice(0,10))+choose('recurrence',[['none','Tek seferlik'],['monthly','Her ay']]);break;
case 'stock':html=field('name')+field('unit','text','adet')+field('quantity','number','0','step="0.001" min="0"')+field('critical_level','number','0','step="0.001" min="0"');break;
case 'payroll':html=field('staff_name')+choose('kind',[['salary','Maaş'],['advance','Avans'],['other','Diğer']])+amount()+field('paid_on','date',new Date().toISOString().slice(0,10));break;
case 'closing':html=field('date','date',new Date().toISOString().slice(0,10))+field('counted','number','0','min="0" step="0.01"')+field('note');break;}
if(preset)title=preset==='income'?'Gelir Ekle':'Gider Ekle';
html=html.replace(/<label>([a-z_]+)(?=<(?:input|select))/g,(_,key)=>'<label>'+e(fieldLabels[key]||key));
if(preset){html=html.replace('<select name="kind">','<select name="kind">');}const dlg=document.createElement('dialog');dlg.className='fdialog';dlg.innerHTML='<form><h2>Yeni kayıt: '+e(title)+'</h2>'+html+'<p role="alert"></p><button type="button" data-cancel>Vazgeç</button><button type="submit">Kaydet</button></form>';document.body.appendChild(dlg);if(preset){const t=dlg.querySelector('[name="kind"]');if(t){t.value=preset;t.closest('label').style.display='none';}}
dlg.querySelector('[data-cancel]').onclick=()=>dlg.close();dlg.addEventListener('close',()=>dlg.remove());
dlg.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let btn=dlg.querySelector('[type=submit]');btn.disabled=true;try{await save(type,Object.fromEntries(new FormData(ev.target)));dlg.close();await read();msg('Kayıt başarıyla oluşturuldu.')}catch(err){dlg.querySelector('[role=alert]').textContent=err.message}finally{btn.disabled=false}};dlg.showModal();}
async function pay(id){let a=acopts();if(!a.length)return msg('Önce bir hesap açın.');const selected=prompt('Ödeme yapılan hesabın adı:',a[0][1]);if(selected===null)return;const match=a.find(x=>x[1]===selected);if(!match)return msg('Geçersiz hesap adı.');try{await rpc('ob_finance_action',{p_venue:V,p_action:'pay_schedule',p:{schedule_id:id,account_id:match[0],amount:1}});await read();msg('Ödeme kaydedildi')}catch(err){msg(err.message)}}
async function stock(id){const x=state.data.stock.find(x=>x.id===id),val=prompt('Yeni miktar:',x.quantity);if(val===null)return;const n=Number(val);if(!Number.isFinite(n)||n<0)return msg('Geçersiz miktar');try{const r=await state.db.from(T.stock).update({quantity:n}).eq('venue_id',V).eq('id',id);if(r.error)throw r.error;await read()}catch(err){msg(err.message)}}
async function staff(id){const selected=prompt('Personel yetkisi (sahip / düzenleyici / görüntüleyici):','görüntüleyici');const r=({'sahip':'owner','düzenleyici':'editor','görüntüleyici':'viewer'})[selected];if(!r){if(selected!==null)msg('Geçersiz yetki seçimi.');return;}try{await rpc('ob_finance_staff_set',{p_venue:V,p_user:id,p_role:r});await read()}catch(err){msg(err.message)}}
function style(){if(document.getElementById('fcss'))return;const el=document.createElement('style');el.id='fcss';el.textContent='#ob-finance-owner-preview{position:fixed;inset:0;z-index:99999;overflow:auto;background:#f5f7fa;color:#1c2d45;font:14px system-ui}.flayout{display:grid;grid-template-columns:235px 1fr;min-height:100vh}.flayout aside{background:white;border-right:1px solid #e5e8f0;padding:22px}.flogo{width:180px;height:95px;object-fit:contain;mix-blend-mode:multiply}.fbrand{font-weight:750;padding:15px 8px}.fbrand small{display:block;color:#8795a6;font-size:10px;letter-spacing:1.5px;margin-top:7px}.flayout nav{display:grid;gap:4px;margin-top:15px}.flayout button{cursor:pointer;border:1px solid #e6e8ee;border-radius:9px;background:#fff;padding:10px 13px;color:#42536b}.flayout nav button{text-align:left;border:0}.flayout nav button.on{color:#e15d26;background:#fff0e8;font-weight:750}.flayout main{padding:35px;min-width:0}.flayout header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:25px}.flayout header h1{font-size:28px;margin:6px 0}.flayout header p{color:#8795a6}.flayout header small{color:#f16b31;letter-spacing:1px}.fcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:13px;margin-bottom:20px}.fcard,.fpanel{background:#fff;border:1px solid #e9ebf1;border-radius:16px;padding:22px;margin-bottom:16px}.fcard small{display:block;color:#8b97a8}.fcard strong{display:block;font-size:23px;margin-top:15px}.frow{display:flex;gap:15px;align-items:center;justify-content:space-between;border-top:1px solid #eef1f5;padding:14px 0}.frow div{flex:1}.frow small{display:block;color:#8997a8;margin-top:4px}.fempty{text-align:center;color:#94a1b2;padding:30px}.factions>button{margin:0 10px 20px 0;background:#ff6a2b;color:white}.factions>button:disabled{opacity:.45}#fmessage{color:#b42318}.fdialog{border:0;border-radius:14px;width:min(430px,94vw);padding:24px}.fdialog::backdrop{background:#10192888}.fdialog label{display:block;margin:10px 0}.fdialog input,.fdialog select{display:block;width:100%;box-sizing:border-box;padding:10px;border:1px solid #d5d9e2;border-radius:8px}.fdialog button{padding:10px;border-radius:8px;margin:10px 6px 0 0}.fdialog [role=alert]{color:#b42318}@media(max-width:760px){.flayout{display:block}.flayout aside{padding:10px}.flogo{width:125px;height:55px}.flayout nav{display:flex;overflow:auto}.flayout nav button{white-space:nowrap}.flayout main{padding:15px}.flayout header{flex-wrap:wrap}}.flayout *{box-sizing:border-box}.flayout main{max-width:100%;overflow-x:hidden}.flayout aside,.flayout nav,.fpanel,.fcard,.frow,.factions{min-width:0}.frow{flex-wrap:wrap;overflow-wrap:anywhere}.frow strong{max-width:100%;white-space:normal;overflow-wrap:anywhere}.frow button{max-width:100%;white-space:normal}.fcard strong{overflow-wrap:anywhere}.f-income strong{color:#16845c!important}.f-expense strong{color:#d3494a!important}.franges{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}.franges button.on{background:#11264a;color:white;border-color:#11264a}.fbarchart{display:grid;gap:14px}.fbarrow{display:grid;grid-template-columns:65px minmax(0,1fr) minmax(90px,auto);align-items:center;gap:10px}.fbarrow strong{font-size:12px;text-align:right;overflow-wrap:anywhere}.fbars{min-width:0;display:grid;gap:3px}.fbars span{display:block;height:10px;border-radius:4px}.fbarin{background:#20a36d}.fbarout{background:#e35b58}@media(max-width:760px){.flayout nav{max-width:100vw}.flayout header{min-width:0}.frow{gap:8px}.frow>div{flex-basis:100%}.fbarrow{grid-template-columns:45px minmax(0,1fr)}.fbarrow strong{grid-column:2}.fcards{grid-template-columns:repeat(2,minmax(0,1fr))}.fcard{padding:14px}.fcard strong{font-size:18px}}
#ob-finance-owner-preview{--navy:#14243e;--orange:#f46831;--green:#17875b;--red:#d74750;background:#f6f8fb!important;color:var(--navy)!important}
#ob-finance-owner-preview .flayout{grid-template-columns:252px minmax(0,1fr);max-width:1660px;margin:auto;min-width:0}
#ob-finance-owner-preview .flayout aside{padding:23px 17px;background:#fff;border-right:1px solid #e8edf3;min-width:0}
#ob-finance-owner-preview .f-logo-wrap{display:flex;align-items:center;min-height:112px}
#ob-finance-owner-preview .flogo{width:207px;height:96px;object-fit:contain;object-position:left center;max-width:100%;mix-blend-mode:multiply}
#ob-finance-owner-preview .fbrand{padding:12px 11px 24px;border-bottom:1px solid #e8edf3;font-size:15px}
#ob-finance-owner-preview nav{margin-top:22px;gap:5px}
#ob-finance-owner-preview nav button{display:flex;align-items:center;gap:12px;min-height:44px;font-size:13px;font-weight:620;padding:10px 13px;border-radius:11px;white-space:normal}
#ob-finance-owner-preview nav button.on{background:#fff0e7;color:#da5829;box-shadow:inset 3px 0 #f46831}
#ob-finance-owner-preview .f-nav-icon{font-size:19px;line-height:1;width:23px;text-align:center;color:#7f90a7;font-weight:400}
#ob-finance-owner-preview nav button.on .f-nav-icon{color:#db602a}
#ob-finance-owner-preview main{min-width:0;padding:38px clamp(16px,3.2vw,46px) 70px;background:#f6f8fb;max-width:100%;overflow-x:clip}
#ob-finance-owner-preview header{border-bottom:1px solid #e9edf3;padding-bottom:23px;margin-bottom:27px}
#ob-finance-owner-preview header h1{font-size:clamp(22px,2.7vw,30px);font-weight:800;letter-spacing:-.8px}
#ob-finance-owner-preview header button{white-space:nowrap}
#ob-finance-owner-preview .f-home-welcome{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:21px}
#ob-finance-owner-preview .f-home-welcome h2{font-size:21px;line-height:1.3;letter-spacing:-.5px;margin:6px 0}
#ob-finance-owner-preview .f-home-welcome p{color:#8a96a6;margin:0}
#ob-finance-owner-preview .f-eyebrow{color:#f46831;font-size:10px;font-weight:800;letter-spacing:1.5px}
#ob-finance-owner-preview .f-home-date{border:1px solid #e4e9f1;background:white;padding:10px 14px;border-radius:10px;color:#687b92;font-size:12px}
#ob-finance-owner-preview .fcards{grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin-bottom:23px}
#ob-finance-owner-preview .fcard,#ob-finance-owner-preview .fpanel{background:#fff;border:1px solid #e7ebf1;border-radius:16px;box-shadow:0 4px 18px rgba(20,36,62,.035);min-width:0}
#ob-finance-owner-preview .fcard{padding:22px;min-height:116px}
#ob-finance-owner-preview .fcard small{font-size:12px;color:#8290a5;font-weight:620}
#ob-finance-owner-preview .fcard strong{font-size:clamp(19px,2vw,26px);line-height:1.2;overflow-wrap:anywhere;letter-spacing:-.7px}
#ob-finance-owner-preview .fcard.f-income{border-top:3px solid #32ac7a}
#ob-finance-owner-preview .fcard.f-expense{border-top:3px solid #e56769}
#ob-finance-owner-preview .f-home-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:17px;align-items:start}
#ob-finance-owner-preview .fpanel{padding:22px;margin-bottom:18px;max-width:100%;overflow:hidden}
#ob-finance-owner-preview .fpanel h3{font-size:16px;margin:0 0 18px;font-weight:780;letter-spacing:-.2px}
#ob-finance-owner-preview .frow{min-width:0;max-width:100%;gap:12px;flex-wrap:wrap}
#ob-finance-owner-preview .frow>div{flex:1 1 140px;min-width:0}
#ob-finance-owner-preview .frow strong{flex:0 1 auto;min-width:0;overflow-wrap:anywhere}
#ob-finance-owner-preview .frow.f-income strong{color:#16875e!important}
#ob-finance-owner-preview .frow.f-expense strong{color:#d74650!important}
#ob-finance-owner-preview .f-type{background:#f4f6f9;border-radius:99px;padding:5px 9px;color:#66768c;font-size:10px}
#ob-finance-owner-preview .f-quick-actions{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 24px}
#ob-finance-owner-preview .f-quick-actions button{border:1px solid #e1e7ef;border-radius:12px;background:white;padding:13px 20px;font-weight:750;font-size:13px;color:#44516a}
#ob-finance-owner-preview .f-quick-actions .f-quick-income{background:#16875e;color:#fff;border-color:#16875e}
#ob-finance-owner-preview .f-quick-actions .f-quick-expense{background:#d74650;color:#fff;border-color:#d74650}
#ob-finance-owner-preview .factions>button:not(.f-quick-actions button){background:#f46831;border-color:#f46831}
#ob-finance-owner-preview .f-chart-head{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
#ob-finance-owner-preview .f-chart-head small{color:#8995a7;font-size:11px}
#ob-finance-owner-preview .f-chart{height:200px;display:flex;align-items:stretch;gap:13px;margin:15px 0 13px}
#ob-finance-owner-preview .f-chartcol{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px}
#ob-finance-owner-preview .f-chartbars{height:175px;display:flex;gap:5px;align-items:flex-end;width:100%;justify-content:center;border-bottom:1px solid #e9edf4}
#ob-finance-owner-preview .f-chartbars i{width:min(28px,40%);min-height:2px;border-radius:5px 5px 0 0;display:block}
#ob-finance-owner-preview .f-income-bar{background:#36b384}#ob-finance-owner-preview .f-expense-bar{background:#e96b70}
#ob-finance-owner-preview .f-chartcol small{font-size:11px;color:#92a0ae}
#ob-finance-owner-preview .f-graph-empty{align-self:center;width:100%;text-align:center;color:#94a2b4;padding:25px}
#ob-finance-owner-preview .f-chart-legend{display:flex;justify-content:center;gap:18px;color:#708197;font-size:11px}
#ob-finance-owner-preview .f-chart-legend span{display:flex;gap:6px;align-items:center}
#ob-finance-owner-preview .f-chart-legend i{display:inline-block;width:9px;height:9px;border-radius:3px}
#ob-finance-owner-preview .f-dotgreen{background:#36b384}#ob-finance-owner-preview .f-dotred{background:#e96b70}
#ob-finance-owner-preview .f-filters{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:13px}
#ob-finance-owner-preview .f-search{flex:1 1 230px;display:flex;align-items:center;gap:8px;border:1px solid #e1e6ed;border-radius:10px;padding:0 12px;min-width:0}
#ob-finance-owner-preview .f-search span{font-size:20px;color:#7f8ca1}
#ob-finance-owner-preview .f-search input{width:100%;min-width:0;border:0;outline:none;padding:12px 0;background:transparent;font:inherit}
#ob-finance-owner-preview .f-filters select{border:1px solid #e1e6ed;border-radius:10px;padding:12px 10px;background:white;max-width:100%;font:inherit}
#ob-finance-owner-preview .franges{gap:8px}.franges button{background:#fff;border-color:#e4e9f1}
#ob-finance-owner-preview .franges button.on{background:#142946;color:#fff;border-color:#142946}
.fdialog{box-sizing:border-box;max-width:calc(100vw - 24px);max-height:min(90vh,850px);overflow:auto;padding:28px;border:1px solid #e6eaf1;box-shadow:0 24px 90px rgba(15,30,50,.2);color:#14243e}
.fdialog form{display:grid;gap:11px}.fdialog form h2{font-size:20px;letter-spacing:-.3px;margin:0 0 10px}
.fdialog label{font-size:12px;color:#52627a;font-weight:700;margin:0}
.fdialog input,.fdialog select{margin-top:7px;min-height:43px;background:#fff;font-size:14px;border-color:#dce3eb}
.fdialog input:focus,.fdialog select:focus{outline:2px solid #ffceaf;outline-offset:1px}
.fdialog button{border:1px solid #dfe5ec;background:#fff;color:#43536b;font-weight:700;cursor:pointer}
.fdialog button[type=submit]{background:#f46831;color:white;border-color:#f46831}
.fdialog [role=alert]{margin:0;font-size:12px}
@media(max-width:1120px){#ob-finance-owner-preview .fcards{grid-template-columns:repeat(2,minmax(0,1fr))}#ob-finance-owner-preview .f-home-grid{grid-template-columns:1fr}}
@media(max-width:760px){#ob-finance-owner-preview .flayout{display:block}#ob-finance-owner-preview .flayout aside{padding:12px 12px 10px;position:relative;max-width:100vw;border-right:0;border-bottom:1px solid #e5ebf2}#ob-finance-owner-preview .f-logo-wrap{min-height:52px}#ob-finance-owner-preview .flogo{height:55px;width:140px}#ob-finance-owner-preview .fbrand{display:none}#ob-finance-owner-preview nav{display:flex;flex-wrap:nowrap;gap:4px;overflow:auto;max-width:100%;padding:4px 0;margin:3px 0;scrollbar-width:thin}#ob-finance-owner-preview nav button{flex:0 0 auto;white-space:nowrap;min-height:40px;padding:8px 10px;font-size:12px}#ob-finance-owner-preview .f-nav-icon{width:17px;font-size:15px}#ob-finance-owner-preview main{padding:19px 13px 50px}#ob-finance-owner-preview header{gap:10px;flex-wrap:wrap}#ob-finance-owner-preview header button{font-size:12px}#ob-finance-owner-preview .fcard{padding:15px;min-height:95px}#ob-finance-owner-preview .fcard strong{font-size:19px}#ob-finance-owner-preview .fpanel{padding:16px}#ob-finance-owner-preview .f-quick-actions button{flex:1 1 120px;padding:12px 10px}#ob-finance-owner-preview .f-home-date{font-size:11px}}
@media(max-width:390px){#ob-finance-owner-preview .fcards{gap:9px}#ob-finance-owner-preview .fcard{padding:12px}#ob-finance-owner-preview .fcard strong{font-size:16px}#ob-finance-owner-preview .f-filters select{width:100%}}
';document.head.appendChild(el)}
async function open(){if(typeof db==='undefined'||!db||typeof me==='undefined'||me?.role!=='admin')throw Error('Yönetici oturumu gerekli');let r=await db.rpc('ob_finance_status',{p_venue:V});if(r.error||!r.data?.allowed||!r.data?.enabled)throw Error('Muhasebe yetkisi kapalı');state={db,role:r.data.role,tab:0,data:{},people:[]};style();close(false);let d=document.createElement('div');d.id='ob-finance-owner-preview';document.body.appendChild(d);try{await read()}catch(err){close();throw err}}
function close(clear=true){node()?.remove();if(clear)state=null}
window.OynaBakOwnerFinancePreview=Object.freeze({open,close});
})();