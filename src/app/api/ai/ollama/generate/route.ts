import { auth } from "@/auth";
import { getOllamaBaseUrl } from "@/actions/apiKey.actions";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Allowlist fields forwarded to Ollama — prevent parameter injection (CWE-20)
    const safeBody = {
      model: body.model,
      prompt: body.prompt,
      stream: false,
      ...(body.system !== undefined && { system: body.system }),
      ...(body.template !== undefined && { template: body.template }),
      ...(body.context !== undefined && { context: body.context }),
    };

    const baseUrl = await getOllamaBaseUrl();
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(safeBody),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to generate" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error proxying Ollama generate:", error);
    return NextResponse.json(
      { error: "Cannot connect to Ollama module" },
      { status: 502 },
    );
  }
}
