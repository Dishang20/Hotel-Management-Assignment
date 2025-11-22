-- Seed script for Hotel Management System
-- Run this after schema.sql

-- Insert sample rooms
INSERT INTO rooms (room_number, room_type, price, status) VALUES
  ('101', 'standard', 2000.00, 'available'),
  ('102', 'standard', 2000.00, 'available'),
  ('103', 'standard', 2000.00, 'occupied'),
  ('201', 'deluxe', 3500.00, 'available'),
  ('202', 'deluxe', 3500.00, 'cleaning'),
  ('301', 'suite', 5000.00, 'available'),
  ('302', 'suite', 5000.00, 'occupied'),
  ('303', 'suite', 5000.00, 'available')
ON CONFLICT (room_number) DO NOTHING;

-- Insert sample reservations (only if rooms exist)
DO $$
DECLARE
  room_101_id UUID;
  room_201_id UUID;
  room_301_id UUID;
BEGIN
  SELECT id INTO room_101_id FROM rooms WHERE room_number = '101' LIMIT 1;
  SELECT id INTO room_201_id FROM rooms WHERE room_number = '201' LIMIT 1;
  SELECT id INTO room_301_id FROM rooms WHERE room_number = '301' LIMIT 1;

  IF room_101_id IS NOT NULL THEN
    INSERT INTO reservations (room_id, guest_name, guest_email, guest_phone, check_in, check_out, status, total_amount)
    VALUES
      (room_101_id, 'John Doe', 'john.doe@example.com', '+1234567890', 
       CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE + INTERVAL '3 days', 'confirmed', 4000.00),
      (room_201_id, 'Jane Smith', 'jane.smith@example.com', '+1234567891',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '2 days', 'checked_in', 7000.00),
      (room_301_id, 'Bob Johnson', 'bob.johnson@example.com', '+1234567892',
       CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE + INTERVAL '7 days', 'pending', 10000.00)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Note: Bills and bill_items should be created through the application
-- as they require proper calculations and relationships

