// Logger utility with error tracking
export class Logger {
  private static shouldLog = import.meta.env.VITE_LOG_ERRORS === 'true';

  static error(context: string, error: unknown): void {
    if (!this.shouldLog) return;

    const timestamp = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${timestamp}] ${context}:`, errorMsg);

    // Track error in production
    this.trackError({ context, error: errorMsg, timestamp });
  }

  static warn(context: string, message: string): void {
    console.warn(`[${new Date().toISOString()}] ${context}:`, message);
  }

  static info(context: string, message: string): void {
    console.log(`[${new Date().toISOString()}] ${context}:`, message);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private static trackError(_data: { context: string; error: string; timestamp: string }): void {
    // Placeholder for error tracking integration (Sentry, LogRocket, etc.)
    // In production, send to error tracking service:
    // sendToErrorTracker(_data);
  }
}
