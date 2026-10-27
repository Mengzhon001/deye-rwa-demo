import { ReviewDecision, ReviewDecisionSchema } from "../types/schemas";

export function createReviewDecision(input: ReviewDecision): ReviewDecision {
  return ReviewDecisionSchema.parse(input);
}
