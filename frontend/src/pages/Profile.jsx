import { useState } from 'react';
import api from '../services/api';
import { ErrorMessage, Field, ModulePage, Panel, useAction } from '../moduleUi';

export default function Profile({ user, onSave }) {
  const [nickname, setNickname] = useState(user.nickname || '');
  const [address, setAddress] = useState(user.address || '');
  const [saved, setSaved] = useState(false);
  const action = useAction();

  function submit(event) {
    event.preventDefault();
    setSaved(false);
    void action.run(async () => {
      const { data } = await api.patch('/auth/me/profile', { nickname, address });
      onSave(data);
      setNickname(data.nickname);
      setAddress(data.address || '');
      setSaved(true);
    });
  }

  return <ModulePage title="My profile">
    <Panel className="max-w-xl">
      <p className="text-sm text-gray-600">{user.email}</p>
      <ErrorMessage>{action.error}</ErrorMessage>
      {saved && <p role="status" className="text-agriGreen">Profile saved.</p>}
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nickname">
          <input name="nickname" autoComplete="nickname" maxLength="40" value={nickname}
            onChange={(event) => { setNickname(event.target.value); setSaved(false); }} required />
        </Field>
        <Field label="Saved address (optional)">
          <textarea name="address" autoComplete="street-address" maxLength="500" value={address}
            onChange={(event) => { setAddress(event.target.value); setSaved(false); }} />
        </Field>
        <p className="text-sm text-gray-600">Reuse this address when booking a soil test, posting a farm job, or listing produce.</p>
        <button className="module-button" disabled={action.busy}>Save profile</button>
      </form>
    </Panel>
  </ModulePage>;
}
