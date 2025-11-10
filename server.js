const Express = require("express");
const app = Express();

const rateLimiter = require("./rateLimits");

const PAYLOAD_LIMIT = "10mb";

require("dotenv").config(); // .env setup
const cookieParser = require("cookie-parser"); // parsing cookies

// Basic middleware
app.use(Express.urlencoded({ limit: PAYLOAD_LIMIT, extended: true })); // HTML forms parse
app.use(Express.json({ limit: PAYLOAD_LIMIT })); // JSON parse
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`${req.method} on ${req.url}`);
  console.log("Body: ", req.body);
  console.log("Auth: ", req.headers.authorization);
  next();
});

//Cookie Auth mount
const { loginAuth } = require("./middleware/jwtAuth");

//Main routes
const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const confirmationsRoutes = require("./routes/confirmations");

app.use("/auth", rateLimiter.authLimit, authRoutes);
app.use("/api", loginAuth, rateLimiter.apiLimit, apiRoutes);
app.use("/confirmations", rateLimiter.authLimit, confirmationsRoutes);

// Listen setup
module.exports.server = app.listen(process.env.PORT || "8080", () => {
  console.log(`Server listening on ${process.env.PORT || "8080"}`);
});

//Socket start
require("./routes/socket");
