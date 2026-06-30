import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "screenshots");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.route("**/api/**", async (route) => {
  const url = route.request().url().replace("http://localhost:3000/api", "http://localhost:4006/api");
  await route.continue({ url });
});

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("scheduler.authToken", "dev-screenshot");
  localStorage.setItem("scheduler.authUser", JSON.stringify({ username: "admin", role: "admin" }));
});

const shots = [
  ["calendar-weekday", "/scheduler/calendar"],
  ["teachers", "/scheduler/teachers"],
];

for (const [name, path] of shots) {
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(5000);
  const file = join(outDir, `dashboard-${name}.png`);
  await page.screenshot({ path: file, fullPage: name === "teachers" });
  console.log("saved", file);
}

await browser.close();
