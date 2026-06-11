import {
  TRIAL_WATERMARK_FOOTER,
  TRIAL_WATERMARK_SUBTITLE,
  TRIAL_WATERMARK_TITLE,
} from "./constants";
import "./TrialWatermark.css";

type Props = {
  children: React.ReactNode;
};

export default function TrialWatermark({ children }: Props) {
  return (
    <div className="sc-trial-watermark-wrap">
      {children}
      <div className="sc-trial-watermark" aria-hidden="true">
        <div className="sc-trial-watermark-inner">
          <strong>{TRIAL_WATERMARK_TITLE}</strong>
          <span>{TRIAL_WATERMARK_SUBTITLE}</span>
          <em>{TRIAL_WATERMARK_FOOTER}</em>
        </div>
      </div>
    </div>
  );
}
