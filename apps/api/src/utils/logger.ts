import { context, trace } from "@opentelemetry/api";
import pino, { type Logger, type LoggerOptions } from "pino";

const environment = process.env["NODE_ENV"] ?? "development";
const usePrettyTransport = environment === "development";

const redactPaths = [
  "config.credentials.groq",
  "config.credentials.gemini",
  "config.credentials.tavily",
  "config.credentials.secEmail",
  "config.mongoUri",
  "req.body.password",
  "req.headers.authorization",
];

const baseOptions: LoggerOptions = {
  level: process.env["LOG_LEVEL"] ?? "info",
  redact: {
    paths: redactPaths,
    remove: true,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  mixin() {
    const span = trace.getSpan(context.active());
    if (!span) {
      return {};
    }
    const { traceId, spanId, traceFlags } = span.spanContext();
    if (!traceId || !spanId) {
      return {};
    }

    return {
      traceId,
      spanId,
      sampled: Boolean(traceFlags),
    };
  },
  transport: usePrettyTransport
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
};

export const logger: Logger = pino(baseOptions);

export const createModuleLogger = (module: string) => logger.child({ module });

export default logger;
