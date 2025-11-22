import { supabase } from '@/lib/supabase'
import type { Room, RoomStatus, RoomType } from '@/types/database.types'

export const roomsApi = {
  getAll: async (filters?: { room_type?: RoomType; status?: RoomStatus }) => {
    let query = supabase.from('rooms').select('*').order('room_number')

    if (filters?.room_type) {
      query = query.eq('room_type', filters.room_type)
    }
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw error
    return data as Room[]
  },

  getById: async (id: string) => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data as Room
  },

  create: async (room: {
    room_number: string
    room_type: RoomType
    price: number
    status?: RoomStatus
  }) => {
    const { data, error } = await supabase
      .from('rooms')
      .insert(room as any)
      .select()
      .single()

    if (error) throw error
    return data as Room
  },

  update: async (id: string, updates: Partial<Room>) => {
    const { data, error } = await supabase
      .from('rooms')
      // @ts-ignore - Supabase type inference issue, types are correct at runtime
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Room
  },

  updateStatus: async (id: string, status: RoomStatus) => {
    const { data, error } = await supabase
      .from('rooms')
      // @ts-ignore - Supabase type inference issue, types are correct at runtime
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Room
  },

  delete: async (id: string) => {
    const { error } = await supabase.from('rooms').delete().eq('id', id)
    if (error) throw error
  },
}

