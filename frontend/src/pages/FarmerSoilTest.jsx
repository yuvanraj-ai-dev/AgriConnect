import { useState, useEffect } from 'react';
import api from '../services/api';

export default function FarmerSoilTest({ user }) {
  const [centers, setCenters] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingNotes, setBookingNotes] = useState('');
  const [selectedCenter, setSelectedCenter] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [centersRes, requestsRes] = await Promise.all([
        api.get('/soil-test/centers'),
        api.get(`/soil-test/requests?farmerId=${user.id}`)
      ]);
      setCenters(centersRes.data);
      setRequests(requestsRes.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load soil testing data');
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (e) => {
    e.preventDefault();
    if (!selectedCenter) return alert('Please select a center');
    try {
      await api.post('/soil-test/requests', {
        centerId: selectedCenter,
        farmerId: user.id,
        notes: bookingNotes
      });
      alert('Soil test booked successfully!');
      setBookingNotes('');
      setSelectedCenter(null);
      fetchData(); // Refresh list
    } catch (err) {
      console.error(err);
      alert('Failed to book soil test');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto mt-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-agriText">Soil Testing Dashboard</h2>
        <a href="/dashboard" className="text-agriGreen hover:underline">&larr; Back to Dashboard</a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Book a Test */}
        <div className="bg-white p-6 rounded-lg border border-agriBorder shadow-sm">
          <h3 className="text-lg font-bold text-agriGreen mb-4">Book a Soil Test</h3>
          <form onSubmit={handleBook} className="space-y-4">
            <div>
              <label className="block text-gray-700 font-medium mb-2">Select Testing Center</label>
              <select 
                value={selectedCenter || ''} 
                onChange={e => setSelectedCenter(e.target.value)}
                className="w-full p-2 border border-agriBorder rounded focus:outline-none focus:border-agriGreen"
                required
              >
                <option value="" disabled>-- Choose a Center --</option>
                {centers.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.location})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-2">Additional Notes (Farm size, Crop, etc.)</label>
              <textarea 
                className="w-full p-2 border border-agriBorder rounded focus:outline-none focus:border-agriGreen"
                rows="3"
                value={bookingNotes}
                onChange={e => setBookingNotes(e.target.value)}
                placeholder="e.g. 5 acres of cotton field"
              />
            </div>
            <button type="submit" className="w-full bg-agriGreen text-white p-3 rounded font-bold hover:bg-opacity-90 transition">
              Book Test
            </button>
          </form>
        </div>

        {/* My Requests */}
        <div className="bg-white p-6 rounded-lg border border-agriBorder shadow-sm">
          <h3 className="text-lg font-bold text-agriGreen mb-4">My Test Requests</h3>
          {requests.length === 0 ? (
            <p className="text-gray-500">You haven't booked any tests yet.</p>
          ) : (
            <div className="space-y-4">
              {requests.map(req => (
                <div key={req.id} className="p-4 border border-agriBorder rounded flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-agriText">{req.center.name}</h4>
                    <p className="text-sm text-gray-600">Location: {req.center.location}</p>
                    {req.notes && <p className="text-sm text-gray-500 mt-2">Notes: {req.notes}</p>}
                    <p className="text-xs text-gray-400 mt-1">Booked on: {new Date(req.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    req.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
