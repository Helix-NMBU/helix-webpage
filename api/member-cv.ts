import { createMemberCvHandler } from "./_lib/member-cv-handler.js";
import { generateCvPdf } from "./_lib/member-cv-pdf.js";
import { MemberCvError } from "./_lib/member-cv-service.js";

export default createMemberCvHandler(async (data, sharing) => {
  try { return await generateCvPdf(data, sharing); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("The CV font does not support ")) {
      throw new MemberCvError(400, error.message);
    }
    throw error;
  }
});
