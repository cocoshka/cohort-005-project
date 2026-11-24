const FLAKES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  size: `${6 + ((i * 7) % 8)}px`,
  duration: `${9 + ((i * 5) % 9)}s`,
  delay: `-${(i * 3) % 14}s`,
}));

/** Falling snow, shown only while the festive theme is on. */
export function Snowfall() {
  return (
    <div className="snowfall" aria-hidden="true">
      {FLAKES.map((flake) => (
        <span
          key={flake.left + flake.delay}
          className="snowflake"
          style={{
            left: flake.left,
            width: flake.size,
            height: flake.size,
            animationDuration: flake.duration,
            animationDelay: flake.delay,
          }}
        />
      ))}
    </div>
  );
}
