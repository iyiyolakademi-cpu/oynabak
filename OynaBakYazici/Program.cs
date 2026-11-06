using System.Drawing;
using System.Windows.Forms;
namespace OynaBakYazici;
internal static class Program
{
 [STAThread]
 static void Main(string[] args)
 {
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