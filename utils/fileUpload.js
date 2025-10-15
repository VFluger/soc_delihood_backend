import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import sharp from "sharp";
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  maxAttempts: 1,
});

export const fileUpload = async (file, userId) => {
  if (!file || !file.buffer || !userId) {
    throw new Error("File or userId not provided");
  }

  const filename = `UID-${userId}-${crypto.randomUUID()}`;
  try {
    // Process image: crop, resize, and compress to AVIF
    const processedBuffer = await sharp(file.buffer)
      .resize(512, 512, { fit: "cover", position: "center" }) // crop to 1:1
      .avif() // compress to AVIF
      .toBuffer();

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_PFP_BUCKET,
        Key: filename,
        Body: processedBuffer,
        ContentType: "image/avif",
      })
    );
    return filename;
  } catch (err) {
    console.error("Error uploading file:", err);
  }
};

export const getPfpFile = async (filename) => {
  if (!filename) {
    throw new Error("Filename not provided");
  }
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_PFP_BUCKET,
      Key: filename,
    });
    const file = await r2.send(command);
    if (!file) {
      throw new Error("File not found");
    }
    const chunks = [];
    for await (const chunk of file.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    console.error("Error getting file:", err);
    return null;
  }
};
