import { randomUUID } from "node:crypto";

import { createModuleLogger } from "../../utils/logger";

const log = createModuleLogger("config:greeting");

const GROQ_MODEL = "llama3-70b-8192";
const GEMINI_MODEL = "gemini-1.5-flash";

const TONES = ["calm", "playful", "optimistic", "focused", "curious"] as const;
const KEYWORDS = ["aurora", "quartz", "nebula", "harbor", "sonata", "ember"] as const;
const EMOJIS = ["🌟", "🚀", "✨", "📈", "🪙", "💼", "🌿"] as const;
const CLOSERS = [
  "Let's ship it.",
  "Stay sharp.",
  "Onward.",
  "Markets await.",
  "Keep building.",
] as const;

const randomFrom = <T>(collection: readonly T[]): T => {
  if (!collection.length) {
    throw new Error("Cannot select from an empty collection");
  }
  return collection[Math.floor(Math.random() * collection.length)]!;
};

interface GreetingContext {
  groqKey?: string;
  geminiKey?: string;
  secEmail?: string;
}

interface GreetingResult {
  message: string;
  provider: "groq" | "gemini" | "local" | "test";
}

const normalizeRecipient = (secEmail?: string) => {
  if (!secEmail) return "builder";
  const [name] = secEmail.split("@");
  return name || "builder";
};

const buildPrompt = (recipient: string, keyword: string, tone: string, emoji: string) => {
  const variationId = randomUUID().slice(0, 8);
  return [
    `Greet ${recipient} with a ${tone} vibe and keep it under 25 words.`,
    "Confirm their API credentials passed validation.",
    `Use exactly one emoji like ${emoji} if it feels natural.`,
    `Include the unique word "${keyword}" somewhere to prove this is a fresh response.`,
    `Mention reference ${variationId}.`,
  ].join(" ");
};

const buildFallbackGreeting = (recipient: string, keyword: string, emoji: string): GreetingResult => {
  const snippets = [
    `${emoji} Credentials ready, ${recipient}.`,
    `Signal word: ${keyword}.`,
    randomFrom(CLOSERS),
  ];
  return {
    message: snippets.join(" "),
    provider: "local",
  };
};

const extractGroqMessage = (data: any): string | undefined => {
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return undefined;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join(" ").trim();
  }
  return undefined;
};

const extractGeminiMessage = (data: any): string | undefined => {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return undefined;
  }
  const text = parts.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n").trim();
  return text || undefined;
};

const callGroqGreeting = async (apiKey: string, prompt: string) => {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.85,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "You are the Fin-RAG credential verifier. Reply with a short friendly confirmation message for developers.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq greeting failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const greeting = extractGroqMessage(data);
  if (!greeting) {
    throw new Error("Groq greeting missing message content");
  }
  return greeting;
};

const callGeminiGreeting = async (apiKey: string, prompt: string) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 80,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini greeting failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const greeting = extractGeminiMessage(data);
  if (!greeting) {
    throw new Error("Gemini greeting missing message content");
  }
  return greeting;
};

export const generateGreeting = async (context: GreetingContext): Promise<GreetingResult> => {
  const recipient = normalizeRecipient(context.secEmail);
  const tone = randomFrom(TONES);
  const keyword = randomFrom(KEYWORDS);
  const emoji = randomFrom(EMOJIS);
  const prompt = buildPrompt(recipient, keyword, tone, emoji);

  if (process.env["NODE_ENV"] === "test") {
    return {
      message: `Test-mode hello ${recipient}! keyword:${keyword}`,
      provider: "test",
    };
  }

  const groqKey = context.groqKey;
  if (groqKey) {
    try {
      const message = await callGroqGreeting(groqKey!, prompt);
      return { message, provider: "groq" };
    } catch (error) {
      log.warn({ err: error instanceof Error ? error.message : error }, "Groq greeting failed");
    }
  }

  const geminiKey = context.geminiKey;
  if (geminiKey) {
    try {
      const message = await callGeminiGreeting(geminiKey!, prompt);
      return { message, provider: "gemini" };
    } catch (error) {
      log.warn({ err: error instanceof Error ? error.message : error }, "Gemini greeting failed");
    }
  }

  return buildFallbackGreeting(recipient, keyword, emoji);
};
