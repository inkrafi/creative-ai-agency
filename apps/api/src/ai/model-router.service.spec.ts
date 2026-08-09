import { ModelRouterService } from "./model-router.service";
import { AiProvider } from "./providers/ai-provider.interface";
import { GenerationRequest, GenerationUsage } from "./model-router.types";

const REQUEST: GenerationRequest = { systemPrompt: "sys", prompt: "hello", maxTokens: 100 };

async function drain(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const d of stream) out.push(d);
  return out;
}

/**
 * Builds a fake AiProvider that yields `deltas` in order, optionally
 * throwing `error` after `throwAfter` deltas have been yielded (0 = before
 * any output at all -- the case fallback is designed for).
 */
function fakeProvider(opts: {
  name: string;
  deltas?: string[];
  error?: unknown;
  throwAfter?: number;
  isQuota?: boolean;
}): AiProvider & { generate: jest.Mock } {
  const model = `${opts.name}-model`;
  const deltas = opts.deltas ?? [];
  const throwAfter = opts.throwAfter ?? 0;

  const generate = jest.fn((_request: GenerationRequest) => {
    async function* textDeltas() {
      let count = 0;
      for (const d of deltas) {
        if (opts.error !== undefined && count === throwAfter) throw opts.error;
        yield d;
        count++;
      }
      if (opts.error !== undefined && count === throwAfter) throw opts.error;
    }
    return {
      textDeltas: textDeltas(),
      usage: async (): Promise<GenerationUsage> => ({
        provider: opts.name,
        model,
        inputTokens: 10,
        outputTokens: deltas.length,
      }),
    };
  });

  return {
    name: opts.name,
    model,
    generate,
    isQuotaExhausted: () => opts.isQuota ?? false,
  };
}

describe("ModelRouterService", () => {
  it("uses the primary provider when it succeeds", async () => {
    const primary = fakeProvider({ name: "primary", deltas: ["a", "b"] });
    const secondary = fakeProvider({ name: "secondary", deltas: ["x"] });
    const router = new ModelRouterService([primary, secondary]);

    const stream = router.generate(REQUEST);
    await expect(drain(stream.textDeltas)).resolves.toEqual(["a", "b"]);
    await expect(stream.usage()).resolves.toMatchObject({ provider: "primary" });
    expect(secondary.generate).not.toHaveBeenCalled();
  });

  it("falls back to the next provider when quota is exhausted before any output", async () => {
    const quotaError = { status: 429 };
    const primary = fakeProvider({ name: "primary", error: quotaError, throwAfter: 0, isQuota: true });
    const secondary = fakeProvider({ name: "secondary", deltas: ["x", "y"] });
    const router = new ModelRouterService([primary, secondary]);

    const stream = router.generate(REQUEST);
    await expect(drain(stream.textDeltas)).resolves.toEqual(["x", "y"]);
    await expect(stream.usage()).resolves.toMatchObject({ provider: "secondary" });
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(secondary.generate).toHaveBeenCalledTimes(1);
  });

  it("does not fall back once partial output has already streamed", async () => {
    const quotaError = { status: 429 };
    const primary = fakeProvider({
      name: "primary",
      deltas: ["a"],
      error: quotaError,
      throwAfter: 1, // fails AFTER the first delta
      isQuota: true,
    });
    const secondary = fakeProvider({ name: "secondary", deltas: ["x"] });
    const router = new ModelRouterService([primary, secondary]);

    const stream = router.generate(REQUEST);
    const draining = drain(stream.textDeltas);
    await expect(draining).rejects.toBe(quotaError);
    // Never even constructed a request to the fallback -- a mid-stream
    // failure must not silently switch providers (would duplicate/garble
    // output already sent to the client).
    expect(secondary.generate).not.toHaveBeenCalled();
  });

  it("does not fall back for a non-quota error", async () => {
    const bugError = new Error("programming error, not a quota issue");
    const primary = fakeProvider({ name: "primary", error: bugError, throwAfter: 0, isQuota: false });
    const secondary = fakeProvider({ name: "secondary", deltas: ["x"] });
    const router = new ModelRouterService([primary, secondary]);

    const stream = router.generate(REQUEST);
    await expect(drain(stream.textDeltas)).rejects.toBe(bugError);
    expect(secondary.generate).not.toHaveBeenCalled();
  });

  it("throws when every provider's quota is exhausted", async () => {
    const err1 = { status: 429, source: "primary" };
    const err2 = { status: 429, source: "secondary" };
    const primary = fakeProvider({ name: "primary", error: err1, throwAfter: 0, isQuota: true });
    const secondary = fakeProvider({ name: "secondary", error: err2, throwAfter: 0, isQuota: true });
    const router = new ModelRouterService([primary, secondary]);

    const stream = router.generate(REQUEST);
    await expect(drain(stream.textDeltas)).rejects.toBe(err2);
  });

  it("usage() rejects if called before textDeltas is drained", async () => {
    const primary = fakeProvider({ name: "primary", deltas: ["a"] });
    const router = new ModelRouterService([primary]);

    const stream = router.generate(REQUEST);
    await expect(stream.usage()).rejects.toThrow(/before textDeltas was fully drained/);
  });

  it("primaryModel returns the first provider's model id", () => {
    const primary = fakeProvider({ name: "primary" });
    const secondary = fakeProvider({ name: "secondary" });
    const router = new ModelRouterService([primary, secondary]);

    expect(router.primaryModel).toBe("primary-model");
  });
});
