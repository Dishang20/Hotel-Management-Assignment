import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Use service role key to bypass RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get billId from query params or request body
    const url = new URL(req.url)
    const billId = url.searchParams.get('billId') || (await req.json().catch(() => ({}))).billId

    if (!billId) {
      throw new Error('Bill ID is required')
    }

    // Fetch bill details with nested data (bypasses RLS using service role)
    const { data: bill, error: billError } = await supabaseClient
      .from('bills')
      .select(`
        *,
        reservations (
          id,
          guest_name,
          guest_email,
          guest_phone,
          check_in,
          check_out,
          status,
          rooms (
            id,
            room_number,
            room_type,
            price,
            status
          )
        ),
        bill_items (*)
      `)
      .eq('id', billId)
      .single()

    if (billError) {
      console.error('Bill fetch error:', billError)
      throw new Error(`Bill not found: ${billError.message}`)
    }

    if (!bill) {
      throw new Error('Bill not found')
    }

    // Return bill data (public access for payment links)
    return new Response(
      JSON.stringify(bill),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in get-bill-for-payment:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

