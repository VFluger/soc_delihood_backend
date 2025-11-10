const jwt = require("jsonwebtoken");

module.exports = async (socket, next) => {
  //IMPORTANT: SECURITY RISK
  //This approach is trusting the header, which means users can change this
  //  and be considered cooks or drivers
  //Trust only data in JWT, this is only example
  const accountType = socket.handshake.query.type;
  let token =
    socket.handshake.auth.token || socket.handshake.headers.authorization;

  if (!token || !accountType) {
    return next(new Error("Unauthorized"));
  }
  if (token.startsWith("Bearer")) {
    token = token.split(" ")[1];
  }
  try {
    console.log(token);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("DECODED");
    socket.accountType = accountType;
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    return next(new Error("Unauthorized"));
  }
};
