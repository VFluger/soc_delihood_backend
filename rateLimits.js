const { rateLimit } = require("express-rate-limit");

module.exports = {
  apiLimit: rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    keyGenerator: (req) => req.user.id,
  }),
  authLimit: rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
  }),
  slightLimit: rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
  }),
};
