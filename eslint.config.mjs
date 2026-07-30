import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * Pakiety, ktorych warstwa domenowa nie ma prawa dotknac. Domena musi byc
 * testowalna bez bazy i bez frameworka (zasada nienaruszalna nr 7).
 */
const FRAMEWORK_AND_IO_PACKAGES = [
  "next",
  "next/*",
  "react",
  "react-dom",
  "drizzle-orm",
  "drizzle-orm/*",
  "drizzle-kit",
  "postgres",
  "argon2",
  "@node-rs/*",
  "server-only",
];

/** Warstwy lezace na zewnatrz domeny — zaleznosc zawsze wskazuje do srodka. */
const OUTER_LAYERS = [
  "@/app/*",
  "@/http/*",
  "@/infrastructure/*",
  "@/components/*",
  "@/lib/*",
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/infrastructure/db/migrations/**",
    ],
  },
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: FRAMEWORK_AND_IO_PACKAGES,
              message:
                "src/domain/ nie moze zalezec od frameworka ani I/O. Zdefiniuj port w src/domain/ports/ i wstrzyknij implementacje.",
            },
            {
              group: [...OUTER_LAYERS, "@/application/*"],
              message:
                "Zaleznosc wskazuje do srodka: domena nie widzi warstw zewnetrznych.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "parseFloat",
          message:
            "Arytmetyka pieniedzy tylko na bigint w jednostkach minor (zasada nienaruszalna nr 1).",
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: FRAMEWORK_AND_IO_PACKAGES,
              message:
                "Use case orkiestruje porty, nie zna Postgresa ani Next.js. Konkretna implementacja wstrzykiwana jest w src/infrastructure/.",
            },
            {
              group: OUTER_LAYERS,
              message:
                "Zaleznosc wskazuje do srodka: warstwa application nie widzi infrastruktury ani UI.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
