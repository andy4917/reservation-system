import type { ReactNode } from "react";
import type { SummaryMetric } from "../types";

export function WorkspaceHero(props: { title: string; summary: string; action: string }) {
  return (
    <div className="workspace-hero">
      <div>
        <span className="workspace-kicker">현재 메뉴</span>
        <h2>{props.title}</h2>
        <p>{props.summary}</p>
      </div>
      <div className="workspace-action">{props.action}</div>
    </div>
  );
}

export function MetricCardGrid(props: { metrics: SummaryMetric[] }) {
  return (
    <div className="metric-grid">
      {props.metrics.map((metric) => (
        <article key={metric.label} className={`metric-card tone-${metric.tone || "default"}`}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </div>
  );
}

export function PanelHeading(props: { kicker: string; title: string; description: string }) {
  return (
    <div className="panel-heading">
      <div>
        <span className="workspace-kicker">{props.kicker}</span>
        <h3>{props.title}</h3>
      </div>
      <p>{props.description}</p>
    </div>
  );
}

export function SectionCard(props: { children: ReactNode; className?: string }) {
  return <section className={props.className || "process-panel"}>{props.children}</section>;
}

export function PlaceholderGrid(props: { children: ReactNode }) {
  return <div className="workspace-placeholder">{props.children}</div>;
}
