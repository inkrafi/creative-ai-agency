import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { ValidationPipe } from "@nestjs/common";
import { join } from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Explicit, not relying on auto-detection -- attaches Socket.io to the
  // same HTTP server Express uses, so RealtimeGateway shares one port.
  app.useWebSocketAdapter(new IoAdapter(app));

  // Serves apps/api/public/ (the dev test UI) via Express static middleware,
  // which runs BEFORE Nest's routing/guards see the request -- so loading
  // the page doesn't get rejected by JwtAuthGuard for missing a token. The
  // page's own JS calls the real API routes (which ARE guarded) once it has
  // a token from /auth/login. Not meant for anything beyond local dev.
  //
  // process.cwd(), not __dirname: compiled output runs from dist/src/main.js,
  // so __dirname-relative paths would resolve to dist/public (doesn't
  // exist). pnpm scripts always run with cwd = apps/api.
  app.useStaticAssets(join(process.cwd(), "public"));

  // Generated images (LocalImageStorageService writes here) served directly
  // -- same cwd-relative reasoning as the public/ mount above.
  app.useStaticAssets(join(process.cwd(), "storage", "generated"), { prefix: "/generated" });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
