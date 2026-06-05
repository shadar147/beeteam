import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

const MAX_SIZE = 52_428_800; // 50 MB

export class FileTooLargeError extends Error {}
export class DemoFileError extends Error {}

/** POST /v1/files → presigned PUT → upload bytes straight to MinIO. */
export async function uploadFile(
  file: File,
  opts: { memberId: string; meetingId?: string },
): Promise<void> {
  if (file.size > MAX_SIZE) throw new FileTooLargeError("Файл больше 50 МБ");
  const { data, error } = await api.POST("/v1/files", {
    body: {
      member_id: opts.memberId,
      meeting_id: opts.meetingId,
      name: file.name,
      mime: file.type || "application/octet-stream",
      size_bytes: file.size,
    },
  });
  if (error) throw error;
  const put = await fetch(data!.upload_url, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error("Не удалось загрузить файл");
}

/** GET presigned download → open it. Throws DemoFileError on a seed file (409). */
export async function downloadFile(id: string): Promise<void> {
  const { data, error, response } = await api.GET("/v1/files/{id}/download", {
    params: { path: { id } },
  });
  if (response.status === 409) throw new DemoFileError("Демо-файл недоступен для скачивания");
  if (error) throw error;
  window.open(data!.download_url, "_blank");
}

export function useDeleteFile(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/v1/files/{id}", { params: { path: { id } } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-files", memberId] }),
  });
}

/** Direct URL for the member's zip (opened in a new tab / via download link). */
export function zipUrl(memberId: string): string {
  return `/api/v1/members/${memberId}/files.zip`;
}
