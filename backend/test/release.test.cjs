const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { EventEmitter, once } = require('node:events');

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database with the release schema.');
const database = new URL(process.env.TEST_DATABASE_URL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !/test|agri_release/i.test(database.pathname)) {
  throw new Error('Release tests require a dedicated local test database.');
}
process.env.DATABASE_URL = database.href;
process.env.JWT_SECRET = 'release-suite-local-signing-key';
process.env.RAZORPAY_KEY_ID = 'rzp_test_release_suite';
process.env.RAZORPAY_KEY_SECRET = 'fake-checkout-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'fake-webhook-secret';
process.env.MARKETPLACE_TAX_PERCENT = '0';
process.env.NODE_ENV = 'test';
delete process.env.CLOUDINARY_URL;
require('dotenv').config = () => {};

const app = require('../src/index');
const { db } = require('../src/db');
const { DAY, indiaDay } = require('../src/http');
const { expireOrders } = require('../src/marketplace');
const { notifyShortfalls } = require('../src/routes/labourRoutes');
const { expireNegotiations } = require('../src/routes/produceRoutes');
const mailer = require('../src/mailer');

const runId = randomUUID();
const originalFetch = globalThis.fetch;
let origin, server, reportDir;
const users = new Map();

function date(days) {
  return new Date(indiaDay().getTime() + DAY * days).toISOString().slice(0, 10);
}

