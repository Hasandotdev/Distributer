-- 001_initial_schema.sql
-- Distribution & Credit Management System - Initial Schema
-- Safe to re-run: handles existing tables by adding missing columns

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES (CREATE or ADD missing columns)
-- ============================================

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- Add missing columns to routes if table already existed
do $$ begin alter table routes add column if not exists id uuid primary key default gen_random_uuid(); exception when duplicate_column then null; end $$;
do $$ begin alter table routes add column if not exists name text not null unique; exception when duplicate_column then null; end $$;
do $$ begin alter table routes add column if not exists created_at timestamptz default now(); exception when duplicate_column then null; end $$;

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  route_id uuid references routes(id),
  auth_user_id uuid references auth.users(id) on delete set null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Add missing columns to employees
do $$ begin alter table employees add column if not exists phone text; exception when duplicate_column then null; end $$;
do $$ begin alter table employees add column if not exists route_id uuid references routes(id); exception when duplicate_column then null; end $$;
do $$ begin alter table employees add column if not exists auth_user_id uuid references auth.users(id) on delete set null; exception when duplicate_column then null; end $$;
do $$ begin alter table employees add column if not exists is_active boolean default true; exception when duplicate_column then null; end $$;
do $$ begin alter table employees add column if not exists created_at timestamptz default now(); exception when duplicate_column then null; end $$;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  route_id uuid references routes(id),
  opening_balance numeric default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Add missing columns to customers
do $$ begin alter table customers add column if not exists address text; exception when duplicate_column then null; end $$;
do $$ begin alter table customers add column if not exists phone text; exception when duplicate_column then null; end $$;
do $$ begin alter table customers add column if not exists route_id uuid references routes(id); exception when duplicate_column then null; end $$;
do $$ begin alter table customers add column if not exists opening_balance numeric default 0; exception when duplicate_column then null; end $$;
do $$ begin alter table customers add column if not exists is_active boolean default true; exception when duplicate_column then null; end $$;
do $$ begin alter table customers add column if not exists created_at timestamptz default now(); exception when duplicate_column then null; end $$;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text default 'pcs',
  rate numeric default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Add missing columns to products
do $$ begin alter table products add column if not exists unit text default 'pcs'; exception when duplicate_column then null; end $$;
do $$ begin alter table products add column if not exists rate numeric default 0; exception when duplicate_column then null; end $$;
do $$ begin alter table products add column if not exists is_active boolean default true; exception when duplicate_column then null; end $$;
do $$ begin alter table products add column if not exists created_at timestamptz default now(); exception when duplicate_column then null; end $$;

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  customer_id uuid references customers(id),
  employee_id uuid references employees(id),
  bill_date date not null default current_date,
  total_amount numeric not null default 0,
  paid_amount numeric default 0,
  credit_amount numeric generated always as (total_amount - paid_amount) stored,
  payment_status text check (payment_status in ('cash','credit','partial')) default 'cash',
  notes text,
  is_voided boolean default false,
  created_at timestamptz default now()
);

-- Add missing columns to bills
do $$ begin alter table bills add column if not exists bill_number text not null unique; exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists customer_id uuid references customers(id); exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists employee_id uuid references employees(id); exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists bill_date date not null default current_date; exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists total_amount numeric not null default 0; exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists paid_amount numeric default 0; exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists payment_status text check (payment_status in ('cash','credit','partial')) default 'cash'; exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists notes text; exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists is_voided boolean default false; exception when duplicate_column then null; end $$;
do $$ begin alter table bills add column if not exists created_at timestamptz default now(); exception when duplicate_column then null; end $$;

-- Add credit_amount generated column only if it doesn't exist
do $$ begin
  alter table bills add column if not exists credit_amount numeric
    generated always as (total_amount - paid_amount) stored;
exception when duplicate_column then null;
end $$;

create table if not exists recoveries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  employee_id uuid references employees(id),
  amount numeric not null,
  recovery_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

