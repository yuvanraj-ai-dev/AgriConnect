import api from '../services/api';
import { ErrorMessage, Field, formValues, ModulePage, Panel, QueryState, Status, timeLabel, useAction, useQuery } from '../moduleUi';

export default function AgentSoilTest() {
  const center = useQuery('/soil-test/centers/mine', null);
  const bookings = useQuery('/soil-test/requests?view=center', []);
  const action = useAction();
  const bookingPath = (id) => '/soil-test/requests/' + id;

  function register(event) {
    event.preventDefault();
    const values = formValues(event);
    void action.run(async () => {
      await api.post('/soil-test/centers', values);
      center.refresh();
    });
  }

  function upload(event, id) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get('report').size > 10 * 1024 * 1024) {
      action.setError('Choose a PDF no larger than 10 MB.');
      return;
    }
    void action.run(async () => {
      await api.put(bookingPath(id) + '/report', data);
      bookings.refresh();
    });
  }

  return <ModulePage title="Soil test queue">
    <ErrorMessage>{action.error}</ErrorMessage>
    <QueryState query={center} />
    {!center.data && !center.loading && !center.error && <Panel title="Register your testing center" className="max-w-lg">
      <p>An administrator must accredit your center before farmers can book pickups.</p>
      <form className="space-y-3" onSubmit={register}>
        <Field label="Center name"><input name="name" required maxLength="200" /></Field>
        <Field label="Location"><input name="location" required maxLength="200" /></Field>
        <Field label="Daily pickup capacity"><input name="dailyCapacity" type="number" min="1" max="500" defaultValue="10" required /></Field>
        <button className="module-button" disabled={action.busy}>Register center</button>
      </form>
    </Panel>}
    {center.data && <>
      <div>
        <h2 className="text-lg font-bold">{center.data.name}</h2>
        <p>{center.data.location} · {center.data.dailyCapacity} pickups per day · {center.data.accredited ? 'Accredited' : 'Awaiting accreditation'}</p>
      </div>
      <QueryState query={bookings} empty={!bookings.data.length && 'No incoming bookings.'} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {bookings.data.map((booking) => <Panel key={booking.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">{booking.farmer?.email}</h3>
            <Status value={booking.status === 'IN_PROGRESS' ? 'IN_ANALYSIS' : booking.status} />
          </div>
          <p className="break-all text-sm text-gray-600">Booking ID {booking.id}</p>
          {booking.pickupAt && <p>Pickup {timeLabel(booking.pickupAt)}</p>}
          {booking.farmAddress && <p><strong>Farm address</strong> {booking.farmAddress}</p>}
          {booking.cropHistory && <p><strong>Crop history</strong> {booking.cropHistory}</p>}
          {booking.notes && <p><strong>Notes</strong> {booking.notes}</p>}
          {['PENDING', 'BOOKING_CONFIRMED'].includes(booking.status) &&
            <button className="module-button" disabled={action.busy} onClick={() => action.run(async () => {
              await api.patch(bookingPath(booking.id) + '/status', { status: 'IN_ANALYSIS' });
              bookings.refresh();
            })}>Mark in analysis</button>}
          {['IN_PROGRESS', 'IN_ANALYSIS'].includes(booking.status) &&
            <form onSubmit={(event) => upload(event, booking.id)} className="space-y-2">
              <Field label="Soil health report (PDF, up to 10 MB)"><input type="file" name="report" accept="application/pdf,.pdf" required /></Field>
              <button className="module-button" disabled={action.busy}>Upload and complete</button>
            </form>}
        </Panel>)}
      </div>
    </>}
  </ModulePage>;
}
