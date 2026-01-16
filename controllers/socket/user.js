const sql = require("../../db");
const { EVENTS } = require("../../routes/socket");

const stripe = require("stripe")(process.env.STRIPE_SECRET);

module.exports.orderDelivered = async (
  socket,
  cooksSockets,
  driverSockets,
  data
) => {
  const orderId = Number(data.orderId);
  const userId = socket.userId;
  if (!orderId || !userId) {
    socket.emit(EVENTS.USER_ORDER_DELIVERED_ERROR, {
      error: "Order id not provided",
    });
    return;
  }
  //Find order in db
  const [order] = await sql`
  SELECT user_id, cook_id
  FROM orders
  WHERE id = ${orderId} 
    AND user_id = ${userId}
    AND status = 'delivering'
  `;

  const [driver] = await sql`
  SELECT id FROM drivers WHERE current_order_id = ${orderId}
  `;
  if (!order) {
    socket.emit(EVENTS.USER_ORDER_DELIVERED_ERROR, {
      error: "Order not found",
    });
    return;
  }
  //Update order
  await sql`
  UPDATE orders
  SET status = 'delivered'
  WHERE id = ${orderId} AND user_id = ${userId}
  `;
  //Send update to driver
  const driverSocket = driverSockets[driver.id];
  if (driverSocket) {
    driverSocket.emit(EVENTS.USER_ORDER_DELIVERED, { orderId });
  } else {
    //Driver offline, send fcm
    //Example: fcm.messaging().send(message)
  }
  //Send update to cook
  const cookSocket = cooksSockets[order.cook_id];
  if (cookSocket) {
    cookSocket.emit(EVENTS.USER_ORDER_DELIVERED, { orderId });
  } else {
    //Cook offline, send fcm
    //Example: fcm.messaging().send(message)
  }
};
