import baseConfig from "@photonic/eslint-config";

export default [
  ...baseConfig,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
