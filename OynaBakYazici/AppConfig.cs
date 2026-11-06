using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Win32;

namespace OynaBakYazici;
internal sealed record AppConfig(string DeviceToken,string PrinterHost,int PrinterPort,int PaperWidthMm);
internal static class ConfigStore
{
 public const string AdminUrl="https://oynabak.com/printer-admin.html";
 public static string AppDirectory=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OynaBak","Printer");
 public static string ExePath=>Path.Combine(AppDirectory,"OynaBakYazici.exe");
 private static string ConfigPath=>Path.Combine(AppDirectory,"device.dat");
 public static void Validate(AppConfig c)
 {
  if(!System.Text.RegularExpressions.Regex.IsMatch(c.DeviceToken,"^obp_[0-9a-f]{64}$"))throw new InvalidOperationException("İyi Yol Akademi panelinden geçerli cihaz anahtarı oluşturun.");
  if(!IPAddress.TryParse(c.PrinterHost,out var ip)||ip.AddressFamily!=System.Net.Sockets.AddressFamily.InterNetwork)throw new InvalidOperationException("Geçerli IPv4 yazıcı adresi girin.");
  var b=ip.GetAddressBytes();
  if(!(b[0]==10||(b[0]==172&&b[1] is >=16 and <=31)||(b[0]==192&&b[1]==168)||(b[0]==169&&b[1]==254)))throw new InvalidOperationException("Yazıcı yerel ağda olmalı.");
  if(c.PrinterPort is <1 or >65535||c.PaperWidthMm is not (58 or 80))throw new InvalidOperationException("Yazıcı portu veya kâğıt genişliği geçersiz.");
 }
 public static AppConfig? Load()
 {
  if(!File.Exists(ConfigPath))return null;
  var raw=ProtectedData.Unprotect(File.ReadAllBytes(ConfigPath),null,DataProtectionScope.CurrentUser);
  try{return JsonSerializer.Deserialize<AppConfig>(raw);}
  finally{CryptographicOperations.ZeroMemory(raw);}
 }
 public static void Save(AppConfig c)
 {
  Validate(c);Directory.CreateDirectory(AppDirectory);
  byte[] raw=JsonSerializer.SerializeToUtf8Bytes(c);
  byte[] protectedBytes;
  try{protectedBytes=ProtectedData.Protect(raw,null,DataProtectionScope.CurrentUser);}
  finally{CryptographicOperations.ZeroMemory(raw);}
  var tmp=ConfigPath+".tmp";
  File.WriteAllBytes(tmp,protectedBytes);File.Move(tmp,ConfigPath,true);
 }
 public static void InstallAndAutostart()
 {
  Directory.CreateDirectory(AppDirectory);
  var current=Environment.ProcessPath??throw new InvalidOperationException("Çalışan uygulama yolu bulunamadı.");
  if(!Path.GetFullPath(current).Equals(Path.GetFullPath(ExePath),StringComparison.OrdinalIgnoreCase))File.Copy(current,ExePath,true);
  using var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run",true)??throw new InvalidOperationException("Otomatik başlangıç kaydı açılamadı.");
  key.SetValue("OynaBakYazici",$"\"{ExePath}\" --agent");
 }
 public static void StartAgent()
 {
  System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(ExePath,"--agent"){UseShellExecute=false,WorkingDirectory=AppDirectory});
 }
}