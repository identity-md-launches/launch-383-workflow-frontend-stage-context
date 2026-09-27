import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "../docs/evidence/interactions.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173/dist/",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PAWN_CHROMIUM
      ? { executablePath: process.env.PAWN_CHROMIUM }
      : {},
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory ..",
    url: "http://127.0.0.1:4173/dist/",
    reuseExistingServer: true,
  },
});
