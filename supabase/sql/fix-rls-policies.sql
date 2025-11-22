-- Fix RLS Policies
-- Accounting users can access everything
-- Frontdesk users can only manage rooms and reservations, but can read everything

-- Drop existing policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Allow authenticated read rooms" ON rooms;
  DROP POLICY IF EXISTS "Allow frontdesk manage rooms" ON rooms;
  DROP POLICY IF EXISTS "Allow authenticated read reservations" ON reservations;
  DROP POLICY IF EXISTS "Allow frontdesk manage reservations" ON reservations;
  DROP POLICY IF EXISTS "Allow authenticated read bills" ON bills;
  DROP POLICY IF EXISTS "Allow accounting manage bills" ON bills;
  DROP POLICY IF EXISTS "Allow authenticated read bill_items" ON bill_items;
  DROP POLICY IF EXISTS "Allow accounting manage bill_items" ON bill_items;
  DROP POLICY IF EXISTS "Allow authenticated read receipts" ON receipts;
  DROP POLICY IF EXISTS "Allow authenticated manage receipts" ON receipts;
  DROP POLICY IF EXISTS "Allow authenticated read payment_receipts" ON payment_receipts;
  DROP POLICY IF EXISTS "Allow authenticated manage payment_receipts" ON payment_receipts;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Rooms policies
-- Everyone can read rooms
CREATE POLICY "Allow authenticated read rooms" ON rooms
  FOR SELECT USING (auth.role() = 'authenticated');

-- Frontdesk can manage rooms (INSERT, UPDATE, DELETE)
CREATE POLICY "Allow frontdesk manage rooms" ON rooms
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'frontdesk'
  );

-- Accounting can also manage rooms (full access)
CREATE POLICY "Allow accounting manage rooms" ON rooms
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'accounting'
  );

-- Reservations policies
-- Everyone can read reservations
CREATE POLICY "Allow authenticated read reservations" ON reservations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Frontdesk can manage reservations
CREATE POLICY "Allow frontdesk manage reservations" ON reservations
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'frontdesk'
  );

-- Accounting can also manage reservations (full access)
CREATE POLICY "Allow accounting manage reservations" ON reservations
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'accounting'
  );

-- Bills policies
-- Everyone can read bills
CREATE POLICY "Allow authenticated read bills" ON bills
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only accounting can manage bills (INSERT, UPDATE, DELETE)
CREATE POLICY "Allow accounting manage bills" ON bills
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'accounting'
  );

-- Bill items policies
-- Everyone can read bill items
CREATE POLICY "Allow authenticated read bill_items" ON bill_items
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only accounting can manage bill items
CREATE POLICY "Allow accounting manage bill_items" ON bill_items
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'accounting'
  );

-- Receipts policies
-- Everyone can read receipts
CREATE POLICY "Allow authenticated read receipts" ON receipts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Accounting can manage receipts
CREATE POLICY "Allow accounting manage receipts" ON receipts
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'accounting'
  );

-- Frontdesk can also manage receipts (for viewing uploaded files)
CREATE POLICY "Allow frontdesk manage receipts" ON receipts
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'frontdesk'
  );

-- Payment receipts policies
-- Everyone can read payment receipts
CREATE POLICY "Allow authenticated read payment_receipts" ON payment_receipts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Accounting can manage payment receipts
CREATE POLICY "Allow accounting manage payment_receipts" ON payment_receipts
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'accounting'
  );

-- Frontdesk can also manage payment receipts (for viewing uploaded files)
CREATE POLICY "Allow frontdesk manage payment_receipts" ON payment_receipts
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'frontdesk'
  );

