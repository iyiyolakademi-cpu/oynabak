using System.Diagnostics;
using System.Drawing;
using System.Net;
using System.Net.Http.Json;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace OynaBakPrinter;

internal static class Program
{
    internal static readonly string Folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OynaBak");
    internal static readonly string InstalledExe = Path.Combine(Folder, "OynaBak-Yazici.exe");
    internal static readonly string ConfigFile = Path.Combine(Folder, "printer-settings.json");
    private const string MutexId = @"Local\OynaBak-Yazici-SingleInstance";
    private const string WakeId = @"Local\OynaBak-Yazici-Show";

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        if (args.Contains("--self-test"))
        {
            using var sample = JsonDocument.Parse("""{"table_no":5,"items":[{"name":"Çiğ köfte","quantity":2,"station":"all"},{"name":"Şekerli çay","quantity":1,"station":"all"}],"customer_note":"Ğ İ Ö Ş Ü"}""");
            var receipt = Agent.BuildReceipt(sample.RootElement, 80, "all");
            if (receipt.Length < 80 || receipt[0] != 27 || receipt[1] != 64 ||
                !receipt.AsSpan().Contains((byte)158)) throw new Exception("ESC/POS CP857 test failed.");
            Console.WriteLine("OynaBak yazıcı fiş testi başarılı.");
            return;
        }
        Directory.CreateDirectory(Folder);
        try
        {
            if (!Path.GetFullPath(Environment.ProcessPath ?? "").Equals(
                Path.GetFullPath(InstalledExe), StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(Environment.ProcessPath!, InstalledExe, true);
                Process.Start(new ProcessStartInfo(InstalledExe) { UseShellExecute = true });
                return;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("Kurulum dosyası kopyalanamadı: " + ex.Message,
                "OynaBak Yazıcı", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        using var mutex = new Mutex(true, MutexId, out bool first);
        if (!first)
        {
            try { using var handle = EventWaitHandle.OpenExisting(WakeId); handle.Set(); }
            catch { MessageBox.Show("OynaBak yazıcı uygulaması zaten çalışıyor. Sağ alttaki yazıcı simgesine tıklayın."); }
            return;
        }
        using var wake = new EventWaitHandle(false, EventResetMode.AutoReset, WakeId);
        using var window = new SetupForm(args.Contains("--background"));
        _ = Task.Run(() =>
        {
            while (!window.IsDisposed)
            {
                if (!wake.WaitOne(750)) continue;
                try
                {
                    if (!window.IsDisposed && window.IsHandleCreated)
                        window.BeginInvoke(new Action(window.ShowSetup));
                }
                catch { return; }
            }
        });
        Application.Run(window);
    }

    internal static Settings Load()
    {
        if (!File.Exists(ConfigFile)) return new Settings();
        try
        {
            var stored = JsonSerializer.Deserialize<StoredSettings>(File.ReadAllText(ConfigFile)) ?? new();
            string token = "";
            if (!string.IsNullOrEmpty(stored.EncryptedToken))
                token = Encoding.UTF8.GetString(ProtectedData.Unprotect(
                    Convert.FromBase64String(stored.EncryptedToken), null, DataProtectionScope.CurrentUser));
            return new Settings(token, stored.Host, stored.Port, stored.Width);
        }
        catch { return new Settings(); }
    }

    internal static void Save(Settings cfg)
    {
        Directory.CreateDirectory(Folder);
        var encrypted = Convert.ToBase64String(ProtectedData.Protect(
            Encoding.UTF8.GetBytes(cfg.Token), null, DataProtectionScope.CurrentUser));
        var stored = new StoredSettings(encrypted, cfg.Host, cfg.Port, cfg.Width);
        var tmp = ConfigFile + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(stored, new JsonSerializerOptions { WriteIndented = true }),
            new UTF8Encoding(false));
        File.Move(tmp, ConfigFile, true);
        using var startup = Registry.CurrentUser.CreateSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Run");
        startup?.SetValue("OynaBak Yazici", "\"" + InstalledExe + "\" --background", RegistryValueKind.String);
    }
}

internal sealed record Settings(string Token = "", string Host = "", int Port = 9100, int Width = 80)
{
    public bool Ready =>
        Regex.IsMatch(Token, @"^obp_[a-f0-9]{64}$") &&
        IPAddress.TryParse(Host, out var ip) && ip.AddressFamily == AddressFamily.InterNetwork &&
        IsPrivate(ip) && Port is > 0 and <= 65535 && Width is 58 or 80;

    internal static bool IsPrivate(IPAddress address)
    {
        var x = address.GetAddressBytes();
        return x[0] == 10 || (x[0] == 172 && x[1] >= 16 && x[1] <= 31) ||
            (x[0] == 192 && x[1] == 168);
    }
}

internal sealed record StoredSettings(
    string EncryptedToken = "", string Host = "", int Port = 9100, int Width = 80);

internal sealed class SetupForm : Form
{
    private readonly TextBox tokenBox = new() { Width = 600, UseSystemPasswordChar = true };
    private readonly ComboBox printers = new() { Width = 570, DropDownStyle = ComboBoxStyle.DropDown };
    private readonly NumericUpDown portBox = new() { Minimum = 1, Maximum = 65535, Value = 9100, Width = 140 };
    private readonly ComboBox paperBox = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 140 };
    private readonly Label status = new() { AutoSize = false, Width = 610, Height = 52 };
    private readonly Button findButton = new() { Text = "Yazıcıları Bul", Width = 175, Height = 39 };
    private readonly Button testButton = new() { Text = "Test Fişi Yazdır", Width = 175, Height = 39 };
    private readonly Button saveButton = new() { Text = "Kaydet ve Çalıştır", Width = 200, Height = 39 };
    private readonly NotifyIcon tray;
    private readonly CancellationTokenSource stop = new();
    private Settings current;
    private bool exitRequested;
    private readonly bool startedHidden;

    public SetupForm(bool startHidden)
    {
        startedHidden = startHidden;
        current = Program.Load();
        Text = "OynaBak | 2 Dakikada Yazıcı Kurulumu";
        Width = 690; Height = 590;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(670, 580);
        Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(249, 250, 252);
        Icon = SystemIcons.Application;

        paperBox.Items.AddRange(["80 mm", "58 mm"]);
        paperBox.SelectedIndex = current.Width == 58 ? 1 : 0;
        printers.Text = current.Host;
        portBox.Value = current.Port;

        var root = new TableLayoutPanel {
            Dock = DockStyle.Fill, Padding = new Padding(22),
            ColumnCount = 1, AutoScroll = true, RowCount = 12
        };
        Controls.Add(root);
        root.Controls.Add(new Label {
            Text = "OynaBak Yazıcı Kurulumu",
            Font = new Font("Segoe UI", 18, FontStyle.Bold),
            AutoSize = true, Margin = new Padding(3, 2, 3, 10)
        });
        root.Controls.Add(Line("1. İyi Yol Akademi panelinden cihaz anahtarı oluşturup aşağıya yapıştırın."));
        root.Controls.Add(tokenBox);
        root.Controls.Add(Line("2. Yazıcıyı Ethernet kablosuyla modeme bağlayın ve “Yazıcıları Bul”a basın."));
        var findLine = new FlowLayoutPanel { Width = 620, Height = 50 };
        findLine.Controls.Add(printers); root.Controls.Add(findLine);
        root.Controls.Add(findButton);
        root.Controls.Add(Line("3. Kâğıt genişliğini seçin. Port genellikle 9100'dür."));
        var paramsLine = new FlowLayoutPanel { Width = 610, Height = 48 };
        paramsLine.Controls.Add(new Label { Text = "Port", Width = 44, TextAlign = ContentAlignment.MiddleLeft, Height = 32 });
        paramsLine.Controls.Add(portBox);
        paramsLine.Controls.Add(new Label { Text = "Kâğıt", Width = 65, TextAlign = ContentAlignment.MiddleLeft, Height = 32 });
        paramsLine.Controls.Add(paperBox);
        root.Controls.Add(paramsLine);
        var buttons = new FlowLayoutPanel { Height = 55, Width = 610 };
        buttons.Controls.Add(testButton);
        buttons.Controls.Add(saveButton);
        root.Controls.Add(buttons);
        root.Controls.Add(Line("4. Gerçek fiş çıktıysa web panelinden otomatik yazdırmayı etkinleştirin."));
        var panelLink = new LinkLabel { Text = "Yazıcı Yönetimini Aç (İyi Yol Akademi)", AutoSize = true };
        panelLink.LinkClicked += (_, _) => Process.Start(new ProcessStartInfo(
            "https://oynabak.com/printer-admin.html") { UseShellExecute = true });
        root.Controls.Add(panelLink);
        root.Controls.Add(status);

        findButton.Click += async (_, _) => await FindPrinters();
        testButton.Click += async (_, _) => await TestPrinter();
        saveButton.Click += (_, _) => SaveSettings();
        tray = new NotifyIcon {
            Icon = SystemIcons.Application, Text = "OynaBak Yazıcı",
            Visible = true, ContextMenuStrip = new ContextMenuStrip()
        };
        tray.ContextMenuStrip.Items.Add("Kurulumu Aç", null, (_, _) => ShowSetup());
        tray.ContextMenuStrip.Items.Add("Çıkış", null, (_, _) => { exitRequested = true; Close(); });
        tray.DoubleClick += (_, _) => ShowSetup();
        FormClosing += (_, e) => {
            if (!exitRequested) { e.Cancel = true; Hide(); }
            else stop.Cancel();
        };
        Shown += (_, _) => { if (startedHidden && current.Ready) Hide(); };
        SetStatus(current.Ready
            ? "Yazıcı kurulu. Sipariş kuyruğu takip ediliyor. Gerçek test fişini doğrulamayı unutmayın."
            : "Henüz yazıcı bağlı değil. Yukarıdaki adımları izleyin.");
        _ = Task.Run(() => Agent.Loop(() => current, stop.Token, SetStatus));
    }

    private static Label Line(string message) => new() {
        Text = message, AutoSize = true,
        MaximumSize = new Size(610, 0),
        Margin = new Padding(3, 11, 3, 5)
    };

    public void ShowSetup()
    {
        Show(); WindowState = FormWindowState.Normal;
        Activate(); BringToFront();
    }

    private Settings InputSettings(bool requireToken)
    {
        var token = tokenBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(token)) token = current.Token;
        var cfg = new Settings(token, printers.Text.Trim(), (int)portBox.Value,
            paperBox.SelectedIndex == 1 ? 58 : 80);
        if (!cfg.Ready)
            throw new InvalidOperationException(
                "Cihaz anahtarı, yerel yazıcı IP adresi ve portu kontrol edin. " +
                "Cihaz anahtarını yönetici panelinden alın.");
        return cfg;
    }

