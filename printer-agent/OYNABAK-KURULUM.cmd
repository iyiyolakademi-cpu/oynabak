@echo off
chcp 65001 >nul
title OynaBak - QR Siparis Yazici Kurulumu
where node.exe >nul 2>&1
if errorlevel 1 (
 echo Ucretsiz resmi Node.js LTS kurulu degil.
 start "" "https://nodejs.org/en/download"
 echo Node.js kurulduktan sonra bu dosyaya tekrar cift tiklayin.
 pause
 exit /b 1
)
node.exe "%~dp0oynabak-kurulum.mjs"
if errorlevel 1 echo Baglanti tamamlanamadi. Yukaridaki uyariyi kontrol edin.
pause
