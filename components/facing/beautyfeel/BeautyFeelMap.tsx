export interface BeautyFeelMapProps {
  /** Kept for type compatibility with the parent component, but unused —
   *  the embed URL is hardcoded for the BeautyFeel storefront below. */
  latitude?: number;
  longitude?: number;
  label?: string;
}

// Hardcoded Google Maps embed for the BeautyFeel studio. Generated from
// Google Maps' "Share → Embed a map" panel. Keep in sync with the studio's
// actual address — if BeautyFeel relocates, regenerate the URL here.
const BEAUTYFEEL_EMBED_SRC =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4869.2871262625295!2d118.7400023!3d9.741062799999998!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33b5632ad4f7dcf3%3A0x578b04c106eb885f!2zQmVhdXR5RmVlbCDigJQgU2tpbiDCtyBGYWNlIMK3IE5haWxzIMK3IE1hc3NhZ2U!5e1!3m2!1sen!2sph!4v1778028147971!5m2!1sen!2sph";

export default function BeautyFeelMap({ label }: BeautyFeelMapProps) {
  return (
    <div className="relative isolate z-0 h-72 w-full overflow-hidden rounded-2xl border border-black/[0.08] bg-[color:var(--bf-cream)] sm:h-96">
      <iframe
        src={BEAUTYFEEL_EMBED_SRC}
        title={label ? `${label} — map` : "Studio location"}
        className="h-full w-full border-0"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
