import { supabase } from '@/lib/supabase'
import type { Reservation, ReservationStatus } from '@/types/database.types'

export const reservationsApi = {
  getAll: async () => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*, rooms(*), bills(*)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as (Reservation & { rooms: any; bills: any[] })[]
  },

  getById: async (id: string) => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*, rooms(*), bills(*)')
      .eq('id', id)
      .single()

    if (error) throw error
    return data as Reservation & { rooms: any; bills: any[] }
  },

  create: async (reservation: {
    room_id: string
    guest_name: string
    guest_email: string
    guest_phone: string
    check_in: string
    check_out: string
    status?: ReservationStatus
  }) => {
    const { data, error } = await supabase
      .from('reservations')
      .insert(reservation as any)
      .select()
      .single()

    if (error) throw error
    return data as Reservation
  },

  update: async (id: string, updates: Partial<Reservation>) => {
    const { data, error } = await supabase
      .from('reservations')
      // @ts-ignore - Supabase type inference issue, types are correct at runtime
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Reservation
  },

  updateStatus: async (id: string, status: ReservationStatus) => {
    const { data, error } = await supabase
      .from('reservations')
      // @ts-ignore - Supabase type inference issue, types are correct at runtime
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Reservation
  },

  delete: async (id: string) => {
    const { error } = await supabase.from('reservations').delete().eq('id', id)
    if (error) throw error
  },
}

