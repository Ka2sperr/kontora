import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Straznik reguly zaleznosci. Zasada nienaruszalna nr 7 mowi, ze `src/domain/`
 * nie importuje niczego z Next.js ani z Drizzle — ten test jest jej egzekucja.
 * Konwencja pilnowana wylacznie przez code review przecieka; tu przeciek jest
 * czerwonym testem w CI.
 *
 * Importy wyciagamy `ts.preProcessFile` z kompilatora TypeScriptu, a nie
 * wlasnym regexem, zeby nie przegapic `export ... from`, `import()` i `require()`
 * ani nie zlapac czegos, co tylko wyglada jak import w komentarzu.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = join(projectRoot, "src");

interface LayerRule {
  /** Katalog w `src/` objety regula. */
  readonly layer: string;
  /** Warstwy, ktore ta warstwa moze importowac. */
  readonly allowedLayers: readonly string[];
  /**
   * Pakiety z node_modules i moduly wbudowane Node, ktore ta warstwa moze
   * importowac. Pusta lista jest celowa: domena i use case'y operuja na portach,
   * wiec nie potrzebuja nawet `node:crypto` (hashowanie to port `Hasher`).
   * Kazde rozszerzenie tej listy to swiadoma decyzja widoczna w diffie.
   */
  readonly allowedPackages: readonly string[];
}

const LAYER_RULES: readonly LayerRule[] = [
  { layer: "domain", allowedLayers: ["domain"], allowedPackages: [] },
  {
    layer: "application",
    allowedLayers: ["domain", "application"],
    allowedPackages: [],
  },
];

type ResolvedImport =
  | { readonly kind: "package"; readonly name: string }
  | { readonly kind: "internal"; readonly path: string };

function resolveImport(fromFile: string, specifier: string): ResolvedImport {
  if (specifier.startsWith(".")) {
    return { kind: "internal", path: resolve(dirname(fromFile), specifier) };
  }

  if (specifier.startsWith("@/")) {
    return { kind: "internal", path: join(srcRoot, specifier.slice(2)) };
  }

  return { kind: "package", name: specifier };
}

/** Pierwszy segment sciezki wzgledem `src/`, czyli nazwa warstwy. */
function layerOf(absolutePath: string): string | null {
  const relativePath = relative(srcRoot, absolutePath);

  if (relativePath.startsWith("..") || relativePath === "") {
    return null;
  }

  return relativePath.split(sep)[0] ?? null;
}

/**
 * Wydzielone jako czysta funkcja, zeby dalo sie sprawdzic, ze straznik naprawde
 * lapie przecieki. Test, ktory przechodzi tylko dlatego, ze nic nie sprawdza,
 * jest gorszy od braku testu.
 */
function violationsFor(
  file: string,
  specifiers: readonly string[],
  rule: LayerRule,
): string[] {
  const where = relative(projectRoot, file).split(sep).join("/");

  return specifiers.flatMap((specifier) => {
    const target = resolveImport(file, specifier);

    if (target.kind === "package") {
      const allowed = rule.allowedPackages.includes(target.name);
      return allowed
        ? []
        : [
            `${where}: import pakietu "${specifier}" — warstwa ${rule.layer} musi byc testowalna bez frameworka i bez I/O`,
          ];
    }

    const targetLayer = layerOf(target.path);

    if (targetLayer === null) {
      return [
        `${where}: import "${specifier}" wyprowadza poza src/ — warstwa ${rule.layer} nie moze siegac na zewnatrz`,
      ];
    }

    if (!rule.allowedLayers.includes(targetLayer)) {
      return [
        `${where}: import "${specifier}" z warstwy ${targetLayer} — warstwa ${rule.layer} moze importowac tylko: ${rule.allowedLayers.join(", ")}`,
      ];
    }

    return [];
  });
}

function typeScriptFilesIn(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      return typeScriptFilesIn(full);
    }

    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
      ? [full]
      : [];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return ts
    .preProcessFile(source, true, true)
    .importedFiles.map((reference) => reference.fileName);
}

describe("regula zaleznosci miedzy warstwami", () => {
  for (const rule of LAYER_RULES) {
    it(`src/${rule.layer}/ nie przecieka na zewnatrz`, () => {
      const files = typeScriptFilesIn(join(srcRoot, rule.layer));

      const violations = files.flatMap((file) =>
        violationsFor(file, importsOf(file), rule),
      );

      expect(violations).toEqual([]);
    });
  }
});

describe("straznik faktycznie wykrywa przecieki", () => {
  const domainRule = LAYER_RULES[0] as LayerRule;
  const applicationRule = LAYER_RULES[1] as LayerRule;
  const domainFile = join(srcRoot, "domain", "ledger", "transfer.ts");
  const applicationFile = join(
    srcRoot,
    "application",
    "transfers",
    "execute-internal-transfer.ts",
  );

  it("odrzuca import ORM-a w domenie", () => {
    expect(violationsFor(domainFile, ["drizzle-orm"], domainRule)).toHaveLength(
      1,
    );
  });

  it("odrzuca import infrastruktury w domenie", () => {
    expect(
      violationsFor(domainFile, ["@/infrastructure/db/client"], domainRule),
    ).toHaveLength(1);
  });

  it("odrzuca relatywna sciezke wyprowadzajaca z domeny", () => {
    expect(
      violationsFor(domainFile, ["../../infrastructure/db/client"], domainRule),
    ).toHaveLength(1);
  });

  it("przepuszcza importy wewnatrz domeny", () => {
    expect(
      violationsFor(
        domainFile,
        ["../money/money", "@/domain/errors"],
        domainRule,
      ),
    ).toEqual([]);
  });

  it("pozwala warstwie application uzywac domeny, ale nie infrastruktury", () => {
    expect(
      violationsFor(applicationFile, ["@/domain/money/money"], applicationRule),
    ).toEqual([]);
    expect(
      violationsFor(applicationFile, ["postgres"], applicationRule),
    ).toHaveLength(1);
  });
});
