# OynaBak — 27 Ekim 2026 satış öncesi teknik teslim tutanağı

## Korunan iş akışı
- İşletmenin **mevcut OynaBak e-posta/şifresi**, tek site ve mevcut basılı QR kodları aynen korunur.
- İşletme için ayrıca personel hesabı, PIN veya yeni QR zorunluluğu eklenmedi.
- Ödeme/tahsilat fonksiyonu **eklenmedi**; adisyon tutarı tahsilat değildir.
- QR menü, oyun ve tek hesap giriş akışları mevcut sürümle uyumlu tutuldu.

## Tamamlanan kod/veritabanı düzeltmeleri
1. Aktif/lisanslı işletme kontrolü adisyon sunucu yetkilendirmesine eklendi.
2. Legacy `ob_event` yalnız yeni anonim istatistik kapısından geçer.
3. Anonim istatistik yazma limiti işletme bazında işlemsel kilitle korunur.
4. Oyun puanı için sunucu doğrulama sınırları geliştirildi. İstemci puanları maddi ödül veya ödeme kanıtı sayılmaz.
5. Toplu anonim oyun medyası sorguları 64 kimlikle sınırlandı; gereksiz veya geçersiz kimlikler reddedilir.
6. Lisansı kapalı işletmelerin eski QR işletme kodları yeni çözümlerde eşleşmez.
7. Sunucu aynı konuma konan masaların yeni floor plan kayıtlarını reddeder; istemci görsel çakışmaları kayıt öncesi denetler.
8. Adisyon Realtime sinyalleri sürmekte olan sorgu sırasında gelirse sonraki yenileme sırasına alınır; 15 saniyelik yedek sorgu devam eder.
9. Ses durumu ekrandan ekrana yeniden çizilince doğru korunur. Hızlı Sipariş ekranı da garson çağrı POS melodisini kullanır; alarm döngüsü yeni işler için 1,8 saniyelik tekrar içerir.
10. Ağ kesilince eski verilerin güncel olmayabileceği gösterilir. Yeniden bağlantı/sekme aktivasyonunda yenileme yapılır.
11. Telefondaki ana Sipariş Merkezi doğrudan **Masalar** alanından açılır; boş/dolu/QR/garson/servis durumlarını ayrı işaretler; mekân planı seçeneği korunur.
12. Hızlı Sipariş ekranı da telefonda masaları varsayılan gösterir; mobil sekmeler sabit, büyük dokunma alanları ve safe-area uyarlaması kullanır.

## Kanıt / test kapsamı
- Supabase prod: migration uygulandı, invalid venue reddi, lisans-kontrol kuralı, merchant/foreign-venue yetkilendirmesi, floor çakışma reddi doğrulandı.
- Supabase prod: anonim oyun medyası 65 kimlikte reddedildi, boş sorgu çalıştı, geçersiz QR venue kodu null döndü.
- Node GitHub Actions: JS sözdizimi, mevcut operasyon/UI regresyonları, sürükle-bırak koordinatları, 1–200 masa ve mobil tile kontrolü.
- Chromium GitHub Actions: 320×720 / 35 masa, 390×844 / 100 masa, 600×900 / 200 masa, 1280×800 / 100 masa görünüm kontrolleri. Görsel taşıma ve sabit alt navigasyon taşmaları incelenir.
- Otomatik kontroller gerçek iPhone/Safari veya Android/WebView arka plan ses politikalarını doğrulayamaz.

## Devam eden veya manuel onay gerekenler
- [ ] Aynı işletme e-posta hesabıyla **üç gerçek cihazda** eşzamanlı QR → garson → mutfak → masa kapatma işlemleri, tekrar tıklama ve offline/online akışı.
- [ ] İki gerçek telefonla Pişti ve dört gerçek telefonla Okey tam oyun bitişi ve bağlantı geri gelme testi.
- [ ] iPhone Safari ve Android cihazlarda alarmı dokunarak açma, ses seviyesi, açık ekran, arka plan/kilit davranışının sahada kontrolü. **Mobil tarayıcı kilitli ekranda kesintisiz ses garantisi vermez.**
- [ ] Supabase Dashboard > Authentication > Password Security alanındaki **Leaked password protection** uyarısının proje sahibince etkinleştirilmesi; bağlayıcı bu Auth ayarını değiştiremez.
- [ ] 21 anonim ve 83 authenticated SECURITY DEFINER fonksiyonu için linter uyarısı, her RPC'nin işlevine göre güvenlik inceleme takibinde kalmalıdır. Kamuya açık QR/oyun RPC'leri bilinçli olarak anon çağrılarını kabul eder; doğrudan tabloların RLS/policy olmaması amaçlı deny-by-default olabilir. Bu uyarıların sıfıra indirildiği iddia edilmez.
- [ ] Üretim yük testi: eşzamanlı 10–20 cihaz, çok uzun sipariş kuyrukları, zayıf şebeke ve veri gecikmesi sınırları.
- [ ] Ticari paket kapsamı, KDV/fatura, destek süresi, iade/sözleşme ve bakım taahhütlerinin insan onayı.

## Yayın ilkesi
**Teknik devreye alma ile satışa sınırsız izin aynı şey değildir.** Üç cihaz, oyunların tam bitişi ve gerçek mobil ses testleri geçmeden genel lansmanı 'tüm cihazlarda test edildi' diye sunmayın. Pilot satış sınırlı ve izlenebilir olsun.
