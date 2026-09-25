/** A fixed-width, crossfading status beside a stationary phone number. */
export function AuthCodeDelivery({ sending, failed, phone }: { sending: boolean; failed: boolean; phone: string }) {
  const status = sending ? "sending" : failed ? "failed" : "sent";
  const labels = { sending: "Sending code to", sent: "Code sent to", failed: "Couldn’t send to" };
  return (
    <span className="auth-code-delivery" role="status" aria-live="polite" aria-atomic="true" aria-label={`${labels[status]} ${phone}`}>
      <span className="auth-code-delivery-prefix" aria-hidden="true">
        {Object.entries(labels).map(([key, label]) => <span key={key} className={key === status ? "is-current" : undefined}>{label}</span>)}
      </span>
      <span className="auth-code-delivery-phone" aria-hidden="true">{phone}</span>
    </span>
  );
}
