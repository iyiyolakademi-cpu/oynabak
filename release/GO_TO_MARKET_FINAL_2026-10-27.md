# OynaBak · Satışa Çıkış Final Kontrol Raporu
**Tarih:** 27 Ekim 2026  
**Kapsam:** GitHub `iyiyolakademi-cpu/oynabak` `main`; Supabase projesi `qacmubkcierbpxmdtsph`.  
**Karar:** **Temel OynaBak paketi için kontrollü satış/pilot yapılabilir.** Adisyon + QR sipariş + mutfak/bar + finans modüllerini **fiziksel cihazda kabul testi olmadan “tamamen sorunsuz” olarak vaat etmeyin**.

## 1. İncelenen sistemler ve kanıtlar
| Kategori | Bulgular | Sonuç |
|---|---|---|
| GitHub | Node 22 kod/sözdizimi regresyon kontrolleri; GitHub Pages yayımlama iş akışı | Otomatik işler başarılı; gerçek tarayıcı testinin yerini tutmaz |
| Supabase | Veritabanı `ACTIVE_HEALTHY`; genel şemada 33 tablonun 33'ünde RLS etkin | Temel güvenlik katmanı mevcut; tüm RPC yetkileri ayrıca gözden geçirilmeli |
| İşletmeler | 3 aktif, lisanslı işletme; 3 menü; yaklaşık 394 ürün | Gerçek veri ve işletme bazlı ayarlar mevcut |
| Adisyon | 2 işletmede etkin; bir adet uzun süredir bekleyen QR sipariş kaydı var | Eski/pilot kayıt manuel değerlendirilmeli; silinmedi |
| Garson çağırma | Yeni koruma: aynı masa anahtarı normalize edilir; eşzamanlı çağrı kilitlenir; açık çağrı sınırları uygulanır; 500 kayıt okunabilir | Canlı DB migration uygulandı; test işleminde çalıştırıldı ve geri alındı |
| Oyun | Okey'de çift kopya taşın tek hamlede beraber silinmesi sunucu tarafında düzeltildi | SQL doğrulandı; gerçek iki telefonlu maç testi gerekli |
| Anonim etkileşim | Telemetride aktif/lisanslı işletme kontrolü ve dakika başına üst sınır | Canlı migration uygulandı; sahte işletme reddi ve geçerli test kaydı geri alınarak doğrulandı |
| Giriş/izolasyon | Normal merchant'ın diğer etkin işletmenin adisyonuna erişememesi JWT bağlamıyla simüle edildi | Başarılı; gerçek kullanıcı cihazı kabul testi gerekli |
| KVKK ve paket | Web metinleri QR sipariş ve garson çağırma için güncellendi; 4.000 TL temel paket / ek ücretli operasyon modülü ayrımı açıklandı | Hukukçu/muhasebeci incelemesi yine gerekli |
| Performans | Tek sayfa HTML ~635 KB kaynak; 3 menü kaydı toplam ~312 KB JSON | Gerçek Android/iPhone, zayıf ağ, uzun süre açık panel ve yük testi henüz yok |

### Supabase güvenlik danışmanı
- `auth_leaked_password_protection` uyarısı var. Supabase Auth e-posta sağlayıcısından sızdırılmış parola engeli açılmalı (uygun planda), en az 8 karakter ve güçlü parola kuralları uygulanmalı.
- 21 adet `anon` çağrılabilen `SECURITY DEFINER` fonksiyonu raporlandı. Bir kısmı zorunlu QR/oyun API'sidir; yalnız sayısı nedeniyle hepsini kapatmak müşteri ekranını bozar. Her yeni RPC'ye izin, işletme, kullanıcı, giriş ve oran sınırı testi eklenmeli.
- “RLS açık ama politika yok” bulgularından bir kısmı doğrudan tablo yetkisi kapalı, yalnız kontrollü RPC'lerle erişilebilen tablolardır. Uyarı **otomatik olarak açık veri** anlamına gelmez.
- Supabase'inki gibi statik linter uyarılarını “tamamen temiz” kabul etmeyin.

## 2. Satılacak ürünün gerçek kapsamı
**Web sitesinde ilan edilen temel paket:** lansmana özel **4.000 TL tek seferlik**; QR standı, ilk kurulum, işletmeye özel müşteri ekranı, hazır ve yetkilendirilmiş oyunlar, dijital menü, Google değerlendirme yönlendirmesi ve temel kullanım istatistikleri. Sitede yıllık ücret yok deniyor. Online ödeme siteden alınmıyor.

