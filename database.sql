CREATE DATABASE IF NOT EXISTS aqua_shine CHARACTER SET utf8mb4;
USE aqua_shine;

-- ROLE TABLES
CREATE TABLE IF NOT EXISTS roles(
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE
);
INSERT IGNORE INTO roles(name) VALUES ('Admin'), ('Manager'), ('Cashier');

CREATE TABLE IF NOT EXISTS users(
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  role_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1, 
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS items(
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  brand VARCHAR(80) NOT NULL DEFAULT '',
  category VARCHAR(60) NOT NULL DEFAULT 'Other',
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level INT NOT NULL DEFAULT 10,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX(name), INDEX(category)
);

CREATE TABLE IF NOT EXISTS sales(
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(40) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  sale_type ENUM('Walk-in','Delivery') NOT NULL DEFAULT 'Walk-in',
  customer VARCHAR(100) NOT NULL DEFAULT '',
  address VARCHAR(200) NOT NULL DEFAULT '',
  contact_no VARCHAR(30) NOT NULL DEFAULT '',
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_status ENUM('Pending','Out for Delivery','Delivered','Cancelled') DEFAULT 'Pending',
  total DECIMAL(12,2) NOT NULL,
  payment DECIMAL(12,2) NOT NULL,
  change_amt DECIMAL(12,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sale_items(
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  item_id INT NOT NULL,
  item_name VARCHAR(120) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  qty INT NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS stock_log(
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  user_id INT NOT NULL,
  change_qty INT NOT NULL,
  reason VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log(
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  details VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO items(name,brand,category,unit_price,quantity,reorder_level) VALUES
('5-Gallon Round Bottle','Aquapure','Water Bottles',180.00,60,15),
('5-Gallon Slim Bottle','Aquapure','Water Bottles',165.00,40,15),
('Bottle Cap (Blue)','Generic','Caps',3.50,500,100),
('Tamper-Proof Seal','Generic','Seals',1.50,800,200),
('10" Sediment Filter','Pentair','Filters',250.00,25,8),
('Activated Carbon Filter','Pentair','Filters',320.00,20,8),
('Manual Dispenser Pump','Hydro','Pumps',450.00,12,5),
('Electric Water Pump','Hydro','Pumps',1850.00,6,3),
('Alkaline Water Refill (5 gal)','Aqua Shine','Water Products',35.00,100,30),
('Purified Water Refill (5 gal)','Aqua Shine','Water Products',25.00,150,40);