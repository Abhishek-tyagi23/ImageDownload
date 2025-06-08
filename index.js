const puppeteer = require("puppeteer");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const downloadImage = async (url, folder, index) => {
  try {
    const res = await axios.get(url, {
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
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

(async () => {
  const websiteURL = "https://usaplumbingandair.com/";
  const folder = "E://Study//Video Download//image-downloader//img";
  await fs.ensureDir(folder);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(websiteURL, { waitUntil: "networkidle2" });


  const imgLinks = await page.$$eval("img", imgs =>
    imgs.map(i => i.src).filter(Boolean)
  );


  const iconLinks = await page.$$eval("link[rel~='icon']", links =>
    links.map(l => l.href).filter(Boolean)
  );


  const bgInline = await page.$$eval("*", els =>
    els
      .map(el => {
        const bg = el.style?.backgroundImage || "";
        const match = bg.match(/url\(["']?(.*?)["']?\)/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
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


  const allLinks = [
    ...imgLinks,
    ...iconLinks,
    ...bgInline,
    ...bgComputed
  ]
    .map(link => {
      if (link.startsWith("//")) return "https:" + link;
      if (link.startsWith("/")) return websiteURL + link;
      return link;
    })
    .filter(link => link.startsWith("http"));

  console.log(`🖼️ Found ${allLinks.length} images`);

  let index = 1;
  for (const link of allLinks) {
    await downloadImage(link, folder, index++);
  }

  await browser.close();
})();
