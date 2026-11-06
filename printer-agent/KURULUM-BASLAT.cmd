@echo off
chcp 65001 >nul
title OynaBak - Ucretsiz Yazici Baglantisi
where node.exe >nul 2>&1
if errorlevel 1 (
 echo Resmi Node.js LTS gerekli. Ucretsiz indirme sayfasi aciliyor.
 start "" "https://nodejs.org/en/download"
 echo Node.js kurulduktan sonra bu dosyaya tekrar cift tiklayin.
 pause
 exit /b 1
)
node.exe "%~dp0kolay-kurulum.mjs"
if errorlevel 1 (
 echo Kurulum tamamlanamadi. Yukaridaki hata mesajini kontrol edin.
)
pause
