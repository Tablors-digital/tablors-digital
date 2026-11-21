import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { ledgerEntries, ledgerJournals, pots as potsTable } from "@/server/db/schema";
import { listDocs, putDoc } from "@/server/modules/data/documents";
import { postJournalDb } from "./db-ledger";
import { listPotsDb } from "./db-pots";
import { Ledger, type Account, type Leg } from "./ledger";
import { PaymentService } from "./payments";
import { PayoutService, type Payout } from "./payouts";
import { PayrollService, type PayrollRun } from "./payroll";
import { Directory, type Employee, type Vendor } from "./directory";
import type { AllocationRule } from "./rules";
import {
  AlertCenter,
  AuditLog,
  DEFAULT_POTS,
  RuleRegistry,
  createCustomPot,
  createDefaultPots,
  type ActorRole,
  type AuditEntry,
  type OwnerAlert,
  type Pot,
  type PotType,
} from "./support";

export const DEMO_BUSINESS_ID = "demo-business";

export interface PotsRuntime {
  restaurantId: string;
  ledger: Ledger;
  audit: AuditLog;
  alerts: AlertCenter;
  registry: RuleRegistry;
  payments: PaymentService;
  payouts: PayoutService;
  payroll: PayrollService;
  directory: Directory;
  pots: Pot[];
  potIds: string[];
}

const DOC_COLLECTION = "pots_state";

async function saveStateDoc(restaurantId: string, key: string, payload: unknown): Promise<void> {
  try {
    await putDoc(restaurantId, DOC_COLLECTION, key, payload);
  } catch (err) {
    console.error(`[pots-db] failed to persist ${key} for ${restaurantId}:`, err);
  }
}

function reviveDates<T>(val: T): T {
  if (Array.isArray(val)) return val.map(reviveDates) as unknown as T;
  if (val && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (
        typeof v === "string" &&
        (k === "at" || k === "createdAt" || k === "approvedAt" || k === "effectiveFrom" || k === "effectiveTo") &&
        !Number.isNaN(Date.parse(v))
      ) {
        out[k] = new Date(v);
      } else {
        out[k] = reviveDates(v);
      }
    }
    return out as T;
  }
  return val;
}

function attachPersistence(rt: PotsRuntime): void {
  const tenantId = rt.restaurantId;

  const origPost = rt.ledger.post.bind(rt.ledger);
  rt.ledger.post = (businessId: string, key: string, sourceId: string, legs: Leg[], actorId: string, at: Date, reason?: string) => {
    const scopedBusinessId = businessId || tenantId;
    const wrote = origPost(scopedBusinessId, key, sourceId, legs, actorId, at, reason);
    if (wrote) {
      void postJournalDb({ businessId: scopedBusinessId, key, sourceId, legs, actorId, at, reason }).catch((err) =>
        console.error("[pots-db] failed to persist journal", key, err),
      );
    }
    return wrote;
  };

  const origAudit = rt.audit.record.bind(rt.audit);
  rt.audit.record = (e) => {
    const row = origAudit({ ...e, businessId: e.businessId || tenantId });
    void saveStateDoc(tenantId, "audit", rt.audit.list(tenantId));
    return row;
  };

  const origAlert = rt.alerts.raise.bind(rt.alerts);
  rt.alerts.raise = (businessId, code, message, at, data) => {
    const row = origAlert(businessId || tenantId, code, message, at, data);
    void saveStateDoc(tenantId, "alerts", rt.alerts.list(tenantId));
    return row;
  };

  const origPublish = rt.registry.publish.bind(rt.registry);
  rt.registry.publish = (businessId, input, actor, ctx) => {
    const rule = origPublish(businessId || tenantId, input, actor, ctx);
    void saveStateDoc(tenantId, "rules", rt.registry.forBusiness(tenantId));
    return rule;
  };

  const persistPayouts = () => saveStateDoc(tenantId, "payouts", rt.payouts.list(tenantId));
  const origReq = rt.payouts.requestPayout.bind(rt.payouts);
  rt.payouts.requestPayout = (i) => { const p = origReq({ ...i, businessId: i.businessId || tenantId }); void persistPayouts(); return p; };
  const origApp = rt.payouts.approvePayout.bind(rt.payouts);
  rt.payouts.approvePayout = (i) => { const p = origApp(i); void persistPayouts(); return p; };
  const origCan = rt.payouts.cancelPayout.bind(rt.payouts);
  rt.payouts.cancelPayout = (id, a, r) => { const p = origCan(id, a, r); void persistPayouts(); return p; };
  const origExe = rt.payouts.executePayout.bind(rt.payouts);
  rt.payouts.executePayout = (id, res, at) => { const p = origExe(id, res, at); void persistPayouts(); return p; };

  const persistPayroll = () => saveStateDoc(tenantId, "payroll", rt.payroll.list(tenantId));
  const origCreateRun = rt.payroll.createRun.bind(rt.payroll);
  rt.payroll.createRun = (i) => { const r = origCreateRun({ ...i, businessId: i.businessId || tenantId }); void persistPayroll(); return r; };
  const origAdjItem = rt.payroll.adjustItem.bind(rt.payroll);
  rt.payroll.adjustItem = (i) => { const x = origAdjItem(i); void persistPayroll(); return x; };
  const origAppRun = rt.payroll.approve.bind(rt.payroll);
  rt.payroll.approve = (i) => { const r = origAppRun(i); void persistPayroll(); return r; };
  const origExeRun = rt.payroll.execute.bind(rt.payroll);
  rt.payroll.execute = (i) => { const r = origExeRun(i); void persistPayroll(); return r; };

  const persistDir = () =>
    saveStateDoc(tenantId, "directory", {
      employees: rt.directory.employees(tenantId),
      vendors: rt.directory.vendors(tenantId),
    });
  const origAddEmp = rt.directory.addEmployee.bind(rt.directory);
  rt.directory.addEmployee = (b, i, r) => { const e = origAddEmp(b || tenantId, i, r); void persistDir(); return e; };
  const origAddVen = rt.directory.addVendor.bind(rt.directory);
  rt.directory.addVendor = (b, i, r) => { const v = origAddVen(b || tenantId, i, r); void persistDir(); return v; };
}

