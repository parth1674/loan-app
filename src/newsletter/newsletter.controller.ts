// src/newsletter/newsletter.controller.ts
import { Controller, Post, Body, Get, Delete, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('newsletter')
export class NewsletterController {
  constructor(private newsletterService: NewsletterService) {}

  // PUBLIC subscribe (footer se)
  @Post('subscribe')
  subscribe(@Body('email') email: string) {
    return this.newsletterService.subscribe(email);
  }

  // ADMIN: list all subscribers
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  getAll() {
    return this.newsletterService.getAll();
  }

  // ADMIN: delete subscriber
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.newsletterService.delete(id);
  }
}
