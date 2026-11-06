# OynaBak Yazıcı – Tek Dosyalık Windows Kurulumu

**Windows 10/11 x64**, RONGTA RP330 Ethernet ESC/POS yazıcı için tek .exe kurulum. Node.js ve terminal gerekmez.

1. Yazıcının Ethernet kablosuyla işletmenin modemine bağlı ve içinde 80 mm kâğıt olduğundan emin olun.
2. [İyi Yol Akademi Yazıcı Yönetimi](https://oynabak.com/printer-admin.html) ekranında işletmeyi seçip **Cihaz Eşleştir** ile anahtar oluşturun.
3. [OynaBak Windows test sürümü](https://github.com/iyiyolakademi-cpu/oynabak/releases/tag/windows-printer-test) sayfasından **OynaBakYazici.exe** dosyasını indirin (yalnızca başarılı derlemeden sonra görünür). Program henüz dijital imzalı değildir; Windows SmartScreen uyarısı çıkabilir.
4. Dosyayı açın, cihaz anahtarını yapıştırın, **Yazıcı Ara** ile cihazı bulun. Adaylardan doğru IP adresini seçin veya elle girin. Varsayılan port 9100'dür.
5. **Test Fişi Yazdır** butonuna basın. Fiziksel çıktıyı ve Türkçe karakterleri kontrol edin.
6. Testi doğrulayıp **Kurulumu Tamamla** butonuna basın. Kurulum, programı Windows kullanıcısının LocalAppData/OynaBak/Printer klasörüne kopyalar, cihaz anahtarını Windows DPAPI ile şifreler, kullanıcı oturumunda otomatik başlatır.
7. İyi Yol Akademi panelinde cihazın **son bağlantı** zamanını doğrulayıp ilgili işletme için yazıcıyı ve **otomatik QR yazdırmayı** etkinleştirin.

**Önemli:** Test fişi fiziksel olarak çıkmadan otomatik baskıyı açmayın. TCP'ye veri iletilmesi fiziksel baskının kesin kanıtı değildir. Windows hesabına giriş yapılmadığında veya bilgisayar uyku/kapalı durumundayken baskı işlemi çalışmaz; Supabase'e kaydedilmiş siparişlerin yazdırma işleri sırada bekler.

## Teknik korumalar
- Cihaz anahtarı tek bir işletmenin yazdırma görevlerine erişebilir. Kurucu şifresi işletme bilgisayarına girilmez.
- Sunucuda tek iş/tek cihaz kilidi, işlem denetimi ve gerekçeli manuel tekrar vardır.
- Türkçe ESC/POS CP857, 58/80 mm kağıt, DLE EOT kâğıt/kapak ön kontrolü desteklenir. RP330 firmware uyumu gerçek cihazda doğrulanmalıdır.
- Yerel ağ taraması yalnızca TCP 9100 açık cihaz adaylarını bulur; marka/modeli otomatik kesin teşhis etmez.
- Üretime almadan gerçek cihaz, Türkçe fiş, yeniden başlama ve ağ kesintisi testleri yapılmalıdır.

Kaynak proje: `OynaBakYazici/`. GitHub Actions: `.github/workflows/build-oynabak-printer.yml`. Çıktı Windows **64-bit tek .exe** dosyasıdır; ayrıca Node.js kurulumu gerekmez.