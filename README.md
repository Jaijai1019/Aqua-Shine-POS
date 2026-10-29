# Aqua Shine POS (C# + WebView2 + HTML/CSS/JS + MySQL/XAMPP)

## One-time setup
1. Install the .NET 8 SDK (https://dotnet.microsoft.com/download) and check:  dotnet --version
2. Install VS Code + the "C# Dev Kit" extension (Microsoft).
3. Make sure the WebView2 Runtime is installed (already on Windows 11 / most Windows 10).
4. XAMPP Control Panel -> Start MySQL (and Apache if you want phpMyAdmin).
5. Import database.sql (phpMyAdmin -> Import, or: C:\xampp\mysql\bin\mysql.exe -u root < database.sql)

## Run
    cd AquaShineWeb
    dotnet restore
    dotnet run

Login: admin / admin123, Role = Admin. Change the password under USERS.

## Editing the HTML/CSS/JS
Files are in wwwroot/. While using `dotnet run` from this folder, just save and press Ctrl+Shift+R in the app window.
