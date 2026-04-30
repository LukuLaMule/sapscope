import { Composition } from "remotion";
import { SAPscopeDemo } from "./SAPscopeDemo";

export const RemotionRoot = () => (
  <Composition
    id="SAPscopeDemo"
    component={SAPscopeDemo}
    durationInFrames={2700} // 90s @ 30fps
    fps={30}
    width={1920}
    height={1080}
  />
);
