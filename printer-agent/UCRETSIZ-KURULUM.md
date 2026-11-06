# OynaBak – ÜCRETSİZ Windows Yazıcı Bağlantısı

**Amaç:** Microsoft Smart App Control nedeniyle engellenebilen *imzasız özel OynaBak.exe* dosyasını kullanmadan, **resmî Node.js LTS** ile OynaBak QR siparişlerini Ethernet yazıcıya bağlamak.

**Ücret:** OynaBak'ın bu bağlantı yazılımı ve resmî Node.js ücretsizdir. Ek kod imzalama sertifikası satın alınmaz.

## Kolay kurulum

1. İşletme bilgisayarında **resmî** Node.js LTS kurulu değilse https://nodejs.org/en/download adresinden Windows sürümünü indirin ve kurun. Windows güvenlik korumalarını kapatmayın.
2. İndirdiğiniz **OynaBak-Ucretsiz-Yazici-Kurulum.zip** dosyasını **Tümünü ayıkla** ile açın. ZIP içindeki dosyaları tek tek çalıştırmayın.
3. Açılan klasörde **KURULUM-BASLAT.cmd** dosyasına çift tıklayın.
4. [OynaBak Yazıcı Yönetimi](https://oynabak.com/printer-admin.html) sayfasında kurucu hesabıyla giriş yapın, işletmeyi seçin ve **Cihaz Eşleştir** düğmesinden tek seferlik anahtar oluşturun.
5. Bu anahtarı açılan kurulum penceresine yapıştırın. Anahtar ekranda gizlenir.
6. Program Ethernet yazıcıları arar. Doğru yazıcıyı seçin; bulunmazsa yazıcının yerel IPv4 adresini girin. Standart bağlantı **9100 port / 80 mm**.
7. **Test fişi çıkar** sorusuna evet deyin. Gerçek fişin çıktığını ve Türkçe karakterlerin düzgün basıldığını kontrol edip onaylayın.
8. Yönetim panelinde ilgili işletme için **Yazıcı servisini etkinleştir** ve **Otomatik yazdır** seçeneklerini açın. Artık müşteri QR menüden sipariş verdiğinde tek iş kuyruğa düşer ve bilgisayardaki bağlantı servisinden yazıcıya gönderilir.

## İşletme bilgisayarına ne yüklenir?

- Windows kullanıcı profilinde `%LOCALAPPDATA%\OynaBak\print-agent.mjs`: Yazdırma servisi.
- `%LOCALAPPDATA%\OynaBak\printer.json`: Sadece bu işletmenin cihaz anahtarı ve yazıcı IP adresi (Windows dosya izinleriyle kısıtlı).
- Windows Başlangıç klasöründe `OynaBak-Yazici.cmd`: Kullanıcı oturumu açıldığında tekrar başlatır.
- Kurucu/yönetici hesabının e-posta veya şifresi bilgisayara kaydedilmez.

## Önemli sınırlar

- Bu yöntem **Node.js LTS'nin bir kere kurulmasını gerektirir**; hiçbir uygulama indirmeden tamamen tarayıcıdan otomatik termal baskı yapılamaz.
- Sadece **Windows + Ethernet ESC/POS yazıcı + aynı yerel ağ** destekleniyor; USB/Bluetooth için uygun değildir.
- Bilgisayar kapanır veya Windows kullanıcısı oturumu kapatırsa fiş çıkmaz. Sunucuya ulaşmış siparişler kuyrukta bekler.
- Yazıcı erişimi/ağ/sensör testi başarısızsa otomatik baskı açılmamalıdır.
- **Node.js kurulum paketi resmî kaynaktan indirilmeli**; üçüncü taraf sitelerden indirilmemelidir.
- Smart App Control'un uyguladığı güvenlik ilkeleri bilgisayara göre değişebilir. Bu yöntem imzasız özel EXE kullanmadığı için daha uygun olsa da **her bilgisayarda çalışacağı garanti değildir**. Smart App Control veya Windows Defender bir dosyayı engellerse güvenliği kapatmayın.
- Gerçek RONGTA RP330 cihazında fiziksel fiş henüz doğrulanmadı; önce test fişi alın.
- Cihaz tokenını herkese açık yerde paylaşmayın.
- Tek başına yazıcıya TCP gönderimi kâğıt çıktısını kesin doğrulamaz; belirsiz işler OynaBak panelinden kontrollü yeniden basılır.

## Teknik kontrol

`node --check kolay-kurulum.mjs`, `node --check print-agent.mjs`, `node --test print-agent.test.mjs` ile doğrulanır. Windows'u simüle etmek, gerçek donanım testi yerine geçmez.
