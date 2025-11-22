# Hotel Billing & Management System - Complete Implementation Guide

## 🎯 System Overview

A complete hotel management system with role-based access, billing, payments, and invoice generation.

## 📋 Prerequisites

- Node.js 18+
- Supabase account
- Gmail account with App Password (for SMTP)
- Razorpay account (test mode)

## 🚀 Quick Start

### 1. Environment Setup

Create `.env` in project root:
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ACCESS_TOKEN=your_access_token
SUPABASE_URL=your_supabase_url

# Gmail SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=Hotel Management <your-email@gmail.com>

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

Create `client/.env`:
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 2. Database Setup

1. Run `supabase/sql/schema.sql` in Supabase SQL Editor
2. Run `supabase/sql/seed.sql` for sample data
3. Generate TypeScript types:
```bash
cd client
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.types.ts
```

### 3. Install Dependencies

```bash
cd client
npm install
```

### 4. Deploy Edge Functions

```bash
# Login to Supabase
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set SMTP_HOST=smtp.gmail.com
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_SECURE=false
supabase secrets set SMTP_USER=your-email@gmail.com
supabase secrets set SMTP_PASSWORD=your-app-password
supabase secrets set SMTP_FROM="Hotel Management <your-email@gmail.com>"
supabase secrets set RAZORPAY_KEY_ID=your_key_id
supabase secrets set RAZORPAY_KEY_SECRET=your_key_secret

# Deploy functions
supabase functions deploy generateInvoice
supabase functions deploy sendEmail
supabase functions deploy razorpay-create-order
supabase functions deploy razorpay-verify-payment
```

### 5. Create Users

1. Go to Supabase Dashboard → Authentication
2. Create users with email/password
3. Update profiles table:
```sql
UPDATE profiles SET role = 'accounting' WHERE email = 'accounting@hotel.com';
UPDATE profiles SET role = 'frontdesk' WHERE email = 'frontdesk@hotel.com';
```

### 6. Run Application

```bash
cd client
npm run dev
```

## 🏗️ Architecture

### Database Schema

- **profiles**: User profiles with roles (frontdesk, accounting)
- **rooms**: Room inventory with types and status
- **reservations**: Guest reservations
- **bills**: Billing records
- **bill_items**: Itemized charges
- **receipts**: Payment receipts
- **payment_receipts**: Uploaded receipt files

### Role-Based Access

- **frontdesk**: Manage rooms, reservations
- **accounting**: Manage bills, payments, invoices
- Both roles can read all data

### API Structure

- `/src/utils/api/`: Type-safe Supabase wrappers
  - `rooms.ts`: Room CRUD
  - `reservations.ts`: Reservation management
  - `bills.ts`: Billing operations
  - `payments.ts`: Razorpay integration
  - `receipts.ts`: File uploads

### State Management

- **React Query**: Server state, caching, mutations
- **Zustand**: UI state, notifications, sidebar

### Components

- `/src/components/ui/`: Reusable components
  - `Button.tsx`: Styled buttons
  - `Modal.tsx`: Modal dialogs
  - `Card.tsx`: Card containers
  - `Table.tsx`: Data tables
  - `FileUpload.tsx`: File upload handler

## 🔐 Authentication

### Login Flow

1. User enters email/password
2. Supabase Auth authenticates
3. Profile fetched with role
4. Role-based permissions applied

### Protected Routes

```tsx
<ProtectedRoute requiredRole="accounting">
  <BillingPage />
</ProtectedRoute>
```

## 💰 Billing System

### Creating Bills

1. Select reservation from modal
2. Bill created in draft status
3. Add items (room charges, services, etc.)
4. Auto-calculate totals
5. Update status to pending/paid

### Bill Items

- Room charges (auto-calc from room price × nights)
- Taxes (18% GST)
- Service charges
- Restaurant charges
- Minibar usage
- Custom fees

### Payment Flow

1. Click "Pay Online"
2. Razorpay order created
3. Checkout UI opens
4. Payment processed
5. Bill marked as paid
6. Success animation shown

## 📄 Invoice Generation

### PDF Generation

1. Click "Generate Invoice"
2. Edge function fetches bill data
3. HTML invoice generated
4. Uploaded to Supabase Storage
5. Download URL returned

### Email Sending

1. Click "Send Email"
2. Uses reservation guest_email
3. Formatted email with invoice link
4. Sent via Resend API
5. Success modal shown

## 🎨 UI Theme

- Primary: #1877F2 (Meta Blue)
- Background: #F0F2F5 (Meta Grey)
- Cards: #E4E6EB (Light Grey)
- Text: #3A3B3C (Dark Grey)
- Borders: #DADDE1

## 📱 Features

### Dashboard
- Reservation overview
- Room availability
- Billing statistics
- Quick actions

### Room Management
- CRUD operations
- Status updates
- Filtering by type/status
- Pagination

### Reservations
- Create/edit reservations
- Check-in/check-out
- Status tracking
- Guest details

### Billing
- Itemized bills
- Auto-calculations
- PDF generation
- Email sending
- Online payments
- Receipt uploads

## 🔧 Edge Functions

### generateInvoice
- Input: `billId`
- Output: HTML invoice + storage URL
- Uploads to `invoices` bucket

### sendEmail
- Input: `billId`, `recipientEmail`
- Output: Email sent confirmation
- Uses Resend API

### razorpay-create-order
- Input: `billId`, `amount`
- Output: Order ID + key
- Creates Razorpay order

### razorpay-verify-payment
- Input: `billId`, `paymentId`, `orderId`, `signature`
- Output: Payment verification
- Updates bill as paid

## 🧪 Testing

### Test Users

Create via Supabase Auth:
- frontdesk@hotel.com / password123
- accounting@hotel.com / password123

### Test Payments

Use Razorpay test mode:
- Card: 4111 1111 1111 1111
- CVV: Any 3 digits
- Expiry: Any future date

## 📝 Notes

- All API calls use React Query for caching
- RLS policies enforce role-based access
- File uploads limited to 10MB
- Invoices stored for 7 days
- Email templates use HTML formatting

## 🐛 Troubleshooting

### Types not generating
- Ensure schema is deployed
- Check project ID is correct
- Verify Supabase CLI is installed

### Functions not deploying
- Check secrets are set
- Verify project is linked
- Check function code for errors

### RLS blocking access
- Verify user has profile with role
- Check RLS policies are enabled
- Ensure user is authenticated

## 📚 Next Steps

1. Add reporting/analytics
2. Implement email templates customization
3. Add multi-language support
4. Implement audit logging
5. Add backup/export functionality

