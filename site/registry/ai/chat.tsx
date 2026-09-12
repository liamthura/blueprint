"use client";

import { useChat } from "@ai-sdk/react";
import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;
    sendMessage({ parts: [{ type: "text", text: input }] });
    setInput("");
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 p-4">
      <ol className="flex-1 space-y-4 overflow-y-auto">
        {messages.map((message) => (
          <li key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
            <div className="inline-block max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm">
              {message.parts.map((part, index) =>
                part.type === "text" ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: message parts have no stable id
                  <span key={index}>{part.text}</span>
                ) : null,
              )}
            </div>
          </li>
        ))}
      </ol>

      <form className="flex gap-2" onSubmit={onSubmit}>
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask something"
          disabled={status === "streaming"}
        />
        <Button type="submit" size="icon" disabled={status === "streaming"}>
          <PaperPlaneRightIcon />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
