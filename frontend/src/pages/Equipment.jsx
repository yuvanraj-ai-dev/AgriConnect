import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { dateLabel, ErrorMessage, Field, formValues, ModulePage, Panel, QueryState, rupees, Status, timeLabel, toDay, today, useAction, useQuery } from '../moduleUi';

const dayMs = 86400000;
const monthStart = (date) => date.slice(0, 7) + '-01';

function moveMonth(first, offset) {
  const date = new Date(first);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function Availability({ machine, month, setMonth, onPick }) {
  const days = Math.round((Date.parse(moveMonth(month, 1)) - Date.parse(month)) / dayMs);
  const last = month.slice(0, 7) + '-' + days;
  const query = useQuery('/equipment/machines/' + machine.id + '/calendar?' + new URLSearchParams({ from: month, to: last }), []);
  const heading = new Date(month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <button type="button" className="module-button secondary" aria-label="Previous month" disabled={month <= monthStart(today())}
        onClick={() => setMonth(moveMonth(month, -1))}>←</button>
      <strong>{heading}</strong>
      <button type="button" className="module-button secondary" aria-label="Next month" onClick={() => setMonth(moveMonth(month, 1))}>→</button>
    </div>
    <QueryState query={query} />
    <div className="grid grid-cols-7 gap-1 text-center">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d} className="text-xs font-bold">{d}</span>)}
      {Array.from({ length: new Date(month).getUTCDay() }, (_, i) => <span key={'pad-' + i} />)}
      {Array.from({ length: days }, (_, i) => {
        const date = month.slice(0, 7) + '-' + String(i + 1).padStart(2, '0');
        const taken = query.data.some((b) => toDay(b.startDate) <= date && toDay(b.endDate) >= date);
        const disabled = taken || date < today() || query.loading || Boolean(query.error);
        return <button key={date} type="button" disabled={disabled} onClick={() => onPick(date)}
          aria-label={dateLabel(date) + (disabled ? ', unavailable' : ', open')}
          className={'min-h-[40px] rounded border text-sm ' + (disabled ? 'border-gray-200 bg-gray-100 text-gray-500' :
            'border-green-800 bg-green-50 font-semibold text-green-950 hover:bg-green-100')}>{i + 1}</button>;
      })}
    </div>
    <p className="text-sm text-gray-700">Green dates are open. Availability is checked again when you book.</p>
  </div>;
}

function Reservation({ item, children }) {
  return <Panel>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-lg font-bold">{item.machine.name}</h3>
      <Status value={item.status} />
    </div>
    <p>{dateLabel(item.startDate)} to {dateLabel(item.endDate)} · {item.machine.location}</p>
    <p>Rental fee <strong>{rupees(item.feePaise)}</strong> · Deposit {rupees(item.depositPaise)}</p>
    <p>{item.depositTerms}</p>
    {item.farmerEmail && <p>Farmer {item.farmerEmail}</p>}
    {item.confirmedAt && <details>
      <summary className="cursor-pointer font-semibold text-agriGreen">Reservation receipt</summary>
      <div className="space-y-1 rounded bg-green-50 p-3 text-sm">
        <p className="break-all">Receipt {item.id}</p>
        <p>Confirmed {timeLabel(item.confirmedAt)}</p>
        <p>{rupees(item.dailyRatePaise)} per day</p>
        {item.machine.owner?.email && <p>Owner {item.machine.owner.email}</p>}
        <p>Settle the fee and deposit directly with the owner.</p>
      </div>
    </details>}
    {children}
  </Panel>;
}

