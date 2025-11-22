# Hotel Management System

A comprehensive hotel billing and management system built with React, Vite, Tailwind CSS, and Supabase.

## Features

- **Authentication**: Secure login with Supabase Auth
- **Rooms Management**: CRUD operations for hotel rooms
- **Reservations**: Manage guest reservations with status tracking
- **Billing System**: Itemized bill builder with invoice generation
- **PDF Generation**: Serverless function for invoice PDFs
- **Email Notifications**: Send invoices via email using Gmail SMTP
- **Receipt Upload**: Store and manage receipts in Supabase Storage
- **Admin Dashboard**: Overview with filtering and statistics

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **State Management**: Zustand, React Query
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Functions)
- **Email**: Gmail SMTP
- **Payment**: Razorpay (configured, ready for integration)

## Setup Instructions

### 1. Environment Variables

Copy `env.example` to `.env` and fill in your values:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_SERVICE_ROLE=your_supabase_service_role_key

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

For the client, create `client/.env`:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Database Setup

1. Create a new Supabase project
2. Run the SQL schema from `supabase/sql/schema.sql` in your Supabase SQL editor
3. This will create all tables, indexes, RLS policies, and storage bucket

### 3. Supabase Functions Setup

Deploy the Edge Functions:

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy generateInvoice
supabase functions deploy sendEmail
supabase functions deploy send-payment-link
supabase functions deploy razorpay-create-order
supabase functions deploy razorpay-verify-payment
supabase functions deploy razorpay-get-key
supabase functions deploy get-bill-for-payment
```

Set environment variables for functions:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
```

### 4. Generate TypeScript Types

After setting up your database, generate types:

```bash
cd client
npx supabase gen types typescript --project-id your-project-id > src/types/database.types.ts
```

### 5. Install Dependencies

```bash
cd client
npm install
```

### 6. Run Development Server

```bash
cd client
npm run dev
```

## Project Structure

```
/client
  /src
    /components      # Reusable UI components
    /pages           # Page components
    /hooks           # Custom React hooks
    /utils           # Utility functions and API wrappers
      /api           # Supabase API wrappers
    /lib             # Supabase client setup
    /contexts        # React contexts (Auth)
    /types           # TypeScript type definitions
    /store           # Zustand stores (if needed)

/supabase
  /functions         # Supabase Edge Functions
    /generateInvoice # PDF invoice generator
    /sendEmail       # Email sender
    /razorpay-create-order
    /razorpay-verify-payment
    /send-payment-link
  /sql
    schema.sql       # Database schema

env.example          # Environment variables template
```

## API Wrappers

All API calls are organized in `/src/utils/api`:

- `rooms.ts` - Room CRUD operations
- `reservations.ts` - Reservation management
- `bills.ts` - Billing and invoice operations
- `receipts.ts` - Receipt upload and management

## Features in Detail

### Rooms Management
- Create, read, update, delete rooms
- Filter by status and search
- Track room availability

### Reservations
- Create reservations linked to rooms
- Status workflow: pending → confirmed → checked_in → checked_out
- Automatic room status updates

### Billing
- Itemized bill builder
- Add/edit/delete bill items
- Calculate totals automatically
- Generate PDF invoices
- Send invoices via email
- Upload and manage receipts

### Dashboard
- Overview statistics
- Recent reservations
- Quick access to all modules

## Security

- Row Level Security (RLS) enabled on all tables
- Authenticated users only can access data
- Storage policies restrict receipt access
- Environment variables for sensitive keys

## Next Steps

1. Add payment integration with Razorpay
2. Enhance PDF generation with proper PDF library
3. Add more filtering and search options
4. Implement user roles and permissions
5. Add reporting and analytics

## License

MIT

