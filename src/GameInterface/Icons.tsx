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
  Sparkles,
  Image as ImageIcon,
  Swords,
  Dumbbell,
  Moon,
  Calendar,
  Construction,
  Minus,
  XCircle,
  Check,
  Tag,
  ChevronsLeft,
  ChevronsRight,
  MessageSquare,
  Target,
  User,
  Activity,
  ArrowRight,
  UserPlus,
  CheckCheck,
  Award,
  HeartPulse,
  FileText,
  ArrowRightLeft,
  Cloud,
  Clock,
  FileSignature,
  Loader2,
  SlidersHorizontal,
  RotateCcw,
  Medal,
  Crown,
  LogOut,
  Home,
  Trash2,
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
  | "load"
  | "sparkles"
  | "image"
  | "match"
  | "training"
  | "rest"
  | "calendar"
  | "construction"
  | "minus"
  | "xcircle"
  | "check"
  | "tag"
  | "chevrons-left"
  | "chevrons-right"
  | "message-square"
  | "target"
  | "user"
  | "activity"
  | "arrow-right"
  | "user-plus"
  | "check-check"
  | "award"
  | "heart-pulse"
  | "file-text"
  | "arrow-right-left"
  | "cloud"
  | "clock"
  | "file-signature"
  | "loader2"
  | "sliders-horizontal"
  | "rotate-ccw"
  | "medal"
  | "crown"
  | "log-out"
  | "home"
  | "trash2"
;

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
  "sparkles":     Sparkles,
  "image":        ImageIcon,
  "match":        Swords,
  "training":     Dumbbell,
  "rest":         Moon,
  "calendar":     Calendar,
  "construction": Construction,
  "minus": Minus,
  "xcircle": XCircle,
  "check": Check,
  "tag": Tag,
  "chevrons-left": ChevronsLeft,
  "chevrons-right": ChevronsRight,
  "message-square": MessageSquare,
  "target": Target,
  "user": User,
  "activity": Activity,
  "arrow-right": ArrowRight,
  "user-plus": UserPlus,
  "check-check": CheckCheck,
  "award": Award,
  "heart-pulse": HeartPulse,
  "file-text": FileText,
  "arrow-right-left": ArrowRightLeft,
  "cloud": Cloud,
  "clock": Clock,
  "file-signature": FileSignature,
  "loader2": Loader2,
  "sliders-horizontal": SlidersHorizontal,
  "rotate-ccw": RotateCcw,
  "medal": Medal,
  "crown": Crown,
  "log-out": LogOut,
  "home": Home,
  "trash2": Trash2,
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

/** An icon as a component, for icon tables (`{ icon: iconOf("trophy") }`) rendered as `<Cmp className=... />`. */
export function iconOf(name: IconName, size = 16): React.ComponentType<{ className?: string }> {
  return function IconOf({ className }) {
    return <Icon name={name} size={size} className={className} />;
  };
}
