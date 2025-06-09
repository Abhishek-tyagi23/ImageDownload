const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'templates')));

const extractCssUrls = css =>
  [...css.matchAll(/url\((["']?)(.*?)\1\)/g)].map(m => m[2]);

const resolve = (url, base) => {
  if (url.startsWith('http')) return url;
  try { return new URL(url, base).href; } catch { return null; }
};

// Fetch CSS content and extract images
async function processCssLinks(sheetUrls, base, set) {
  await Promise.all(sheetUrls.map(async href => {
    const url = resolve(href, base);
    if (!url) return;
    try {
      const { data: css } = await axios.get(url);
      extractCssUrls(css).forEach(u => {
        const abs = resolve(u, url);
        if (abs) set.add(abs);
      });
    } catch { /* ignore fetch errors */ }
  }));
}

app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'templates/index.html')));

app.post('/fetch-images', async (req, res) => {
  const website = req.body.url;
  if (!website) return res.send('Enter a valid URL.');

  try {
    const { data: html } = await axios.get(website, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const $ = cheerio.load(html);
    const images = new Set();

    // <img> tags
    $('img[src]').each((_, el) => {
      const src = resolve($(el).attr('src'), website);
      if (src) images.add(src);
    });

    // Favicons
    $('link[rel~="icon"]').each((_, el) => {
      const href = resolve($(el).attr('href'), website);
      if (href) images.add(href);
    });

    // Inline styles
    $('[style]').each((_, el) =>
      extractCssUrls($(el).attr('style'))
        .forEach(u => {
          const abs = resolve(u, website);
          if (abs) images.add(abs);
        })
    );

    // <style> blocks
    $('style').each((_, el) =>
      extractCssUrls($(el).html())
        .forEach(u => {
          const abs = resolve(u, website);
          if (abs) images.add(abs);
        })
    );

    // External CSS
    const sheetUrls = $('link[rel="stylesheet"]').map((_, el) => $(el).attr('href')).get();
    await processCssLinks(sheetUrls, website, images);

    // Build HTML result
    const htmlImgs = Array.from(images).map(u =>
      `<div><img src="${u}" style="max-width:200px;max-height:200px" onerror="this.remove()"/></div>`
    ).join('');

    res.send(`
      <html><body>
      <a href="/">← Back</a><h2>Found ${images.size} images</h2>
      <div style="display:flex;flex-wrap:wrap">${htmlImgs}</div>
      </body></html>`);
  } catch (e) {
    console.error(e);
    res.send('Failed. Check URL and try again.');
  }
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
