const { db, serializable } = require('../db');
const { check, requiredText, textFilter, whole, money } = require('../http');
const { categoryCode, categoryAliases, displayCategory } = require('../productCategories');
const operationalStatuses = ['AVAILABLE', 'RENTED', 'UNDER_MAINTENANCE'];
const optional = (value, field, max) => value ? requiredText(value, field, max) : null;

function imageUrl(value) {
  const url = optional(value, 'Photo URL', 2048);
  check(!url || /^https?:\/\//i.test(url), 400, 'Enter a valid photo URL.');
  return url;
}

function choice(value, options, label) {
  check(options.includes(value), 400, 'Choose a valid ' + label + '.');
  return value;
}

function boolean(value, label) {
  check(typeof value === 'boolean', 400, label + ' must be true or false.');
  return value;
}

function productCategory(value) {
  check(categoryCode(value), 400, 'Choose a valid category.');
  return displayCategory(value);
}

const productFields = {
  title: (v) => requiredText(v, 'Title'),
  category: productCategory,
  brand: (v) => optional(v, 'Brand', 150),
  description: (v) => optional(v, 'Description', 2000),
  price: (v) => money(v, 'Price', 0) / 100,
  unit: (v) => requiredText(v, 'Packaging unit', 100),
  stockQuantity: (v) => whole(v === '' ? 0 : v, 'Stock', 0, 100000000),
  safetyWarning: (v) => optional(v, 'Safety warning', 2000),
  imageUrl,
  active: (v) => boolean(v, 'Active'),
};
const machineFields = {
  name: (v) => requiredText(v, 'Equipment name'),
  type: (v) => requiredText(v, 'Equipment type'),
  dailyRate: (v) => money(v, 'Daily rate') / 100,
  securityDeposit: (v) => money(v || 0, 'Security deposit', 0) / 100,
  depositTerms: (v) => optional(v, 'Security deposit terms', 1500),
  location: (v) => requiredText(v, 'Location', 500),
  operationalStatus: (v) => choice(v, operationalStatuses, 'operational status'),
  instantApproval: (v) => boolean(v, 'Instant approval'),
  specifications: (v) => optional(v, 'Specifications', 2000),
  imageUrl,
  active: (v) => boolean(v, 'Active'),
};

function fields(input, validators) {
  return Object.fromEntries(Object.entries(validators)
    .filter(([key]) => input[key] !== undefined).map(([key, validate]) => [key, validate(input[key])]));
}

function verifyWarning(product) {
  if (categoryCode(product.category) === 'PESTICIDE') requiredText(product.safetyWarning, 'Pesticide safety warning', 2000);
}

exports.createProduct = async (req, res) => {
  const { title, category, price, unit } = req.body;
  const data = fields({
    stockQuantity: 0, ...req.body, title: title ?? '', category: category ?? '', price: price ?? '', unit: unit ?? '',
  }, productFields);
  verifyWarning(data);
  res.status(201).json(await db.product.create({ data: { ...data, vendorId: req.user.id } }));
};

exports.createMachinery = async (req, res) => {
  const { name, type, dailyRate, location } = req.body;
  const data = fields({
    ...req.body, name: name ?? '', type: type ?? '', dailyRate: dailyRate ?? '', location: location ?? '',
  }, machineFields);
  res.status(201).json(await db.machinery.create({ data: { ...data, ownerId: req.user.id } }));
};

exports.getProducts = async (req, res) => {
  const search = textFilter(req.query.search);
  const category = textFilter(req.query.category);
  const all = req.query.all === 'true';
  const products = await db.product.findMany({
    where: {
      deletedAt: null, vendorId: all ? undefined : req.user.id, active: all ? true : undefined,
      category: category && category !== 'ALL' ? { in: categoryAliases(category), mode: 'insensitive' } : undefined,
      OR: search ? ['title', 'brand', 'description'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) : undefined,
    },
    orderBy: { createdAt: 'desc' },
    include: { vendor: { select: { id: true, email: true } } },
  });
  res.json(products.map((product) => ({ ...product, category: displayCategory(product.category) })));
};

exports.getMachinery = async (req, res) => {
  const search = textFilter(req.query.search);
  const type = textFilter(req.query.type);
  const status = textFilter(req.query.status);
  const all = req.query.all === 'true';
  res.json(await db.machinery.findMany({
    where: {
      deletedAt: null, ownerId: all ? undefined : req.user.id, active: all ? true : undefined,
      type: type && type !== 'ALL' ? type : undefined, operationalStatus: status && status !== 'ALL' ? status : undefined,
      OR: search ? ['name', 'location', 'specifications'].map((key) => ({ [key]: { contains: search, mode: 'insensitive' } })) : undefined,
    },
    orderBy: { createdAt: 'desc' },
    include: { owner: { select: { id: true, email: true } } },
  }));
};

async function owned(tx, req, model, ownerField) {
  const record = await tx[model].findFirst({ where: { id: req.params.id, deletedAt: null } });
  check(record, 404, 'Listing not found.');
  check(record[ownerField] === req.user.id || req.user.roles.includes('ADMIN'), 403, 'You do not manage this listing.');
  return record;
}

exports.updateProduct = async (req, res) => {
  const data = fields(req.body, productFields);
  const product = await serializable(async (tx) => {
    const existing = await owned(tx, req, 'product', 'vendorId');
    if (req.body.expectedUpdatedAt) {
      check(existing.updatedAt.toISOString() === req.body.expectedUpdatedAt, 409, 'This listing changed. Reopen it to edit the latest stock and details.');
    }
    verifyWarning({ ...existing, ...data });
    return tx.product.update({ where: { id: existing.id }, data });
  });
  res.json(product);
};

exports.updateMachinery = async (req, res) => {
  const data = fields(req.body, machineFields);
  const machine = await serializable(async (tx) => {
    const existing = await owned(tx, req, 'machinery', 'ownerId');
    return tx.machinery.update({ where: { id: existing.id }, data });
  });
  res.json(machine);
};

function archive(model, ownerField) {
  return async (req, res) => {
    await serializable(async (tx) => {
      const existing = await owned(tx, req, model, ownerField);
      await tx[model].update({ where: { id: existing.id }, data: { active: false, deletedAt: new Date() } });
    });
    res.json({ message: 'Listing removed.' });
  };
}

exports.deleteProduct = archive('product', 'vendorId');
exports.deleteMachinery = archive('machinery', 'ownerId');

exports.getVendorStats = async (req, res) => {
  const id = req.user.id;
  const product = { vendorId: id, deletedAt: null };
  const machine = { ownerId: id, deletedAt: null };
  const [totalProducts, outOfStockProducts, totalMachinery, availableMachinery] = await Promise.all([
    db.product.count({ where: product }),
    db.product.count({ where: { ...product, stockQuantity: { lte: 0 } } }),
    db.machinery.count({ where: machine }),
    db.machinery.count({ where: { ...machine, active: true, operationalStatus: 'AVAILABLE' } }),
  ]);
  res.json({ totalProducts, outOfStockProducts, totalMachinery, availableMachinery });
};
