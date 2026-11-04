import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "PickleHub Game API" })
@server("https://api.example.invalid", "Pilot API")
namespace PickleHub;

@doc("Bearer token obtained from a validated Telegram session.")
model BearerAuth is Http.BearerAuth;

@useAuth(BearerAuth)
interface Games {
  @get
  @route("/games")
  list(@query cursor?: string, @query limit?: PageSize):
    | GamePage
    | UnauthorizedError;

  @get
  @route("/games/{gameId}")
  get(@path gameId: uuid):
    | GameDetail
    | UnauthorizedError
    | NotFoundError
    | CancelledError;

  @post
  @route("/games")
  create(
    @header("Idempotency-Key") key: IdempotencyKey,
    @body body: CreateGameRequest,
  ): GameDetail | UnauthorizedError | ValidationError | ConflictError;

  @patch
  @route("/games/{gameId}")
  update(
    @path gameId: uuid,
    @header("Idempotency-Key") key: IdempotencyKey,
    @body body: UpdateGameRequest,
  ):
    | GameDetail
    | UnauthorizedError
    | NotFoundError
    | ForbiddenError
    | CancelledError
    | ValidationError
    | ConflictError;

  @put
  @route("/games/{gameId}/participation")
  join(@path gameId: uuid, @header("Idempotency-Key") key: IdempotencyKey):
    | GameDetail
    | UnauthorizedError
    | NotFoundError
    | ForbiddenError
    | CancelledError
    | ConflictError;

  @delete
  @route("/games/{gameId}/participation")
  leave(@path gameId: uuid, @header("Idempotency-Key") key: IdempotencyKey):
    | GameDetail
    | UnauthorizedError
    | NotFoundError
    | ForbiddenError
    | CancelledError
    | ConflictError;

  @delete
  @route("/games/{gameId}/participants/{userId}")
  removeParticipant(
    @path gameId: uuid,
    @path userId: uuid,
    @header("Idempotency-Key") key: IdempotencyKey,
  ):
    | GameDetail
    | UnauthorizedError
    | NotFoundError
    | ForbiddenError
    | CancelledError
    | ConflictError;

  @post
  @route("/games/{gameId}/cancellation")
  cancel(@path gameId: uuid, @header("Idempotency-Key") key: IdempotencyKey):
    | GameDetail
    | UnauthorizedError
    | NotFoundError
    | ForbiddenError
    | ConflictError;
}

interface TelegramSessions {
  @post
  @route("/sessions/telegram")
  create(@body body: TelegramSessionRequest): TelegramSession | ValidationError;
}

model Game {
  id: uuid;
  organizerId: uuid;
  organizerParticipates: boolean;
  venueName: VenueName;
  venueAddress: VenueAddress;
  startsAt: utcDateTime;
  durationMinutes: DurationMinutes;
  participantLimit: ParticipantLimit;
  participantCount: ParticipantCount;
  status: GameStatus;
  desiredLevel?: DesiredLevel;
  description?: GameDescription;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model Participant {
  userId: uuid;
  displayName: DisplayName;
  joinedAt: utcDateTime;
  isOrganizer: boolean;
}

model GameDetail extends Game {
  participants: Participant[];
}

model GamePage {
  items: Game[];
  nextCursor?: string;
}

model CreateGameRequest {
  venueName: VenueName;
  venueAddress: VenueAddress;
  startsAt: utcDateTime;
  durationMinutes: DurationMinutes;
  participantLimit: ParticipantLimit;
  organizerParticipates: boolean = true;
  desiredLevel?: DesiredLevel;
  description?: GameDescription;
}

model UpdateGameRequest {
  venueName?: VenueName;
  venueAddress?: VenueAddress;
  startsAt?: utcDateTime;
  durationMinutes?: DurationMinutes;
  participantLimit?: ParticipantLimit;
  organizerParticipates?: boolean;
  desiredLevel?: DesiredLevel | null;
  description?: GameDescription | null;
}

model TelegramSessionRequest {
  initData: string;
}

model TelegramSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: utcDateTime;
  user: SessionUser;
}

model SessionUser {
  id: uuid;
  displayName: DisplayName;
}

model ErrorResponse {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: Record<unknown>;
}

model ValidationError extends ErrorResponse {
  @statusCode
  statusCode: 400;
}

model UnauthorizedError extends ErrorResponse {
  @statusCode
  statusCode: 401;
}

model ForbiddenError extends ErrorResponse {
  @statusCode
  statusCode: 403;
}

model NotFoundError extends ErrorResponse {
  @statusCode
  statusCode: 404;
}

model ConflictError extends ErrorResponse {
  @statusCode
  statusCode: 409;
}

model CancelledError extends ErrorResponse {
  @statusCode
  statusCode: 410;
}

@pattern("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
scalar uuid extends string;

@minValue(0)
@maxValue(96)
scalar ParticipantCount extends int32;

union ErrorCode {
  validation: "VALIDATION_ERROR",
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  gameNotFound: "GAME_NOT_FOUND",
  participantNotFound: "PARTICIPANT_NOT_FOUND",
  gameFull: "GAME_FULL",
  gameConflict: "GAME_CONFLICT",
  idempotencyKeyReused: "IDEMPOTENCY_KEY_REUSED",
  gameCancelled: "GAME_CANCELLED",
  telegramAuthInvalid: "TELEGRAM_AUTH_INVALID",
}

@maxLength(120)
@minLength(1)
scalar VenueName extends string;

@maxLength(300)
@minLength(1)
scalar VenueAddress extends string;

@minValue(30)
@maxValue(480)
scalar DurationMinutes extends int32;

@minValue(2)
@maxValue(96)
scalar ParticipantLimit extends int32;

@maxLength(80)
@minLength(1)
scalar DesiredLevel extends string;

@maxLength(2000)
scalar GameDescription extends string;

@maxLength(120)
@minLength(1)
scalar DisplayName extends string;

@minLength(16)
@maxLength(128)
scalar IdempotencyKey extends string;

@minValue(1)
@maxValue(50)
scalar PageSize extends int32;

enum GameStatus {
  scheduled: "SCHEDULED",
  full: "FULL",
  cancelled: "CANCELLED",
}
