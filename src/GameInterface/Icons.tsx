import {
  Play,
  Pause,
  Bug,
  RefreshCw,
  Gamepad2,
  FolderOpen,
  Settings,
  BarChart3,
  LayoutGrid,
  DollarSign,
  Users,
  Trophy,
  Shirt,
  Search,
  Newspaper,
  ShoppingBag,
  Shield,
  Zap,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Palette,
  Save,
  Upload,
  X,
} from "lucide-react";
import type { SVGProps } from "react";

export type IconName =
  | "play"
  | "pause"
  | "debug"
  | "debug-active"
  | "refresh"
  | "gamepad"
  | "folder"
  | "settings"
  | "stats"
  | "formation"
  | "finances"
  | "staff"
  | "trophy"
  | "squad"
  | "search"
  | "news"
  | "transfers"
  | "shield"
  | "zap"
  | "arrow-left"
  | "chevron-up"
  | "chevron-down"
  | "palette"
  | "save"
  | "upload"
  | "close";

type IconComponent = React.ComponentType<SVGProps<SVGSVGElement>>;

const ICON_MAP: Record<IconName, IconComponent> = {
  "play":         Play,
  "pause":        Pause,
  "debug":        Bug,
  "debug-active": Bug,
  "refresh":      RefreshCw,
  "gamepad":      Gamepad2,
  "folder":       FolderOpen,
  "settings":     Settings,
  "stats":        BarChart3,
  "formation":    LayoutGrid,
  "finances":     DollarSign,
  "staff":        Users,
  "trophy":       Trophy,
  "squad":        Shirt,
  "search":       Search,
  "news":         Newspaper,
  "transfers":    ShoppingBag,
  "shield":       Shield,
  "zap":          Zap,
  "arrow-left":   ArrowLeft,
  "chevron-up":   ChevronUp,
  "chevron-down": ChevronDown,
  "palette":      Palette,
  "save":         Save,
  "upload":       Upload,
  "close":        X,
};

export interface IconProps {
  name:        IconName;
  size?:       number;
  className?:  string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, className, strokeWidth = 1.5 }: IconProps) {
  const Component = ICON_MAP[name];
  return <Component width={size} height={size} className={className} strokeWidth={strokeWidth} />;
}
