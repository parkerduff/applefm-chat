/**
 * Apple On-Device LLM Context Management
 * 
 * Handles prompt formatting and content filtering detection
 * for Apple's on-device Foundation Models (apple-on-device).
 */

import type { Message } from "./types";

export const MODEL_ID = "apple-on-device";

export const SYSTEM_PROMPT = `You are an expert assistant focused on precise, factual, and concise responses. When responding to questions, prioritize accuracy and do not make up facts. If asked for summaries, give them in no more than three sentences. Follow instructions exactly as stated.`;

/**
 * Refusal patterns that indicate Apple's guardrails were triggered.
 * The on-device model returns these phrases when content is filtered.
 */
const REFUSAL_PREFIXES = [
  "Sorry, I",
  "Sorry, but",
  "I'm sorry, I",
  "I'm sorry, but",
  "I apologize, but",
  "I can't help with",
  "I'm not able to",
] as const;

/**
 * Check if a response indicates the model refused due to guardrails.
 */
export function isGuardrailRefusal(content: string): boolean {
  const trimmed = content.trim();
  return REFUSAL_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * Check if a response is empty (guardrail blocked entirely).
 */
export function isEmptyResponse(content: string): boolean {
  return !content.trim();
}

/**
 * Default fallback message when content is completely blocked.
 */
export const BLOCKED_RESPONSE = "I'm sorry, I can't assist with that.";

/**
 * Format conversation messages into a prompt for the apple-on-device model.
 * Filters out messages that triggered content filtering.
 */
export function formatPrompt(messages: Message[]): string {
  if (messages.length === 0) return "";

  // Filter out messages that triggered content filter
  const validMessages = messages.filter((msg) => !msg.filtered);
  if (validMessages.length === 0) return "";

  const parts: string[] = [SYSTEM_PROMPT, ""];

  for (const msg of validMessages) {
    if (msg.role === "user") {
      parts.push(`User: ${msg.content}`);
    } else {
      parts.push(`Assistant: ${msg.content}`);
    }
  }

  // Add "Assistant:" to prompt the model to respond
  parts.push("Assistant:");

  return parts.join("\n");
}

/**
 * Process a completed response, detecting guardrail triggers.
 * Returns the content and whether it was filtered.
 */
export function processResponse(content: string): {
  content: string;
  filtered: boolean;
} {
  if (isEmptyResponse(content)) {
    return { content: BLOCKED_RESPONSE, filtered: true };
  }

  if (isGuardrailRefusal(content)) {
    return { content, filtered: true };
  }

  return { content, filtered: false };
}
