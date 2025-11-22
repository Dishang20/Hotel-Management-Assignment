import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { roomsApi } from '@/utils/api/rooms'
import { reservationsApi } from '@/utils/api/reservations'
import { billsApi } from '@/utils/api/bills'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Table, TableRow, TableCell } from '@/components/ui/Table'
import { useAuth } from '@/hooks/useAuth'
import { useUIStore } from '@/store/uiStore'
import type { RoomStatus } from '@/types/database.types'

export const Dashboard = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addNotification } = useUIStore()
  const { role, canManageRooms, canManageReservations, canManageBills } = useAuth()

  const { data: rooms, isLoading: roomsLoading, error: roomsError } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => roomsApi.getAll(),
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const { data: reservations, isLoading: reservationsLoading, error: reservationsError } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => reservationsApi.getAll(),
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const { data: bills, isLoading: billsLoading, error: billsError } = useQuery({
    queryKey: ['bills'],
    queryFn: () => billsApi.getAll(),
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const isLoading = roomsLoading || reservationsLoading || billsLoading

  const roomStats = rooms?.reduce(
    (acc, room) => {
      acc[room.status] = (acc[room.status] || 0) + 1
      return acc
    },
    {} as Partial<Record<RoomStatus, number>>
  ) || {}

  const billStats = {
    total: bills?.length || 0,
    paid: bills?.filter((b) => b.paid).length || 0,
    pending: bills?.filter((b) => !b.paid).length || 0,
  }

  // Calculate revenue for accounting users
  const calculateRevenue = () => {
    if (!bills || role !== 'accounting') return { monthly: 0, monthToDate: 0 }
    
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
    
    // Monthly revenue (all paid bills from current month)
    const monthlyRevenue = bills
      .filter((bill) => {
        if (!bill.paid) return false
        const billDate = new Date(bill.created_at)
        return billDate.getMonth() === currentMonth && billDate.getFullYear() === currentYear
      })
      .reduce((sum, bill) => {
        const subtotal = bill.total_amount || 0
        const tax = subtotal * 0.18
        return sum + subtotal + tax
      }, 0)
    
    // Month-to-date revenue (paid bills from first day of month to today)
    const monthToDateRevenue = bills
      .filter((bill) => {
        if (!bill.paid) return false
        const billDate = new Date(bill.created_at)
        return billDate >= firstDayOfMonth && billDate <= now
      })
      .reduce((sum, bill) => {
        const subtotal = bill.total_amount || 0
        const tax = subtotal * 0.18
        return sum + subtotal + tax
      }, 0)
    
    return { monthly: monthlyRevenue, monthToDate: monthToDateRevenue }
  }

  const revenue = calculateRevenue()
  const recentReservations = reservations?.slice(0, 5) || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    )
  }

  if (roomsError || reservationsError || billsError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-red-600 mb-2">Error loading data</p>
          <p className="text-sm text-gray-600">
            {roomsError?.message || reservationsError?.message || billsError?.message || 'Unknown error'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <Button
          variant="outline"
          onClick={async () => {
            await queryClient.invalidateQueries({ queryKey: ['rooms'] })
            await queryClient.invalidateQueries({ queryKey: ['reservations'] })
            await queryClient.invalidateQueries({ queryKey: ['bills'] })
            await Promise.all([
              queryClient.refetchQueries({ queryKey: ['rooms'] }),
              queryClient.refetchQueries({ queryKey: ['reservations'] }),
              queryClient.refetchQueries({ queryKey: ['bills'] }),
            ])
            addNotification('Dashboard refreshed', 'success')
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
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Rooms</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{rooms?.length || 0}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Available Rooms</div>
          <div className="text-2xl font-bold text-green-600">{roomStats.available || 0}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Bills</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{billStats.total}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pending Bills</div>
          <div className="text-2xl font-bold text-orange-600">{billStats.pending}</div>
        </Card>
      </div>

      {/* Revenue Widgets for Accounting Users */}
      {role === 'accounting' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Monthly Revenue</div>
            <div className="text-3xl font-bold text-green-600">₹{revenue.monthly.toFixed(2)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              All paid bills from {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </Card>
          <Card>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Month-to-Date Revenue</div>
            <div className="text-3xl font-bold text-blue-600">₹{revenue.monthToDate.toFixed(2)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              From {new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString()} to today
            </div>
          </Card>
        </div>
      )}

      {/* Room Status Overview */}
      <Card title="Room Status Overview">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-white rounded-lg">
            <div className="text-2xl font-bold text-green-600">{roomStats.available || 0}</div>
            <div className="text-sm text-gray-600 mt-1">Available</div>
          </div>
          <div className="text-center p-4 bg-white rounded-lg">
            <div className="text-2xl font-bold text-red-600">{roomStats.occupied || 0}</div>
            <div className="text-sm text-gray-600 mt-1">Occupied</div>
          </div>
          <div className="text-center p-4 bg-white rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{roomStats.cleaning || 0}</div>
            <div className="text-sm text-gray-600 mt-1">Cleaning</div>
          </div>
          <div className="text-center p-4 bg-white rounded-lg">
            <div className="text-2xl font-bold text-gray-600">{roomStats.maintenance || 0}</div>
            <div className="text-sm text-gray-600 mt-1">Maintenance</div>
          </div>
        </div>
      </Card>

      {/* Recent Reservations */}
      <Card
        title="Recent Reservations"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/reservations')}>
            View All
          </Button>
        }
      >
        <Table headers={['Guest Name', 'Room', 'Check-in', 'Check-out', 'Status']}>
          {recentReservations.map((reservation) => (
            <TableRow key={reservation.id}>
              <TableCell>{reservation.guest_name}</TableCell>
              <TableCell>{reservation.rooms?.room_number || 'N/A'}</TableCell>
              <TableCell>{new Date(reservation.check_in).toLocaleDateString()}</TableCell>
              <TableCell>{new Date(reservation.check_out).toLocaleDateString()}</TableCell>
              <TableCell>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    reservation.status === 'confirmed'
                      ? 'bg-green-100 text-green-800'
                      : reservation.status === 'checked_in'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {reservation.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </Card>

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <div className="flex flex-wrap gap-4">
          {(canManageRooms() || role === 'accounting') && (
            <Button variant="primary" onClick={() => navigate('/rooms')}>
              Manage Rooms
            </Button>
          )}
          {(canManageReservations() || role === 'accounting') && (
            <Button variant="primary" onClick={() => navigate('/reservations')}>
              Create Reservation
            </Button>
          )}
          {canManageBills() && (
            <Button variant="primary" onClick={() => navigate('/bills')}>
              Create Bill
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

