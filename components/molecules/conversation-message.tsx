type ConversationMessageProps = {
  from: "customer" | "admin";
  text: string;
  meta: string;
};

export function ConversationMessage({ from, text, meta }: ConversationMessageProps) {
  return (
    <div className={`msg ${from}`}>
      {text}
      <div className="msg-time">{meta}</div>
    </div>
  );
}
