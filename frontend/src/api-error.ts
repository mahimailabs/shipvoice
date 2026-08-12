/**
 * The one error type the console branches on.
 *
 * It lives apart from api.ts because it carries no URL and makes no request,
 * and both the real client and the demo build's fixtures raise it. Two copies
 * of the class would make `e instanceof ApiError` answer false across the seam,
 * which is the check every page uses to tell a refusal from an outage.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  get isForbidden(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isUnreachable(): boolean {
    return this.status === 0 || this.status >= 500;
  }

  get isMissing(): boolean {
    return this.status === 404;
  }
}
