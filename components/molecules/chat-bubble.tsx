type ChatBubbleProps = {
  from: "user" | "admin";
  text: string;
  meta: string;
};

export function ChatBubble({ from, text, meta }: ChatBubbleProps) {
  return (
    <div className={`bubble ${from}`}>
      {text}
      <div className="chat-time">{meta}</div>
    </div>
  );
}
