// src/newsletter/newsletter.module.ts
import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module'; // ✅ so guards & JwtService work

@Module({
  imports: [AuthModule],
  providers: [NewsletterService, PrismaService],
  controllers: [NewsletterController],
})
export class NewsletterModule {}
