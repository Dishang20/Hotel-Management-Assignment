export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'frontdesk' | 'accounting'
export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance'
export type RoomType = 'standard' | 'deluxe' | 'suite'
export type ReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled'
export type BillStatus = 'draft' | 'pending' | 'paid' | 'cancelled'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          role: UserRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
      }
      rooms: {
        Row: {
          id: string
          room_number: string
          room_type: RoomType
          price: number
          status: RoomStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          room_number: string
          room_type: RoomType
          price: number
          status?: RoomStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          room_number?: string
          room_type?: RoomType
          price?: number
          status?: RoomStatus
          created_at?: string
          updated_at?: string
        }
      }
      reservations: {
        Row: {
          id: string
          room_id: string
          guest_name: string
          guest_email: string
          guest_phone: string
          check_in: string
          check_out: string
          status: ReservationStatus
          total_amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          room_id: string
          guest_name: string
          guest_email: string
          guest_phone: string
          check_in: string
          check_out: string
          status?: ReservationStatus
          total_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          guest_name?: string
          guest_email?: string
          guest_phone?: string
          check_in?: string
          check_out?: string
          status?: ReservationStatus
          total_amount?: number
          created_at?: string
          updated_at?: string
        }
      }
      bills: {
        Row: {
          id: string
          reservation_id: string
          total_amount: number
          status: BillStatus
          paid: boolean
          razorpay_payment_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reservation_id: string
          total_amount?: number
          status?: BillStatus
          paid?: boolean
          razorpay_payment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          reservation_id?: string
          total_amount?: number
          status?: BillStatus
          paid?: boolean
          razorpay_payment_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      bill_items: {
        Row: {
          id: string
          bill_id: string
          description: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          bill_id: string
          description: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          bill_id?: string
          description?: string
          amount?: number
          created_at?: string
        }
      }
      payment_receipts: {
        Row: {
          id: string
          bill_id: string
          storage_path: string
          file_name: string
          file_size: number
          mime_type: string
          created_at: string
        }
        Insert: {
          id?: string
          bill_id: string
          storage_path: string
          file_name: string
          file_size: number
          mime_type: string
          created_at?: string
        }
        Update: {
          id?: string
          bill_id?: string
          storage_path?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          created_at?: string
        }
      }
      receipts: {
        Row: {
          id: string
          bill_id: string
          storage_path: string
          file_name: string
          file_size: number
          mime_type: string
          created_at: string
        }
        Insert: {
          id?: string
          bill_id: string
          storage_path: string
          file_name: string
          file_size: number
          mime_type: string
          created_at?: string
        }
        Update: {
          id?: string
          bill_id?: string
          storage_path?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          created_at?: string
        }
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Room = Database['public']['Tables']['rooms']['Row']
export type Reservation = Database['public']['Tables']['reservations']['Row']
export type Bill = Database['public']['Tables']['bills']['Row']
export type BillItem = Database['public']['Tables']['bill_items']['Row']
export type PaymentReceipt = Database['public']['Tables']['payment_receipts']['Row']
export type Receipt = Database['public']['Tables']['receipts']['Row']

