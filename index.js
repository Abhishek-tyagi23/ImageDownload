const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "templates")));

function extractUrlsFromCss(cssText) {
  const urls = [];
  const regex = /url\((['"]?)(.*?)\1\)/g;
  let match;
  while ((match = regex.exec(cssText)) !== null) {
    urls.push(match[2]);
  }
  return urls;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "templates", "index.html"));
});

app.post("/fetch-images", async (req, res) => {
  const websiteUrl = req.body.url;

  if (!websiteUrl) {
    return res.send("Please enter a valid URL.");
  }

  try {
    // Fetch main HTML page
    const response = await axios.get(websiteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    const html = response.data;
    const $ = cheerio.load(html);

    const imgUrls = new Set();

    // 1) Extract all <img> src
    $("img").each((_, el) => {
      let src = $(el).attr("src");
      if (src) {
        if (!src.startsWith("http")) {
          try {
            src = new URL(src, websiteUrl).href;
          } catch {}
        }
        imgUrls.add(src);
      }
    });

    // 2) Extract favicons from <link rel="icon" or rel="shortcut icon">
    $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').each((_, el) => {
      let href = $(el).attr("href");
      if (href) {
        if (!href.startsWith("http")) {
          try {
            href = new URL(href, websiteUrl).href;
          } catch {}
        }
        imgUrls.add(href);
      }
    });

    // 3) Extract background images from inline styles in elements
    $('[style]').each((_, el) => {
      const style = $(el).attr("style");
      const urls = extractUrlsFromCss(style);
      urls.forEach((url) => {
        let absUrl = url;
        if (!url.startsWith("http")) {
          try {
            absUrl = new URL(url, websiteUrl).href;
          } catch {}
        }
        imgUrls.add(absUrl);
      });
    });

    // 4) Extract background images from <style> blocks inside HTML
    $("style").each((_, el) => {
      const cssText = $(el).html();
      const urls = extractUrlsFromCss(cssText);
      urls.forEach((url) => {
        let absUrl = url;
        if (!url.startsWith("http")) {
          try {
            absUrl = new URL(url, websiteUrl).href;
          } catch {}
        }
        imgUrls.add(absUrl);
      });
    });

    // **OPTIONAL**: You could also fetch external CSS files and parse, but to keep it simple, skipping for now.

    // Convert Set to Array and remove duplicates
    const allImages = Array.from(imgUrls);

    // Create HTML to display images
    let imagesHtml = allImages
      .map(
        (url) =>
          `<div style="margin:10px;"><img src="${url}" style="max-width:200px; max-height:200px;" alt="image" onerror="this.style.display='none'"/></div>`
      )
      .join("");

    if (imagesHtml.trim() === "") {
      imagesHtml = "<p>No images found.</p>";
    }

    const resultPage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Images from ${websiteUrl}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .images-container { display: flex; flex-wrap: wrap; }
          img { border: 1px solid #ccc; border-radius: 4px; }
          a { display: inline-block; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <a href="/">&#8592; Back</a>
        <h2>Images from ${websiteUrl}</h2>
        <div class="images-container">
          ${imagesHtml}
        </div>
      </body>
      </html>
    `;

    res.send(resultPage);
  } catch (error) {
    console.error(error);
    res.send(
      "Failed to fetch images. Make sure the URL is correct and the website allows scraping."
    );
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
