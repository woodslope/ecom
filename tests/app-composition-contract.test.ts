import { describe, expect, it } from "vitest";

import appSource from "../src/App.tsx?raw";
import platformProductionViewSource from "../src/components/PlatformProductionView.tsx?raw";
import platformSessionControllerSource from "../src/usePlatformSessionController.ts?raw";
import workbenchFeedbackSource from "../src/useWorkbenchFeedback.ts?raw";

describe("app composition contract", () => {
  it("delegates session and feedback lifecycle without changing the app shell contract", () => {
    expect(appSource).toContain("usePlatformSessionController(clearPlanningError)");
    expect(appSource).toContain("useWorkbenchFeedback({");
    expect(appSource).toContain("<PlatformProductionView");
    expect(appSource).toContain("<ConfirmLeaveDialog");
    expect(appSource).toContain("onCancel={cancelGeneration}");
    expect(appSource).toContain("onClick={cancelPlanning}");
    expect(appSource).toContain("onDismiss={dismissUploadFeedback}");
    expect(appSource).toContain("onDismiss={dismissExportFeedback}");
  });

  it("keeps Amazon and Taobao in independent production owners", () => {
    expect(platformProductionViewSource).toContain("<AmazonWorkspace");
    expect(platformProductionViewSource).toContain("<TaobaoWorkspace");
    expect(platformProductionViewSource).toContain("<PlatformHistoryPane");
    expect(platformProductionViewSource).toContain("onCancelPlanning={onCancelPlanning}");
    expect(platformProductionViewSource).toContain("onExport={() => onExportPlatform(platform)}");
    expect(platformProductionViewSource).toContain("onMaskEdit={onMaskEdit}");
  });

  it("preserves unsaved navigation protection and feedback timing", () => {
    expect(platformSessionControllerSource).toContain("beforeunload");
    expect(platformSessionControllerSource).toContain("setPendingLeave({ kind: \"nav\", item })");
    expect(platformSessionControllerSource).toContain("discardPendingLeave");
    expect(platformSessionControllerSource).toContain("cancelPendingLeave");
    expect(workbenchFeedbackSource.match(/3600/g)).toHaveLength(2);
    expect(workbenchFeedbackSource).toContain("5200");
    expect(workbenchFeedbackSource).toContain("dismissUploadFeedback");
    expect(workbenchFeedbackSource).toContain("dismissExportFeedback");
  });
});
