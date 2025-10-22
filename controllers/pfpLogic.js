const { check } = require("express-validator");
const { fileUpload, getPfpFile } = require("../utils/fileUpload.js");
const sql = require("../db.js");

module.exports.uploadPfp = async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  if (!file.mimetype.startsWith("image/")) {
    return res
      .status(400)
      .json({ error: "Invalid file type. Only images are allowed." });
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return res.status(400).json({ error: "File too large. Max size is 5MB." });
  }
  try {
    const fileUrl = await uploadPfpFile(file, req.user.id);
    if (!fileUrl) {
      return res.status(500).json({ error: "File upload failed" });
    }
    await sql`UPDATE users SET image_url=${fileUrl} WHERE id=${req.user.id}`;
    return res.json({ message: "Profile picture updated" });
  } catch (err) {
    return res.status(500).json({ error: "File upload failed" });
  }
};

module.exports.getPfp = async (req, res) => {
  const userId = req.query.userId;
  const user = await sql`SELECT image_url FROM users WHERE id=${userId}`;
  if (user.length < 1) {
    return res.status(404).json({ error: "User not found" });
  }
  const imageUrl = user[0].image_url;
  if (!imageUrl) {
    return res.status(404).json({ error: "No profile picture set" });
  }
  const signedUrl = await getPfpFile(imageUrl);
  if (!signedUrl) {
    return res
      .status(500)
      .json({ error: "Could not retrieve profile picture" });
  }
  return res.send(signedUrl);
};
