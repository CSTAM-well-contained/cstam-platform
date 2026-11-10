import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Host headers and paths in the traffic log come from the internet: the console must only
// ever insert text. This fails the build if HTML injection or dynamic code shows up.
const FORBIDDEN = [
  /dangerouslySetInnerHTML/,
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /insertAdjacentHTML/,
  /document\.write/,
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts") ? [p] : [];
  });
}

test("no HTML injection or dynamic code in src", () => {
  const hits = files("src").flatMap((f) => {
    const text = readFileSync(f, "utf8");
    return FORBIDDEN.filter((re) => re.test(text)).map((re) => `${f}: ${re}`);
  });
  expect(hits).toEqual([]);
});

test("index.html has no inline script or inline handler", () => {
  const html = readFileSync("index.html", "utf8");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    expect(m[1]).toMatch(/\bsrc=/);
    expect(m[2]!.trim()).toBe("");
  }
  expect(html).not.toMatch(/\son[a-z]+=/i);
});
