import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

const AVAILABLE_ROLES = [
  { id: 'FARMER', label: 'Farmer' },
  { id: 'LABOURER', label: 'Labourer' },
  { id: 'VENDOR', label: 'Seller/Vendor' },
  { id: 'TEST_CENTER', label: 'Soil Testing Center' },
  { id: 'BUYER', label: 'Wholesale Buyer' }
];

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRoleToggle = (roleId) => {
    setRoles(prev => 
      prev.includes(roleId) 
        ? prev.filter(r => r !== roleId)
        : [...prev, roleId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (roles.length === 0) {
      setError('Please select at least one role.');
      return;
    }
    
    try {
      await api.post('/auth/register', { email, password, roles });
      // Auto-approve means we can just navigate to login
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-white p-8 border border-agriBorder rounded shadow-sm">
      <h2 className="text-2xl font-bold mb-6 text-center text-agriGreen">Create an Account</h2>
      {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input 
            type="email" 
            className="w-full p-2 border border-agriBorder rounded focus:outline-none focus:border-agriGreen"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input 
            type="password" 
            minLength={8}
            className="w-full p-2 border border-agriBorder rounded focus:outline-none focus:border-agriGreen"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Select Your Roles (Choose all that apply)</label>
          <div className="space-y-2">
            {AVAILABLE_ROLES.map(role => (
              <label key={role.id} className="flex items-center space-x-2 cursor-pointer bg-gray-50 p-2 border border-gray-200 rounded">
                <input 
                  type="checkbox"
                  className="w-5 h-5 text-agriGreen focus:ring-agriGreen"
                  checked={roles.includes(role.id)}
                  onChange={() => handleRoleToggle(role.id)}
                />
                <span className="text-gray-800">{role.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="w-full bg-agriGreen text-white p-3 rounded font-bold hover:bg-agriLightGreen">
          Register
        </button>
      </form>
      <div className="mt-4 text-center">
        <span className="text-gray-600">Already have an account? </span>
        <Link to="/login" className="text-agriGreen font-medium underline">Login here</Link>
      </div>
    </div>
  );
}
