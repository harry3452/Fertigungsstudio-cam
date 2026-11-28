using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Fertigungsstudio.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(true, @"Local\FertigungsstudioCamDesktop", out bool isNew);
        if (!isNew)
        {
            MessageBox.Show("Fertigungsstudio CAM läuft bereits.", "Fertigungsstudio CAM",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new CamWindow());
        GC.KeepAlive(mutex);
    }
}

internal sealed class CamWindow : Form
{
    private const int UiPort = 47632;
    private readonly WebView2 view = new()
    {
        Dock = DockStyle.Fill,
        Visible = false,
        DefaultBackgroundColor = Color.FromArgb(247, 248, 250)
    };
    private readonly Label status = new()
    {
        Dock = DockStyle.Fill,
        Text = "Fertigungsstudio CAM wird gestartet …",
        Font = new Font("Segoe UI", 12),
        TextAlign = ContentAlignment.MiddleCenter,
        BackColor = Color.FromArgb(247, 248, 250),
        ForeColor = Color.FromArgb(30, 40, 50)
    };
    private Process? backend;
    private Process? bridge;
    private string? readyFile;
    private bool closing;

    public CamWindow()
    {
        Text = "Fertigungsstudio CAM";
        Width = 1500;
        Height = 940;
        MinimumSize = new Size(970, 650);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.White;
        Controls.Add(view);
        Controls.Add(status);
        Shown += async (_, _) => await InitializeAsync();
        FormClosed += (_, _) => Shutdown();
    }

    private static string Root()
    {
        string direct = AppContext.BaseDirectory;
        if (File.Exists(Path.Combine(direct, "preview_server.exe")))
            return direct;
        string parent = Directory.GetParent(direct.TrimEnd(Path.DirectorySeparatorChar))?.FullName
            ?? direct;
        if (File.Exists(Path.Combine(parent, "preview_server.exe")))
            return parent;
        throw new FileNotFoundException(
            "Die CAM-Installation wurde nicht gefunden: preview_server.exe fehlt.\n" +
            "Bitte das Desktop-Update im bestehenden Fertigungsstudio-CAM-Ordner installieren.");
    }

    private static Process Spawn(string file, string folder, params string[] args)
    {
        var start = new ProcessStartInfo(file)
        {
            WorkingDirectory = folder,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true
        };
        foreach (string arg in args) start.ArgumentList.Add(arg);
        var process = Process.Start(start);
        return process ?? throw new InvalidOperationException("Programmstart fehlgeschlagen: " + file);
    }

    private async Task InitializeAsync()
    {
        try
        {
            string folder = Root();
            string exe = Path.Combine(folder, "preview_server.exe");
            string script = Path.Combine(folder, "Serve-Fertigungsstudio-UI.ps1");
            if (!File.Exists(script))
                throw new FileNotFoundException("Serve-Fertigungsstudio-UI.ps1 fehlt.");

            var start = new ProcessStartInfo(exe)
            {
                WorkingDirectory = folder,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            backend = Process.Start(start)
                ?? throw new InvalidOperationException("Rust-Dienst konnte nicht gestartet werden.");
            var read = backend.StandardOutput.ReadLineAsync();
            if (await Task.WhenAny(read, Task.Delay(TimeSpan.FromSeconds(15))) != read)
                throw new TimeoutException("Rust-Dienst reagiert nicht innerhalb von 15 Sekunden.");
            string firstLine = await read ?? "";
            var match = Regex.Match(firstLine,
                @"^Fertigungsstudio local preview: http://127\.0\.0\.1:(\d+)/$");
            if (!match.Success)
                throw new InvalidOperationException(
                    "Rust-Dienst meldet keinen gültigen Start. " + firstLine);
            int backendPort = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
            readyFile = Path.Combine(Path.GetTempPath(),
                "fertigungsstudio-" + Guid.NewGuid().ToString("N") + ".ready");

            bridge = Spawn("powershell.exe", folder,
                "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
                "-Port", UiPort.ToString(CultureInfo.InvariantCulture),
                "-TargetPort", backendPort.ToString(CultureInfo.InvariantCulture),
                "-ReadyFile", readyFile);
            bool ready = false;
            for (int i = 0; i < 100 && !closing; i++)
            {
                if (File.Exists(readyFile))
                {
                    ready = true;
                    break;
                }
                if (bridge.HasExited)
                    throw new InvalidOperationException(
                        "CAM-Oberflächendienst wurde unerwartet beendet. " +
                        "Möglicherweise ist Port 47632 bereits belegt.");
                await Task.Delay(150);
            }
            if (!ready) throw new TimeoutException("CAM-Oberflächendienst reagiert nicht.");

            string userData = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Fertigungsstudio CAM", "DesktopProfile");
            Directory.CreateDirectory(userData);
            var environment = await CoreWebView2Environment.CreateAsync(null, userData);
            if (closing) return;
            await view.EnsureCoreWebView2Async(environment);
            if (closing) return;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            view.CoreWebView2.NavigationStarting += (_, e) =>
            {
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) ||
                    !uri.IsLoopback || uri.Port != UiPort)
                {
                    e.Cancel = true;
                }
            };
            view.Source = new Uri($"http://127.0.0.1:{UiPort}/");
            view.Visible = true;
            status.Visible = false;
        }
        catch (Exception e)
        {
            if (closing) return;
            status.Text = "Fertigungsstudio CAM konnte nicht gestartet werden.\n\n" + e.Message;
            MessageBox.Show(status.Text, "Startfehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Shutdown();
        }
    }

    private void Shutdown()
    {
        closing = true;
        Stop(ref bridge);
        Stop(ref backend);
        if (readyFile != null)
        {
            try { File.Delete(readyFile); } catch (IOException) { }
            try { File.Delete(readyFile); } catch (UnauthorizedAccessException) { }
        }
    }

    private static void Stop(ref Process? process)
    {
        var p = process;
        process = null;
        if (p is null) return;
        try
        {
            if (!p.HasExited) p.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException) { }
        catch (System.ComponentModel.Win32Exception) { }
        finally { p.Dispose(); }
    }
}
