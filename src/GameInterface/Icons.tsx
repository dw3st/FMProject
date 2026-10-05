import {
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

/** A classic black-and-white football (lucide has no soccer ball): white leather with a white rim, black panels, whatever the theme. */
function SoccerBall(props: SVGProps<SVGSVGElement>) {
  const clip = useId();
  const { strokeWidth: _strokeWidth, ...rest } = props;
  return (
    <svg viewBox="0 0 24 24" {...rest}>
      <defs><clipPath id={clip}><circle cx="12" cy="12" r="9.4" /></clipPath></defs>
      <circle cx="12" cy="12" r="11" fill="#f4f4f5" />
      <g clipPath={`url(#${clip})`} fill="#18181b">
        <polygon points="12.00,7.70 16.09,10.67 14.53,15.48 9.47,15.48 7.91,10.67" />
        <polygon points="21.26,2.25 20.17,5.61 16.64,5.61 15.55,2.25 18.41,0.18" />
        <polygon points="24.13,17.80 20.60,17.80 19.51,14.44 22.37,12.37 25.22,14.44" />
        <polygon points="10.24,25.33 9.15,21.97 12.00,19.90 14.85,21.97 13.76,25.33" />
        <polygon points="-1.22,14.44 1.63,12.37 4.49,14.44 3.40,17.80 -0.13,17.80" />
        <polygon points="5.59,0.18 8.45,2.25 7.36,5.61 3.83,5.61 2.74,2.25" />
      </g>
      <g stroke="#18181b" strokeWidth="0.9" strokeLinecap="round">
        <line x1="12.00" y1="7.70" x2="12.00" y2="4.00" />
        <line x1="16.09" y1="10.67" x2="19.61" y2="9.53" />
        <line x1="14.53" y1="15.48" x2="16.70" y2="18.47" />
        <line x1="9.47" y1="15.48" x2="7.30" y2="18.47" />
        <line x1="7.91" y1="10.67" x2="4.39" y2="9.53" />
      </g>
      <circle cx="12" cy="12" r="9.4" fill="none" stroke="#18181b" strokeWidth="0.6" />
    </svg>
  );
}

const ICON_MAP: Record<IconName, IconComponent> = {
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
