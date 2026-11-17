// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import CvUpload from "./CvUpload";

it("accepts one PDF, rejects invalid replacements, and removes the selected file", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const reject = vi.fn();

  function Field() {
    const [file, setFile] = useState<File | null>(null);
    return <CvUpload maxSize={500 * 1024} file={file} invalid={false} onSelect={setFile} onReject={reject} />;
  }

  async function drop(file: File) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    await act(async () => container.querySelector('[data-slot="file-input-dropzone"]')!.dispatchEvent(event));
  }

  try {
    await act(async () => root.render(<Field />));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const openPicker = vi.spyOn(input, "click");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Choose CV PDF"]')!.click());
    expect(openPicker).toHaveBeenCalledOnce();
    expect(input.accept).toBe("application/pdf");

    await drop(new File(["PDF"], "cv.pdf", { type: "application/pdf" }));
    expect(container.textContent).toContain("cv.pdf");
    await drop(new File(["text"], "cv.txt", { type: "text/plain" }));
    expect(reject).toHaveBeenLastCalledWith("Your CV must be a PDF file.");
    await drop(new File([new Uint8Array(500 * 1024 + 1)], "large.pdf", { type: "application/pdf" }));
    expect(reject).toHaveBeenLastCalledWith("Your CV must be smaller than 500 KB.");
    expect(container.textContent).toContain("cv.pdf");

    await drop(new File(["PDF"], "replacement.pdf", { type: "application/pdf" }));
    expect(container.textContent).toContain("replacement.pdf");
    expect(container.querySelector('[aria-label="Replace CV PDF"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove file"]')!.click());
    expect(document.activeElement).toBe(container.querySelector('[aria-label="Choose CV PDF"]'));
    expect(container.textContent).not.toContain("replacement.pdf");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
