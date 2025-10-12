import { check } from "express-validator";
import { fileUpload, getPfpFile } from "../utils/fileUpload.js";
import sql from "../db.js";

export const uploadPfp = async (req, res) => {
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
    const fileUrl = await fileUpload(file, req.user.id);
  } catch (err) {
    return res.status(500).json({ error: "File upload failed" });
  }
  if (!fileUrl) {
    return res.status(500).json({ error: "File upload failed" });
  }

  await sql`UPDATE users SET image_url=${fileUrl} WHERE id=${req.user.id}`;
  return res.json({ message: "Profile picture updated" });
};

export const getPfp = async (req, res) => {
  const userId = req.user.id;
  const user = await sql`SELECT image_url FROM users WHERE id=${userId}`;
  if (user.length < 1) {
    return res.status(404).json({ error: "User not found" });
  }
  const imageUrl = user[0].image_url;
  if (!imageUrl) {
    return res.status(404).json({ error: "No profile picture set" });
  }
  const fileBuffer = await getPfpFile(imageUrl);
  if (!fileBuffer) {
    return res
      .status(500)
      .json({ error: "Could not retrieve profile picture" });
  }
  return res.send(fileBuffer);
};
