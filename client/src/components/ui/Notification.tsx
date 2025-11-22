import { useUIStore } from '@/store/uiStore'

export const NotificationContainer = () => {
  const { notifications, removeNotification } = useUIStore()

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`min-w-[300px] p-4 rounded-lg shadow-2xl animate-slideInRight ${
            notification.type === 'success'
              ? 'bg-green-500 text-white'
              : notification.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-blue-500 text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <p>{notification.message}</p>
            <button
              onClick={() => removeNotification(notification.id)}
              className="ml-4 text-white hover:text-gray-200"
            >
              <svg className="w-5 h-5" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

