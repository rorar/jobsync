/**
 * SuperLikeCelebration component tests (Stream D / task 3).
 *
 * Tests: render, CTA click, dismiss button, queue badge, accessibility roles,
 * icon choice (Sparkles, not Star).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { SuperLikeCelebration } from "@/components/staging/SuperLikeCelebration";

describe("SuperLikeCelebration", () => {
  const baseProps = {
    id: "job-123",
    jobId: "job-123",
    vacancyTitle: "Senior Full-Stack Engineer",
    queueRemaining: 0,
    onDismiss: jest.fn(),
    onOpenJob: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the celebration title and vacancy subtitle", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    // Title: "Super-liked!" (from deck.superLikeCelebration.title)
    expect(screen.getByText(/Super-liked/i)).toBeInTheDocument();
    // Subtitle: the vacancy title
    expect(screen.getByText("Senior Full-Stack Engineer")).toBeInTheDocument();
  });

  it("has role=status and aria-live=polite (not assertive)", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    const card = screen.getByRole("status");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-live", "polite");
    // Explicitly NOT assertive — consultation §6
    expect(card).not.toHaveAttribute("aria-live", "assertive");
  });

  it("has data-testid for e2e anchoring", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    expect(screen.getByTestId("super-like-celebration")).toBeInTheDocument();
  });

  it("calls onOpenJob with jobId when primary CTA is clicked", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    const cta = screen.getByRole("button", { name: /Open job/i });
    // fireEvent.click (not userEvent) because the component has pointerdown
    // listeners for swipe-to-dismiss that interfere with userEvent's pointer
    // simulation. We just need to test the onClick contract.
    fireEvent.click(cta);

    expect(baseProps.onOpenJob).toHaveBeenCalledWith("job-123");
    expect(baseProps.onOpenJob).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss with id when X button is clicked", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    const close = screen.getByRole("button", { name: /Close celebration/i });
    fireEvent.click(close);

    expect(baseProps.onDismiss).toHaveBeenCalledWith("job-123");
  });

  it("hides the queue badge when queueRemaining is 0", () => {
    render(<SuperLikeCelebration {...baseProps} queueRemaining={0} />);

    // The "+N more" badge text should not appear
    expect(screen.queryByText(/\+\d+ more/i)).not.toBeInTheDocument();
  });

  it("shows the +N more badge when queueRemaining > 0", () => {
    render(<SuperLikeCelebration {...baseProps} queueRemaining={3} />);

    expect(screen.getByText(/\+3 more/i)).toBeInTheDocument();
  });

  it("renders the Sparkles icon (not Star) per consultation §5", () => {
    const { container } = render(<SuperLikeCelebration {...baseProps} />);

    // Sparkles is a lucide icon — it renders as an SVG with a specific data attribute
    // or class. Easiest anchor: a lucide-sparkles class lives on the Sparkles svg.
    const sparklesIcon = container.querySelector(".lucide-sparkles");
    expect(sparklesIcon).toBeInTheDocument();

    // Explicitly confirm no Star icon (reserved for the super-like action itself)
    expect(container.querySelector(".lucide-star")).not.toBeInTheDocument();
  });
});
