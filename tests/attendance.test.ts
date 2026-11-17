/**
 * Integration test for atomic attendance. Needs a real Postgres test database
 * (DATABASE_URL) with the staff_attendance migration applied.
 * Run with: npx vitest run tests/attendance.test.ts
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "../src/server/db/client";
import { staffAttendance } from "../src/server/db/schema";
import {
  correctAttendance,
  listAttendance,
  punchIn,
  punchOut,
} from "../src/server/modules/demo-store/staff";

const R = "test_restaurant";
const S = "staff_test_1";

const wipe = () =>
  db.delete(staffAttendance).where(and(eq(staffAttendance.restaurantId, R), eq(staffAttendance.staffId, S)));

beforeEach(wipe);
afterAll(wipe);

describe("attendance", () => {
  it("lets exactly one of two simultaneous check-ins succeed", async () => {
    const results = await Promise.all([punchIn(R, S, "2026-11-17"), punchIn(R, S, "2026-11-17")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await listAttendance(R, S, "2026-11")).toHaveLength(1);
  });

  it("lets exactly one of two simultaneous check-outs succeed", async () => {
    await punchIn(R, S, "2026-11-17");
    const results = await Promise.all([punchOut(R, S, "2026-11-17"), punchOut(R, S, "2026-11-17")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("blocks check-out without a check-in", async () => {
    const r = await punchOut(R, S, "2026-11-17");
    expect(r).toEqual({ ok: false, error: "Check in first." });
  });

  it("blocks a second check-in on the same day", async () => {
    await punchIn(R, S, "2026-11-17");
    await punchOut(R, S, "2026-11-17");
    const r = await punchIn(R, S, "2026-11-17");
    expect(r.ok).toBe(false);
  });

  it("closes an overnight shift after midnight under the start date", async () => {
    const startedAt = new Date(Date.now() - 8 * 60 * 60_000);
    await db.insert(staffAttendance).values({
      id: `${S}:2026-11-16`,
      restaurantId: R,
      staffId: S,
      workDate: "2026-11-16",
      checkInAt: startedAt,
    });
    // It is now the next calendar day; the open shift from yesterday must still close.
    const out = await punchOut(R, S, "2026-11-17");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.entry.date).toBe("2026-11-16");
      expect(out.entry.workedMinutes).toBeGreaterThanOrEqual(479);
      expect(out.entry.workedMinutes).toBeLessThanOrEqual(481);
    }
  });

  it("blocks a new check-in while yesterday's shift is still open", async () => {
    await db.insert(staffAttendance).values({
      id: `${S}:2026-11-16`,
      restaurantId: R,
      staffId: S,
      workDate: "2026-11-16",
      checkInAt: new Date(Date.now() - 2 * 60 * 60_000),
    });
    const r = await punchIn(R, S, "2026-11-17");
    expect(r.ok).toBe(false);
  });

  it("keeps the old values when a manager corrects a day", async () => {
    await punchIn(R, S, "2026-11-17");
    const entry = await correctAttendance(
      R,
      S,
      "2026-11-17",
      { checkIn: "2026-11-17T03:30:00.000Z", checkOut: "2026-11-17T12:00:00.000Z" },
      "forgot to punch out",
      "manager_1",
    );
    expect(entry.workedMinutes).toBe(510);
    expect(entry.corrections).toHaveLength(1);
    expect(entry.corrections[0].before.checkOut).toBeNull();
  });

  it("rejects a check-out before the check-in", async () => {
    await expect(
      correctAttendance(
        R,
        S,
        "2026-11-17",
        { checkIn: "2026-11-17T10:00:00.000Z", checkOut: "2026-11-17T09:00:00.000Z" },
        "typo",
        "manager_1",
      ),
    ).rejects.toThrow("after check-in");
  });
});