const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: true, message: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    next();
  } catch {
    return res.status(401).json({ error: true, message: 'Invalid or expired token' });
  }
};

/**
 * Populate req.user when a valid token is present, but never reject.
 * For public routes that behave slightly differently for signed-in visitors —
 * e.g. the contact form attributes a message to the sender's account when it
 * can, and accepts it anonymously when it can't.
 */
module.exports.optional = (req, res, next) => {
  const token = req.cookies?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    } catch {
      // Expired or invalid — treat as anonymous rather than failing the request.
    }
  }
  next();
};