**Ayrı teklif / etkinleştirme:** Garson çağrıları, QR sipariş, adisyon, mutfak/bar, personel operasyon ekranları ve ön muhasebe. Bu modüllerin fiyata otomatik olarak dahil olduğunu söylemeyin. Adisyon **tahsilat, sanal POS veya mali fiş** değildir. Okey/Pişti farklı oyun izinlerine ve mevcut pilot işletme sınırlarına sahiptir.

**Ticari risk:** 4.000 TL tek seferlik, yıllık ücreti olmayan modelin sunucu, destek, bakım, stand üretimi, vergi ve operasyon maliyetleri sonrası kârlılığı henüz doğrulanmadı. Satışta bu fiyatı bağlayıcı olarak kullanmadan önce net kapsam, stand adedi, vergi ve ek geliştirme fiyatları tek sayfalık yazılı teklifte açıklanmalı.

## 3. Fiziksel cihazlarla zorunlu kabul testi (henüz yapılmadı)
- [ ] İşletme A hesabıyla panel aç; B'nin menü, adisyon, istatistik verilerinin görünmediğini doğrula.
- [ ] Mevcut basılı QR koduyla gerçek Android ve iPhone'da menü/oyun aç; yanlış işletme veya kod ekranı olup olmadığını kontrol et.
- [ ] 3, 10 ve 35 masalı planda sürükle-bırak; **Kaydet ve onayla**; iki cihazda aynı planı gör; sürüm çakışmasında eski planın yeni planı ezmediğini doğrula.
- [ ] Yeni menü kategorisi, alt kategori, ürün/varyant ekleme, tükendi ve sürükleyerek sıralama; müşterinin menüsüne yansıma.
- [ ] Müşteri telefonu QR sipariş gönderir → açık tablet bildirimi → tek yetkili işletme hesabı onaylar → mutfak/bar hazır → servis edildi → manuel kapatma; ürün adedi ve toplam doğruluğu.
- [ ] Aynı anda iki telefondan QR sipariş ve garson çağrısı; çift işleme, gecikme veya kaybolan bildirim olmaması.
- [ ] 'Bildirim sesini aç' bir kez etkinleştirilince aktif/açık ekranda garson çağırma sesiyle aynı alarmın tekrarlanması ve susturulunca yalnız mevcut alarmın kesilmesi.
- [ ] Telefon ekranı kilitli/arka plan durumlarında sesin OS tarafından kısıtlanmasını kaydet; **garantili kesintisiz ses** vaat etme; sabit ekranlı tablet kullan.
- [ ] Wi-Fi kes, geri aç: işlem sırasında veri kaybı, tekrar sipariş ve yanlış durum oluşmadığını sınama; 15 saniye yedek sorgu.
- [ ] Okey/Pişti oyunlarını izinli pilot işletmede karşılıklı iki cihazla tam maç ve kopma/yeni bağlanma senaryosunda dene.
- [ ] İşletme paket özelliğini kapatınca o işletmenin operasyon girişini engelle, diğer işletmenin ekranını etkileme.
- [ ] Bilgisayar, tablet, küçük Android ve iPhone üzerinde ana sayfa, modal, menü, masa planı, sipariş ve panel taşmalarını kontrol et.
- [ ] Gerçek kullanıcı destek akışını test et: hata çıktığında log, ekran görüntüsü, sorun takibi ve geri dönüş sorumlusu.
- [ ] Son 13+ saatlik bekleyen QR siparişinin test mi gerçek mi olduğunu belirle; gerçekse yetkili işletme çözsün, testse kontrollü şekilde sonuçlandır.
- [ ] Supabase Database → Backups bölümünden yedek/geri yükleme imkânını ve planını doğrula. Geri yüklemeyi üretimi bozmadan kopyada dene.
- [ ] Alan adı, SSL, iOS Safari ve Android Chrome üzerinden gerçek satış öncesi erişim testi; araçlarda site ulaşılabilirliği doğrudan doğrulanamadı.
- [ ] 10/35/100+ masa ve eşzamanlı müşteri yükü için gecikme, hata oranı ve veritabanı maliyeti ölçümü.

