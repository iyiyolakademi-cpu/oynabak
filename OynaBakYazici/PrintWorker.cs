using System.Net.Http.Json;
using System.Text.Json;
namespace OynaBakYazici;
internal sealed class PrintWorker:IDisposable
{
 const string Api="https://qacmubkcierbpxmdtsph.supabase.co/";
 const string Key="sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj";
 readonly HttpClient http=new(){BaseAddress=new Uri(Api),Timeout=TimeSpan.FromSeconds(15)};
 public PrintWorker(){http.DefaultRequestHeaders.TryAddWithoutValidation("apikey",Key);}
 async Task<JsonDocument> Rpc(string name,object payload,CancellationToken ct)
 {
  using var res=await http.PostAsJsonAsync("rest/v1/rpc/"+name,payload,ct);
  var content=await res.Content.ReadAsStringAsync(ct);
  if(!res.IsSuccessStatusCode)throw new InvalidOperationException("Supabase bağlantısı: HTTP "+(int)res.StatusCode);
  return JsonDocument.Parse(content);
 }
 public async Task RunAsync(CancellationToken ct,Action<string> status)
 {
  while(!ct.IsCancellationRequested)
  {
   try
   {
    var cfg=ConfigStore.Load()??throw new InvalidOperationException("Önce yazıcıyı kurun.");
    ConfigStore.Validate(cfg);
    using var claim=await Rpc("ob_print_claim",new{p_token=cfg.DeviceToken},ct);
    if(claim.RootElement.ValueKind==JsonValueKind.Object)
    {
     var job=claim.RootElement;
     string id=job.GetProperty("id").GetString()??throw new InvalidOperationException("Sipariş kimliği eksik.");
     string claimId=job.GetProperty("claim_id").GetString()??throw new InvalidOperationException("İş kilidi eksik.");
     bool started=false;
     try
     {
      int width=job.GetProperty("paper_width_mm").GetInt32();
      if(width!=cfg.PaperWidthMm)throw new InvalidOperationException("Kâğıt genişliği eşleşmiyor.");
      var bytes=PrinterProtocol.Receipt(job.GetProperty("payload"),width,job.GetProperty("station").GetString()??"all");
      await PrinterProtocol.CheckStatusAsync(cfg,ct);
      await PrinterProtocol.SendAsync(cfg,bytes,()=>started=true,ct);
      using var result=await Rpc("ob_print_finish",new{p_token=cfg.DeviceToken,p_job_id=id,p_claim_id=claimId,p_outcome="printed",p_error=""},ct);
      status(result.RootElement.ValueKind==JsonValueKind.True?"Fiş gönderildi":"Fiş gönderildi, onay belirsiz");
     }
     catch(Exception ex)
     {
      status("Yazıcı kontrolü gerekiyor: "+ex.Message);
      // If data may have been sent, never request an automatic retry.
      if(!started)
      {
       try
       {
        using var failed=await Rpc("ob_print_finish",new{p_token=cfg.DeviceToken,p_job_id=id,p_claim_id=claimId,p_outcome="failed",p_error=ex.Message[..Math.Min(ex.Message.Length,180)]},ct);
       }
       catch{status("Hata raporlanamadı, yönetici kuyruğuna bakın.");}
      }
     }
    }
    else status("Bağlı: yeni sipariş bekleniyor");
   }
   catch(OperationCanceledException)when(ct.IsCancellationRequested){break;}
   catch(Exception ex){status("Bağlantı: "+ex.Message);}
   try{await Task.Delay(4000,ct);}catch(OperationCanceledException){break;}
  }
 }
 public void Dispose()=>http.Dispose();
}