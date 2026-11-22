import { isLocalMemberMode, localMemberSignedIn } from "../MemberPlatform/local-mode";

// Public synthetic invoice used only by the explicit loopback QA form fixture.
const preparedInvoice = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 76 >>
stream
BT /F1 12 Tf 40 100 Td (Purchase order 3 - Test fixture - NOK 3500.00) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000367 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
437
%%EOF
`;

export function preparedPurchaseInvoiceFiles(): Array<{ file: File }> {
  if (!isLocalMemberMode() || !localMemberSignedIn() || typeof window === "undefined" ||
    new URLSearchParams(window.location.search).get("invoiceFixture") !== "prepared") return [];
  return [{ file: new File([preparedInvoice], "purchase-order-3.pdf", { type: "application/pdf" }) }];
}
