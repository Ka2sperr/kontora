import { defineConfig } from "vitest/config";

/**
 * Testy, ktore nie potrzebuja bazy: domena, wlasciwosci (fast-check) i straznik
 * architektury. Musza dzialac na czystym checkoucie bez Dockera.
 *
 * Aliasy `@/*` rozwiazuje natywny `resolve.tsconfigPaths` z Vite — wtyczka
 * `vite-tsconfig-paths` jest od Vite 7 zbedna i sama o tym ostrzega.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/{architecture,domain,properties,presentation}/**/*.test.ts"],
    reporters: ["default"],
  },
});