## 4. Hukuki ve ticari satış kapıları
- [ ] Satış yapan kişi/şirketin resmî ticari unvanı, vergi/fatura düzeni, adresi ve iletişim bilgileri yazılı teklifte ve uygun yasal metinlerde yer alıyor mu?
- [ ] KVKK işleme faaliyetleri, veri sorumlusu/veri işleyen rolleri, veri saklama ve silme süreçleri, QR kullanıcı notları ve işletme adına kayıt tutulması hukukçu tarafından gözden geçirildi mi?
- [ ] Mesafeli satış/yazılı ticari sözleşme, teslim/aktivasyon, iade/iptal, güncellemeler, destek sınırları, üçüncü taraf servisleri ve uyuşmazlık yöntemleri net mi?
- [ ] 4.000 TL'nin KDV dahil/hariç olması, kaç stand teslim edileceği ve gönderim/kargo maliyeti müşteriye teklif içinde açık mı?
- [ ] 'Yıllık ücret yok' açıklamasının bakım ve bulut maliyetleri bakımından sürdürülebilirliği hesaplandı mı?
- [ ] GitHub deposu herkese açık. Web istemci kodu zaten ziyaretçilerce görülebilir; SQL ve geliştirme dokümanlarının public olmasının ticari etkisi ayrıca değerlendirilsin. Depoyu plansız private yapıp GitHub Pages dağıtımını bozmayın.
- [ ] Paylaşılan tek işletme e-posta/şifresi ile tüm çalışanların giriş yapması güvenlik ve denetim izini sınırlar. Güçlü parola, cihaz çıkışı ve kaybolan cihaz prosedürü net olsun.

## 5. Müşteriye üç dakikalık satış demosu
1. **Masadaki QR'ı okut:** “Müşteriniz uygulama indirmeden menüye ve işletmenin sunduğu oyunlara ulaşır.”
2. **Menüyü aç:** Kategoriler, fiyatlar, varyantlar ve tükendi işaretini göster.
3. **Kısa oyunu göster:** İşletmenin etkin kütüphanesindeki bir oyunu aç; oyunun işletme bazında izinli olduğunu açıkla.
4. **Google değerlendirme ve temel analitiği göster:** Sonuç garantisi verme; kullanım verilerinin gösterge olduğunu belirt.
5. **Paneli aç:** İşletme menüsünü değiştirsin; kullanım özeti ve lisans durumunu göster.
6. **Ek operasyon modülü:** Yalnız lisansı açık ve cihazla test edilen işletme için ayrı ücretli olarak demo göster; QR menü ile adisyonu veya para tahsilatını karıştırma.

## 6. İlk 5 ücretli müşteri için işletim
- İlk kurulum tutanağı: işletme bilgisi, lisans, stand adedi, QR bağlantısı, menü ve oyun özellikleri, teslim tarihi.
- Bir gün içinde demo ve QR kabulü; ilk hafta günlük erişim/sipariş/garson bildirimleri takibi (müşteriye taahhüt olarak verilmeden önce fiilî kapasiteye göre belirlenmeli).
- Destek için tek kanal ve kayıt sistemi; sorun bildirimleri, cihaz modeli, saat ve ekran görüntüsü ile takip.
- Her hafta hata kayıtları, müşteri aktifliği ve altyapı maliyeti; 5 müşteri sonrasında fiyat/marj ve ek paket stratejisini yeniden değerlendir.

## 7. Son karar
**Yeşil:** Kod kontrolü, GitHub Pages yayını, lisanslı veritabanı, menü yapısı, temel QR/oyun özellikleri, tenant izolasyonunun simüle testi, temel paket tanımı.

**Sarı:** Canlı garson/QR adisyon akışı; gerçek cihaz ve yüksek eşzamanlılık testi; menü/oyun son kullanıcı kabulü; cihaz kilidinde bildirim sınırları.

**Kırmızı kapılar:** Hukuki satış/fatura/teklif koşulları ve yedekleme prosedürü kesinleşmeden ölçekli kurumsal satış; çevrimiçi ödeme veya fiş kesme gibi sistemde olmayan özellikleri vaat etmek; tüm cihazlarla %100 hata garantisi vermek.

**Öneri:** Temel paketi **2–3 işletmede kontrollü ücretli pilot** olarak sat; opsiyonel operasyon paketini cihaz testlerini geçtikten sonra ayrıca teklif et. “Ürün tamamen bitti, her özellik kusursuz” iddiası şu aşamada doğrulanamaz.
