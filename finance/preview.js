/* OynaBak owner-only FINANCE PREVIEW. No real financial data; no write API calls. */
(()=>{'use strict';
const sections=[
 ['Genel Bakış','📊','Günlük gelir, gider ve hesap özeti'],
 ['Gün Sonu','🌙','Kasa sayımı, beklenen nakit ve fark'],
 ['Kasa / POS / Banka','💳','Hesaplar, POS hareketleri ve banka bakiyesi'],
 ['Ödeme Takvimi','📅','Yaklaşan ve geciken ödemeler'],
 ['Cari Hesaplar','👥','Tedarikçiler, borç ve alacaklar'],
 ['Stok Takibi','📦','Ürün miktarları ve kritik stok'],
 ['Personel Ödemeleri','👤','Maaş, avans ve ödeme geçmişi'],
 ['Tekrarlayan Giderler','🔁','Kira, abonelik ve düzenli giderler'],
 ['Personel Yetkileri','🔒','Sahip, düzenleyici ve görüntüleyici izinleri']
];
let current=0;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kpi=(n,v,h)=>'<article class="obfp-kpi"><div class="obfp-kpi-top"><small>'+n+'</small><span class="obfp-kpi-indicator">↗</span></div><strong>'+v+'</strong><span>'+h+'</span></article>';
function render(){
 const root=document.getElementById('ob-finance-owner-preview');if(!root)return;
 root.innerHTML='<section class="obfp-app"><header><div class="obfp-brand"><img src="oynabak-logo.png" alt="OynaBak logosu" class="obfp-logo"><span class="obfp-brand-line"></span><div><div class="obfp-eyebrow">İYİ YOL AKADEMİ · YÖNETİM PANELİ</div><h2>Ön Muhasebe <span class="obfp-pill">Önizleme</span></h2><p>İşletmenizin finansal kontrol merkezi</p></div></div><button id="obfp-close">← Panele dön</button></header><div class="obfp-message"><b>Önizleme modu:</b> Tasarımı güvenle inceleyebilirsiniz. Gerçek finans verileri kullanılmaz ve kayıt oluşturulmaz.</div><div class="obfp-body"><aside><div class="obfp-navlabel">FİNANS YÖNETİMİ</div>'+sections.map((x,i)=>'<button data-fin-view="'+i+'" class="'+(current===i?'on':'')+'"><span>'+x[1]+'</span> '+esc(x[0])+'</button>').join('')+'<div class="obfp-sidebar-bottom"><span>●</span> Güvenli işletme önizlemesi</div></aside><main><div class="obfp-heading"><div><h3>'+sections[current][0]+'</h3><p>'+sections[current][2]+'</p></div><button class="obfp-new" disabled title="Önizleme modunda kapalı">+ Yeni kayıt</button></div>'+content()+'</main></div></section>';
 root.querySelector('#obfp-close').onclick=()=>root.remove();
 root.querySelectorAll('[data-fin-view]').forEach(b=>b.onclick=()=>{current=Number(b.dataset.finView);render()});
}
function content(){
 if(current===0)return '<div class="obfp-cards">'+kpi('Bugünkü gelir','₺0,00','Kayıt bulunmuyor')+kpi('Bugünkü gider','₺0,00','Kayıt bulunmuyor')+kpi('Nakit bakiye','₺0,00','Hesap eklenmedi')+kpi('Bekleyen ödemeler','₺0,00','Planlı ödeme yok')+'</div><div class="obfp-section-title">Finansal hareketler <span>Güncel görünüm</span></div><div class="obfp-cols"><section class="obfp-box"><h4>Son Hareketler</h4><div class="obfp-empty">Henüz işlem bulunmuyor.</div></section><section class="obfp-box"><h4>Hatırlatmalar</h4><div class="obfp-empty">Yeni bir hatırlatma yok.</div></section></div>';
 if(current===1)return '<div class="obfp-cards">'+kpi('Beklenen nakit','₺0,00','Önizleme')+kpi('Sayılan nakit','₺0,00','Henüz kapanış yapılmadı')+kpi('Kasa farkı','₺0,00','−')+'</div>'+empty('Gün sonu kapatmaları');
 if(current===2)return '<div class="obfp-cards">'+kpi('Nakit kasa','₺0,00','Önizleme')+kpi('POS','₺0,00','Önizleme')+kpi('Banka','₺0,00','Önizleme')+'</div>'+empty('Finans hesapları');
 if(current===3)return '<div class="obfp-cards">'+kpi('Yaklaşan ödeme','₺0,00','Bu hafta')+kpi('Gecikmiş ödeme','₺0,00','Geciken yok')+'</div>'+empty('Ödeme planı');
 if(current===4)return '<div class="obfp-cards">'+kpi('Toplam alacak','₺0,00','Önizleme')+kpi('Toplam borç','₺0,00','Önizleme')+'</div>'+empty('Cari hesap listesi');
 if(current===5)return '<div class="obfp-cards">'+kpi('Toplam ürün','0','Stok kaydı yok')+kpi('Kritik stok','0','Uyarı yok')+'</div>'+empty('Stok ürünleri');
 if(current===6)return empty('Personel maaşı ve avans takibi');
 if(current===7)return empty('Aylık tekrarlayan giderler');
 return '<div class="obfp-cols"><section class="obfp-box"><h4>İşletme sahibi</h4><p>Tüm finans ekranlarına ve yetkilere erişir.</p></section><section class="obfp-box"><h4>Personel rolleri</h4><p>Düzenleyici ve görüntüleyici izinleri burada yönetilecek.</p></section></div>';
}
function empty(t){return '<section class="obfp-box"><h4>'+t+'</h4><div class="obfp-empty">Henüz kayıt bulunmuyor.</div></section>'}
function style(){if(document.getElementById('obfp-css'))return;const s=document.createElement('style');s.id='obfp-css';s.textContent=`
#ob-finance-owner-preview{position:fixed;inset:0;z-index:100000;overflow:auto;background:#f4f6f9;color:#111c32;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px}
.obfp-app{max-width:1460px;margin:auto;padding:30px 34px 70px}
.obfp-app header{display:flex;align-items:center;justify-content:space-between;gap:22px;padding:0 2px 26px}
.obfp-brand{display:flex;gap:22px;align-items:center;min-width:0}.obfp-logo{display:block;object-fit:contain;object-position:left center;width:200px;max-width:25vw;height:88px;flex:none;background:transparent;mix-blend-mode:multiply}
.obfp-brand-line{width:1px;height:52px;background:#d9dee6;flex:none}
.obfp-app header h2{font-size:27px;letter-spacing:-.9px;margin:5px 0;font-weight:780}.obfp-app header p,.obfp-heading p{color:#788397;margin:6px 0}
.obfp-eyebrow{font-size:10px;letter-spacing:1.7px;color:#647084;font-weight:800}.obfp-pill{font-size:11px;letter-spacing:0;border-radius:99px;background:#fff1e8;color:#de621e;padding:5px 10px;vertical-align:middle;font-weight:700}
.obfp-app button{font:inherit;border:1px solid #e1e5ed;background:white;padding:12px 16px;border-radius:11px;color:#31405b;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
.obfp-app button:hover:not(:disabled){background:#f8fafc;border-color:#c5cddb}.obfp-app button:disabled{opacity:.58;cursor:not-allowed}
.obfp-message{background:#fff8ed;border:1px solid #f4e5cf;color:#8a611f;padding:12px 17px;border-radius:12px;margin:0 0 22px;font-size:12px}
.obfp-body{display:grid;grid-template-columns:246px minmax(0,1fr);gap:25px;align-items:start}.obfp-body aside{display:flex;flex-direction:column;gap:5px;background:#fff;border:1px solid #e8ebf1;border-radius:18px;padding:17px 10px;box-shadow:0 7px 25px #192a4406}
.obfp-navlabel{padding:5px 14px 17px;color:#96a0b1;font-size:10px;font-weight:800;letter-spacing:1.4px}
.obfp-body aside button{text-align:left;border:0;border-radius:10px;background:transparent;white-space:normal;font-size:13px;padding:12px 13px;font-weight:620;color:#657085}
.obfp-body aside button span{margin-right:9px}.obfp-body aside button.on{color:#e15c20;background:#fff0e8;font-weight:800}.obfp-body aside button.on:hover{background:#ffe8d9}
.obfp-sidebar-bottom{font-size:11px;color:#9099a8;border-top:1px solid #edf0f4;margin:14px 6px 0;padding:20px 9px 4px}.obfp-sidebar-bottom span{color:#299e76;margin-right:5px}
.obfp-body main{min-width:0}.obfp-heading{display:flex;justify-content:space-between;gap:14px;align-items:center;margin:5px 0 23px}.obfp-heading h3{margin:0;font-size:25px;font-weight:780;letter-spacing:-.8px}.obfp-heading p{font-size:13px}
.obfp-app button.obfp-new{background:#ff672b;border-color:#ff672b;color:white;font-weight:700;padding:13px 19px}
.obfp-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin-bottom:25px}
.obfp-kpi,.obfp-box{border:1px solid #e8ecf2;border-radius:17px;background:#fff;padding:23px;box-shadow:0 6px 26px #24354e06}
.obfp-kpi{min-height:128px}.obfp-kpi-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.obfp-kpi-top .obfp-kpi-indicator{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#f2f5f9;color:#7889a1;font-size:15px}
.obfp-kpi small,.obfp-kpi span{display:block;color:#7e899b;font-size:12px}.obfp-kpi strong{display:block;font-size:26px;letter-spacing:-1px;margin:14px 0 10px;font-variant-numeric:tabular-nums}
.obfp-section-title{display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:760;margin:0 0 14px}.obfp-section-title span{font-size:12px;font-weight:500;color:#a0a9b8}
.obfp-cols{display:grid;grid-template-columns:1.35fr 1fr;gap:17px}.obfp-box h4{font-size:15px;margin:0 0 12px;letter-spacing:-.2px}.obfp-box p{color:#758195;line-height:1.7}
.obfp-empty{padding:48px 14px;text-align:center;color:#a0aab8;font-size:13px;background:#f9fafc;border:1px dashed #e5e9f0;border-radius:13px}
@media(max-width:1100px){.obfp-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.obfp-logo{width:155px;height:70px}}
@media(max-width:800px){.obfp-app{padding:17px 13px 52px}.obfp-body{grid-template-columns:1fr;gap:12px}.obfp-body aside{flex-direction:row;overflow-x:auto;padding:10px;max-width:100%;border-radius:13px}.obfp-body aside button{flex:none;white-space:nowrap}.obfp-navlabel,.obfp-sidebar-bottom{display:none}.obfp-cols{grid-template-columns:1fr}.obfp-app header h2{font-size:21px}.obfp-app header{align-items:flex-start}.obfp-logo{width:118px;height:56px;max-width:24vw}.obfp-brand{gap:10px}.obfp-brand-line{height:36px}.obfp-app header button{padding:9px;font-size:12px}}
@media(max-width:480px){.obfp-cards{grid-template-columns:1fr 1fr;gap:9px}.obfp-kpi{padding:15px;min-height:103px}.obfp-kpi strong{font-size:21px}.obfp-logo{width:85px;height:45px}.obfp-eyebrow{font-size:8px;letter-spacing:.3px}.obfp-app header h2{font-size:17px}.obfp-pill{font-size:9px}.obfp-heading h3{font-size:21px}}
`;document.head.appendChild(s)}
function open(){style();document.getElementById('ob-finance-owner-preview')?.remove();let el=document.createElement('div');el.id='ob-finance-owner-preview';document.body.appendChild(el);current=0;render()}
window.OynaBakOwnerFinancePreview=Object.freeze({open});
})();