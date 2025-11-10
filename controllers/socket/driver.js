const sql = require("../../db");
const { EVENTS } = require("../../routes/socket");

module.exports.sendLocation = async (socket, userSockets, data) => {
  const locationLat = Number(data.locationLat);
  const locationLng = Number(data.locationLng);
  const orderId = Number(data.orderId);
  const driverId = Number(socket.userId);

  //Validation
  if (
    typeof locationLat !== "number" ||
    typeof locationLng !== "number" ||
    isNaN(locationLat) ||
    isNaN(locationLng)
  ) {
    socket.emit(EVENTS.DRIVER_LOCATION_ERROR, { error: "Invalid coordinates" });
    return;
  }
  if (typeof orderId !== "number" || isNaN(orderId)) {
    socket.emit(EVENTS.DRIVER_LOCATION_ERROR, { error: "Invalid order Id" });
    return;
  }

  // Get order
  console.log("Received location:", data);
  const [order] = await sql`SELECT user_id
  FROM orders
  WHERE id = ${orderId} AND driver_id = ${driverId}`;

  if (!order) {
    socket.emit("sendLocationError", { error: "Order not found" });
    return;
  }
  //Update in db
  //Important! Need strict rate limiting
  await sql`
  UPDATE drivers
  SET location = ST_SetSRID(ST_MakePoint(${locationLng}, ${locationLat}), 4326)
  WHERE id = ${driverId}
`;

  //Get user socket and send update
  const userSocket = userSockets[order.user_id];
  if (userSocket) {
    userSocket.emit("driverLocation", { locationLat, locationLng, orderId });
  }
};

module.exports.dropoffReady = async (socket, userSockets, data) => {
  const orderId = data.orderId;
  const driverId = socket.userId;

  if (!orderId || !driverId) {
    socket.emit(EVENTS.DRIVER_DROPOFF_ERROR, { error: "No order id provided" });
    return;
  }
  const [order] = await sql`
  SELECT user_id
  FROM orders
  WHERE id = ${orderId} AND driver_id = ${driverId}
  `;
  if (!order) {
    socket.emit(EVENTS.DRIVER_DROPOFF_ERROR, { error: "No order found" });
    return;
  }
  const userSocket = userSockets[order.user_id];
  if (userSocket) {
    //Send update to user
    userSocket.emit(EVENTS.DRIVER_DROPOFF, { orderId });
  } else {
    //User not online, send FCM
    //Example: fcm.messaging().send(message)
  }
};

module.exports.foodPickup = async (socket, userSockets, data) => {
  const orderId = data.orderId;
  const driverId = socket.userId;
  if (!orderId || !driverId) {
    socket.emit(EVENTS.DRIVER_PICKUP_ERROR, { error: "No order id provided" });
    return;
  }

  //Find in db
  const [order] = await sql`
  SELECT user_id
  FROM orders
  WHERE id = ${orderId}
   AND driver_id = ${driverId}
   AND status = 'waiting for pickup'
  `;
  if (!order) {
    socket.emit(EVENTS.DRIVER_PICKUP_ERROR, { error: "Order not found" });
    return;
  }
  //Update db
  await sql`
  UPDATE orders
  SET status = 'delivering'
  WHERE id = ${orderId} AND driver_id = ${driverId}
  `;
  //Send to user
  const userSocket = userSockets[order.user_id];
  if (userSocket) {
    userSocket.emit("foodPickup", { orderId });
  } else {
    //User not online, send FCM
    //Example: fcm.messaging().send(message)
  }
};
