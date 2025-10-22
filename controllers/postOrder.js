const { check, validationResult } = require("express-validator");

const sql = require("../db");

const fcm = require("../FCM");

const stripe = require("stripe")(process.env.STRIPE_SECRET);

const PRICE_OF_DELIVERY = 30; // 30 Kc

// Create new order and send payment gate
module.exports.newOrder = async (req, res) => {
  await check("items").isArray({ min: 1 }).run(req);
  await check("items.*.food.id").isInt().run(req);
  await check("items.*.quantity").isInt({ min: 1 }).run(req);
  await check("items.*.note").isString().trim().escape().run(req);
  await check("deliveryLocationLat").isNumeric().run(req);
  await check("deliveryLocationLng").isNumeric().run(req);
  await check("tip").isInt().run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { items, deliveryLocationLat, deliveryLocationLng, tip } = req.body;

  // Cast into set to remove duplicates
  const itemIds = [...new Set(items.map((item) => item.food.id))];
  // Check if all foods exist AND cook is online
  const resultOfFood = await sql`SELECT *
     FROM foods
      WHERE id = ANY(${itemIds})
      AND cook_id IN (SELECT id FROM cooks WHERE is_online = true)`;
  if (resultOfFood.length !== items.length) {
    return res
      .status(404)
      .send({ error: "Food doesn't exist or cook is offline" });
  }
  // Check if all foods from the same cook
  const cookIds = new Set(resultOfFood.map((food) => food.cook_id));
  if (cookIds.size !== 1) {
    return res
      .status(400)
      .send({ error: "All foods must be from the same cook" });
  }

  // Check if there is a driver within 25km who is online
  const driverResult = await sql`
    SELECT id FROM drivers
    WHERE is_online = true
    AND ST_DWithin(
      location::geography,
      ST_SetSRID(ST_MakePoint(${deliveryLocationLng}, ${deliveryLocationLat}), 4326)::geography,
      25000
    )
    LIMIT 1
  `;

  if (driverResult.length < 1) {
    console.log("No drivers available in location");
    return res
      .status(400)
      .send({ error: "No driver available in your location" });
  }

  // Calculate prices
  // Map of foods by id
  const foodMap = new Map();
  for (const food of resultOfFood) {
    foodMap.set(food.id, food);
  }

  const arrOfPrices = [];
  for (const item of items) {
    const food = foodMap.get(item.food.id);
    if (!food) {
      //Should not happen
      return res
        .status(404)
        .send({ error: `Food with ID ${item.food.id} not found` });
    }
    arrOfPrices.push(food.price * item.quantity);
  }
  // Calculate total
  const totalPrice = arrOfPrices.reduce((a, b) => a + b, 0) + PRICE_OF_DELIVERY;

  // Push new order into db with PostGIS
  const resultOfNewOrder = await sql`INSERT INTO orders
            (total_price, 
            tip, 
            delivery_location, 
            user_id)
            VALUES
            (${totalPrice}, ${tip}, ST_SetSRID(ST_MakePoint(${deliveryLocationLng}, ${deliveryLocationLat}), 4326)::geography, ${req.user.id})
            RETURNING id`;

  const orderId = resultOfNewOrder[0].id;

  // Insert all items into db
  for (const item of items) {
    const itemPrice = foodMap.get(item.food.id).price;
    await sql`
    INSERT INTO order_items (order_id, food_id, quantity, notes, price_at_order)
    VALUES (${orderId}, ${item.food.id}, ${item.quantity}, ${item.note}, ${itemPrice})
  `;
  }

  // Send paymentIntent
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalPrice * 100, // Stripe uses minor units
      currency: "czk",
      payment_method_types: ["card"], // only accept card in this demo
      metadata: {
        orderId: orderId,
        userId: req.user.id.toString(),
      },
      description: `Order#${orderId} by User ${req.user.name}`,
      receipt_email: req.user.email,
    });

    //Sending client secret
    res.send({
      clientSecret: paymentIntent.client_secret,
      orderId,
    });
  } catch (err) {
    console.error(err);

    res.status(500).send({ error: "Cannot generate payment" });
  }
};

// Send payment for existing order (if something gone wrong from user)
module.exports.getPayment = async (req, res) => {
  check("id").isInt().run(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send({ error: errors.array() });
  }
  const orderId = req.query.id;

  const result =
    await sql`SELECT * FROM orders WHERE id=${orderId} AND status='pending'`;
  if (result.length < 1) {
    return res.status(404).send({ error: "Order not found" });
  }
  const orderFromDb = result[0];
  if (orderFromDb.user_id !== req.user.id) {
    return res.status(403).send({ error: "Not your order" });
  }

  const existingIntents = await stripe.paymentIntents.search({
    query: `metadata['orderId']:'${orderId}'`,
  });

  //No existing intent, create a new one
  if (existingIntents.data.length < 1) {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: orderFromDb.price * 100, // Stripe uses minor units
      currency: "czk",
      metadata: {
        orderId: orderId.toString(),
        userId: req.user.id.toString(),
      },
      description: `Order #${orderId} by User ${req.user.id}`,
      receipt_email: req.user.email,
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
      orderId: orderId,
    });
    return;
  }
  // return the existing paymentIntent
  res.send({
    clientSecret: existingIntents.data[0].client_secret,
    orderId: result[0].id,
  });
};

