// An error that is safe to show to the client (message in Persian).
export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.message = message;
    this.status = status;
  }
}
