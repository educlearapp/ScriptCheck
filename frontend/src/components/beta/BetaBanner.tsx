import BetaLabel from "./BetaLabel";
import "./BetaLabel.css";

type Props = {
  note?: string;
};

export default function BetaBanner({
  note = "You are using the DH beta testing environment. Please report issues via the Feedback button.",
}: Props) {
  return (
    <div className="sc-beta-banner">
      <BetaLabel />
      <span className="sc-beta-banner-note">{note}</span>
    </div>
  );
}
