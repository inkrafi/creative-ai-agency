import { IsOptional, IsString, IsUrl } from "class-validator";

export class SubmitForReviewDto {
  // Required, not optional: "submit for review" with nothing concrete for
  // the client to look at isn't a real review request -- see Deliverable's
  // schema comment. A staging URL, a design file link, whatever fits.
  @IsUrl({ require_tld: false }) // require_tld: false -- allows localhost/staging hosts without a public TLD
  deliverableUrl!: string;

  @IsOptional()
  @IsString()
  deliverableNote?: string;
}
