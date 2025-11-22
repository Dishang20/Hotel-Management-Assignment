-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- IMPORTANT: Drop tables FIRST (they depend on types)
-- Then drop types, then recreate everything
DROP TABLE IF EXISTS payment_receipts CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;
DROP TABLE IF EXISTS bill_items CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop functions and triggers that might depend on types
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS get_user_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- NOW drop types (safe after dropping dependent objects)
DROP TYPE IF EXISTS room_status CASCADE;
DROP TYPE IF EXISTS room_type CASCADE;
DROP TYPE IF EXISTS reservation_status CASCADE;
DROP TYPE IF EXISTS bill_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- Create enum types
CREATE TYPE room_status AS ENUM ('available', 'occupied', 'cleaning', 'maintenance');
CREATE TYPE room_type AS ENUM ('standard', 'deluxe', 'suite');
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled');
CREATE TYPE bill_status AS ENUM ('draft', 'pending', 'paid', 'cancelled');
CREATE TYPE user_role AS ENUM ('frontdesk', 'accounting');

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'frontdesk',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_number VARCHAR(50) UNIQUE NOT NULL,
  room_type room_type NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  status room_status DEFAULT 'available',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reservations table
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  guest_name VARCHAR(255) NOT NULL,
  guest_email VARCHAR(255) NOT NULL,
  guest_phone VARCHAR(50) NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  status reservation_status DEFAULT 'pending',
  total_amount DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bills table
CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  status bill_status DEFAULT 'draft',
  paid BOOLEAN DEFAULT false,
  razorpay_payment_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bill items table
CREATE TABLE bill_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment receipts table
CREATE TABLE payment_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Receipts table
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_number ON rooms(room_number);
CREATE INDEX idx_rooms_type ON rooms(room_type);
CREATE INDEX idx_reservations_room_id ON reservations(room_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_check_in ON reservations(check_in);
CREATE INDEX idx_bills_reservation_id ON bills(reservation_id);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_paid ON bills(paid);
CREATE INDEX idx_bill_items_bill_id ON bill_items(bill_id);
CREATE INDEX idx_receipts_bill_id ON receipts(bill_id);
CREATE INDEX idx_payment_receipts_bill_id ON payment_receipts(bill_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (using DO block for safety)
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
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

-- Profiles policies
-- Allow service role to insert (for trigger)
CREATE POLICY "Service role can insert profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- Allow users to view own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Allow users to update own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Allow authenticated users to view all profiles (for role checking)
CREATE POLICY "Authenticated users can view profiles" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Role-based helper function
DROP FUNCTION IF EXISTS get_user_role(UUID);
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Rooms policies (frontdesk can manage, accounting can read)
CREATE POLICY "Allow authenticated read rooms" ON rooms
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow frontdesk manage rooms" ON rooms
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'frontdesk'
  );

-- Reservations policies (frontdesk can manage, accounting can read)
CREATE POLICY "Allow authenticated read reservations" ON reservations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow frontdesk manage reservations" ON reservations
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'frontdesk'
  );

-- Bills policies (accounting can manage, frontdesk can read)
CREATE POLICY "Allow authenticated read bills" ON bills
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow accounting manage bills" ON bills
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'accounting'
  );

-- Bill items policies (accounting can manage)
CREATE POLICY "Allow authenticated read bill_items" ON bill_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow accounting manage bill_items" ON bill_items
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    get_user_role(auth.uid()) = 'accounting'
  );

-- Receipts policies
CREATE POLICY "Allow authenticated read receipts" ON receipts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated manage receipts" ON receipts
  FOR ALL USING (auth.role() = 'authenticated');

-- Payment receipts policies
CREATE POLICY "Allow authenticated read payment_receipts" ON payment_receipts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated manage payment_receipts" ON payment_receipts
  FOR ALL USING (auth.role() = 'authenticated');

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'frontdesk'::user_role)
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('receipts', 'receipts', false),
  ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies if they exist
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Allow authenticated upload receipts" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated read receipts" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated delete receipts" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated upload invoices" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated read invoices" ON storage.objects;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Storage policies for receipts bucket
CREATE POLICY "Allow authenticated upload receipts" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'receipts' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Allow authenticated read receipts" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'receipts' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Allow authenticated delete receipts" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'receipts' AND auth.role() = 'authenticated'
  );

-- Storage policies for invoices bucket
CREATE POLICY "Allow authenticated upload invoices" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'invoices' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Allow authenticated read invoices" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'invoices' AND auth.role() = 'authenticated'
  );

