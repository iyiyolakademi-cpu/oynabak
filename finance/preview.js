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
const kpi=(n,v,h)=>'<article class="obfp-kpi"><small>'+n+'</small><strong>'+v+'</strong><span>'+h+'</span></article>';
function render(){
 const root=document.getElementById('ob-finance-owner-preview');if(!root)return;
 root.innerHTML='<section class="obfp-app"><header><div><div class="obfp-eyebrow">OYNABAK / İYİ YOL AKADEMİ</div><h2>Ön Muhasebe <span class="obfp-pill">Önizleme</span></h2><p>İşletmeni tek panelden, kolayca yönet.</p></div><button id="obfp-close">✕ Kapat</button></header><div class="obfp-message">Bu ekran tasarım önizlemesidir. Gerçek işletme verileri kullanılmaz ve finans kaydı oluşturulmaz.</div><div class="obfp-body"><aside>'+sections.map((x,i)=>'<button data-fin-view="'+i+'" class="'+(current===i?'on':'')+'"><span>'+x[1]+'</span> '+esc(x[0])+'</button>').join('')+'</aside><main><div class="obfp-heading"><div><h3>'+sections[current][0]+'</h3><p>'+sections[current][2]+'</p></div><button disabled title="Önizleme modunda kapalı">+ Yeni Kayıt</button></div>'+content()+'</main></div></section>';
 root.querySelector('#obfp-close').onclick=()=>root.remove();
 root.querySelectorAll('[data-fin-view]').forEach(b=>b.onclick=()=>{current=Number(b.dataset.finView);render()});
}
function content(){
 if(current===0)return '<div class="obfp-cards">'+kpi('Bugünkü gelir','₺0,00','Kayıt bulunmuyor')+kpi('Bugünkü gider','₺0,00','Kayıt bulunmuyor')+kpi('Nakit bakiye','₺0,00','Hesap eklenmedi')+kpi('Bekleyen ödemeler','₺0,00','Planlı ödeme yok')+'</div><div class="obfp-cols"><section class="obfp-box"><h4>Son Hareketler</h4><div class="obfp-empty">Henüz işlem bulunmuyor.</div></section><section class="obfp-box"><h4>Hatırlatmalar</h4><div class="obfp-empty">Yeni bir hatırlatma yok.</div></section></div>';
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
#ob-finance-owner-preview{position:fixed;inset:0;background:#f5f7fa;overflow:auto;z-index:100000;color:#263143;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.obfp-app{max-width:1300px;margin:auto;padding:28px 22px}.obfp-app header{display:flex;align-items:center;justify-content:space-between;gap:20px}
.obfp-app header h2{font-size:30px;letter-spacing:-1px;margin:6px 0}.obfp-app header p,.obfp-heading p{color:#748094;margin:5px 0}.obfp-eyebrow{font-size:11px;letter-spacing:2px;color:#f06426;font-weight:800}
.obfp-pill{font-size:12px;letter-spacing:0;border-radius:99px;background:#fff0e6;color:#cf5b18;padding:6px 10px;vertical-align:middle}
.obfp-app button{border:1px solid #e4e7ef;background:#fff;padding:11px 14px;border-radius:10px;color:#344054;cursor:pointer;font:inherit}
.obfp-app button:disabled{opacity:.5;cursor:not-allowed}.obfp-message{background:#fff7e9;border:1px solid #f4dfbd;color:#916317;padding:13px 16px;border-radius:12px;margin:20px 0;font-size:13px}
.obfp-body{display:grid;grid-template-columns:230px minmax(0,1fr);gap:22px}.obfp-body aside{display:flex;flex-direction:column;gap:7px}.obfp-body aside button{text-align:left;border:0;background:transparent;white-space:normal;font-size:14px}.obfp-body aside button.on{color:#dd5917;background:#fff0e7;font-weight:750}
.obfp-body main{min-width:0}.obfp-heading{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:20px}.obfp-heading h3{margin:0;font-size:22px}.obfp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:16px}
.obfp-kpi,.obfp-box{border:1px solid #e9edf3;border-radius:16px;background:#fff;padding:20px}.obfp-kpi small,.obfp-kpi span{display:block;color:#7a8495;font-size:12px}.obfp-kpi strong{display:block;font-size:28px;margin:13px 0 8px}.obfp-cols{display:grid;grid-template-columns:1.35fr 1fr;gap:16px}
.obfp-box h4{margin:0 0 12px}.obfp-empty{padding:42px 15px;text-align:center;color:#96a0af;font-size:14px}
@media(max-width:800px){.obfp-body{grid-template-columns:1fr}.obfp-body aside{flex-direction:row;overflow:auto}.obfp-body aside button{flex:none;white-space:nowrap}.obfp-cols{grid-template-columns:1fr}.obfp-app{padding:16px}.obfp-app header h2{font-size:23px}}
`;document.head.appendChild(s)}
function open(){style();document.getElementById('ob-finance-owner-preview')?.remove();let el=document.createElement('div');el.id='ob-finance-owner-preview';document.body.appendChild(el);current=0;render()}
window.OynaBakOwnerFinancePreview=Object.freeze({open});
})();