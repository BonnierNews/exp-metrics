import type { Counter as OtCounter, Histogram, ObservableGauge, ValueType } from "@opentelemetry/api";
import type { IncomingMessage, ServerResponse } from "http";

declare namespace expMetrics {
  type Labels = Record<string, string | number | boolean>;

  interface MetricConfig {
    name: string;
    help?: string;
    labelNames?: string[];
    unit?: string;
    valueType?: ValueType;
  }

  interface SummaryConfig extends MetricConfig {
    buckets?: number[];
  }

  interface Config {
    enabled?: boolean;
    buckets?: boolean | number[];
    [attribute: string]: unknown;
  }

  interface Counter {
    metric: OtCounter;
    inc(value?: number): void;
    inc(labels: Labels, value?: number): void;
  }

  interface Gauge {
    metric: ObservableGauge;
    set(value: number): void;
    set(labels: Labels, value: number): void;
    inc(value?: number): void;
    inc(labels: Labels, value?: number): void;
    dec(value?: number): void;
    dec(labels: Labels, value?: number): void;
  }

  interface Summary {
    metric: Histogram;
    observe(value: number, labels?: Labels): void;
    observe(labels: Labels, value: number): void;
  }

  interface Metrics {
    counter(config: MetricConfig): Counter;
    gauge(config: MetricConfig): Gauge;
    summary(config: SummaryConfig): Summary;
    forceFlush(): Promise<void>;
    shutdown(): Promise<void>;
    responseTimeMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void;
  }
}

declare function expMetrics(applicationName?: string, config?: expMetrics.Config): expMetrics.Metrics;

export = expMetrics;
