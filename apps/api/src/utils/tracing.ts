import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { MongooseInstrumentation } from "@opentelemetry/instrumentation-mongoose";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import { getEnvConfig } from "../modules/config/config.service";

import { logger } from "./logger";

let sdk: NodeSDK | null = null;

const parseHeaders = (raw?: string) =>
  raw
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const [key, value] = pair.split("=").map((item) => item.trim());
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});

export const initializeTracing = async () => {
  const config = getEnvConfig();

  if (!config.otel.enabled) {
    logger.debug("OpenTelemetry disabled via configuration");
    return null;
  }

  if (sdk) {
    return sdk;
  }

  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: "fin-rag-api",
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.nodeEnv,
    }),
  );

  const exporter = new OTLPTraceExporter({
    ...(config.otel.endpoint ? { url: config.otel.endpoint } : {}),
    headers: parseHeaders(config.otel.headers),
  });

  const otelSdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingPaths: [/healthz/],
      }),
      new ExpressInstrumentation(),
      new MongooseInstrumentation(),
    ],
  });

  await Promise.resolve(otelSdk.start());
  sdk = otelSdk;
  logger.info("OpenTelemetry tracing initialized");
  return sdk;
};

export const shutdownTracing = async () => {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
    logger.info("OpenTelemetry tracing shut down");
  } catch (error) {
    logger.error({ err: error }, "Error shutting down OpenTelemetry tracing");
  } finally {
    sdk = null;
  }
};
