import { useState } from 'react';
import api from '../services/api';
import { ErrorMessage, Field, formValues, ModulePage, Panel, QueryState, Status, timeLabel, useAction, useQuery } from '../moduleUi';

export default function FarmerSoilTest() {
  const centers = useQuery('/soil-test/centers', []);
  const bookings = useQuery('/soil-test/requests?view=farmer', []);
  const action = useAction();
  const [center, setCenter] = useState('');
  const [alternatives, setAlternatives] = useState([]);
  const [field, setField] = useState('');
  const [success, setSuccess] = useState('');
  const minPickup = new Date(Math.ceil((Date.now() + 2 * 86400000 + 19800000) / 60000) * 60000).toISOString().slice(0, 16);
  const bookingAction = (id, suffix) => '/soil-test/requests/' + id + '/' + suffix;

  function book(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(event);
    setAlternatives([]);
    setField('');
    setSuccess('');
    void action.run(async () => {
      const { data } = await api.post('/soil-test/requests', {
        ...values, centerId: center, pickupAt: values.pickupAt + ':00+05:30',
      });
      setSuccess('Booking confirmed. Your booking ID is ' + data.id + '.');
      form.reset();
      setCenter('');
      bookings.refresh();
    }, (error) => {
      setField(error.response?.data?.field || '');
      setAlternatives(error.response?.data?.alternatives || []);
    });
  }

  function download(id) {
    void action.run(async () => {
      const response = await api.get(bookingAction(id, 'report'), { responseType: 'blob' });
      const href = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'soil-report-' + id + '.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    });
  }

  return <ModulePage title="Soil Testing">
    <ErrorMessage>{!field && action.error}</ErrorMessage>
    {success && <p role="status" className="rounded bg-green-50 p-3 font-semibold text-green-900">{success}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Panel title="Book a soil test">
        <QueryState query={centers} empty={!centers.data.length && 'There are no accredited centers available yet.'} />
        {!!centers.data.length && <form onSubmit={book} className="space-y-4">
          <Field label="Accredited testing center">
            <select value={center} onChange={(event) => setCenter(event.target.value)} required>
              <option value="">Choose a center</option>
              {centers.data.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.location}</option>)}
            </select>
          </Field>
          {!!alternatives.length && <div className="flex flex-wrap items-center gap-2">
            <span>Available on this date</span>
            {alternatives.map((item) => <button className="module-button secondary" key={item.id} type="button"
              onClick={() => setCenter(item.id)}>{item.name}</button>)}
          </div>}
          <Field label="Farm address">
            <textarea name="farmAddress" required maxLength="500" aria-invalid={field === 'Farm address'} />
          </Field>
          {field === 'Farm address' && <ErrorMessage>{action.error}</ErrorMessage>}
          <Field label="Crop history">
            <textarea name="cropHistory" required maxLength="1000" aria-invalid={field === 'Crop history'} />
          </Field>
          {field === 'Crop history' && <ErrorMessage>{action.error}</ErrorMessage>}
          <Field label="Pickup slot (IST, at least 48 hours ahead)">
            <input type="datetime-local" name="pickupAt" min={minPickup} required aria-invalid={field === 'Pickup slot'} />
          </Field>
          {field === 'Pickup slot' && <ErrorMessage>{action.error}</ErrorMessage>}
          <Field label="Additional notes (optional)"><textarea name="notes" maxLength="1000" /></Field>
          <button className="module-button" disabled={action.busy}>Book test</button>
        </form>}
      </Panel>
      <div className="space-y-3">
        <h2 className="text-lg font-bold">My bookings</h2>
        <QueryState query={bookings} empty={!bookings.data.length && 'You have no soil test bookings.'} />
        {bookings.data.map((booking) => <Panel key={booking.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">{booking.center.name}</h3>
            <Status value={booking.status === 'IN_PROGRESS' ? 'IN_ANALYSIS' : booking.status} />
          </div>
          <p>{booking.center.location}</p>
          {booking.pickupAt && <p>Pickup {timeLabel(booking.pickupAt)}</p>}
          <p className="break-all text-sm text-gray-600">Booking ID {booking.id}</p>
          {['PENDING', 'BOOKING_CONFIRMED'].includes(booking.status) &&
            <button className="module-button secondary" disabled={action.busy} onClick={() =>
              action.run(async () => { await api.post(bookingAction(booking.id, 'cancel')); bookings.refresh(); })}>Cancel booking</button>}
          {booking.report && <button className="module-button" disabled={action.busy} onClick={() => download(booking.id)}>Download PDF report</button>}
        </Panel>)}
      </div>
    </div>
  </ModulePage>;
}
