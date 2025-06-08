const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "templates")));

// Serve downloads folder so user can see images
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Home Page
app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "templates", "index.html");
  res.sendFile(filePath);
});

// Download Images Route
app.post("/download", async (req, res) => {
  const websiteURL = req.body.url;
  let folder = req.body.folder || "default";

  const tmpFolder = path.join(__dirname, "downloads", folder);

  if (!websiteURL) {
    return res.json({ message: "❌ Website URL is required.", success: false });
  }

  try {
    await fs.ensureDir(tmpFolder);

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto(websiteURL, { waitUntil: "networkidle2" });

    const imgLinks = await page.$$eval("img", imgs =>
      imgs.map(i => i.src).filter(Boolean)
    );

    let index = 1;
    for (const link of imgLinks) {
      await downloadImage(link, tmpFolder, index++);
    }

    await browser.close();
    res.json({
      message: `✅ Downloaded ${index - 1} images to folder: ${folder}`,
      success: true,
      folder
    });
  } catch (err) {
    console.error(err);
    res.json({ message: "❌ Failed to download images.", success: false });
  }
});

const downloadImage = async (url, folder, index) => {
  try {
    const res = await axios.get(url, {
      responseType: "stream",
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const contentType = res.headers["content-type"];
    if (!contentType.startsWith("image/")) return;

    let ext = contentType.split("/")[1].split(";")[0];
    if (ext === "svg+xml") ext = "svg";

    const fileName = `image-${index}.${ext}`;
    const filePath = path.join(folder, fileName);

    const writer = fs.createWriteStream(filePath);
    res.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log(`✅ Downloaded: ${fileName}`);
  } catch (err) {
    console.log(`❌ Failed: ${url}`);
  }
};

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}`));
