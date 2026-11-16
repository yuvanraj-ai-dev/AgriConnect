import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { ErrorMessage, Field, formValues, ModulePage, Panel, QueryState, rupees, Status, timeLabel, useAction, useQuery } from '../moduleUi';

const categories = [
  ['SEED', 'Seeds'], ['FERTILIZER', 'Fertilizer'], ['BIO_ORGANIC', 'Bio-organic nutrients'],
  ['PESTICIDE', 'Pesticides'], ['TOOL', 'Tools and implements'], ['OTHER', 'Other'],
];

let checkoutScript;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!checkoutScript) checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Checkout unavailable.'));
    script.onerror = () => reject(new Error('Checkout unavailable.'));
    document.head.append(script);
  }).catch((error) => { checkoutScript = undefined; throw error; });
  return checkoutScript;
}

function Order({ item, children, isVendor }) {
  return <Panel>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="break-all font-bold">Order {item.id}</h3>
      <Status value={item.status} />
    </div>
    <ul className="space-y-1">{item.items.map((row) =>
      <li key={row.id} className="flex justify-between gap-3"><span>{row.quantity} × {row.title}</span>
        <strong>{rupees(row.unitPaise * row.quantity)}</strong></li>)}</ul>
    <p className="text-sm text-gray-700">{isVendor ? 'Placed ' + timeLabel(item.paidAt) : 'Created ' + timeLabel(item.createdAt)}</p>
    {!isVendor && <p className="font-semibold">Total {rupees(item.subtotalPaise + item.taxPaise)}</p>}
    {item.status === 'PENDING_PAYMENT' && <p className="text-sm text-gray-700">Stock held until {timeLabel(item.expiresAt)}</p>}
    {children}
  </Panel>;
}

export function VendorOrders() {
  const orders = useQuery('/market/vendor-orders', []);
  return <ModulePage title="Shop orders" links={<Link className="module-button secondary" to="/vendor/shop">Manage products</Link>}>
    <QueryState query={orders} empty={!orders.data.length && 'No marketplace orders yet.'} />
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {orders.data.map((item) => <Order key={item.id} item={item} isVendor />)}
    </div>
  </ModulePage>;
}

