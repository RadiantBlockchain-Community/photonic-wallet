import baseConfig from "@photonic/eslint-config";
import linguiPlugin from "eslint-plugin-lingui";

export default [
  ...baseConfig,
  {
    plugins: {
      lingui: linguiPlugin,
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**"],
  },
];
