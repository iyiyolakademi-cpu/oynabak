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

## E-postasız personel ve işletme bazlı PIN paketi (26 Ekim 2026)
- **Ayrı site yok:** Personel girişi `https://oynabak.com/#personel`, yönetici girişi `https://oynabak.com/#panel`. Her iki adres aynı `index.html` ve Supabase projesini kullanır.
- OynaBak ana yöneticisi her işletmenin kartındaki **Personel PIN sistemi** tuşuyla paket durumunu görür, açar veya kapatır. Adisyon paketi kapalı işletmede PIN açılacaksa işlem açık onay ile adisyonu da açar. PIN kaldırılınca adisyon/QR menü otomatik kapanmaz.
- **İyi Yol Akademi:** Adisyon açık, 3 masa, PIN açık. **Freed ve Ayberk:** Adisyon/PIN kapalı; yönetici isterse açabilir. İşletme ayarları kopyalanmaz.
- Yönetici rol seçerek **10 dakikalık tek kullanımlık 24 karakterlik rastgele cihaz eşleştirme kodu** üretir. Çalışan yalnız bu kod ve kendi belirlediği **6 haneli PIN** ile oturum açar; e-posta yazmaz.
- Personel oturumları ana işletme hesabından **ayrı bir Supabase Auth client storageKey** kullanır. Personel cihazı için Supabase **Anonymous Sign-Ins** provider'ının etkin olması gerekir. Bu proje ayarı SQL üzerinden otomatik değiştirilemez. **Authentication → Providers → Anonymous Sign-Ins** üzerinden yetkili proje sahibi tarafından etkinleştirilmelidir. Mevcut Auth politikalarının anonim kullanıcı (authenticated rolü) ile uyumu incelenmelidir; CAPTCHA önerilir.
- Yüksek entropili eşleştirme kodu DB'de **SHA-256 hash** olarak, PIN **bcrypt/pgcrypto hash** olarak tutulur; hiçbirinin düz hali saklanmaz. Kod yalnız oluşturma yanıtında görüntülenir. Kod paylaşırken link parametresine konmaz.
- Anon Auth hesabı yalnız tek cihazla eşleştirilir. Eşleştirme yapılmadan, PIN kilitliyken veya cihaz iptal edildiğinde sunucudaki adisyon yetki kontrolü **erişimi reddeder**. Oturum 8 saat, 5 yanlış deneme sonrası 15 dakika kilit.
- Yönetici cihaz listesinden erişimi **anında iptal eder**; istemci 30 saniyede bir yeniden kontrol ederek kapatır. PIN/Adisyon kapatmak oturumu kilitler ve kullanılmayan eşleştirme kodlarını geçersizleştirir.
- Anon personel oturumunun **yetkileri sunucuda** işletme ve rollerle doğrulanır. Diğer işletmenin kayıtlarını, müşteri menüsü dışı operasyonlarını göremez. RLS ve RPC kontrolleri ayrı.
- `ob_staff_pairing_invites` ve `ob_staff_pin_devices` tabloları RLS etkin ve **doğrudan anon/authenticated tablo izni yok**. Supabase güvenlik danışmanı "policy yok" uyarısını bu iki tablo için gösterebilir; yalnız sunucu RPC erişimi bilinçli tasarım.
- **Doğrulanan:** migration başarılı; admin listesi İyi Yol Akademi açık, Freed/Ayberk kapalı; admin eşleştirme kodu üretimi; Freed geçici aç/kapat işlemleri ve sonuçları `ROLLBACK` ile test edildi; JS sözdizimi geçti.
- **Eksik son kabul testi:** Auth Anonymous provider açık mı kontrolü, gerçek telefonda anonim oturum açıp kod+PIN eşleştirmesi, kilit/açma, anlık bildirim ve cihaz iptali uçtan uca tarayıcı testi. Bu gerçekleşmeden personel girişini tümüyle doğrulanmış saymayın.

