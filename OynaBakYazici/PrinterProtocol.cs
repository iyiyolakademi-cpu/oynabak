using System.Net.Sockets;
using System.Text;
using System.Text.Json;
namespace OynaBakYazici;
internal static class PrinterProtocol
{
 static readonly Encoding Turkish;
 static PrinterProtocol(){Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);Turkish=Encoding.GetEncoding(857);}
 static string Get(JsonElement e,string name,string fallback="")
 {
  if(e.ValueKind!=JsonValueKind.Object||!e.TryGetProperty(name,out var v))return fallback;
  return v.ValueKind==JsonValueKind.String?v.GetString()??fallback:v.ToString();
 }
 static int Num(JsonElement e,string name,int fallback=0)=>int.TryParse(Get(e,name),out int v)?v:fallback;
 static string Clean(string? s,int max=160)=>new string((s??"").Where(x=>!char.IsControl(x)).Take(max).ToArray());
 public static byte[] TestReceipt(int width)
 {
  using var doc=JsonDocument.Parse("""{"table_no":8,"customer_note":"Deneme: Ş ç Ğ ğ İ ı Ö ö Ü ü","items":[{"name":"Çiğ köfte ve İskender","quantity":2,"station":"kitchen","note":"Soğansız, şekersiz"}]}""");
  return Receipt(doc.RootElement,width,"all");
 }
 public static byte[] Receipt(JsonElement payload,int width,string station)
 {
  if(width is not (58 or 80)||!payload.TryGetProperty("items",out var items)||items.ValueKind!=JsonValueKind.Array)throw new InvalidOperationException("Geçersiz fiş verisi.");
  int cols=width==58?30:42;
  using var output=new MemoryStream();
  output.Write(new byte[]{27,64,27,116,29}); // ESC @, ESC t 29 = CP857
  void Cmd(params byte[] bs)=>output.Write(bs);
  void Line(string x){output.Write(Turkish.GetBytes(Clean(x,cols)+"\n"));}
  void Wrap(string x){x=Clean(x,500);for(int k=0;k<x.Length;k+=cols)Line(x.Substring(k,Math.Min(cols,x.Length-k)));}
  Cmd(27,97,1,27,69,1);Line("OYNABAK");Cmd(27,69,0);Line("SİPARİŞ FİŞİ");
  Cmd(27,97,0);Line(new string('-',cols));Line("MASA "+Num(payload,"table_no"));Line("BÖLÜM "+station.ToUpper(new System.Globalization.CultureInfo("tr-TR")));Line(new string('-',cols));
  int printed=0;
  foreach(var item in items.EnumerateArray())
  {
   if(station!="all"&&station!="cashier"&&Get(item,"station","all")!=station)continue;
   int qty=Num(item,"quantity");var name=Get(item,"name");
   if(qty<1||qty>999||string.IsNullOrWhiteSpace(name))throw new InvalidOperationException("Ürün eksik.");
   printed++;Wrap($"{qty} x {name}");
   var variant=Get(item,"variant_name");if(!string.IsNullOrWhiteSpace(variant))Wrap("  "+variant);
   var note=Get(item,"note");if(!string.IsNullOrWhiteSpace(note))Wrap("  NOT: "+note);
  }
  if(printed==0)throw new InvalidOperationException("Bu bölüme ait ürün yok.");
  var customerNote=Get(payload,"customer_note");
  if(!string.IsNullOrWhiteSpace(customerNote)){Line(new string('-',cols));Wrap("NOT: "+customerNote);}
  Line(new string('-',cols));Line("HAZIRLANACAK SİPARİŞ");Cmd(27,100,4,29,86,0);
  return output.ToArray();
 }
 public static async Task CheckStatusAsync(AppConfig cfg,CancellationToken ct)
 {
  using var client=new TcpClient();
  using var linked=CancellationTokenSource.CreateLinkedTokenSource(ct);linked.CancelAfter(TimeSpan.FromSeconds(5));
  await client.ConnectAsync(cfg.PrinterHost,cfg.PrinterPort,linked.Token);
  using var stream=client.GetStream();
  await stream.WriteAsync(new byte[]{16,4,2,16,4,3,16,4,4},linked.Token);
  var bytes=new byte[3];await stream.ReadExactlyAsync(bytes,linked.Token);
  if((bytes[0]&4)!=0)throw new InvalidOperationException("Yazıcının kapağı açık.");
  if((bytes[0]&64)!=0)throw new InvalidOperationException("Yazıcı çevrimdışı.");
  if((bytes[1]&104)!=0)throw new InvalidOperationException("Yazıcı veya kesici arızası.");
  if((bytes[2]&96)!=0)throw new InvalidOperationException("Yazıcıda kâğıt yok.");
 }
 public static async Task SendAsync(AppConfig cfg,byte[] data,Action markSending,CancellationToken ct)
 {
  using var client=new TcpClient();
  using var timeout=CancellationTokenSource.CreateLinkedTokenSource(ct);timeout.CancelAfter(TimeSpan.FromSeconds(12));
  await client.ConnectAsync(cfg.PrinterHost,cfg.PrinterPort,timeout.Token);
  using var stream=client.GetStream();
  markSending();
  await stream.WriteAsync(data,timeout.Token);
  await stream.FlushAsync(timeout.Token);
 }
}