import { supabase } from '@/lib/supabase'
import type { PaymentReceipt } from '@/types/database.types'

export const receiptsApi = {
  upload: async (billId: string, file: File) => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${billId}/${Date.now()}.${fileExt}`
    // Don't include bucket name in path since we're already using .from('receipts')
    const filePath = fileName

    const { error: uploadError, data: uploadData } = await supabase.storage
      .from('receipts')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      throw uploadError
    }

    // Store the full path including bucket for reference
    const fullStoragePath = `receipts/${filePath}`

    const { data, error } = await supabase.from('payment_receipts').insert({
      bill_id: billId,
      storage_path: fullStoragePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    } as any)

    if (error) {
      console.error('Database insert error:', error)
      // Try to clean up uploaded file if database insert fails
      if (uploadData?.path) {
        await supabase.storage.from('receipts').remove([uploadData.path])
      }
      throw error
    }
    return data
  },

  getByBillId: async (billId: string) => {
    const { data, error } = await supabase
      .from('payment_receipts')
      .select('*')
      .eq('bill_id', billId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as PaymentReceipt[]
  },

  getDownloadUrl: async (storagePath: string) => {
    // Remove 'receipts/' prefix if present since we're already using .from('receipts')
    const path = storagePath.startsWith('receipts/') ? storagePath.replace('receipts/', '') : storagePath
    
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(path, 3600)

    if (error) {
      console.error('Get download URL error:', error)
      throw error
    }
    return data.signedUrl
  },

  delete: async (id: string, storagePath: string) => {
    // Remove 'receipts/' prefix if present since we're already using .from('receipts')
    const path = storagePath.startsWith('receipts/') ? storagePath.replace('receipts/', '') : storagePath
    
    const { error: deleteError } = await supabase.storage
      .from('receipts')
      .remove([path])

    if (deleteError) {
      console.error('Storage delete error:', deleteError)
      throw deleteError
    }

    const { error } = await supabase.from('payment_receipts').delete().eq('id', id)
    if (error) {
      console.error('Database delete error:', error)
      throw error
    }
  },
}