function buildEmpty(restaurantId: string): PotsRuntime {
  const ledger = new Ledger();
  const audit = new AuditLog();
  const alerts = new AlertCenter();
  const registry = new RuleRegistry(audit, alerts);
  const pots = createDefaultPots(restaurantId);
  const potIds = pots.map((p) => p.id);
  const payments = new PaymentService({
    ledger,
    audit,
    alerts,
    potIds: () => potIds,
    getRules: (businessId) => registry.forBusiness(businessId),
  });
  const payouts = new PayoutService({ ledger, audit, alerts, potIds: () => potIds });
  return {
    restaurantId,
    ledger,
    audit,
    alerts,
    registry,
    payments,
    payouts,
    payroll: new PayrollService(payouts),
    directory: new Directory(),
    pots,
    potIds,
  };
}

async function hydrateFromDb(rt: PotsRuntime): Promise<void> {
  const tenantId = rt.restaurantId;

  for (const d of DEFAULT_POTS) {
    await db
      .insert(potsTable)
      .values({ id: `${tenantId}:${d.type}`, businessId: tenantId, type: d.type, name: d.name })
      .onConflictDoNothing();
  }
  const dbPots = await listPotsDb(tenantId);
  if (dbPots.length > 0) {
    rt.pots.splice(
      0,
      rt.pots.length,
      ...dbPots.map((p) => ({
        id: p.id,
        businessId: p.businessId,
        type: p.type as PotType,
        name: p.name,
        status: "ACTIVE" as const,
      })),
    );
    rt.potIds.splice(0, rt.potIds.length, ...rt.pots.map((p) => p.id));
  }

  const journals = await db
    .select()
    .from(ledgerJournals)
    .where(eq(ledgerJournals.businessId, tenantId))
    .orderBy(asc(ledgerJournals.createdAt));

  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.businessId, tenantId))
    .orderBy(asc(ledgerEntries.createdAt));

  const entriesByJournal = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = entriesByJournal.get(e.journalId) ?? [];
    arr.push(e);
    entriesByJournal.set(e.journalId, arr);
  }

  for (const j of journals) {
    const jEntries = entriesByJournal.get(j.id) ?? [];
    if (jEntries.length === 0) continue;
    rt.ledger.post(
      j.businessId,
      j.idempotencyKey,
      j.sourceId,
      jEntries.map((e) => ({
        account: e.account as Account,
        amount: e.amountPaise,
        sourceType: e.sourceType as Leg["sourceType"],
        ruleId: e.ruleId ?? undefined,
        ruleVersion: e.ruleVersion ?? undefined,
      })),
      j.actorId,
      j.createdAt,
      j.reason ?? undefined,
    );
  }

  const docs = await listDocs<unknown>(tenantId, DOC_COLLECTION);
  const byId = new Map(docs.map((d) => [d.id, reviveDates(d.data)]));

  const savedRules = byId.get("rules") as AllocationRule[] | undefined;
  if (Array.isArray(savedRules)) {
    (rt.registry as unknown as { rules: AllocationRule[] }).rules.push(...savedRules);
  }

  const savedPayouts = byId.get("payouts") as Payout[] | undefined;
  if (Array.isArray(savedPayouts)) {
    const map = (rt.payouts as unknown as { payouts: Map<string, Payout> }).payouts;
    for (const p of savedPayouts) map.set(p.id, p);
  }

  const savedPayroll = byId.get("payroll") as PayrollRun[] | undefined;
  if (Array.isArray(savedPayroll)) {
    const map = (rt.payroll as unknown as { runs: Map<string, PayrollRun> }).runs;
    for (const r of savedPayroll) map.set(r.id, r);
  }

  const savedDir = byId.get("directory") as { employees?: Employee[]; vendors?: Vendor[] } | undefined;
  if (savedDir) {
    const empMap = (rt.directory as unknown as { emps: Map<string, Employee> }).emps;
    const venMap = (rt.directory as unknown as { vends: Map<string, Vendor> }).vends;
    for (const e of savedDir.employees ?? []) empMap.set(e.id, e);
    for (const v of savedDir.vendors ?? []) venMap.set(v.id, v);
  }

  const savedAudit = byId.get("audit") as AuditEntry[] | undefined;
  if (Array.isArray(savedAudit)) {
    (rt.audit as unknown as { rows: AuditEntry[] }).rows.push(...savedAudit);
  }

  const savedAlerts = byId.get("alerts") as OwnerAlert[] | undefined;
  if (Array.isArray(savedAlerts)) {
    (rt.alerts as unknown as { rows: OwnerAlert[] }).rows.push(...savedAlerts);
  }
}

