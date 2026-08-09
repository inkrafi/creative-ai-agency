export interface GenerationRequest {
  systemPrompt: string;
  prompt: string;
  maxTokens: number;
}

export interface GenerationUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * `textDeltas` can only be iterated once (it's a live stream). Call
 * `usage()` after fully draining `textDeltas` -- it resolves from the same
 * underlying stream's completion, not a separate request.
 */
export interface GenerationStream {
  textDeltas: AsyncIterable<string>;
  usage: () => Promise<GenerationUsage>;
}