export function FarmerEquipment() {
  const [filters, setFilters] = useState({});
  const [suggestions, setSuggestions] = useState(false);
  const [selected, setSelected] = useState('');
  const [month, setMonth] = useState(monthStart(today()));
  const [dates, setDates] = useState({ startDate: '', endDate: '' });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [nextSlot, setNextSlot] = useState(null);
  const [notice, setNotice] = useState('');
  const catalog = useQuery('/equipment/catalog?' + new URLSearchParams(filters), []);
  const reservations = useQuery('/equipment/reservations/mine', []);
  const action = useAction();
  const machine = catalog.data.find((item) => item.id === selected);
  const days = (Date.parse(dates.endDate) - Date.parse(dates.startDate)) / dayMs + 1;
  const feePaise = machine && days > 0 ? days * Math.round(machine.dailyRate * 100) : 0;
  const depositPaise = machine ? Math.round(machine.securityDeposit * 100) : 0;

  function select(id) {
    setSelected(id);
    setTermsAccepted(false);
    setNextSlot(null);
    action.setError('');
  }

  function book(event) {
    event.preventDefault();
    setNotice('');
    setNextSlot(null);
    void action.run(async () => {
      const result = await api.post('/equipment/reservations', {
        machineId: machine.id, ...dates, termsAccepted, feePaise, depositPaise, depositTerms: machine.depositTerms,
      });
      setNotice(result.data.status === 'CONFIRMED' ? 'Reservation confirmed. Your receipt is under My rentals.' : 'Request sent. The dates are held for owner approval.');
      select('');
      reservations.refresh();
      catalog.refresh();
    }, (error) => setNextSlot(error.response?.data?.nextAvailable || null));
  }

  function alternatives(item) {
    const startDate = toDay(item.startDate) >= today() ? toDay(item.startDate) : today();
    const endDate = toDay(item.endDate) >= startDate ? toDay(item.endDate) : startDate;
    setFilters({ alternativeTo: item.machine.id, type: item.machine.type, startDate, endDate });
    setDates({ startDate, endDate });
    setMonth(monthStart(startDate));
    setSuggestions(true);
    select('');
    window.scrollTo({ top: 0 });
  }

  return <ModulePage title="Equipment Rental">
    {notice && <p role="status" className="rounded bg-green-50 p-3 font-semibold text-green-900">{notice}</p>}
    <ErrorMessage>{action.error}</ErrorMessage>
    <Panel title={suggestions ? 'Alternative equipment available for the requested dates' : 'Find equipment'}>
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => {
        event.preventDefault(); setFilters(formValues(event)); setSuggestions(false); select('');
      }}>
        <Field label="Machine type"><input name="type" placeholder="e.g. tractor" /></Field>
        <Field label="Location"><input name="location" /></Field>
        <Field label="Maximum daily rate (₹)"><input name="maxRate" type="number" min="0.01" step="0.01" /></Field>
        <button className="module-button">Search</button>
      </form>
    </Panel>
    <QueryState query={catalog} empty={!catalog.data.length && 'No available equipment matches this search.'} />
    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {catalog.data.map((item) => <Panel key={item.id}>
        {item.imageUrl && <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-36 w-full rounded object-contain" />}
        <h2 className="text-lg font-bold">{item.name}</h2>
        <p>{item.type} · {item.location}</p>
        <p>{item.specifications}</p>
        <p><strong>{rupees(item.dailyRate * 100)}</strong>/day · {item.instantApproval ? 'Instant approval' : 'Owner approval'}</p>
        <a href="#rental-form" className="module-button secondary" onClick={(event) => {
          event.preventDefault();
          select(item.id);
          requestAnimationFrame(() => document.getElementById('rental-form')?.scrollIntoView({ block: 'start' }));
        }}>View calendar</a>
      </Panel>)}
    </div>
    {machine && <div id="rental-form" className="scroll-mt-4">
      <Panel title={'Reserve ' + machine.name}>
        <div className="grid items-start gap-6 md:grid-cols-2">
          <Availability key={machine.id} machine={machine} month={month} setMonth={setMonth} onPick={(date) => {
            setDates(dates.startDate && !dates.endDate && date >= dates.startDate
              ? { ...dates, endDate: date } : { startDate: date, endDate: '' });
          }} />
          <form className="space-y-3" onSubmit={book}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><input type="date" required min={today()} value={dates.startDate} onChange={(event) => {
                const date = event.target.value;
                setDates({ startDate: date, endDate: dates.endDate >= date ? dates.endDate : '' });
                if (date) setMonth(monthStart(date));
              }} /></Field>
              <Field label="End date"><input type="date" required min={dates.startDate || today()} value={dates.endDate}
                onChange={(event) => setDates({ ...dates, endDate: event.target.value })} /></Field>
            </div>
            {nextSlot && <button type="button" className="module-button secondary" onClick={() => {
              setDates(nextSlot); setMonth(monthStart(nextSlot.startDate)); setNextSlot(null); action.setError('');
            }}>Use next available dates</button>}
            <p>One rental day covers a minimum of eight hours.</p>
            {feePaise > 0 && <p className="font-semibold">{days} day{days === 1 ? '' : 's'} · {rupees(feePaise)} rental fee</p>}
            <p><strong>Security deposit {rupees(depositPaise)}</strong> {machine.depositTerms}</p>
            <label className="flex gap-2"><input type="checkbox" checked={termsAccepted} required onChange={(event) => setTermsAccepted(event.target.checked)} />
              I accept the rental and deposit terms. Payment is arranged with the owner.</label>
            <button className="module-button" disabled={action.busy || !feePaise || !termsAccepted}>
              {machine.instantApproval ? 'Confirm reservation' : 'Request reservation'}
            </button>
          </form>
        </div>
      </Panel>
    </div>}
    <h2 className="text-xl font-bold">My rentals</h2>
    <QueryState query={reservations} empty={!reservations.data.length && 'You have no equipment reservations.'} />
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {reservations.data.map((item) => <Reservation key={item.id} item={item}>
        {item.status === 'REJECTED' && <button className="module-button secondary" onClick={() => alternatives(item)}>Find alternatives</button>}
      </Reservation>)}
    </div>
  </ModulePage>;
}

