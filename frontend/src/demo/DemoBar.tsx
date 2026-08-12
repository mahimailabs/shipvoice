/**
 * The preview's standing disclosure.
 *
 * It sits in the console chrome above the scroller, so it is on every screen
 * and it does not scroll away. There is deliberately no dismiss control: a
 * banner you can close is a banner people close, and then they are reading
 * sample numbers as a deployment's own.
 */
export function DemoBar() {
  return (
    <div className="demo-bar">
      <span className="demo-tag">Preview</span>
      {/* The money strip on Overview is named explicitly. Lite does not meter a
          minute or bill anyone, and those figures are the paid console's, marked
          in the page by a red dot you have to hover to read. On a public preview
          that is the first thing a stranger sees, and a hover is not a
          disclosure. */}
      <span className="demo-say">
        The ShipVoice Lite console, built from this repo and running on sample
        calls. There is no backend, no database and no LiveKit project behind
        this page, and no call is placed from it. Figures marked with a red dot,
        including the cost and billing strip, come from the paid console: Lite
        does not meter or bill.
      </span>
      <a
        href="https://github.com/mahimailabs/shipvoice"
        target="_blank"
        rel="noreferrer noopener"
      >
        Get the repo →
      </a>
    </div>
  );
}
