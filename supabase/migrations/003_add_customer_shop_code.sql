-- 003_add_customer_shop_code.sql
-- Add shop_code column to customers table

alter table customers add column if not exists shop_code text unique;
