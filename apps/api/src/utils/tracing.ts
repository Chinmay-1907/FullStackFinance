import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

import { getEnvConfig } from "../modules/config/config.service";
import { logger } from "./logger";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

let sdk: NodeSDK | null = null;

export const initializeTracing = async () => {
  if (sdk) {
    return sdk;
  }

  const config = getEnvConfig();

  if (!config.otel.enabled) {
    logger.debug("OpenTelemetry disabled by configuration");
    return null;
  }

  const exporter = new OTLPTraceExporter({
    url: config.otel.endpoint,
    headers: config.otel.headers
      ? Object.fromEntries(
          config.otel.headers
            .split(",")
            .map((pair) => pair.trim())
            .filter(Boolean)
            .map((pair) => {
              const [key, value] = pair.split("=");
              return [key.trim(), value?.trim() ?? ""];
            })
        )
      : undefined
  });

  sdk = new NodeSDK({
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()]
  });

  try {
    await sdk.start();
    logger.info("OpenTelemetry tracing initialized");
    return sdk;
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize OpenTelemetry");
    sdk = null;
    return null;
  }
};

export const shutdownTracing = async () => {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
    logger.info("OpenTelemetry tracing shut down");
  } catch (error) {
    logger.error({ err: error }, "Error shutting down tracing");
  } finally {
    sdk = null;
  }
};
