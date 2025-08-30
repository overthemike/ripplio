import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	// We disable dts generation in tsup because we are now using `tsc`
	// to handle it more reliably via the `build:types` script.
	dts: false,
	splitting: false,
	sourcemap: true,
	clean: false, // The parent 'clean' script handles this
});
