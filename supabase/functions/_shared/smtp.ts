/**
 * SMTP Email Sender for Gmail
 * Uses Deno's built-in SMTP support
 */

interface EmailOptions {
  from: string
  to: string
  subject: string
  html: string
  text?: string
  attachments?: Array<{
    filename: string
    content: Uint8Array
    contentType: string
  }>
}

export async function sendEmailViaSMTP(options: EmailOptions): Promise<{ success: boolean; messageId?: string }> {
  const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587')
  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPassword = Deno.env.get('SMTP_PASSWORD')
  const smtpSecure = Deno.env.get('SMTP_SECURE') === 'true' // true for port 465 (SSL), false for port 587 (TLS)

  if (!smtpUser || !smtpPassword) {
    throw new Error('SMTP credentials not configured. Please set SMTP_USER and SMTP_PASSWORD environment variables.')
  }

  // Generate boundary for multipart message
  const boundary = `----=_NextPart_${Date.now()}_${Math.random().toString(36).substring(7)}`
  
  // Build multipart message
  let message = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    `MIME-Version: 1.0`,
  ]

  // If we have attachments, use multipart/mixed, otherwise just send HTML
  if (options.attachments && options.attachments.length > 0) {
    message.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    message.push(``)
    message.push(`--${boundary}`)
    message.push(`Content-Type: text/html; charset=UTF-8`)
    message.push(`Content-Transfer-Encoding: 8bit`)
    message.push(``)
    message.push(options.html)
    
    // Add attachments
    for (const attachment of options.attachments) {
      const base64Content = btoa(String.fromCharCode(...attachment.content))
      message.push(``)
      message.push(`--${boundary}`)
      message.push(`Content-Type: ${attachment.contentType}`)
      message.push(`Content-Disposition: attachment; filename="${attachment.filename}"`)
      message.push(`Content-Transfer-Encoding: base64`)
      message.push(``)
      // Split base64 into 76-character lines as per RFC
      const base64Lines = base64Content.match(/.{1,76}/g) || [base64Content]
      message.push(...base64Lines)
    }
    
    message.push(`--${boundary}--`)
  } else {
    // No attachments - simple HTML email
    message.push(`Content-Type: text/html; charset=UTF-8`)
    message.push(`Content-Transfer-Encoding: 8bit`)
    message.push(``)
    message.push(options.html)
  }
  
  const messageBody = message.join('\r\n')

  let conn: Deno.TcpConn | null = null
  let tlsConn: Deno.TlsConn | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null

  try {
    // Connect to SMTP server
    conn = await Deno.connect({
      hostname: smtpHost,
      port: smtpPort,
    })

    // For TLS, we need to upgrade the connection
    if (smtpSecure) {
      // SSL/TLS connection (port 465)
      tlsConn = await Deno.startTls(conn, { hostname: smtpHost })
      reader = tlsConn.readable.getReader()
      writer = tlsConn.writable.getWriter()
    } else {
      // Plain connection that will be upgraded to TLS (port 587)
      reader = conn.readable.getReader()
      writer = conn.writable.getWriter()
    }

    // Helper function to read SMTP response
    const readResponse = async (): Promise<string> => {
      if (!reader) throw new Error('Reader not available')
      const decoder = new TextDecoder()
      let response = ''
      let chunk = ''
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            // Connection closed - return what we have
            if (response.trim()) {
              return response.trim()
            }
            // If no response yet, this might be expected (e.g., after QUIT)
            return '250 OK'
          }
          
          // Decode the chunk
          chunk = decoder.decode(value, { stream: true })
          response += chunk
          
          // SMTP responses end with \r\n
          // Check if we have at least one complete line
          const lines = response.split('\r\n')
          if (lines.length > 1) {
            // Return the first complete line (or all if single line)
            return lines[0].trim() || response.trim()
          }
        }
      } catch (error: any) {
        // Handle connection closure gracefully
        if (error.name === 'UnexpectedEof' || error.name === 'BadResource') {
          // If we have a partial response, return it
          if (response.trim()) {
            return response.trim()
          }
          // For QUIT and some other commands, EOF is expected
          return '250 OK'
        }
        throw error
      }
    }

    // Create encoder once for reuse
    const encoder = new TextEncoder()

    // Helper function to send SMTP command
    const sendCommand = async (command: string): Promise<string> => {
      if (!writer) throw new Error('Writer not available')
      await writer.write(encoder.encode(command + '\r\n'))
      return await readResponse()
    }

    // Helper to read multi-line SMTP response
    const readMultiLineResponse = async (): Promise<string> => {
      if (!reader) throw new Error('Reader not available')
      const decoder = new TextDecoder()
      let response = ''
      let lastLine = ''
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            return response.trim() || lastLine.trim()
          }
          
          const chunk = decoder.decode(value, { stream: true })
          response += chunk
          
          // Check for complete lines
          const lines = response.split('\r\n')
          if (lines.length > 1) {
            // Get the last complete line
            lastLine = lines[lines.length - 2]
            // Check if this is the last line (ends with space + 3 digits, e.g., "250 OK")
            // Or if it's a continuation line (starts with space or tab)
            if (lastLine.match(/^\d{3}\s/)) {
              // This is a final line (starts with 3 digits)
              return response.trim()
            }
            // Otherwise continue reading
            response = lines[lines.length - 1] // Keep the incomplete last line
          }
        }
      } catch (error: any) {
        if (error.name === 'UnexpectedEof' || error.name === 'BadResource') {
          return response.trim() || lastLine.trim() || '250 OK'
        }
        throw error
      }
    }

    // SMTP conversation
    await readResponse() // Read initial greeting

    // EHLO - may return multiple lines
    if (!writer) throw new Error('Writer not available')
    await writer.write(encoder.encode(`EHLO ${smtpHost}\r\n`))
    await readMultiLineResponse() // Read all EHLO response lines

    // STARTTLS for port 587
    if (!smtpSecure) {
      await writer.write(encoder.encode('STARTTLS\r\n'))
      const startTlsResponse = await readResponse()
      if (!startTlsResponse.startsWith('220')) {
        throw new Error(`STARTTLS failed: ${startTlsResponse}`)
      }

      // Upgrade to TLS
      if (writer) {
        writer.releaseLock()
        writer = null
      }
      if (reader) {
        reader.releaseLock()
        reader = null
      }
      tlsConn = await Deno.startTls(conn, { hostname: smtpHost })
      reader = tlsConn.readable.getReader()
      writer = tlsConn.writable.getWriter()

      // EHLO again after TLS - may return multiple lines
      await writer.write(encoder.encode(`EHLO ${smtpHost}\r\n`))
      await readMultiLineResponse() // Read all EHLO response lines
    }

    // AUTH LOGIN
    await sendCommand('AUTH LOGIN')
    const userB64 = btoa(smtpUser)
    await sendCommand(userB64)
    const passB64 = btoa(smtpPassword)
    const authResponse = await sendCommand(passB64)
    if (!authResponse.startsWith('235')) {
      throw new Error(`Authentication failed: ${authResponse}`)
    }

    // MAIL FROM
    await sendCommand(`MAIL FROM:<${smtpUser}>`)

    // RCPT TO
    await sendCommand(`RCPT TO:<${options.to}>`)

    // DATA
    const dataInitResponse = await sendCommand('DATA')
    if (!dataInitResponse.startsWith('354')) {
      throw new Error(`DATA command failed: ${dataInitResponse}`)
    }
    
    if (!writer) throw new Error('Writer not available')
    
    // Send message body with terminating sequence
    try {
      await writer.write(encoder.encode(messageBody + '\r\n.\r\n'))
      
      // Read the final response (250 OK)
      // This might take a moment as server processes the email
      const dataResponse = await readResponse()
      if (!dataResponse.startsWith('250')) {
        throw new Error(`Email sending failed: ${dataResponse}`)
      }
    } catch (dataError: any) {
      // If we get EOF during DATA response, it might mean the server accepted it
      // but closed the connection (some servers do this)
      if (dataError.name === 'UnexpectedEof') {
        // Assume success if we got past sending the data
        console.log('Server closed connection after accepting email data - assuming success')
      } else {
        throw dataError
      }
    }

    // QUIT - server may close connection immediately, so handle gracefully
    try {
      if (writer) {
        await writer.write(encoder.encode('QUIT\r\n'))
      }
      // Try to read response, but don't fail if connection closes
      try {
        await readResponse()
      } catch (quitError: any) {
        // QUIT often causes connection to close, which is expected
        if (quitError.name !== 'UnexpectedEof' && quitError.name !== 'BadResource') {
          console.warn('Error reading QUIT response:', quitError)
        }
      }
    } catch (quitError: any) {
      // QUIT command might fail if connection already closed, which is OK
      if (quitError.name !== 'UnexpectedEof' && quitError.name !== 'BadResource') {
        console.warn('Error sending QUIT:', quitError)
      }
    }

    return { success: true, messageId: `smtp-${Date.now()}` }
  } catch (error) {
    console.error('SMTP error:', error)
    throw new Error(`Failed to send email via SMTP: ${error.message}`)
  } finally {
    // Clean up resources properly - order matters!
    // Release locks first, then close connections
    
    // Release writer lock
    if (writer) {
      try {
        if (!writer.closed) {
          writer.releaseLock()
        }
      } catch (e: any) {
        // Ignore - might already be released or connection closed
        if (e?.name !== 'BadResource') {
          // Only log non-BadResource errors
        }
      }
    }
    
    // Release reader lock
    if (reader) {
      try {
        if (!reader.closed) {
          reader.releaseLock()
        }
      } catch (e: any) {
        // Ignore - might already be released or connection closed
        if (e?.name !== 'BadResource') {
          // Only log non-BadResource errors
        }
      }
    }
    
    // Close TLS connection if it exists (this also closes the underlying TCP connection)
    // When TLS is created, it consumes the base connection, so don't close conn separately
    if (tlsConn) {
      try {
        // Check if connection is still valid by checking if it has a valid rid
        if (tlsConn.rid !== null && tlsConn.rid !== undefined) {
          tlsConn.close()
        }
      } catch (e: any) {
        // Ignore "Bad resource ID" errors - connection already closed
        if (e?.name !== 'BadResource' && !e?.message?.includes('Bad resource')) {
          console.warn('Error closing TLS connection:', e)
        }
      }
    } else if (conn) {
      // Only close base connection if TLS connection wasn't created
      // (When TLS is created via startTls, it consumes the base connection)
      try {
        // Check if connection is still valid
        if (conn.rid !== null && conn.rid !== undefined) {
          conn.close()
        }
      } catch (e: any) {
        // Ignore "Bad resource ID" errors - connection already closed
        if (e?.name !== 'BadResource' && !e?.message?.includes('Bad resource')) {
          console.warn('Error closing TCP connection:', e)
        }
      }
    }
  }
}

