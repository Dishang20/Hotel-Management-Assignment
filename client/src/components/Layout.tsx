import { ReactNode, useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from './ui/Button'
import logoutIcon from '../assets/png/logout.png'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth < 1024) {
        setSidebarOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('[Layout] Logout error:', error)
      // Even if logout fails, navigate to login page
      navigate('/login', { replace: true })
    }
  }

  // Navigation items - accounting can see everything, frontdesk only their pages
  const navItems = [
    { 
      path: '/dashboard', 
      label: 'Dashboard', 
      icon: '📊',
      roles: ['frontdesk', 'accounting'] 
    },
    { 
      path: '/rooms', 
      label: 'Rooms', 
      icon: '🛏️',
      roles: ['frontdesk', 'accounting']
    },
    { 
      path: '/reservations', 
      label: 'Reservations', 
      icon: '📅',
      roles: ['frontdesk', 'accounting']
    },
    { 
      path: '/bills', 
      label: 'Billing', 
      icon: '💰',
      roles: ['accounting'] 
    },
  ]

  const filteredNavItems = navItems.filter((item) =>
    profile?.role ? item.roles.includes(profile.role) : false
  )

  const displayName = profile?.full_name || user?.email || 'User'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar - Fixed position, always visible */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-50 ${
          isMobile && !sidebarOpen ? '-translate-x-full' : ''
        }`}
      >
        {/* Logo/Header */}
        <div className={`h-16 flex items-center border-b border-gray-200 dark:border-gray-700 flex-shrink-0 ${
          sidebarOpen ? 'justify-between px-4' : 'justify-center px-0'
        }`}>
          {sidebarOpen && (
            <h1 className="text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">Hotel Management</h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0 flex items-center justify-center w-10 h-10 text-gray-600 dark:text-gray-300"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? (
              <svg className="w-5 h-5" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Navigation - Scrollable area */}
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto overflow-x-hidden">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => isMobile && setSidebarOpen(false)}
                className={`flex items-center gap-3 py-3 rounded-lg transition-all duration-200 ${
                  sidebarOpen ? 'px-4' : 'px-0 justify-center'
                } ${
                  isActive
                    ? 'bg-blue-600 text-white dark:bg-blue-500 shadow-md font-semibold'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={sidebarOpen ? undefined : item.label}
              >
                <span className="text-xl flex-shrink-0 flex items-center justify-center">{item.icon}</span>
                {sidebarOpen && (
                  <span className="font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Info & Logout */}
        <div className={`border-t border-gray-200 dark:border-gray-700 flex-shrink-0 ${
          sidebarOpen ? 'p-4' : 'p-2'
        }`}>
          {sidebarOpen && (
            <div className="mb-3">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">
                {displayName}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {profile?.role || 'User'}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleLogout()
              }}
              className={sidebarOpen ? 'w-full' : 'w-full flex items-center justify-center'}
            >
              {sidebarOpen ? 'Logout' : <img className="w-4 h-4" src={logoutIcon} alt="Logout" />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content - Adjusts for fixed sidebar */}
      <div 
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          isMobile ? 'w-full ml-0' : sidebarOpen ? 'ml-64' : 'ml-20'
        }`}
      >
        {/* Top Header - Sticky and visible above modals */}
        <header className="sticky top-0 z-[70] bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm h-16 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile menu button */}
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center text-gray-600 dark:text-gray-300 lg:hidden"
                aria-label="Open sidebar"
              >
                <svg className="w-5 h-5" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {filteredNavItems.find((item) => item.path === location.pathname)?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {displayName}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {profile?.role || 'User'}
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
