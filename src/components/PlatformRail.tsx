import {
  Boxes,
  FolderOpen,
  History,
  LayoutDashboard,
  PackageCheck,
  Settings,
  ShoppingBag,
} from "lucide-react";
import type { ReactNode } from "react";

import { navigationItems } from "../domain/platforms/registry";
import type { NavigationItemId } from "../domain/platforms/types";
import { Tooltip } from "./ui";

const iconById = {
  overview: LayoutDashboard,
  library: FolderOpen,
  taobao: ShoppingBag,
  amazon: PackageCheck,
  history: History,
  settings: Settings,
} satisfies Record<NavigationItemId, typeof LayoutDashboard>;

const navigationDescriptions: Record<NavigationItemId, string> = {
  overview: "总览与下一步",
  library: "档案 · 资料与参考图",
  taobao: "头图与详情（次级）",
  amazon: "主路径 · Listing / A+",
  history: "Run、版本与导出记录",
  settings: "Demo / API 连接",
};

const navigationGroups: Array<{
  label: string;
  ids: NavigationItemId[];
}> = [
  { label: "工作台", ids: ["overview"] },
  { label: "生产流程", ids: ["library", "taobao", "amazon"] },
  { label: "记录", ids: ["history"] },
];

export function PlatformRail({
  activeItem,
  onChange,
  runtimeBadge,
}: {
  activeItem: NavigationItemId;
  onChange: (item: NavigationItemId) => void;
  runtimeBadge?: ReactNode;
}) {
  const settingsItem = navigationItems.find((item) => item.id === "settings")!;

  const renderItem = (item: (typeof navigationItems)[number]) => {
    const Icon = iconById[item.id];
    const isActive = activeItem === item.id;
    return (
      <Tooltip key={item.id} label={item.label} className="rail-tooltip">
        <button
          className={`rail-item rail-item--${item.kind}${isActive ? " rail-item--active" : ""}`}
          onClick={() => onChange(item.id)}
          aria-label={item.label}
          aria-current={isActive ? "page" : undefined}
          style={item.accent ? ({ "--item-accent": item.accent } as React.CSSProperties) : undefined}
        >
          <span className="rail-item__glyph" aria-hidden="true">
            <Icon size={19} strokeWidth={1.8} />
          </span>
          <span className="rail-item__copy">
            <strong>{item.label}</strong>
            <small>{navigationDescriptions[item.id]}</small>
          </span>
        </button>
      </Tooltip>
    );
  };

  return (
    <aside className="platform-rail" aria-label="平台和全局工具">
      <div className="rail-brand" title="电商工作台">
        <div className="brand-tile">
          <Boxes size={21} strokeWidth={1.9} />
        </div>
        <div className="rail-brand__copy">
          <strong>Ecom</strong>
          <span>电商工作台</span>
        </div>
      </div>
      <nav className="platform-rail__nav">
        {navigationGroups.map((group) => (
          <section className="rail-nav-group" key={group.label} aria-label={group.label}>
            <span className="rail-nav-group__label">{group.label}</span>
            <div className="rail-nav-group__items">
              {group.ids.map((id) => renderItem(navigationItems.find((item) => item.id === id)!))}
            </div>
          </section>
        ))}
      </nav>
      <div className="platform-rail__footer">
        {runtimeBadge ? <div className="platform-rail__runtime">{runtimeBadge}</div> : null}
        {renderItem(settingsItem)}
      </div>
    </aside>
  );
}

export function MobileNavigation({
  activeItem,
  onChange,
}: {
  activeItem: NavigationItemId;
  onChange: (item: NavigationItemId) => void;
}) {
  return (
    <nav className="mobile-navigation" aria-label="移动端导航">
      {navigationItems.map((item) => {
        const Icon = iconById[item.id];
        const isActive = activeItem === item.id;
        return (
          <button
            key={item.id}
            className={`mobile-navigation__item${isActive ? " is-active" : ""}`}
            onClick={() => onChange(item.id)}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={18} strokeWidth={1.9} />
            <span>{item.id === "taobao" ? "淘宝" : item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
