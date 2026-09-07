\set ON_ERROR_STOP on

\connect catalog_db
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SET ROLE catalog_user;
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_name_search_idx ON products (LOWER(name));
CREATE INDEX IF NOT EXISTS products_search_trgm_idx ON products USING GIN ((name || ' ' || description) gin_trgm_ops);
INSERT INTO products (id, name, description, category, price, stock) VALUES
  (1, 'Bamboo Desk Organizer', 'Modular organizer for pens, notes, and small devices.', 'Office', 24.99, 42),
  (2, 'Ergonomic Wireless Mouse', 'Quiet six-button mouse with adjustable sensitivity.', 'Electronics', 39.50, 28),
  (3, 'USB-C Travel Hub', 'Seven-port aluminum hub with HDMI and card reader.', 'Electronics', 54.00, 16),
  (4, 'Insulated Steel Bottle', 'Leak-resistant 750 ml bottle that stays cold all day.', 'Home', 29.95, 65),
  (5, 'Recycled Paper Notebook', 'Hardbound dotted notebook with 192 pages.', 'Office', 12.75, 120),
  (6, 'Compact Tool Set', 'Thirty-nine household tools in a durable case.', 'Tools', 44.90, 21),
  (7, 'Cotton Canvas Tote', 'Heavyweight reusable tote with an internal pocket.', 'Accessories', 18.00, 74),
  (8, 'LED Reading Lamp', 'Dimmable warm-light lamp with flexible neck.', 'Home', 31.25, 33)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
  price = EXCLUDED.price, stock = EXCLUDED.stock, updated_at = NOW();
SELECT setval(pg_get_serial_sequence('products', 'id'), GREATEST((SELECT MAX(id) FROM products), 1));
RESET ROLE;

\connect customer_db
SET ROLE customer_user;
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers (LOWER(email));
INSERT INTO customers (id, first_name, last_name, email, phone) VALUES
  (1, 'Asha', 'Sharma', 'asha.sharma@example.test', '+91-98765-10001'),
  (2, 'Rohan', 'Mehta', 'rohan.mehta@example.test', '+91-98765-10002'),
  (3, 'Maya', 'Iyer', 'maya.iyer@example.test', '+91-98765-10003')
ON CONFLICT (id) DO UPDATE SET
  first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  email = EXCLUDED.email, phone = EXCLUDED.phone;
SELECT setval(pg_get_serial_sequence('customers', 'id'), GREATEST((SELECT MAX(id) FROM customers), 1));
RESET ROLE;

\connect order_db
SET ROLE order_user;
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('placed', 'processing', 'shipped', 'delivered', 'cancelled')),
  total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  product_name VARCHAR(160) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
INSERT INTO orders (id, customer_id, status, total, created_at) VALUES
  (1, 1, 'delivered', 64.49, NOW() - INTERVAL '30 days'),
  (2, 1, 'shipped', 54.00, NOW() - INTERVAL '3 days'),
  (3, 2, 'processing', 62.70, NOW() - INTERVAL '1 day'),
  (4, 3, 'placed', 44.90, NOW() - INTERVAL '2 hours')
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id, status = EXCLUDED.status,
  total = EXCLUDED.total, created_at = EXCLUDED.created_at;
INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, line_total) VALUES
  (1, 1, 1, 'Bamboo Desk Organizer', 24.99, 1, 24.99),
  (2, 1, 2, 'Ergonomic Wireless Mouse', 39.50, 1, 39.50),
  (3, 2, 3, 'USB-C Travel Hub', 54.00, 1, 54.00),
  (4, 3, 5, 'Recycled Paper Notebook', 12.75, 2, 25.50),
  (5, 3, 7, 'Cotton Canvas Tote', 18.00, 2, 36.00),
  (6, 4, 6, 'Compact Tool Set', 44.90, 1, 44.90)
ON CONFLICT (id) DO UPDATE SET
  order_id = EXCLUDED.order_id, product_id = EXCLUDED.product_id,
  product_name = EXCLUDED.product_name, unit_price = EXCLUDED.unit_price,
  quantity = EXCLUDED.quantity, line_total = EXCLUDED.line_total;
SELECT setval(pg_get_serial_sequence('orders', 'id'), GREATEST((SELECT MAX(id) FROM orders), 1));
SELECT setval(pg_get_serial_sequence('order_items', 'id'), GREATEST((SELECT MAX(id) FROM order_items), 1));
RESET ROLE;
