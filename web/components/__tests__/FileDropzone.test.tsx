import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileDropzone } from "../FileDropzone";
import * as files from "@/lib/query/files";

describe("FileDropzone", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uploads a picked file via uploadFile", async () => {
    const spy = vi.spyOn(files, "uploadFile").mockResolvedValue(undefined);
    const onUploaded = vi.fn();
    render(<FileDropzone memberId="m1" onUploaded={onUploaded} />);
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const f = new File(["hi"], "a.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [f] } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(f, { memberId: "m1", meetingId: undefined }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
  });

  it("shows an error when the file is too large", async () => {
    vi.spyOn(files, "uploadFile").mockRejectedValue(new files.FileTooLargeError("Файл больше 50 МБ"));
    render(<FileDropzone memberId="m1" onUploaded={() => {}} />);
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const f = new File(["x"], "big.bin", { type: "application/octet-stream" });
    fireEvent.change(input, { target: { files: [f] } });
    await waitFor(() => expect(screen.getByText(/Файл больше 50 МБ/)).toBeInTheDocument());
  });
});
