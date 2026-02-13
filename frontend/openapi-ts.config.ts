import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
  input: "./openapi.json",
  output: "./src/client",
  plugins: [
    {
      name: "@hey-api/sdk",
      asClass: true,
    },
    {
      name: "@hey-api/schemas",
      type: "json",
    },
  ],
})