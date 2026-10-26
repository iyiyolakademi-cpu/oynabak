# OynaBak — Klasik Okey (İyi Yol Akademi pilotu)

Pilot: Okey kartı yalnız İyi Yol Akademi oyun ekranında görünür. Diğer işletmeler, basılı QR bağlantıları, diğer oyunlar ve işletme girişleri değiştirilmez.

## Nasıl oynanır?
1. İyi Yol Akademi OynaBak → Oyun Oyna → Okey.
2. İlk kişi adını yazarak yeni oda açar, altı karakterli masa kodunu paylaşır.
3. Üç arkadaş ayrı telefonlardan kodla katılır; 4. oyuncu gelince taşlar dağıtılır.
4. Başlayan oyuncu 15 taşla bir taş atar; diğerleri 14 taşla sırayla taş alıp atar.
5. Oyuncular taşlarını dizip son taşı seçer; Bitir'e basıldığında eldeki 14 taş sunucuda perler veya 7 çift olarak kontrol edilir.

## Mimari
- games/okey.html, games/okey.css ve games/okey.js: telefon uyumlu oyun arayüzü.
- index.html: yalnızca İyi Yol Akademi için oyun kartı.
- public.ob_okey_rooms: RLS etkin, doğrudan anonim tablo erişimi yasak.
- ob_okey_open: oda açar/katılır; venue ID yalnız İyi Yol Akademi.
- ob_okey_state: oyuncu tokenına göre sadece kendi elini döndürür.
- ob_okey_act: kilitlenmiş işlemle sırayı, çekme-atma hamlelerini ve bitişi denetler.
- oynabak_private.ob_okey_* yardımcı fonksiyonları: karıştırma, joker, perler ve 7 çift.
- Güncelleme aralığı yaklaşık 2,3 saniyedir (Supabase Realtime değil, polling).
- Güvenlik: yeni oda için 24/saat sınırı, gizli oyuncu tokenı, diğer oyuncuların taşlarını gizleme.

## Test ve sınırlar
- SQL ROLLBACK testleri: 4 kişi/106 taş/48 kalan taş, 15-14 dağıtım, taş atma ve yerden alma, doğru/geçersiz eller, 7 çift, sıra yetkisi, yanlış token engeli.
- Anonim istemci yetkisiyle akademi oda kurulumuna izin, başka işletmeden oda kurulumuna ret doğrulandı.
- GitHub Actions JS sözdizimini ve ana entegrasyonu kontrol eder.
- Pilot tek elliktir: çok turlu skor tablosu, eşli oyun, bot, sohbet ve izleyici modu henüz yok.
- Kullanıcı adı gerçek kimlik doğrulaması değildir; fiziksel mekan konumu doğrulanmaz.
- Gerçek 4 telefonla uçtan uca kullanım ve mobil sürükleme testleri ayrıca yapılmalı.
