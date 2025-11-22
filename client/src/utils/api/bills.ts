import { supabase } from '@/lib/supabase'
import type { Bill, BillItem, BillStatus } from '@/types/database.types'

export const billsApi = {
  getAll: async () => {
    const { data, error } = await supabase
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
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as (Bill & { reservations: any; bill_items: BillItem[] })[]
  },

  getById: async (id: string) => {
    const { data, error } = await supabase
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
      .eq('id', id)
      .single()

    if (error) throw error
    return data as Bill & { reservations: any; bill_items: BillItem[] }
  },

  create: async (bill: {
    reservation_id: string
    total_amount?: number
    status?: BillStatus
  }) => {
    const { data, error } = await supabase
      .from('bills')
      .insert(bill as any)
      .select()
      .single()

    if (error) throw error
    return data as Bill
  },

  update: async (id: string, updates: Partial<Bill>) => {
    // Check if bill is paid - prevent updates
    const { data: existingBill } = await supabase
      .from('bills')
      .select('paid')
      .eq('id', id)
      .single()

    if (existingBill && typeof existingBill === 'object' && existingBill !== null && 'paid' in existingBill && (existingBill as { paid: boolean }).paid) {
      throw new Error('Cannot update a paid bill')
    }

    const { data, error } = await supabase
      .from('bills')
      // @ts-ignore - Supabase type inference issue, types are correct at runtime
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Bill
  },

  updateTotal: async (id: string) => {
    const { data: items } = await supabase
      .from('bill_items')
      .select('amount')
      .eq('bill_id', id)

    const total = items?.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0) || 0

    const { data, error } = await supabase
      .from('bills')
      // @ts-ignore - Supabase type inference issue, types are correct at runtime
      .update({ total_amount: total })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Bill
  },

  delete: async (id: string) => {
    const { error } = await supabase.from('bills').delete().eq('id', id)
    if (error) throw error
  },

  getByReservationId: async (reservationId: string) => {
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as Bill[]
  },
}

export const billItemsApi = {
  getAll: async (billId: string) => {
    const { data, error } = await supabase
      .from('bill_items')
      .select('*')
      .eq('bill_id', billId)
      .order('created_at')

    if (error) throw error
    return data as BillItem[]
  },

  create: async (item: {
    bill_id: string
    description: string
    amount: number
  }) => {
    const { data, error } = await supabase
      .from('bill_items')
      .insert(item as any)
      .select()
      .single()

    if (error) throw error
    return data as BillItem
  },

  update: async (id: string, updates: Partial<BillItem>) => {
    const { data, error } = await supabase
      .from('bill_items')
      // @ts-ignore - Supabase type inference issue, types are correct at runtime
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as BillItem
  },

  delete: async (id: string) => {
    const { error } = await supabase.from('bill_items').delete().eq('id', id)
    if (error) throw error
  },
}