export default function Marketplace() {
  const [screen, setScreen] = useState('Catalog');
  const [filters, setFilters] = useState({});
  const [after, setAfter] = useState('');
  const [notice, setNotice] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const requestKey = useRef(null);
  const catalog = useQuery('/market/products?' + new URLSearchParams({ ...filters, after }), { products: [], next: null });
  const cart = useQuery('/market/cart', { items: [], subtotalPaise: 0, taxPaise: 0, totalPaise: 0 });
  const orders = useQuery(screen === 'Orders' ? '/market/orders' : null, []);
  const action = useAction();
  const pesticides = cart.data.items.filter((item) => item.requiresAcknowledgment);

  function show(next) {
    setScreen(next);
    setNotice('');
    action.setError('');
  }

  async function openPayment(result) {
    const { order, payment, gatewayError } = result;
    cart.refresh();
    catalog.refresh();
    setScreen('Orders');
    orders.refresh();
    requestKey.current = null;
    if (gatewayError) { action.setError(gatewayError); return; }
    if (!payment) {
      setNotice(order.status === 'ORDER_PLACED' ? 'Order placed.' : 'Order status updated.');
      return;
    }
    let Razorpay;
    try { Razorpay = await loadCheckout(); } catch {
      action.setError('Could not load Razorpay. Resume the payment from Orders.');
      return;
    }
    setPayOpen(true);
    try {
      const widget = new Razorpay({
        ...payment, name: 'AgriConnect', description: 'Marketplace test order',
        timeout: Math.max(1, Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000)),
        modal: { ondismiss: () => {
          setPayOpen(false);
          setNotice('Payment is pending. Resume it from Orders while the stock hold is active.');
          orders.refresh();
        } },
        handler: async (response) => {
          try {
            const { data } = await api.post('/market/orders/' + order.id + '/verify', response);
            setNotice(data.status === 'ORDER_PLACED' ? 'Order placed.' : 'Payment received by Razorpay. Refresh for the latest order status.');
          } catch (error) {
            action.setError(error.response?.data?.message || 'Payment confirmation is pending. Refresh orders for the latest status.');
          } finally {
            setPayOpen(false);
            orders.refresh();
            cart.refresh();
            catalog.refresh();
          }
        },
      });
      widget.open();
    } catch {
      setPayOpen(false);
      action.setError('Checkout could not open. Resume payment from Orders.');
    }
  }

  function changeQuantity(productId, quantity) {
    void action.run(async () => {
      const { data } = await api.put('/market/cart/' + productId, { quantity: Number(quantity) });
      cart.setData(data);
      setAcknowledged(false);
      requestKey.current = null;
      setNotice('Cart updated.');
    }, () => { cart.refresh(); catalog.refresh(); });
  }

  function confirm() {
    return action.run(async () => {
      requestKey.current ||= crypto.randomUUID();
      const { data } = await api.post('/market/checkout', {
        requestKey: requestKey.current, acknowledged, totalPaise: cart.data.totalPaise,
      });
      await openPayment(data);
    }, () => { cart.refresh(); catalog.refresh(); });
  }

  return <ModulePage title="Marketplace">
    <nav aria-label="Marketplace" className="flex flex-wrap gap-2">
      {['Catalog', 'Cart', 'Orders'].map((name) => <button key={name}
        className={'module-button ' + (screen === name ? '' : 'secondary')} aria-pressed={screen === name}
        onClick={() => show(name)}>{name}{name === 'Cart' ? ' (' + cart.data.items.length + ')' : ''}</button>)}
    </nav>
    <ErrorMessage>{action.error}</ErrorMessage>
    {notice && <p role="status" className="rounded-md bg-green-50 p-3 font-semibold text-green-900">{notice}</p>}
    {screen === 'Catalog' && <>
      <Panel>
        <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => { event.preventDefault(); setFilters(formValues(event)); setAfter(''); }}>
          <Field label="Search products"><input name="search" placeholder="Name or keyword" /></Field>
          <Field label="Category"><select name="category"><option value="">All categories</option>
            {categories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          <Field label="Brand"><input name="brand" /></Field>
          <button className="module-button">Search</button>
        </form>
      </Panel>
      <QueryState query={catalog} empty={!catalog.data.products.length && 'No products match your filters.'} />
      <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
        {catalog.data.products.map((product) => {
          const inCart = cart.data.items.find((item) => item.productId === product.id)?.quantity || 0;
          return <Panel key={product.id}>
            {product.imageUrl && <img className="h-36 w-full rounded object-contain" src={product.imageUrl} alt={product.title} loading="lazy" />}
            <h2 className="text-lg font-bold">{product.title}</h2>
            <p className="text-sm text-gray-700">{[product.brand, categories.find(([key]) => key === product.category)?.[1]].filter(Boolean).join(' · ')}</p>
            <p>{product.description}</p>
            <p><strong>{rupees(product.price * 100)}</strong> per {product.unit} · {product.stockQuantity} available</p>
            {product.category === 'PESTICIDE' &&
              <p className="rounded bg-amber-100 p-2 text-sm text-amber-950">{product.safetyWarning || 'Follow the directions and precautions on the product label.'}</p>}
            <button className="module-button" disabled={action.busy || inCart >= product.stockQuantity || Boolean(cart.data.pendingOrderId)}
              onClick={() => changeQuantity(product.id, inCart + 1)}>{inCart ? 'Add one more (' + inCart + ' in cart)' : 'Add to cart'}</button>
          </Panel>;
        })}
      </div>
      <div className="flex gap-3">
        {after && <button className="module-button secondary" onClick={() => setAfter('')}>First page</button>}
        {catalog.data.next && <button className="module-button secondary" onClick={() => setAfter(catalog.data.next)}>Next page</button>}
      </div>
    </>}
    {screen === 'Cart' && <>
      <QueryState query={cart} empty={!cart.data.items.length && 'Your cart is empty.'} />
      {cart.data.pendingOrderId && <button className="module-button secondary" onClick={() => show('Orders')}>View pending order</button>}
      {!!cart.data.items.length && <Panel title="Review your order">
        {cart.data.items.map((item) => <form key={item.productId + ':' + item.quantity}
          className="flex flex-wrap items-end gap-3 border-b border-agriBorder pb-3"
          onSubmit={(event) => { event.preventDefault(); changeQuantity(item.productId, formValues(event).quantity); }}>
          <div className="mr-auto"><h3 className="font-semibold">{item.title}</h3>
            <p>{rupees(item.unitPaise)} per {item.unit}{!cart.data.pendingOrderId && ' · ' + item.available + ' available'}</p></div>
          <Field label="Quantity"><input className="max-w-[7rem]" name="quantity" type="number" min="1"
            defaultValue={item.quantity} max={item.available} required disabled={Boolean(cart.data.pendingOrderId)} /></Field>
          <button className="module-button secondary" disabled={action.busy || Boolean(cart.data.pendingOrderId)}>Update</button>
          <button type="button" className="module-button secondary" disabled={action.busy || Boolean(cart.data.pendingOrderId)}
            onClick={() => changeQuantity(item.productId, 0)}>Remove</button>
        </form>)}
        <p>Subtotal {rupees(cart.data.subtotalPaise)} · Tax {rupees(cart.data.taxPaise)}</p>
        <p className="text-lg font-bold">Total {rupees(cart.data.totalPaise)}</p>
        {!!pesticides.length && <div className="space-y-2 rounded bg-amber-100 p-3 text-amber-950">
          {pesticides.map((item) => <p key={item.productId}><strong>{item.title}</strong> {item.safetyWarning || 'Read the product label and follow its safety instructions.'}</p>)}
          <label className="flex gap-2 font-semibold"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            I have read the pesticide safety warnings.</label>
        </div>}
        <button className="module-button" onClick={confirm}
          disabled={action.busy || payOpen || Boolean(cart.data.pendingOrderId) || (pesticides.length > 0 && !acknowledged)}>
          {cart.data.totalPaise > 0 ? 'Confirm and open test checkout' : 'Confirm order'}
        </button>
      </Panel>}
    </>}
    {screen === 'Orders' && <>
      <button className="module-button secondary" onClick={() => { orders.refresh(); cart.refresh(); }}>Refresh orders</button>
      <QueryState query={orders} empty={!orders.data.length && 'You have no marketplace orders.'} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {orders.data.map((item) => <Order key={item.id} item={item}>
          {item.status === 'PENDING_PAYMENT' && <button className="module-button" disabled={action.busy || payOpen}
            onClick={() => action.run(async () => {
              const { data } = await api.post('/market/orders/' + item.id + '/pay');
              await openPayment(data);
            }, orders.refresh)}>Resume test payment</button>}
        </Order>)}
      </div>
    </>}
  </ModulePage>;
}
