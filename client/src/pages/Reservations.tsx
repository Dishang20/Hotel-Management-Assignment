import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { reservationsApi } from '@/utils/api/reservations'
import { roomsApi } from '@/utils/api/rooms'
import { billsApi, billItemsApi } from '@/utils/api/bills'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableRow, TableCell } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/hooks/useAuth'
import type { ReservationStatus } from '@/types/database.types'

export const Reservations = () => {
  const { loading: authLoading, role } = useAuth()
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [creatingBillFor, setCreatingBillFor] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [formData, setFormData] = useState({
    room_id: '',
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    check_in: '',
    check_out: '',
    status: 'pending' as ReservationStatus,
  })
  const queryClient = useQueryClient()
  const { addNotification } = useUIStore()

  const { data: reservations, isLoading, error: reservationsError } = useQuery({
    queryKey: ['reservations'],
    queryFn: async () => {
      try {
        const data = await reservationsApi.getAll()
        return data || []
      } catch (error) {
        console.error('[Reservations] Error:', error)
        throw error
      }
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => roomsApi.getAll({ status: 'available' }),
    retry: 1,
    refetchOnWindowFocus: false,
  })

  // Create a map of reservation_id -> paid bill using bills from reservations (foreign key relationship)
  const paidBillsMap = useMemo(() => {
    if (!reservations) return new Map<string, any>()
    const map = new Map<string, any>()
    reservations.forEach((reservation) => {
      // bills is included in reservation via foreign key relationship
      const bills = Array.isArray(reservation.bills) ? reservation.bills : (reservation.bills ? [reservation.bills] : [])
      const paidBill = bills.find((bill: any) => bill.paid === true)
      if (paidBill) {
        map.set(reservation.id, paidBill)
      }
    })
    return map
  }, [reservations])

  const createMutation = useMutation({
    mutationFn: reservationsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setIsModalOpen(false)
      setEditingReservation(null)
      addNotification('Reservation created successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to create reservation', 'error')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      reservationsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setIsModalOpen(false)
      setEditingReservation(null)
      addNotification('Reservation updated successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to update reservation', 'error')
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) =>
      reservationsApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      addNotification('Reservation status updated', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to update status', 'error')
    },
  })

  const quickCreateBillMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      const reservation = reservations?.find((r) => r.id === reservationId)
      if (!reservation) {
        throw new Error('Reservation not found')
      }
      
      if (reservation.status === 'cancelled') {
        throw new Error('Cannot create bill for cancelled reservation')
      }

      // Check for existing draft bills
      const existingBills = await billsApi.getByReservationId(reservationId)
      const draftBill = existingBills.find((bill) => bill.status === 'draft' && !bill.paid)
      
      if (draftBill) {
        // Return the draft bill with a flag - navigation will happen in onSuccess
        return { ...draftBill, isExistingDraft: true }
      }

      const bill = await billsApi.create({
        reservation_id: reservationId,
        status: 'draft',
      })
      
      // Auto-add room charges
      if (reservation.rooms) {
        const checkIn = new Date(reservation.check_in)
        const checkOut = new Date(reservation.check_out)
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
        const roomCharge = Number(reservation.rooms.price) * nights

        if (roomCharge > 0) {
          await billItemsApi.create({
            bill_id: bill.id,
            description: `Room charges (${nights} nights) - ${reservation.rooms.room_number}`,
            amount: roomCharge,
          })
          await billsApi.updateTotal(bill.id)
        }
      }

      return bill
    },
    onSuccess: (bill: any) => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      setCreatingBillFor(null)
      if (bill.isExistingDraft) {
        addNotification('Existing draft bill found. Opening bill view.', 'info')
        navigate(`/bills?view=${bill.id}`)
      } else {
        addNotification('Bill created successfully!', 'success')
        navigate('/bills')
      }
    },
    onError: (error) => {
      setCreatingBillFor(null)
      addNotification(error instanceof Error ? error.message : 'Failed to create bill', 'error')
    },
  })

  // Update form data when editing reservation changes
  useEffect(() => {
    if (editingReservation) {
      setFormData({
        room_id: editingReservation.room_id || '',
        guest_name: editingReservation.guest_name || '',
        guest_email: editingReservation.guest_email || '',
        guest_phone: editingReservation.guest_phone || '',
        check_in: editingReservation.check_in ? new Date(editingReservation.check_in).toISOString().split('T')[0] : '',
        check_out: editingReservation.check_out ? new Date(editingReservation.check_out).toISOString().split('T')[0] : '',
        status: editingReservation.status || 'pending',
      })
    } else {
      setFormData({
        room_id: '',
        guest_name: '',
        guest_email: '',
        guest_phone: '',
        check_in: '',
        check_out: '',
        status: 'pending',
      })
    }
  }, [editingReservation])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = {
      room_id: formData.room_id,
      guest_name: formData.guest_name,
      guest_email: formData.guest_email,
      guest_phone: formData.guest_phone,
      check_in: formData.check_in,
      check_out: formData.check_out,
      status: formData.status,
    }

    if (editingReservation) {
      updateMutation.mutate({ id: editingReservation.id, updates: data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // Determine if user can manage reservations - check role directly for better reliability
  // Priority: role > loading state (if role exists, use it immediately)
  const canManage = useMemo(() => {
    // If we have a role, check permissions directly (don't wait for loading)
    if (role === 'frontdesk' || role === 'accounting') {
      return true
    }
    // If no role yet, wait for loading to complete before showing/hiding
    // This prevents flickering when switching tabs
    if (authLoading) {
      return false
    }
    // After loading completes, if still no role, user doesn't have permission
    return false
  }, [authLoading, role])
  
  const canCreateBill = useMemo(() => {
    // If we have a role, check permissions directly (don't wait for loading)
    if (role === 'accounting') {
      return true
    }
    // If no role yet, wait for loading to complete before showing/hiding
    // This prevents flickering when switching tabs
    if (authLoading) {
      return false
    }
    // After loading completes, if still no role, user doesn't have permission
    return false
  }, [authLoading, role])

  // Filter reservations based on search query
  const filteredReservations = useMemo(() => {
    if (!reservations) return []
    return reservations.filter((reservation) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase().trim()
      const email = reservation.guest_email?.toLowerCase() || ''
      const phone = reservation.guest_phone?.toLowerCase() || ''
      return email.includes(query) || phone.includes(query)
    })
  }, [reservations, searchQuery])

  // Pagination
  const totalPages = Math.ceil(filteredReservations.length / itemsPerPage)
  const paginatedReservations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredReservations.slice(startIndex, endIndex)
  }, [filteredReservations, currentPage, itemsPerPage])

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  return (
    <div className="space-y-6 w-full">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">Reservations</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ['reservations'] })
              await queryClient.refetchQueries({ queryKey: ['reservations'] })
              addNotification('Reservations refreshed', 'success')
            }}
            disabled={isLoading}
          >
            <svg
              className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </Button>
          {canManage && (
            <Button 
              variant="primary" 
              onClick={() => setIsModalOpen(true)}
            >
              Create Reservation
            </Button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <Card>
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by email or phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          {searchQuery && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchQuery('')}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
          </div>
        ) : reservationsError ? (
          <div className="text-center py-8">
            <div className="text-red-600 font-semibold mb-2">Error loading reservations</div>
            <div className="text-sm text-red-500 mb-4">
              {reservationsError instanceof Error ? reservationsError.message : 'Unknown error'}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['reservations'] })}
            >
              Retry
            </Button>
          </div>
        ) : filteredReservations && filteredReservations.length > 0 ? (
          <>
            <Table
              headers={['Guest Name', 'Email', 'Phone', 'Room', 'Check-in', 'Check-out', 'Status', 'Actions']}
            >
              {paginatedReservations.map((reservation) => (
              <TableRow key={reservation.id}>
                <TableCell className="font-medium">{reservation.guest_name}</TableCell>
                <TableCell>{reservation.guest_email}</TableCell>
                <TableCell>{reservation.guest_phone}</TableCell>
                <TableCell>
                  {Array.isArray(reservation.rooms) 
                    ? reservation.rooms[0]?.room_number || 'N/A'
                    : reservation.rooms?.room_number || 'N/A'}
                </TableCell>
                <TableCell>{new Date(reservation.check_in).toLocaleDateString()}</TableCell>
                <TableCell>{new Date(reservation.check_out).toLocaleDateString()}</TableCell>
                <TableCell>
                  {canManage ? (
                    <select
                      value={reservation.status}
                      onChange={(e) =>
                        updateStatusMutation.mutate({
                          id: reservation.id,
                          status: e.target.value as ReservationStatus,
                        })
                      }
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="checked_in">Checked In</option>
                      <option value="checked_out">Checked Out</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  ) : (
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        reservation.status === 'confirmed'
                          ? 'bg-green-100 text-green-800'
                          : reservation.status === 'checked_in'
                          ? 'bg-blue-100 text-blue-800'
                          : reservation.status === 'checked_out'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {reservation.status}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingReservation(reservation)
                          setIsModalOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      {canCreateBill && reservation.status !== 'cancelled' && (() => {
                        const paidBill = paidBillsMap.get(reservation.id)
                        if (paidBill) {
                          // Show "View Bill" button if bill is paid
                          return (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                navigate(`/bills?view=${paidBill.id}`)
                              }}
                            >
                              View Bill
                            </Button>
                          )
                        } else {
                          // Show "Create Bill" button if no paid bill exists
                          return (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setCreatingBillFor(reservation.id)
                                quickCreateBillMutation.mutate(reservation.id)
                              }}
                              isLoading={creatingBillFor === reservation.id && quickCreateBillMutation.isPending}
                            >
                              Create Bill
                            </Button>
                          )
                        }
                      })()}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </Table>
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalItems={filteredReservations.length}
            />
          )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No reservations found
          </div>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingReservation(null)
        }}
        title={editingReservation ? 'Edit Reservation' : 'Create Reservation'}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Room</label>
            <select 
              name="room_id" 
              required 
              value={formData.room_id}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Select Room</option>
              {rooms?.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.room_number} - {room.room_type} (₹{room.price}/night)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Guest Name</label>
            <input
              type="text"
              name="guest_name"
              required
              value={formData.guest_name}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Guest Email</label>
            <input
              type="email"
              name="guest_email"
              required
              value={formData.guest_email}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Guest Phone</label>
            <input
              type="tel"
              name="guest_phone"
              required
              value={formData.guest_phone}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Check-in</label>
              <input
                type="date"
                name="check_in"
                required
                value={formData.check_in}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Check-out</label>
              <input
                type="date"
                name="check_out"
                required
                value={formData.check_out}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsModalOpen(false)
                setEditingReservation(null)
              }}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="primary" 
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingReservation ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

