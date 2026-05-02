import { Suspense } from "react";
import { ChatView } from "./chat-view";

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatView />
    </Suspense>
  );
}
