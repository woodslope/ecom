import { Search } from "lucide-react";

import type { ProductionRunFilters } from "../domain/tasks";
import { Button, Field, Select } from "./ui";

export function ProductionHistoryFilters({ value, onChange, onClear, hidePlatform = false, compact = false }: {
  value: ProductionRunFilters;
  onChange: (value: ProductionRunFilters) => void;
  onClear: () => void;
  hidePlatform?: boolean;
  compact?: boolean;
}) {
  const set = <K extends keyof ProductionRunFilters>(key: K, next: ProductionRunFilters[K]) =>
    onChange({ ...value, [key]: next || undefined });
  const activeCount = Object.entries(value).filter(
    ([key, item]) => Boolean(item) && (!hidePlatform || key !== "platformId"),
  ).length;
  return (
    <div className={`production-history-filters${compact ? " production-history-filters--compact" : ""}`} aria-label="生产记录筛选">
      <Field label="搜索商品或 Run" className="production-history-filters__search">
        <span className="filter-search"><Search size={15} aria-hidden="true" /><input aria-label="搜索商品或 Run" name="search" value={value.search ?? ""} placeholder="商品名、SKU、Run ID" onChange={(event) => set("search", event.target.value)} /></span>
      </Field>
      {!compact && !hidePlatform ? <Field label="平台" name="platformId"><Select value={value.platformId ?? ""} onChange={(event) => set("platformId", event.target.value as ProductionRunFilters["platformId"])}><option value="">全部</option><option value="amazon">Amazon</option><option value="taobao">淘宝 / 天猫</option></Select></Field> : null}
      {!compact ? <Field label="工作流" name="workflowId"><Select value={value.workflowId ?? ""} onChange={(event) => set("workflowId", event.target.value as ProductionRunFilters["workflowId"])}><option value="">全部</option><option value="amazon-listing">Amazon Listing</option><option value="amazon-aplus">Amazon A+</option><option value="taobao-product">淘宝商品生产包</option></Select></Field> : null}
      <Field label="状态" name="status"><Select value={value.status ?? ""} onChange={(event) => set("status", event.target.value as ProductionRunFilters["status"])}><option value="">全部</option><option value="planned">已策划</option><option value="producing">生产中</option><option value="ready">已完整</option><option value="partial">部分交付</option><option value="failed">失败</option><option value="canceled">已取消</option></Select></Field>
      {!compact ? <Field label="画面形状" name="shape"><Select value={value.shape ?? ""} onChange={(event) => set("shape", event.target.value as ProductionRunFilters["shape"])}><option value="">全部</option><option value="square">方形</option><option value="landscape">横图</option><option value="portrait">竖图</option></Select></Field> : null}
      <Button variant="secondary" size="compact" disabled={activeCount === 0} onClick={onClear}>清除{activeCount > 0 ? ` ${activeCount}` : ""}</Button>
    </div>
  );
}
