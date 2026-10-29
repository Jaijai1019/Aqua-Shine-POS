# **Aqua Shine POS: Inventory and Point of Sale System**
**A desktop Point of Sale and Inventory Management System developed for Aqua Shine Electrical and Industrial Supplies Trading. It streamlines sales, stock tracking, and delivery management, transitioning daily operations from manual logs to an automated, secure C# backend environment.**

## Key Features
* **Secure Authentication:** Role-based access control (Admin, Manager, Cashier) enforcing data privacy and system integrity.
* **Dual-Basket POS:** Cashiers can process two different customer transactions simultaneously using Basket 1 and Basket 2.
* **Inventory Management:** Track electrical and industrial supplies with automated "Reorder Level" low-stock alerts.
* **Delivery Tracking:** Record customer addresses, contact numbers, delivery fees, and update delivery statuses (Pending, Out for Delivery, Delivered, Cancelled).
* **Audit Logging:** Every critical action (logins, checkouts, price changes, item deletions) is securely logged in the database with a timestamp and user ID.
* **Excel Export:** Export Transaction History and Audit Logs directly to Excel (`.xls`) for accounting and reporting.

## Tech Stack
* **Backend Logic:** **C# (.NET 8)**
* **Frontend UI:** **HTML5, CSS3, JavaScript**
* **Desktop Wrapper:** **Microsoft WebView2**
* **Database:** **MySQL via XAMPP** 

> [!NOTE]
> Before you begin, ensure you have the following installed:

* **.NET 8 SDK** (https://dotnet.microsoft.com/download)
* **XAMPP (MySQL)** (https://www.apachefriends.org/index.html)
* **WebView2 Runtime** (Pre-installed on Windows 10/11, or download the Evergreen Bootstrapper from Microsoft)

| Dependency | Purpose | Status |
| :--- | :--- | :--- |
| **MySqlConnector** | Database ORM & secure connection bridge | Required |
| **Microsoft.Web.WebView2** | Chromium wrapper to host the HTML/JS UI | Required |
| **PBKDF2 (SHA-256)** | Cryptographic password hashing (Built into .NET) | Required |

## Key Features (Deep Dive)
* **C# as the Brain:** The frontend (JavaScript) has zero database access. All logic, math, and transactions are routed through C# to prevent SQL injection and unauthorized access.
* **ACID Compliance:** C# uses `BeginTransaction` during checkout. If a sale fails midway, the database rolls back to prevent corrupted data.
* **Audit Logs:** The Admin can monitor exactly who did what and when, ensuring accountability among staff.
* **Custom Receipts:** Generate and print thermal receipts with delivery details included.

## Installation and Setup 
1. Clone the Repository