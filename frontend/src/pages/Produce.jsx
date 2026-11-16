import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { dateLabel, ErrorMessage, Field, formValues, ModulePage, Panel, PhotoUpload, QueryState, rupees, Status, timeLabel, useAction, useQuery } from '../moduleUi';

function Batch({ listing, children }) {
  return <Panel>
    {listing.imageUrl && <img src={listing.imageUrl} alt={listing.crop} loading="lazy" className="h-36 w-full rounded object-contain" />}
    <h3 className="text-lg font-bold">{listing.crop} · {listing.grade}</h3>
    <p>{listing.location}{listing.harvestDate && ' · Harvested ' + dateLabel(listing.harvestDate)}</p>
    <p><strong>{listing.quantity}</strong> quintals available · {listing.minBatch} quintals minimum</p>
    <p><strong>{rupees(listing.basePricePaise)}</strong> per quintal · {listing.allowNegotiation ? 'Negotiable' : 'Fixed price'}</p>
    {children}
  </Panel>;
}

function Conversations({ view, negotiations, agreements, action, update }) {
  const role = view.toUpperCase();

  function respond(item, next, price) {
    void action.run(async () => {
      await api.post('/produce/negotiations/' + item.id + '/respond', {
        action: next, price, eventSequence: item.events.at(-1).sequence,
      });
      update();
    }, negotiations.refresh);
  }

  return <>
    <h2 className="text-xl font-bold">Negotiations</h2>
    <QueryState query={negotiations} empty={!negotiations.data.length && 'You have no negotiations.'} />
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {negotiations.data.map((item) => <Panel key={item.id}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{item.listing.crop} · {item.listing.grade}</h3>
          <Status value={item.status} />
        </div>
        <p>{item.quantity} quintals at <strong>{rupees(item.pricePaise)}</strong> per quintal</p>
        {item.status === 'NEGOTIATION_PENDING' && <p>
          {item.awaiting === role ? 'Awaiting your response' : 'Awaiting the other party'} · Expires {timeLabel(item.expiresAt)}
        </p>}
        <details>
          <summary className="cursor-pointer font-semibold text-agriGreen">Offer history</summary>
          <ol className="mt-2 space-y-2 text-sm">{item.events.map((event) => <li key={event.id}>
            <Status value={event.action} /> {rupees(event.pricePaise)} · {timeLabel(event.createdAt)}
          </li>)}</ol>
        </details>
        {item.status === 'NEGOTIATION_PENDING' && item.awaiting === role && <>
          <div className="flex flex-wrap gap-2">
            <button className="module-button" disabled={action.busy} onClick={() => respond(item, 'ACCEPT')}>Accept and confirm deal</button>
            <button className="module-button secondary" disabled={action.busy} onClick={() => respond(item, 'REJECT')}>Decline</button>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
            event.preventDefault(); respond(item, 'COUNTER', formValues(event).price);
          }}>
            <Field label="Counter price per quintal (₹)"><input name="price" type="number" min="0.01" step="0.01" required /></Field>
            <button className="module-button secondary" disabled={action.busy}>Send counter-offer</button>
          </form>
        </>}
      </Panel>)}
    </div>
    <h2 className="text-xl font-bold">Purchase agreements</h2>
    <QueryState query={agreements} empty={!agreements.data.length && 'You have no confirmed deals.'} />
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {agreements.data.map((item) => <Panel key={item.id}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{item.crop} · {item.grade}</h3>
          <Status value="DEAL_CONFIRMED" />
        </div>
        <p>{item.quantity} quintals × {rupees(item.pricePaise)} · <strong>{rupees(item.totalPaise)}</strong></p>
        <p className="break-all text-sm">Agreement {item.id}</p>
        <p>Confirmed {timeLabel(item.createdAt)}</p>
        {item.contactEmail && <p>{view === 'farmer' ? 'Buyer' : 'Farmer'} {item.contactEmail}</p>}
        <p className="text-sm text-gray-700">Arrange settlement and collection directly with the other party.</p>
      </Panel>)}
    </div>
  </>;
}

