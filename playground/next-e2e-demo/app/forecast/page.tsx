import { getForecast } from "../lib/weather.ts";

export default async function ForecastPage() {
  return (
    <>
      <h1>Forecast</h1>
      <p>Today: {await getForecast()}</p>
    </>
  );
}
