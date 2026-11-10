import { configSchema, LABEL, teamSchema } from "./validation";

test("label regex matches the contract", () => {
  for (const ok of ["a", "team5", "hack-1", "a".repeat(32)]) expect(LABEL.test(ok)).toBe(true);
  for (const bad of ["", "-a", "a-", "A", "a_b", "a".repeat(33), "é"]) expect(LABEL.test(bad)).toBe(false);
});

test("app port is 80 or 8000-8099", () => {
  const port = (app_port: number) =>
    teamSchema.safeParse({ hackathon: "h", name: "t", app_port, image: "" }).success;
  expect([80, 8000, 8099].map(port)).toEqual([true, true, true]);
  expect([81, 7999, 8100, 443].map(port)).toEqual([false, false, false, false]);
});

test("config extra: at most 20 printable lines, blanks dropped", () => {
  expect(configSchema.parse({ rate_limit: "10", extra: " a \n\n b ", reason: "" })).toEqual({
    rate_limit: 10,
    extra: ["a", "b"],
    reason: "",
  });
  expect(
    configSchema.safeParse({ rate_limit: 1, extra: Array(21).fill("x").join("\n"), reason: "" }).success,
  ).toBe(false);
  expect(configSchema.safeParse({ rate_limit: 1, extra: "tab\there", reason: "" }).success).toBe(false);
});
