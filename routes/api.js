const express = require("express");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

const {
  getMe,
  getCooks,
  getFoodOfCook,
  getMyOrders,
  getOrderDetails,
  getMainScreen,
} = require("../controllers/loadInfo");

const {
  updateOrder,
  getPayment,
  newOrder,
  cancelOrder,
} = require("../controllers/postOrder");

const { changeAcc } = require("../controllers/changeAcc");
const { uploadPfp, getPfp } = require("../controllers/pfpLogic");

//Get info logic
router.get("/me", getMe);
router.get("/cooks", getCooks);
router.get("/cook/food", getFoodOfCook);
router.get("/me/orders", getMyOrders);
router.get("/me/order", getOrderDetails);
router.get("/main-screen", getMainScreen);

//Account changes
router.post("/change/:changeParam", changeAcc);

//Order logic
router.post("/new-order", newOrder);
router.get("/order/payment", getPayment);
router.get("/order/update", updateOrder);
router.post("/order/cancel", cancelOrder);

//Pfp logic
router.post("/upload-pfp", upload.single("pfp"), uploadPfp);
router.get("/pfp", getPfp);

module.exports = router;
