import api from '../services/api';
import { ErrorMessage, ModulePage, Panel, QueryState, timeLabel, useAction, useQuery } from '../moduleUi';

export default function Notifications() {
  const query = useQuery('/platform/notifications', { items: [], unread: 0 });
  const action = useAction();
  const mark = (url) => action.run(async () => {
    await api.patch(url);
    query.refresh();
  });
  return (
    <ModulePage title="Notifications" links={query.data.unread > 0 &&
      <button className="module-button secondary" disabled={action.busy} onClick={() => mark('/platform/notifications/read')}>Mark all as read</button>}>
      <ErrorMessage>{action.error}</ErrorMessage>
      <QueryState query={query} empty={!query.data.items.length && 'You have no notifications.'} />
      {query.data.items.map((item) =>
        <Panel key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className={item.read ? '' : 'font-semibold'}>{item.message}</p>
              <p className="text-sm text-gray-600">{timeLabel(item.createdAt)}</p>
            </div>
            {!item.read && <button className="module-button secondary" disabled={action.busy}
              onClick={() => mark('/platform/notifications/' + item.id + '/read')}>Mark as read</button>}
          </div>
        </Panel>
      )}
    </ModulePage>
  );
}
