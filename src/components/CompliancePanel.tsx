import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";

import type { ComplianceResult } from "../domain/compliance";
import { StatusChip, StatusMessage } from "./ui";

export function CompliancePanel({ result }: { result: ComplianceResult }) {
  const count = result.findings.length;
  const tone =
    result.severity === "error"
      ? "danger"
      : result.severity === "warning"
        ? "warning"
        : "success";

  return (
    <section className="compliance-panel" aria-labelledby="compliance-panel-title">
      <div className="slot-inspector__section-title compliance-panel__title">
        {count > 0 ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
        <strong id="compliance-panel-title">合规提示</strong>
        <StatusChip tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "success"}>
          {count > 0 ? `自动检查发现 ${count} 项` : "自动检查未发现文字风险"}
        </StatusChip>
      </div>

      {count > 0 ? (
        <ul className="compliance-findings">
          {result.findings.map((finding) => (
            <li
              key={finding.code}
              className={`compliance-finding compliance-finding--${finding.severity}`}
            >
              <span className="compliance-finding__icon" aria-hidden="true">
                {finding.severity === "error" ? (
                  <AlertTriangle size={14} />
                ) : (
                  <CheckCircle2 size={14} />
                )}
              </span>
              <span>
                <strong>{finding.message}</strong>
                {finding.evidence.length > 0 ? (
                  <span>证据：{finding.evidence.join("、")}</span>
                ) : null}
                <span>处理：{finding.userAction}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <StatusMessage tone="warning" className="compliance-manual-review">
        <span>
          <strong>仍需人工复核</strong>
          <span>{result.manualReview.reason}</span>
          <span>{result.manualReview.userAction}</span>
        </span>
      </StatusMessage>
    </section>
  );
}
