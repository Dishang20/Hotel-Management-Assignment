import { ReactNode, useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export const Modal = ({ isOpen, onClose, title, children, size = 'md' }: ModalProps) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-sm sm:max-w-md',
    md: 'max-w-md sm:max-w-lg',
    lg: 'max-w-lg sm:max-w-2xl',
    xl: 'max-w-2xl sm:max-w-4xl',
  }

  return (
    <>
      {/* Modal backdrop - behind sidebar */}
      <div
        className="fixed inset-0 z-[45] bg-black/70 backdrop-blur-md animate-fadeIn"
        onClick={onClose}
      />
      {/* Modal content - above sidebar */}
      <div
        className="fixed inset-0 z-[55] flex items-center justify-center p-2 sm:p-4 pointer-events-none"
      >
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-2xl w-full ${sizes[size]} max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-slideUp border border-gray-200 dark:border-gray-700 pointer-events-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full p-1 transition-all duration-200"
              aria-label="Close modal"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1">{children}</div>
        </div>
      </div>
    </>
  )
}

