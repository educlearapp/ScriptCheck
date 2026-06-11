import { useState } from "react";
import { useFeedback } from "../../hooks/useFeedback";
import FeedbackModal from "./FeedbackModal";
import "./FeedbackButton.css";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const { submit, submitting } = useFeedback();

  return (
    <>
      <button
        type="button"
        className="sc-feedback-fab"
        onClick={() => setOpen(true)}
        aria-label="Send beta feedback"
        title="Send beta feedback"
      >
        Feedback
      </button>

      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        submitting={submitting}
        onSubmit={async (input) => {
          await submit(input);
        }}
      />
    </>
  );
}
