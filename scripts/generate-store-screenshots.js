const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const template = path.join(root, "store-assets", "screenshots", "template.html");
const outRoot = path.join(root, "store-assets", "screenshots");

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (!chrome) {
  console.error("Chrome/Chromium was not found. Set CHROME_BIN to a browser executable.");
  process.exit(1);
}

const targets = [
  { name: "app-store", width: 1290, height: 2796 },
  { name: "play-store", width: 1080, height: 1920 },
];

const slides = [
  ["01_tasks", "tasks"],
  ["02_task_detail", "detail"],
  ["03_chat", "chat"],
  ["04_conversation", "conversation"],
  ["05_leaves", "leaves"],
  ["06_notifications", "notifications"],
];

for (const target of targets) {
  const outDir = path.join(outRoot, target.name);
  fs.mkdirSync(outDir, { recursive: true });

  for (const [fileName, slide] of slides) {
    const output = path.join(outDir, `${fileName}.png`);
    const url = `file://${template}?slide=${encodeURIComponent(slide)}`;
    execFileSync(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${target.width},${target.height}`,
      `--screenshot=${output}`,
      url,
    ], { stdio: "inherit" });
  }
}

console.log(`Generated ${targets.length * slides.length} screenshots in ${outRoot}`);
