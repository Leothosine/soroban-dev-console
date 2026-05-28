import { Controller, Get, Query } from "@nestjs/common";
import { ReviewWindowService } from "./review-window.service.js";

@Controller("wave/review-window")
export class ReviewWindowController {
  constructor(private readonly reviewWindowService: ReviewWindowService) {}

  @Get("policy")
  getPolicy() {
    return this.reviewWindowService.getPolicy();
  }

  @Get("schedule")
  getSchedule(@Query("submittedAt") submittedAt: string) {
    const date = submittedAt ? new Date(submittedAt) : new Date();
    return this.reviewWindowService.getSchedule(date);
  }

  @Get("appeal-timing")
  checkAppealTiming(
    @Query("submittedAt") submittedAt: string,
  ) {
    const date = submittedAt ? new Date(submittedAt) : new Date();
    return this.reviewWindowService.checkAppealTiming(date);
  }
}
