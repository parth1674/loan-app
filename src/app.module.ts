import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma/prisma.service';
import { LoanModule } from './loan/loan.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { InterestModule } from "./interest/interest.module";
import { CronModule } from "./cron/cron.module";
import { PrismaModule } from './prisma/prisma.module';
import { LoanRequestModule } from './loan-request/loan-request.module';
import { ClientModule } from './client/client.module';

@Module({
  imports: [AuthModule, LoanModule, NewsletterModule, InterestModule, CronModule, PrismaModule, LoanRequestModule, ClientModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
