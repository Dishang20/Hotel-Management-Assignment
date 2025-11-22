import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get RAZORPAY_KEY_ID from Deno secrets (set via supabase secrets set)
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')

    if (!razorpayKeyId) {
      console.error('RAZORPAY_KEY_ID not found in environment')
      throw new Error('Razorpay key not configured. Please set RAZORPAY_KEY_ID secret.')
    }

    // Return only the key ID (public key, safe to expose)
    return new Response(
      JSON.stringify({
        keyId: razorpayKeyId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in razorpay-get-key:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

