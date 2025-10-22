const admin = require("firebase-admin");
const fs = require("fs");

// load the downloaded service account key
const serviceAccount = JSON.parse(
  fs.readFileSync("./ENV-serviceAccountKey.json", "utf-8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
