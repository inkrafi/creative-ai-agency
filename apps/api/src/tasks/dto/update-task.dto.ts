import { PartialType, OmitType } from "@nestjs/mapped-types";
import { CreateTaskDto } from "./create-task.dto";

/**
 * Deliberately does NOT expose `status`. Status is owned by the review
 * state machine (submitForReview / requestRevision / approve), which
 * enforces the rules that make it mean anything: a task can't reach
 * IN_REVIEW without a Deliverable for the client to look at, can't be
 * approved except from IN_REVIEW, and can't exceed its revision
 * allowance. An earlier version accepted `status` here, which let a single
 * `PATCH {"status":"DONE"}` walk a task straight from TODO to DONE and
 * skip all of it -- including the paid-revision limit.
 *
 * `projectId` is omitted for a related reason: moving a task between
 * projects isn't a supported operation, and allowing it here would let a
 * task be reparented without any of the checks create() does.
 */
export class UpdateTaskDto extends PartialType(OmitType(CreateTaskDto, ["projectId"] as const)) {}
