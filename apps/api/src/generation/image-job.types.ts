export const IMAGE_GENERATION_QUEUE = "image-generation";

/** Payload enqueued by BriefsService.generateImage, consumed by ImageGenerationProcessor. */
export interface ImageGenerationJobData {
  organizationId: string;
  briefId: string;
  taskId: string;
  generationJobId: string;
  ledgerEntryId: string;
  prompt: string;
  userId: string;
}
