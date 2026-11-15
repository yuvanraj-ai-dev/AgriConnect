const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// FERTILIZERS & AGRICULTURAL INPUTS (PRODUCTS)
// ==========================================

// Create a new product listing (e.g. Fertilizers, Seeds, Pesticides, etc.)
exports.createProduct = async (req, res) => {
  try {
    const {
      title,
      category,
      brand,
      description,
      price,
      unit,
      stockQuantity,
      safetyWarning,
      imageUrl
    } = req.body;

    if (!title || !category || price === undefined || !unit) {
      return res.status(400).json({ error: 'Title, category, price, and unit are required.' });
    }

    const numericPrice = parseFloat(price);
    const numericStock = parseInt(stockQuantity || 0, 10);

    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'Price must be a valid positive number.' });
    }

    if (isNaN(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: 'Stock quantity cannot be negative.' });
    }

    const product = await prisma.product.create({
      data: {
        vendorId: req.user.id,
        title: title.trim(),
        category: category.trim(),
        brand: brand ? brand.trim() : null,
        description: description ? description.trim() : null,
        price: numericPrice,
        unit: unit.trim(),
        stockQuantity: numericStock,
        safetyWarning: safetyWarning ? safetyWarning.trim() : null,
        imageUrl: imageUrl ? imageUrl.trim() : null,
        active: true
      }
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product listing', detail: error.message });
  }
};

// Get products (either vendor's own listings or all active listings if all=true)
exports.getProducts = async (req, res) => {
  try {
    const { all, category, search } = req.query;

    const where = {};

    // If 'all' is requested, show all active products for the marketplace
    // Otherwise, show only the authenticated vendor's products
    if (all === 'true') {
      where.active = true;
    } else {
      where.vendorId = req.user.id;
    }

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: {
          select: { id: true, email: true }
        }
      }
    });

    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products', detail: error.message });
  }
};

// Update an existing product listing
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      category,
      brand,
      description,
      price,
      unit,
      stockQuantity,
      safetyWarning,
      imageUrl,
      active
    } = req.body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // Role check: vendor must own product or be ADMIN
    if (existing.vendorId !== req.user.id && !req.user.roles.includes('ADMIN')) {
      return res.status(403).json({ error: 'You are not authorized to update this product.' });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (category !== undefined) updateData.category = category.trim();
    if (brand !== undefined) updateData.brand = brand ? brand.trim() : null;
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (price !== undefined) {
      const p = parseFloat(price);
      if (isNaN(p) || p < 0) return res.status(400).json({ error: 'Invalid price.' });
      updateData.price = p;
    }
    if (unit !== undefined) updateData.unit = unit.trim();
    if (stockQuantity !== undefined) {
      const s = parseInt(stockQuantity, 10);
      if (isNaN(s) || s < 0) return res.status(400).json({ error: 'Invalid stock quantity.' });
      updateData.stockQuantity = s;
    }
    if (safetyWarning !== undefined) updateData.safetyWarning = safetyWarning ? safetyWarning.trim() : null;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl ? imageUrl.trim() : null;
    if (active !== undefined) updateData.active = Boolean(active);

    const updated = await prisma.product.update({
      where: { id },
      data: updateData
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product', detail: error.message });
  }
};

// Delete a product listing
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    if (existing.vendorId !== req.user.id && !req.user.roles.includes('ADMIN')) {
      return res.status(403).json({ error: 'You are not authorized to delete this product.' });
    }

    await prisma.product.delete({ where: { id } });

    res.status(200).json({ message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product', detail: error.message });
  }
};

// ==========================================
// RENTAL MACHINERY & EQUIPMENT
// ==========================================

// Create a new rental machinery listing
exports.createMachinery = async (req, res) => {
  try {
    const {
      name,
      type,
      dailyRate,
      securityDeposit,
      location,
      operationalStatus,
      instantApproval,
      specifications,
      imageUrl
    } = req.body;

    if (!name || !type || dailyRate === undefined || !location) {
      return res.status(400).json({ error: 'Name, machinery type, daily rate, and location are required.' });
    }

    const numericDailyRate = parseFloat(dailyRate);
    const numericDeposit = parseFloat(securityDeposit || 0);

    if (isNaN(numericDailyRate) || numericDailyRate <= 0) {
      return res.status(400).json({ error: 'Daily rate must be a valid positive amount.' });
    }

    if (isNaN(numericDeposit) || numericDeposit < 0) {
      return res.status(400).json({ error: 'Security deposit cannot be negative.' });
    }

    const machinery = await prisma.machinery.create({
      data: {
        ownerId: req.user.id,
        name: name.trim(),
        type: type.trim(),
        dailyRate: numericDailyRate,
        securityDeposit: numericDeposit,
        location: location.trim(),
        operationalStatus: operationalStatus ? operationalStatus.trim() : 'AVAILABLE',
        instantApproval: Boolean(instantApproval),
        specifications: specifications ? specifications.trim() : null,
        imageUrl: imageUrl ? imageUrl.trim() : null,
        active: true
      }
    });

    res.status(201).json(machinery);
  } catch (error) {
    console.error('Error creating machinery:', error);
    res.status(500).json({ error: 'Failed to create machinery listing', detail: error.message });
  }
};

// Get rental machinery (vendor's own listings or all active listings if all=true)
exports.getMachinery = async (req, res) => {
  try {
    const { all, type, status, search } = req.query;

    const where = {};

    if (all === 'true') {
      where.active = true;
    } else {
      where.ownerId = req.user.id;
    }

    if (type && type !== 'ALL') {
      where.type = type;
    }

    if (status && status !== 'ALL') {
      where.operationalStatus = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { specifications: { contains: search, mode: 'insensitive' } }
      ];
    }

    const machinery = await prisma.machinery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: { id: true, email: true }
        }
      }
    });

    res.status(200).json(machinery);
  } catch (error) {
    console.error('Error fetching machinery:', error);
    res.status(500).json({ error: 'Failed to fetch machinery', detail: error.message });
  }
};

