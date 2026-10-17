
import { build } from "esbuild";
import {
  readdirSync,
  existsSync,
  mkdirSync,
  copyFileSync
} from "fs";
import { join } from "path";

const pluginsDir = "src/plugins";
const outDir = "dist";

mkdirSync(outDir, { recursive: true });

for (const plugin of readdirSync(pluginsDir)) {
  const pluginPath = join(pluginsDir, plugin);
  const entry = join(pluginPath, "index.tsx");
  const outputPluginDir = join(outDir, plugin);

  if (!existsSync(entry)) {
    console.log(`Skipping ${plugin}: no index.tsx`);
    continue;
  }

  console.log(`Building ${plugin}...`);

  mkdirSync(outputPluginDir, { recursive: true });

  await build({
    entryPoints: [entry],
    outfile: join(outputPluginDir, "index.js"),
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

  const manifest = join(pluginPath, "manifest.json");

  if (existsSync(manifest)) {
    copyFileSync(
      manifest,
      join(outputPluginDir, "manifest.json")
    );
  } else {
    console.warn(`No manifest.json found for ${plugin}`);
  }

  console.log(`Built ${plugin}`);
}

console.log("All plugins processed.");
