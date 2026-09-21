import { render, screen, fireEvent, waitFor } from "@testing-library/vue";
import { describe, it, expect, vi, beforeEach } from "vitest";
import FileDropzone from "../FileDropzone.vue";
import * as files from "~/lib/query/files";

// ESM namespaces are not spy-able as-is; keep the real module, make uploadFile a mock.
vi.mock("~/lib/query/files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/query/files")>()),
  uploadFile: vi.fn(),
}));

describe("FileDropzone", () => {
  // Braces matter: mockReset() returns the mock, and a function returned from
  // beforeEach is run as a teardown hook.
  beforeEach(() => {
    vi.mocked(files.uploadFile).mockReset();
  });

  it("uploads a picked file via uploadFile", async () => {
    const spy = vi.mocked(files.uploadFile).mockResolvedValue(undefined);
    const { emitted } = render(FileDropzone, { props: { memberId: "m1" } });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const f = new File(["hi"], "a.pdf", { type: "application/pdf" });
    await fireEvent.change(input, { target: { files: [f] } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(f, { memberId: "m1", meetingId: undefined }));
    await waitFor(() => expect(emitted().uploaded).toHaveLength(1));
  });

  it("shows an error when the file is too large", async () => {
    vi.mocked(files.uploadFile).mockRejectedValue(new files.FileTooLargeError("Файл больше 50 МБ"));
    render(FileDropzone, { props: { memberId: "m1" } });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const f = new File(["x"], "big.bin", { type: "application/octet-stream" });
    await fireEvent.change(input, { target: { files: [f] } });
    await waitFor(() => expect(screen.getByText(/Файл больше 50 МБ/)).toBeInTheDocument());
  });
});
