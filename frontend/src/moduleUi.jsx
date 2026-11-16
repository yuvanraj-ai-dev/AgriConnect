import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from './services/api';

export const errorText = (error) => error.response?.data?.message || error.response?.data?.error || 'The request failed. Try again.';
export const rupees = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
export const dateLabel = (value) => value ? new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) : '';
export const timeLabel = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '';
export const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
export const toDay = (value) => value?.slice(0, 10) || '';
export const formValues = (event) => Object.fromEntries(new FormData(event.currentTarget));

const statusLabels = {
  PENDING: 'Booking Confirmed', IN_PROGRESS: 'In Progress', STAFFED: 'Fully Staffed',
  LATE_PAYMENT: 'Late Payment · Contact Admin',
};

export function Status({ value }) {
  return <span className="module-status">{statusLabels[value] || value?.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>;
}

export function ModulePage({ title, links, children }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 py-4">
      <div className="space-y-3 border-b border-agriBorder pb-4">
        <Link to="/dashboard" className="font-semibold text-agriGreen hover:underline">← Dashboard</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {links && <div className="flex flex-wrap items-center gap-3">{links}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, children, className = '' }) {
  return (
    <section className={'module-panel ' + className}>
      {title && <h2 className="text-lg font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, children }) {
  return <label className="module-field"><span>{label}</span>{children}</label>;
}

export function ErrorMessage({ children }) {
  return children ? <p role="alert" className="rounded-md bg-red-50 p-3 font-medium text-red-900">{children}</p> : null;
}

export function QueryState({ query, empty }) {
  if (query.error) return <ErrorMessage>{query.error}</ErrorMessage>;
  if (query.loading) return <p role="status">Loading…</p>;
  return empty ? <p className="text-gray-600">{empty}</p> : null;
}

export function useQuery(path, initial) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api.get(path, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setData(result.data);
    }).catch((error) => {
      if (!controller.signal.aborted) setError(errorText(error));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [path, revision]);
  return { data, setData, loading, error, refresh: () => setRevision((version) => version + 1) };
}

export function useAction() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  async function run(action, onError) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError('');
    try {
      return await action();
    } catch (error) {
      setError(errorText(error));
      onError?.(error);
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}

export function PhotoUpload({ onUpload, onBusyChange }) {
  const action = useAction();
  return <div className="space-y-1">
    <Field label="Upload photo (optional)">
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={action.busy}
        onChange={(event) => {
          const file = event.target.files[0];
          if (!file) return;
          const data = new FormData();
          data.append('image', file);
          onBusyChange?.(true);
          void action.run(async () => {
            const result = await api.post('/media/images', data);
            onUpload(result.data.url);
          }).finally(() => onBusyChange?.(false));
          event.target.value = '';
        }} />
    </Field>
    {action.busy && <p role="status">Uploading photo…</p>}
    <ErrorMessage>{action.error}</ErrorMessage>
  </div>;
}
