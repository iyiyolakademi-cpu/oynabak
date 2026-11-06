# OynaBak — QR Sipariş Otomatik Fiş Kurulumu

**Yapılacak tek iş:** Müşteri QR menüde Siparişi Ver düğmesine basar → mutfağın (varsa kasanın da) termal yazıcısından sipariş fişi çıkar.

## Windows'a kurulum

1. İşletme bilgisayarına **ücretsiz resmî Node.js LTS** yükleyin: https://nodejs.org/en/download
2. Bu ZIP dosyasına sağ tıklayın → **Tümünü ayıkla**.
3. Açılan klasörde **OYNABAK-KURULUM.cmd** dosyasına çift tıklayın.
4. **1** yazın: Tek yazıcı / **2** yazın: Mutfak ve kasa, iki ayrı yazıcı.
5. https://oynabak.com/printer-admin.html adresinde yönetici oturumuyla doğru işletmeyi seçin → **Cihaz Eşleştir** → anahtarı kurulum ekranına yapıştırın.
6. Yazıcıları aynı yerel ağa Ethernet ile bağlayın. Program bulduğu cihazları listeler; doğru IP adresini seçin. İki yazıcıda IP adresleri farklı olmalıdır.
7. Kurulumda yazıcının **80 mm veya 58 mm** kâğıt kullandığını seçin; yönetim panelindeki kâğıt genişliğini de aynı ayarlayın. Termal yazıcıdan **gerçek test fişini** çıkarın ve kağıtta ürünleri, Türkçe karakterleri, kesiciyi kontrol edip onaylayın.
8. Yönetici panelinden **Yazıcı servisini etkinleştir** + **QR siparişlerini doğrudan otomatik yazdır** ayarlarını kaydedin. İki yazıcı için ayrıca **Kasa + Mutfak iki yazıcı modu** ayarını açın.
9. İşletmenin gerçek QR menüsünden bir sipariş gönderip gerekli sayıda fiş çıktığını doğrulayın.

### Önemli şartlar
- Ethernet bağlantılı ESC/POS uyumlu yazıcı olmalı; USB/Bluetooth bu paketle çalışmaz.
- Bilgisayar açık, Windows kullanıcı oturumu açık ve bilgisayar uykuya geçmiyor olmalı.
- Aynı işletmede eski OynaBak EXE veya diğer yazdırma uygulaması aynı anda açık olmamalı.
- İki yazıcıdan biri arızalanırsa başarılı fiş otomatik tekrar edilmez. Yönetici sadece sorunlu yazıcıya gerekçeli tekrar baskı yapabilir.
- İlk gün fiziksel yazıcı testini yapmadan **üretime hazır** saymayın.
- Ücretsizdir ve özel imzasız EXE içermez; Windows güvenliğini kapatmayın. Bazı güvenlik politikaları CMD dosyalarını da engelleyebilir.
- Program yazıcıları yalnızca ağdaki TCP/9100 üzerinden tarar. Tarama başka cihazları da listeleyebilir: **doğru yazıcıyı mutlaka test fişiyle doğrulayın**.

## Fiş içeriği
Masa numarası, ürün ve adetler, ürün/müşteri notları. İki yazıcı seçildiğinde kasa ve mutfak için ayrı başlıklı fişler basılır; ikisi de sipariş ürünlerini görür.

## Güncel profesyonel fiş tasarımı

- Üstte ortalı OYNABAK, hemen altında **MUTFAK SİPARİŞİ / KASA SİPARİŞİ** (tek yazıcı için YENİ SİPARİŞ).
- Ortada 2 kat büyük **MASA 5** başlığı; harfli çek/adisyon numarası yoktur.
- Ürün ve adetleri kalın, notlar alt satırda; müşteri notu varsa ayrı SİPARİŞ NOTU alanı.
- Altta Türkiye saatine göre tarih ve saat ve ESC/POS otomatik kâğıt kesme komutu.
- 80 mm / 58 mm için ayrı satır genişliği kullanılır. Gerçek baskıda Türkçe karakterler ve kâğıt kesiciyi doğrulayın.
- Tek yazıcı: çıktı yalnız bir yazıcıya. İki yazıcı: aynı siparişin kasa ve mutfak için ayrı, her biri bağımsız takip edilen fişi.

**Önemli:** Kod testleri gerçek kâğıt çıktısı değildir. İlk kurulumda iki yazıcı kullanılıyorsa iki fiziksel fişin de çıktığını doğrulayın.
