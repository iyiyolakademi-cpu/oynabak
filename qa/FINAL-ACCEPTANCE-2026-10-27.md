# OynaBak — Final kabul ve satış öncesi kontrol (27.10.2026)

Bu belge müşteri kabul testlerini ve üretim sistemindeki **salt-okunur** kontrolleri ayırır.
Bir SQL kontrolünün geçmesi, fiziksel üç cihazda uçtan uca testin tamamlandığı anlamına gelmez.

## İşletme sahibinin tamamlandığını bildirdiği 6 test
- [x] Mevcut basılı QR kodu doğru işletmeye açılıyor.
- [x] Menü, alt kategori, varyant ve sıralama kaydediliyor.
- [x] Garson çağrısı/sipariş sesi Android ve iPhone'da denendi.
- [x] 35 ve 100 masalık plan düzenlenip yeniden açıldı.
- [x] QR sipariş onay/red/mutfak akışı denendi.
- [x] Adisyon toplamı, ürün iptali ve masa kapatma doğrulandı.

Bu altı onay işletme sahibinin bildirimidir; bu turda yeniden cihaz testi yapılmamıştır.

## 27.10.2026 — Üretim veritabanı read-only sonuçları
- [x] Aktif bir merchant hesabının oturum kimliğiyle üç ayrı **ardışık** adisyon okuması başarıyla sonuçlandı.
- [x] İşletmeye ait okunan adisyon ve ürün kayıtlarının venue_id alanı doğrulandı.
- [x] Aynı merchant hesabıyla başka bir aktif işletmenin adisyonuna erişim reddedildi.
- [x] İyi Yol Akademi test odasındaki 4 Okey ve 2 Pişti oyuncusu için özel elin yalnız kendi tokenıyla görüldüğü doğrulandı.
- [x] Okey/Pişti oyuncu özetlerinde başkalarının eli, tokenı ve toplanan kartları sızmıyor.
- [x] Her iki oyunda da bilinmeyen token reddedildi.
- [x] Üretim veritabanında bu kontroller sırasında kalıcı veri değiştirilmedi.

**Sınır:** Ardışık oturum-simülasyonu üç gerçek cihazda aynı anda çalışmayı, network kesintisini, WebAudio arka plan davranışını veya oyunun bitişini doğrulamaz.

## Kalan zorunlu saha kabul testleri

### A — Aynı işletme hesabı, 3 fiziksel cihaz
- [ ] A cihazı: işletme sahibinin mevcut e-posta/şifresiyle Sipariş Merkezi > Siparişler.
- [ ] B cihazı: aynı hesapla Mutfak/Bar; A'daki ürün 15 saniye içinde veya canlı sinyalle gelsin.
- [ ] C cihazı: aynı hesapla Masalar/Canlı Kontrol; A ve B'de yapılan değişiklikleri alsın.
- [ ] A'da QR siparişi onayla; B'de 'hazırlanıyor > hazır' yap; C'de servis edildi ve adisyon aç/kapat akışını doğrula.
- [ ] Her cihazda sayfayı yenile; oturum/sekme/işletme seçimi doğru, veriler aynı kalmalı.
- [ ] Bir cihazdan interneti kes; 'güncel değil' uyarısı çıksın; yeniden bağlayınca veriler ve kuyruk aynı duruma dönsün.
- [ ] Aynı işlemi iki cihazda hızlıca tekrarla; çift ürün kaydı veya çift kapanış olmamalı.
- [ ] Sesi etkinleştir düğmesi çalışsın; tarayıcı/telefon arka plan sesi sınırlamaları açıkça anlatılsın.

### B — Oyunları farklı telefonlarda tamamla
- [ ] Pişti: 2 telefonda oda kur/katıl, sıralı kart at, puan ve sonuç ekranını tamamla.
- [ ] Okey: 4 telefonda oda kur/katıl, yatay tam ekran ve sürükle-bırak, taş çek/at, bitiş ve kazananı doğrula.
- [ ] Oyunculardan birinin bağlantısını geçici kes, dönüşte kendi eli ve hamle sırası tutarlı olsun.
- [ ] Geçersiz oda/token ve sıra dışı hamleler anlaşılır hata versin.
- [ ] Okey yalnız İyi Yol Akademi pilotunda görünmeye devam etsin.

### C — Kamuya açık satış/destek son kontrolü
- [x] Kodda 4.000 TL tek-seferlik lansman fiyatı yer alıyor.
- [x] Stand + ilk kurulum ana pakette; adisyon, mutfak/bar ve ön muhasebe ayrıca teklifleniyor.
- [x] Gizlilik, KVKK, kullanım koşulları ve iletişim sayfalarının içerikleri kodda var.
- [x] WhatsApp ve e-posta bağlantıları kodda mevcut.
- [ ] Gerçek tarayıcıda satış sayfasını ve dört yasal sekmeyi açıp kontrol et.
- [ ] Test WhatsApp ve e-posta mesajı gönder; doğru adrese/hesaba ulaştığını doğrula.
- [ ] Fiyatın güncelliği, destek kapsamı, aktivasyon, lisans süresi ve gerekiyorsa fatura/mesafeli satış şartlarını işletme sahibi/hukuk danışmanı onaylasın.
- [ ] İlk müşteri için kurulum, destek ve iptal/iadeye ilişkin yazılı süreç hazır olsun.

## Karar
**Kontrollü pilot satış:** Evet, tamamlandığı bildirilen altı saha testi ve başarılı sunucu güvenlik kontrolleriyle sınırlı.
**Genel satış lansmanı:** Fiziksel üç cihaz ve oyunu bitirme testleri; canlı satış/destek ve yasal son kontroller bitmeden tamamlandı sayılmamalı.

OynaBak hesap/kod/QR düzeni korunur; çalışanlara PIN veya ayrı oturum zorunluluğu eklenmez.
