@echo off
chcp 65001 >nul
title OynaBak - Kasa ve Mutfak Otomatik Yazici Kurulumu
where node.exe >nul 2>&1
if errorlevel 1 (
 echo Resmi Node.js LTS programi gerekiyor. Ucretsiz indirme sayfasi aciliyor.
 start "" "https://nodejs.org/en/download"
 echo Node.js kurulduktan sonra bu dosyayi tekrar acin.
 pause
 exit /b 1
)
node.exe "%~dp0kasa-mutfak-kurulum.mjs"
if errorlevel 1 echo Kurulum bitmedi. Yukaridaki hata mesajini kontrol edin.
pause
