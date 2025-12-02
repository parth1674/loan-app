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

  // FIX 1: Enable CORS for frontend
  app.enableCors({
    origin: 'http://localhost:3001', // FRONTEND URL
    credentials: true,
  });

  // FIX 2: Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      skipMissingProperties: true,
      forbidUnknownValues: false,
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
