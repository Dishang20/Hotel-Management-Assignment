import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { NotificationContainer } from './components/ui/Notification'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Rooms } from './pages/Rooms'
import { Reservations } from './pages/Reservations'
import { Bills } from './pages/Bills'
import { Payment } from './pages/Payment'

function App() {
  return (
    <BrowserRouter>
      <NotificationContainer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/payment/:billId" element={<Payment />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/rooms"
          element={
            <ProtectedRoute>
              <Layout>
                <Rooms />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reservations"
          element={
            <ProtectedRoute>
              <Layout>
                <Reservations />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bills"
          element={
            <ProtectedRoute requiredRole="accounting">
              <Layout>
                <Bills />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

