const assert = require("assert");
const { cleanTopic, safeExtension } = require("./game_art");

assert.strictEqual(cleanTopic("  moon\n garden  "), "moon garden");
assert.throws(() => cleanTopic("   "), /Provide an image topic/);
assert.strictEqual(safeExtension("image/png", "https://example.test/file"), ".png");
assert.strictEqual(safeExtension("image/jpeg", "https://example.test/file"), ".jpg");
assert.strictEqual(safeExtension("", "https://example.test/file.webp"), ".webp");
console.log("Game art pipeline tests passed.");
