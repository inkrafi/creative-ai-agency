import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

/**
 * Root BullMQ connection (Redis, already provisioned in docker-compose from
 * Phase 0 -- see the design doc's dependency note: "Realtime collaboration
 * (Phase 2) depends on the pub/sub layer, which depends on Redis being in
 * place from Phase 0"). Imported once in AppModule; feature modules then
 * call BullModule.registerQueue({ name }) to declare their own queues
 * against this shared connection.
 */
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
