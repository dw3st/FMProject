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
  ChevronLeft,
  ChevronRight,
  Palette,
  Save,
  Upload,
  X,
  Globe,
  Star,
  FastForward,
  TrendingUp,
  TrendingDown,
  Flag,
  CheckCircle2,
  Wallet,
  Tv,
  Handshake,
  Building2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  MapPin,
  Flame,
} from "lucide-react";
import type { SVGProps } from "react";

/** Star icon rendered filled (solid) — used for an active "followed" toggle. */
function StarFilled(props: SVGProps<SVGSVGElement>) {
  return <Star {...props} fill="currentColor" />;
}

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
  | "chevron-left"
  | "chevron-right"
  | "palette"
  | "save"
  | "upload"
  | "close"
  | "globe"
  | "star"
  | "star-filled"
  | "fast-forward"
  | "trend-up"
  | "trend-down"
  | "report"
  | "check-circle"
  | "wallet"
  | "broadcast"
  | "handshake"
  | "building"
  | "alert"
  | "arrow-down-left"
  | "arrow-up-right"
  | "map-pin"
  | "load";

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
  "chevron-left":  ChevronLeft,
  "chevron-right": ChevronRight,
  "palette":      Palette,
  "save":         Save,
  "upload":       Upload,
  "close":        X,
  "globe":        Globe,
  "star":         Star,
  "star-filled":  StarFilled,
  "fast-forward": FastForward,
  "trend-up":     TrendingUp,
  "trend-down":   TrendingDown,
  "report":       Flag,
  "check-circle": CheckCircle2,
  "wallet":       Wallet,
  "broadcast":    Tv,
  "handshake":    Handshake,
  "building":     Building2,
  "alert":        AlertTriangle,
  "arrow-down-left": ArrowDownLeft,
  "arrow-up-right":  ArrowUpRight,
  "map-pin":      MapPin,
  "load":         Flame,
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
