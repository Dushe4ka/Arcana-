"use client";

import { useState } from "react";

import { apiRequest, ApiError } from "@/lib/api";

type UploadOut = { url: string };

/** Uploads a single image file to POST /admin/uploads and reports the resulting URL back to
 * the caller. Stateless about what the URL is used for (cover, sprite, background) - the
 * caller decides where it goes. */
export function ImageUpload({
  label,
  currentUrl,
  onUploaded,
}: {
  label: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest<UploadOut>("/admin/uploads", {
        method: "POST",
        body: formData,
        formData: true,
      });
      onUploaded(result.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm text-neutral-600">{label}</label>
      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded-file URLs, not a static local asset next/image can optimize
        <img src={currentUrl} alt="" className="h-24 w-24 rounded border border-neutral-300 object-cover" />
      )}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileChange} disabled={uploading} className="text-sm" />
      {uploading && <p className="text-sm text-neutral-500">Загрузка…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
