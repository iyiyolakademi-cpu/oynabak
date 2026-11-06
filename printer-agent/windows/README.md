# OynaBak Yazıcı – Tek Dosyalık Windows Kurulumu

**Teknik hedef:** Windows 10/11 x64 bilgisayarında Node.js, PowerShell komutu veya .NET Runtime yüklemeden `OynaBak-Yazici.exe` dosyasını çalıştırabilmek.

- .NET 8 WinForms, `SelfContained=true`, `PublishSingleFile=true`, Windows x64.
- GitHub Actions üzerindeki Windows bilgisayarda derlenir ve `printer-windows-v1` GitHub Release sürümüne yüklenir.
- İndirme adresi: https://github.com/iyiyolakademi-cpu/oynabak/releases/download/printer-windows-v1/OynaBak-Yazici.exe
- Derleme yayınlanmadan bu bağlantının çalıştığı varsayılmamalıdır.

## İşletmede kurulum

1. RONGTA RP330 yazıcıyı **Ethernet kablosuyla modeme** bağlayın, termal kâğıdı yerleştirin; Windows bilgisayar aynı ağda olsun.
2. Kurulum programını indirin ve çift tıklayın. Program kendini `%LOCALAPPDATA%\OynaBak\OynaBak-Yazici.exe` yoluna kurar.
3. [İyi Yol Akademi Yazıcı Yönetimi](https://oynabak.com/printer-admin.html) sayfasına kurucu/yönetici hesabıyla giriş yapın, doğru işletmeyi seçin ve **Cihaz Eşleştir** ile bir kere gösterilen anahtarı oluşturun.
4. Anahtarı OynaBak Windows programına yapıştırın. **Yazıcıları Bul**'a basın; yazıcının IP adresi bulunmuyorsa elle girin. Port genelde `9100`, kâğıt `80 mm`.
5. **Test Fişi Yazdır**'a basın. Termal fişin kâğıda çıktığını ve Türkçe karakterleri doğrulayın.
6. **Kaydet ve Çalıştır**'a basın. Program oturum açıldığında otomatik başlar (HKCU Run). Windows kullanıcısının oturumu açık kalmalıdır.
7. İyi Yol Akademi panelinden **Yazıcı servisini etkinleştir** ve **Otomatik yazdır** seçeneklerini açın. Panel çevrimiçi cihaz ve fiziksel test onayı arar.

## Sınırlamalar

- Windows uygulaması için **ilk gerçek RP330 cihaz testi ve sahada kurulum henüz yapılmamış olabilir**; yazıcı firmware'inde ESC/POS CP857 sayfası ve DLE EOT sensörleri doğrulanmalıdır.
- Yazıcı yalnızca yerel ağda IPv4 Ethernet/TCP bağlantısında çalışır; USB/Bluetooth sürücüsü dahil değildir.
- Port 9100 taraması tek başına cihazın gerçekten yazıcı olduğunu kanıtlamaz; test fişi zorunludur.
- Program Windows kullanıcı oturumunda çalışır, **Windows hizmeti değildir**. İşletmede bilgisayar kapalıysa fiş basılmaz. Windows oturumu otomatik açılmıyorsa açılması gerekir.
- İlk çalıştırmada imzasız yazılım için Windows SmartScreen uyarısı görünebilir; henüz kod imzalama sertifikası kullanılmıyor.
- Yazıcıya TCP üzerinden gönderilen baytların kâğıda kesin çıktığı garantisi yoktur. Sorunlu siparişlerde yönetici panelinden gerekçeli tekrar baskı vardır.
- Veritabanına ulaşmış QR siparişlerinin yazdırma kuyruğu kalıcıdır; internetten hiç iletilememiş siparişler ayrıca kayıt edilmez.
- Cihaz tokenı Windows kullanıcısına bağlı DPAPI ile şifrelenir, **kurucu hesabının parolası bilgisayarda saklanmaz**.
- Kurulum dosyası başka bir klasörden başlatıldığında mevcut çalışan uygulamayı otomatik güncellemeyi içermez.

## Geliştirici

```powershell
dotnet publish printer-agent/windows/OynaBak.Yazici.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o out
out/OynaBak-Yazici.exe --self-test
```

Eski `printer-agent/KURULUM-BASLAT.cmd` Node.js gerektiren alternatif kurulumdur. Yeni tek .exe kurulumunda bu dosyaya gerek yoktur.
