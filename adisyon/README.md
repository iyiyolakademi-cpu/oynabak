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
- İşletme eşleştirmesi sunucuda `ob_me()` ile denetlenir, tüm adisyon tablolarında RLS etkindir. Misafirlerin API fonksiyonlarına EXECUTE yetkisi yoktur.
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
