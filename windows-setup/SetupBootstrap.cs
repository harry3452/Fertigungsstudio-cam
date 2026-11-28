// Fertigungsstudio CAM installer bootstrap. Appends a length-prefixed ZIP payload.
// No runtime downloads or administrator privileges on target Windows.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

static class SetupApp {
    const string Magic = "FSCAMZ01";
    const string Display = "Fertigungsstudio CAM";
    const string RegKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\FertigungsstudioCAM";
    const string Manifest = "INSTALL-MANIFEST.txt";
    const string Uninstaller = "Fertigungsstudio-CAM-Deinstallieren.exe";
    const string Version = "0.2.0-preview";
    [STAThread]
    public static int Main(string[] args) {
        bool quiet = args.Contains("--quiet");
        bool uninstall = args.Contains("--uninstall");
        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                                  "Programs", Display);
        bool custom = false;
        for (int i = 0; i + 1 < args.Length; i++)
            if (args[i] == "--target") { dir = Path.GetFullPath(args[++i]); custom = true; }
        try {
            if (uninstall) { Uninstall(dir, !custom); return 0; }
            if (!quiet && MessageBox.Show(
                Display + " " + Version + "\n\nInstallieren oder vorhandene Version aktualisieren?\n" +
                "STL, DXF, STEP werden offline mitgeliefert.\n\nZiel: " + dir,
                Display + " – Setup", MessageBoxButtons.OKCancel,
                MessageBoxIcon.Information) != DialogResult.OK) return 2;
            Install(dir, !custom);
            if (!quiet) {
                var answer = MessageBox.Show("Installation abgeschlossen.\n\n" +
                    "STEP ist integriert. Keine zusätzliche Python-Installation nötig.\n\n" +
                    "Fertigungsstudio CAM jetzt starten?", Display, MessageBoxButtons.YesNo,
                    MessageBoxIcon.Information);
                if (answer == DialogResult.Yes) Start(dir);
            }
            return 0;
        } catch (Exception ex) {
            if (quiet) Console.Error.WriteLine(ex);
            else MessageBox.Show(ex.Message, Display + " – Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    static void CopyStream(Stream input, Stream output, long n) {
        byte[] buffer = new byte[1024*1024];
        while (n > 0) {
            int read = input.Read(buffer,0,(int)Math.Min(buffer.Length,n));
            if (read <= 0) throw new InvalidDataException("Unvollständiges Installationsarchiv.");
            output.Write(buffer,0,read); n -= read;
        }
    }
    static long ReadPayload(string own, string archive) {
        using (var fs = File.OpenRead(own)) {
            if (fs.Length < 16) throw new InvalidDataException("Setup-Datei ist unvollständig.");
            fs.Seek(-16,SeekOrigin.End);
            byte[] footer = new byte[16];
            if (fs.Read(footer,0,16)!=16 || Encoding.ASCII.GetString(footer,8,8)!=Magic)
                throw new InvalidDataException("Setup-Datei enthält kein Installationspaket.");
            long len = BitConverter.ToInt64(footer,0);
            if (len < 1000 || len > 800000000 || len > fs.Length - 16)
                throw new InvalidDataException("Ungültige Archivgröße.");
            long offset = fs.Length - 16 - len;
            fs.Seek(offset,SeekOrigin.Begin);
            using(var dest=File.Create(archive)) CopyStream(fs,dest,len);
            return offset;
        }
    }
    static void Unpack(string archive,string stage) {
        using(var zip = ZipFile.OpenRead(archive))
        foreach (var e in zip.Entries) {
            string name = e.FullName.Replace('/','\\');
            if (name.StartsWith("\\") || name.Contains(":") || name.Split('\\').Any(x=>x==".."))
                throw new InvalidDataException("Ungültiger Pfad im Installationspaket.");
            if (name.Length==0) continue;
            string output = Path.GetFullPath(Path.Combine(stage,name));
            if (!output.StartsWith(Path.GetFullPath(stage).TrimEnd('\\')+"\\",
                                   StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Archivpfad außerhalb des Installationsordners.");
            if (name.EndsWith("\\")) { Directory.CreateDirectory(output); continue; }
            Directory.CreateDirectory(Path.GetDirectoryName(output));
            e.ExtractToFile(output,true);
        }
    }
    static void Install(string target,bool register) {
        string own = Process.GetCurrentProcess().MainModule.FileName;
        string temp = Path.Combine(Path.GetTempPath(),"fst-install-"+Guid.NewGuid().ToString("N"));
        string stage = Path.Combine(temp,"payload");
        Directory.CreateDirectory(stage);
        try {
            long offset = ReadPayload(own,Path.Combine(temp,"payload.zip"));
            Unpack(Path.Combine(temp,"payload.zip"),stage);
            string source = Path.Combine(stage,"Start-Fertigungsstudio-Test.cmd");
            string step = Path.Combine(stage,"tools","step","fst-step-import.exe");
            string preview = Path.Combine(stage,"preview_server.exe");
            if (!File.Exists(source) || !File.Exists(step) || !File.Exists(preview))
                throw new InvalidDataException("STL/DXF/STEP-Programmdateien fehlen im Setup.");
            if (Directory.Exists(target) && File.Exists(Path.Combine(target,"Start-Fertigungsstudio-Test.cmd"))) {
                // Running program and its helper cannot be replaced safely.
                try {
                    using (var fs=new FileStream(Path.Combine(target,"preview_server.exe"),
                                                 FileMode.Open,FileAccess.ReadWrite,FileShare.None)) {}
                } catch (IOException) {
                    throw new IOException("Fertigungsstudio CAM läuft noch. Bitte vor dem Update schließen.");
                }
            }
            Directory.CreateDirectory(target);
            var installed = new List<string>();
            foreach (var file in Directory.GetFiles(stage,"*",SearchOption.AllDirectories)) {
                string rel = file.Substring(stage.Length).TrimStart('\\','/');
                string dest = Path.Combine(target,rel);
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                File.Copy(file,dest,true);
                installed.Add(rel);
            }
            using(var src=File.OpenRead(own))
            using(var dest=File.Create(Path.Combine(target,Uninstaller)))
                CopyStream(src,dest,offset);
            installed.Add(Uninstaller);
            File.WriteAllLines(Path.Combine(target,Manifest),installed,Encoding.UTF8);
            if (register) {
                WriteRegistry(target);
                CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                        Display+".lnk"),target);
                CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                        Display+".lnk"),target);
            }
        } finally { try { Directory.Delete(temp,true); } catch {} }
    }
    static void WriteRegistry(string dir) {
        using (var key = Registry.CurrentUser.CreateSubKey(RegKey)) {
            key.SetValue("DisplayName", Display);
            key.SetValue("DisplayVersion", Version);
            key.SetValue("Publisher", "Fertigungsstudio CAM contributors");
            key.SetValue("InstallLocation",dir);
            key.SetValue("UninstallString","\""+Path.Combine(dir,Uninstaller)+"\" --uninstall");
            key.SetValue("NoModify",1,RegistryValueKind.DWord);
            key.SetValue("NoRepair",1,RegistryValueKind.DWord);
        }
    }
    static void CreateShortcut(string location,string target) {
        try {
            Directory.CreateDirectory(Path.GetDirectoryName(location));
            Type type=Type.GetTypeFromProgID("WScript.Shell");
            if(type==null) return;
            object shell=Activator.CreateInstance(type);
            object shortcut=type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,
                                             new object[]{location});
            var t=shortcut.GetType();
            t.InvokeMember("TargetPath",BindingFlags.SetProperty,null,shortcut,
                new object[]{Path.Combine(target,"Start-Fertigungsstudio-Test.cmd")});
            t.InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,shortcut,new object[]{target});
            t.InvokeMember("Save",BindingFlags.InvokeMethod,null,shortcut,new object[]{});
            System.Runtime.InteropServices.Marshal.ReleaseComObject(shortcut);
            System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
        } catch { /* Start menu shortcut can be recreated manually. */ }
    }
    static void Start(string dir) {
        var p=new ProcessStartInfo("cmd.exe","/c \"\""+Path.Combine(dir,"Start-Fertigungsstudio-Test.cmd")+"\"\"");
        p.WorkingDirectory=dir;
        p.UseShellExecute=true;
        Process.Start(p);
    }
    static void Uninstall(string dir,bool register) {
        if (!Directory.Exists(dir)) return;
        string manifest=Path.Combine(dir,Manifest);
        if (!File.Exists(manifest))
            throw new InvalidDataException("Installationsliste fehlt; keine unbekannten Dateien löschen.");
        foreach(string rel in File.ReadAllLines(manifest,Encoding.UTF8)) {
            if (rel==Uninstaller) continue;
            if (rel.IndexOf("..",StringComparison.Ordinal)>=0 || Path.IsPathRooted(rel)) continue;
            string full=Path.GetFullPath(Path.Combine(dir,rel));
            if (!full.StartsWith(Path.GetFullPath(dir).TrimEnd('\\')+"\\",
                                 StringComparison.OrdinalIgnoreCase)) continue;
            try { if (File.Exists(full)) File.Delete(full); }
            catch(IOException) { throw new IOException("Programm läuft noch. Bitte erst schließen."); }
        }
        File.Delete(manifest);
        if (register) {
            Registry.CurrentUser.DeleteSubKey(RegKey,false);
            foreach(var shortcut in new []{
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),Display+".lnk"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),Display+".lnk")})
                try { File.Delete(shortcut); } catch {}
        }
        // Uninstaller removes itself after this process has terminated.
        var psi = new ProcessStartInfo("cmd.exe","/c ping -n 3 127.0.0.1 >nul & del /q \""
                        +Path.Combine(dir,Uninstaller)+"\"");
        psi.WindowStyle=ProcessWindowStyle.Hidden;
        psi.CreateNoWindow=true; psi.UseShellExecute=false;
        Process.Start(psi);
        MessageBox.Show("Fertigungsstudio CAM deinstalliert.\n" +
                        "Eigene Projektdateien wurden nicht gelöscht.",Display);
    }
}
