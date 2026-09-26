import { Navigate, Route, Routes } from 'react-router-dom';
import Kiosk from './pages/Kiosk.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/kiosk" replace />} />
    </Routes>
  );
}
