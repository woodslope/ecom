import { useCallback, useState } from "react";
import { ArrowRight, Check, PackageOpen, Settings, ShoppingBag, X } from "lucide-react";
import { Button, IconButton } from "./ui";

export const ONBOARDING_DISMISSED_KEY = "ecom-onboarding-guide-dismissed";

export function isOnboardingDismissed(storage: {
  getItem(key: string): string | null;
}): boolean {
  return storage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
}

export function dismissOnboarding(storage: {
  setItem(key: string, value: string): void;
}): void {
  storage.setItem(ONBOARDING_DISMISSED_KEY, "true");
}

interface OnboardingGuideProps {
  onDismiss: () => void;
  onQuickStart: () => void;
}

const STEPS = [
  {
    icon: PackageOpen,
    title: "建立商品资料",
    description:
      "在资料库中填写商品名称、品类和卖点，或直接粘贴 Amazon Listing 原文自动解析。",
    tip: "已有商品信息？直接粘贴 Listing 更快。",
  },
  {
    icon: ShoppingBag,
    title: "AI 策划与生成",
    description:
      "选择目标平台（Amazon 或淘宝），AI 根据商品事实和参考图自动策划图片方案，逐槽生成或批量执行。",
    tip: "Demo 模式先用本地引擎体验流程，不消耗 API 额度。",
  },
  {
    icon: Settings,
    title: "编辑、版本与导出",
    description:
      "每个槽位支持 Prompt 编辑、多版本切换、遮罩局部修改和合规检查，完成后一键导出 ZIP 交付包。",
    tip: "生产记录保存每次完整 Run，支持恢复、fork 和历史重导出。",
  },
];

export function OnboardingGuide({ onDismiss, onQuickStart }: OnboardingGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step]!;

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else onDismiss();
  }, [step, onDismiss]);

  const dismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const Icon = current.icon;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="新手指引">
      <div className="onboarding-card">
        <div className="onboarding-card__header">
          <Icon size={24} strokeWidth={1.7} />
          <IconButton label="关闭指引" onClick={dismiss}>
            <X size={16} />
          </IconButton>
        </div>

        <div className="onboarding-card__steps">
          {STEPS.map((s, i) => (
            <span
              key={i}
              className={`onboarding-step-dot${i === step ? " onboarding-step-dot--active" : ""}${i < step ? " onboarding-step-dot--done" : ""}`}
              aria-label={`第 ${i + 1} 步${i === step ? "（当前）" : ""}`}
            >
              {i < step ? <Check size={10} /> : i + 1}
            </span>
          ))}
        </div>

        <div className="onboarding-card__body">
          <h3>{current.title}</h3>
          <p>{current.description}</p>
          <p className="onboarding-card__tip">💡 {current.tip}</p>
        </div>

        <div className="onboarding-card__footer">
          <Button variant="quiet" size="compact" onClick={dismiss}>
            跳过引导
          </Button>
          <div className="onboarding-card__actions">
            {step === 0 ? (
              <Button variant="secondary" size="compact" onClick={onQuickStart}>
                快速体验
              </Button>
            ) : null}
            <Button size="compact" onClick={next}>
              {step < STEPS.length - 1 ? (
                <>
                  下一步
                  <ArrowRight size={14} />
                </>
              ) : (
                "开始使用"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
