# OynaBak Yazdırma Merkezi — EXE olmadan kullanım

Tarayıcı ekranı: **https://oynabak.com/printer-browser.html**

Bu yöntem, Windows 11 Smart App Control tarafından engellenen imzasız OynaBak EXE'ye alternatif **gözetimli baskı** sağlar. Kendi exe, CMD, PowerShell, Node.js veya kod imzalama sertifikası gerekmez.

## Kurulum

1. Windows'a resmî üretici tarafından yayımlanmış RONGTA RP330 sürücüsünü yükleyin; yazıcıyı Windows **Yazıcılar ve tarayıcılar** bölümünde ekleyin ve mümkünse **varsayılan yazıcı** olarak ayarlayın. Yazıcı ağ bağlantılıysa aynı ağda olmalı.
2. Edge veya Chrome'da https://oynabak.com/printer-browser.html açın.
3. Kurucu, https://oynabak.com/printer-admin.html adresinden doğru işletme için cihaz anahtarı eşleştirir.
4. Anahtarı tarayıcıdaki **Güvenli bağlan** alanına yapıştırın. İşletmenin gerçek yazdırma kayıtları görünür. Anahtar tarayıcının kalıcı depolama alanına yazılmaz.
5. **Fiziksel test fişi aç** ile Windows yazdırma penceresinden **80 mm termal yazıcıya test fişi** basın; fiziksel kâğıt ve Türkçe karakterleri kontrol edin.
6. Yönetici panelinde ilgili işletme için yazdırma kuyruğunu etkinleştirin. Normal QR siparişleri oluşunca **Sıradaki siparişi hazırla** ile bekleyen gerçek siparişi seçin.
7. **Yazdırma penceresini aç** düğmesi tarayıcı sistem yazdırma diyalogunu açar. Baskı fiziksel olarak çıktıysa **Fiş kâğıda çıktı, onayla** seçin. Bu onay verildiğinde iş `printed` olarak kaydedilir.
8. Tarayıcı sekmesini iş saatlerinde açık tutun. Aynı işletmede eski otomatik Windows EXE servisini kapatın; iki bağlantıyı aynı kuyruğa bağlamayın.

## Açık sınırlar

- **Tam otomatik/sessiz yazdırma DEĞİLDİR.** Tarayıcı güvenlik sınırlamaları nedeniyle Windows masaüstünde `window.print()` normalde yazdırma penceresi açar. Test edilmemiş kiosk parametreleriyle üretimde sessiz baskı vaat etmeyin.
- Gözetimsiz tam otomatik yazdırma için imzalı ve fiziksel olarak test edilmiş yerel bağlayıcı veya desteklenen kurumsal baskı çözümü gerekir.
- Yanlışlıkla pencere kapanır veya işlem yarıda kalırsa görev `printing` statüsünde kalabilir ve yönetici incelemesi gerektirir. Çift fişi önlemek için otomatik tekrar yoktur.
- Fişin kâğıda çıktığı yalnızca kullanıcı tarafından doğrulanabilir; tarayıcı yazdırma isteğini teslim edebilir ama fiziksel çıktıyı kesin kanıtlayamaz.
- Kâğıt ölçüsü ve karakter görünümü Windows yazıcı sürücüsüne bağlıdır; 80 mm termal fiş için doğru sürücü ve kâğıt profili gerekir.
- Sistemin Supabase cihaz anahtarı yereldir; anahtar kaybolursa yönetici panelinden yeniden eşleştirme yapın. Anahtarı başka kimseyle paylaşmayın.
- Bu yöntem yalnızca tek işletmenin eşleştirilmiş cihaz kapsamındaki verilerini getirir.