export async function addCustomPot(
  rt: PotsRuntime,
  name: string,
  role: ActorRole,
  actorId = "owner",
  restaurantId = rt.restaurantId,
): Promise<Pot> {
  const pot = createCustomPot(restaurantId, name, rt.pots, role);
  await db.insert(potsTable).values({ id: pot.id, businessId: restaurantId, type: "CUSTOM", name: pot.name });
  rt.pots.push(pot);
  rt.potIds.push(pot.id);
  rt.audit.record({
    businessId: restaurantId,
    actorId,
    action: "POT_CREATED",
    entity: "pot",
    entityId: pot.id,
    after: pot,
    at: new Date(),
  });
  return pot;
}

const g = globalThis as unknown as {
  __tablorsPotsRuntimes?: Map<string, PotsRuntime>;
  __tablorsPotsHydrating?: Map<string, Promise<PotsRuntime>>;
};

function getRuntimeMap(): Map<string, PotsRuntime> {
  return (g.__tablorsPotsRuntimes ??= new Map<string, PotsRuntime>());
}

function getHydratingMap(): Map<string, Promise<PotsRuntime>> {
  return (g.__tablorsPotsHydrating ??= new Map<string, Promise<PotsRuntime>>());
}

export async function ensurePotsRuntime(restaurantId = DEMO_BUSINESS_ID): Promise<PotsRuntime> {
  const tenantId = restaurantId || DEMO_BUSINESS_ID;
  const existing = getRuntimeMap().get(tenantId);
  if (existing) return existing;

  const hydrating = getHydratingMap();
  const inflight = hydrating.get(tenantId);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const rt = buildEmpty(tenantId);
      await hydrateFromDb(rt);
      attachPersistence(rt);
      getRuntimeMap().set(tenantId, rt);
      return rt;
    } finally {
      hydrating.delete(tenantId);
    }
  })();

  hydrating.set(tenantId, promise);
  return promise;
}

export function getPotsRuntime(restaurantId = DEMO_BUSINESS_ID): PotsRuntime {
  const tenantId = restaurantId || DEMO_BUSINESS_ID;
  const map = getRuntimeMap();
  let rt = map.get(tenantId);
  if (!rt) {
    rt = buildEmpty(tenantId);
    attachPersistence(rt);
    map.set(tenantId, rt);
  }
  return rt;
}

export async function refreshPotsList(restaurantId = DEMO_BUSINESS_ID): Promise<void> {
  const tenantId = restaurantId || DEMO_BUSINESS_ID;
  const rt = await ensurePotsRuntime(tenantId);
  const dbPots = await listPotsDb(tenantId);
  rt.pots.splice(
    0,
    rt.pots.length,
    ...dbPots.map((p) => ({
      id: p.id,
      businessId: p.businessId,
      type: p.type as PotType,
      name: p.name,
      status: "ACTIVE" as const,
    })),
  );
  rt.potIds.splice(0, rt.potIds.length, ...rt.pots.map((p) => p.id));
}

export function resetPotsRuntimeForTests(): void {
  g.__tablorsPotsRuntimes?.clear();
  g.__tablorsPotsHydrating?.clear();
}