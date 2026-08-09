import { GenerationRequest, GenerationStream } from "../model-router.types";

export interface AiProvider {
  readonly name: string;
  readonly model: string;

  generate(request: GenerationRequest): GenerationStream;

  /**
   * Best-effort: does `err` mean "this provider is out of quota/credit right
   * now" (fall back to the next provider), as opposed to a real request or
   * programming error that would fail identically everywhere (don't mask it
   * by silently retrying elsewhere)?
   */
  isQuotaExhausted(err: unknown): boolean;
}
