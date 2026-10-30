/**
 * The Sound panel's signal scopes: band meters with peak hold, a scrolling
 * spectrogram and a spectrum, all driven by `useSignalScopes`. `MeterStrip`
 * is the compact four-bar meter that sits beside Play.
 *
 * Ported from Holodeck's SignalScopes (src/components/audio/SignalScopes.tsx,
 * MIT; notice in Holodeck-LICENSE.txt), restyled with Genobi's tokens.
 */
import { METER_BANDS, type MeterBand } from "./signal-meter";
import type { SignalScope } from "./useSignalScopes";

const LABELS: Record<MeterBand, string> = {
  low: "Low",
  mid: "Mid",
  high: "High",
  level: "Lvl",
};

/** The four live bars beside Play: decorative, the scopes carry the numbers. */
export function MeterStrip({ scope }: { scope: SignalScope }) {
  return (
    <div className="wb-meter-strip" aria-hidden="true">
      {METER_BANDS.map((band) => (
        <div key={band} className="wb-meter" data-band={band}>
          <i ref={scope.bar(band)} />
          <b ref={scope.peak(band)} />
          <small>{LABELS[band].charAt(0)}</small>
        </div>
      ))}
    </div>
  );
}

export function SignalScopes({
  scope,
  live,
}: {
  scope: SignalScope;
  /** True while the scopes read the playing track rather than the envelope. */
  live: boolean;
}) {
  return (
    <div className="wb-scopes">
      <div className="wb-scope-bars" role="group" aria-label="Band levels">
        {METER_BANDS.map((band) => (
          <div key={band} className="wb-scope-band" data-band={band}>
            <span ref={scope.read(band)} className="wb-scope-read">
              0.00
            </span>
            <div className="wb-meter wb-meter-tall">
              <i ref={scope.bar(band)} />
              <b ref={scope.peak(band)} />
            </div>
            <small>{LABELS[band]}</small>
          </div>
        ))}
      </div>
      <p className="wb-scope-label">Spectrogram</p>
      <canvas
        ref={scope.spectrogram}
        className="wb-scope-canvas"
        aria-label="Spectrogram"
      />
      <p className="wb-scope-label">Spectrum</p>
      <canvas
        ref={scope.spectrum}
        className="wb-scope-canvas wb-scope-spectrum"
        aria-label="Spectrum"
      />
      <p className="wb-hint">
        {live
          ? "Live from the playing track; the take uses the envelope at each frame."
          : "The envelope at the current frame, as the take reads it."}
      </p>
    </div>
  );
}
