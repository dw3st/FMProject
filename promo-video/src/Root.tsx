import "./index.css";
import { Composition } from "remotion";
import { PromoVideo, PROMO_DURATION } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Promo"
        component={PromoVideo}
        durationInFrames={PROMO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
