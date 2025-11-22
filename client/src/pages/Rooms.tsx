import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { roomsApi } from '@/utils/api/rooms'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableRow, TableCell } from '@/components/ui/Table'
import { Pagination } from '@/components/ui/Pagination'
import { useUIStore } from '@/store/uiStore'
import { useAuth } from '@/hooks/useAuth'
import type { Room, RoomType, RoomStatus } from '@/types/database.types'

export const Rooms = () => {
  const { canManageRooms, loading: authLoading } = useAuth()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [filters, setFilters] = useState<{ room_type?: RoomType; status?: RoomStatus }>({})
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const queryClient = useQueryClient()
  const { addNotification } = useUIStore()

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  const canManage = useMemo(() => !authLoading && canManageRooms(), [authLoading, canManageRooms])

  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ['rooms', filters],
    queryFn: () => roomsApi.getAll(filters),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  })

  // Pagination - must be at top level, not conditional
  const paginatedRooms = useMemo(() => {
    if (!rooms || rooms.length === 0) return []
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return rooms.slice(startIndex, endIndex)
  }, [rooms, currentPage, itemsPerPage])

  const totalPages = useMemo(() => {
    if (!rooms) return 0
    return Math.ceil(rooms.length / itemsPerPage)
  }, [rooms, itemsPerPage])

  const createMutation = useMutation({
    mutationFn: roomsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setIsModalOpen(false)
      addNotification('Room created successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to create room', 'error')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Room> }) =>
      roomsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setIsModalOpen(false)
      setEditingRoom(null)
      addNotification('Room updated successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to update room', 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: roomsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      addNotification('Room deleted successfully', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to delete room', 'error')
    },
  })

  const statusUpdateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RoomStatus }) =>
      roomsApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      addNotification('Room status updated', 'success')
    },
    onError: (error) => {
      addNotification(error instanceof Error ? error.message : 'Failed to update status', 'error')
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      room_number: formData.get('room_number') as string,
      room_type: formData.get('room_type') as RoomType,
      price: Number(formData.get('price')),
      status: (formData.get('status') as RoomStatus) || 'available',
    }

    if (editingRoom) {
      updateMutation.mutate({ id: editingRoom.id, updates: data })
    } else {
      createMutation.mutate(data)
    }
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">Room Management</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ['rooms', filters] })
              await queryClient.refetchQueries({ queryKey: ['rooms', filters] })
              addNotification('Rooms refreshed', 'success')
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
              Add Room
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex gap-4 items-center flex-nowrap">
          <select
            value={filters.room_type || ''}
            onChange={(e) =>
              setFilters({ ...filters, room_type: (e.target.value as RoomType) || undefined })
            }
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 min-w-[150px]"
          >
            <option value="">All Types</option>
            <option value="standard">Standard</option>
            <option value="deluxe">Deluxe</option>
            <option value="suite">Suite</option>
          </select>
          <select
            value={filters.status || ''}
            onChange={(e) =>
              setFilters({ ...filters, status: (e.target.value as RoomStatus) || undefined })
            }
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 min-w-[150px]"
          >
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="cleaning">Cleaning</option>
            <option value="maintenance">Maintenance</option>
          </select>
          {(filters.room_type || filters.status) && (
            <Button variant="outline" onClick={() => setFilters({})}>
              Clear Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Rooms Table */}
      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-600">
            Error loading rooms: {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        ) : rooms && rooms.length > 0 ? (
          <>
            <Table headers={['Room Number', 'Type', 'Price', 'Status', 'Actions']}>
              {paginatedRooms.map((room) => (
              <TableRow key={room.id}>
                <TableCell className="font-medium">{room.room_number}</TableCell>
                <TableCell className="capitalize">{room.room_type}</TableCell>
                <TableCell>₹{room.price.toFixed(2)}</TableCell>
                <TableCell>
                  {canManage ? (
                    <select
                      value={room.status}
                      onChange={(e) =>
                        statusUpdateMutation.mutate({
                          id: room.id,
                          status: e.target.value as RoomStatus,
                        })
                      }
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="available">Available</option>
                      <option value="occupied">Occupied</option>
                      <option value="cleaning">Cleaning</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  ) : (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      room.status === 'available' ? 'bg-green-100 text-green-800' :
                      room.status === 'occupied' ? 'bg-red-100 text-red-800' :
                      room.status === 'cleaning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {room.status}
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
                          setEditingRoom(room)
                          setIsModalOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this room?')) {
                            deleteMutation.mutate(room.id)
                          }
                        }}
                      >
                        Delete
                      </Button>
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
                totalItems={rooms.length}
              />
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No rooms found
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingRoom(null)
        }}
        title={editingRoom ? 'Edit Room' : 'Add Room'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Room Number
            </label>
            <input
              type="text"
              name="room_number"
              defaultValue={editingRoom?.room_number}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Room Type</label>
            <select
              name="room_type"
              defaultValue={editingRoom?.room_type}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="standard">Standard</option>
              <option value="deluxe">Deluxe</option>
              <option value="suite">Suite</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Price</label>
            <input
              type="number"
              name="price"
              step="0.01"
              defaultValue={editingRoom?.price}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              name="status"
              defaultValue={editingRoom?.status || 'available'}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="cleaning">Cleaning</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsModalOpen(false)
                setEditingRoom(null)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending || updateMutation.isPending}>
              {editingRoom ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

