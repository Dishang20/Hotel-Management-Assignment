import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export const NotFound = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center max-w-md w-full">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-blue-600 dark:text-blue-400 mb-4">404</h1>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Page Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate('/dashboard')}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