-- Add missing columns to recoveries
do $$ begin alter table recoveries add column if not exists customer_id uuid references customers(id); exception when duplicate_column then null; end $$;
do $$ begin alter table recoveries add column if not exists employee_id uuid references employees(id); exception when duplicate_column then null; end $$;
do $$ begin alter table recoveries add column if not exists amount numeric not null; exception when duplicate_column then null; end $$;
do $$ begin alter table recoveries add column if not exists recovery_date date not null default current_date; exception when duplicate_column then null; end $$;
do $$ begin alter table recoveries add column if not exists notes text; exception when duplicate_column then null; end $$;
do $$ begin alter table recoveries add column if not exists created_at timestamptz default now(); exception when duplicate_column then null; end $$;

-- ============================================
-- INDEXES (IF NOT EXISTS)
-- ============================================

create index if not exists idx_bills_customer_id on bills(customer_id);
create index if not exists idx_bills_employee_id on bills(employee_id);
create index if not exists idx_bills_bill_date on bills(bill_date);
create index if not exists idx_bills_credit_amount on bills(credit_amount);

create index if not exists idx_recoveries_customer_id on recoveries(customer_id);
create index if not exists idx_recoveries_employee_id on recoveries(employee_id);
create index if not exists idx_recoveries_recovery_date on recoveries(recovery_date);

create index if not exists idx_customers_route_id on customers(route_id);
create index if not exists idx_employees_route_id on employees(route_id);

-- ============================================
-- FUNCTIONS (CREATE OR REPLACE = idempotent)
-- ============================================

create or replace function get_user_role(p_user_id uuid)
returns text
language sql
security definer
stable
as $$
  select coalesce(
    (select raw_user_meta_data ->> 'role' from auth.users where id = p_user_id),
    'employee'
  );
$$;

create or replace function get_user_route_ids(p_user_id uuid)
returns uuid[]
language sql
security definer
stable
as $$
  select coalesce(
    array_agg(e.route_id) filter (where e.route_id is not null),
    '{}'::uuid[]
  )
  from employees e
  where e.auth_user_id = p_user_id
    and e.is_active = true;
$$;

create or replace function generate_bill_number()
returns text
language plpgsql
security definer
as $$
declare
  next_val bigint;
begin
  next_val := nextval('bill_number_seq');
  return 'BILL-' || lpad(next_val::text, 4, '0');
end;
$$;

create sequence if not exists bill_number_seq start 1 increment 1;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table routes enable row level security;
alter table employees enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table bills enable row level security;
alter table recoveries enable row level security;

-- ============================================
-- RLS POLICIES (drop then recreate = idempotent)
-- ============================================

-- ROUTES
drop policy if exists "Admin can do everything on routes" on routes;
drop policy if exists "Employee can view assigned routes" on routes;

create policy "Admin can do everything on routes"
  on routes for all
  using (get_user_role(auth.uid()) = 'admin');

create policy "Employee can view assigned routes"
  on routes for select
  using (
    get_user_role(auth.uid()) = 'employee'
    and id = any(get_user_route_ids(auth.uid()))
  );

-- EMPLOYEES
drop policy if exists "Admin can do everything on employees" on employees;
drop policy if exists "Employee can view self and same-route employees" on employees;
drop policy if exists "Employee can update own record" on employees;

create policy "Admin can do everything on employees"
  on employees for all
  using (get_user_role(auth.uid()) = 'admin');

create policy "Employee can view self and same-route employees"
  on employees for select
  using (
    get_user_role(auth.uid()) = 'employee'
    and (
      auth_user_id = auth.uid()
      or route_id = any(get_user_route_ids(auth.uid()))
    )
  );

create policy "Employee can update own record"
  on employees for update
  using (
    get_user_role(auth.uid()) = 'employee'
    and auth_user_id = auth.uid()
  )
  with check (
    get_user_role(auth.uid()) = 'employee'
    and auth_user_id = auth.uid()
  );

-- CUSTOMERS
drop policy if exists "Admin can do everything on customers" on customers;
drop policy if exists "Employee can view customers in assigned routes" on customers;
drop policy if exists "Employee can insert customers in assigned routes" on customers;
drop policy if exists "Employee can update customers in assigned routes" on customers;

