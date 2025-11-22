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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { billId } = await req.json()

    if (!billId) {
      throw new Error('Bill ID is required')
    }

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
          status
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
      throw new Error('Bill not found: Invalid bill ID')
    }

    // Handle case where reservation might be an array or object
    const reservation = Array.isArray(bill.reservations) 
      ? bill.reservations[0] 
      : bill.reservations

    if (!reservation) {
      throw new Error('Reservation data not found for this bill')
    }

    // Handle bill_items - might be array or object
    const billItems = Array.isArray(bill.bill_items) 
      ? bill.bill_items 
      : (bill.bill_items ? [bill.bill_items] : [])

    // Calculate totals from bill items
    const subtotal = billItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
    const tax = subtotal * 0.18
    const totalAmount = subtotal + tax

    // Generate PDF HTML
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #1877F2; padding-bottom: 20px; }
            .header h1 { color: #1877F2; margin: 0; }
            .bill-info { margin-bottom: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; }
            .bill-info p { margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #1877F2; color: white; }
            .total-section { margin-top: 20px; padding-top: 20px; border-top: 2px solid #ddd; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .total-final { font-size: 20px; font-weight: bold; padding-top: 10px; border-top: 1px solid #ddd; }
            .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Hotel Invoice</h1>
            <p>Invoice #${bill.id.slice(0, 8)}</p>
          </div>
          <div class="bill-info">
            <p><strong>Guest Name:</strong> ${(reservation?.guest_name || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            <p><strong>Email:</strong> ${(reservation?.guest_email || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            <p><strong>Phone:</strong> ${(reservation?.guest_phone || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            <p><strong>Invoice Date:</strong> ${new Date(bill.created_at).toLocaleDateString('en-IN', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</p>
            ${reservation?.check_in && reservation?.check_out ? `
            <p><strong>Check-in:</strong> ${new Date(reservation.check_in).toLocaleDateString('en-IN')}</p>
            <p><strong>Check-out:</strong> ${new Date(reservation.check_out).toLocaleDateString('en-IN')}</p>
            ` : ''}
            ${bill.paid ? `<p><strong>Payment Status:</strong> <span style="color: green; font-weight: bold;">Paid</span></p>` : ''}
            ${bill.razorpay_payment_id ? `<p><strong>Payment ID:</strong> ${bill.razorpay_payment_id}</p>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${billItems && billItems.length > 0
                ? billItems.map((item: any) => `
                    <tr>
                      <td>${(item.description || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                      <td>₹${Number(item.amount || 0).toFixed(2)}</td>
                    </tr>
                  `).join('')
                : '<tr><td colspan="2" style="text-align: center; padding: 20px; color: #666;">No items</td></tr>'}
            </tbody>
          </table>
          <div class="total-section">
            <div class="total-row">
              <strong>Subtotal:</strong>
              <span>₹${subtotal.toFixed(2)}</span>
            </div>
            <div class="total-row">
              <strong>Tax (18%):</strong>
              <span>₹${tax.toFixed(2)}</span>
            </div>
            <div class="total-row total-final">
              <strong>Total Amount:</strong>
              <span>₹${totalAmount.toFixed(2)}</span>
            </div>
          </div>
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>This is a computer-generated invoice.</p>
          </div>
        </body>
      </html>
    `

    // Upload HTML to storage (PDF generation is now done client-side)
    const fileName = `invoice-${billId}-${Date.now()}.html`
    const filePath = `invoices/${fileName}`

    const { error: uploadError } = await supabaseClient.storage
      .from('invoices')
      .upload(filePath, html, {
        contentType: 'text/html',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      // Still return HTML even if upload fails
    }

    // Get signed URL for HTML (client will convert to PDF)
    const { data: urlData } = await supabaseClient.storage
      .from('invoices')
      .createSignedUrl(filePath, 3600 * 24 * 7) // 7 days

    return new Response(
      JSON.stringify({
        success: true,
        billId,
        html,
        fileUrl: urlData?.signedUrl || null,
        filePath,
        fileName,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
