# OynaBak Yazıcı – Tek Dosyalık Windows Kurulumu

**Teknik hedef:** Windows 10/11 x64 bilgisayarında Node.js, PowerShell komutu veya .NET Runtime yüklemeden `OynaBak-Yazici.exe` dosyasını çalıştırabilmek.

- .NET 8 WinForms, `SelfContained=true`, `PublishSingleFile=true`, Windows x64.
- GitHub Actions üzerinde Windows x64 olarak tek dosyaya derlenir. **Derlenmiş dosyanın imzasız olması, Windows Smart App Control tarafından engellenmesine neden olabilir.**
- Üretim için ayrıca **güvenilir RSA kod imzalama sertifikasıyla** Authenticode imzası gerekir.
- Güvenilir imzalı sürüm: https://github.com/iyiyolakademi-cpu/oynabak/releases/tag/printer-windows-signed-v1 (**sertifika bağlanıp imzalama başarılı olana kadar yayınlanmaz**).
- Kod imzalama yapılandırması: `.github/workflows/printer-windows-signed-release.yml` (elle tetiklenen, imzasız yayımlamayı reddeden işlem).
- İmzasız GitHub Actions derlemeleri yalnızca geliştirici testleri içindir; işletmelere kurulum dosyası diye dağıtılmamalıdır.
- İmzalı sürüm için GitHub ortamı `production-signing` üzerinde `OYNABAK_SIGN_PFX_BASE64` ve `OYNABAK_SIGN_PFX_PASSWORD` sırları tanımlanır. Her iki değer yoksa üretim yayını DURUR. Sertifika özel anahtarı GitHub deposuna eklenmez.
- Bir CA tarafından verilen güvenilir RSA Authenticode kod imzalama sertifikası gerekir; kendi kendine imzalı sertifika Smart App Control engelini çözmez.

## İşletmede kurulum

1. Yalnızca kod imzası doğrulanmış **imzalı sürümü** kullanın. Windows'ta dosya Özellikleri → Dijital İmzalar bölümünde yayıncıyı doğrulayın. RONGTA RP330 yazıcıyı **Ethernet kablosuyla modeme** bağlayın, termal kâğıdı yerleştirin; Windows bilgisayar aynı ağda olsun.
2. Yeni kurulum programını indirin ve çift tıklayın. Programı Windows'a uygun, sürümüne özgü bir dosya adıyla `%LOCALAPPDATA%\OynaBak` klasörüne kopyalar; böylece eski açık .exe dosyasının üzerine yazmaz. Eski OynaBak programı hâlâ çalışıyorsa sağ alt simgeden **Çıkış** seçip yeni programı tekrar açın.
3. Uygulamadaki **1 İşletmeyi OynaBak'a bağla** bölümünden [İyi Yol Akademi Yazıcı Yönetimi](https://oynabak.com/printer-admin.html) sayfasına kurucu/yönetici hesabıyla giriş yapın, doğru işletmeyi seçin ve **Cihaz Eşleştir** ile bir kere gösterilen anahtarı oluşturun.
4. Anahtarı OynaBak Windows programına yapıştırın. **2 Yazıcıyı bul** bölümünde **Yazıcıları Tara**'ya basın; yazıcının IP adresi bulunmuyorsa elle girin. Port genelde `9100`, kâğıt `80 mm`; bunlar **Gelişmiş ayarlar** bölümündedir.
5. **3 Deneme fişi çıkart ve tamamla** bölümünden **Test Fişi Çıkar**'a basın. Termal fişin kâğıda çıktığını ve Türkçe karakterleri doğrulayın.
6. **Kaydet ve Başlat**'a basın. Program oturum açıldığında otomatik başlar (HKCU Run). Windows kullanıcısının oturumu açık kalmalıdır.
7. İyi Yol Akademi panelinden **Yazıcı servisini etkinleştir** ve **Otomatik yazdır** seçeneklerini açın. Panel çevrimiçi cihaz ve fiziksel test onayı arar.

## Sınırlamalar

- Windows uygulaması için **ilk gerçek RP330 cihaz testi ve sahada kurulum henüz yapılmamış olabilir**; yazıcı firmware'inde ESC/POS CP857 sayfası ve DLE EOT sensörleri doğrulanmalıdır.
- Yazıcı yalnızca yerel ağda IPv4 Ethernet/TCP bağlantısında çalışır; USB/Bluetooth sürücüsü dahil değildir.
- Port 9100 taraması tek başına cihazın gerçekten yazıcı olduğunu kanıtlamaz; test fişi zorunludur.
- Program Windows kullanıcı oturumunda çalışır, **Windows hizmeti değildir**. İşletmede bilgisayar kapalıysa fiş basılmaz. Windows oturumu otomatik açılmıyorsa açılması gerekir.
- **Şu an geçerli OynaBak imzalı sertifikası bağlanmadığından** kurulum dosyası Smart App Control tarafından engellenebilir. Güvenliği kapatmayın; yalnızca yayıncı imzası doğrulanmış yeni sürümü kullanın.
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
