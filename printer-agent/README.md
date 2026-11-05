# OynaBak ESC/POS yerel yazdirma ajanı

Node.js 20+ ile calisir. RONGTA RP330 veya benzeri Ethernet TCP 9100 ESC/POS yazicilari hedefler. USB/Bluetooth/seri su an desteklenmez. Windows/macOS/Linux'ta yaziciyla ayni agdaki surekli acik bilgisayarda calismalidir.

## Kurulum
1. config.example.json dosyasini config.local.json adiyla kopyalayin. Gercek isletme venue_id UUID'sini ve yazicinin yerel IP adresini girin.
2. node print-agent.mjs --sample komutuyla yazici olmadan ornek fis olusturun.
3. Gercek cihaz ve yerel ag testinden sonra ancak ilgili isletmenin Supabase ob_printer_settings enabled ve auto_print ayarlari acilir.
4. Ortam degiskenleri: OYNABAK_ADMIN_EMAIL, OYNABAK_ADMIN_PASSWORD, ENABLE_LOCAL_PRINTING=YES. Ardindan node print-agent.mjs --live.

Yalnizca kurucu yonetici hesabiyla Supabase Auth girisi yapar. service_role gerekmez. Sifreyi dosyada veya depoda tutmayin. Yerel ag disina yazdirma yasaklanmistir. Basim belirsiz hatalarda otomatik tekrar yapilmaz (cift fis riski). Basarili TCP iletim, cihazin kagida bastiginin kesin kaniti degildir.

Bu surum yalnizca musterinin QR siparisini personelin onaylamasi uzerine kuyruğa eklenen isleri isler. Dogrudan adisyona eklenen kalemler henuz otomatik kuyruklanmaz. Turkce karakterler uyumluluk icin ASCII'ye donusturulur. Yazdirilan belge mali fis degil mutfak siparis fisidir.

Ayarlar ve is kuyrugu: /printer-admin.html (Iyi Yol Akademi yoneticisi). Bu panel bilerek otomatik yazdirmayi aktif edemez; yazici testinden sonra ayrica devreye alma gerekir.
