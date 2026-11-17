import { getPotsRuntime, DEMO_BUSINESS_ID as B } from "@/server/modules/pots/runtime";
import { profitWithdrawalAction } from "@/server/modules/pots/money-actions";
import { formatINR } from "@/server/modules/pots/money";
import { SandTimer } from "@/components/pots/sand-timer";
import { approvalWindow, isPendingStatus } from "@/components/pots/cycles";
import { Back, Header, Notice, Field, Section, inputCls, btnCls, statusCls, when } from "../_components/ui";

export const dynamic = "force-dynamic";

const currentTimestamp = () => Date.now();

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const rt = getPotsRuntime();
  const pot = rt.pots.find((p) => p.type === "OWNER_PROFIT")!;
  const list = rt.payouts.list(B, "PROFIT");
  const nowMs = currentTimestamp();
  const waiting = list.filter((p) => isPendingStatus(p.status)).sort((a, b) => +a.createdAt - +b.createdAt)[0];

  return (
    <div className="space-y-4 sm:space-y-6">
      <Back /><Header title="Profit withdrawal" sub="Owner only. Every withdrawal is high-risk: it needs step-up authentication to approve." />
      <Notice code={notice} />
      {waiting ? (() => {
        const w = approvalWindow(waiting.createdAt);
        return (
          <SandTimer
            title="Withdrawal awaiting approval"
            startMs={w.startMs}
            endMs={w.endMs}
            nowMs={nowMs}
            suffix="to approve"
            caption={`${formatINR(waiting.amount)} · ${waiting.maskedRef}`}
          />
        );
      })() : null}
      <Section title="Withdraw">
        <p className="mb-3 text-sm text-zinc-300">Available profit: <span className="text-zinc-100">{formatINR(rt.payouts.getAvailable(B, pot.id))}</span></p>
        <form action={profitWithdrawalAction} className="grid gap-3 sm:grid-cols-3">
          <Field label="Destination account (token)"><input name="destination" required minLength={4} className={inputCls} autoComplete="off" /></Field>
          <Field label="Amount (₹)"><input name="amount" required inputMode="decimal" className={inputCls} /></Field>
          <Field label="Fees"><input disabled value="₹0.00 (sandbox)" className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-3"><input type="checkbox" name="confirm" value="yes" /> I confirm this withdrawal to the destination above.</label>
          <div className="sm:col-span-3"><button className={btnCls}>Request withdrawal</button></div>
        </form>
      </Section>
      <Section title="History">
        {list.length === 0 ? <p className="text-sm text-zinc-400">No withdrawals yet.</p> : (
          <table className="block max-w-full overflow-x-auto sm:table w-full text-left text-xs text-zinc-400"><tbody>{list.map((p) => <tr key={p.id} className="border-t border-zinc-900"><td className="py-2">{when(p.createdAt)}</td><td>{p.maskedRef}</td><td>{formatINR(p.amount)}</td><td className={statusCls(p.status)}>{p.status}</td></tr>)}</tbody></table>)}
      </Section>
    </div>
  );
}