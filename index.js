const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "templates")));

// Ensure /downloads serves the downloaded images
app.use("/downloads", express.static(path.join("/tmp", "downloads")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "templates", "index.html"));
});

app.post("/download", async (req, res) => {
  const websiteURL = req.body.url;
  if (!websiteURL) {
    return res.json({ message: "❌ Website URL is required." });
  }

  const downloadPath = path.join("/tmp", "downloads");
  await fs.emptyDir(downloadPath);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(websiteURL, { waitUntil: "networkidle2", timeout: 60000 });

    const imgLinks = await page.$$eval("img", imgs =>
      imgs.map(i => i.src).filter(Boolean)
    );
    await browser.close();

    const fixedLinks = imgLinks
      .map(l => {
        try {
          return new URL(l, websiteURL).href;
        } catch {
          return null;
        }
      })
      .filter(l => l && l.startsWith("http"));

    let index = 1;
    for (const link of fixedLinks) {
      await downloadImage(link, downloadPath, index++);
    }

    const zipPath = path.join("/tmp", "downloads.zip");
    await createZip(downloadPath, zipPath);

    const files = await fs.readdir(downloadPath);
    res.json({
      message: `✅ Downloaded ${files.length} images.`,
      images: files,
      zipLink: "/download-zip",
    });
  } catch (err) {
    console.error("Error in /download:", err);
    res.json({ message: "❌ Failed to download images." });
  }
});

app.get("/download-zip", (req, res) => {
  const zipFile = path.join("/tmp", "downloads.zip");
  if (fs.existsSync(zipFile)) {
    res.download(zipFile, "images.zip");
  } else {
    res.status(404).send("No ZIP file found.");
  }
});

async function downloadImage(url, folder, index) {
  try {
    const res = await axios.get(url, {
      responseType: "stream",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const ct = res.headers["content-type"];
    if (!ct || !ct.startsWith("image/")) return;

    let ext = ct.split("/")[1].split(";")[0];
    if (ext === "svg+xml") ext = "svg";

    const file = path.join(folder, `image-${index}.${ext}`);
    const writer = fs.createWriteStream(file);
    res.data.pipe(writer);
    await new Promise((r, e) => {
      writer.on("finish", r);
      writer.on("error", e);
    });
  } catch (err) {
    console.warn(`Failed to download ${url}: ${err.message}`);
  }
}

function createZip(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`🚀 Server running at http://localhost:${port}`)
);
