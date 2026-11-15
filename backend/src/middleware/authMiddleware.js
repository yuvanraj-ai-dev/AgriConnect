const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token invalid or expired' });
    }
    req.user = user;
    next();
  });
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Normalize user roles (handles array, stringified array, or single string)
    let userRoles = req.user.roles || [];
    if (typeof userRoles === 'string') {
      try {
        const parsed = JSON.parse(userRoles);
        userRoles = Array.isArray(parsed) ? parsed : [userRoles];
      } catch (e) {
        userRoles = [userRoles];
      }
    } else if (!Array.isArray(userRoles)) {
      userRoles = [userRoles];
    }
    req.user.roles = userRoles;

    // Check if user has any of the required roles
    const hasRole = userRoles.some((role) => roles.includes(role));
    if (!hasRole) {
      console.warn(`[RBAC] User ${req.user.id} denied access. Required: ${roles.join(',')}, Has: ${userRoles.join(',')}`);
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    
    next();
  };
};

module.exports = { authenticateToken, requireRole };
