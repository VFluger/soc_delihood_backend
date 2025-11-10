const { Server } = require("socket.io");
const { server } = require("../server");

module.exports.EVENTS = {
  DRIVER_LOCATION: "driverLocation",
  DRIVER_LOCATION_ERROR: "sendLocationError",
  DRIVER_DROPOFF: "dropoffReady",
  DRIVER_DROPOFF_ERROR: "dropoffReadyError",
  DRIVER_PICKUP: "foodPickup",
  DRIVER_PICKUP_ERROR: "foodPickupError",

  COOK_ACCEPTED: "orderAccepted",
  COOK_ACCEPTED_ERROR: "orderAcceptedError",
  COOK_ORDER_READY: "orderReady",
  COOK_ORDER_READY_ERROR: "orderReadyError",

  USER_PAYMENT_COMPLETED: "orderPaid",
  USER_PAYMENT_COMPLETED_ERROR: "orderPaidError",
  USER_ORDER_DELIVERED: "orderDelivered",
  USER_ORDER_DELIVERED_ERROR: "orderDeliveredError",
};

const io = new Server(server, {
  cors: { origin: "*" },
});

const authMiddleware = require("../middleware/socket");
io.use(authMiddleware);

//In object store, we should consider Redis or db
let usersSockets = {};
let cooksSockets = {};
let driverSockets = {};

const driverRoutes = require("../controllers/socket/driver");
const cookRoutes = require("../controllers/socket/cook");
const userRoutes = require("../controllers/socket/user");

io.on("connection", (socket) => {
  console.log("New socket connected");
  switch (socket.accountType) {
    case "user":
      //Push socket to store
      usersSockets[socket.userId] = socket;

      //Routes
      socket.on(this.EVENTS.USER_ORDER_DELIVERED, (data) =>
        userRoutes.orderDelivered(socket, cooksSockets, driverSockets, data)
      );
      socket.on(this.EVENTS.USER_PAYMENT_COMPLETED, (data) =>
        userRoutes.orderPaid(socket, cooksSockets, data)
      );
      break;
    case "cook":
      console.log("cook connected");
      console.log("Query: ", socket.handshake.query);
      //Push socket to store
      cooksSockets[socket.userId] = socket;

      //Routes
      socket.on(this.EVENTS.COOK_ACCEPTED, (data) =>
        cookRoutes.orderAccepted(socket, usersSockets, data)
      );
      socket.on(this.EVENTS.COOK_ORDER_READY, (data) =>
        cookRoutes.pickupReady(socket, usersSockets, driverSockets, data)
      );
      break;
    case "driver":
      //Push socket to store
      driverSockets[socket.userId] = socket;

      //Routes
      socket.on(this.EVENTS.DRIVER_LOCATION, (data) =>
        driverRoutes.sendLocation(socket, usersSockets, data)
      );
      socket.on(this.EVENTS.DRIVER_DROPOFF, (data) =>
        driverRoutes.dropoffReady(socket, usersSockets, data)
      );
      socket.on(this.EVENTS.DRIVER_PICKUP, (data) =>
        driverRoutes.dropoffReady(socket, usersSockets, data)
      );
      break;
    default:
      socket.disconnect();
  }
});

io.on("disconnect", (socket) => {
  switch (socket.accountType) {
    case "user":
      //Push socket to store
      delete usersSockets[socket.userId];
      break;
    case "cook":
      //Push socket to store
      delete cooksSockets[socket.userId];
      break;
    case "driver":
      //Push socket to store
      delete driverSockets[socket.userId];
      break;
    default:
      socket.disconnect();
  }
});
