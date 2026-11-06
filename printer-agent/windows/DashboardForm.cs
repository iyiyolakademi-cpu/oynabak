using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
using System.Windows.Forms;

namespace OynaBakPrinter;

// Production dashboard: real Supabase device-scoped data only. No demo orders or fabricated metrics.
internal sealed class DashboardForm : Form
{
    private static readonly Color Ink = Color.FromArgb(19, 33, 53);
    private static readonly Color Muted = Color.FromArgb(103, 116, 132);
    private static readonly Color Base = Color.FromArgb(245, 247, 251);
    private static readonly Color Brand = Color.FromArgb(24, 88, 204);
    private static readonly Color Line = Color.FromArgb(223, 230, 239);
    private readonly bool background;
    private readonly CancellationTokenSource shutdown = new();
    private readonly NotifyIcon tray;
    private readonly System.Windows.Forms.Timer refreshTimer;
    private bool allowExit;
    private bool requesting;
    private bool firstDisplay;
    private readonly Label heading = LabelText("Yazdırma Merkezi", 23, true);
    private readonly Label subtitle = LabelText("İşletmenin canlı yazdırma durumu", 10);
    private readonly Label tag = LabelText("Kontrol ediliyor...", 10, true);
    private readonly Label connection = LabelText("Yazıcı henüz kurulmadı", 11, true);
    private readonly Label service = LabelText("Bağlantı bilgisi bekleniyor", 10);
    private readonly Label printed = LabelText("—", 25, true);
    private readonly Label pending = LabelText("—", 25, true);
    private readonly Label failed = LabelText("—", 25, true);
    private readonly Label review = LabelText("—", 25, true);
    private readonly Label lastCheck = LabelText("Henüz senkronize edilmedi", 9);
    private readonly Label activity = LabelText("Başlatılıyor...", 10);
    private readonly DataGridView orders = new()
    {
        Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false,
        AllowUserToDeleteRows = false, RowHeadersVisible = false,
        BackgroundColor = Color.White, BorderStyle = BorderStyle.None,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        MultiSelect = false, ColumnHeadersHeight = 41,
        RowTemplate = { Height = 41 }, EnableHeadersVisualStyles = false
    };
    private readonly Button connectButton = ActionButton("Yazıcıyı Kur / Değiştir", true);
    private readonly Button refreshButton = ActionButton("Yenile");
    private readonly Button adminButton = ActionButton("Yönetici Paneli");
    private readonly Button printerCheck = ActionButton("Yazıcıyı Kontrol Et");
    private readonly RichTextBox logs = new()
    {
        Dock = DockStyle.Fill, ReadOnly = true, BackColor = Color.White,
        BorderStyle = BorderStyle.None, Font = new Font("Consolas", 9),
        ScrollBars = RichTextBoxScrollBars.Vertical, DetectUrls = false
    };

