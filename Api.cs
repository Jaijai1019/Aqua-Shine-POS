using System.Globalization;
using System.Text.Json;
namespace AquaShine;

static class Api
{
    static string S(this JsonElement p, string k)
    {
        if (p.ValueKind != JsonValueKind.Object || !p.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null) return "";
        return v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString();
    }
    static int I(this JsonElement p, string k) => int.TryParse(p.S(k), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : 0;
    static decimal D(this JsonElement p, string k) => decimal.TryParse(p.S(k), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : 0;

    static void Need(params string[] roles)
    {
        if (Session.Role == null) throw new Exception("Please log in again.");
        if (roles.Length > 0 && !roles.Contains(Session.Role)) throw new Exception("You do not have permission to do that.");
    }
    
    // CHANGED: Now formats DateTime with AM/PM (hh:mm tt)
    static object Norm(object v) => v switch { DBNull => null, DateTime d => d.ToString("yyyy-MM-dd hh:mm tt"), _ => v };
    
    static List<Dictionary<string, object>> Rows(DataTable t) =>
        t.AsEnumerable().Select(r => t.Columns.Cast<DataColumn>().ToDictionary(c => c.ColumnName, c => Norm(r[c]))).ToList();

    const string ItemSql = "SELECT id,name,brand,category,unit_price AS price,quantity AS stock,reorder_level AS reorder FROM items WHERE is_active=1";

    static void LogAudit(string action, string details)
    {
        if (Session.UserId == 0) return;
        Db.Exec("INSERT INTO audit_log(user_id, action, details) VALUES(@u, @a, @d)", 
            ("@u", Session.UserId), ("@a", action), ("@d", details));
    }

    public static object Handle(string action, JsonElement p)
    {
        switch (action)
        {
            case "auth.info": return new { firstRun = Db.FirstRun };
            case "auth.login": return Login(p);
            case "auth.signup": return Signup(p);
            case "auth.logout": Session.Clear(); return new { ok = true };

            case "items.list": Need(); return Rows(Db.Table(ItemSql + " ORDER BY name"));
            case "items.save": Need("Admin"); return SaveItem(p);
            case "items.delete": Need("Admin"); return DeleteItem(p);

            case "stock.add": Need("Admin", "Manager"); return StockAdd(p);
            case "stock.price": Need("Admin", "Manager"); return StockPrice(p);

            case "sales.checkout": return Checkout(p);
            case "sales.list": Need(); return SalesList(p);
            case "sales.receipt": Need(); return ReceiptData(p.I("id"));
            case "sales.updateDelivery": Need("Admin", "Manager"); return UpdateDelivery(p);

            case "users.list": Need("Admin"); return Rows(Db.Table(@"SELECT u.id, u.username, CONCAT(u.first_name,' ',u.last_name) AS name, r.name AS role, u.created_at AS created 
                                                                 FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.username"));
            case "users.setRole": Need("Admin"); return SetRole(p);
            case "users.resetPassword": Need("Admin"); return ResetPw(p);
            
            case "audit.list": Need("Admin"); return Rows(Db.Table(@"SELECT a.id, a.created_at AS date, u.username, a.action, a.details 
                                                                   FROM audit_log a JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 500"));
            default: throw new Exception("Unknown action: " + action);
        }
    }

    // ---------- accounts ----------
    static object Login(JsonElement p)
    {
        var u = p.S("username").Trim(); var pw = p.S("password");
        if (u == "" || pw == "") throw new Exception("Enter your username and password.");
        var t = Db.Table("SELECT u.id, u.first_name, u.last_name, u.password_hash, r.name AS role FROM users u JOIN roles r ON u.role_id=r.id WHERE u.username=@u", ("@u", u));
        if (t.Rows.Count == 0 || !Db.Verify(pw, (string)t.Rows[0]["password_hash"])) throw new Exception("Invalid username or password.");
        var r = t.Rows[0];
        if ((string)r["role"] != p.S("role")) throw new Exception($"This account is not a {p.S("role")}.");
        
        Session.UserId = Convert.ToInt32(r["id"]); Session.Role = (string)r["role"]; Session.Name = r["first_name"] + " " + r["last_name"];
        Db.FirstRun = false;
        LogAudit("Login", "User logged in");
        return new { name = Session.Name, role = Session.Role };
    }

    static object Signup(JsonElement p)
    {
        var u = p.S("username").Trim(); var pw = p.S("password");
        if (p.S("first").Trim() == "" || p.S("last").Trim() == "") throw new Exception("Enter your first and last name.");
        if (u == "") throw new Exception("Enter a username.");
        if (pw.Length < 6) throw new Exception("Password must be at least 6 characters.");
        if (Convert.ToInt32(Db.Scalar("SELECT COUNT(*) FROM users WHERE username=@u", ("@u", u))) > 0) throw new Exception("That username is already taken.");
        
        Db.Exec("INSERT INTO users(first_name,last_name,username,password_hash,role_id) VALUES(@f,@l,@u,@p,(SELECT id FROM roles WHERE name='Cashier'))",
            ("@f", p.S("first").Trim()), ("@l", p.S("last").Trim()), ("@u", u), ("@p", Db.Hash(pw)));
        
        var newId = Db.Scalar("SELECT id FROM users WHERE username=@u", ("@u", u));
        Db.Exec("INSERT INTO audit_log(user_id, action, details) VALUES(@u, 'Signup', 'Created new account')", ("@u", newId));
        
        return new { ok = true };
    }

    static object SetRole(JsonElement p)
    {
        var role = p.S("role"); int id = p.I("id");
        if (role != "Admin" && role != "Manager" && role != "Cashier") throw new Exception("Invalid role.");
        if (id == Session.UserId) throw new Exception("You can't change your own role.");
        
        Db.Exec("UPDATE users SET role_id=(SELECT id FROM roles WHERE name=@r) WHERE id=@i", ("@r", role), ("@i", id)); 
        LogAudit("Role Change", $"Set role of user ID {id} to {role}");
        return new { ok = true };
    }

    static object ResetPw(JsonElement p)
    {
        if (p.S("password").Length < 6) throw new Exception("Password must be at least 6 characters.");
        Db.Exec("UPDATE users SET password_hash=@p WHERE id=@i", ("@p", Db.Hash(p.S("password"))), ("@i", p.I("id"))); 
        LogAudit("Reset Password", $"Reset password for user ID {p.I("id")}");
        return new { ok = true };
    }

    // ---------- items & stock ----------
    static object SaveItem(JsonElement p)
    {
        int id = p.I("id"), qty = p.I("qty"), re = p.I("reorder"); var price = p.D("price"); var name = p.S("name").Trim();
        if (name == "") throw new Exception("Item name is required.");
        if (price <= 0) throw new Exception("Enter a unit price above zero.");
        if (qty < 0 || re < 0) throw new Exception("Quantity and reorder level cannot be negative.");
        var cat = p.S("category").Trim() == "" ? "Other" : p.S("category").Trim();
        var args = new (string, object)[] { ("@n", name), ("@b", p.S("brand").Trim()), ("@c", cat), ("@p", price), ("@q", qty), ("@r", re), ("@i", id) };
        
        if (id == 0)
        {
            var nid = Db.Insert("INSERT INTO items(name,brand,category,unit_price,quantity,reorder_level) VALUES(@n,@b,@c,@p,@q,@r)", args);
            if (qty > 0) Db.Exec("INSERT INTO stock_log(item_id,user_id,change_qty,reason) VALUES(@i,@u,@q,'Initial stock')", ("@i", nid), ("@u", Session.UserId), ("@q", qty));
            LogAudit("Add Item", $"Created new item: {name}");
        }
        else
        {
            var old = Convert.ToInt32(Db.Scalar("SELECT quantity FROM items WHERE id=@i", ("@i", id)));
            Db.Exec("UPDATE items SET name=@n,brand=@b,category=@c,unit_price=@p,quantity=@q,reorder_level=@r WHERE id=@i", args);
            if (old != qty) Db.Exec("INSERT INTO stock_log(item_id,user_id,change_qty,reason) VALUES(@i,@u,@d,'Manual edit')", ("@i", id), ("@u", Session.UserId), ("@d", qty - old));
            LogAudit("Edit Item", $"Updated item: {name}");
        }
        return new { ok = true };
    }

    static object DeleteItem(JsonElement p)
    {
        var name = Db.Scalar("SELECT name FROM items WHERE id=@i", ("@i", p.I("id")));
        Db.Exec("UPDATE items SET is_active=0 WHERE id=@i", ("@i", p.I("id"))); 
        LogAudit("Delete Item", $"Deleted item: {name}");
        return new { ok = true };
    }

    static object OneItem(int id) => Rows(Db.Table(ItemSql + " AND id=@i", ("@i", id))).First();

    static object StockAdd(JsonElement p)
    {
        int id = p.I("id"), q = p.I("qty");
        if (q <= 0) throw new Exception("Enter a quantity above zero.");
        var reason = p.S("reason").Trim() == "" ? "Restock" : p.S("reason").Trim();
        using var c = Db.Open(); using var tx = c.BeginTransaction();
        Db.Cmd(c, tx, "UPDATE items SET quantity=quantity+@q WHERE id=@i", ("@q", q), ("@i", id)).ExecuteNonQuery();
        Db.Cmd(c, tx, "INSERT INTO stock_log(item_id,user_id,change_qty,reason) VALUES(@i,@u,@q,@r)", ("@i", id), ("@u", Session.UserId), ("@q", q), ("@r", reason)).ExecuteNonQuery();
        tx.Commit();
        LogAudit("Add Stock", $"Added {q} to item ID {id} ({reason})");
        return OneItem(id);
    }

    static object StockPrice(JsonElement p)
    {
        int id = p.I("id"); var price = p.D("price");
        if (price <= 0) throw new Exception("Enter a price above zero.");
        var old = Convert.ToDecimal(Db.Scalar("SELECT unit_price FROM items WHERE id=@i", ("@i", id)));
        using var c = Db.Open(); using var tx = c.BeginTransaction();
        Db.Cmd(c, tx, "UPDATE items SET unit_price=@p WHERE id=@i", ("@p", price), ("@i", id)).ExecuteNonQuery();
        Db.Cmd(c, tx, "INSERT INTO stock_log(item_id,user_id,change_qty,reason) VALUES(@i,@u,0,@r)", ("@i", id), ("@u", Session.UserId), ("@r", $"Price changed {old:N2} -> {price:N2}")).ExecuteNonQuery();
        tx.Commit();
        LogAudit("Price Change", $"Item ID {id} price changed from {old:N2} to {price:N2}");
        return OneItem(id);
    }

    // ---------- sales ----------
    static object Checkout(JsonElement p)
    {
        Need("Cashier");
        var type = p.S("type") == "Delivery" ? "Delivery" : "Walk-in";
        var addr = p.S("address").Trim();
        var contact = p.S("contact").Trim();
        var fee = p.D("fee");
        
        if (type == "Delivery" && addr == "") throw new Exception("Enter a delivery address.");
        
        var want = new Dictionary<int, int>();
        if (p.ValueKind == JsonValueKind.Object && p.TryGetProperty("lines", out var ls) && ls.ValueKind == JsonValueKind.Array)
            foreach (var x in ls.EnumerateArray()) { int i = x.I("id"), q = x.I("qty"); if (i > 0 && q > 0) want[i] = want.GetValueOrDefault(i) + q; }
        if (want.Count == 0) throw new Exception("The basket is empty.");
        var paid = p.D("paid");

        using var c = Db.Open(); using var tx = c.BeginTransaction();
        try
        {
            var lines = new List<(int id, string name, decimal price, int qty)>(); decimal total = 0;
            foreach (var kv in want)
            {
                string name; decimal price;
                using (var r = Db.Cmd(c, tx, "SELECT name,unit_price FROM items WHERE id=@i AND is_active=1 FOR UPDATE", ("@i", kv.Key)).ExecuteReader())
                {
                    if (!r.Read()) throw new Exception("An item in the basket no longer exists.");
                    name = r.GetString(0); price = r.GetDecimal(1);
                }
                if (Db.Cmd(c, tx, "UPDATE items SET quantity=quantity-@q WHERE id=@i AND quantity>=@q", ("@q", kv.Value), ("@i", kv.Key)).ExecuteNonQuery() == 0)
                    throw new Exception($"Not enough stock left for \"{name}\".");
                lines.Add((kv.Key, name, price, kv.Value)); total += price * kv.Value;
            }
            
            total += fee;
            if (paid < total) throw new Exception("Amount paid is less than the total.");
            
            var m = Db.Cmd(c, tx, @"INSERT INTO sales(receipt_no,user_id,sale_type,customer,address,contact_no,delivery_fee,total,payment,change_amt)
                                    VALUES(@r,@u,@t,@c,@a,@cn,@f,@tot,@pay,@chg)",
                ("@r", "AS-" + DateTime.Now.ToString("yyMMdd-HHmmssfff")), ("@u", Session.UserId), ("@t", type),
                ("@c", p.S("customer").Trim()), ("@a", addr), ("@cn", contact), ("@f", fee), 
                ("@tot", total), ("@pay", paid), ("@chg", paid - total));
            m.ExecuteNonQuery(); int saleId = (int)m.LastInsertedId;
            
            foreach (var l in lines)
                Db.Cmd(c, tx, "INSERT INTO sale_items(sale_id,item_id,item_name,unit_price,qty,line_total) VALUES(@s,@i,@n,@p,@q,@t)",
                    ("@s", saleId), ("@i", l.id), ("@n", l.name), ("@p", l.price), ("@q", l.qty), ("@t", l.price * l.qty)).ExecuteNonQuery();
            tx.Commit();
            
            LogAudit("Checkout", $"Processed sale {saleId} ({type}) for {total:N2}");
            return new { saleId };
        }
        catch { tx.Rollback(); throw; }
    }

    static DateTime Day(string s, DateTime fallback) =>
        DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : fallback;

    static object SalesList(JsonElement p)
    {
        var from = Day(p.S("from"), DateTime.Today.AddDays(-30)); var to = Day(p.S("to"), DateTime.Today).AddDays(1);
        var sql = @"SELECT s.id,s.receipt_no AS receipt,s.created_at AS date,CONCAT(u.first_name,' ',u.last_name) AS cashier,
                           s.sale_type AS type,s.customer,s.total, s.delivery_status AS d_status
                    FROM sales s JOIN users u ON u.id=s.user_id
                    WHERE s.created_at>=@f AND s.created_at<@t AND (s.receipt_no LIKE @q OR s.customer LIKE @q)"
                  + (Session.Role == "Cashier" ? " AND s.user_id=@u" : "") + " ORDER BY s.created_at DESC";
        return Rows(Db.Table(sql, ("@f", from), ("@t", to), ("@q", "%" + p.S("q").Trim() + "%"), ("@u", Session.UserId)));
    }

    static object ReceiptData(int id)
    {
        var t = Db.Table(@"SELECT s.user_id,s.receipt_no,s.created_at AS date,s.sale_type AS type,s.customer,s.address,s.contact_no AS contact,
                                  s.delivery_fee AS fee, s.delivery_status AS d_status, s.total,s.payment AS paid,s.change_amt AS chg,
                                  CONCAT(u.first_name,' ',u.last_name) AS cashier
                           FROM sales s JOIN users u ON u.id=s.user_id WHERE s.id=@i", ("@i", id));
        if (t.Rows.Count == 0) throw new Exception("Receipt not found.");
        if (Session.Role == "Cashier" && Convert.ToInt32(t.Rows[0]["user_id"]) != Session.UserId) throw new Exception("You can only view your own receipts.");
        var lines = Rows(Db.Table("SELECT item_name AS name,unit_price AS price,qty,line_total AS total FROM sale_items WHERE sale_id=@i", ("@i", id)));
        var h = Rows(t)[0]; h["lines"] = lines; return h;
    }

    static object UpdateDelivery(JsonElement p)
    {
        int id = p.I("id"); var status = p.S("status");
        if (status != "Pending" && status != "Out for Delivery" && status != "Delivered" && status != "Cancelled") throw new Exception("Invalid status.");
        Db.Exec("UPDATE sales SET delivery_status=@s WHERE id=@i", ("@s", status), ("@i", id));
        LogAudit("Delivery Update", $"Sale ID {id} marked as {status}");
        return new { ok = true };
    }
}