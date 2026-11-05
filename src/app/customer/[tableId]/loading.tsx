/** Shown instantly while another table's device loads, so switching tabs feels immediate. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading table">
      <div className="h-10 rounded-xl bg-white/5" />
      <div className="mt-4 h-[28rem] rounded-2xl border border-white/10 bg-white/5" />
    </div>
  );
}
