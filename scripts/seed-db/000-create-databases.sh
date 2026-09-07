#!/bin/sh
set -eu

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set catalog_password="$CATALOG_DB_PASSWORD" \
  --set order_password="$ORDER_DB_PASSWORD" \
  --set customer_password="$CUSTOMER_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE catalog_user LOGIN PASSWORD %L', :'catalog_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'catalog_user')\gexec
SELECT format('CREATE ROLE order_user LOGIN PASSWORD %L', :'order_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'order_user')\gexec
SELECT format('CREATE ROLE customer_user LOGIN PASSWORD %L', :'customer_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'customer_user')\gexec

SELECT 'CREATE DATABASE catalog_db OWNER catalog_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'catalog_db')\gexec
SELECT 'CREATE DATABASE order_db OWNER order_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'order_db')\gexec
SELECT 'CREATE DATABASE customer_db OWNER customer_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'customer_db')\gexec
SQL
