import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { billsApi, billItemsApi } from '@/utils/api/bills'
import { reservationsApi } from '@/utils/api/reservations'
import { invoicesApi } from '@/utils/api/invoices'
import { paymentsApi } from '@/utils/api/payments'
import { receiptsApi } from '@/utils/api/receipts'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableRow, TableCell } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { FileUpload } from '@/components/ui/FileUpload'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useUIStore } from '@/store/uiStore'
import type { BillStatus } from '@/types/database.types'

export const Bills = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedBill, setSelectedBill] = useState<string | null>(null)
  const [editingBill, setEditingBill] = useState<any>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [reservationSearchQuery, setReservationSearchQuery] = useState('')
  const [selectedReservationId, setSelectedReservationId] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const queryClient = useQueryClient()
  const { addNotification } = useUIStore()

  // Check for view parameter in URL
  useEffect(() => {
    const viewBillId = searchParams.get('view')
    if (viewBillId) {
      setSelectedBill(viewBillId)
      setIsViewModalOpen(true)
      // Remove the query parameter
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: bills, isLoading, error: billsError, refetch: refetchBills } = useQuery({
    queryKey: ['bills'],
    queryFn: () => billsApi.getAll(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 0, // Always consider data stale to allow refetching
  })

  const { data: reservations } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => reservationsApi.getAll(),
    retry: 1,
    refetchOnWindowFocus: false,
  })

  // Filter out cancelled reservations for bill creation and apply search
  const availableReservations = reservations?.filter(
    (reservation) => reservation.status !== 'cancelled'
  ) || []

  // Helper function to normalize phone numbers (remove all non-digit characters)
  const normalizePhone = (phone: string): string => {
    return phone.replace(/\D/g, '')
  }

  // Filter reservations based on search query
  const filteredReservationsForBill = useMemo(() => {
    if (!reservationSearchQuery.trim()) return availableReservations
    
    const query = reservationSearchQuery.toLowerCase().trim()
    const normalizedQuery = normalizePhone(query) // Normalize query for phone comparison
    
    return availableReservations.filter((reservation) => {
      const guestName = reservation.guest_name?.toLowerCase() || ''
      const guestEmail = reservation.guest_email?.toLowerCase() || ''
      const guestPhone = reservation.guest_phone || ''
      const normalizedPhone = normalizePhone(guestPhone)
      
      // Handle rooms - can be array or object
      let roomNumber = ''
      if (Array.isArray(reservation.rooms)) {
        roomNumber = reservation.rooms[0]?.room_number?.toString().toLowerCase() || ''
      } else if (reservation.rooms) {
        roomNumber = reservation.rooms.room_number?.toString().toLowerCase() || ''
      }
      
      return (
        guestName.includes(query) ||
        guestEmail.includes(query) ||
        guestPhone.toLowerCase().includes(query) ||
        normalizedPhone.includes(normalizedQuery) ||
        roomNumber.includes(query)
      )
    })
  }, [availableReservations, reservationSearchQuery])

  const { data: billDetails, refetch: refetchBillDetails } = useQuery({
    queryKey: ['bill', selectedBill],
    queryFn: () => (selectedBill ? billsApi.getById(selectedBill) : null),
    enabled: !!selectedBill,
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 0, // Always consider data stale to allow refetching
  })

  const { data: receipts } = useQuery({
    queryKey: ['receipts', selectedBill],
    queryFn: () => (selectedBill ? receiptsApi.getByBillId(selectedBill) : []),
    enabled: !!selectedBill,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const createBillMutation = useMutation({
    mutationFn: async (data: { reservation_id: string; status?: BillStatus }) => {
      const bill = await billsApi.create(data)
      
      // Auto-add room charges
      const reservation = reservations?.find((r) => r.id === data.reservation_id)
      if (reservation && reservation.rooms) {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      setIsCreateModalOpen(false)
      setSelectedReservationId('')
      setReservationSearchQuery('')
      addNotification('Bill created successfully with room charges', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to create bill', 'error')
    },
  })

  const addItemMutation = useMutation({
    mutationFn: async (itemData: { bill_id: string; description: string; amount: number }) => {
      // Check if bill is paid before adding item
      const bill = await billsApi.getById(itemData.bill_id)
      if (bill.paid) {
        throw new Error('Cannot add items to a paid bill')
      }
      return billItemsApi.create(itemData)
    },
    onSuccess: async () => {
      if (selectedBill) {
        await billsApi.updateTotal(selectedBill)
        queryClient.invalidateQueries({ queryKey: ['bill', selectedBill] })
        queryClient.invalidateQueries({ queryKey: ['bills'] })
      }
      setIsItemModalOpen(false)
      addNotification('Item added successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to add item', 'error')
    },
  })

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // Check if bill is paid before deleting item
      if (!selectedBill) {
        throw new Error('No bill selected')
      }
      const bill = await billsApi.getById(selectedBill)
      if (bill.paid) {
        throw new Error('Cannot delete items from a paid bill')
      }
      return billItemsApi.delete(itemId)
    },
    onSuccess: async () => {
      if (selectedBill) {
        await billsApi.updateTotal(selectedBill)
        queryClient.invalidateQueries({ queryKey: ['bill', selectedBill] })
        queryClient.invalidateQueries({ queryKey: ['bills'] })
      }
      addNotification('Item deleted successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to delete item', 'error')
    },
  })

  const updateBillMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      billsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['bill', editingBill?.id] })
      setIsEditModalOpen(false)
      setEditingBill(null)
      addNotification('Bill updated successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to update bill', 'error')
    },
  })

  const generateInvoiceMutation = useMutation({
    mutationFn: invoicesApi.generate,
    onSuccess: () => {
      addNotification('Invoice PDF generated and downloaded successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to generate invoice', 'error')
    },
  })

  const sendEmailMutation = useMutation({
    mutationFn: ({ billId, email }: { billId: string; email: string }) =>
      invoicesApi.sendEmail(billId, email),
    onSuccess: () => {
      addNotification('Email sent successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to send email', 'error')
    },
  })

  const sendPaymentLinkMutation = useMutation({
    mutationFn: async (bill: any) => {
      // Handle case where reservation might be an array or object
      let reservation: any = null
      if (Array.isArray(bill.reservations)) {
        reservation = bill.reservations[0]
      } else if (bill.reservations) {
        reservation = bill.reservations
      }

      if (!reservation?.guest_email) {
        throw new Error('Guest email not found for this reservation')
      }

      // Calculate total amount from bill items if available, otherwise use total_amount
      let subtotal = bill.total_amount || 0
      if (bill.bill_items && bill.bill_items.length > 0) {
        subtotal = bill.bill_items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
      }
      const tax = subtotal * 0.18
      const totalAmount = subtotal + tax

      // Create order first
      const orderData = await paymentsApi.createRazorpayOrder(bill.id, totalAmount)
      
      if (!orderData || !orderData.orderId) {
        throw new Error('Failed to create payment order')
      }
      
      // Generate payment link
      const paymentLink = `${window.location.origin}/payment/${bill.id}?orderId=${orderData.orderId}`
      
      // Send email with payment link
      await paymentsApi.sendPaymentLinkEmail(bill.id, reservation.guest_email, paymentLink)
      
      return paymentLink
    },
    onSuccess: () => {
      addNotification('Payment link sent to guest email', 'success')
    },
    onError: (error) => {
      console.error('[Bills] Send payment link error:', error)
      addNotification(error instanceof Error ? error.message : 'Failed to send payment link', 'error')
    },
  })

  const handleCreateBill = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (!selectedReservationId) {
      addNotification('Please select a reservation', 'error')
      return
    }
    
    // Validate reservation is not cancelled
    const selectedReservation = reservations?.find(r => r.id === selectedReservationId)
    if (selectedReservation?.status === 'cancelled') {
      addNotification('Cannot create bill for cancelled reservation', 'error')
      return
    }
    
      createBillMutation.mutate({
        reservation_id: selectedReservationId,
        status: 'draft' as BillStatus,
      })
  }

  const handleAddItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedBill) return

    // Prevent adding items to paid bills
    if (billDetails?.paid) {
      addNotification('Cannot add items to a paid bill', 'error')
      setIsItemModalOpen(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    addItemMutation.mutate({
      bill_id: selectedBill,
      description: formData.get('description') as string,
      amount: Number(formData.get('amount')),
    })
  }

  const handlePayOnline = async (bill: any) => {
    try {
      const subtotal = bill.total_amount || 0
      const tax = subtotal * 0.18
      const totalAmount = subtotal + tax
      
      const orderData = await paymentsApi.createRazorpayOrder(bill.id, totalAmount)

      if (!orderData || !orderData.orderId || !orderData.keyId) {
        throw new Error('Failed to create payment order')
      }

      // Generate payment link URL
      const paymentLink = `${window.location.origin}/payment/${bill.id}?orderId=${orderData.orderId}`
      setPaymentLink(paymentLink)

      // Generate QR code with payment link
      const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentLink)}`
      setQrCodeUrl(qrCodeApiUrl)

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Hotel Management',
        description: `Bill Payment - ${bill.id.slice(0, 8)}`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            const result = await paymentsApi.verifyPayment(
              bill.id,
              response.razorpay_payment_id,
              response.razorpay_order_id,
              response.razorpay_signature
            )
            
            if (result.success) {
              addNotification('Payment successful! Bill marked as paid.', 'success')
              // Invalidate queries to refresh bill data
              queryClient.invalidateQueries({ queryKey: ['bills'] })
              queryClient.invalidateQueries({ queryKey: ['bill', bill.id] })
              setPaymentLink(null)
              setQrCodeUrl(null)
              
              // Auto-generate invoice after payment
              try {
                await invoicesApi.generate(bill.id)
                addNotification('Invoice generated successfully!', 'success')
              } catch (invoiceError) {
                console.error('Failed to auto-generate invoice:', invoiceError)
                // Don't show error to user, they can generate manually
              }
            }
          } catch (error) {
            addNotification(error instanceof Error ? error.message : 'Payment verification failed', 'error')
          }
        },
        prefill: {
          email: bill.reservations?.guest_email || '',
          name: bill.reservations?.guest_name || '',
        },
        theme: {
          color: '#1877F2',
        },
        modal: {
          ondismiss: function() {
            setPaymentLink(null)
            setQrCodeUrl(null)
          }
        }
      }

      if (!window.Razorpay) {
        throw new Error('Razorpay SDK not loaded')
      }

      const razorpay = new window.Razorpay(options)
      razorpay.open()
    } catch (error) {
      console.error('Payment error:', error)
      addNotification(error instanceof Error ? error.message : 'Failed to initiate payment', 'error')
    }
  }

  const handleSendPaymentLink = (bill: any) => {
    if (!bill) {
      addNotification('Bill data not available', 'error')
      return
    }
    sendPaymentLinkMutation.mutate(bill)
  }

  const handleUploadReceipt = async (file: File) => {
    if (!selectedBill) {
      addNotification('No bill selected', 'error')
      return
    }
    
    try {
      await receiptsApi.upload(selectedBill, file)
      queryClient.invalidateQueries({ queryKey: ['receipts', selectedBill] })
      addNotification('Receipt uploaded successfully', 'success')
    } catch (error) {
      console.error('Receipt upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload receipt'
      addNotification(errorMessage, 'error')
      throw error // Re-throw so FileUpload component can handle it
    }
  }

  // Pagination for bills
  const totalPages = Math.ceil((bills?.length || 0) / itemsPerPage)
  const paginatedBills = useMemo(() => {
    if (!bills) return []
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return bills.slice(startIndex, endIndex)
  }, [bills, currentPage, itemsPerPage])

  const subtotal = billDetails?.bill_items?.reduce((sum, item) => sum + Number(item.amount), 0) || 0
  const tax = subtotal * 0.18
  const total = subtotal + tax

  return (
    <div className="space-y-6 w-full">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">Billing</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                // Invalidate all bill-related queries to mark them as stale
                await queryClient.invalidateQueries({ queryKey: ['bills'] })
                await queryClient.invalidateQueries({ queryKey: ['bill'] })
                
                // Force refetch using the refetch function directly (bypasses cache)
                const billsResult = await refetchBills()
                
                // If a bill is selected, also refetch its details
                if (selectedBill && refetchBillDetails) {
                  await refetchBillDetails()
                }
                
                // Check if data was actually updated
                if (billsResult.data) {
                  addNotification('Bills refreshed', 'success')
                } else {
                  addNotification('No new data available', 'info')
                }
              } catch (error) {
                console.error('[Bills] Refresh error:', error)
                addNotification('Failed to refresh bills', 'error')
              }
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
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            Create Bill
          </Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
          </div>
        ) : billsError ? (
          <div className="text-center py-8 text-red-600">
            Error loading bills: {billsError instanceof Error ? billsError.message : 'Unknown error'}
          </div>
        ) : (
          <>
            <Table headers={['Bill ID', 'Guest', 'Reservation', 'Total', 'Status', 'Paid', 'Actions']}>
              {paginatedBills.map((bill) => (
              <TableRow key={bill.id}>
                <TableCell className="font-mono text-xs">{bill.id.slice(0, 8)}</TableCell>
                <TableCell>{bill.reservations?.guest_name || 'N/A'}</TableCell>
                <TableCell>{bill.reservations?.id.slice(0, 8) || 'N/A'}</TableCell>
                <TableCell>₹{bill.total_amount.toFixed(2)}</TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      bill.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : bill.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {bill.status}
                  </span>
                </TableCell>
                <TableCell>{bill.paid ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedBill(bill.id)
                        setIsViewModalOpen(true)
                      }}
                    >
                      View
                    </Button>
                    {!bill.paid && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingBill(bill)
                            setIsEditModalOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handlePayOnline(bill)}
                        >
                          Pay Online
                        </Button>
                      </>
                    )}
                    {bill.paid && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={async () => {
                          try {
                            await invoicesApi.download(bill.id)
                            addNotification('Invoice downloaded', 'success')
                          } catch (error) {
                            addNotification(error instanceof Error ? error.message : 'Failed to download invoice', 'error')
                          }
                        }}
                      >
                        Download Invoice
                      </Button>
                    )}
                  </div>
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
              totalItems={bills?.length || 0}
            />
          )}
          </>
        )}
      </Card>

      {/* Create Bill Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
          setReservationSearchQuery('')
          setSelectedReservationId('')
        }}
        title="Create Bill"
      >
        <form onSubmit={handleCreateBill} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Select Reservation
            </label>
            <SearchableSelect
              options={filteredReservationsForBill.map((reservation) => {
                // Handle rooms - can be array or object
                let roomNumber = 'N/A'
                if (Array.isArray(reservation.rooms)) {
                  roomNumber = reservation.rooms[0]?.room_number?.toString() || 'N/A'
                } else if (reservation.rooms) {
                  roomNumber = reservation.rooms.room_number?.toString() || 'N/A'
                }
                
                return {
                  value: reservation.id,
                  label: `${reservation.guest_name} - Room ${roomNumber} (${reservation.status}) - ${reservation.guest_email}`,
                }
              })}
              value={selectedReservationId}
              onChange={setSelectedReservationId}
              placeholder={
                filteredReservationsForBill.length === 0
                  ? reservationSearchQuery
                    ? 'No reservations found matching your search'
                    : 'No available reservations (cancelled reservations cannot have bills)'
                  : 'Search by guest name, email, phone, or room number...'
              }
              searchPlaceholder="Search by guest name, email, phone, or room number..."
              required
              onSearch={setReservationSearchQuery}
            />
            {filteredReservationsForBill.length === 0 && reservationSearchQuery && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">No reservations found matching your search.</p>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={createBillMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* View Bill Modal */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false)
          setSelectedBill(null)
        }}
        title="Bill Details"
        size="lg"
      >
        {billDetails && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 sm:p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Guest Name</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{billDetails.reservations?.guest_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Guest Email</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{billDetails.reservations?.guest_email || 'N/A'}</p>
              </div>
            </div>

            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Bill Items</h3>
                {!billDetails.paid && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsItemModalOpen(true)}
                  >
                    Add Item
                  </Button>
                )}
                {billDetails.paid && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 italic">Items cannot be modified for paid bills</span>
                )}
              </div>
              <Table headers={['Description', 'Amount', 'Actions']}>
                {billDetails.bill_items?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>₹{Number(item.amount).toFixed(2)}</TableCell>
                    <TableCell>
                      {!billDetails.paid && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            if (confirm('Delete this item?')) {
                              deleteItemMutation.mutate(item.id)
                            }
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </Table>
            </div>

            <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-3 space-y-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                <span className="font-semibold text-gray-900 dark:text-white">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Tax (18%):</span>
                <span className="font-semibold text-gray-900 dark:text-white">₹{tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t-2 border-gray-300 dark:border-gray-600 pt-2 mt-2">
                <span className="text-gray-900 dark:text-white">Total:</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">₹{total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3">
              {billDetails.paid && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-semibold text-sm text-green-800 dark:text-green-200">Bill Paid Successfully</p>
                  </div>
                  {billDetails.razorpay_payment_id && (
                    <p className="text-xs text-green-700 dark:text-green-300">Payment ID: {billDetails.razorpay_payment_id}</p>
                  )}
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">This bill cannot be edited. You can only download invoice or send it via email.</p>
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                <Button
                  variant="primary"
                  onClick={async () => {
                    try {
                      await invoicesApi.download(billDetails.id)
                      addNotification('Invoice downloaded successfully', 'success')
                    } catch (error) {
                      // If download fails, try generating first
                      generateInvoiceMutation.mutate(billDetails.id, {
                        onSuccess: () => {
                          addNotification('Invoice generated and opened', 'success')
                        },
                        onError: (err) => {
                          addNotification(err instanceof Error ? err.message : 'Failed to download invoice', 'error')
                        },
                      })
                    }
                  }}
                  isLoading={generateInvoiceMutation.isPending}
                >
                  {billDetails.paid ? 'Download Invoice' : 'Generate & Download Invoice'}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (billDetails.reservations?.guest_email) {
                      sendEmailMutation.mutate({
                        billId: billDetails.id,
                        email: billDetails.reservations.guest_email,
                      })
                    } else {
                      addNotification('Guest email not found', 'error')
                    }
                  }}
                  isLoading={sendEmailMutation.isPending}
                  disabled={!billDetails.reservations?.guest_email}
                >
                  Email Invoice
                </Button>
                {!billDetails.paid && (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => handlePayOnline(billDetails)}
                    >
                      Pay Online
                    </Button>
                    <Button
                      variant="primary"
                        onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!billDetails) {
                          console.error('[Bills] billDetails is null/undefined')
                          addNotification('Bill details not available', 'error')
                          return
                        }
                        handleSendPaymentLink(billDetails)
                      }}
                      isLoading={sendPaymentLinkMutation.isPending}
                      disabled={(() => {
                        if (!billDetails) return true
                        const reservation = Array.isArray(billDetails.reservations) 
                          ? billDetails.reservations[0] 
                          : billDetails.reservations
                        const hasEmail = !!reservation?.guest_email
                        return !hasEmail
                      })()}
                    >
                      Send Payment Link
                    </Button>
                  </>
                )}
              </div>

              {/* QR Code Display */}
              {qrCodeUrl && !billDetails.paid && (
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h4 className="font-semibold text-sm mb-2">Scan to Pay</h4>
                  <div className="flex flex-col items-center gap-3">
                    <img src={qrCodeUrl} alt="Payment QR Code" className="border border-gray-200 dark:border-gray-700 rounded max-w-[150px]" />
                    {paymentLink && (
                      <div className="text-center w-full">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Or use payment link:</p>
                        <a
                          href={paymentLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline break-all text-xs"
                        >
                          {paymentLink}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {!billDetails.paid && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Receipts</h3>
                <FileUpload
                  onUpload={handleUploadReceipt}
                  accept="image/*,.pdf"
                  label="Upload Receipt"
                />
                <div className="mt-3 space-y-2">
                  {receipts?.map((receipt) => (
                    <div
                      key={receipt.id}
                      className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded"
                    >
                      <span className="text-xs truncate flex-1 mr-2">{receipt.file_name}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const url = await receiptsApi.getDownloadUrl(receipt.storage_path)
                          window.open(url, '_blank')
                        }}
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Edit Bill Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingBill(null)
        }}
        title="Edit Bill"
      >
        {editingBill && editingBill.paid ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 font-semibold">This bill has been paid and cannot be edited.</p>
            <p className="text-sm text-yellow-700 mt-2">You can only download the invoice or send it via email.</p>
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditModalOpen(false)
                  setEditingBill(null)
                }}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!editingBill || editingBill.paid) return
              const formData = new FormData(e.currentTarget)
              updateBillMutation.mutate({
                id: editingBill.id,
                updates: {
                  status: formData.get('status') as BillStatus,
                },
              })
            }}
            className="space-y-3"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                name="status"
                defaultValue={editingBill?.status || 'draft'}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                disabled={editingBill?.paid}
              >
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditModalOpen(false)
                  setEditingBill(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={updateBillMutation.isPending}
                disabled={editingBill?.paid}
              >
                Update
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add Item Modal */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        title="Add Bill Item"
      >
        {billDetails?.paid ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 font-semibold">This bill has been paid and items cannot be modified.</p>
            <p className="text-sm text-yellow-700 mt-2">You can only download the invoice or send it via email.</p>
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => setIsItemModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAddItem} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <input
                type="text"
                name="description"
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="e.g., Room charges, Restaurant, Minibar"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
              <input
                type="number"
                name="amount"
                step="0.01"
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setIsItemModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={addItemMutation.isPending} disabled={billDetails?.paid}>
                Add
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

