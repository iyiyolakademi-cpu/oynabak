# OynaBak – ESC/POS Yazdırma Sistemi (Güvenli sürüm)

Bu klasör OynaBak siparişlerini işletmede bulunan ESC/POS termal yazıcıya gönderecek **yerel cihaz servisidir**. RONGTA RP330 için öncelikle Ethernet / TCP (genellikle 9100) test edilmelidir. USB, Bluetooth ve seri port gerçek sürücüleri henüz eklenmedi.

## İşletmedeki Windows kurulumu (komut yazmadan)

1. Bilgisayar, yazıcının bulunduğu yerel ağa bağlı olmalı. Yazıcının yerel IP adresini öğrenin.
2. Bilgisayarda Node.js **20+ LTS** kurulu olmalı. Değilse çift tıklama kurulumu resmi Node.js indirme sayfasını açar.
3. OynaBak'a İyi Yol Akademi kurucu/yönetici hesabıyla giriş yapın: https://oynabak.com/printer-admin.html
4. Doğru işletmeyi seçin. **Cihaz Eşleştir** ile “Mutfak bilgisayarı” gibi bir ad verin.
5. Tek sefer gösterilen cihaz anahtarını kopyalayın. Anahtarı asla GitHub'a, e-postaya veya ekran görüntülerine koymayın.
6. Bu klasördeki **KURULUM-BASLAT.cmd** dosyasını çift tıklayın. Açılan pencerelere cihaz anahtarı, yazıcı IP adresi, port (genelde 9100) ve 80/58 mm bilgilerini girin.
7. Kurulum programı, yazıcı servisini Windows'un LocalAppData/OynaBak klasörüne kopyalar ve kullanıcı Windows'a giriş yaptığında otomatik başlatılacak kısayolu ekler. Yönetici parolası kullanılmaz.
8. Kurulum sırasında **Türkçe test fişi** çıkarmak isteyip istemediğiniz sorulur; testte kâğıt veya kapak hatası varsa fiş gönderilmez. Deneme fişini **gerçek yazıcıda** doğrulamadan otomatik baskı etkinleştirilmemelidir. Yönetici panelinde cihazın son 10 dakika içinde çevrimiçi olduğu doğrulandıktan ve gerçek test fişinin çıktığı işaretlendikten sonra otomatik yazdırma bilinçli biçimde açılabilir.

## Güvenlik

- Yazıcı servisinde İyi Yol Akademi kurucu şifresi **yoktur**.
- Cihaz başına rastgele üretilen 256-bit token yalnızca eşleştirildiği işletmenin işlerini sorgular.
- Supabase sadece token **SHA-256 özetini** saklar. Asıl token bir kez görüntülenir.
- Yönetici cihazı istediği zaman panelden **Erişimi Kapat** ile iptal edebilir.
- Token işletme bilgisayarında mevcut Windows kullanıcısının okuyabildiği ACL ile korunmuş yerel yapılandırma dosyasına yazılır. Bilgisayarın güvenliğinin de korunması gerekir.
- Yazıcı bağlantısı yalnızca özel yerel IPv4 adreslerine izin verir; internetteki IP adreslerine doğrudan ESC/POS verisi gönderilmez.
- RPC fonksiyonları, diğer işletmelerin kuyruklarını ve cihaz anahtarlarını göstermez.

## Elektrik / bağlantı kesintisi ve çift fiş

- OynaBak'a **ulaşmış ve onaylanmış** siparişin yazdırma işi Supabase PostgreSQL'de saklanır.
- İnternet yokken henüz sunucuya ulaşmamış bir müşteri siparişinin kaydedildiği garanti edilmez; çevrimdışı sipariş özelliği ayrı geliştirme gerektirir.
- Yerel servis kapalıysa işler `pending` durumunda bekler. Cihaz ve bağlantı geldiğinde servis bunları işleyebilir.
- İş tek bir cihaza **atomik olarak** verilir (`FOR UPDATE SKIP LOCKED`, `claim_id`), başka cihaz aynı işi alamaz.
- RONGTA durum protokolü destekleyen cihazda fişten önce DLE EOT 2/3/4 ile **kapak, donanım hatası ve kâğıt sensörü** kontrol edilir; cihaz yanıt vermiyorsa güvenli şekilde durur. Gerçek donanım uyumu doğrulanmalıdır.
- Yazıcıya gönderildikten sonra ağ bağlantısı koparsa durumu **belirsiz** olabilir. İş `printing` kalır; **otomatik yeniden basılmaz**.
- Yetkili yönetici fiziksel fişi kontrol edip sebep yazarak **Kontrollü tekrar** seçeneğiyle yeniden kuyruğa alabilir. Denetim kaydına gerekçe yazılır.
- TCP'ye gönderim, fiziksel kâğıt çıktısının kesin kanıtı değildir. Kâğıt bitmesi/açık kapak gibi mekanik arızalar modelin durum komutlarına göre ayrıca doğrulanmalıdır.

## Türkçe karakterler

Fiş encoder'ı RONGTA'nın 80 serisi komut belgesindeki **ESC t 29 / CP857** kod sayfasını kullanır; ÇçĞğİıÖöŞşÜü karakterleri korunur. Yazıcı firmware/model farkları nedeniyle gerçek cihazda test fişi zorunludur. CP857'de desteklenmeyen bazı özel Unicode işaretleri `?` olarak gösterilir.

Kaynak: Rongta 80 Series Printer Command Set, code page 29 (Turkish).

## Kapsam

Bu sürüm müşteri QR siparişinin **personel tarafından onaylandığı anda** sipariş fişi kuyruğu oluşturur. Garsonun adisyona doğrudan eklediği kalemler ve sipariş değişiklikleri **henüz** yazdırma akışına dahil değildir.

`node --test print-agent.test.mjs` komutu ile birim testler çalıştırılabilir. Gerçek yazıcıyla uçtan uca baskı henüz doğrulanmadı.
