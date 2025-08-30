import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "ripplio",
		environment: "jsdom",
		globals: true,
	},
});

