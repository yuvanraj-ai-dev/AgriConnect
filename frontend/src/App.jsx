import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Login from './pages/Login';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import FarmerSoilTest from './pages/FarmerSoilTest';
import AgentSoilTest from './pages/AgentSoilTest';
import VendorShop from './pages/VendorShop';
import Marketplace, { VendorOrders } from './pages/Marketplace';
import { FarmerLabour, LabourerJobs } from './pages/Labour';
import { FarmerEquipment, OwnerEquipment } from './pages/Equipment';
import Produce from './pages/Produce';
import Notifications from './pages/Notifications';
import Admin from './pages/Admin';
import { ErrorMessage } from './moduleUi';
import api from './services/api';

const idleLimit = 60 * 60 * 1000;
const lastActivityKey = 'agri-last-activity';

function clearSession(target) {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem(lastActivityKey);
  window.location.replace(target);
}

function Home() {
  return <section className="mx-auto max-w-xl space-y-4 py-12">
    <h1 className="text-3xl font-bold sm:text-4xl">AgriConnect</h1>
    <p className="text-lg">Book soil tests, hire farm workers, rent equipment, and trade farm supplies and produce.</p>
    <div className="flex flex-wrap gap-3">
      <Link className="module-button" to="/login">Sign in</Link>
      <Link className="module-button secondary" to="/register">Create an account</Link>
    </div>
  </section>;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    const controller = new AbortController();
    api.get('/auth/me', { signal: controller.signal }).then(({ data }) => {
      setUser(data);
      localStorage.setItem(lastActivityKey, String(Date.now()));
    }).catch((error) => {
      if (!controller.signal.aborted && error.response?.status !== 401) {
        setError('Could not load your session. Refresh the page to try again.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!user) return;
    let pending = false;
    const lastActive = () => Number(localStorage.getItem(lastActivityKey) || 0);
    const updateTime = () => localStorage.setItem(lastActivityKey, String(Date.now()));
    function checkIdle() {
      if (!localStorage.getItem('token')) { window.location.replace('/'); return true; }
      if (Date.now() - lastActive() >= idleLimit) { clearSession('/login?expired=1'); return true; }
      return false;
    }
    function activity() {
      if (checkIdle() || pending || Date.now() - lastActive() < 5 * 60 * 1000) return;
      pending = true;
      api.get('/auth/me').then(({ data }) => setUser(data)).catch(() => {}).finally(() => { pending = false; });
    }
    const interval = setInterval(checkIdle, 1000);
    const interactions = ['pointerdown', 'keydown', 'scroll', 'focus'];
    interactions.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener('agri-session-active', updateTime);
    return () => {
      clearInterval(interval);
      interactions.forEach((event) => window.removeEventListener(event, activity));
      window.removeEventListener('agri-session-active', updateTime);
    };
  }, [user?.id]);

  async function logout() {
    setLoggingOut(true);
    setError('');
    try {
      await api.post('/auth/logout');
      clearSession('/');
    } catch (error) {
      if (error.response?.status !== 401) setError('Could not sign out. Check your connection and try again.');
      setLoggingOut(false);
    }
  }

  function protectedPage(page, role) {
    if (!user) return <Navigate to="/login" replace />;
    if (role && !user.roles.includes(role)) return <Navigate to="/dashboard" replace />;
    return page;
  }

  if (loading) return <p role="status" className="p-8 text-center">Loading AgriConnect…</p>;

  return <BrowserRouter>
    <div className="min-h-screen bg-agriBg text-agriText">
      <header className="bg-green-900 text-white shadow-sm">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3" aria-label="Main navigation">
          <Link to={user ? '/dashboard' : '/'} className="text-xl font-bold">AgriConnect</Link>
          {user && <div className="flex flex-wrap items-center gap-3">
            <Link to="/notifications" className="py-2 font-semibold hover:underline">Notifications</Link>
            <button className="module-button secondary" disabled={loggingOut} onClick={logout}>Sign out</button>
          </div>}
        </nav>
      </header>
      <main className="container mx-auto px-4 py-2">
        <ErrorMessage>{error}</ErrorMessage>
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Home />} />
          <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
          <Route path="/dashboard" element={protectedPage(user && <Dashboard user={user} />)} />
          <Route path="/notifications" element={protectedPage(<Notifications />)} />
          <Route path="/soil-testing" element={protectedPage(<FarmerSoilTest />, 'FARMER')} />
          <Route path="/test-center" element={protectedPage(<AgentSoilTest />, 'TEST_CENTER')} />
          <Route path="/vendor/shop" element={protectedPage(<VendorShop key="products" user={user} />, 'VENDOR')} />
          <Route path="/vendor/equipment" element={protectedPage(<VendorShop key="machinery" user={user} initialTab="machinery" />, 'VENDOR')} />
          <Route path="/vendor/orders" element={protectedPage(<VendorOrders />, 'VENDOR')} />
          <Route path="/vendor/reservations" element={protectedPage(<OwnerEquipment />, 'VENDOR')} />
          <Route path="/marketplace" element={protectedPage(<Marketplace />, 'FARMER')} />
          <Route path="/labour" element={protectedPage(<FarmerLabour />, 'FARMER')} />
          <Route path="/labourer/jobs" element={protectedPage(<LabourerJobs />, 'LABOURER')} />
          <Route path="/equipment" element={protectedPage(<FarmerEquipment />, 'FARMER')} />
          <Route path="/produce" element={protectedPage(<Produce key="farmer" view="farmer" />, 'FARMER')} />
          <Route path="/buyer/produce" element={protectedPage(<Produce key="buyer" view="buyer" />, 'BUYER')} />
          <Route path="/admin" element={protectedPage(<Admin user={user} />, 'ADMIN')} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  </BrowserRouter>;
}

export default App;
