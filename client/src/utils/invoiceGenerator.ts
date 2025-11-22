/**
 * Generate invoice HTML from bill data
 */
export function generateInvoiceHTML(bill: any): string {
  const reservation = Array.isArray(bill.reservations) 
    ? bill.reservations[0] 
    : bill.reservations

  const billItems = Array.isArray(bill.bill_items) 
    ? bill.bill_items 
    : (bill.bill_items ? [bill.bill_items] : [])

  // Calculate totals
  const subtotal = billItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
  const tax = subtotal * 0.18
  const totalAmount = subtotal + tax

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background: #ffffff;
            color: #333;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #1877F2;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #1877F2;
            margin: 0;
            font-size: 32px;
            font-weight: bold;
          }
          .header p {
            margin-top: 10px;
            font-size: 16px;
            color: #666;
          }
          .bill-info {
            margin-bottom: 30px;
            background: #f9f9f9;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
          }
          .bill-info p {
            margin: 8px 0;
            font-size: 14px;
          }
          .bill-info strong {
            color: #333;
            min-width: 120px;
            display: inline-block;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            margin-top: 20px;
          }
          th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #1877F2;
            color: white;
            font-weight: bold;
          }
          tr:hover {
            background-color: #f5f5f5;
          }
          .total-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #ddd;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 14px;
          }
          .total-final {
            font-size: 20px;
            font-weight: bold;
            padding-top: 10px;
            border-top: 1px solid #ddd;
            color: #1877F2;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            color: #666;
            font-size: 12px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 10px;
          }
          .status-paid {
            background-color: #d4edda;
            color: #155724;
          }
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
          ${bill.paid ? `<p><strong>Payment Status:</strong> <span class="status-badge status-paid">Paid</span></p>` : ''}
          ${bill.razorpay_payment_id ? `<p><strong>Payment ID:</strong> ${bill.razorpay_payment_id}</p>` : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${billItems && billItems.length > 0
              ? billItems.map((item: any) => `
                  <tr>
                    <td>${(item.description || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                    <td style="text-align: right;">₹${Number(item.amount || 0).toFixed(2)}</td>
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
}