module.exports.updateOrder = async (req, res) => {
  await check("id").isInt().trim().run(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send({ error: errors.array() });
  }

  //Get order from db
  const orderId = req.query.id;
  const resultOrder =
    await sql`SELECT * FROM orders WHERE id=${orderId} AND user_id=${req.user.id}`;
  if (resultOrder.length < 1) {
    return res.status(404).send({ error: "Order not found" });
  }

  // Check for order on stripe
  const intent = await stripe.paymentIntents.search({
    query: `metadata['orderId']:'${orderId}'`,
  });

  if (intent.status !== "succeeded") {
    //not paid
    return res.send({ status: "pending", paymentStatus: intent.status });
  }
  if (resultOrder[0].user_id !== req.user.id) {
    return res.status(403).send({ error: "Not your order" });
  }
  const cookResult =
    await sql`SELECT location FROM cooks WHERE id=(SELECT cook_id FROM foods WHERE id=(SELECT food_id FROM order_items WHERE order_id=${orderId} LIMIT 1))`;

  switch (resultOrder[0].status) {
    case "pending":
      //Order paid but not started
      // Update in db
      await sql`UPDATE orders SET status='paid' WHERE id=${orderId}`;
      //Send notification to cook app via APN
      const cookMessage = {
        token: cookresult[0].devicetoken,
        notification: {
          title: "New food order for you!",
          body: "You have a new order for cooking. Open the app to accept and navigate!",
        },
        data: {
          type: "new-cook-order",
          orderId,
        },
      };
      fcm.messaging().send(cookMessage);
      res.send({ orderId, status: "paid" });
      break;
    case "waiting for pickup":
      const alrHasDrivrResult =
        await sql`SELECT id FROM drivers WHERE current_order_id=${orderId}`;
      if (alrHasDrivrResult.length > 0) {
        //Already has a driver assigned
        return res.send({ orderId, status: resultOrder[0].status });
      }

      //Pick driver
      const driverResult = await sql`SELECT *,
       ST_Distance(location, ${cookResult.location}) AS distance,
       EXTRACT(EPOCH FROM (NOW() - last_order_time)) AS wait_seconds,
       ST_Distance(location, ${cookResult.location}) / 1000 
         - EXTRACT(EPOCH FROM (NOW() - last_order_time)) / 60 AS score
        FROM drivers
        WHERE is_online = true AND current_order_id IS NULL
        ORDER BY score ASC
        LIMIT 1;`;
      if (driverResult.length < 1) {
        //PROBLEM, no driver available
        return res
          .status(503) //service unavailable
          .send({ error: "No driver available in your location" });
      }
      const driver = driverResult[0];
      await sql`UPDATE drivers SET current_order_id=${orderId}, last_order_time=NOW() WHERE id=${driver.id}`;

      // Ping driver app
      const driverMessage = {
        token: driver.devicetoken,
        notification: {
          title: "New order for you!",
          body: "You have a new order. Open the app to accept and navigate!",
        },
        data: {
          type: "new-driver-order",
          orderId,
        },
      };
      fcm.messaging().send(driverMessage);
      res.send({ orderId, status: resultOrder[0].status });
    case "delivering":
      //Send driver location
      const driverLocResult = sql`
      SELECT 
        ST_X(location::geometry) AS lng, 
        ST_Y(location::geometry) AS lat 
      FROM drivers 
      WHERE current_order_id=${orderId}`;

      if (driverLocResult.length < 1) {
        return res.status(404).send({ error: "Driver not found" });
      }
      const driverLoc = driverLocResult[0];
      const lng = driverLoc.lng;
      const lat = driverLoc.lat;
      res.send({ orderId, status: resultOrder[0].status, lng, lat });
      break;
    default:
      //just send the status
      res.send({ orderId, status: resultOrder[0].status });
      break;
  }
};

module.exports.cancelOrder = async (req, res) => {
  //If already paid, cannot cancel in this demo
  await check("id").isInt().trim().run(req);
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).send({ error: errors.array() });
  }

  const orderId = req.body.id;

  const result =
    await sql`SELECT * FROM orders WHERE id=${orderId} AND user_id=${req.user.id}`;

  if (result.length < 1) {
    return res.status(404).send({ error: "Order not found" });
  }

  const order = result[0];
  if (order.user_id !== req.user.id) {
    return res.status(403).send({ error: "Not your order" });
  }
  //If order too young, cannot cancel, race conditions
  if (order.created_at > Date.now() - 2 * 60 * 1000) {
    return res.status(400).send({ error: "Order too new to cancel" });
  }

  //If order is paid
  if (order.status != "pending") {
    return res.status(400).send({ error: "Order already paid" });
  }

  const paymentIntent = await stripe.paymentIntents.search({
    query: `metadata['orderId']:'${orderId}'`,
  });

  if (paymentIntent.data.length < 1) {
    return res.status(404).send({ error: "Payment not found" });
  }

  if (paymentIntent.data[0].status == "succeeded") {
    return res.status(400).send({ error: "Order already paid" });
  }
  //Mark as cancelled
  await sql`UPDATE orders SET status='cancelled' WHERE id=${orderId}`;
  res.send({ success: true });
};
