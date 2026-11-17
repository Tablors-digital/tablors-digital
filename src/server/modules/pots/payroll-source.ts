import "server-only";

import { designationLabel } from "@/lib/staff-designations";
import {
  computePayable,
  monthlySummary,
  type MonthlySummary,
  type Payable,
} from "@/lib/staff-hours";
import {
  listAttendanceForPeriod,
  listLeaves,
  listStaff,
  todayInIndia,
} from "@/server/modules/demo-store/staff";

/**
 * The ONLY place payroll gets its employees from: the Staff module. No second
 * employee list exists in Financial Pots. Each row is computed from the real
 * attendance, leave and salary records for the chosen month.
 */
export interface PayrollSourceRow {
  staffId: string;
  employeeCode: string;
  name: string;
  designation: string;
  joinedOn: string | null;
  monthlySalaryPaise: number | null;
  summary: MonthlySummary;
  payable: Payable | null;
  /** Why this person is not in the draft (null = included). */
  excluded: "no-salary" | "inactive" | null;
}

export async function buildPayrollSource(
  restaurantId: string,
  period: string,
): Promise<PayrollSourceRow[]> {
  const [staff, attendance, leaves] = await Promise.all([
    listStaff(restaurantId),
    listAttendanceForPeriod(restaurantId, period),
    listLeaves(restaurantId),
  ]);
  const today = todayInIndia();

  return staff.map((m) => {
    const summary = monthlySummary({
      period,
      today,
      joinedOn: m.joinedOn,
      records: attendance.filter((a) => a.staffId === m.id),
      leaves: leaves.filter((l) => l.staffId === m.id),
      cfg: m.hours,
    });
    const payable =
      m.monthlySalaryPaise === null
        ? null
        : computePayable({
            monthlySalaryPaise: m.monthlySalaryPaise,
            summary,
            overtimeRatePerHourPaise: m.overtimeRatePerHourPaise,
          });
    return {
      staffId: m.id,
      employeeCode: m.employeeCode,
      name: m.name,
      designation: designationLabel(m.designation, m.customDesignation),
      joinedOn: m.joinedOn,
      monthlySalaryPaise: m.monthlySalaryPaise,
      summary,
      payable,
      excluded: m.status !== "active" ? "inactive" : m.monthlySalaryPaise === null ? "no-salary" : null,
    };
  });
}
