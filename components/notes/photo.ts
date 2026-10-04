"use client";

import { fitWithin, MAX_PHOTO_CHARS, PHOTO_MAX_EDGE } from "@/lib/model/note";

/**
 * Shrink a photo on the phone before it goes anywhere: small enough to save
 * offline inside a note and to send under the server's upload limit, sharp
 * enough to read a flyer's small print.
 */
export async function shrinkPhoto(file: File): Promise<{ mediaType: "image/jpeg"; data: string } | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, PHOTO_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    for (const quality of [0.8, 0.65, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
      if (data && data.length <= MAX_PHOTO_CHARS) return { mediaType: "image/jpeg", data };
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
