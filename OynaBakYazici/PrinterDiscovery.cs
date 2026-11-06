using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
namespace OynaBakYazici;
internal static class PrinterDiscovery
{
 public static async Task<IReadOnlyList<string>> FindAsync(CancellationToken ct)
 {
  var networks=NetworkInterface.GetAllNetworkInterfaces()
    .Where(n=>n.OperationalStatus==OperationalStatus.Up&&n.NetworkInterfaceType!=NetworkInterfaceType.Loopback)
    .SelectMany(n=>n.GetIPProperties().UnicastAddresses)
    .Where(a=>a.Address.AddressFamily==AddressFamily.InterNetwork)
    .Select(a=>a.Address.GetAddressBytes())
    .Where(a=>a[0]==10||(a[0]==172&&a[1] is >=16 and <=31)||(a[0]==192&&a[1]==168))
    .Select(a=>$"{a[0]}.{a[1]}.{a[2]}.").Distinct().Take(3).ToArray();
  using var slots=new SemaphoreSlim(24);
  var found=new System.Collections.Concurrent.ConcurrentBag<string>();
  var tasks=new List<Task>();
  foreach(var prefix in networks)
   for(int i=1;i<255;i++)
   {
    string address=prefix+i;
    tasks.Add(Task.Run(async()=>{
     await slots.WaitAsync(ct);
     try
     {
      using var socket=new TcpClient();
      using var timeout=CancellationTokenSource.CreateLinkedTokenSource(ct);timeout.CancelAfter(TimeSpan.FromMilliseconds(350));
      await socket.ConnectAsync(address,9100,timeout.Token);
      found.Add(address);
     }
     catch(OperationCanceledException)when(ct.IsCancellationRequested){throw;}
     catch{}
     finally{slots.Release();}
    },ct));
   }
  await Task.WhenAll(tasks);
  return found.OrderBy(s=>s,StringComparer.Ordinal).ToArray();
 }
}