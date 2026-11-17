import { describe, expect, it } from "vitest";
import {
  NAME_MAX,
  computeMenuStats,
  duplicateItemName,
  suggestNextItemCode,
} from "@/lib/menu-shared";

describe("suggestNextItemCode", () => {
  it("starts at 001 on an empty menu", () => {
    expect(suggestNextItemCode([])).toBe("001");
  });

  it("continues after the highest code in use, not the first gap", () => {
    expect(suggestNextItemCode(["001", "002", "005"])).toBe("006");
  });

  it("zero-pads to three digits", () => {
    expect(suggestNextItemCode(["009"])).toBe("010");
    expect(suggestNextItemCode(["099"])).toBe("100");
  });

  it("ignores malformed codes and the unusable 000", () => {
    expect(suggestNextItemCode(["abc", "12", "0001", "000"])).toBe("001");
  });

  it("falls back to the lowest free gap once 999 is used", () => {
    expect(suggestNextItemCode(["001", "003", "999"])).toBe("002");
  });

  it("returns null when every code 001–999 is taken", () => {
    const all = Array.from({ length: 999 }, (_, i) => String(i + 1).padStart(3, "0"));
    expect(suggestNextItemCode(all)).toBeNull();
  });
});

describe("duplicateItemName", () => {
  it("appends (Copy)", () => {
    expect(duplicateItemName("Pepper Chicken")).toBe("Pepper Chicken (Copy)");
  });

  it("tidies whitespace", () => {
    expect(duplicateItemName("  Pepper   Chicken ")).toBe("Pepper Chicken (Copy)");
  });

  it("never exceeds the name limit", () => {
    const out = duplicateItemName("x".repeat(NAME_MAX));
    expect(out.length).toBeLessThanOrEqual(NAME_MAX);
    expect(out.endsWith(" (Copy)")).toBe(true);
  });
});

describe("computeMenuStats", () => {
  const item = (category: string, available: boolean, isSpecial = false, imageUrl: string | null = null) => ({
    category,
    available,
    isSpecial,
    imageUrl,
  });

  it("is all zeros for an empty menu", () => {
    expect(computeMenuStats([])).toEqual({
      total: 0,
      available: 0,
      unavailable: 0,
      specials: 0,
      categories: [],
    });
  });

  it("counts totals, availability and specials", () => {
    const stats = computeMenuStats([
      item("Starters", true, true),
      item("Starters", false),
      item("Desserts", true),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.available).toBe(2);
    expect(stats.unavailable).toBe(1);
    expect(stats.specials).toBe(1);
  });

  it("groups categories in order of first appearance with per-category counts", () => {
    const stats = computeMenuStats([
      item("Starters", true),
      item("Mains", false),
      item("Starters", false),
    ]);
    expect(stats.categories.map((c) => [c.name, c.count, c.available])).toEqual([
      ["Starters", 2, 1],
      ["Mains", 1, 0],
    ]);
  });

  it("uses the first photo in a category as its cover", () => {
    const stats = computeMenuStats([
      item("Starters", true, false, null),
      item("Starters", true, false, "/api/menu-image/a"),
      item("Starters", true, false, "/api/menu-image/b"),
    ]);
    expect(stats.categories[0].cover).toBe("/api/menu-image/a");
  });
});
