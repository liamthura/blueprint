import { describe, expect, it } from "vitest";
import { absolutiseDependencies } from "./registry-urls";

const own = new Set(["db", "auth", "button"]);

describe("absolutiseDependencies", () => {
  it("rewrites dependencies belonging to this registry", () => {
    const out = absolutiseDependencies(
      { name: "auth", registryDependencies: ["db"] },
      "https://blueprint.example.com",
      own,
    );
    expect(out.registryDependencies).toEqual(["https://blueprint.example.com/r/db.json"]);
  });

  it("leaves upstream shadcn names alone", () => {
    const out = absolutiseDependencies(
      { name: "data-table", registryDependencies: ["table", "input"] },
      "https://blueprint.example.com",
      own,
    );
    expect(out.registryDependencies).toEqual(["table", "input"]);
  });

  it("leaves entries that are already URLs alone", () => {
    const url = "https://ui.shadcn.com/r/button.json";
    const out = absolutiseDependencies(
      { name: "x", registryDependencies: [url] },
      "https://x.dev",
      own,
    );
    expect(out.registryDependencies).toEqual([url]);
  });

  it("handles an item with no dependencies", () => {
    const out = absolutiseDependencies({ name: "sonner" }, "https://x.dev", own);
    expect(out.registryDependencies).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const input = { name: "auth", registryDependencies: ["db"] };
    absolutiseDependencies(input, "https://x.dev", own);
    expect(input.registryDependencies).toEqual(["db"]);
  });
});
