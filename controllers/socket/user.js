const sql = require("../../db");
const { EVENTS } = require("../../routes/socket");

const stripe = require("stripe")(process.env.STRIPE_SECRET);

module.exports.orderPaid = async (socket, cooksSockets, data) => {
  const orderId = data.orderId;
  const userId = socket.userId;

  //Check order
  const [order] = await sql`
  SELECT cook_id
  FROM orders
  WHERE id = ${orderId} AND user_id = ${userId} AND status = 'pending'
  `;
  if (!order) {
    return socket.emit(EVENTS.USER_PAYMENT_COMPLETED_ERROR, {
      error: "Order not found",
    });
  }

  // Check for order on stripe
  const {
    data: [intent],
  } = await stripe.paymentIntents.search({
    query: `metadata['orderId']:'${orderId}'`,
  });
  console.log(intent);

  if (intent.status !== "succeeded") {
    //not paid
    return socket.emit(EVENTS.USER_PAYMENT_COMPLETED_ERROR, {
      error: "Order not paid",
    });
  }
  //Update db
  await sql`
  UPDATE orders
  SET status = 'paid'
  WHERE id = ${orderId} AND user_id = ${userId}
  `;
  //Notify cook of order
  console.log("sockets: ", cooksSockets);
  const cookSocket = cooksSockets[order.cook_id];
  console.log("Selected socket: ", cookSocket);
  if (cookSocket) {
    cookSocket.emit(EVENTS.USER_PAYMENT_COMPLETED, { orderId });
  } else {
    //Cook offline, send fcm
    //Example: fcm.messaging().send(message)
  }
};

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