    public DashboardForm(bool backgroundMode)
    {
        background = backgroundMode;
        Text = "OynaBak Yazıcı Pro | İşletme Yazdırma Merkezi";
        Icon = SystemIcons.Application;
        Font = new Font("Segoe UI", 10);
        BackColor = Base; ForeColor = Ink;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(900, 690);
        Size = new Size(1130, 825);

        var shell = new TableLayoutPanel {
            Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4,
            Padding = new Padding(26, 22, 26, 18),
            BackColor = Base
        };
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 85));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 122));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 125));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        Controls.Add(shell);

        var header = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 53));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 47));
        var headerText = new FlowLayoutPanel {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown,
            WrapContents = false
        };
        heading.Height = 44; heading.Width = 470;
        subtitle.ForeColor = Muted; subtitle.Width = 470;
        headerText.Controls.Add(heading); headerText.Controls.Add(subtitle);
        header.Controls.Add(headerText, 0, 0);
        var headerActions = new FlowLayoutPanel {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false
        };
        headerActions.Controls.Add(connectButton);
        headerActions.Controls.Add(refreshButton);
        header.Controls.Add(headerActions, 1, 0);
        shell.Controls.Add(header, 0, 0);

        var statePanel = PanelCard();
        statePanel.Padding = new Padding(18);
        var stateLayout = new TableLayoutPanel {
            Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2
        };
        stateLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 65));
        stateLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 35));
        var statusLeft = new FlowLayoutPanel {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown,
            WrapContents = false
        };
        connection.Width = 600; connection.Height = 37;
        service.Width = 620; service.ForeColor = Muted; service.Height = 31;
        statusLeft.Controls.Add(connection); statusLeft.Controls.Add(service);
        stateLayout.Controls.Add(statusLeft, 0, 0);
        var statusRight = new FlowLayoutPanel {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false
        };
        tag.ForeColor = Brand; tag.Width = 245; tag.Height = 35;
        tag.TextAlign = ContentAlignment.MiddleRight;
        statusRight.Controls.Add(tag);
        stateLayout.Controls.Add(statusRight, 1, 0);
        var checkRow = new FlowLayoutPanel {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false
        };
        checkRow.Controls.Add(printerCheck);
        checkRow.Controls.Add(adminButton);
        stateLayout.Controls.Add(checkRow, 0, 1);
        stateLayout.SetColumnSpan(checkRow, 2);
        statePanel.Controls.Add(stateLayout);
        shell.Controls.Add(statePanel, 0, 1);

        var metrics = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4 };
        for (var i = 0; i < 4; i++) metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        AddMetric(metrics, printed, "Bugün gönderilen fiş", 0);
        AddMetric(metrics, pending, "Bekleyen fiş", 1);
        AddMetric(metrics, failed, "Hatalı fiş", 2);
        AddMetric(metrics, review, "İnceleme gereken", 3);
        shell.Controls.Add(metrics, 0, 2);

        var bottom = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 69));
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 31));
        var orderCard = PanelCard();
        orderCard.Padding = new Padding(15, 13, 15, 13);
        var orderLayout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3 };
        orderLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        orderLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        orderLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 27));
        orderLayout.Controls.Add(LabelText("Son siparişlerin yazdırma durumu", 12, true), 0, 0);
        ConfigureGrid();
        orderLayout.Controls.Add(orders, 0, 1);
        lastCheck.ForeColor = Muted;
        orderLayout.Controls.Add(lastCheck, 0, 2);
        orderCard.Controls.Add(orderLayout);
        bottom.Controls.Add(orderCard, 0, 0);

        var right = PanelCard(); right.Padding = new Padding(13);
        var rightLayout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3 };
        rightLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 33));
        rightLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 49));
        rightLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        rightLayout.Controls.Add(LabelText("Bağlantı ve işlemler", 12, true), 0, 0);
        activity.ForeColor = Muted;
        activity.AutoEllipsis = true; activity.Dock = DockStyle.Fill;
        rightLayout.Controls.Add(activity, 0, 1);
        rightLayout.Controls.Add(logs, 0, 2);
        right.Controls.Add(rightLayout);
        bottom.Controls.Add(right, 1, 0);
        shell.Controls.Add(bottom, 0, 3);

        orders.Rows.Clear();
        connectButton.Click += (_, _) => ConfigurePrinter();
        refreshButton.Click += async (_, _) => await RefreshData();
        adminButton.Click += (_, _) => Process.Start(new ProcessStartInfo(
            "https://oynabak.com/printer-admin.html") { UseShellExecute = true });
        printerCheck.Click += async (_, _) => await TestConnection();
        refreshTimer = new System.Windows.Forms.Timer { Interval = 12000 };
        refreshTimer.Tick += async (_, _) => await RefreshData();
        refreshTimer.Start();

        tray = new NotifyIcon {
            Icon = SystemIcons.Application, Text = "OynaBak Yazıcı - Yazdırma Merkezi",
            Visible = true, ContextMenuStrip = new ContextMenuStrip()
        };
        tray.ContextMenuStrip.Items.Add("Yazdırma Merkezini Aç", null, (_, _) => ShowDashboard());
        tray.ContextMenuStrip.Items.Add("Çıkış", null, (_, _) => {
            allowExit = true; Close();
        });
        tray.DoubleClick += (_, _) => ShowDashboard();

        Shown += async (_, _) => {
            if (!firstDisplay) {
                firstDisplay = true;
                if (background && Program.Load().Ready) Hide();
                AppendLog("OynaBak Yazdırma Merkezi başlatıldı.");
                if (!Program.Load().Ready && !background)
                    BeginInvoke(new Action(ConfigurePrinter));
            }
            await RefreshData();
        };
        FormClosing += (_, e) => {
            if (!allowExit) {
                e.Cancel = true; Hide();
                tray.ShowBalloonTip(2500, "OynaBak Yazıcı",
                    "Uygulama arka planda çalışmaya devam ediyor.", ToolTipIcon.Info);
            } else shutdown.Cancel();
        };
        _ = Task.Run(() => Agent.Loop(Program.Load, shutdown.Token, ReportProgress));
        RenderConfig();
    }

    public void ShowSetup() => ShowDashboard();

    private void ShowDashboard()
    {
        Show(); WindowState = FormWindowState.Normal;
        Activate(); BringToFront();
    }

    private static Label LabelText(string text, float fontSize, bool strong = false)
        => new() {
            Text = text, Font = new Font("Segoe UI", fontSize,
                strong ? FontStyle.Bold : FontStyle.Regular),
            AutoSize = false, Height = (int)(fontSize * 2.5) + 6,
            ForeColor = Ink
        };

    private static Button ActionButton(string title, bool accent = false)
        => new() {
            Text = title, Width = title.Length > 15 ? 201 : 111,
            Height = 37, FlatStyle = FlatStyle.Flat,
            BackColor = accent ? Brand : Color.White,
            ForeColor = accent ? Color.White : Ink,
            Margin = new Padding(6, 3, 0, 3),
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            Cursor = Cursors.Hand
        };

    private static Panel PanelCard()
        => new() { Dock = DockStyle.Fill, BackColor = Color.White,
            Margin = new Padding(5, 4, 9, 8), BorderStyle = BorderStyle.FixedSingle };

    private static void AddMetric(TableLayoutPanel target, Label value, string name, int idx)
    {
        var card = PanelCard();
        var inner = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(17, 12, 6, 3) };
        inner.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));
        inner.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        value.ForeColor = Ink; value.Dock = DockStyle.Fill;
        inner.Controls.Add(value, 0, 0);
        var title = LabelText(name, 9);
        title.ForeColor = Muted; title.Dock = DockStyle.Fill;
        inner.Controls.Add(title, 0, 1);
        card.Controls.Add(inner);
        target.Controls.Add(card, idx, 0);
    }

    private void ConfigureGrid()
    {
        orders.DefaultCellStyle.Font = new Font("Segoe UI", 9);
        orders.DefaultCellStyle.ForeColor = Ink;
        orders.DefaultCellStyle.SelectionBackColor = Color.FromArgb(225, 238, 255);
        orders.DefaultCellStyle.SelectionForeColor = Ink;
        orders.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        orders.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(239, 243, 250);
        orders.ColumnHeadersDefaultCellStyle.ForeColor = Ink;
        orders.Columns.Add("date", "Saat");
        orders.Columns.Add("table", "Masa");
        orders.Columns.Add("products", "Ürünler");
        orders.Columns.Add("status", "Durum");
        orders.Columns["date"]!.FillWeight = 16;
        orders.Columns["table"]!.FillWeight = 13;
        orders.Columns["products"]!.FillWeight = 48;
        orders.Columns["status"]!.FillWeight = 23;
        orders.CellFormatting += (_, e) => {
            if (e.RowIndex < 0 || e.ColumnIndex != 3 || e.Value is null) return;
            var txt = e.Value.ToString();
            e.CellStyle.ForeColor = txt switch {
                "Gönderildi" => Color.FromArgb(20, 133, 70),
                "Hata" or "Kontrol gerekli" => Color.FromArgb(185, 50, 50),
                _ => Color.FromArgb(150, 99, 21)
            };
        };
    }

    private void RenderConfig()
    {
        var cfg = Program.Load();
        if (!cfg.Ready) {
            connection.Text = "Yazıcı henüz bağlanmadı";
            service.Text = "Cihazı işletmeye bağlamak için 'Yazıcıyı Kur / Değiştir' seç.";
            tag.Text = "Kurulum gerekli";
            printerCheck.Enabled = false;
        } else {
            connection.Text = "Ağ yazıcısı: " + cfg.Host + ":" + cfg.Port;
            service.Text = "80/58 mm yazdırma • Cihaz anahtarı bilgisayarda şifreli";
            tag.Text = "Sunucu kontrol ediliyor";
            printerCheck.Enabled = true;
        }
    }

    private void ConfigurePrinter()
    {
        using var setup = new SetupForm(false);
        setup.ShowDialog(this);
        RenderConfig();
        _ = RefreshData();
    }

    private async Task TestConnection()
    {
        var cfg = Program.Load();
        if (!cfg.Ready) { ConfigurePrinter(); return; }
        printerCheck.Enabled = false;
        ReportProgress("Fiziksel yazıcı sensörleri kontrol ediliyor...");
        try {
            await Agent.CheckStatus(cfg);
            ReportProgress("Yazıcı TCP sensörleri yanıt verdi. Gerçek fiş baskısı ayrıca doğrulanmalı.");
            MessageBox.Show(
                "Yazıcı TCP/sensör bağlantısı başarılı. Bu işlem fiş basmaz. " +
                "İlk kurulumda 'Yazıcıyı Kur / Değiştir' bölümünden gerçek test fişi çıkarın.",
                "OynaBak - Yazıcı Bağlantısı", MessageBoxButtons.OK, MessageBoxIcon.Information);
        } catch(Exception ex) {
            ReportProgress("Yazıcı bağlantı hatası: " + ex.Message);
            MessageBox.Show("Yazıcıya erişilemiyor.\n\n" + ex.Message,
                "OynaBak - Bağlantı Hatası", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        } finally { printerCheck.Enabled = true; }
    }

    private async Task RefreshData()
    {
        if (requesting || shutdown.IsCancellationRequested) return;
        requesting = true; refreshButton.Enabled = false;
        try {
            var cfg = Program.Load();
            if (!cfg.Ready) {
                tag.Text = "Kurulum gerekli";
                printed.Text = pending.Text = failed.Text = review.Text = "—";
                orders.Rows.Clear();
                lastCheck.Text = "Gerçek siparişleri görüntülemek için cihazı eşleştirin.";
                return;
            }
            using var response = await Agent.Overview(cfg.Token, shutdown.Token);
            if (response.RootElement.ValueKind != JsonValueKind.Object) {
                tag.Text = "Cihaz doğrulanamadı";
                connection.Text = "Cihaz eşleştirme anahtarı geçersiz veya iptal edildi";
                service.Text = "Yönetici panelinden yeni bir cihaz anahtarı alın.";
                orders.Rows.Clear();
                printed.Text = pending.Text = failed.Text = review.Text = "—";
                return;
            }
            var root = response.RootElement;
            var sum = root.GetProperty("summary");
            printed.Text = Field(sum, "printed_today", "0");
            pending.Text = Field(sum, "pending", "0");
            failed.Text = Field(sum, "failed", "0");
            review.Text = Field(sum, "review", "0");
            heading.Text = "OynaBak  |  " + Field(root, "device_name", "Yazdırma Merkezi");
            var venue = Field(root, "venue_id", "İşletme");
            subtitle.Text = "İşletme: " + venue + "   •   Sipariş ve yazdırma takibi";
            var active = Flag(root, "enabled") && Flag(root, "auto_print");
            tag.Text = active ? "Otomatik yazdırma etkin" : "Otomatik yazdırma kapalı";
            tag.ForeColor = active ? Color.FromArgb(20, 133, 70) : Color.FromArgb(155, 102, 20);
            connection.Text = "Yazıcı adresi: " + cfg.Host + ":" + cfg.Port;
            service.Text = active
                ? "İşletme yazdırma kuyruğu takip ediliyor. Gerçek donanım testinin yapılmış olması gerekir."
                : "Yazdırma devre dışı. Fiziksel test sonrası web panelinden etkinleştirin.";
            orders.Rows.Clear();
            if (root.TryGetProperty("recent", out var recent) && recent.ValueKind == JsonValueKind.Array)
            foreach (var job in recent.EnumerateArray()) {
                var stamp = "";
                if (DateTimeOffset.TryParse(Field(job,"created_at",""),out var date))
                    stamp = date.ToLocalTime().ToString("dd.MM HH:mm");
                var names = new List<string>();
                if (job.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                    foreach (var item in items.EnumerateArray())
                        names.Add(Field(item,"quantity","1")+"x "+Field(item,"name","Ürün"));
                var jobStatus = Field(job,"status","");
                var friendly = jobStatus switch {
                    "printed" => "Gönderildi", "pending" => "Bekliyor", "failed" => "Hata",
                    "printing" => "Kontrol gerekli", _ => "Bilinmiyor"
                };
                var table = Field(job,"table_no","—");
                int index = orders.Rows.Add(stamp, table, string.Join(", ",names), friendly);
                orders.Rows[index].Tag = Field(job,"last_error","");
                if (jobStatus is "failed" or "printing")
                    orders.Rows[index].DefaultCellStyle.BackColor = Color.FromArgb(255, 247, 242);
            }
            lastCheck.Text = "Son güncelleme: " + DateTime.Now.ToString("HH:mm:ss") +
                "  •  Son 15 yazdırma kaydı  •  Yenileme: 12 saniye";
        } catch(OperationCanceledException) when(shutdown.IsCancellationRequested) { }
        catch(Exception ex) {
            tag.Text = "Sunucuya ulaşılamadı";
            tag.ForeColor = Color.FromArgb(184, 52, 50);
            lastCheck.Text = "Veriler güncellenemedi. İnternet bağlantısını kontrol edin.";
            AppendLog("Sunucu hatası: "+ex.Message);
        } finally {
            requesting = false; refreshButton.Enabled = true;
        }
    }

    private static string Field(JsonElement e, string key, string fallback)
        => e.ValueKind == JsonValueKind.Object &&
           e.TryGetProperty(key, out var v) && v.ValueKind is not JsonValueKind.Null
        ? v.ToString() : fallback;

    private static bool Flag(JsonElement e, string key)
        => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key,out var v) &&
           v.ValueKind == JsonValueKind.True;

    private void ReportProgress(string message)
    {
        if (IsDisposed || !IsHandleCreated) return;
        if (InvokeRequired) {
            try { BeginInvoke(new Action<string>(ReportProgress),message); } catch { }
            return;
        }
        activity.Text = message;
        AppendLog(message);
    }

    private void AppendLog(string message)
    {
        if (logs.IsDisposed) return;
        var entry = "["+DateTime.Now.ToString("HH:mm:ss")+"] "+message+"\n";
        // Bound UI memory; logs do not contain device tokens or admin credentials.
        if (logs.TextLength > 7000) logs.Text = logs.Text[^4000..];
        logs.AppendText(entry);
        logs.SelectionStart = logs.TextLength; logs.ScrollToCaret();
        try {
            // Rotating operational log contains only activity text, never the device token.
            var logPath = Path.Combine(Program.Folder, "printer-activity.log");
            Directory.CreateDirectory(Program.Folder);
            if (File.Exists(logPath) && new FileInfo(logPath).Length > 1024 * 1024)
                File.Move(logPath, logPath + ".old", true);
            File.AppendAllText(logPath, entry);
        } catch {
            // A read-only profile should not prevent live printing.
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) {
            shutdown.Cancel();
            refreshTimer.Dispose();
            tray.Visible = false; tray.Dispose();
            shutdown.Dispose();
        }
        base.Dispose(disposing);
    }
}
