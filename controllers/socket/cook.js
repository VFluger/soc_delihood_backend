const sql = require("../../db");
const { EVENTS } = require("../../routes/socket");

const pickDriver = async (orderId, cookLocation) => {
  const alrHasDrivrResult =
    await sql`SELECT id FROM drivers WHERE current_order_id=${orderId}`;
  if (alrHasDrivrResult.length > 0) {
    //Already has a driver assigned
    return alrHasDrivrResult.id;
  }

  //Pick driver
  const driverResult = await sql`SELECT *,
       ST_Distance(location, ${cookLocation}) AS distance,
       EXTRACT(EPOCH FROM (NOW() - last_order_time)) AS wait_seconds,
       ST_Distance(location, ${cookLocation}) / 1000 
         - EXTRACT(EPOCH FROM (NOW() - last_order_time)) / 60 AS score
        FROM drivers
        WHERE is_online = true AND current_order_id IS NULL
        ORDER BY score ASC
        LIMIT 1;`;
  if (driverResult.length < 1) {
    //PROBLEM, no driver available
    return null;
  }
  const driver = driverResult[0];
  await sql`UPDATE drivers SET current_order_id=${orderId}, last_order_time=NOW() WHERE id=${driver.id}`;
  return driver.id;
};

module.exports.orderAccepted = async (socket, userSockets, data) => {
  const cookId = Number(socket.userId);
  const orderId = Number(data.orderId);
  if (!cookId || !orderId) {
    socket.emit(EVENTS.COOK_ACCEPTED_ERROR, { error: "No order provided" });
    return;
  }
  //Find order
  const [order] = await sql`
  SELECT user_id
  FROM orders
  WHERE id = ${orderId} 
   AND cook_id = ${cookId}
   AND status = 'paid'
  `;
  if (!order) {
    socket.emit(EVENTS.COOK_ACCEPTED_ERROR, { error: "No order found" });
    return;
  }
  //Update db
  await sql`
  UPDATE orders
  SET stats = 'accepted'
  WHERE id = ${orderId} AND cook_id = ${cookId}
  `;
  //Send to user
  const userSocket = userSockets[order.user_id];
  if (userSocket) {
    userSocket.emit(EVENTS.COOK_ACCEPTED, { orderId });
  } else {
    //User offline, send FCM
    //Example: fcm.messaging().send(message)
  }
};

module.exports.pickupReady = async (
  socket,
  userSockets,
  driverSockets,
  data
) => {
  const cookId = socket.userId;
  const orderId = Number(data.orderId);
  if (!cookId || !orderId) {
    socket.emit(EVENTS.COOK_ORDER_READY_ERROR, {
      error: "No orderId provided",
    });
    return;
  }
  //Find order in db
  const [order] = await sql`
  SELECT user_id
  FROM orders
  WHERE id = ${orderId}
   AND cook_id = ${cookId}
   AND status = 'accepted'
  `;
  if (!order) {
    socket.emit(EVENTS.COOK_ORDER_READY_ERROR, {
      error: "No orderId found",
    });
    return;
  }
  //Update order
  await sql`
  UPDATE orders
  SET status = 'waiting for pickup'
  WHERE id = ${orderId} AND cook_id = ${cookId}
  `;
  //Get cook location
  const [cook] = await sql`
  SELECT location
  FROM cooks
  WHERE id = ${cookId}
  `;
  //Find driver
  const driverId = await pickDriver(orderId, cook.location);
  if (!driverId) {
    return socket.emit(EVENTS.COOK_ORDER_READY_ERROR, {
      error: "No driver available",
    });
  }

  //Send notification to driver
  const driverSocket = driverSockets[driverId];
  if (driverSocket) {
    driverSocket.emit(EVENTS.COOK_ORDER_READY, {
      orderId,
      location: cook.location,
      deliveryLocation: order.deliveryLocation,
    });
  } else {
    //Driver offline, send with FCM
    //Example: fcm.messaging().send(message)
  }

  //Send update to user
  const userSocket = userSockets[order.user_id];
  if (userSocket) {
    userSocket.emit(EVENTS.COOK_ORDER_READY, { orderId });
  } else {
    //User offline, send with FCM
    //Example: fcm.messaging().send(message)
  }
};