    private void SaveSettings()
    {
        try
        {
            var cfg = InputSettings(true);
            Program.Save(cfg); current = cfg; tokenBox.Clear();
            SetStatus("Kurulum kaydedildi. Program Windows oturumu açıldığında otomatik başlar.");
            MessageBox.Show("Kurulum kaydedildi. Şimdi test fişi basın; fiş doğruysa web panelinde " +
                "otomatik yazdırmayı açın.", "OynaBak", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Kurulum", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    private async Task TestPrinter()
    {
        testButton.Enabled = false;
        try
        {
            var cfg = InputSettings(true);
            SetStatus("Yazıcı bağlantısı ve sensörleri kontrol ediliyor...");
            await Agent.CheckStatus(cfg);
            await Agent.Send(cfg, Agent.BuildReceipt(
                JsonDocument.Parse("""{"table_no":5,"items":[{"name":"İskender çiğ köfte","quantity":2},{"name":"Şekersiz Türk çayı","quantity":1}],"customer_note":"Ç Ğ İ Ö Ş Ü / ç ğ ı ö ş ü"}""").RootElement,
                cfg.Width, "all"));
            SetStatus("Test fişi yazıcıya gönderildi. Kâğıdı ve Türkçe karakterleri kontrol edin.");
            MessageBox.Show("Yazıcıya test fişi gönderildi. Fiş fiziksel olarak çıktı mı? " +
                "Türkçe karakterler doğru mu? Kontrol ettikten sonra Kaydet ve Çalıştır'a basın.",
                "OynaBak Test Fişi", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            SetStatus("Test başarısız: " + ex.Message);
            MessageBox.Show(ex.Message, "Yazıcı Testi", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { testButton.Enabled = true; }
    }

    private async Task FindPrinters()
    {
        findButton.Enabled = false;
        SetStatus("Aynı ağda 9100 TCP portu açık yazıcılar aranıyor...");
        try
        {
            var candidates = new List<string>();
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var info in ni.GetIPProperties().UnicastAddresses)
                {
                    if (info.Address.AddressFamily != AddressFamily.InterNetwork ||
                        !Settings.IsPrivate(info.Address)) continue;
                    var octets = info.Address.GetAddressBytes();
                    var prefix = $"{octets[0]}.{octets[1]}.{octets[2]}.";
                    if (!candidates.Contains(prefix)) candidates.Add(prefix);
                }
            }
            if (candidates.Count == 0) throw new Exception("Özel yerel ağ bulunamadı. Wi-Fi veya Ethernet'e bağlanın.");
            var results = new System.Collections.Concurrent.ConcurrentBag<string>();
            using var gate = new SemaphoreSlim(36);
            int port = (int)portBox.Value;
            var work = candidates.Take(3).SelectMany(prefix => Enumerable.Range(1, 254)
                .Select(async n =>
                {
                    await gate.WaitAsync();
                    try
                    {
                        string host = prefix + n;
                        using var socket = new TcpClient();
                        using var cancel = new CancellationTokenSource(250);
                        try { await socket.ConnectAsync(host, port, cancel.Token); results.Add(host); }
                        catch { }
                    }
                    finally { gate.Release(); }
                }));
            await Task.WhenAll(work);
            printers.Items.Clear();
            foreach (var ip in results.Distinct().OrderBy(x => x))
                printers.Items.Add(ip);
            if (printers.Items.Count > 0)
            {
                printers.SelectedIndex = 0;
                SetStatus($"{printers.Items.Count} adet erişilebilir cihaz bulundu. Yazıcınızı seçin, test fişi alın.");
            }
            else SetStatus("Yazıcı bulunamadı. IP adresini manuel yazın veya Ethernet kablosunu kontrol edin.");
        }
        catch (Exception ex) { SetStatus("Arama başarısız: " + ex.Message); }
        finally { findButton.Enabled = true; }
    }

    private void SetStatus(string message)
    {
        if (IsDisposed) return;
        if (InvokeRequired)
        {
            try { BeginInvoke(new Action<string>(SetStatus), message); }
            catch { }
            return;
        }
        status.Text = "Durum: " + message;
        status.ForeColor = message.Contains("başarısız", StringComparison.OrdinalIgnoreCase)
            ? Color.DarkRed : Color.FromArgb(35, 75, 100);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { stop.Cancel(); tray.Dispose(); stop.Dispose(); }
        base.Dispose(disposing);
    }
}