// Update an existing rental machinery listing
exports.updateMachinery = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      type,
      dailyRate,
      securityDeposit,
      location,
      operationalStatus,
      instantApproval,
      specifications,
      imageUrl,
      active
    } = req.body;

    const existing = await prisma.machinery.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Machinery not found.' });
    }

    if (existing.ownerId !== req.user.id && !req.user.roles.includes('ADMIN')) {
      return res.status(403).json({ error: 'You are not authorized to update this machinery.' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type.trim();
    if (dailyRate !== undefined) {
      const dr = parseFloat(dailyRate);
      if (isNaN(dr) || dr <= 0) return res.status(400).json({ error: 'Invalid daily rate.' });
      updateData.dailyRate = dr;
    }
    if (securityDeposit !== undefined) {
      const sd = parseFloat(securityDeposit);
      if (isNaN(sd) || sd < 0) return res.status(400).json({ error: 'Invalid security deposit.' });
      updateData.securityDeposit = sd;
    }
    if (location !== undefined) updateData.location = location.trim();
    if (operationalStatus !== undefined) updateData.operationalStatus = operationalStatus.trim();
    if (instantApproval !== undefined) updateData.instantApproval = Boolean(instantApproval);
    if (specifications !== undefined) updateData.specifications = specifications ? specifications.trim() : null;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl ? imageUrl.trim() : null;
    if (active !== undefined) updateData.active = Boolean(active);

    const updated = await prisma.machinery.update({
      where: { id },
      data: updateData
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating machinery:', error);
    res.status(500).json({ error: 'Failed to update machinery', detail: error.message });
  }
};

// Delete a rental machinery listing
exports.deleteMachinery = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.machinery.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Machinery not found.' });
    }

    if (existing.ownerId !== req.user.id && !req.user.roles.includes('ADMIN')) {
      return res.status(403).json({ error: 'You are not authorized to delete this machinery.' });
    }

    await prisma.machinery.delete({ where: { id } });

    res.status(200).json({ message: 'Machinery listing deleted successfully.' });
  } catch (error) {
    console.error('Error deleting machinery:', error);
    res.status(500).json({ error: 'Failed to delete machinery', detail: error.message });
  }
};

// ==========================================
// VENDOR SHOP SUMMARY / STATS
// ==========================================
exports.getVendorStats = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const [totalProducts, outOfStockProducts, totalMachinery, availableMachinery] = await Promise.all([
      prisma.product.count({ where: { vendorId } }),
      prisma.product.count({ where: { vendorId, stockQuantity: { lte: 0 } } }),
      prisma.machinery.count({ where: { ownerId: vendorId } }),
      prisma.machinery.count({ where: { ownerId: vendorId, operationalStatus: 'AVAILABLE' } })
    ]);

    res.status(200).json({
      totalProducts,
      outOfStockProducts,
      totalMachinery,
      availableMachinery
    });
  } catch (error) {
    console.error('Error fetching vendor stats:', error);
    res.status(500).json({ error: 'Failed to fetch vendor statistics', detail: error.message });
  }
};