function BuyForm({ listing, buy, offer, busy }) {
  const [mode, setMode] = useState('buy');
  const [quantity, setQuantity] = useState(listing.minBatch);
  const key = useRef(null);
  return <form className="space-y-3 border-t border-agriBorder pt-3" onSubmit={(event) => {
    event.preventDefault();
    if (mode === 'offer') offer({ quantity, price: formValues(event).price });
    else {
      key.current ||= crypto.randomUUID();
      buy({ quantity, requestKey: key.current, pricePaise: listing.basePricePaise }, () => { key.current = null; });
    }
  }}>
    {listing.allowNegotiation && <Field label="Purchase option"><select value={mode} onChange={(event) => setMode(event.target.value)}>
      <option value="buy">Buy at asking price</option><option value="offer">Make an offer</option>
    </select></Field>}
    <Field label="Quantity (quintals)"><input name="quantity" type="number" min={listing.minBatch} max={listing.quantity} step="0.01"
      value={quantity} onChange={(event) => { setQuantity(event.target.value); key.current = null; }} required /></Field>
    {mode === 'offer' ? <Field label="Offer price per quintal (₹)"><input name="price" type="number" min="0.01" step="0.01" required /></Field> :
      <p className="font-semibold">Agreement total {rupees(Math.round(Number(quantity) * listing.basePricePaise))}</p>}
    <button className="module-button" disabled={busy}>{mode === 'offer' ? 'Send offer' : 'Confirm purchase'}</button>
  </form>;
}

export default function Produce({ view }) {
  const [search, setSearch] = useState('');
  const [photo, setPhoto] = useState('');
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const farmer = view === 'farmer';
  const listings = useQuery(farmer ? '/produce/mine' : '/produce/listings?' + new URLSearchParams({ search }), []);
  const negotiations = useQuery('/produce/negotiations?view=' + view, []);
  const agreements = useQuery('/produce/agreements?view=' + view, []);
  const action = useAction();

  function refresh() {
    listings.refresh();
    negotiations.refresh();
    agreements.refresh();
  }

  function publish(event) {
    event.preventDefault();
    const values = formValues(event);
    const form = event.currentTarget;
    void action.run(async () => {
      await api.post('/produce/listings', { ...values, allowNegotiation: values.allowNegotiation === 'on', imageUrl: photo });
      setNotice('Produce batch published.');
      setPhoto('');
      form.reset();
      listings.refresh();
    });
  }

  function request(listing, type, body, done) {
    void action.run(async () => {
      await api.post('/produce/listings/' + listing.id + '/' + type, body);
      setNotice(type === 'buy' ? 'Deal confirmed. View your purchase agreement below.' : 'Offer sent to the farmer.');
      done?.();
      refresh();
    }, refresh);
  }

  return <ModulePage title={farmer ? 'Produce Sales' : 'Produce Market'}>
    <ErrorMessage>{action.error}</ErrorMessage>
    {notice && <p role="status" className="rounded bg-green-50 p-3 font-semibold text-green-900">{notice}</p>}
    {farmer ? <Panel title="List a harvest batch">
      <form onSubmit={publish} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Crop or variety"><input name="crop" required maxLength="200" /></Field>
          <Field label="Grade"><input name="grade" required maxLength="200" /></Field>
          <Field label="Pickup location"><input name="location" required maxLength="500" /></Field>
          <Field label="Quantity (quintals)"><input name="quantity" type="number" min="0.01" step="0.01" required /></Field>
          <Field label="Minimum batch (quintals)"><input name="minBatch" type="number" min="0.01" step="0.01" required /></Field>
          <Field label="Asking price per quintal (₹)"><input name="basePrice" type="number" min="0.01" step="0.01" required /></Field>
          <Field label="Harvest date (optional)"><input name="harvestDate" type="date" /></Field>
          <PhotoUpload onUpload={setPhoto} onBusyChange={setUploading} />
          {photo && <img src={photo} className="h-20 w-auto rounded" alt="Batch preview" />}
        </div>
        <label className="flex gap-2"><input name="allowNegotiation" type="checkbox" /> Accept counter-offers</label>
        <button className="module-button" disabled={action.busy || uploading}>Publish batch</button>
      </form>
    </Panel> : <Panel title="Find produce">
      <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(formValues(event).keyword); }}>
        <div className="flex-1"><Field label="Crop, grade or location"><input name="keyword" /></Field></div>
        <button className="module-button">Search</button>
      </form>
    </Panel>}
    <h2 className="text-xl font-bold">{farmer ? 'My batches' : 'Available batches'}</h2>
    <QueryState query={listings} empty={!listings.data.length && (farmer ? 'You have no listed batches.' : 'No available batches match this search.')} />
    <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
      {listings.data.map((listing) => <Batch key={listing.id} listing={listing}>
        {farmer ? <Status value={listing.active ? 'PUBLISHED' : Number(listing.quantity) ? 'BELOW_MINIMUM_BATCH' : 'SOLD_OUT'} /> :
          listing.isOwnPosting ? <p>Your listing · <Link to="/produce" className="underline">View your batches</Link></p> :
            <BuyForm listing={listing} busy={action.busy}
              buy={(body, done) => request(listing, 'buy', body, done)} offer={(body) => request(listing, 'offers', body)} />}
      </Batch>)}
    </div>
    <Conversations view={view} negotiations={negotiations} agreements={agreements} action={action} update={refresh} />
  </ModulePage>;
}
