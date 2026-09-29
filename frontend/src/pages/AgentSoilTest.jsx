import { useState, useEffect } from 'react';
import api from '../services/api';

export default function AgentSoilTest({ user }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // In a real app, an agent might manage multiple centers or one center.
  // For simplicity, if they have no center, we'll let them register one first.
  const [myCenter, setMyCenter] = useState(null);
  const [newCenterName, setNewCenterName] = useState('');
  const [newCenterLocation, setNewCenterLocation] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch all centers and find if agent owns one
      const centersRes = await api.get('/soil-test/centers');
      const agentCenter = centersRes.data.find(c => c.agentId === user.id);
      
      if (agentCenter) {
        setMyCenter(agentCenter);
        // Fetch requests for this center
        const reqsRes = await api.get(`/soil-test/requests?centerId=${agentCenter.id}`);
        setRequests(reqsRes.data);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load center data');
    } finally {
      setLoading(false);
    }
  };

  const registerCenter = async (e) => {
    e.preventDefault();
    try {
      await api.post('/soil-test/centers', {
        name: newCenterName,
        location: newCenterLocation,
        agentId: user.id
      });
      alert('Center registered successfully!');
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Failed to register center');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/soil-test/requests/${id}/status`, { status });
      fetchData(); // refresh list
    } catch (err) {
      console.error(err);
      alert('Failed to update status');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  if (!myCenter) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-white p-6 rounded-lg border border-agriBorder shadow-sm">
        <h2 className="text-2xl font-bold text-agriGreen mb-4">Register Your Testing Center</h2>
        <p className="text-gray-600 mb-6">You need to set up a center profile before receiving test requests.</p>
        <form onSubmit={registerCenter} className="space-y-4">
          <div>
            <label className="block text-gray-700 font-medium mb-2">Center Name</label>
            <input 
              type="text" 
              value={newCenterName}
              onChange={e => setNewCenterName(e.target.value)}
              className="w-full p-2 border border-agriBorder rounded focus:outline-none focus:border-agriGreen" 
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 font-medium mb-2">Location/Address</label>
            <input 
              type="text" 
              value={newCenterLocation}
              onChange={e => setNewCenterLocation(e.target.value)}
              className="w-full p-2 border border-agriBorder rounded focus:outline-none focus:border-agriGreen" 
              required
            />
          </div>
          <button type="submit" className="w-full bg-agriGreen text-white p-3 rounded font-bold hover:bg-opacity-90 transition">
            Register Center
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-agriText">Test Center Management</h2>
          <p className="text-gray-600">{myCenter.name} - {myCenter.location}</p>
        </div>
        <a href="/dashboard" className="text-agriGreen hover:underline">&larr; Back to Dashboard</a>
      </div>

      <div className="bg-white p-6 rounded-lg border border-agriBorder shadow-sm">
        <h3 className="text-lg font-bold text-agriGreen mb-4">Incoming Requests ({requests.length})</h3>
        
        {requests.length === 0 ? (
          <p className="text-gray-500">No soil test requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-agriBorder">
                  <th className="p-3 text-sm font-semibold text-gray-700">Date</th>
                  <th className="p-3 text-sm font-semibold text-gray-700">Farmer Contact</th>
                  <th className="p-3 text-sm font-semibold text-gray-700">Notes</th>
                  <th className="p-3 text-sm font-semibold text-gray-700">Status</th>
                  <th className="p-3 text-sm font-semibold text-gray-700 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-600">{new Date(req.createdAt).toLocaleDateString()}</td>
                    <td className="p-3 text-sm font-medium text-gray-800">{req.farmer?.email || 'N/A'}</td>
                    <td className="p-3 text-sm text-gray-600 max-w-xs truncate">{req.notes || '-'}</td>
                    <td className="p-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        req.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-right space-x-2">
                      {req.status === 'PENDING' && (
                        <button onClick={() => updateStatus(req.id, 'IN_PROGRESS')} className="text-blue-600 hover:underline">
                          Mark In Progress
                        </button>
                      )}
                      {req.status === 'IN_PROGRESS' && (
                        <button onClick={() => updateStatus(req.id, 'COMPLETED')} className="text-green-600 hover:underline">
                          Mark Completed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
