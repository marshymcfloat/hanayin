import type { ComponentProps } from "react";

export default function CaptureLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
