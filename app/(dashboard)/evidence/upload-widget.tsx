"use client";

import { useState, useActionState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerEvidenceFile, deleteEvidenceFile, type EvidenceRegisterState } from "./actions";
import { Paperclip, Upload, Trash2, FileText } from "lucide-react";
import { format } from "date-fns";

type EvidenceFile = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  users: { full_name: string } | null;
};

type Props = {
  entityType: "poam_item" | "assessment" | "incident";
  entityId: string;
  orgId: string;
  canEdit: boolean;
  canDelete: boolean;
  existingFiles: EvidenceFile[];
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EvidenceUploadWidget({
  entityType,
  entityId,
  orgId,
  canEdit,
  canDelete,
  existingFiles,
}: Props) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [files, setFiles] = useState<EvidenceFile[]>(existingFiles);

  const [regState, registerAction, regPending] = useActionState<EvidenceRegisterState, FormData>(
    registerEvidenceFile,
    { status: "idle" }
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File must be 10 MB or smaller.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    const ext      = file.name.split(".").pop() ?? "";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path     = `${orgId}/${entityType}/${entityId}/${Date.now()}-${safeName}`;

    const { error: storageError } = await supabase.storage
      .from("evidence-files")
      .upload(path, file, { contentType: file.type });

    setUploading(false);

    if (storageError) {
      setUploadError(`Upload failed: ${storageError.message}`);
      return;
    }

    // Register in DB via server action
    const fd = new FormData();
    fd.set("entity_type", entityType);
    fd.set("entity_id",   entityId);
    fd.set("file_name",   file.name);
    fd.set("file_path",   path);
    fd.set("file_size",   String(file.size));
    fd.set("mime_type",   file.type);

    // Call server action manually via fetch-like approach
    const result = await registerEvidenceFile({ status: "idle" }, fd);

    if (result.status === "error") {
      // Storage upload succeeded but DB registration failed — clean up
      await supabase.storage.from("evidence-files").remove([path]);
      setUploadError(result.message);
      return;
    }

    if (result.status === "success") {
      // Optimistically add to list
      setFiles((prev) => [
        {
          id:         result.fileId,
          file_name:  file.name,
          file_path:  path,
          file_size:  file.size,
          mime_type:  file.type,
          created_at: new Date().toISOString(),
          users:      null,
        },
        ...prev,
      ]);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(fileId: string, filePath: string) {
    if (!confirm("Delete this evidence file? This cannot be undone.")) return;
    await deleteEvidenceFile(fileId, filePath, entityType, entityId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  async function getDownloadUrl(filePath: string) {
    const { data } = await supabase.storage
      .from("evidence-files")
      .createSignedUrl(filePath, 60); // 60-second signed URL
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="space-y-3">
      {/* File list */}
      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
              <FileText size={13} className="text-muted-foreground shrink-0" />
              <button
                onClick={() => getDownloadUrl(f.file_path)}
                className="flex-1 text-left text-primary hover:underline truncate"
              >
                {f.file_name}
              </button>
              <span className="text-muted-foreground shrink-0">{formatBytes(f.file_size)}</span>
              <span className="text-muted-foreground shrink-0">
                {format(new Date(f.created_at), "MMM d")}
              </span>
              {canDelete && (
                <button
                  onClick={() => handleDelete(f.id, f.file_path)}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No evidence files attached yet.</p>
      )}

      {/* Upload button */}
      {canEdit && (
        <div>
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            {uploading
              ? <><Upload size={13} className="animate-bounce" /> Uploading…</>
              : <><Paperclip size={13} /> Attach evidence file</>}
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              disabled={uploading}
              onChange={handleFileChange}
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.txt,.xml,.json,.zip"
            />
          </label>
          {uploadError && (
            <p className="mt-1 text-xs text-destructive">{uploadError}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Max 10 MB. PDF, images, Office docs, or archives.</p>
        </div>
      )}
    </div>
  );
}
