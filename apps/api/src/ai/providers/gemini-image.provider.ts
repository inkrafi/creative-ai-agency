import { Injectable } from "@nestjs/common";
import { GoogleGenAI, Modality } from "@google/genai";

export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

/**
 * Single-provider image generation -- unlike GeminiProvider (text), there's
 * no fallback chain here: Anthropic doesn't do image generation at all, so
 * there's only one provider to route to today. Left as its own service
 * (not squeezed into the AiProvider/ModelRouter interface, which is shaped
 * around streaming text) so a second image provider can be added later
 * without reshaping the text-generation abstraction to fit it.
 *
 * Uses `models.generateContent` with `responseModalities: ["IMAGE"]` --
 * NOT the separate `models.generateImages` (Imagen-only) endpoint, and NOT
 * GeminiProvider's `interactions.create` (that surface's image-output
 * support wasn't verified). Request/response shape (config.imageConfig,
 * response.candidates[0].content.parts[].inlineData.{data,mimeType})
 * confirmed directly against the installed @google/genai .d.ts -- re-check
 * against the installed version's own types before changing this, per the
 * lesson in GeminiProvider's comment (this SDK's surface has already
 * drifted once).
 */
@Injectable()
export class GeminiImageProvider {
  readonly name = "gemini";
  readonly model = "gemini-3.1-flash-image";

  private readonly client = new GoogleGenAI({});

  get isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  }

  async generateImage(prompt: string): Promise<GeneratedImage> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: { aspectRatio: "1:1" },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      throw new Error("Gemini returned no image data (likely filtered by safety settings)");
    }

    return {
      base64: part.inlineData.data,
      mimeType: part.inlineData.mimeType ?? "image/png",
    };
  }
}