## Sade Hızlı Sipariş Ekranı — giriş/PIN/kod yok
- **İşletme çalışanı:** `https://oynabak.com/#siparis-ekrani` adresinden girer. Kayıt, e-posta, şifre, günlük personel PIN'i veya eşleştirme kodu **yoktur**.
- **Tek seferlik güvenlik:** Cihaz ilk açılışta işletmeyi seçip "Cihazı kullanıma aç" der. Yönetici `oynabak.com/#panel` içindeki ilgili işletme kartında `⚡ Hızlı Sipariş Ekranı` → **Cihazı onayla** işlemini yapar. Onaylanmayan cihaz hiçbir sipariş okuyamaz/değiştiremez.
- **Günlük kullanım:** Aynı tarayıcı/cihaz kendi rastgele 256-bit anahtarını cihazda hatırlar; sonraki açılışlarda doğrudan siparişleri gösterir. Anahtar URL parametresiyle gönderilmez; Supabase yalnız SHA-256 özetini tutar. Veriler temizlenirse yeniden cihaz onayı gerekir.
- **İşletme bazlı açma/kapama:** OynaBak ana yöneticisi her işletmede ayrı `simple_console_enabled` ayarını yönetir. Adisyon paketi kapalı işletmede ayrı onayla önce adisyonu etkinleştirir. Freed ve Ayberk kapalıdır. **İyi Yol Akademi 3 masa ile açık**.
- **Üç sade bölüm:** `Siparişler` (müşteri QR talebini al/reddet), `Masalar` (açık adisyon, dijital menü ürünü/varyant ekle, manuel kapat), `Mutfak / Bar` (Yeni → Hazırlanıyor → Hazır → Servis edildi). Ödeme, sanal POS, kasa tahsilatı yok.
- **Alarm:** Yetkili cihazın sipariş sayfasında henüz susturulmamış yeni QR talebi veya yeni mutfak ürünü varsa görsel alarm ve tekrar eden WebAudio tonu 1.8 saniyede bir çalışır. `🔕 Sustur` o anda bekleyen bildirimleri susturur; yeni sipariş gelince yeniden öter.
- **Tarayıcı sesi:** Chrome/iOS Safari/Android'in otomatik ses politikaları nedeniyle her yeni sayfa açılışında `🔔 Sesi etkinleştir` düğmesine bir kez basılmalıdır. Ekran kilitliyken veya tarayıcı arka plandayken kesintisiz ses garantisi yoktur; sabit açık tablet önerilir.
- **Yenileme:** Siparişler 4 saniyelik aralıklarla sunucudan okunur. Bağlantı geri gelince otomatik yenilenir; bu yeni ekranın gerçek zamanlı olmasına rağmen Realtime teslim garantisi iddia edilmez. Açık ürün ekleme formu veri yenilenirken korunur.
- **Güvenlik:** `ob_simple_devices` tablosunda RLS açıktır ve anonim/düzenli hesaplara tablo izni verilmez. İşlemler yalnız tek işletmeye ait, yönetici onaylı, geri alınmamış 256-bit cihaz anahtarıyla yapılır. Onay isteği 30 dakika geçerli, aynı işletmede bekleyen istek sayısı ve saatlik istek sayısı sınırlı. Yönetici tüm cihazların erişimini anında iptal edebilir.
- **Denetim:** Garson ve mutfak işlemleri `ob_adisyon_audit` içinde onaylayan yönetici ve işlem yapan cihaz ID'siyle izlenebilir; bireysel çalışan adı tutmaz.
- **Mevcut sistem:** Önceki gelişmiş roller/PIN ekranları korunur, ancak basit ekran bunları gerektirmez. Basılı QR kodları, müşteri menüsü, oyunlar, garson çağrı ve ön muhasebe bozulmaz.

### Kurulum / test durumu
- OynaBak Supabase'e `oynabak_simple_console_device_approval` ve `oynabak_simple_console_pending_expiry_and_disable` migrasyonları uygulandı.
- Veritabanı transaction + rollback testlerinde cihaz isteği/onayı, sipariş onayı, mutfak durumu, manuel ürün ekleme, manuel adisyon kapatma, cihaz iptali, yanlış token reddi, anon rolü erişimi, işletme paket aç/kapat ve yönetici dışı erişimin engellenmesi doğrulandı.
- **Eksik:** Gerçek tablet/telefon ekranı, tarayıcı ses izni, operasyon alarmının fiziksel cihazda susturulması ve 2 eşzamanlı cihaz kabul testi. Bu olmadan üretimde kesintisiz alarm/ses garantisi verilmez.
- OynaBak ana `index.html` betiklerinin sözdizimi kontrol edildi; yeni JS dosyaları `new Function(...)` kontrolünden geçti.

