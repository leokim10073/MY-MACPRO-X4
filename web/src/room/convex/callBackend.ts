// Every backend call goes through here: it gets a timeout (the Convex client queues
// mutations forever while offline) and a readable error. Never logs: errors can carry text.
export type BackendErrorKind =
  | "unreachable"
  | "room_ended"
  | "bad_name"
  | "not_member"
  | "not_host"
  | "unknown";

export class BackendError extends Error {
  readonly kind: BackendErrorKind;
  constructor(kind: BackendErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "BackendError";
  }
}

export const MUTATION_TIMEOUT_MS = 10_000;

const NICKNAME_RULE = "Nickname must be 1 to 30 characters";
const UNKNOWN_COPY = "Something went wrong. Try again.";

function backendMessage(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (typeof data === "string") return data;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  const text = backendMessage(error);
  // The server may wrap its message ("[Request ID: x] Server Error Uncaught Error: ..."), so match by inclusion.
  if (text.includes("This room has ended"))
    return new BackendError(
      "room_ended",
      "This room has ended or the invite link is wrong.",
    );
  if (text.includes(NICKNAME_RULE))
    return new BackendError("bad_name", NICKNAME_RULE);
  if (text.includes("Not a member of this room"))
    return new BackendError("not_member", "You're not in this room anymore.");
  if (text.includes("Only the host can do that"))
    return new BackendError("not_host", "Only the host can do that.");
  return new BackendError("unknown", UNKNOWN_COPY);
}

export function callBackend<T>(
  run: () => Promise<T>,
  timeoutMs = MUTATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new BackendError("unreachable", "Can't reach the server.")),
      timeoutMs,
    );
    let call: Promise<T>;
    try {
      call = run();
    } catch (e) {
      clearTimeout(timer);
      reject(toBackendError(e));
      return;
    }
    call.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(toBackendError(e));
      },
    );
  });
}
