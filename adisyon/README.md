# OynaBak Adisyon — online ödeme olmadan

Mevcut QR kodları, oyunlar, garson çağırma ve dijital menüyü değiştirmeden eklenen personel adisyon modülü.

## Özellikler
- İşletme bazlı açma/kapatma (varsayılan: kapalı).
- Masaları görüntüleme, açık adisyon, menüden ürün ve varyant seçerek ekleme, sipariş notu ve miktar.
- Mutfak/bar durumları: yeni, hazırlanıyor, hazır, servis edildi.
- Gerekçeli ürün iptali, kapalı hesap geçmişi, işlem audit kaydı.
- Manuel hesap kapatma ve sipariş tutarı raporu. Online ödeme, sanal POS, banka, kredi kartı ve tahsilat kaydı kesinlikle yok.
- Aynı masada eşzamanlı personel işlemlerini güvenli tutmak için veritabanı kilidi ve tek açık adisyon kuralı.

## Kurulum durumu ve engel
- UI: adisyon/app.js ve adisyon/style.css; index.html üzerinden OynaBak oturumu ve mevcut menüye bağlanır.
- SQL: adisyon/oynabak-adisyon.sql yalnızca doğru OynaBak Supabase projesinde çalıştırılmalıdır.
- Bağlı Supabase hesabı OynaBak projesine erişim izni vermediği için SQL henüz uygulanmamıştır. Bu dal canlıda uçtan uca tamamlandı olarak değerlendirilmemelidir.
- SQL, mevcut public.ob_me() fonksiyonunun admin/merchant ve venue.id döndürmesini varsayar. Gerçek şema ve RPC imzaları kontrol edilmeden SQL çalıştırılmamalıdır.
- Sunucu ilk sürümde yalnız yetkili personel işlemlerini kabul eder; fiyat, personelin mevcut menüden seçtiği değer olarak kaydedilir. Sunucuda menü fiyatına karşı ikinci doğrulama henüz yoktur; yetki ve audit korunur.
- Müşteri QR üzerinden sipariş oluşturma ileride eklenebilecek ayrı aşamadır; mevcut QR kodlar değiştirilmemiştir.

## Üretim öncesi testler
1. Diğer işletmenin adisyon kayıtları okunamaz veya değiştirilemez.
2. Varsayılan kapalı özellik işletme panelinde görünmez.
3. Yöneticinin işletme bazlı açma/kapatması.
4. İki personelden aynı anda sipariş girildiğinde tek açık masa adisyonu.
5. Ürün/varyant fiyatları, adet ve not kaydı.
6. Mutfak/bar durum geçişleri ve gerekçeli iptal kayıtları.
7. Masayı kapatınca geçmiş korunur, yeniden adisyon açılabilir.
8. Sipariş tutarlarının tahsil edilmiş ciro olarak gösterilmemesi.
9. Mevcut QR, menü, garson çağırma, oyunlar ve muhasebe ekranlarında regresyon testi.