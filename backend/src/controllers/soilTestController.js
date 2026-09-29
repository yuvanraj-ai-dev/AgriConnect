const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a new soil testing center
exports.createCenter = async (req, res) => {
  try {
    const { name, location, agentId } = req.body;
    
    // Check if agent already has a center
    const existing = await prisma.soilTestCenter.findUnique({
      where: { agentId }
    });
    if (existing) {
      return res.status(400).json({ error: 'You already have a registered test center.' });
    }

    const center = await prisma.soilTestCenter.create({
      data: {
        name,
        location,
        agentId
      }
    });
    res.status(201).json(center);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create center' });
  }
};

// List all soil testing centers
exports.getCenters = async (req, res) => {
  try {
    const centers = await prisma.soilTestCenter.findMany({
      include: {
        agent: {
          select: { email: true } // User model only has email
        }
      }
    });
    res.status(200).json(centers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch centers' });
  }
};

// Book a soil test
exports.bookSoilTest = async (req, res) => {
  try {
    const { centerId, farmerId, notes } = req.body;
    
    // Create the request
    const request = await prisma.soilTestRequest.create({
      data: {
        centerId,
        farmerId,
        notes,
        status: 'PENDING'
      },
      include: {
        center: true
      }
    });

    // Create a notification for the agent
    await prisma.notification.create({
      data: {
        userId: request.center.agentId,
        type: 'NEW_SOIL_TEST_REQUEST',
        message: `A new soil test request has been booked by farmer ${farmerId}`,
        channel: 'IN_APP'
      }
    });

    res.status(201).json(request);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to book soil test' });
  }
};

// Get requests (could be filtered by centerId or farmerId via query params)
exports.getRequests = async (req, res) => {
  try {
    const { centerId, farmerId } = req.query;
    
    const where = {};
    if (centerId) where.centerId = centerId;
    if (farmerId) where.farmerId = farmerId;

    const requests = await prisma.soilTestRequest.findMany({
      where,
      include: {
        center: true,
        farmer: {
          select: { email: true }
        }
      }
    });
    res.status(200).json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
};

// Update request status
exports.updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const request = await prisma.soilTestRequest.update({
      where: { id },
      data: { status }
    });

    // Notify farmer about status update
    await prisma.notification.create({
      data: {
        userId: request.farmerId,
        type: 'SOIL_TEST_STATUS_UPDATE',
        message: `Your soil test request status has been updated to ${status}`,
        channel: 'IN_APP'
      }
    });

    res.status(200).json(request);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update status' });
  }
};
