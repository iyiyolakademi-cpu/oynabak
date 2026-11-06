using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace OynaBakPrinter;

internal static class Agent
{
    private const string Api = "https://qacmubkcierbpxmdtsph.supabase.co/rest/v1/rpc/";
    private const string PublishableKey = "sb_publishable_RU5vtZxlqK2dMD-LWuwUaA_Eak6b9cj";
    private static readonly HttpClient Client = BuildClient();
    private static readonly Encoding Turkish = InitEncoding();

    private static HttpClient BuildClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        client.DefaultRequestHeaders.Add("apikey", PublishableKey);
        return client;
    }

    private static Encoding InitEncoding()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        return Encoding.GetEncoding(857, new EncoderReplacementFallback("?"), new DecoderReplacementFallback("?"));
    }

    private static async Task<JsonDocument> Rpc(string method, object args, CancellationToken ct)
    {
        using var content = new StringContent(JsonSerializer.Serialize(args), Encoding.UTF8, "application/json");
        using var response = await Client.PostAsync(Api + method, content, ct);
        string body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("Sunucu hatası (" + (int)response.StatusCode + "): " +
                Regex.Replace(body, @"[\r\n]+", " ")[..Math.Min(body.Length, 160)]);
        return JsonDocument.Parse(body);
    }

    private static bool Text(JsonElement el, string name, out string val)
    {
        val = "";
        if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(name, out var prop)) return false;
        if (prop.ValueKind == JsonValueKind.Null) return false;
        val = prop.ToString();
        return true;
    }

    private static string Value(JsonElement el, string key, string fallback = "")
        => Text(el, key, out var value) ? value : fallback;

    public static async Task Loop(Func<Settings> settings, CancellationToken ct, Action<string> progress)
    {
        string? lastError = null;
        while (!ct.IsCancellationRequested)
        {
            var cfg = settings();
            if (cfg.Ready)
            {
                try
                {
                    using var claimed = await Rpc("ob_print_claim", new { p_token = cfg.Token }, ct);
                    if (claimed.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        var job = claimed.RootElement;
                        var id = Guid.Parse(Value(job, "id"));
                        var claimId = Guid.Parse(Value(job, "claim_id"));
                        int width = job.GetProperty("paper_width_mm").GetInt32();
                        string station = Value(job, "station", "all");
                        bool bytesMayHaveBeenSent = false;
                        try
                        {
                            if (width != cfg.Width) throw new Exception("Kâğıt genişliği uyuşmuyor.");
                            byte[] receipt = BuildReceipt(job.GetProperty("payload"), width, station);
                            await CheckStatus(cfg);
                            // Once writing begins, physical printing can be ambiguous if a network failure occurs.
                            bytesMayHaveBeenSent = true;
                            await Send(cfg, receipt);
                            using var finished = await Rpc("ob_print_finish", new
                            {
                                p_token = cfg.Token,
                                p_job_id = id,
                                p_claim_id = claimId,
                                p_outcome = "printed",
                                p_error = ""
                            }, ct);
                            progress(finished.RootElement.ValueKind == JsonValueKind.True
                                ? "Fiş yazıcıya gönderildi: " + id.ToString()[..8]
                                : "Yazdırma sonucu belirsiz. Panelde kontrol edin.");
                        }
                        catch (Exception ex)
                        {
                            if (!bytesMayHaveBeenSent)
                            {
                                try
                                {
                                    using var _ = await Rpc("ob_print_finish", new
                                    {
                                        p_token = cfg.Token,
                                        p_job_id = id,
                                        p_claim_id = claimId,
                                        p_outcome = "failed",
                                        p_error = ex.Message.Length > 180 ? ex.Message[..180] : ex.Message
                                    }, ct);
                                }
                                catch { }
                            }
                            progress("Baskı kontrolü gerekiyor: " + ex.Message);
                        }
                    }
                    else if (lastError is not null)
                    {
                        progress("Bağlantı yeniden kuruldu, yeni siparişler izleniyor.");
                    }
                    lastError = null;
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
                catch (Exception ex)
                {
                    if (lastError != ex.Message)
                    {
                        lastError = ex.Message;
                        progress("Sunucu bağlantısı: " + ex.Message);
                    }
                }
            }
            try { await Task.Delay(4000, ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    private static string Clean(string? s, int max = 250)
    {
        var str = Regex.Replace(s ?? "", @"[\x00-\x1f\x7f]+", " ");
        str = Regex.Replace(str, @"\s+", " ").Trim();
        return str.Length > max ? str[..max] : str;
    }

    public static byte[] BuildReceipt(JsonElement payload, int width, string station)
    {
        if (width is not (58 or 80)) throw new Exception("Kâğıt genişliği hatalı.");
        if (!payload.TryGetProperty("items", out var raw) || raw.ValueKind != JsonValueKind.Array)
            throw new Exception("Sipariş ürünleri bulunamadı.");
        int cols = width == 58 ? 30 : 42;
        using var bytes = new MemoryStream();
        void Command(params byte[] cmd) => bytes.Write(cmd, 0, cmd.Length);
        void Line(string text)
        {
            var value = Clean(text, 500);
            for (int i = 0; i < Math.Max(value.Length, 1); i += cols)
            {
                var part = value.Length == 0 ? "" : value.Substring(i, Math.Min(cols, value.Length - i));
                var rawText = Turkish.GetBytes(part + "\n");
                bytes.Write(rawText);
            }
        }

        Command(27, 64); Command(27, 116, 29); // RONGTA 80-series: CP857 page 29
        Command(27, 97, 1); Command(27, 69, 1); Line("OYNABAK");
        Command(27, 69, 0); Line("SİPARİŞ FİŞİ");
        Command(27, 97, 0); Line(new string('-', cols));
        Line("MASA " + Clean(Value(payload, "table_no"), 8));
        Line("BÖLÜM " + station.ToUpperInvariant());
        Line(new string('-', cols));
        int count = 0;
        foreach (var row in raw.EnumerateArray())
        {
            string category = Value(row, "station", "all");
            if (station != "all" && station != "cashier" && station != category) continue;
            string name = Clean(Value(row, "name"), 150);
            if (string.IsNullOrWhiteSpace(name)) throw new Exception("Ürün adı boş.");
            if (!int.TryParse(Value(row, "quantity"), out int quantity) || quantity is < 1 or > 999)
                throw new Exception("Ürün adedi geçersiz.");
            Line(quantity + " × " + name);
            if (Text(row, "variant_name", out var variant) && !string.IsNullOrWhiteSpace(variant))
                Line("  " + variant);
            if (Text(row, "note", out var note) && !string.IsNullOrWhiteSpace(note))
                Line("  NOT: " + note);
            count++;
        }
        if (count == 0) throw new Exception("Yazdırılacak ürün bulunamadı.");
        if (Text(payload, "customer_note", out var customerNote) && !string.IsNullOrWhiteSpace(customerNote))
        {
            Line(new string('-', cols));
            Line("NOT: " + customerNote);
        }
        Line(new string('-', cols));
        Line("HAZIRLANACAK SİPARİŞ");
        Command(27, 100, 4); Command(29, 86, 0);
        return bytes.ToArray();
    }

    private static async Task<TcpClient> Open(Settings cfg, CancellationToken ct)
    {
        if (!cfg.Ready) throw new Exception("Yazıcı yapılandırması geçersiz.");
        var c = new TcpClient();
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(4));
            await c.ConnectAsync(IPAddress.Parse(cfg.Host), cfg.Port, timeout.Token);
            return c;
        }
        catch { c.Dispose(); throw; }
    }

    public static async Task CheckStatus(Settings cfg)
    {
        using var c = await Open(cfg, CancellationToken.None);
        using var stream = c.GetStream();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var result = new byte[3];
        for (int i = 0; i < 3; ++i)
        {
            await stream.WriteAsync(new byte[] { 16, 4, (byte)(i + 2) }, timeout.Token);
            var one = new byte[1];
            int n = await stream.ReadAsync(one, timeout.Token);
            if (n != 1) throw new Exception("Yazıcı sensör bilgisi gelmedi.");
            result[i] = one[0];
        }
        if ((result[0] & 0x04) != 0) throw new Exception("Yazıcı kapağı açık.");
        if ((result[0] & 0x40) != 0) throw new Exception("Yazıcı çevrimdışı.");
        if ((result[1] & 0x68) != 0) throw new Exception("Yazıcı donanım hatası.");
        if ((result[2] & 0x60) != 0) throw new Exception("Yazıcı kâğıdı bitmiş.");
    }

    public static async Task Send(Settings cfg, byte[] receipt)
    {
        using var c = await Open(cfg, CancellationToken.None);
        using var stream = c.GetStream();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        await stream.WriteAsync(receipt, timeout.Token);
        await stream.FlushAsync(timeout.Token);
    }
}
