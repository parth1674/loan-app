import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { InterestService } from "./interest.service";
import { InterestCron } from "../cron/interest.cron";
import { PrismaModule } from "src/prisma/prisma.module";

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [
    PrismaService,
    InterestService,
    InterestCron,
  ],
  exports: [InterestService],
})
export class InterestModule {}
