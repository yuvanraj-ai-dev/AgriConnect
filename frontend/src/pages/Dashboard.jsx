import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, useQuery } from '../moduleUi';

const modules = {
  FARMER: [
    ['ST', 'Soil Testing', 'Bookings', '/soil-testing'],
    ['MK', 'Marketplace', 'Orders', '/marketplace'],
    ['LB', 'Labour Hiring', 'Jobs posted', '/labour'],
    ['EQ', 'Equipment Rental', 'Reservations', '/equipment'],
    ['PR', 'Produce Sales', 'Batches listed', '/produce'],
  ],
  LABOURER: [['LB_WORKER', 'Job Board', 'Accepted jobs', '/labourer/jobs']],
  VENDOR: [
    ['MK_VENDOR', 'My Shop', 'Orders placed', '/vendor/shop'],
    ['EQ_OWNER', 'My Equipment', 'Requests pending approval', '/vendor/equipment'],
  ],
  TEST_CENTER: [['ST_CENTER', 'Test Queue', 'Bookings to process', '/test-center']],
  BUYER: [['PR_BUYER', 'Produce Market', 'Purchase agreements', '/buyer/produce']],
  ADMIN: [['ADMIN_PANEL', 'System Admin', 'Active users', '/admin']],
};

export default function Dashboard({ user }) {
  const [chosen, setChosen] = useState(() => localStorage.getItem('agri-view-' + user.id));
  const role = user.roles.includes(chosen) ? chosen : user.roles[0];
  const metrics = useQuery('/platform/dashboard', {});
  return (
    <div className="mx-auto max-w-6xl space-y-5 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-agriBorder pb-5">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {user.email.split('@')[0]}</h1>
          {role && <p className="mt-1 font-semibold text-agriGreen">{role.replaceAll('_', ' ')} dashboard</p>}
        </div>
        {user.roles.length > 1 && <Field label="Switch view">
          <select value={role} onChange={(event) => {
            setChosen(event.target.value);
            localStorage.setItem('agri-view-' + user.id, event.target.value);
          }}>
            {user.roles.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
          </select>
        </Field>}
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(modules[role] || []).map(([key, title, label, href]) =>
          <Link key={key} to={href} className="module-panel block hover:border-agriGreen hover:shadow-md">
            <h2 className="text-lg font-bold text-agriGreen">{title} <span aria-hidden="true">→</span></h2>
            {metrics.data[key] !== undefined && <p><strong>{metrics.data[key]}</strong> {label.toLowerCase()}</p>}
          </Link>
        )}
      </div>
      {!role && <p>Your account has no module permissions. Contact an administrator.</p>}
    </div>
  );
}
