const WIDTH = 600;
const HEIGHT = 240;

export type ChartGeometry = {
  /** `points` attribute for the polyline. */
  points: string;
  /** `d` attribute for the filled area under the line. */
  area: string;
  dots: [x: number, y: number][];
};

/** Maps a series of values onto the 600×240 SVG viewBox used by the admin charts. `max` is the top of the y axis. */
export function buildChart(values: readonly number[], max: number): ChartGeometry {
  const step = WIDTH / (values.length - 1);
  const dots = values.map((v, i): [number, number] => [Math.round(i * step), Math.round(HEIGHT - (v / max) * HEIGHT)]);
  return {
    points: dots.map(([x, y]) => `${x},${y}`).join(" "),
    area: `M${dots.map(([x, y]) => `${x} ${y}`).join(" L")} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`,
    dots,
  };
}
