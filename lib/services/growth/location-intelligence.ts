import type { WeatherConditionLiteral } from "@/lib/services/growth/types";

type WeatherSnapshot = {
  summary: string;
  condition: WeatherConditionLiteral;
  temperatureC: number | null;
  precipitationProbability: number | null;
  source: string;
  observedAt: string;
};

type LocalitySnapshot = {
  displayName: string;
  city: string | null;
  province: string | null;
  region: string | null;
  countryCode: string | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toUpper(value: string) {
  return value.trim().toUpperCase();
}

const RAIN_WEATHER_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82,
]);
const STORM_WEATHER_CODES = new Set([95, 96, 99]);

function detectWeatherCondition(input: {
  weatherCode: number | null;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  precipitationMm: number | null;
  precipitationProbability: number | null;
}): WeatherConditionLiteral {
  if (input.weatherCode !== null && STORM_WEATHER_CODES.has(input.weatherCode)) {
    return "STORM";
  }
  if (
    (input.weatherCode !== null && RAIN_WEATHER_CODES.has(input.weatherCode)) ||
    (input.precipitationMm !== null && input.precipitationMm >= 0.2) ||
    (input.precipitationProbability !== null && input.precipitationProbability >= 60)
  ) {
    return "RAINY";
  }

  const tempForHeat = input.apparentTemperatureC ?? input.temperatureC;
  if (tempForHeat !== null && tempForHeat >= 35) {
    return "HOT";
  }
  const tempForCool = input.apparentTemperatureC ?? input.temperatureC;
  if (tempForCool !== null && tempForCool <= 22) {
    return "COOL";
  }
  if (input.weatherCode === 0 || input.weatherCode === 1 || input.weatherCode === 2) {
    return "CLEAR";
  }

  return "UNKNOWN";
}

function toWeatherSummary(input: {
  condition: WeatherConditionLiteral;
  temperatureC: number | null;
  precipitationProbability: number | null;
}) {
  const tempLabel =
    input.temperatureC === null ? "n/a" : `${input.temperatureC.toFixed(1)}C`;
  const rainLabel =
    input.precipitationProbability === null
      ? "n/a"
      : `${Math.round(input.precipitationProbability)}%`;

  switch (input.condition) {
    case "STORM":
      return `Storm risk today (${rainLabel} rain chance). Indoor comfort offers can convert.`;
    case "RAINY":
      return `Rainy conditions today (${rainLabel} rain chance). Quick, nearby promos may perform better.`;
    case "HOT":
      return `Hot day forecast (${tempLabel}). Cooling/self-care offers can increase demand.`;
    case "COOL":
      return `Cool weather window (${tempLabel}). Comfort and wellness promos may perform well.`;
    case "CLEAR":
      return `Clear weather today (${tempLabel}). Good visibility for timed promos.`;
    default:
      return "Weather signal collected but not strongly directional today.";
  }
}

async function fetchJsonWithTimeout(
  url: URL,
  timeoutMs: number,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function fetchWeatherSnapshotForCoordinates(input: {
  latitude: number;
  longitude: number;
}): Promise<WeatherSnapshot | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", input.latitude.toString());
  url.searchParams.set("longitude", input.longitude.toString());
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,precipitation,weather_code",
  );
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "Asia/Manila");

  const payloadRaw = await fetchJsonWithTimeout(url, 3000);
  const payload = toObject(payloadRaw);
  if (!payload) return null;

  const current = toObject(payload.current);
  const hourly = toObject(payload.hourly);

  const temperatureC = toFiniteNumber(current?.temperature_2m);
  const apparentTemperatureC = toFiniteNumber(current?.apparent_temperature);
  const precipitationMm = toFiniteNumber(current?.precipitation);
  const weatherCode = toFiniteNumber(current?.weather_code);
  const observedAtRaw =
    typeof current?.time === "string" ? current.time : new Date().toISOString();

  let precipitationProbability: number | null = null;
  if (Array.isArray(hourly?.precipitation_probability)) {
    const values = hourly.precipitation_probability
      .map((value) => toFiniteNumber(value))
      .filter((value): value is number => value !== null);
    if (values.length > 0) {
      precipitationProbability = clamp(Math.max(...values), 0, 100);
    }
  }

  const condition = detectWeatherCondition({
    weatherCode,
    temperatureC,
    apparentTemperatureC,
    precipitationMm,
    precipitationProbability,
  });

  return {
    summary: toWeatherSummary({ condition, temperatureC, precipitationProbability }),
    condition,
    temperatureC,
    precipitationProbability,
    source: "open-meteo",
    observedAt: observedAtRaw,
  };
}

function firstNonEmpty(...values: Array<string | null>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

export async function fetchLocalityForCoordinates(input: {
  latitude: number;
  longitude: number;
}): Promise<LocalitySnapshot | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  url.searchParams.set("latitude", input.latitude.toString());
  url.searchParams.set("longitude", input.longitude.toString());
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const payloadRaw = await fetchJsonWithTimeout(url, 3000);
  const payload = toObject(payloadRaw);
  if (!payload || !Array.isArray(payload.results) || payload.results.length === 0) {
    return null;
  }

  const first = toObject(payload.results[0]);
  if (!first) return null;

  const city = firstNonEmpty(
    typeof first.city === "string" ? first.city : null,
    typeof first.name === "string" ? first.name : null,
    typeof first.admin3 === "string" ? first.admin3 : null,
  );
  const province = firstNonEmpty(
    typeof first.admin2 === "string" ? first.admin2 : null,
    typeof first.admin3 === "string" ? first.admin3 : null,
  );
  const region = firstNonEmpty(
    typeof first.admin1 === "string" ? first.admin1 : null,
    typeof first.admin2 === "string" ? first.admin2 : null,
  );
  const countryCode =
    typeof first.country_code === "string"
      ? toUpper(first.country_code)
      : typeof first.country === "string"
        ? toUpper(first.country)
        : null;

  const parts = [city, province, region].filter(
    (value): value is string => Boolean(value),
  );
  const displayName = parts.length > 0 ? parts.join(", ") : "Unknown locality";

  return {
    displayName,
    city,
    province,
    region,
    countryCode,
  };
}

export function buildAcademicSeasonSignals(now: Date): string[] {
  const month = Number.parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      month: "2-digit",
    }).format(now),
    10,
  );
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const signals: string[] = [];
  if (month >= 1 && month <= 3) {
    signals.push(`ACADEMIC:Prom Season:${dateKey}`);
  }
  if (month >= 3 && month <= 6) {
    signals.push(`ACADEMIC:Graduation Season:${dateKey}`);
  }
  if (month >= 6 && month <= 9) {
    signals.push(`ACADEMIC:New Academic Year:${dateKey}`);
  }

  return signals;
}

