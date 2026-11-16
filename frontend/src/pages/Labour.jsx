import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { dateLabel, ErrorMessage, Field, formValues, ModulePage, Panel, QueryState, rupees, Status, toDay, today, useAction, useQuery } from '../moduleUi';

function JobDetails({ job }) {
  return <>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-lg font-bold">{job.category}</h3>
      <Status value={job.status} />
    </div>
    <p>{job.location}</p>
    <p>{dateLabel(job.startDate)} to {dateLabel(job.endDate)}</p>
    <p><strong>{rupees(job.dailyWagePaise)}</strong> per day · {job.filledSlots} of {job.workerCount} workers confirmed</p>
  </>;
}

function JobForm({ job, onSave, onCancel, busy }) {
  return <form key={job?.id || 'new'} className="space-y-3" onSubmit={(event) => {
    event.preventDefault();
    onSave(formValues(event), event.currentTarget);
  }}>
    <Field label="Job category"><input name="category" defaultValue={job?.category} required maxLength="200" /></Field>
    <Field label="Farm location"><input name="location" defaultValue={job?.location} required maxLength="500" /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Workers needed"><input name="workerCount" type="number" min="1" max="500" defaultValue={job?.workerCount} required /></Field>
      <Field label="Daily wage (₹)"><input name="dailyWage" type="number" min="0.01" step="0.01" defaultValue={job && job.dailyWagePaise / 100} required /></Field>
      <Field label="Start date"><input name="startDate" type="date" min={today()} defaultValue={toDay(job?.startDate)} required /></Field>
      <Field label="End date"><input name="endDate" type="date" min={today()} defaultValue={toDay(job?.endDate)} required /></Field>
    </div>
    <div className="flex flex-wrap gap-2">
      <button className="module-button" disabled={busy}>{job ? 'Save changes' : 'Publish job'}</button>
      {job && <button type="button" className="module-button secondary" onClick={onCancel}>Cancel edit</button>}
    </div>
  </form>;
}

export function FarmerLabour() {
  const [skill, setSkill] = useState('');
  const [editing, setEditing] = useState(null);
  const [selectedJob, setSelectedJob] = useState('');
  const jobs = useQuery('/labour/my-jobs', []);
  const directory = useQuery('/labour/directory?' + new URLSearchParams({ skill }), []);
  const action = useAction();
  const candidates = jobs.data.filter((j) => j.status === 'OPEN' && toDay(j.startDate) >= today());

  function mutate(method, path, body, after) {
    return action.run(async () => {
      await api[method](path, body);
      after?.();
      jobs.refresh();
    });
  }

  return <ModulePage title="Labour Hiring">
    <ErrorMessage>{action.error}</ErrorMessage>
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Panel title={editing ? 'Edit job' : 'Post a job'}>
        <JobForm job={editing} busy={action.busy} onCancel={() => setEditing(null)} onSave={(data, form) =>
          mutate(editing ? 'put' : 'post', '/labour/jobs' + (editing ? '/' + editing.id : ''), data, () => {
            form.reset();
            setEditing(null);
          })} />
      </Panel>
      <Panel title="Labourer directory">
        <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); setSkill(formValues(event).skill); }}>
          <div className="flex-1"><Field label="Search by skill"><input name="skill" placeholder="e.g. harvesting" /></Field></div>
          <button className="module-button secondary">Search</button>
        </form>
        <Field label="Invite to job">
          <select value={selectedJob} onChange={(event) => setSelectedJob(event.target.value)}>
            <option value="">Choose an open job</option>
            {candidates.map((job) => <option key={job.id} value={job.id}>{job.category} · {dateLabel(job.startDate)}</option>)}
          </select>
        </Field>
        <QueryState query={directory} empty={!directory.data.length && 'No available workers match this skill.'} />
        <ul className="divide-y divide-agriBorder">
          {directory.data.map((worker) => {
            const job = candidates.find(({ id }) => id === selectedJob);
            const invited = job?.workers.some((item) => item.workerId === worker.userId);
            return <li key={worker.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div><p className="font-semibold">{worker.user.email}</p>
                <p>{worker.skills.join(', ')} · {rupees(worker.dailyWagePaise)}/day</p></div>
              <button className="module-button secondary" disabled={!job || invited || action.busy}
                onClick={() => mutate('post', '/labour/jobs/' + job.id + '/invite', { workerId: worker.userId })}>{invited ? 'Invitation recorded' : 'Invite'}</button>
            </li>;
          })}
        </ul>
      </Panel>
    </div>
    <h2 className="text-xl font-bold">My jobs</h2>
    <QueryState query={jobs} empty={!jobs.data.length && 'You have no jobs yet.'} />
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {jobs.data.map((job) => {
        const canStart = ['OPEN', 'STAFFED'].includes(job.status) && job.filledSlots > 0 && toDay(job.startDate) <= today();
        const next = canStart ? ['IN_PROGRESS', 'Start work'] :
          { IN_PROGRESS: ['COMPLETED', 'Mark completed'], COMPLETED: ['PAID', 'Record off-platform payment'] }[job.status];
        return <Panel key={job.id}>
          <JobDetails job={job} />
          {job.shortfallNotified && job.status === 'OPEN' && <p className="font-semibold text-amber-900">
            {job.filledSlots ? 'You can start with the confirmed workers.' : 'Edit the dates or terms to reopen hiring.'}</p>}
          {!!job.workers.length && <ul className="space-y-1">
            {job.workers.map((worker) => <li key={worker.workerId} className="flex flex-wrap items-center gap-2">
              <span>{worker.email || 'Former account'}</span> <Status value={worker.status} />
            </li>)}
          </ul>}
          <div className="flex flex-wrap gap-2">
            {job.status === 'OPEN' && !job.filledSlots &&
              <button className="module-button secondary" onClick={() => { setEditing(job); window.scrollTo({ top: 0 }); }}>Edit job</button>}
            {next && <button className="module-button" disabled={action.busy}
              onClick={() => mutate('patch', '/labour/jobs/' + job.id + '/status', { status: next[0] })}>{next[1]}</button>}
          </div>
        </Panel>;
      })}
    </div>
  </ModulePage>;
}

