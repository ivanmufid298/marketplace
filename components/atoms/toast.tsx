/** Transient message. Shown while `message` is non-empty. */
export function Toast({ message }: { message: string }) {
  return (
    <div className={`toast${message ? " show" : ""}`} role="status">
      {message}
    </div>
  );
}
