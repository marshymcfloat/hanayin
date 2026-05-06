// Thin pass-through. Previously this wrapped the Leaflet-based map in
// `dynamic({ ssr: false })` because Leaflet required `window`. The map
// is now a plain Google Maps iframe that renders server-side cleanly,
// so no client-side gymnastics needed.
import BeautyFeelMap, { type BeautyFeelMapProps } from "./BeautyFeelMap";

export default function BeautyFeelMapWrapper(props: BeautyFeelMapProps) {
  return <BeautyFeelMap {...props} />;
}