export function LabourerJobs() {
  const [category, setCategory] = useState('');
  const jobs = useQuery('/labour/jobs?' + new URLSearchParams({ category }), []);
  const assignments = useQuery('/labour/assignments', []);
  const profile = useQuery('/labour/profile', null);
  const action = useAction();
  const [notice, setNotice] = useState('');

  function saveProfile(event) {
    event.preventDefault();
    const { skills, dailyRate, available } = formValues(event);
    void action.run(async () => {
      await api.put('/labour/profile', { skills: skills.split(',').map((s) => s.trim()).filter(Boolean), dailyRate, available: available === 'yes' });
      setNotice('Profile saved.');
      profile.refresh();
    });
  }

  function respond(job, status) {
    void action.run(async () => {
      await api.post('/labour/jobs/' + job.id + '/' + status);
      setNotice(status === 'accept' ? 'Job accepted.' : 'Invitation declined.');
      jobs.refresh();
      assignments.refresh();
    });
  }

  return <ModulePage title="Farm job board">
    <ErrorMessage>{action.error}</ErrorMessage>
    {notice && <p role="status" className="rounded bg-green-50 p-3 font-semibold text-green-950">{notice}</p>}
    <Panel title="Worker profile">
      <QueryState query={profile} />
      {!profile.loading && !profile.error && <form onSubmit={saveProfile} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Skills (comma-separated)"><input name="skills" defaultValue={profile.data?.skills.join(', ')} required /></Field>
        <Field label="Typical daily rate (₹)"><input name="dailyRate" type="number" step="0.01" min="0.01" defaultValue={profile.data ? profile.data.dailyWagePaise / 100 : ''} required /></Field>
        <Field label="Availability"><select name="available" defaultValue={profile.data?.available === false ? 'no' : 'yes'}>
          <option value="yes">Available for work</option><option value="no">Unavailable</option>
        </select></Field>
        <button className="module-button" disabled={action.busy}>Save profile</button>
      </form>}
    </Panel>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Open jobs</h2>
        <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); setCategory(formValues(event).category); }}>
          <div className="flex-1"><Field label="Job category"><input name="category" /></Field></div>
          <button className="module-button secondary">Search</button>
        </form>
        <QueryState query={jobs} empty={!jobs.data.length && 'No open jobs match this search.'} />
        {jobs.data.map((job) => <Panel key={job.id}>
          <JobDetails job={job} />
          {job.isOwnPosting ? <p>Your posting · <Link to="/labour" className="underline">Manage job</Link></p> :
            <button className="module-button" disabled={action.busy} onClick={() => respond(job, 'accept')}>Accept job</button>}
        </Panel>)}
      </div>
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Invitations and assignments</h2>
        <QueryState query={assignments} empty={!assignments.data.length && 'You have no invitations or assignments.'} />
        {assignments.data.map(({ job, status }) => <Panel key={job.id}>
          <JobDetails job={job} />
          <Status value={status} />
          {status === 'INVITED' && <div className="flex flex-wrap gap-2">
            <button className="module-button" disabled={action.busy || job.status !== 'OPEN' || toDay(job.startDate) < today()}
              onClick={() => respond(job, 'accept')}>Accept invitation</button>
            <button className="module-button secondary" disabled={action.busy} onClick={() => respond(job, 'decline')}>Decline</button>
          </div>}
        </Panel>)}
      </div>
    </div>
  </ModulePage>;
}
