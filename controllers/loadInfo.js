const { check, validationResult } = require("express-validator");

const sql = require("../db");

const stripe = require("stripe")(process.env.STRIPE_SECRET);

module.exports.getMe = async (req, res) => {
  try {
    // Reading from variable set by middleware from db (up to date)
    const { id, name, email, phone, created_at, image_url } = req.user;
    res.send({
      success: true,
      data: {
        id,
        username: name,
        email,
        phone,
        image_url,
        created_at,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(501).send({ error: "Cannot get your info at the moment" });
  }
};

module.exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await sql`SELECT * FROM orders WHERE user_id=${userId}`;
    res.send({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(501).send({ error: "Cannot get your orders" });
  }
};

module.exports.getOrderDetails = async (req, res) => {
  // OrderId
  await check("id").isInt().trim().run(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send({ error: errors.array() });
  }
  try {
    const userId = req.user.id;
    const orderId = Number(req.query.id);

    // select order, has to belong to user
    let result =
      await sql`SELECT * FROM orders WHERE id=${orderId} AND user_id=${userId}`;
    if (result.length < 1) {
      return res.status(400).send({ error: "Order not found" });
    }

    //Search for items and food details
    const resultOrderItems = await sql`SELECT 
          oi.id AS order_item_id,
          f.id AS food_id,
          f.name,
          f.description,
          f.image_url,
          oi.quantity,
          oi.price_at_order
        FROM order_items oi
        JOIN foods f ON oi.food_id = f.id
        WHERE oi.order_id = ${orderId};`;

    //add items to the result obj
    result[0].items = resultOrderItems;
    res.send({ success: true, data: result[0] });
  } catch (err) {
    console.error(err);
    res.status(501).send({ error: "Cannot get your order details" });
  }
};

module.exports.getCooks = async (req, res) => {
  try {
    //Location of user
    await check("lat").isFloat().run(req);
    await check("lng").isFloat().run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.send({ errors: errors.array() });
    }

    const radiusMeters = 25000; // 25km

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    // Get cooks that are online in 25km radius
    // Ordered by distance at least for now
    const result = await sql`
      SELECT
        id,
        name,
        ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) AS distance_meters
      FROM cooks
      WHERE is_online = TRUE
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY distance_meters ASC;
    `;

    res.send({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(501).send({ error: "Cannot get cooks at the moment" });
  }
};

module.exports.getFoodOfCook = async (req, res) => {
  await check("id").isInt().trim().run(req);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).send({ error: errors.array() });
  }
  try {
    const cookId = Number(req.query.id);

    const result = await sql`SELECT * FROM foods WHERE cook_id=${cookId}`;
    if (result.length < 1) {
      // No food OR cook_id wrong
      return res.status(400).send({ error: "No food found" });
    }

    res.send({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(501).send({ error: "Cannot get food right now" });
  }
};

module.exports.getMainScreen = async (req, res) => {
  try {
    //Location of user
    await check("lat").isFloat().run(req);
    await check("lng").isFloat().run(req);

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.send({ errors: errors.array() });
    }

    const radiusMeters = 25000; // 25km

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    // Check if there is at least one driver online within 25km radius
    const driverResult = await sql`
  SELECT id FROM drivers
  WHERE is_online = TRUE
    AND ST_DWithin(
      location,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusMeters}
    )
  LIMIT 1;
`;
    if (driverResult.length < 1) {
      console.log("no driver");
      return res.send({
        error: "No driver available within 25km",
        isNoDriver: true,
      });
    }

    // Get cooks that are online in 25km radius
    // Ordered by distance
    const result = await sql`
      SELECT
        id,
        name,
        description,
        image_url,
        ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) AS distance_meters
      FROM cooks
      WHERE is_online = TRUE
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY distance_meters ASC;
    `;

    // Attach foods for each cook
    for (const cook of result) {
      const foods = await sql`SELECT * FROM foods WHERE cook_id=${cook.id}`;
      cook.foods = foods;
    }
    res.send({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(501).send({ error: "Cannot get cooks at the moment" });
  }
};
