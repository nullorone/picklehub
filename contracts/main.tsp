import "@typespec/http";
import "@typespec/openapi3";

using TypeSpec.Http;

@service(#{ title: "Picklehub API" })
namespace Picklehub;

@format("uuid")
scalar Uuid extends string;

@minLength(1)
@maxLength(120)
scalar EventTitle extends string;

@maxLength(2000)
scalar EventDescription extends string;

model CreateEventRequest {
  title: EventTitle;
  description?: EventDescription;
  startsAt: utcDateTime;
}

model Event {
  id: Uuid;
  organizerId: Uuid;
  title: EventTitle;
  description: EventDescription | null;
  startsAt: utcDateTime;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model ErrorBody {
  statusCode: int32;
  message: string | string[];
  error: string;
}

@error
model BadRequestError {
  @statusCode statusCode: 400;
  @body body: ErrorBody;
}

@error
model UnauthorizedError {
  @statusCode statusCode: 401;
  @body body: ErrorBody;
}

@route("/events")
@useAuth(BearerAuth)
interface Events {
  @post
  create(@header("Idempotency-Key") idempotencyKey: Uuid, @body input: CreateEventRequest):
    | {
        @statusCode statusCode: 201;
        @body body: Event;
      }
    | BadRequestError
    | UnauthorizedError
    | ConflictError;
}

@error
model ConflictError {
    @statusCode statusCode: 409;
    @body body: ErrorBody;
}
