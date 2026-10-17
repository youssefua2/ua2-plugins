import { build } from "esbuild";
import { readdirSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";

const pluginsDir = "src/plugins";
const outDir = "dist";

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const plugin of readdirSync(pluginsDir)) {
  const pluginPath = join(pluginsDir, plugin);
  const entry = join(pluginPath, "index.tsx");

  if (!existsSync(entry)) continue;

  console.log(`Building ${plugin}...`);

  await build({
    entryPoints: [entry],
    outfile: join(outDir, plugin, "index.js"),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "esnext",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    external: [
      "@vendetta",
      "@vendetta/*",
      "react",
      "react-native"
    ],
    logLevel: "info"
  });

  // Copy manifest.json
  copyFileSync(
    join(pluginPath, "manifest.json"),
    join(outDir, plugin, "manifest.json")
  );

  console.log(`✓ ${plugin} built`);
}

console.log("All plugins built.");
