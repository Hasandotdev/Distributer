-- 002_employee_multi_route.sql
-- Adds employee_routes junction table for many-to-many employee-route assignment

-- Create junction table
create table if not exists employee_routes (
  employee_id uuid references employees(id) on delete cascade,
  route_id uuid references routes(id) on delete cascade,
  primary key (employee_id, route_id)
);

-- Enable RLS
alter table employee_routes enable row level security;

-- Migrate existing single route_id data to junction table
insert into employee_routes (employee_id, route_id)
select id, route_id from employees
where route_id is not null
on conflict do nothing;

-- Drop old single route_id column (optional, keep for backward compat)
-- alter table employees drop column if exists route_id;

-- Update get_user_route_ids to use junction table
create or replace function get_user_route_ids(p_user_id uuid)
returns uuid[]
language sql
security definer
stable
as $$
  select coalesce(
    array_agg(er.route_id),
    '{}'::uuid[]
  )
  from employee_routes er
  join employees e on e.id = er.employee_id
  where e.auth_user_id = p_user_id
    and e.is_active = true;
$$;

-- RLS policies for employee_routes
drop policy if exists "Admin can do everything on employee_routes" on employee_routes;
drop policy if exists "Employee can view own routes" on employee_routes;

create policy "Admin can do everything on employee_routes"
  on employee_routes for all
  using (get_user_role(auth.uid()) = 'admin');

create policy "Employee can view own routes"
  on employee_routes for select
  using (
    get_user_role(auth.uid()) = 'employee'
    and employee_id in (select id from employees where auth_user_id = auth.uid())
  );

-- Update employees RLS to use junction table for route-based access
drop policy if exists "Employee can view self and same-route employees" on employees;

create policy "Employee can view self and same-route employees"
  on employees for select
  using (
    get_user_role(auth.uid()) = 'employee'
    and (
      auth_user_id = auth.uid()
      or id in (
        select er2.employee_id from employee_routes er2
        where er2.route_id = any(get_user_route_ids(auth.uid()))
      )
    )
  );
