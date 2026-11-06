# OynaBak — Kasa ve Mutfak Tam Otomatik Yazdırma

Bu paket TEK Windows bilgisayarı + İKİ farklı Ethernet termal yazıcı içindir. Sipariş OynaBak'a kaydolunca Supabase'de MUTFAK ve KASA için ayrı yazdırma işleri oluşur. Windows oturumu açıkken resmî Node.js LTS üzerinde çalışan arka plan servisi ikisini de otomatik basar.

Üretim öncesi gerçek RONGTA RP330 firmware, ağ bağlantısı, ESC/POS durum sensörü ve Türkçe CP857 fiziksel olarak doğrulanmalıdır.

## Yarın işletmeye götür
- Windows 10/11 bilgisayar ve internet.
- Mutfak ve kasa için iki ayrı Ethernet termal yazıcı, iki ağ kablosu, kâğıt ve elektrik.
- Resmî Node.js LTS: https://nodejs.org/en/download
- OynaBak Kasa-Mutfak ZIP dosyası (özel imzasız EXE içermez).

## Kurulum
1. İki yazıcıyı aynı modeme bağla. IP adresleri farklı olmalı. DHCP rezervasyonu ile sabitle.
2. Resmî Node.js LTS kur; Windows CMD'de node --version komutunu kontrol et.
3. ZIP dosyasını Tümünü ayıkla ile aç; KASA-MUTFAK-KURULUM.cmd dosyasına çift tıkla.
4. https://oynabak.com/printer-admin.html adresinde işletmeyi seç, Cihaz Eşleştir'den cihaz anahtarını al ve kurulum programına yapıştır.
5. Program önce MUTFAK, sonra KASA yazıcısı için ayrı IP adresi ister. Aramada görünmezse yazıcı ağ bilgi çıktısından IP al.
6. Her iki yazıcıya gerçek test fişleri gönderilir. Kağıdı ve Türkçe karakterleri kontrol et; ikisi de çıktıysa EVET yaz.
7. Windows oturumunda servis otomatik başlayacak şekilde kaydedilir. Aynı işletmede eski OynaBak EXE arka plan servisinin çalışmadığından emin ol.
8. Yönetim panelinden genel yazıcı servisini ve QR otomatik baskıyı kaydet; ardından iki gerçek test onayı verip Kasa + Mutfak iki yazıcı modunu etkinleştir.
9. Gerçek QR menüden bir sipariş oluştur; iki fişin de otomatik çıktığını doğrula.

## İşletmede günlük çalışma
- Sipariş sunucuya ulaşır. Mutfağa ve kasaya bağımsız iki yazdırma işi düşer.
- Bir fiş başarılı olup diğeri başarısız olursa başarıyla basılanın otomatik tekrarı yapılmaz.
- Ağ aktarımı sırasında sonucu belirsiz fiş otomatik tekrar edilmez; yönetici fiziksel fişi kontrol edip yalnız ilgili yazıcıya gerekçeli tekrar yapabilir.
- Bilgisayar kapalı/uykuda veya Windows oturumu kapalıysa fiş çıkmaz; sisteme ulaşan siparişler kuyrukta bekler.

## Uyarılar
- USB/Bluetooth değil, yerel ağ üzerinden TCP/ESC-POS destekli Ethernet yazıcı olmalı.
- İki yazıcının da fiziksel baskı ve sensör testi sahada yapılmadan hizmeti hazır ilan etme.
- Resmî Node.js LTS ücretsizdir. Windows güvenliğini kapatman gerekmez; bazı bilgisayarlar CMD komut dosyasını yine de engelleyebilir.
- Cihaz tokenı yalnız Windows kullanıcı izinleriyle korunan yerel dosyada saklanır; kurucu hesabının şifresi bilgisayara verilmez.
