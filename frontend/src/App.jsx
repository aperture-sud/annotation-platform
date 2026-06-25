import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import AnnotatePage from './pages/AnnotatePage.jsx';
import ScannerPage from './pages/ScannerPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import PictakerPage from './pages/PictakerPage.jsx';
import AnnotatorPage from './pages/AnnotatorPage.jsx';
import ManagerPage from './pages/ManagerPage.jsx';
import { useAuth } from './context/AuthContext.jsx';

function RootRedirect() {
  const { user } = useAuth();
  if (user?.role === 'annotator') return <Navigate to="/annotator" replace />;
  if (user?.role === 'manager')   return <Navigate to="/manager" replace />;
  if (user?.role === 'pictaker')  return <Navigate to="/pictaker" replace />;
  return <HomePage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />
          <Route path="/annotate/:pageName" element={<ProtectedRoute><AnnotatePage /></ProtectedRoute>} />
          <Route path="/scan" element={<ProtectedRoute><ScannerPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute>} />
          <Route path="/pictaker" element={<ProtectedRoute roles={['pictaker']}><PictakerPage /></ProtectedRoute>} />
          <Route path="/annotator" element={<ProtectedRoute roles={['annotator']}><AnnotatorPage /></ProtectedRoute>} />
          <Route path="/manager"  element={<ProtectedRoute roles={['manager', 'admin']}><ManagerPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
