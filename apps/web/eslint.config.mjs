import next from "eslint-config-next";

const config = [
  ...next,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/modules/*/repo*"], message: "Use the module service, not another module's repository." }] },
      ],
    },
  },
  { ignores: [".next/**", ".next-e2e/**", "e2e/.e2e-state.json", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
];

export default config;
