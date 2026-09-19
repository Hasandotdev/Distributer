-- Migration 004: Replace employee UUID primary key with DSR codes
-- Fixed version: drops RLS policies before altering column types

-- Step 1: Drop RLS policies that reference employee columns
DROP POLICY IF EXISTS "Employee can view own bills or bills in assigned routes" ON bills;
DROP POLICY IF EXISTS "Employee can insert bills for assigned routes" ON bills;
DROP POLICY IF EXISTS "Employee can view own recoveries or recoveries in assigned routes" ON recoveries;
DROP POLICY IF EXISTS "Employee can insert recoveries for assigned routes" ON recoveries;
DROP POLICY IF EXISTS "Employee can view assigned routes" ON routes;
DROP POLICY IF EXISTS "Employee can view customers in assigned routes" ON customers;
DROP POLICY IF EXISTS "Employee can insert customers in assigned routes" ON customers;
DROP POLICY IF EXISTS "Employee can update customers in assigned routes" ON customers;
DROP POLICY IF EXISTS "Employee can view self and same-route employees" ON employees;
DROP POLICY IF EXISTS "Employee can update own record" ON employees;

-- Step 2: Drop foreign key constraints
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_employee_id_fkey;
ALTER TABLE recoveries DROP CONSTRAINT IF EXISTS recoveries_employee_id_fkey;
ALTER TABLE employee_routes DROP CONSTRAINT IF EXISTS employee_routes_employee_id_fkey;

-- Step 3: Change column types from uuid to text
ALTER TABLE employees ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE bills ALTER COLUMN employee_id TYPE text USING employee_id::text;
ALTER TABLE bills ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE recoveries ALTER COLUMN employee_id TYPE text USING employee_id::text;
ALTER TABLE recoveries ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE employee_routes ALTER COLUMN employee_id TYPE text USING employee_id::text;

-- Step 4: Remove uuid default
ALTER TABLE employees ALTER COLUMN id DROP DEFAULT;

-- Step 5: Create temp mapping
CREATE TEMP TABLE emp_mapping AS
SELECT id AS old_id, 'DSR-' || ROW_NUMBER() OVER (ORDER BY name) AS new_id
FROM employees;

-- Step 6: Update all tables
UPDATE employee_routes er SET employee_id = em.new_id FROM emp_mapping em WHERE er.employee_id = em.old_id;
UPDATE bills b SET employee_id = em.new_id FROM emp_mapping em WHERE b.employee_id = em.old_id;
UPDATE recoveries r SET employee_id = em.new_id FROM emp_mapping em WHERE r.employee_id = em.old_id;
UPDATE employees e SET employee_code = em.new_id, id = em.new_id FROM emp_mapping em WHERE e.id = em.old_id;

-- Step 7: Recreate foreign keys
ALTER TABLE bills ADD CONSTRAINT bills_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE recoveries ADD CONSTRAINT recoveries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE employee_routes ADD CONSTRAINT employee_routes_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

-- Step 8: Recreate RLS policies with text-based employee_id
CREATE POLICY "Employee can view own bills or bills in assigned routes"
  ON bills FOR SELECT
  USING (
    get_user_role(auth.uid()) = 'admin'
    OR employee_id = ANY(get_user_route_employee_ids(auth.uid()))
  );

CREATE POLICY "Employee can insert bills for assigned routes"
  ON bills FOR INSERT
  WITH CHECK (
    get_user_role(auth.uid()) = 'admin'
    OR employee_id = ANY(get_user_route_employee_ids(auth.uid()))
  );

CREATE POLICY "Employee can view own recoveries or recoveries in assigned routes"
  ON recoveries FOR SELECT
  USING (
    get_user_role(auth.uid()) = 'admin'
    OR employee_id = ANY(get_user_route_employee_ids(auth.uid()))
  );

CREATE POLICY "Employee can insert recoveries for assigned routes"
  ON recoveries FOR INSERT
  WITH CHECK (
    get_user_role(auth.uid()) = 'admin'
    OR employee_id = ANY(get_user_route_employee_ids(auth.uid()))
  );

CREATE POLICY "Employee can view assigned routes"
  ON routes FOR SELECT
  USING (
    get_user_role(auth.uid()) = 'admin'
    OR id = ANY(get_user_route_ids(auth.uid()))
  );

CREATE POLICY "Employee can view customers in assigned routes"
  ON customers FOR SELECT
  USING (
    get_user_role(auth.uid()) = 'admin'
    OR route_id = ANY(get_user_route_ids(auth.uid()))
  );

CREATE POLICY "Employee can insert customers in assigned routes"
  ON customers FOR INSERT
  WITH CHECK (
    get_user_role(auth.uid()) = 'admin'
    OR route_id = ANY(get_user_route_ids(auth.uid()))
  );

CREATE POLICY "Employee can update customers in assigned routes"
  ON customers FOR UPDATE
  USING (
    get_user_role(auth.uid()) = 'admin'
    OR route_id = ANY(get_user_route_ids(auth.uid()))
  );

CREATE POLICY "Employee can view self and same-route employees"
  ON employees FOR SELECT
  USING (
    get_user_role(auth.uid()) = 'admin'
    OR id = ANY(get_user_route_employee_ids(auth.uid()))
    OR auth_user_id = auth.uid()
  );

CREATE POLICY "Employee can update own record"
  ON employees FOR UPDATE
  USING (
    get_user_role(auth.uid()) = 'admin'
    OR auth_user_id = auth.uid()
  );

-- Step 9: Clean up
DROP TABLE IF EXISTS emp_mapping;
