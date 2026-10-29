global using System.Data;
global using MySqlConnector;
namespace AquaShine;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        try { Db.Init(); }
        catch (Exception ex)
        {
            MessageBox.Show("Cannot connect to the database.\n\n" + ex.Message +
                "\n\n1) Start MySQL in the XAMPP Control Panel\n2) Import database.sql\n3) Check Db.ConnStr in Core.cs",
                "Aqua Shine", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        Application.Run(new MainForm());
    }
}
