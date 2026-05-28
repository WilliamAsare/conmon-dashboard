"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertCircle, CheckCircle, Info } from "lucide-react";
import { ingestScan } from "./actions";
import type { IngestState } from "./actions";

const initial: IngestState = { status: "idle" };

interface UploadFormProps {
  systemId: string;
  systemName: string;
}

const ACCEPTED_TYPES = ".nessus,.csv,text/xml,text/csv,application/xml";
const MAX_FILE_MB = 50;

export function UploadForm({ systemId, systemName }: UploadFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState(ingestScan, initial);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Redirect on success after a brief moment for the user to see the summary
  useEffect(() => {
    if (state.status === "success") {
      const t = setTimeout(() => {
        router.push(`/systems/${systemId}`);
        router.refresh();
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [state, systemId, router]);

  const validateAndSetFile = (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".nessus") && !lower.endsWith(".csv")) {
      setFileError("Only .nessus and .csv files are accepted.");
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`File exceeds the ${MAX_FILE_MB} MB limit.`);
      setSelectedFile(null);
      return;
    }
    setFileError(null);
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  if (state.status === "success") {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle size={20} className="text-green-600 shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold">Scan ingested successfully</h2>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: "Total findings", value: state.newFindings + state.updatedFindings },
            { label: "New findings", value: state.newFindings },
            { label: "Updated (recurring)", value: state.updatedFindings },
            { label: "POA&Ms created", value: state.poamsCreated },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-md border border-border p-3">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </dl>
        {state.warnings.length > 0 && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Info size={14} aria-hidden="true" />
              Parser warnings
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {state.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Redirecting to system overview…</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="system_id" value={systemId} />

      {/* System context */}
      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Uploading scan for: </span>
        <span className="font-medium">{systemName}</span>
      </div>

      {/* Scan type */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="scan_type">
          Scan type <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
        </label>
        <select
          id="scan_type"
          name="scan_type"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Select type…</option>
          <option value="os">OS / Host</option>
          <option value="webapp">Web Application</option>
          <option value="database">Database</option>
        </select>
      </div>

      {/* File drop zone */}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">
          Scan file <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
        </span>
        <label
          htmlFor="file"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : selectedFile
              ? "border-green-500/50 bg-green-500/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          {selectedFile ? (
            <>
              <FileText size={32} className="text-green-600" aria-hidden="true" />
              <div className="text-center">
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB — click to change
                </p>
              </div>
            </>
          ) : (
            <>
              <Upload size={32} className="text-muted-foreground" aria-hidden="true" />
              <div className="text-center">
                <p className="text-sm font-medium">Drop scan file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Accepts .nessus (Nessus v2) or .csv (Qualys VMDR) — max {MAX_FILE_MB} MB
                </p>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            id="file"
            name="file"
            type="file"
            accept={ACCEPTED_TYPES}
            required
            className="sr-only"
            onChange={handleFileChange}
          />
        </label>
        {fileError && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertCircle size={12} aria-hidden="true" />
            {fileError}
          </p>
        )}
      </div>

      {/* Server-side error */}
      {state.status === "error" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
          {state.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !!fileError || !selectedFile}
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <>
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              Ingesting…
            </>
          ) : (
            <>
              <Upload size={14} aria-hidden="true" />
              Upload &amp; ingest
            </>
          )}
        </button>
        <a
          href={`/systems/${systemId}`}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </a>
      </div>

      {/* Help text */}
      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground/70">What happens when you upload?</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>The file is parsed server-side — no data leaves this browser in raw form.</li>
          <li>New findings are stored and matched against existing open findings (deduplication by plugin ID + asset).</li>
          <li>POA&amp;M items are automatically created for new High, Moderate, and Low findings.</li>
          <li>Recurring findings already in your POA&amp;M have their <em>Last Detected</em> date updated.</li>
        </ul>
      </div>
    </form>
  );
}
