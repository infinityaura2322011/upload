const fs = require("fs");
const path = require("path");

const ASSET_DIR = path.resolve(__dirname, "..", "game", "assets");
const IMAGE_API_URL = process.env.IMAGE_API_URL || (process.env.OPENAI_API_KEY ? "https://api.openai.com/v1/images/generations" : "");

// Google Custom Search — set GOOGLE_CSE_KEY and GOOGLE_CSE_CX in .env
// For 18+ content the CSE must be configured with SafeSearch OFF in the control panel.
async function findGoogleImage(topic, adult = false) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) throw new Error("GOOGLE_CSE_KEY and GOOGLE_CSE_CX are required for Google image search");
  const params = new URLSearchParams({
    key, cx, q: topic, searchType: "image", num: "1",
    safe: adult ? "off" : "active",
    imgSize: "LARGE",
  });
  const body = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params}`);
  const item = body.items?.[0];
  if (!item?.link) throw new Error(`No Google image found for topic: ${topic}`);
  return { url: item.link, title: item.title, pageUrl: item.image?.contextLink || item.link, author: "Google Custom Search", license: "See source page" };
}

function cleanTopic(value) {
  const topic = String(value || "").trim().replace(/[\r\n\0]/g, " ").replace(/\s+/g, " ");
  if (!topic) throw new Error("Provide an image topic, for example: npm run game:art -- enchanted forest");
  return topic.slice(0, 180);
}

function safeExtension(contentType, sourceUrl) {
  const type = String(contentType || "").split(";")[0].toLowerCase();
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/jpeg") return ".jpg";
  const ext = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? (ext === ".jpeg" ? ".jpg" : ext) : ".jpg";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function findWikimediaImage(topic) {
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: topic, gsrnamespace: "6", gsrlimit: "1",
    prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1600", format: "json", origin: "*",
  });
  const body = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  const page = Object.values(body.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl && !info?.url) throw new Error(`No Wikimedia image found for topic: ${topic}`);
  return {
    url: info.thumburl || info.url,
    pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/ /g, "_"))}`,
    title: page.title,
    author: info.extmetadata?.Artist?.value || "Wikimedia Commons contributor",
    license: info.extmetadata?.LicenseShortName?.value || "See source page",
  };
}

async function downloadImage(sourceUrl) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading image`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error(`Source did not return an image (${contentType || "unknown type"})`);
  return { bytes: Buffer.from(await response.arrayBuffer()), extension: safeExtension(contentType, sourceUrl) };
}

async function generateWithApi(topic) {
  if (!IMAGE_API_URL || !process.env.IMAGE_API_KEY && !process.env.OPENAI_API_KEY) return null;
  const key = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const body = {
    model: process.env.IMAGE_MODEL || "gpt-image-1",
    prompt: `Game scene art for a warm narrative game: ${topic}. No text, no logos, no watermark.`,
    size: process.env.IMAGE_SIZE || "1024x1024",
  };
  const response = await fetch(IMAGE_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Image API HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const result = await response.json();
  const item = result.data?.[0];
  if (item?.b64_json) return { bytes: Buffer.from(item.b64_json, "base64"), extension: ".png", source: "AI image API" };
  if (item?.url) {
    const image = await downloadImage(item.url);
    return { ...image, source: "AI image API" };
  }
  throw new Error("Image API returned no image data");
}

async function createGameArt(topicInput, { adult = false } = {}) {
  const topic = cleanTopic(topicInput);
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  let image;
  let attribution;
  try {
    image = await generateWithApi(topic);
    if (image) attribution = { provider: image.source, topic, generated: true };
  } catch (error) {
    console.warn(`AI image generation unavailable: ${error.message}`);
  }
  if (!image) {
    // For adult content use Google CSE (SafeSearch off); otherwise try Wikimedia first
    if (adult || (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX)) {
      try {
        const source = await findGoogleImage(topic, adult);
        image = await downloadImage(source.url);
        attribution = { provider: "Google Custom Search", topic, generated: false, adult, ...source };
      } catch (error) {
        if (adult) throw error; // Google is required for adult content
        console.warn(`Google image search unavailable: ${error.message}`);
      }
    }
  }
  if (!image) {
    const source = await findWikimediaImage(topic);
    image = await downloadImage(source.url);
    attribution = { provider: "Wikimedia Commons", topic, generated: false, ...source };
  }
  const fileName = `scene${image.extension}`;
  fs.writeFileSync(path.join(ASSET_DIR, fileName), image.bytes);
  fs.writeFileSync(path.join(ASSET_DIR, "scene.json"), JSON.stringify({ ...attribution, file: fileName, createdAt: new Date().toISOString() }, null, 2));
  console.log(`Game art saved to game/assets/${fileName}`);
  console.log(`Source: ${attribution.provider}${attribution.pageUrl ? ` (${attribution.pageUrl})` : ""}`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const adultFlag = args.includes("--adult");
  const topic = args.filter((a) => a !== "--adult").join(" ");
  createGameArt(topic, { adult: adultFlag }).catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { cleanTopic, safeExtension, createGameArt, findGoogleImage };