## 26 Ekim 2026: Tek OynaBak e-posta girişi — tüm görevler
- **Kullanılan tek giriş:** `https://oynabak.com/#panel`. Garson, mutfak, bar, yönetici kendi OynaBak e-posta + şifresiyle giriş yapar; farklı site veya PIN/kod/cihaz eşleştirmesi yoktur. İşletmenin müşterileri basılı QR kodlarıyla e-postasız menü/oyun/sipariş kullanmaya devam eder.
- **Devreden çıkarılan eski personel yöntemleri:** `#personel` ve `#siparis-ekrani` URL'leri `#panel`'e yönlendirilir. PIN ve cihaz eşleştirme dosyaları artık `index.html` tarafından yüklenmez. Veritabanında `staff_pin_enabled` ve `simple_console_enabled` bütün işletmelerde false yapılmış, anonim cihaz operasyon RPC'lerinin EXECUTE izinleri kaldırılmıştır. Eski mobil personel oturumları veya onaylı cihaz anahtarları operasyonlara erişemez.
- **Yetkilendirme:** Personel önceden OynaBak hesabına kayıt olur. Yönetici, işletmenin Adisyon → Araçlar → Personel bölümüne çalışanın kayıtlı e-postasını yazarak `manager`, `waiter`, `kitchen`, `bar` rolü atar. Sunucu `ob_me` bu üyeleri `staff` olarak tanır; `ob_adisyon_permission` her işlemde işyeri ve rol kontrolü yapar.
- **Yeni çalışma ekranı:** E-posta ile yetkilendirilmiş garsonun QR onay ve garson çağrıları, mutfak ve barın kendi hazırlık kartları, yöneticinin masa/adisyon yönetimi ve raporları aynı web sitesindedir. Garson çağrısı ilgili panelde **Tamamlandı** yapılır ve siparişler gibi Realtime sinyali gönderir.
- **Tekrarlayan alarm:** Yeni QR onayı, garson çağrısı, yeni mutfak/bar işi ve servis için hazır ürünler kendilerine yetkili ekranlarda 1,8 saniyelik tekrarlayan sesle bildirilir. `Sustur` yalnız mevcut uyarıları susturur; yeni olay tekrar alarmı başlatır. **Bildirim sesini aç** ilk etkileşimde gereklidir; cihaz kilidinde ve arka planda web tarayıcısının ses kısıtlamaları geçerlidir.
- **Mutfak/bar yönlendirmesi:** Menü yöneticisinde kategori ve ürün bazlı `Otomatik / Mutfak / Bar` alanları eklendi. Sunucu açık seçimi esas alır; eski menülerde içecek/alkol/coffee/soft/cocktail gibi kategori isimlerini daha iyi tanır. Bu tercihler hem müşteri QR siparişinde hem garsonun elle eklediği ürünlerde sunucu tarafından belirlenir.
- **Garson çağırma güvenliği:** Menü/oyun/garson çağrısı feature toggle'ları korundu. Çağrı API'si artık işletmenin aktif ve lisanslı, garson çağrısı açık ve istenen masa aralıkta olduğunu kontrol eder. Diğer işletmeler etkilenmez. İyi Yol Akademi'de bu paket açıldı.
- **Adisyon bütünlüğü:** Hazırlanıyor/yeni/servise hazır ürünü kalan adisyon doğrudan kapatılamaz; ürün servis edilir veya gerekçeyle iptal edilir. Bu bir tahsilat kaydı değildir; OynaBak herhangi banka, kart, POS veya sanal ödeme almaz.
- **Hız:** Eski sade cihaz ekranı her 4 saniyede menünün base64 görselleriyle birlikte tam halini indiriyordu. Bu ekran devre dışıdır. Personel menüyü panel açılışında bir kez alır; canlı siparişler yetkili RPC ve Supabase Realtime + 15 saniyelik yedek kontrol üzerinden güncellenir.
- **Kontrol / test:** `BEGIN ... ROLLBACK` işlemleriyle OynaBak admin / personel rolleri, çapraz işletme izolasyonu, QR sipariş onayı → mutfak → hazır → garson servisi → adisyon kapatma, geçersiz masa çağrısının reddi ve çağrıların tamamlanması doğrulandı. Ayrıca dijital menüde bölüm ayarı kaydedilip okunarak test edildi. Hiçbir pilot işlem kalıcı kaydedilmedi.
- **Operasyonel kabul testi halen gerekli:** Gerçek personel e-postalarının atanması (sahte hesap eklenmedi), 2 telefon + 1 tablet üzerinde gerçek ses, arka plan davranışı, yavaş internet, aynı anda sipariş ve fiziksel QR kullanımı.
- **Mevcut işletme paketleri** değiştirilmedi: İyi Yol Akademi adisyon 3 masa, Freed adisyon kapalı, Ayberk mevcut adisyon 10 masa durumunda kaldı. Yeni bir işletmeyi OynaBak panelindeki işletme bazlı adisyon kontrolüyle açıp kapatabilirsiniz.

