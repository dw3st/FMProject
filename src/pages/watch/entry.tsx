import { createPage } from "@/createPage";
import { WatchScreen } from "@/GameInterface/Watch/WatchScreen";

// Any size: the broadcast lives in a floating window the user resizes (`WatchWindowHost`).
createPage(WatchScreen, { responsive: true });
