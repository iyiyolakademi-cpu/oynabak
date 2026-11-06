using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
namespace OynaBakYazici;
internal sealed class SetupForm:Form
{
 readonly TextBox token=new(){Width=430,UseSystemPasswordChar=true};
 readonly ComboBox ip=new(){Width=280,DropDownStyle=ComboBoxStyle.DropDown};
 readonly NumericUpDown port=new(){Width=95,Minimum=1,Maximum=65535,Value=9100};
 readonly ComboBox paper=new(){Width=120,DropDownStyle=ComboBoxStyle.DropDownList};
 readonly Label status=new(){Width=555,Height=62,ForeColor=Color.FromArgb(45,65,88)};
 readonly CheckBox accepted=new(){Text="Test fişi çıktı ve Türkçe karakterler düzgün.",AutoSize=true};
 readonly Button scan=MakeButton("Yazıcı Ara",114);
 readonly Button test=MakeButton("Test Fişi Yazdır",166);
 readonly Button save=MakeButton("Kurulumu Tamamla",200,true);
 bool tested,busy;
 static Button MakeButton(string label,int width,bool dark=false)=>new()
 {
  Text=label,Width=width,Height=38,FlatStyle=FlatStyle.Flat,
  BackColor=dark?Color.FromArgb(20,32,52):Color.FromArgb(238,242,247),
  ForeColor=dark?Color.White:Color.FromArgb(20,32,52),
  Cursor=Cursors.Hand,Font=new Font("Segoe UI",9.5f,FontStyle.Bold)
 };
 static Label Head(string value)=>new(){Text=value,Width=555,Height=31,Font=new Font("Segoe UI",10,FontStyle.Bold)};
 static void OpenAdmin()=>Process.Start(new ProcessStartInfo(ConfigStore.AdminUrl){UseShellExecute=true});
 int Paper=>paper.SelectedIndex==1?58:80;
 AppConfig GetConfig(bool requireToken=true)
 {
  var cfg=new AppConfig(token.Text.Trim(),ip.Text.Trim(),(int)port.Value,Paper);
  ConfigStore.Validate(requireToken?cfg:cfg with{DeviceToken="obp_"+new string('a',64)});
  return cfg;
 }
 void Busy(bool value){busy=value;scan.Enabled=test.Enabled=save.Enabled=!value;Cursor=value?Cursors.WaitCursor:Cursors.Default;}
 public SetupForm()
 {
  Text="OynaBak | Hızlı Yazıcı Kurulumu";
  Width=660;Height=645;StartPosition=FormStartPosition.CenterScreen;
  FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;
  Font=new Font("Segoe UI",10);BackColor=Color.White;Icon=SystemIcons.Application;
  var flow=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true,Padding=new Padding(30,20,20,18)};
  Controls.Add(flow);
  flow.Controls.Add(new Label{Text="OynaBak",Font=new Font("Segoe UI",23,FontStyle.Bold),Width=560,Height=56});
  flow.Controls.Add(new Label{Text="QR siparişlerini yazıcıya bağla. Node.js veya terminal gerekmez.",Width=560,Height=35,ForeColor=Color.DimGray});
  flow.Controls.Add(Head("1. İyi Yol Akademi panelinden cihaz anahtarını oluştur"));
  var open=MakeButton("Yönetim Panelini Aç",194);open.Click+=(_,_)=>OpenAdmin();flow.Controls.Add(open);
  flow.Controls.Add(new Label{Text="Eşleştirme anahtarı (gizli)",Width=555,Height=23});
  var tokenRow=new FlowLayoutPanel{Width=560,Height=46,WrapContents=false};
  tokenRow.Controls.Add(token);
  var toggle=MakeButton("Göster",94);toggle.Height=28;toggle.Click+=(_,_)=>{token.UseSystemPasswordChar=!token.UseSystemPasswordChar;toggle.Text=token.UseSystemPasswordChar?"Göster":"Gizle";};
  tokenRow.Controls.Add(toggle);flow.Controls.Add(tokenRow);
  flow.Controls.Add(Head("2. Yazıcıyı ağda bul veya IP adresini yaz"));
  var ipRow=new FlowLayoutPanel{Width=568,Height=48,WrapContents=false};
  ipRow.Controls.Add(ip);ipRow.Controls.Add(scan);
  ipRow.Controls.Add(new Label{Text="Port",Width=43,Height=30,TextAlign=ContentAlignment.MiddleRight});ipRow.Controls.Add(port);
  flow.Controls.Add(ipRow);
  var paperRow=new FlowLayoutPanel{Width=560,Height=42,WrapContents=false};
  paperRow.Controls.Add(new Label{Text="Kâğıt genişliği",Width=140,Height=33,TextAlign=ContentAlignment.MiddleLeft});
  paper.Items.AddRange(new object[]{"80 mm","58 mm"});paper.SelectedIndex=0;
  paperRow.Controls.Add(paper);flow.Controls.Add(paperRow);
  flow.Controls.Add(Head("3. Yazıcıdan deneme fişi çıkar"));
  flow.Controls.Add(test);flow.Controls.Add(accepted);
  flow.Controls.Add(Head("4. Kurulumu tamamla"));
  flow.Controls.Add(save);flow.Controls.Add(status);
  status.Text="Önce yazıcıyı eşleştir, test fişini al, ardından kurulumu tamamla.";
  ip.TextChanged+=(_,_)=>{tested=false;accepted.Checked=false;};
  paper.SelectedIndexChanged+=(_,_)=>{tested=false;accepted.Checked=false;};
  scan.Click+=async(_,_)=>await Scan();
  test.Click+=async(_,_)=>await Test();
  save.Click+=async(_,_)=>await Save();
  try
  {
   var c=ConfigStore.Load();
   if(c!=null){token.Text=c.DeviceToken;ip.Text=c.PrinterHost;port.Value=c.PrinterPort;paper.SelectedIndex=c.PaperWidthMm==58?1:0;status.Text="Önceki ayarlar bulundu. Yeniden test ederek güncelleyebilirsiniz.";}
  }catch{status.Text="Önceki ayarlar okunamadı. Yeniden eşleştirebilirsiniz.";}
 }
 async Task Scan()
 {
  if(busy)return;Busy(true);status.Text="Ağdaki yazıcı adayları aranıyor...";
  try
  {
   var found=await PrinterDiscovery.FindAsync(CancellationToken.None);
   ip.Items.Clear();foreach(var host in found)ip.Items.Add(host);
   if(found.Count>0){ip.Text=found[0];status.Text=$"{found.Count} aday bulundu. Doğru RONGTA IP'sini seç ve test et.";}
   else status.Text="Yazıcı bulunamadı. LAN kablosunu kontrol et veya IP adresini elle gir.";
  }
  catch(Exception ex){status.Text="Yazıcı araması: "+ex.Message;}
  finally{Busy(false);}
 }
 async Task Test()
 {
  if(busy)return;Busy(true);tested=false;accepted.Checked=false;
  try
  {
   var c=GetConfig(false);
   status.Text="Kapak/kâğıt sensörü sorgulanıyor...";
   await PrinterProtocol.CheckStatusAsync(c,CancellationToken.None);
   await PrinterProtocol.SendAsync(c,PrinterProtocol.TestReceipt(c.PaperWidthMm),()=>{},CancellationToken.None);
   tested=true;status.Text="Test verisi gönderildi. Kâğıt çıktıysa ve harfler düzgünse kutucuğu işaretle.";
   MessageBox.Show(this,"Fiziksel fişin çıktığını ve Ç Ğ İ Ö Ş Ü harflerini kontrol et. Sonra onay kutusunu işaretle.","OynaBak Test",MessageBoxButtons.OK,MessageBoxIcon.Information);
  }
  catch(Exception ex)
  {
   status.Text="Test başarısız: "+ex.Message;
   MessageBox.Show(this,ex.Message+"\nYazıcı IP/port, kâğıt, kapak ve cihaz firmware ayarlarını kontrol et.","OynaBak Hata",MessageBoxButtons.OK,MessageBoxIcon.Warning);
  }
  finally{Busy(false);}
 }
 async Task Save()
 {
  if(busy)return;Busy(true);
  try
  {
   var c=GetConfig();
   if(!tested||!accepted.Checked)throw new InvalidOperationException("Gerçek test fişini görüp Türkçe harfleri doğrulayın.");
   ConfigStore.Save(c);
   ConfigStore.InstallAndAutostart();
   ConfigStore.StartAgent();
   status.Text="Kurulum tamamlandı. Windows'a giriş yaptığında otomatik başlayacak.";
   var result=MessageBox.Show(this,"Kurulum tamamlandı!\nŞimdi İyi Yol Akademi panelinde yazdırmayı etkinleştireceksin. Panel açılsın mı?","OynaBak Hazır",MessageBoxButtons.YesNo,MessageBoxIcon.Information);
   if(result==DialogResult.Yes)OpenAdmin();
  }
  catch(Exception ex){status.Text="Kurulum tamamlanmadı: "+ex.Message;MessageBox.Show(this,ex.Message,"OynaBak",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
  finally{Busy(false);}
  await Task.CompletedTask;
 }
}