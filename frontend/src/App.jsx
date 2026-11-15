import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import FarmerSoilTest from './pages/FarmerSoilTest';
import AgentSoilTest from './pages/AgentSoilTest';
import VendorShop from './pages/VendorShop';
import { useEffect, useState } from 'react';
import api from './services/api';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me')
        .then(res => {
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
        })
        .catch(() => {
          setUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return <div className="p-8 text-center text-lg">Loading...</div>;

  return (
    <Router>
      <div className="min-h-screen bg-agriBg text-agriText">
        <nav className="bg-agriGreen text-white p-4 shadow-md flex justify-between items-center">
          <h1 className="text-xl font-bold">AgriConnect</h1>
          <div>
            {user ? (
              <button 
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  window.location.href = '/login';
                }}
                className="bg-white text-agriGreen px-4 py-2 rounded font-medium"
              >
                Logout
              </button>
            ) : null}
          </div>
        </nav>
        
        <main className="container mx-auto p-4">
          <Routes>
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
            <Route path="/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
            <Route path="/soil-testing" element={user ? <FarmerSoilTest user={user} /> : <Navigate to="/login" />} />
            <Route path="/test-center" element={user ? <AgentSoilTest user={user} /> : <Navigate to="/login" />} />
            <Route path="/vendor/shop" element={user ? <VendorShop user={user} /> : <Navigate to="/login" />} />
            <Route path="/vendor/equipment" element={user ? <VendorShop user={user} initialTab="machinery" /> : <Navigate to="/login" />} />
            <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
