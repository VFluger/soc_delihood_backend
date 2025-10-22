const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");
const sharp = require("sharp");

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  maxAttempts: 1,
});

module.exports.uploadPfpFile = async (file, userId) => {
  if (!file || !file.buffer || !userId) {
    throw new Error("File or userId not provided");
  }

  const filename = `pfp/UID-${userId}-${crypto.randomUUID()}`;
  try {
    // Process image: crop, resize, and compress to AVIF
    const processedBuffer = await sharp(file.buffer)
      .resize(512, 512, { fit: "cover", position: "center" }) // crop to 1:1
      .avif() // compress to AVIF
      .toBuffer();

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_MAIN_BUCKET,
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

module.exports.getPfpFile = async (filename) => {
  if (!filename) {
    throw new Error("Filename not provided");
  }
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_MAIN_BUCKET,
      Key: filename,
    });
    return await getSignedUrl(r2, command, { expiresIn: 3600 });
  } catch (err) {
    console.error("Error getting file:", err);
    return null;
  }
};

module.exports.uploadFoodImages = async (filenames, userId) => {
  try {
    let namesOfImgs = [];
    for (const el of array) {
      if (!el.mimetype.includes("image/") || el.size >= 5_000_000) {
        throw new Error("All images must be under 5mb");
      }

      const uuid = crypto.randomUUID();
      const imgName = `foods/CID-${req.user.id}-${uuid}`;

      const processedBuffer = await sharp(el.buffer)
        .resize(512, 512, { fit: "cover", position: "center" })
        .avif()
        .toBuffer();

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_MAIN_BUCKET,
          Key: imgName,
          Body: processedBuffer,
          ContentType: "image/avif",
        })
      );

      namesOfImgs.push(imgName);
    }
    return namesOfImgs;
  } catch (err) {
    console.log(err);
    throw new Error("Cannot upload images");
  }
};

module.exports.getFoodImage = async (filename) => {
  if (!filename) {
    throw new Error("No filename provided");
  }
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_MAIN_BUCKET,
      Key: filename,
    });
    // URL valid for 1 hour (3600 seconds)
    return await getSignedUrl(r2, command, { expiresIn: 3600 });
  } catch (err) {
    console.log(err);
    throw new Error("Cannot get food images");
  }
};

module.exports.deleteFoodImages = async (filenames) => {
  let output = [];
  console.log("Filenames to delete: ", filenames);
  if (!filenames || filenames.length < 1) {
    throw new Error("No filename provided");
  }
  try {
    for (let filename of filenames) {
      console.log(filename);
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_MAIN_BUCKET,
          Key: filename,
        })
      );
      output.push(filename);
    }
    console.log("filenames that we're deleted: ", output);
    return output;
  } catch (err) {
    console.log(err);
    throw new Error("Cannot delete food images");
  }
};
