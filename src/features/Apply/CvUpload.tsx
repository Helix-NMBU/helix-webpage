import { IconX } from "@tabler/icons-react";
import { FileInput, FileInputDropzone, FileInputItemRemove, FileInputTrigger } from "@ui-sdk/react/file-input";
import { useRef } from "react";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function CvUpload({
  maxSize,
  file,
  invalid,
  onSelect,
  onReject,
}: {
  maxSize: number;
  file: File | null;
  invalid: boolean;
  onSelect: (file: File | null) => void;
  onReject: (error: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <FileInput
      className="[&>input[type=file]]:hidden"
      accept="application/pdf"
      maxSize={maxSize}
      value={file ? [file] : []}
      onValueChange={(files, { reason }) => {
        onSelect(files[0] ?? null);
        if (reason === "remove-press") trigger.current?.focus();
      }}
      onReject={(rejections) => {
        const reason = rejections[0]?.reasons[0];
        if (reason === "too-many-files") return;
        onReject(reason === "file-too-large"
          ? "Your CV must be smaller than 500 KB."
          : "Your CV must be a PDF file.");
      }}
    >
      <FileInputDropzone
        className="relative rounded-lg border-[1.5px] border-dashed px-4 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#002EC4]"
        style={({ dragging }) => ({
          borderColor: invalid ? "#dc2626" : dragging || file ? "#002EC4" : "rgba(3,9,74,0.25)",
          backgroundColor: dragging ? "rgba(0,46,196,0.04)" : "rgba(3,9,74,0.02)",
        })}
      >
        <FileInputTrigger
          ref={trigger}
          className="absolute inset-0 cursor-pointer rounded-lg outline-none"
          aria-label={file ? "Replace CV PDF" : "Choose CV PDF"}
          aria-describedby={invalid ? "application-cv-hint application-cv-error" : "application-cv-hint"}
          aria-invalid={invalid || undefined}
        />
        {file ? (
          <div className="pointer-events-none relative flex items-center justify-center gap-3">
            <span
              style={{
                fontSize: "14px",
                color: "#03094A",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "280px",
              }}
            >
              {file.name}
            </span>
            <span style={{ fontSize: "12px", color: "rgba(3,9,74,0.4)", flexShrink: 0 }}>
              {formatBytes(file.size)}
            </span>
            <FileInputItemRemove
              file={file}
              aria-label="Remove file"
              className="pointer-events-auto relative z-10"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "22px",
                height: "22px",
                flexShrink: 0,
                borderRadius: "50%",
                border: "1.5px solid rgba(3,9,74,0.25)",
                background: "none",
                cursor: "pointer",
                color: "#03094A",
              }}
            >
              <IconX width={9} height={9} stroke={3.6} aria-hidden="true" />
            </FileInputItemRemove>
          </div>
        ) : (
          <div className="pointer-events-none relative">
            <p style={{ fontSize: "14px", color: "#03094A", fontWeight: 500, marginBottom: "2px" }}>
              Click or drop a file here
            </p>
            <p style={{ fontSize: "12px", color: "rgba(3,9,74,0.4)" }}>PDF, max 500 KB</p>
          </div>
        )}
      </FileInputDropzone>
      <span id="application-cv-hint" className="sr-only">PDF, max 500 KB</span>
    </FileInput>
  );
}
