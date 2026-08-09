import { BadRequestException } from "@nestjs/common";
import { BriefType } from "@prisma/client";

/**
 * Structured client-discovery intake per brief type, replacing a single
 * free-text instructions field -- the AI needs the client's actual
 * business context (pain points, goals) to produce something useful,
 * not just whatever one sentence the user happened to type.
 */
export interface WebsiteBriefContext {
  businessType: string;
  targetAudience: string;
  painPoints: string;
  goals: string;
  pagesNeeded?: string;
  toneStyle?: string;
}

export interface DesignBriefContext {
  designType: string;
  purpose: string;
  keyMessage: string;
  dimensions?: string;
  styleMood?: string;
  textToInclude?: string;
}

const REQUIRED_FIELDS: Record<BriefType, string[]> = {
  WEBSITE: ["businessType", "targetAudience", "painPoints", "goals"],
  DESIGN: ["designType", "purpose", "keyMessage"],
};

export function validateBriefContext(type: BriefType, context: Record<string, unknown>): void {
  const missing = REQUIRED_FIELDS[type].filter((field) => {
    const value = context[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
  if (missing.length > 0) {
    throw new BadRequestException(`Missing required field(s) for a ${type} brief: ${missing.join(", ")}`);
  }
}

/** Turns the structured context into the actual text prompt sent to the model. */
export function formatBriefPrompt(type: BriefType, context: Record<string, unknown>): string {
  if (type === BriefType.WEBSITE) {
    const c = context as unknown as WebsiteBriefContext;
    return [
      `Bidang usaha: ${c.businessType}`,
      `Target audiens: ${c.targetAudience}`,
      `Masalah yang ingin diselesaikan: ${c.painPoints}`,
      `Tujuan website: ${c.goals}`,
      `Halaman yang diinginkan: ${c.pagesNeeded || "(belum ditentukan, sarankan struktur yang sesuai)"}`,
      `Gaya/tone: ${c.toneStyle || "(sesuaikan dengan bidang usaha)"}`,
    ].join("\n");
  }

  const c = context as unknown as DesignBriefContext;
  return [
    `Jenis desain: ${c.designType}`,
    `Tujuan: ${c.purpose}`,
    `Ukuran/format: ${c.dimensions || "(belum ditentukan)"}`,
    `Pesan utama: ${c.keyMessage}`,
    `Gaya/mood visual: ${c.styleMood || "(bebas, sesuaikan dengan tujuan)"}`,
    `Teks wajib yang harus ada: ${c.textToInclude || "(tidak ada teks wajib)"}`,
  ].join("\n");
}

/**
 * Turns a DESIGN brief's context into a direct visual-description prompt
 * for the image model -- deliberately NOT built from the streamed creative
 * direction in formatBriefPrompt()/BRIEF_SYSTEM_PROMPTS.DESIGN (that text
 * is marketing-toned prose for a human designer to read; an image model
 * wants a literal description of what should be in the frame).
 */
export function formatImagePrompt(context: Record<string, unknown>): string {
  const c = context as unknown as DesignBriefContext;
  return [
    `${c.designType} design, purpose: ${c.purpose}.`,
    `Key message conveyed visually: ${c.keyMessage}.`,
    c.styleMood ? `Style/mood: ${c.styleMood}.` : "Style/mood: clean, modern, professional.",
    c.dimensions ? `Intended format/size: ${c.dimensions}.` : "",
    c.textToInclude
      ? `Include this exact text legibly in the design: "${c.textToInclude}".`
      : "Do not include any placeholder or invented text in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * DESIGN's system prompt is explicit that THIS particular call's output is
 * a *written* creative direction, not an image -- this is the text-draft
 * SSE path (BriefsService.generateStream), separate from the actual image
 * generation job (BriefsService.generateImage / formatImagePrompt above).
 * Keeping the disclaimer even now that real image generation exists: it's
 * still true for this specific prompt/call, and a design brief is exactly
 * the kind of request that could otherwise mislead someone into expecting
 * this particular response to be a poster/graphic.
 */
export const BRIEF_SYSTEM_PROMPTS: Record<BriefType, string> = {
  WEBSITE:
    "You are a senior web copywriter and information architect working inside a creative agency's tools. " +
    "Given the client discovery info below, write: (1) a suggested page/sitemap structure (a list of pages, " +
    "each with a one-line purpose), then (2) draft headline and short body copy for the most important page. " +
    "Address the stated pain points and goals directly -- don't just describe the business generically. " +
    "Write in the same language as the input. No preamble, no meta-commentary, no markdown headers unless useful for structure.",
  DESIGN:
    "You are a creative director working inside a creative agency's tools. Given the design brief below, write " +
    "a clear creative direction: mood/style description, a suggested color palette (named colors, not hex codes), " +
    "layout/composition guidance, and how any required text should be placed. You are describing a design " +
    "direction in words for a human designer to execute -- you are NOT generating an image. Say so if it's not " +
    "already obvious from context. Write in the same language as the input. No preamble, no meta-commentary.",
};
