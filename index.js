const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "templates")));

app.use("/downloads", express.static("/tmp/downloads"));

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "templates", "index.html");
  res.sendFile(filePath);
});

app.post("/download", async (req, res) => {
  const websiteURL = req.body.url;
  if (!websiteURL) {
    return res.json({ message: "❌ Website URL is required." });
  }

  const downloadPath = path.join("/tmp", "downloads");
  await fs.emptyDir(downloadPath); // clear previous downloads

  try {
    console.log("Launching Puppeteer...");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    console.log("Loading page:", websiteURL);
    await page.goto(websiteURL, { waitUntil: "networkidle2", timeout: 60000 });

    // Get all img src links
    const imgLinks = await page.$$eval("img", (imgs) =>
      imgs.map((i) => i.src).filter(Boolean)
    );

    await browser.close();

    // Fix URLs properly using new URL()
    const fixedLinks = imgLinks
      .map((link) => {
        try {
          return new URL(link, websiteURL).href;
        } catch {
          return null;
        }
      })
      .filter((link) => link && link.startsWith("http"));

    console.log(`Found ${fixedLinks.length} images.`);

    let index = 1;
    for (const link of fixedLinks) {
      await downloadImage(link, downloadPath, index++);
    }

    // Create ZIP archive
    const zipPath = path.join("/tmp", "downloads.zip");
    await createZip(downloadPath, zipPath);

    res.json({
      message: `✅ Downloaded ${index - 1} images.`,
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
    console.log(`Downloading image ${index}: ${url}`);
    const res = await axios.get(url, {
      responseType: "stream",
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const contentType = res.headers["content-type"];
    if (!contentType || !contentType.startsWith("image/")) {
      console.log(`Skipped (not image): ${url}`);
      return;
    }

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

    console.log(`✅ Saved: ${fileName}`);
  } catch (err) {
    console.log(`❌ Failed to download: ${url}`);
    console.log(err.message);
  }
}

function createZip(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`ZIP created: ${outPath} (${archive.pointer()} bytes)`);
      resolve();
    });
    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`🚀 Server running at http://localhost:${port}`)
);
