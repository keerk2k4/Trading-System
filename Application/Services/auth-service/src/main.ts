import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow the Angular UI (served from a different origin) to call this API.
  // credentials: true lets the browser store and send the HttpOnly refresh
  // cookie on cross-origin calls; that requires an explicit origin, never "*".
  app.enableCors({
    origin: process.env.UI_ORIGIN || "http://localhost:4200",
    credentials: true,
  });

  // Enable validation pipe globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Setup OpenAPI (Swagger)
  const config = new DocumentBuilder()
    .setTitle('Auth Service')
    .setDescription('The Enterprise Trading Platform Auth Service API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // This exposes the human-readable UI at /docs and the JSON at /docs-json
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, () => {
    console.log(`Auth Service running on port ${port}`);
  });
}

bootstrap();