function signature(value, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

async function request(path, opts = {}) {
  const { as, body, raw, headers, method = 'GET', expected = 200, binary = false } = opts;
  const result = await originalFetch(origin + '/api' + path, {
    method,
    headers: {
      ...(as ? { Authorization: 'Bearer ' + (users.get(as)?.token || as) } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : raw,
  });
  if (binary && result.ok) return Buffer.from(await result.arrayBuffer());
  const type = result.headers.get('Content-Type') || '';
  const data = type.includes('application/json') ? await result.json() : await result.text();
  if (expected != null) assert.equal(result.status, expected, method + ' ' + path + ' returned ' + JSON.stringify(data));
  return expected == null ? { status: result.status, data } : data;
}

const post = (path, as, body, expected = 201) => request(path, { method: 'POST', as, body, expected });
const put = (path, as, body, expected = 200) => request(path, { method: 'PUT', as, body, expected });
const patch = (path, as, body, expected = 200) => request(path, { method: 'PATCH', as, body, expected });
const get = (path, as, expected = 200) => request(path, { as, expected });

async function person(name, roles) {
  const email = name + '-' + runId + '@example.test';
  const body = { email, password: 'long-enough-test-password' };
  const { userId } = await post('/auth/register', null, { ...body, roles });
  const { token } = await post('/auth/login', null, body, 200);
  users.set(name, { ...body, id: userId, token });
  return users.get(name);
}

before(async () => {
  reportDir = await mkdtemp(join(tmpdir(), 'agri-soil-test-'));
  process.env.SOIL_REPORT_DIRECTORY = reportDir;
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  origin = 'http://127.0.0.1:' + server.address().port;
  await Promise.all([
    person('farmer', ['FARMER']), person('neighbor', ['FARMER']), person('lab', ['TEST_CENTER']),
    person('lab2', ['TEST_CENTER']), person('worker', ['LABOURER']), person('worker2', ['LABOURER']),
    person('vendor', ['VENDOR']), person('buyer', ['BUYER']), person('buyer2', ['BUYER']),
  ]);
});

after(async () => {
  await db.$disconnect();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (reportDir) await rm(reportDir, { recursive: true, force: true });
});

test('release workflows on PostgreSQL', async (suite) => {
  await suite.test('session revocation, idle expiry and admin-controlled permissions', async () => {
    await post('/auth/register', null, { email: 'forbidden-' + runId + '@example.test', password: 'long-test-password', roles: ['ADMIN'] }, 400);
    const admin = await person('admin', ['FARMER']);
    await db.user.update({ where: { id: admin.id }, data: { roles: ['ADMIN'] } });
    await get('/admin/users', 'farmer', 403);
    assert.ok(await db.auditLog.findFirst({ where: { userId: users.get('farmer').id, event: { startsWith: 'ACCESS_DENIED' } } }));
    const role = 'FIELD_' + runId.replaceAll('-', '').slice(0, 12).toUpperCase();
    const account = await person('role-check', ['FARMER']);
    await post('/admin/roles', 'admin', { name: role, permissions: ['LABOURER'] });
    await patch('/admin/users/' + account.id, 'admin', { roles: [role] });
    assert.deepEqual((await get('/auth/me', 'role-check')).roles, ['LABOURER']);
    await put('/admin/roles/' + role, 'admin', { permissions: ['BUYER'] });
    await get('/labour/profile', 'role-check', 403);
    assert.deepEqual((await get('/auth/me', 'role-check')).roles, ['BUYER']);
    await request('/admin/roles/' + role, { method: 'DELETE', as: 'admin', expected: 204 });
    assert.deepEqual((await get('/auth/me', 'role-check')).roles, []);
    await post('/auth/logout', 'role-check', null, 204);
    assert.equal((await get('/auth/me', 'role-check', 401)).code, 'SESSION_EXPIRED');
    const next = await post('/auth/login', null, { email: account.email, password: account.password }, 200);
    await db.session.updateMany({ where: { userId: account.id }, data: { lastActiveAt: new Date(Date.now() - 61 * 60000) } });
    assert.equal((await get('/auth/me', next.token, 401)).code, 'SESSION_EXPIRED');
  });

  await suite.test('profile details are optional at signup and only editable by their owner', async () => {
    const account = await person('profile-farmer', ['FARMER']);
    const path = '/auth/me/profile';
    const address = 'Sample Farm\nWarangal';
    assert.equal((await get('/auth/me', 'profile-farmer')).address, null);
    await patch(path, null, { nickname: 'Guest', address }, 401);
    await patch(path, 'profile-farmer', { nickname: ' ', address }, 400);
    await patch(path, 'profile-farmer', { nickname: 'Farmer', address: 'a'.repeat(501) }, 400);
    assert.deepEqual(await patch(path, 'profile-farmer', {
      nickname: ' Farmer ', address: ' ' + address + ' ', roles: ['ADMIN'], userId: users.get('neighbor').id,
    }), { nickname: 'Farmer', address });
    assert.equal((await get('/auth/me', 'profile-farmer')).address, address);
    assert.equal((await get('/auth/me', 'neighbor')).address, null);
    assert.deepEqual((await get('/auth/me', 'profile-farmer')).roles, ['FARMER']);
    assert.equal((await post('/auth/login', null, { email: account.email, password: account.password }, 200)).user.nickname, 'Farmer');
    assert.equal((await patch(path, 'profile-farmer', { nickname: 'Farmer', address: '' })).address, null);
  });

  await suite.test('password reset emails are scoped to the sandbox demo and links are single use', async (context) => {
    const demo = { email: 'reset-' + runId + '@example.com', password: 'original-test-password' };
    const environment = {
      SMTP_HOST: 'sandbox.smtp.mailtrap.io', SMTP_FROM: 'agriconnect@example.com',
      PASSWORD_RESET_ORIGIN: 'https://agriconnect.example.com', PASSWORD_RESET_SANDBOX_EMAIL: demo.email,
    };
    const prior = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
    Object.assign(process.env, environment);
    context.after(() => {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    const outbox = new EventEmitter();
    const delivery = context.mock.method(mailer, 'sendMail', async (message) => outbox.emit('mail', message));
    const { userId } = await post('/auth/register', null, { ...demo, roles: ['BUYER'] });
    const session = await post('/auth/login', null, demo, 200);
    assert.equal((await get('/platform/notifications', session.token)).emailMode, 'sandbox');

    const sent = once(outbox, 'mail', { signal: AbortSignal.timeout(5000) });
    const requested = await post('/auth/forgot-password', null, { email: demo.email }, 202);
    assert.deepEqual(await post('/auth/forgot-password', null, { email: 'missing@example.com' }, 202), requested);
    assert.deepEqual(await post('/auth/forgot-password', null, { email: users.get('admin').email }, 202), requested);
    const [message] = await sent;
    assert.equal(message.to, demo.email);
    const link = new URL(message.text.match(/^https:\/\/[^\s]+/m)[0]);
    assert.equal(link.origin, environment.PASSWORD_RESET_ORIGIN);
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    const saved = await db.passwordReset.findUnique({ where: { userId } });
    assert.notEqual(saved.tokenHash, token);
    for (let i = 0; i < 2; i++) await post('/auth/forgot-password', null, { email: demo.email }, 202);

    const password = 'replacement-test-password';
    const resets = await Promise.all([0, 1].map(() => post('/auth/reset-password', null, { token, password }, null)));
    assert.deepEqual(resets.map(({ status }) => status).sort(), [204, 400]);
    await get('/auth/me', session.token, 401);
    await post('/auth/login', null, demo, 401);
    assert.ok((await post('/auth/login', null, { email: demo.email, password }, 200)).token);
    assert.equal(delivery.mock.callCount(), 1);
  });

  await suite.test('soil capacity, ownership, cancellation and private PDF delivery', async () => {
    const center = await post('/soil-test/centers', 'lab', { name: 'Soil lab', location: 'Erode', dailyCapacity: 1 });
    const alternative = await post('/soil-test/centers', 'lab2', { name: 'Backup lab', location: 'Salem', dailyCapacity: 1 });
    for (const lab of [center, alternative]) await patch('/admin/centers/' + lab.id, 'admin', { accredited: true });
    const values = { centerId: center.id, farmAddress: 'Field Road', cropHistory: 'Rice', pickupAt: date(3) + 'T12:00:00+05:30' };
    await post('/soil-test/requests', 'farmer', { ...values, farmAddress: '' }, 400);
    await post('/soil-test/requests', 'farmer', { ...values, pickupAt: new Date(Date.now() + DAY).toISOString() }, 400);
    const first = await post('/soil-test/requests', 'farmer', values);
    assert.equal(first.status, 'BOOKING_CONFIRMED');
    const full = await post('/soil-test/requests', 'neighbor', values, 409);
    assert.ok(full.alternatives.some((item) => item.id === alternative.id));
    await post('/soil-test/requests/' + first.id + '/cancel', 'neighbor', null, 404);
    await post('/soil-test/requests/' + first.id + '/cancel', 'farmer', null, 204);
    const booking = await post('/soil-test/requests', 'neighbor', values);
    const path = '/soil-test/requests/' + booking.id;
    assert.ok(!(await get('/soil-test/requests?view=center', 'lab2')).some((item) => item.id === booking.id));
    await patch(path + '/status', 'lab2', { status: 'IN_ANALYSIS' }, 404);
    await patch(path + '/status', 'lab', { status: 'IN_ANALYSIS' }, 204);
    const pdf = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n';
    const form = new FormData();
    form.append('report', new Blob([pdf], { type: 'application/pdf' }), 'report.pdf');
    await request(path + '/report', { method: 'PUT', raw: form, as: 'lab', expected: 201 });
    await get(path + '/report', 'farmer', 404);
    const downloaded = await request(path + '/report', { as: 'neighbor', binary: true });
    assert.equal(downloaded.toString(), pdf);
    const { items } = await get('/platform/notifications', 'neighbor');
    assert.ok(items.some((item) => item.type === 'SOIL_REPORT_READY'));
  });

  await suite.test('existing centers and their bookings survive the one-center registration rule', async () => {
    const agent = await person('legacy-lab', ['TEST_CENTER']);
    const registration = { name: 'Soil lab', location: 'Warangal' };
    const attempts = await Promise.all([0, 1].map(() => post('/soil-test/centers', 'legacy-lab', registration, null)));
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [201, 409]);
    const first = attempts.find(({ status }) => status === 201).data;
    const second = await db.soilTestCenter.create({ data: { ...registration, agentId: agent.id } });
    const booking = await db.soilTestRequest.create({
      data: { centerId: second.id, farmerId: users.get('farmer').id },
    });
    assert.equal((await get('/soil-test/centers/mine', 'legacy-lab')).id, second.id);
    const queue = await get('/soil-test/requests?view=center', 'legacy-lab');
    assert.ok(queue.some((item) => item.id === booking.id && item.center.id === second.id));
    const centers = await get('/admin/centers', 'admin');
    assert.ok(centers.some(({ id }) => id === first.id) && centers.some(({ id }) => id === second.id));
    await post('/soil-test/centers', 'legacy-lab', registration, 409);
  });

  await suite.test('marketplace caps stock, requires acknowledgment, verifies capture and releases holds', async (context) => {
    context.mock.method(globalThis, 'fetch', async (url, options) => {
      const key = url.split('/').at(-1);
      if (key === 'orders') {
        const order = JSON.parse(options.body);
        return Response.json({ id: 'order_' + order.receipt.replaceAll('-', ''), amount: order.amount });
      }
      return new Response('Unavailable', { status: 503 });
    });
    const item = await post('/vendor/products', 'vendor', {
      title: 'Test pesticide ' + runId, category: 'Pesticide', safetyWarning: 'Read the product label.', price: '50',
      brand: 'Release Seed Co', unit: 'Bag', stockQuantity: 3,
    });
    const { products } = await get('/market/products?category=PESTICIDE&search=' + runId, 'farmer');
    assert.equal(products[0].id, item.id);
    assert.equal(products[0].category, 'PESTICIDE');
    assert.equal((await put('/market/cart/' + item.id, 'farmer', { quantity: 4 }, 409)).maxAvailable, 3);
    await put('/market/cart/' + item.id, 'farmer', { quantity: 2 });
    const checkout = { requestKey: randomUUID(), totalPaise: 10000 };
    await post('/market/checkout', 'farmer', { ...checkout, acknowledged: false }, 400);
    const hold = await post('/market/checkout', 'farmer', { ...checkout, acknowledged: true });
    assert.equal(hold.order.status, 'PENDING_PAYMENT');
    assert.equal((await db.product.findUnique({ where: { id: item.id } })).stockQuantity, 1);
    assert.equal((await post('/market/checkout', 'farmer', { ...checkout, acknowledged: true })).order.id, hold.order.id);
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {
      id: 'pay_' + runId.replaceAll('-', ''), status: 'captured', currency: 'INR',
      amount: 10000, order_id: hold.payment.order_id,
    } } } });
    const webhook = (header, expected) => request('/market/webhook', {
      method: 'POST', raw: body, headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': header }, expected,
    });
    await webhook('0'.repeat(64), 400);
    await webhook(signature(body), 204);
    await webhook(signature(body), 204);
    assert.equal((await get('/market/orders', 'farmer')).find((order) => order.id === hold.order.id).status, 'ORDER_PLACED');
    assert.ok((await get('/market/vendor-orders', 'vendor')).some((order) => order.id === hold.order.id));
    assert.equal((await get('/market/cart', 'farmer')).items.length, 0);

    await put('/market/cart/' + item.id, 'neighbor', { quantity: 1 });
    const pending = await post('/market/checkout', 'neighbor', { requestKey: randomUUID(), totalPaise: 5000, acknowledged: true });
    await db.marketOrder.update({ where: { id: pending.order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await Promise.all([expireOrders(users.get('neighbor').id), expireOrders(users.get('neighbor').id)]);
    assert.equal((await db.product.findUnique({ where: { id: item.id } })).stockQuantity, 1);
    assert.equal((await get('/market/orders', 'neighbor')).find((order) => order.id === pending.order.id).status, 'PAYMENT_EXPIRED');
    assert.equal((await get('/market/cart', 'neighbor')).items.length, 1);
  });

  await suite.test('labour invites, overlap protection, staffing and start-date shortfalls', async () => {
    for (const worker of ['worker', 'worker2']) await put('/labour/profile', worker, { skills: ['Harvesting'], available: true, dailyRate: '500' });
    assert.ok((await get('/labour/directory?skill=harvesting', 'farmer')).some((item) => item.userId === users.get('worker').id));
    const fields = { category: 'Harvesting', location: 'Erode', dailyWage: '600', workerCount: 1, startDate: date(2), endDate: date(3) };
    const [first, second] = await Promise.all([post('/labour/jobs', 'farmer', fields), post('/labour/jobs', 'neighbor', fields)]);
    await post('/labour/jobs/' + first.id + '/invite', 'farmer', { workerId: users.get('worker').id });
    const competing = await Promise.all([first, second].map((job) => post('/labour/jobs/' + job.id + '/accept', 'worker', null, null)));
    assert.deepEqual(competing.map((result) => result.status).sort(), [200, 409]);
    assert.equal(await db.labourJob.count({ where: { id: { in: [first.id, second.id] }, status: 'STAFFED' } }), 1);
    const short = await post('/labour/jobs', 'farmer', { ...fields, startDate: date(0), endDate: date(1), workerCount: 2 });
    await post('/labour/jobs/' + short.id + '/accept', 'worker2', null, 200);
    await notifyShortfalls();
    assert.equal((await db.labourJob.findUnique({ where: { id: short.id } })).shortfallNotified, true);
    await patch('/labour/jobs/' + short.id + '/status', 'farmer', { status: 'IN_PROGRESS' });
    await patch('/labour/jobs/' + short.id + '/status', 'farmer', { status: 'COMPLETED' });
    await patch('/labour/jobs/' + short.id + '/status', 'farmer', { status: 'PAID' });
  });

  await suite.test('equipment overlaps, next dates, rejection, instant approval and receipts', async () => {
    const details = {
      name: 'Tractor ' + runId, type: 'Tractor', location: 'Erode', dailyRate: '1000',
      securityDeposit: '300', depositTerms: 'Return the deposit at handover if equipment is undamaged.',
      operationalStatus: 'AVAILABLE',
    };
    const manual = await post('/vendor/machinery', 'vendor', details);
    const instant = await post('/vendor/machinery', 'vendor', { ...details, instantApproval: true });
    const rental = {
      machineId: manual.id, startDate: date(1), endDate: date(1), feePaise: 100000, depositPaise: 30000,
      depositTerms: details.depositTerms, termsAccepted: true,
    };
    const competing = await Promise.all(['farmer', 'neighbor'].map((name) => post('/equipment/reservations', name, rental, null)));
    assert.deepEqual(competing.map((result) => result.status).sort(), [201, 409]);
    const selected = competing.find((result) => result.status === 201).data;
    assert.equal(competing.find((result) => result.status === 409).data.nextAvailable.startDate, date(2));
    assert.equal(selected.status, 'PENDING_APPROVAL');
    await patch('/equipment/reservations/' + selected.id, 'vendor', { status: 'REJECTED' });
    const result = await post('/equipment/reservations', 'farmer', { ...rental, machineId: instant.id });
    assert.equal(result.status, 'CONFIRMED');
    assert.ok(result.confirmedAt);
    const mine = (await get('/equipment/reservations/mine', 'farmer')).find((item) => item.id === result.id);
    assert.equal(mine.machine.owner.email, users.get('vendor').email);
    await post('/equipment/machines/' + instant.id + '/blocks', 'vendor', { startDate: date(1), endDate: date(2) }, 409);
  });

  await suite.test('accounts with multiple roles can see their published jobs and produce without self-dealing', async () => {
    await person('publisher', ['FARMER', 'LABOURER', 'BUYER']);
    const job = await post('/labour/jobs', 'publisher', {
      category: 'Irrigation', location: 'Warangal', workerCount: '2', dailyWage: '500', startDate: date(2), endDate: date(3),
    });
    const posting = (items) => items.find(({ id }) => id === job.id);
    assert.equal(posting(await get('/labour/jobs', 'publisher')).isOwnPosting, true);
    assert.equal(posting(await get('/labour/jobs', 'worker')).isOwnPosting, false);
    await post('/labour/jobs/' + job.id + '/accept', 'publisher', null, 400);

    const batch = await post('/produce/listings', 'publisher', { crop: 'Rice', grade: 'A', location: 'Warangal',
      quantity: '6', minBatch: '1', basePrice: '2500', allowNegotiation: true });
    const listing = (items) => items.find(({ id }) => id === batch.id);
    assert.equal(listing(await get('/produce/listings', 'publisher')).isOwnPosting, true);
    assert.equal(listing(await get('/produce/listings', 'buyer')).isOwnPosting, false);
    await post('/produce/listings/' + batch.id + '/buy', 'publisher', { quantity: '1', pricePaise: 250000, requestKey: randomUUID() }, 404);
  });

  await suite.test('produce negotiation, immutable events, expiry and concurrent stock', async () => {
    const fields = { crop: 'Rice ' + runId, grade: 'A', location: 'Salem', quantity: '10', minBatch: '2', basePrice: '2500', allowNegotiation: true };
    const listing = await post('/produce/listings', 'farmer', fields);
    const path = '/produce/listings/' + listing.id;
    const first = await post(path + '/offers', 'buyer', { quantity: '2', price: '2000' });
    const second = await post(path + '/offers', 'buyer2', { quantity: '2', price: '2050' });
    const negotiations = () => get('/produce/negotiations?view=farmer', 'farmer');
    const seen = (await negotiations()).find((row) => row.id === first.id);
    const response = '/produce/negotiations/' + first.id + '/respond';
    await post(response, 'buyer', { action: 'ACCEPT', eventSequence: seen.events[0].sequence }, 409);
    await post(response, 'farmer', { action: 'COUNTER', eventSequence: seen.events[0].sequence, price: '2300' }, 200);
    const counter = (await negotiations()).find((row) => row.id === first.id);
    const agreement = await post(response, 'buyer', { action: 'ACCEPT', eventSequence: counter.events.at(-1).sequence }, 200);
    assert.equal(agreement.totalPaise, 460000);
    assert.equal((await get('/produce/agreements?view=buyer', 'buyer'))[0].contactEmail, users.get('farmer').email);
    await assert.rejects(db.negotiationEvent.update({
      where: { id: seen.events[0].id }, data: { action: 'CHANGED' },
    }), /append-only/);
    await db.produceNegotiation.update({ where: { id: second.id }, data: { expiresAt: new Date(Date.now() - DAY) } });
    await expireNegotiations();
    assert.equal((await negotiations()).find((row) => row.id === second.id).events.at(-1).action, 'EXPIRED');
    const competing = await Promise.all(['buyer', 'buyer2'].map((buyer) =>
      post(path + '/buy', buyer, { quantity: '8', pricePaise: 250000, requestKey: randomUUID() }, null)));
    assert.deepEqual(competing.map((result) => result.status).sort(), [201, 409]);
    assert.equal((await db.produceListing.findUnique({ where: { id: listing.id } })).quantity.toNumber(), 0);
  });
});
