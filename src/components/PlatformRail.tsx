import {
  Boxes,
  PackageCheck,
  Settings,
  ShoppingBag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { navigationItems } from "../domain/platforms/registry";
import type { NavigationItemId } from "../domain/platforms/types";
import { Button, Tooltip } from "./ui";

const iconById: Partial<Record<NavigationItemId, LucideIcon>> = {
  taobao: ShoppingBag,
  amazon: PackageCheck,
  settings: Settings,
};

const navigationDescriptions: Partial<Record<NavigationItemId, string>> = {
  taobao: "主图与详情图任务",
  amazon: "Listing / A+ 图片任务",
  settings: "API 连接",
};

const navigationGroups: Array<{
  label: string;
  ids: NavigationItemId[];
}> = [
  { label: "平台", ids: ["taobao", "amazon"] },
];

export function PlatformRail({
  activeItem,
  onChange,
}: {
  activeItem: NavigationItemId;
  onChange: (item: NavigationItemId) => void;
}) {
  const settingsItem = navigationItems.find((item) => item.id === "settings")!;

  const renderItem = (item: (typeof navigationItems)[number]) => {
    const Icon = iconById[item.id];
    if (!Icon) return null;
    const isActive = activeItem === item.id;
    return (
      <Tooltip key={item.id} label={item.label} className="rail-tooltip">
        <Button
          type="button"
          variant="quiet"
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
            <small>{navigationDescriptions[item.id] ?? item.label}</small>
          </span>
        </Button>
      </Tooltip>
    );
  };

  return (
    <aside className="platform-rail" aria-label="平台导航">
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
        {renderItem(settingsItem)}
      </div>
    </aside>
  );
}