export function OwnerEquipment() {
  const reservations = useQuery('/equipment/reservations/owner', []);
  const fleet = useQuery('/vendor/machinery', []);
  const blocks = useQuery('/equipment/blocks', []);
  const action = useAction();

  function addBlock(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const { machine, ...dates } = formValues(event);
    void action.run(async () => {
      await api.post('/equipment/machines/' + machine + '/blocks', dates);
      form.reset();
      blocks.refresh();
    });
  }

  function update(id, status) {
    return action.run(async () => {
      await api.patch('/equipment/reservations/' + id, { status });
      reservations.refresh();
    });
  }

  return <ModulePage title="Equipment reservations" links={<Link className="module-button secondary" to="/vendor/equipment">Manage fleet</Link>}>
    <ErrorMessage>{action.error}</ErrorMessage>
    <Panel title="Block unavailable dates">
      <QueryState query={fleet} empty={!fleet.data.length && 'List equipment before blocking dates.'} />
      {!!fleet.data.length && <form onSubmit={addBlock} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Equipment"><select name="machine" required><option value="">Choose a machine</option>
          {fleet.data.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select></Field>
        <Field label="First unavailable day"><input type="date" name="startDate" min={today()} required /></Field>
        <Field label="Last unavailable day"><input type="date" name="endDate" min={today()} required /></Field>
        <button className="module-button" disabled={action.busy}>Block dates</button>
      </form>}
      <QueryState query={blocks} />
      {blocks.data.map((block) => <div key={block.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-agriBorder pt-2">
        <p>{block.machine.name} · {dateLabel(block.startDate)} to {dateLabel(block.endDate)}</p>
        <button className="module-button secondary" disabled={action.busy} onClick={() => action.run(async () => {
          await api.delete('/equipment/blocks/' + block.id);
          blocks.refresh();
        })}>Remove block</button>
      </div>)}
    </Panel>
    <h2 className="text-xl font-bold">Rental requests and bookings</h2>
    <QueryState query={reservations} empty={!reservations.data.length && 'No equipment reservations yet.'} />
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {reservations.data.map((item) => <Reservation key={item.id} item={item}>
        {item.status === 'PENDING_APPROVAL' && <div className="flex gap-2">
          <button className="module-button" disabled={action.busy || toDay(item.startDate) < today()} onClick={() => update(item.id, 'CONFIRMED')}>Approve</button>
          <button className="module-button secondary" disabled={action.busy} onClick={() => update(item.id, 'REJECTED')}>Decline</button>
        </div>}
        {item.status === 'CONFIRMED' && toDay(item.endDate) <= today() &&
          <button className="module-button" disabled={action.busy} onClick={() => update(item.id, 'COMPLETED')}>Mark returned</button>}
      </Reservation>)}
    </div>
  </ModulePage>;
}
