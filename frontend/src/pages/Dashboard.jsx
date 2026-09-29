import { useState } from 'react';

const MODULES = {
  FARMER: [
    { id: 'ST', title: 'Soil Testing', desc: 'Book tests and view reports' },
    { id: 'MK', title: 'Marketplace', desc: 'Buy seeds, fertilizers, etc.' },
    { id: 'LB', title: 'Labour Hiring', desc: 'Post jobs and hire workers' },
    { id: 'EQ', title: 'Equipment Rental', desc: 'Rent machinery for your farm' },
    { id: 'PR', title: 'Produce Sales', desc: 'List your harvest and negotiate' },
  ],
  LABOURER: [
    { id: 'LB_WORKER', title: 'Job Board', desc: 'Find and accept farm jobs' },
  ],
  VENDOR: [
    { id: 'MK_VENDOR', title: 'My Shop', desc: 'Manage your product listings and orders' },
    { id: 'EQ_OWNER', title: 'My Equipment', desc: 'List machinery for rental' }, // Vendors can also be equipment owners
  ],
  TEST_CENTER: [
    { id: 'ST_CENTER', title: 'Test Queue', desc: 'Manage sample tests and upload reports' },
  ],
  BUYER: [
    { id: 'PR_BUYER', title: 'Produce Market', desc: 'Browse and negotiate for harvest batches' },
  ],
  ADMIN: [
    { id: 'ADMIN_PANEL', title: 'System Admin', desc: 'Manage users and platform settings' }
  ]
};

export default function Dashboard({ user }) {
  const [activeRoleView, setActiveRoleView] = useState(user.roles[0] || '');

  if (!user) return null;

  const currentModules = MODULES[activeRoleView] || [];

  return (
    <div className="max-w-6xl mx-auto mt-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-agriBorder pb-4">
        <h2 className="text-2xl font-bold text-agriText">Welcome, {user.email.split('@')[0]}</h2>
        
        {user.roles.length > 1 && (
          <div className="mt-4 md:mt-0 flex items-center space-x-3">
            <span className="text-gray-600 font-medium">Switch View:</span>
            <select 
              className="p-2 border border-agriBorder rounded bg-white text-agriText focus:outline-none focus:border-agriGreen"
              value={activeRoleView}
              onChange={(e) => setActiveRoleView(e.target.value)}
            >
              {user.roles.map(r => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-bold text-agriGreen mb-4">{activeRoleView.replace('_', ' ')} Dashboard</h3>
        
        {currentModules.length === 0 ? (
          <div className="bg-white p-6 border border-agriBorder rounded text-center text-gray-500">
            No modules available for this role yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentModules.map(mod => (
              <div key={mod.id} className="bg-white border border-agriBorder rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between">
                <div>
                  <h4 className="text-lg font-bold text-agriText mb-2">{mod.title}</h4>
                  <p className="text-gray-600 text-sm mb-4">{mod.desc}</p>
                </div>
                <button className="self-start text-agriGreen font-bold hover:underline">
                  Open Module &rarr;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
