import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { aiEnv } from "@/lib/ai-env";

const openai = createOpenAI({ apiKey: aiEnv.OPENAI_API_KEY });

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: openai(aiEnv.OPENAI_MODEL),
    instructions: "You are a helpful assistant.",
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
