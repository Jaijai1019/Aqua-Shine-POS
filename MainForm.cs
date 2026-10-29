using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
namespace AquaShine;

class Req { public int Id { get; set; } public string Action { get; set; } public JsonElement Payload { get; set; } }

class MainForm : Form
{
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    static readonly JsonSerializerOptions Opt = new() { PropertyNameCaseInsensitive = true };

    public MainForm()
    {
        Text = "Aqua Shine Electrical and Industrial Supplies Trading — POS";
        WindowState = FormWindowState.Maximized; MinimumSize = new Size(1000, 650);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        Controls.Add(web);
        Load += async (s, e) => await InitWeb();
    }

    async Task InitWeb()
    {
        try
        {
            var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AquaShine", "WebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, data);
            await web.EnsureCoreWebView2Async(env);

            // While developing with `dotnet run`, use the project's wwwroot so HTML edits show up on reload.
            var dev = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var folder = Directory.Exists(dev) ? dev : Path.Combine(AppContext.BaseDirectory, "wwwroot");
            web.CoreWebView2.SetVirtualHostNameToFolderMapping("app.local", folder, CoreWebView2HostResourceAccessKind.Allow);

            web.CoreWebView2.NewWindowRequested += (s, e) => e.Handled = true;
            web.CoreWebView2.NavigationStarting += (s, e) => { if (!e.Uri.StartsWith("https://app.local/")) e.Cancel = true; };
            web.CoreWebView2.WebMessageReceived += async (s, e) =>
            {
                Req req = null; object res;
                try
                {
                    req = JsonSerializer.Deserialize<Req>(e.WebMessageAsJson, Opt);
                    res = await Task.Run(() => Api.Handle(req.Action, req.Payload));
                }
                catch (Exception ex) { res = new { error = ex is MySqlException ? "Database error: " + ex.Message : ex.Message }; }
                if (req == null) return;
                web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { id = req.Id, data = res }));
            };
            web.Source = new Uri("https://app.local/index.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show("The WebView2 component could not start.\n\n" + ex.Message +
                "\n\nInstall the 'WebView2 Runtime' (Evergreen) from Microsoft and try again.", "Aqua Shine",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
