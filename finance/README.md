# OynaBak Ön Muhasebe — Ayrı Geliştirme Dalı

Bu çalışma **yayında değildir**. Ana index.html, müşteri QR akışı, dijital menü, oyunlar ve mevcut Supabase şeması değiştirilmedi.

## Eklenenler
- `finance/sql/001_finance_isolated.sql`: Her işletme için ayrı kayıtlar, başlangıçta `enabled=false`, yetkili kullanıcı / rol eşleşmesi, satır bazlı erişim kuralları (RLS), gelir-gider, hesap, cari, ödeme takvimi, stok, personel, gün sonu tabloları.
- `finance/finance.js`: Ayrı yüklenebilen işletme finans arayüzü; sadece sunucu tarafında yetkili ve açık işletmede başlar.

## Güvenlik ve kurulum
1. OynaBak veritabanı bağlantısı erişilebilir olmalı. Mevcut bağlanan Supabase projesi Patiyiz olarak göründüğünden **SQL burada uygulanmadı**.
2. OynaBak mevcut `auth.users.id` ve `oynabak_private.venues.id` ilişkileri üretimde doğrulanmalı.
3. SQL OynaBak'ın kendi veritabanına uygulanmalı. Bu işlem `ob_finance_access` kayıtlarını kendiliğinden oluşturmaz; erişim varsayılan kapalıdır.
4. Güvenilir yönetici işlemiyle doğru `venue_id` için `ob_finance_access` ve `ob_finance_members` (owner) kayıtları girilmeli. Hiçbir kullanıcı kendisine owner yetkisi veremez.
5. İki farklı işletme hesabıyla RLS testleri tamamlanmalı. Başka işletmenin kaydı okunamamalı ve yazılamamalı. Viewer yazamamalı. Kapalı işletme finansı görememeli.
6. Mevcut OynaBak özellik yönetimine `finance` alanı, güvenilir yönetici API'si ve işletme panelinden çağrı ancak testlerden sonra eklenmeli. Finans kartını sadece gizlemek güvenlik değildir: backend yetki kontrolü şarttır.

## Geliştirme durumu
Bu dal **tamamlanmış canlı ürün değildir**. Mevcut modül basit veri kayıtlarını ve temel listelemeyi kapsar. Aşağıdakiler özellikle kapalı veya tamamlanmamıştır:
- Gün sonu beklenen nakit hesaplaması / gerçek kasa kapatma.
- Atomik POS / kasa / banka transferleri ve banka mutabakatı.
- Cari tahsilat, kısmi ödeme ve net bakiye hesaplama.
- Tekrarlayan giderlerin güvenilir periyodik oluşumu.
- Personel atama / kaldırma yönetici API'si ve ekranı.
- Kayıt iptali, tam denetim günlüğü ve finans doğrulama testleri.
- OynaBak index.html içine aktivasyon; canlıya alınmadı.

**PDF, lisans satışı ve adisyon bu kapsamın dışında tutuldu.**

## Kod bağlantısı (ileriki güvenli entegrasyon için)
```html
<script src="./finance/finance.js" defer></script>
```
Sadece doğrulanmış işletme oturumundan, finans yetkisi sunucu tarafında onaylandıktan sonra:
```js
await OynaBakFinance.open(db, me.venue.id);
```
Bu bağlantı şu anda kasıtlı olarak ana sayfaya eklenmedi; geliştirmenin yarım kalan bölümlerinin işletmelere görünmesini engeller.

## Üretime alma kontrol listesi
- [ ] OynaBak Supabase projesine erişim
- [ ] Şema ve auth eşleştirme doğrulaması
- [ ] RLS izolasyon testleri
- [ ] Güvenli admin özellik aç/kapat API'si
- [ ] Gün sonu ve hesap bakiyesi doğrulaması
- [ ] Cari borç / alacak ödeme akışı
- [ ] Personel rolleri yönetimi
- [ ] İşletme paneline kapalı-varsayılan entegrasyon
- [ ] Pilot işletme testi
