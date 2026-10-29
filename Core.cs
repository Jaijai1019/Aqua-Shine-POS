using System.Security.Cryptography;
namespace AquaShine;

static class Session
{
    public static int UserId; public static string Name, Role;
    public static void Clear() { UserId = 0; Name = null; Role = null; }
}

static class Db
{
    // XAMPP defaults. If you set a MySQL password or use another port, change it here.
    public const string ConnStr = "Server=localhost;Port=3306;Database=aqua_shine;User ID=root;Password=;";
    public static bool FirstRun;

    public static MySqlConnection Open() { var c = new MySqlConnection(ConnStr); c.Open(); return c; }

    public static MySqlCommand Cmd(MySqlConnection c, MySqlTransaction t, string sql, params (string Name, object Value)[] p)
    {
        var m = new MySqlCommand(sql, c, t);
        foreach (var x in p) m.Parameters.AddWithValue(x.Name, x.Value ?? DBNull.Value);
        return m;
    }
    public static DataTable Table(string sql, params (string Name, object Value)[] p)
    { using var c = Open(); using var m = Cmd(c, null, sql, p); using var r = m.ExecuteReader(); var t = new DataTable(); t.Load(r); return t; }
    public static object Scalar(string sql, params (string Name, object Value)[] p)
    { using var c = Open(); using var m = Cmd(c, null, sql, p); return m.ExecuteScalar(); }
    public static int Exec(string sql, params (string Name, object Value)[] p)
    { using var c = Open(); using var m = Cmd(c, null, sql, p); return m.ExecuteNonQuery(); }
    public static long Insert(string sql, params (string Name, object Value)[] p)
    { using var c = Open(); using var m = Cmd(c, null, sql, p); m.ExecuteNonQuery(); return m.LastInsertedId; }

    public static void Init()
    {
        // 1. Ensure the default roles exist
        Exec("INSERT IGNORE INTO roles(name) VALUES ('Admin'), ('Manager'), ('Cashier')");

        // 2. Check if any users exist. If not, create the default admin.
        if (Convert.ToInt32(Scalar("SELECT COUNT(*) FROM users")) == 0)
        {
            // Insert admin and link to the 'Admin' role using a subquery
            Exec("INSERT INTO users(first_name,last_name,username,password_hash,role_id) VALUES('System','Admin','admin',@p,(SELECT id FROM roles WHERE name='Admin'))", ("@p", Hash("admin123")));
            FirstRun = true;
        }
    }

    public static string Hash(string pw)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var h = Rfc2898DeriveBytes.Pbkdf2(pw, salt, 100000, HashAlgorithmName.SHA256, 32);
        return Convert.ToBase64String(salt) + ":" + Convert.ToBase64String(h);
    }
    public static bool Verify(string pw, string stored)
    {
        var a = stored.Split(':');
        var h = Rfc2898DeriveBytes.Pbkdf2(pw, Convert.FromBase64String(a[0]), 100000, HashAlgorithmName.SHA256, 32);
        return CryptographicOperations.FixedTimeEquals(h, Convert.FromBase64String(a[1]));
    }
}