
/**
 * Full takeover view shown once THIS specific order (identified by its
 * real orderId, not the table) has a paid bill. Replaces the entire
 * ordering session — menu and cart are not shown alongside this.
 */

/**
 * Full takeover view shown once this specific order has been paid.
 * Replaces the ordering session with a clean payment-success screen.
 */
export function OrderCompletedPanel({
  orderNumber,
  onNewOrder,
}: {
  orderId: string;
  /** Human-readable order number, e.g. ORD-00125. */
  orderNumber: string;
  tableId: string;
  feedbackSubmitted: boolean;
  /** Closes the finished session so the next customer can order. */
  onNewOrder?: () => void;
}) {
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-[var(--tablor-accent)] bg-[var(--tablor-card)] px-4 sm:px-6 py-4 sm:py-8 text-center shadow-[0_0_0_1px_var(--tablor-accent)]">
        <p className="text-xl font-semibold text-[var(--tablor-accent)]">
          Payment Successful
        </p>

        <p className="mt-1 text-sm text-[var(--tablor-text-secondary)]">
          {orderNumber} &middot; Completed
        </p>

        <p className="mt-4 text-sm text-[var(--tablor-text-primary)]">
          Thank you for dining with us.
        </p>

        {onNewOrder && (
          <button
            type="button"
            onClick={onNewOrder}
            className="mt-5 rounded-lg bg-[var(--tablor-accent)] px-5 py-2.5 text-sm font-semibold text-[#0d0e0b]"
          >
            Start a new order
          </button>
        )}
      </div>
    </div>
  );
}
