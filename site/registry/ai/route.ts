import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { aiEnv } from "@/lib/ai-env";

export async function POST(request: Request) {
  if (!aiEnv.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not set. Add it to .env and restart the dev server." },
      { status: 503 },
    );
  }

  const openai = createOpenAI({ apiKey: aiEnv.OPENAI_API_KEY });
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
