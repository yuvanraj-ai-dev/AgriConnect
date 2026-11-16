import { useState } from 'react';
import api from '../services/api';
import { ErrorMessage, Field, ModulePage, Panel, QueryState, useAction, useQuery } from '../moduleUi';

const roleName = (value) => value.replaceAll('_', ' ');

function Choices({ options, name, initial }) {
  return <div className="flex flex-wrap gap-2">
    {options.map((option) => <label key={option} className="flex min-h-[42px] items-center gap-2 rounded border border-agriBorder px-2 text-sm font-medium">
      <input type="checkbox" name={name} value={option} defaultChecked={initial.includes(option)} /> {roleName(option)}
    </label>)}
  </div>;
}

export default function Admin({ user }) {
  const [after, setAfter] = useState('');
  const [previous, setPrevious] = useState([]);
  const [editing, setEditing] = useState(null);
  const [screen, setScreen] = useState('Users');
  const [notice, setNotice] = useState('');
  const users = useQuery('/admin/users?' + new URLSearchParams({ after }), { users: [], next: null });
  const roles = useQuery('/admin/roles', { builtIn: [], custom: [], assignablePermissions: [] });
  const centers = useQuery(screen === 'Accreditation' ? '/admin/centers' : null, []);
  const action = useAction();
  const assigned = [...roles.data.builtIn, ...roles.data.custom.map((role) => role.name)];

  function saveUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const data = { roles: fields.getAll('roles'), email: fields.get('email') };
    if (fields.get('password')) data.password = fields.get('password');
    void action.run(async () => {
      if (editing) await api.patch('/admin/users/' + editing.id, { ...data, active: fields.get('active') === 'on' });
      else await api.post('/admin/users', data);
      setNotice(editing ? 'User updated.' : 'User created.');
      form.reset();
      setEditing(null);
      users.refresh();
    });
  }

  function saveRole(event, name) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const permissions = fields.getAll('permissions');
    void action.run(async () => {
      if (name) await api.put('/admin/roles/' + name, { permissions });
      else await api.post('/admin/roles', { name: fields.get('name').trim().toUpperCase(), permissions });
      if (!name) form.reset();
      setNotice('Role permissions saved.');
      roles.refresh();
    });
  }

  return <ModulePage title="System administration">
    <nav aria-label="Administration" className="flex flex-wrap gap-2">
      {['Users', 'Roles', 'Accreditation'].map((tab) => <button key={tab}
        className={'module-button ' + (tab === screen ? '' : 'secondary')} aria-pressed={tab === screen}
        onClick={() => { setScreen(tab); action.setError(''); setNotice(''); }}>{tab}</button>)}
    </nav>
    <ErrorMessage>{action.error}</ErrorMessage>
    {notice && <p role="status" className="rounded bg-green-50 p-3 font-semibold text-green-950">{notice}</p>}
    {screen === 'Users' && <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel title={editing ? 'Edit ' + editing.email : 'Create a user'}>
        <QueryState query={roles} />
        {!roles.loading && !roles.error && <form key={editing?.id || 'new'} onSubmit={saveUser} className="space-y-3">
          <Field label="Email"><input type="email" name="email" defaultValue={editing?.email} required /></Field>
          <Field label={editing ? 'New password (optional)' : 'Password'}><input type="password" name="password" minLength="8" required={!editing} /></Field>
          <fieldset className="space-y-1"><legend className="font-semibold">Assigned roles</legend>
            <Choices options={assigned} name="roles" initial={editing?.roles || []} />
          </fieldset>
          {editing && <label className="flex gap-2"><input type="checkbox" name="active" defaultChecked={editing.active} /> Account active</label>}
          <div className="flex flex-wrap gap-2">
            <button className="module-button" disabled={action.busy}>{editing ? 'Save user' : 'Create user'}</button>
            {editing && <button className="module-button secondary" type="button" onClick={() => setEditing(null)}>Cancel edit</button>}
          </div>
        </form>}
      </Panel>
      <Panel title="Users">
        <QueryState query={users} empty={!users.data.users.length && 'No users found.'} />
        {users.data.users.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-agriBorder pb-2">
          <div className="min-w-0"><p className="break-all font-semibold">{item.email}{item.id === user.id ? ' (you)' : ''}</p>
            <p className="text-sm">{item.active ? 'Active' : 'Inactive'} · {item.roles.map(roleName).join(', ') || 'No assigned roles'}</p></div>
          <div className="flex gap-2">
            <button className="module-button secondary" onClick={() => { setEditing(item); window.scrollTo({ top: 0 }); }}>Edit</button>
            <button className="module-button secondary" disabled={action.busy} onClick={() => {
              if (!window.confirm('Delete the account for ' + item.email + '?')) return;
              void action.run(async () => {
                await api.delete('/admin/users/' + item.id);
                setNotice('User deleted.');
                if (editing?.id === item.id) setEditing(null);
                users.refresh();
              });
            }}>Delete</button>
          </div>
        </div>)}
        <div className="flex gap-2">
          {previous.length > 0 && <button className="module-button secondary" onClick={() => {
            setAfter(previous.at(-1)); setPrevious(previous.slice(0, -1));
          }}>Previous</button>}
          {users.data.next && <button className="module-button secondary" onClick={() => {
            setPrevious([...previous, after]); setAfter(users.data.next);
          }}>Next</button>}
        </div>
      </Panel>
    </div>}
    {screen === 'Roles' && <>
      <QueryState query={roles} />
      <Panel title="Built-in roles">
        <p>{roles.data.builtIn.map(roleName).join(' · ')}</p>
      </Panel>
      <Panel title="Create a custom role">
        <form onSubmit={(event) => saveRole(event)} className="space-y-3">
          <Field label="Role name"><input name="name" minLength="2" maxLength="30" pattern="[A-Za-z][A-Za-z0-9_]{1,29}" required /></Field>
          <fieldset className="space-y-1"><legend className="font-semibold">Module permissions</legend>
            <Choices name="permissions" options={roles.data.assignablePermissions} initial={[]} />
          </fieldset>
          <button className="module-button" disabled={action.busy}>Create role</button>
        </form>
      </Panel>
      {roles.data.custom.map((role) => <Panel key={role.name} title={roleName(role.name)}>
        <form className="space-y-3" onSubmit={(event) => saveRole(event, role.name)}>
          <fieldset className="space-y-1"><legend className="font-semibold">Module permissions</legend>
            <Choices name="permissions" options={roles.data.assignablePermissions} initial={role.permissions} />
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button className="module-button" disabled={action.busy}>Save permissions</button>
            <button type="button" className="module-button secondary" disabled={action.busy} onClick={() => {
              if (!window.confirm('Delete ' + role.name + ' and remove it from assigned users?')) return;
              void action.run(async () => { await api.delete('/admin/roles/' + role.name); roles.refresh(); users.refresh(); });
            }}>Delete role</button>
          </div>
        </form>
      </Panel>)}
    </>}
    {screen === 'Accreditation' && <>
      <QueryState query={centers} empty={!centers.data.length && 'No testing centers have registered.'} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {centers.data.map((center) => <Panel key={center.id} title={center.name}>
          <p>{center.location} · {center.dailyCapacity} pickups per day</p>
          <p>{center.agent.email} · {center.accredited ? 'Accredited' : 'Awaiting accreditation'}</p>
          <button className="module-button" disabled={action.busy} onClick={() => action.run(async () => {
            await api.patch('/admin/centers/' + center.id, { accredited: !center.accredited });
            centers.refresh();
          })}>{center.accredited ? 'Revoke accreditation' : 'Accredit center'}</button>
        </Panel>)}
      </div>
    </>}
  </ModulePage>;
}
