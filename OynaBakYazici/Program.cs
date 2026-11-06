using System.Drawing;
using System.Windows.Forms;
namespace OynaBakYazici;
internal static class Program
{
 [STAThread]
 static void Main(string[] args)
 {
  if(args.Contains("--self-test",StringComparer.OrdinalIgnoreCase))
  {
   try
   {
    byte[] b=PrinterProtocol.TestReceipt(80);
    if(b.Length<50||b[0]!=27||b[1]!=64||!b.Contains((byte)152)||!b.Contains((byte)158))
     throw new InvalidOperationException("CP857 / ESC-POS Türkçe test başarısız.");
    if(b[^3]!=29||b[^2]!=86||b[^1]!=0)throw new InvalidOperationException("Kesme komutu eksik.");
    Environment.ExitCode=0;
   }
   catch{Environment.ExitCode=3;}
   return;
  }
  ApplicationConfiguration.Initialize();
  if(args.Contains("--agent",StringComparer.OrdinalIgnoreCase))Application.Run(new AgentContext());
  else Application.Run(new SetupForm());
 }
}
internal sealed class AgentContext:ApplicationContext
{
 readonly Mutex mutex;
 readonly bool owner;
 readonly NotifyIcon tray;
 readonly CancellationTokenSource lifetime=new();
 readonly PrintWorker worker=new();
 public AgentContext()
 {
  mutex=new Mutex(true,@"Local\OynaBakPrinterAgent",out owner);
  tray=new NotifyIcon{Icon=SystemIcons.Application,Text="OynaBak Yazıcı: Başlatılıyor",Visible=owner};
  if(!owner){ExitThread();return;}
  var menu=new ContextMenuStrip();
  menu.Items.Add("Yazıcı Ayarları",null,(_,_)=>new SetupForm().Show());
  menu.Items.Add("İyi Yol Akademi Yönetimi",null,(_,_)=>System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(ConfigStore.AdminUrl){UseShellExecute=true}));
  menu.Items.Add("Yazıcı Servisini Kapat",null,(_,_)=>ExitThread());
  tray.ContextMenuStrip=menu;
  tray.DoubleClick+=(_,_)=>new SetupForm().Show();
  _=Task.Run(async()=>{
   try{await worker.RunAsync(lifetime.Token,s=>{try{tray.Text=s.Length>62?s[..62]:s;}catch{}});}
   catch{}
  });
 }
 protected override void ExitThreadCore()
 {
  lifetime.Cancel();tray.Visible=false;tray.Dispose();
  worker.Dispose();
  if(owner)mutex.ReleaseMutex();
  mutex.Dispose();
  base.ExitThreadCore();
 }
}