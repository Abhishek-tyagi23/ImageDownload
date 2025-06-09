const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "templates")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "templates", "index.html"));
});

app.post("/fetch-images", async (req, res) => {
  const websiteUrl = req.body.url;

  if (!websiteUrl) {
    return res.send("Please enter a valid URL.");
  }

  try {
    // Fetch website HTML
    const response = await axios.get(websiteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const html = response.data;

    // Parse HTML and extract image URLs using cheerio
    const $ = cheerio.load(html);
    let imgUrls = [];

    $("img").each((i, img) => {
      let src = $(img).attr("src");
      if (src) {
        // Convert relative URLs to absolute URLs
        if (!src.startsWith("http")) {
          try {
            src = new URL(src, websiteUrl).href;
          } catch {
            // ignore invalid URLs
          }
        }
        imgUrls.push(src);
      }
    });

    // Remove duplicates
    imgUrls = [...new Set(imgUrls)];

    // Render simple HTML showing images
    let imagesHtml = imgUrls
      .map(
        (url) =>
          `<div style="margin:10px;"><img src="${url}" style="max-width:200px; max-height:200px;" alt="image" /></div>`
      )
      .join("");

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
          ${imagesHtml || "<p>No images found.</p>"}
        </div>
      </body>
      </html>
    `;

    res.send(resultPage);
  } catch (err) {
    console.error(err);
    res.send("Failed to fetch images from the URL. Make sure URL is correct and publicly accessible.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
