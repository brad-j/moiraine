import { defineConfig } from "@playwright/test";

// Browser tests of the app (`pnpm e2e`, which builds first). Each test starts gaidin's e2e server on the scripted
// model, serving this build (e2e/fixtures.ts).
export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: true,
	reporter: "list",
	timeout: 30_000,
	use: { browserName: "chromium", trace: "retain-on-failure" },
	outputDir: "e2e/results",
});
