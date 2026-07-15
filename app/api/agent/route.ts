import OpenAI from "openai";
import { companyContext } from "@/lib/ops-demo-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "live_agent_not_configured" }, { status: 503 });
  }

  const payload = await request.json().catch(() => ({})) as { message?: string };
  const message = payload.message?.trim();
  if (!message) return Response.json({ error: "message_required" }, { status: 400 });

  const client = new OpenAI({ apiKey });
  const stream = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5.6",
    instructions: `Tu es OPS, l'agent de direction de l'entreprise fictive Atelier Beaumarchais.
Réponds en français, directement et avec une intelligence de niveau direction générale.
Commence par la conclusion. Explique les causes, les risques et la prochaine action utile.
Utilise uniquement les faits du contexte fourni. N'invente jamais une donnée manquante.
Chaque affirmation importante doit citer un ou plusieurs identifiants entre crochets.
Ne révèle jamais de raisonnement interne. Toute action externe exige une validation humaine.

CONTEXTE DE DÉMONSTRATION
${companyContext}`,
    input: [{ role: "user", content: message }],
    reasoning: { effort: "low" },
    text: { verbosity: "medium" },
    stream: true,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") controller.enqueue(encoder.encode(event.delta));
        }
      } catch {
        controller.enqueue(encoder.encode("Je n’ai pas pu terminer cette analyse. Les réponses de démonstration restent disponibles."));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
