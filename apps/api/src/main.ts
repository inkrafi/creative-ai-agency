import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { join } from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  // apps/web and apps/client (both Next.js dev servers) run on different
  // ports, so each is a different origin from the browser's point of view
  // -- needs CORS even though everything is local. CORS_ORIGIN lets
  // deploys override this; the fallback list covers apps/web's default
  // port + its automatic fallback when 3000 is taken by this same API,
  // plus apps/client's fixed dev port (see apps/client/package.json).
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
    ],
    credentials: true,
  });

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
