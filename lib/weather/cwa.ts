export const TAIWAN_COUNTIES = [
  "基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣",
  "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市",
  "嘉義縣", "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣",
  "臺東縣", "澎湖縣", "金門縣", "連江縣",
] as const;

export interface WeatherPeriod {
  start: string;
  end: string;
  weather: string;
  rainChance: string;
  minTemp: string;
  maxTemp: string;
  comfort: string;
}

interface CwaTimeEntry {
  startTime: string;
  endTime: string;
  parameter: { parameterName: string; parameterUnit?: string };
}

interface CwaWeatherElement {
  elementName: "Wx" | "PoP" | "MinT" | "MaxT" | "CI";
  time: CwaTimeEntry[];
}

/**
 * F-C0032-001 — CWA's 36-hour general forecast, county-level (not
 * township). Deliberately the simpler of CWA's two forecast datasets: it's
 * one flat call per county with a shape we've verified against the real
 * API, versus the multi-day township dataset which returns every township
 * in Taiwan per call and needs name-matching logic we haven't proven yet.
 * Trade-off is real: this only covers ~today and tomorrow, not a week out.
 */
export async function getCwaForecast(county: string): Promise<WeatherPeriod[] | null> {
  const apiKey = process.env.CWA_API_KEY;
  if (!apiKey) return null;

  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${apiKey}&locationName=${encodeURIComponent(county)}&format=JSON`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const data = await res.json();
  const elements: CwaWeatherElement[] | undefined = data?.records?.location?.[0]?.weatherElement;
  if (!elements) return null;

  const byName = (name: CwaWeatherElement["elementName"]) =>
    elements.find((e) => e.elementName === name)?.time ?? [];

  const wx = byName("Wx");
  const pop = byName("PoP");
  const minT = byName("MinT");
  const maxT = byName("MaxT");
  const ci = byName("CI");

  return wx.map((entry, i) => ({
    start: entry.startTime,
    end: entry.endTime,
    weather: entry.parameter.parameterName,
    rainChance: pop[i]?.parameter.parameterName ?? "?",
    minTemp: minT[i]?.parameter.parameterName ?? "?",
    maxTemp: maxT[i]?.parameter.parameterName ?? "?",
    comfort: ci[i]?.parameter.parameterName ?? "",
  }));
}
