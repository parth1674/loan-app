// src/main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { startDailyAccrual } from './cron/daily.cron';
import { LoanService } from './loan/loan.service';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const allowedOrigins = [
    "http://localhost:3001",
    "https://finance-qgp6.onrender.com"
  ];
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }
  // CORS (Render + Local both)
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // FIX 2: Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      skipMissingProperties: false,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  // ✅ uploads folder ko publicly expose karne ke liye
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });


  await app.init();

  // Start CRON
  const loanService = app.get(LoanService);
  startDailyAccrual(loanService);

  await app.listen(3000);
  console.log('Application listening on port 3000');
}

bootstrap();