## En son karar — tek mevcut OynaBak işletme hesabı (26 Ekim 2026)
- **Yeni hesap/rol/personel kaydı yok.** İşletme için OynaBak'ta hangi mevcut yönetici/işletme hesabı varsa o hesap `https://oynabak.com/#panel` üzerinden giriş yapar. Aynı hesap işletmenin garson telefonu, mutfak tableti ve bilgisayarında kullanılabilir. Ek e-posta kaydı, personel atama, PIN, eşleştirme kodu veya cihaz onayı gerektirilmez.
- İyi Yol Akademi'nin mevcut kayıtlı işletme kullanıcısı aynı zamanda OynaBak platform **admin** hesabıdır. Bu hesapla işletme kartından **Sipariş Merkezi** açılır. Diğer mevcut işletme kullanıcıları (`merchant`) kendi mevcut hesaplarıyla işletme panelindeki **Sipariş Merkezi** tuşunu açar.
- Tek Sipariş Merkezi içerisinde **Siparişler**, **Mutfak / Bar**, **Masalar** ve **Raporlar** sekmeleri vardır. Varsayılan olarak yeni QR sipariş ve garson çağrı ekranı açılır. Mutfakta duran tablet `Mutfak/Bar` sekmesini, garson telefonu `Siparişler` sekmesini, kasa bilgisayarı `Masalar` sekmesini seçebilir. **Her tarayıcı son sekmesini ve hazırlık filtresini kendi cihazında saklar.** Bu tercihler kullanıcı hesabını/işletme ayarını değiştirmez.
- Adisyon → Araçlar'daki **Personel** atama seçeneği uygulama arayüzünden kaldırıldı. Personel için ayrılmış portalı oluşturma/gösterme kodu uygulama modülünden çıkarıldı; yalnız admin veya ilgili işletmenin mevcut merchant hesabı operasyon merkezini açabilir. Eski staff/RPC yardımcı yapıları veritabanında geri dönüş güvenliği için durur, ancak yeni iş akışında kullanılmaz.
- Önceki README bölümleri tarihsel geliştirme kaydıdır; bu başlıktaki işletme hesabı akışı **güncel kullanılan yöntemdir**.
- Güvenlik tercihi: Aynı e-posta/şifrenin çok cihaz/kişi tarafından kullanılması kimlerin hangi işlemi yaptığını ayrı ayrı ayırmayı **engeller**, ayrıca hesabın sahip olduğu mevcut yönetici yetkileri bütün oturumlarda geçerli olur. İleri bir sürümde farklı çalışan yetkileri seçeneği eklenebilir, şu anda zorunlu değildir.
- **Test:** mevcut İyi Yol Akademi OynaBak hesabı `admin`, mevcut Ayberk işletme hesabı `merchant` olarak doğrulandı; her ikisi de mevcut oturumla garson onayı/mutfak/adisyon yetkilerine sahip. Ayberk kullanıcısının Akademi verisine erişimi reddedildi, Freed adisyon kapalı kaldı. Yeni JS sözdizimi ve tek login bağlamı doğrulandı. Birden çok gerçek tarayıcının aynı hesapla eşzamanlı oturum açması ayrıca fiziksel cihazlarda kabul testine tabidir.
