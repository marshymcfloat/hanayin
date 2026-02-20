import React from "react";
import { cn } from "@/lib/utils";

interface WaveDividerProps extends React.SVGProps<SVGSVGElement> {
  fill: string;
  position?: "top" | "bottom";
  flipX?: boolean;
  pattern?: 1 | 2 | 3;
}

export const WaveDivider: React.FC<WaveDividerProps> = ({
  fill,
  position = "bottom",
  flipX = false,
  pattern = 1,
  className,
  ...props
}) => {
  const getPath = () => {
    // Generate different organic wave patterns to avoid repetition
    switch (pattern) {
      case 2:
        return position === "bottom"
          ? "M0,96L80,112C160,128,320,160,480,144C640,128,800,64,960,64C1120,64,1280,128,1360,160L1440,192L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"
          : "M0,224L80,208C160,192,320,160,480,176C640,192,800,256,960,256C1120,256,1280,192,1360,160L1440,128L1440,0L1360,0C1280,0,1120,0,960,0C800,0,640,0,480,0C320,0,160,0,80,0L0,0Z";
      case 3:
        return position === "bottom"
          ? "M0,160L120,170.7C240,181,480,203,720,192C960,181,1200,139,1320,117.3L1440,96L1440,320L1320,320C1200,320,960,320,720,320C480,320,240,320,120,320L0,320Z"
          : "M0,160L120,149.3C240,139,480,117,720,128C960,139,1200,181,1320,202.7L1440,224L1440,0L1320,0C1200,0,960,0,720,0C480,0,240,0,120,0L0,0Z";
      case 1:
      default:
        // Default clean sweeping wave
        return position === "bottom"
          ? "M1440,160 C1080,320 360,0 0,160 L0,320 L1440,320 Z"
          : "M0,160 C360,0 1080,320 1440,160 L1440,0 L0,0 Z";
    }
  };

  return (
    <div
      className={cn(
        "absolute left-0 right-0 w-full pointer-events-none z-10",
        position === "top" ? "top-0" : "bottom-0",
        flipX && "scale-x-[-1]",
        // Adjust height for visual impact but limit on huge screens so it doesn't get ridiculously tall
        "h-16 sm:h-24 lg:h-32 xl:h-40",
        className,
      )}
      style={{ lineHeight: 0 }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        className="w-full h-full block"
        {...props}
      >
        <path fill={fill} d={getPath()} />
      </svg>
    </div>
  );
};