create policy "Admin can do everything on customers"
  on customers for all
  using (get_user_role(auth.uid()) = 'admin');

create policy "Employee can view customers in assigned routes"
  on customers for select
  using (
    get_user_role(auth.uid()) = 'employee'
    and route_id = any(get_user_route_ids(auth.uid()))
  );

create policy "Employee can insert customers in assigned routes"
  on customers for insert
  with check (
    get_user_role(auth.uid()) = 'employee'
    and route_id = any(get_user_route_ids(auth.uid()))
  );

create policy "Employee can update customers in assigned routes"
  on customers for update
  using (
    get_user_role(auth.uid()) = 'employee'
    and route_id = any(get_user_route_ids(auth.uid()))
  )
  with check (
    get_user_role(auth.uid()) = 'employee'
    and route_id = any(get_user_route_ids(auth.uid()))
  );

-- PRODUCTS
drop policy if exists "Admin can do everything on products" on products;
drop policy if exists "All authenticated users can view products" on products;

create policy "Admin can do everything on products"
  on products for all
  using (get_user_role(auth.uid()) = 'admin');

create policy "All authenticated users can view products"
  on products for select
  using (auth.role() = 'authenticated');

-- BILLS
drop policy if exists "Admin can do everything on bills" on bills;
drop policy if exists "Employee can view own bills or bills in assigned routes" on bills;
drop policy if exists "Employee can insert bills for assigned routes" on bills;
drop policy if exists "Employee can update own bills" on bills;

create policy "Admin can do everything on bills"
  on bills for all
  using (get_user_role(auth.uid()) = 'admin');

create policy "Employee can view own bills or bills in assigned routes"
  on bills for select
  using (
    get_user_role(auth.uid()) = 'employee'
    and (
      employee_id in (select id from employees where auth_user_id = auth.uid())
      or customer_id in (
        select c.id from customers c
        where c.route_id = any(get_user_route_ids(auth.uid()))
      )
    )
  );

create policy "Employee can insert bills for assigned routes"
  on bills for insert
  with check (
    get_user_role(auth.uid()) = 'employee'
    and (
      employee_id in (select id from employees where auth_user_id = auth.uid())
      or customer_id in (
        select c.id from customers c
        where c.route_id = any(get_user_route_ids(auth.uid()))
      )
    )
  );

create policy "Employee can update own bills"
  on bills for update
  using (
    get_user_role(auth.uid()) = 'employee'
    and employee_id in (select id from employees where auth_user_id = auth.uid())
  )
  with check (
    get_user_role(auth.uid()) = 'employee'
    and employee_id in (select id from employees where auth_user_id = auth.uid())
  );

-- RECOVERIES
drop policy if exists "Admin can do everything on recoveries" on recoveries;
drop policy if exists "Employee can view own recoveries or recoveries in assigned routes" on recoveries;
drop policy if exists "Employee can insert recoveries for assigned routes" on recoveries;
drop policy if exists "Employee can update own recoveries" on recoveries;

create policy "Admin can do everything on recoveries"
  on recoveries for all
  using (get_user_role(auth.uid()) = 'admin');

create policy "Employee can view own recoveries or recoveries in assigned routes"
  on recoveries for select
  using (
    get_user_role(auth.uid()) = 'employee'
    and (
      employee_id in (select id from employees where auth_user_id = auth.uid())
      or customer_id in (
        select c.id from customers c
        where c.route_id = any(get_user_route_ids(auth.uid()))
      )
    )
  );

create policy "Employee can insert recoveries for assigned routes"
  on recoveries for insert
  with check (
    get_user_role(auth.uid()) = 'employee'
    and (
      employee_id in (select id from employees where auth_user_id = auth.uid())
      or customer_id in (
        select c.id from customers c
        where c.route_id = any(get_user_route_ids(auth.uid()))
      )
    )
  );

create policy "Employee can update own recoveries"
  on recoveries for update
  using (
    get_user_role(auth.uid()) = 'employee'
    and employee_id in (select id from employees where auth_user_id = auth.uid())
  )
  with check (
    get_user_role(auth.uid()) = 'employee'
    and employee_id in (select id from employees where auth_user_id = auth.uid())
  );
