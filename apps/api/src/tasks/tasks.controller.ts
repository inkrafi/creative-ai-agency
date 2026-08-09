import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.tenantId, user.userId, dto);
  }

  @Get()
  findAllForProject(@Query("projectId") projectId: string) {
    return this.tasksService.findAllForProject(projectId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.tasksService.remove(id);
  }

  @Post(":id/submit-for-review")
  submitForReview(@Param("id") id: string) {
    return this.tasksService.submitForReview(id);
  }

  @Post(":id/request-revision")
  requestRevision(@Param("id") id: string) {
    return this.tasksService.requestRevision(id);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string) {
    return this.tasksService.approve(id);
  }
}
