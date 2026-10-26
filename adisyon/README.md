# OynaBak Adisyon — ödeme entegrasyonu olmadan

Mevcut QR kodları, dijital menü, oyun ve garson çağırma akışlarını değiştirmeyen, işletme bazlı personel adisyon modülü.

## Kullanım
- Yönetici işletmenin adisyon paketini açıp kapatabilir; ilk yüklemede etkinlik sunucudan kontrol edilir.
- Yalnızca **etkin işletmelerin** kartında Adisyon düğmesi gösterilir.
- Masa seçimi, dijital menüden ürün/varyant seçimi, miktar, hazırlık bölümü ve sipariş notu.
- Mutfak/bar durumları: yeni → hazırlanıyor → hazır → servis edildi.
- Gerekçeli ürün iptali, manuel adisyon kapatma, işlem geçmişi, adisyon tutarı raporu.
- **Online ödeme, tahsilat, sanal POS, kart ve banka entegrasyonu bulunmaz.**

## Veritabanı
- `adisyon/oynabak-adisyon.sql` dosyası `qacmubkcierbpxmdtsph` OynaBak Supabase projesine `add_oynabak_adisyon_no_payments` migrasyonu ile uygulanmıştır.
- İşletme eşleştirmesi sunucuda `ob_me()` ile denetlenir, tüm adisyon tablolarında RLS etkindir. Müşteri sipariş başvurusu anonim olarak gönderilebilir; personel adisyonu okuma ve değiştirme RPC'leri oturum ve işletme/rol yetkisi gerektirir.
- Fiyatlar `ob_venue_menus` içindeki aktif ürün/varyant fiyatıyla sunucuda karşılaştırılır.
- Aynı masa üzerinde eşzamanlı sipariş eklemeleri işlemsel kilit ve tek açık adisyon kuralıyla korunur.
- SQL dosyası altyapıyı belgelendirir; daha önce kurulmuş projeye kontrolsüz yeniden uygulamayın.

## İşletme paket durumu (26 Ekim 2026)
- İyi Yol Akademi: açık, 3 masa.
- Freed: kapalı.
- İyi yol akademi Ayberk: kapalı.
- Adisyon masaları mevcut basılı QR sayısından bağımsızdır.

## Yapılan kontroller
- Backend üzerinde **geri alınan tek işlem içinde** ürün ekleme, yanlış fiyatı reddetme, miktar/toplam doğrulama, mutfak durum geçişleri, adisyon kapatma, işlem geçmişi kontrol edildi.
- `ROLLBACK` sonrası gerçek veritabanında test siparişi kalmadığı doğrulandı.
- Gerçek `authenticated` Postgres rolü altında yönetici yetkisi ve Freed hesabının İyi Yol Akademi kayıtlarına erişememesi kontrol edildi.
- `index.html` içindeki tüm JavaScript blokları ve `adisyon/app.js` sözdizimi kontrolünden geçti. Var olan `index.html` içeriği aynen korunarak yalnız kapanış etiketleri önüne modül yüklendi.

## Yayın sonrası manuel kabul testi
- Gerçek tarayıcıda yönetici girişi, İyi Yol Akademi adisyon düğmesinin açılması, 1 ürün girilmesi, mutfak geçişi, manuel kapanış.
- Freed hesabında Adisyon düğmesinin görünmediği kontrolü.
- QR ile mevcut müşteri menüsü, oyunlar, garson çağırma ve ön muhasebe ekranlarının regresyon kontrolü.
- Tarayıcı oturumu gerektiren manuel kabul testi henüz gerçekleşmedi. Bu nedenle uçtan uca cihaz testi tamamlandı denmemelidir.

Not: `main` üzerinde yayınlandığında sadece özellik anahtarı etkin işletme modülü kullanabilir.

## Tek site, rol bazlı personel ekranları (26 Ekim 2026)
- Tüm hesaplar **https://oynabak.com/#panel** üzerinden e-posta/şifre ile girer.
- **Yönetici / işletme sahibi:** kendi işletmesinde masa yönetimi, tüm durumlar, raporlar, personel yetkilendirmesi.
- **Garson:** masalar, QR sipariş onayı, servis edildi, iptal/manuel kapatma, işletmeye izin verilmiş operasyon araçları.
- **Mutfak:** sadece kendi mutfak kalemleri, yeni → hazırlanıyor → hazır. Siparişi servis edildi yapamaz; satış tutarı gösterilmez.
- **Bar:** sadece kendi bar kalemleri, yeni → hazırlanıyor → hazır. Siparişi servis edildi yapamaz; satış tutarı gösterilmez.
- Çalışanlar önce OynaBak hesabı açmalı. Yönetici **Adisyon → Araçlar → Personel** içinden e-posta ile rol verir. Yetkili ama işletme hesabı olmayan çalışanlar girişte doğrudan çalışma alanına yönlendirilir. İlgili rolün otomatik açılması işyeri oturumu gerektirir.
- İşletmenin mevcut lisansı, QR kodları, fiyat menüsü ve diğer işletmelerin paketleri değiştirilmez. Roller, web sayfasındaki butonlara değil, sunucudaki doğrulamaya dayanır.

## Gerçek zamanlı veri yenilemesi
- `ob_adisyon_signals` tablosu yalnız işletme kimliği, artan değişiklik sürümü, tip ve tarih içerir. Müşteri, ürün, sipariş tutarı, e-posta taşımaz.
- Bu tablo `supabase_realtime` yayınına eklidir ve **SELECT RLS** yalnız yetkili personele veri gösterir.
- Sipariş ve hazırlık işlemleri tetikleyici üzerinden güvenli Realtime işareti yayınlar. İstemci buna tepki olarak **yetkili RPC ile gerçek veriyi yeniden okur**; veri Realtime payload'ından alınmaz.
- Realtime bağlantısı kurulamazsa 15 saniyelik yedek sorgu devam eder. Sesli alarm tarayıcı kullanıcı etkileşimine/iznine bağlıdır; ekran üstünde **Bildirim sesini aç** tuşu bulunur.
- Masa taşıma ve kişi bazlı hesap bölüştürme masaüstü/tablet/mobil uyumlu formlarla yapılır.

## Doğrulamalar
- `authenticated` rolünde eklenen geçici mutfak hesabının sadece mutfak ürünlerini ve **0 TL fiyat alanı** gördüğü; QR onayına erişmediği; hazırlama durumunu değiştirebildiği; servis edildi yapamadığı doğrulandı.
- Garson rolünün sipariş hazırlamaya geçiremediği, hazır ürünü servis edildi yapabildiği doğrulandı.
- Freed oturumunun İyi Yol Akademi Realtime sinyalini ve kapalı Freed sinyalini göremediği test edildi.
- Bütün test değişiklikleri `BEGIN/ROLLBACK` ile geri alındı. İyi Yol Akademi paketini kapatma/açma yapılmadı; 3 masa ve QR kodu sabit kaldı.
- Tarayıcıda gerçek üç farklı cihazla uçtan uca test **henüz yapılmadı**. Realtime bağlanma başarısı üretim cihazında görülmeli.
