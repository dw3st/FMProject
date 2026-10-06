import {
  Binoculars,
  Gem,
  Play,
  Pause,
  Bug,
  RefreshCw,
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
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  Sun,
  CloudSun,
  CloudRain,
  Wind,
  Snowflake,
  ThermometerSun,
  ThermometerSnowflake,
  Landmark,
  FlaskConical,
  Beaker,
  PlayCircle,
  Grid3x3,
  Clapperboard,
  Send,
  Clipboard,
  Copy,
  Download,
  FileJson,
  Pencil,
  Plus,
  Laugh,
  Smile,
  Meh,
  Frown,
  Angry,
  MessagesSquare,
} from "lucide-react";
import { useId, type SVGProps } from "react";

/** Star icon rendered filled (solid) — used for an active "followed" toggle. */
function StarFilled(props: SVGProps<SVGSVGElement>) {
  return <Star {...props} fill="currentColor" />;
}

export type IconName =
  | "binoculars"
  | "gem"
  | "play"
  | "pause"
  | "debug"
  | "debug-active"
  | "refresh"
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
  | "chevron-up"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
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
  | "sun"
  | "cloud-sun"
  | "cloud-rain"
  | "wind"
  | "snowflake"
  | "thermometer-sun"
  | "thermometer-snowflake"
  | "stadium"
  | "flask"
  | "beaker"
  | "play-circle"
  | "grid"
  | "clapperboard"
  | "send"
  | "clipboard"
  | "copy"
  | "download"
  | "file-json"
  | "pencil"
  | "plus"
  | "ball"
  | "face-very-happy"
  | "face-content"
  | "face-neutral"
  | "face-unhappy"
  | "face-furious"
  | "talk"
;

type IconComponent = React.ComponentType<SVGProps<SVGSVGElement>>;

/** A line-art football (lucide has no soccer ball): pentagon and hexagon seams in `currentColor`, like the other icons. */
function SoccerBall(props: SVGProps<SVGSVGElement>) {
  const clip = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <defs><clipPath id={clip}><circle cx="12" cy="12" r="10" /></clipPath></defs>
      <path clipPath={`url(#${clip})`} d="M12.00,8.40 L15.42,10.89 L14.12,14.91 L9.88,14.91 L8.58,10.89 Z M12.00,8.40 L12.00,5.70 M15.42,10.89 L17.99,10.05 M14.12,14.91 L15.70,17.10 M9.88,14.91 L8.30,17.10 M8.58,10.89 L6.01,10.05 M16.23,6.18 L15.00,2.37 L18.23,0.02 L21.46,2.37 L20.23,6.18 Z M18.85,14.22 L22.08,11.88 L25.31,14.22 L24.08,18.03 L20.08,18.03 Z M12.00,19.20 L15.23,21.55 L14.00,25.35 L10.00,25.35 L8.77,21.55 Z M5.15,14.22 L3.92,18.03 L-0.08,18.03 L-1.31,14.22 L1.92,11.88 Z M7.77,6.18 L3.77,6.18 L2.54,2.37 L5.77,0.02 L9.00,2.37 Z M12.00,5.70 L16.23,6.18 M12.00,5.70 L7.77,6.18 M17.99,10.05 L18.85,14.22 M17.99,10.05 L16.23,6.18 M15.70,17.10 L12.00,19.20 M15.70,17.10 L18.85,14.22 M8.30,17.10 L5.15,14.22 M8.30,17.10 L12.00,19.20 M6.01,10.05 L7.77,6.18 M6.01,10.05 L5.15,14.22" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

const ICON_MAP: Record<IconName, IconComponent> = {
  "binoculars":   Binoculars,
  "gem":          Gem,
  "play":         Play,
  "pause":        Pause,
  "debug":        Bug,
  "debug-active": Bug,
  "refresh":      RefreshCw,
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
  "chevron-up":   ChevronUp,
  "chevron-down": ChevronDown,
  "chevron-left":  ChevronLeft,
  "chevron-right": ChevronRight,
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
  "sun": Sun,
  "cloud-sun": CloudSun,
  "cloud-rain": CloudRain,
  "wind": Wind,
  "snowflake": Snowflake,
  "thermometer-sun": ThermometerSun,
  "thermometer-snowflake": ThermometerSnowflake,
  "stadium": Landmark,
  "flask": FlaskConical,
  "beaker": Beaker,
  "play-circle": PlayCircle,
  "grid": Grid3x3,
  "clapperboard": Clapperboard,
  "send": Send,
  "clipboard": Clipboard,
  "copy": Copy,
  "download": Download,
  "file-json": FileJson,
  "pencil": Pencil,
  "plus": Plus,
  "ball": SoccerBall,
  "face-very-happy": Laugh,
  "face-content": Smile,
  "face-neutral": Meh,
  "face-unhappy": Frown,
  "face-furious": Angry,
  "talk": MessagesSquare,
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
export function iconOf(name: IconName, size = 16, strokeWidth?: number): React.ComponentType<{ className?: string }> {
  return function IconOf({ className }) {
    return <Icon name={name} size={size} className={className} strokeWidth={strokeWidth} />;
  };
}
