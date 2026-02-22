const stripe = require("stripe")(process.env.STRIPE_SECRET);
const ENDPOINT_SECRET = process.env.ENDPOINT_SECRET;
const sql = require("../db");
const { EVENTS } = require("../routes/socket");
const { cookOrder } = require("../routes/socket");

module.exports.stripePaymentCompleted = (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  //Check stripe signature to verify
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, ENDPOINT_SECRET);
  } catch (err) {
    return res.status(400).send({ error: `Webhook Error: ${err.message}` });
  }

  //If payment succeeded, update
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const [order] = sql`
    UPDATE orders
    SET status = 'paid'
    WHERE id = ${paymentIntent.metadata.orderId}
    RETURNING cook_id
    `;
    if (!order) {
      return res.status(404).send({ error: "order not found" });
    }

    //Contact cook with socket or FCM
    cookOrder(order.cook_id);
    return res.send({ success: true });
  }
  return res.status(400).send({ error: "Unknown event type" });
};
