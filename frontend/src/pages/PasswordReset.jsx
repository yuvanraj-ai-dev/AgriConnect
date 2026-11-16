import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import { ErrorMessage, Field, formValues, Panel, useAction } from '../moduleUi';

export function ForgotPassword() {
  const action = useAction();
  const [message, setMessage] = useState('');

  function submit(event) {
    event.preventDefault();
    const fields = formValues(event);
    setMessage('');
    void action.run(async () => {
      const { data } = await api.post('/auth/forgot-password', fields);
      setMessage(data.message);
    });
  }

  return <div className="mx-auto mt-10 max-w-md">
    <Panel title="Forgot password?">
      <ErrorMessage>{action.error}</ErrorMessage>
      {message && <p role="status">{message}</p>}
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Email"><input name="email" type="email" autoComplete="email" maxLength="254" required /></Field>
        <button className="module-button" disabled={action.busy}>Send reset link</button>
      </form>
      <Link to="/login" className="text-agriGreen underline">Back to login</Link>
    </Panel>
  </div>;
}

export function ResetPassword() {
  const { hash } = useLocation();
  const [token] = useState(() => new URLSearchParams(hash.slice(1)).get('token'));
  const [validation, setValidation] = useState('');
  const action = useAction();

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  function submit(event) {
    event.preventDefault();
    const { password, confirmation } = formValues(event);
    if (password !== confirmation) {
      setValidation('The passwords must match.');
      return;
    }
    setValidation('');
    void action.run(async () => {
      await api.post('/auth/reset-password', { token, password });
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('agri-last-activity');
      window.location.replace('/login?reset=1');
    });
  }

  return <div className="mx-auto mt-10 max-w-md">
    <Panel title="Choose a new password">
      <ErrorMessage>{validation || action.error}</ErrorMessage>
      {token ? <form className="space-y-3" onSubmit={submit}>
        <Field label="New password"><input name="password" type="password" autoComplete="new-password" minLength="8" maxLength="72" required /></Field>
        <Field label="Confirm new password"><input name="confirmation" type="password" autoComplete="new-password" required /></Field>
        <button className="module-button" disabled={action.busy}>Reset password</button>
      </form> : <p>Open the reset link from your email to choose a new password.</p>}
      <Link to="/forgot-password" className="text-agriGreen underline">Request a new link</Link>
    </Panel>
  </div>;
}
