const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "templates")));

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "templates", "index.html");
  res.sendFile(filePath);
});

app.post("/download", async (req, res) => {
  const websiteURL = req.body.url;
  const folder = req.body.folder || "images";

  if (!websiteURL) {
    return res.status(400).json({ message: "❌ Website URL is required." });
  }

  try {
    const tmpFolder = path.join("/tmp", folder);
    await fs.ensureDir(tmpFolder);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(websiteURL, { waitUntil: "networkidle2" });

    // Get image links
    const imgLinks = await page.$$eval("img", imgs =>
      imgs.map(i => i.src).filter(Boolean)
    );

    const iconLinks = await page.$$eval("link[rel~='icon']", links =>
      links.map(l => l.href).filter(Boolean)
    );

    const bgInline = await page.$$eval("*", els =>
      els.map(el => {
        const bg = el.style?.backgroundImage || "";
        const match = bg.match(/url\(["']?(.*?)["']?\)/);
        return match ? match[1] : null;
      }).filter(Boolean)
    );

    const bgComputed = await page.evaluate(() => {
      const urls = new Set();
      document.querySelectorAll("*").forEach(el => {
        const style = getComputedStyle(el);
        const bg = style.getPropertyValue("background-image");
        const match = bg.match(/url\(["']?(.*?)["']?\)/);
        if (match) urls.add(match[1]);
      });
      return Array.from(urls);
    });

    const allLinks = [...imgLinks, ...iconLinks, ...bgInline, ...bgComputed]
      .map(link => {
        if (link.startsWith("//")) return "https:" + link;
        if (link.startsWith("/")) return websiteURL + link;
        return link;
      })
      .filter(link => link.startsWith("http"));

    let index = 1;
    const downloadedFiles = [];
    for (const link of allLinks) {
      const fileName = await downloadImage(link, tmpFolder, index++);
      if (fileName) downloadedFiles.push(fileName);
    }

    await browser.close();

    res.json({ 
      message: `✅ Downloaded ${downloadedFiles.length} images to /tmp/${folder}`,
      files: downloadedFiles
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Failed to download images." });
  }
});

const downloadImage = async (url, folder, index) => {
  try {
    const res = await axios.get(url, {
      responseType: "stream",
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const contentType = res.headers["content-type"];
    if (!contentType.startsWith("image/")) return null;

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
    return fileName;
  } catch (err) {
    console.log(`❌ Failed: ${url}`);
    return null;
  }
};

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}`));
