import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  files: [] as File[],
  hookIndex: 0,
  pending: null as Promise<unknown> | null,
  upload: vi.fn(),
  refresh: vi.fn(),
  setFiles: vi.fn(),
  setResult: vi.fn(),
  setVersions: vi.fn(),
  reset: vi.fn(),
  setValue: vi.fn(),
}));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (initial: unknown) => {
    const index = state.hookIndex++;
    if (index === 1) return [state.files, state.setFiles];
    if (index === 2) return [initial, state.setResult];
    if (index === 3) return [initial, state.setVersions];
    return [initial, vi.fn()];
  },
  useRef: () => ({ current: null }),
  useTransition: () => [
    false,
    (callback: () => Promise<unknown>) => {
      state.pending = callback();
    },
  ],
}));
vi.mock("react-hook-form", async () => ({
  ...(await vi.importActual<typeof import("react-hook-form")>("react-hook-form")),
  useForm: () => ({ control: {}, reset: state.reset, setValue: state.setValue }),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "ru",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/app/actions/documents", () => ({
  uploadDocuments: state.upload,
  selectInvoiceVersion: vi.fn(),
}));
import { UploadDocumentForm } from "./UploadInvoiceForm";
beforeEach(() => {
  vi.clearAllMocks();
  state.upload.mockReset();
  state.hookIndex = 0;
  state.pending = null;
  state.files = ["one.pdf", "two.pdf"].map((name) => new File(["pdf"], name));
});
it("shows previous successes, opens version choices and refreshes the registry after a partial request failure", async () => {
  const version = {
    id: 1,
    sourceFileName: "one.pdf",
    documentNumber: "1",
    documentDate: null,
    supplierName: null,
    recipientName: null,
    totalAmount: "1",
    currency: "UAH",
    revision: 1,
  };
  const selection = { previous: version, uploaded: { ...version, id: 2, revision: 2 } };
  state.upload
    .mockResolvedValueOnce({
      errorKey: null,
      successCount: 1,
      failedCount: 0,
      duplicateCount: 0,
      replacementCount: 1,
      results: [{ fileName: "one.pdf", errorKey: null, versionSelection: selection }],
    })
    .mockRejectedValueOnce(new Error("Lost response"));
  const tree = UploadDocumentForm();
  tree.props.children[0].props.onSubmit({ preventDefault: vi.fn() });
  await state.pending;
  expect(state.setResult).toHaveBeenCalledWith({
    error: "two.pdf: messages.requestFailed",
    success: "messages.batchSummary",
  });
  expect(state.setVersions).toHaveBeenCalledWith([selection]);
  expect(state.refresh).toHaveBeenCalledTimes(1);
  expect(state.setFiles).toHaveBeenCalledWith([state.files[1]]);
  expect(state.setValue).toHaveBeenCalledWith("document", [state.files[1]]);
});

it("clears both the file state and RHF when an unsupported replacement is selected", () => {
  const tree = UploadDocumentForm();
  const field = tree.props.children[0].props.children[0];
  const dropzone = field.props.render().props.children[1].props.children;
  dropzone.props.onFileSelect([new File(["text"], "unsupported.txt", { type: "text/plain" })]);
  expect(state.setFiles).toHaveBeenCalledWith([]);
  expect(state.setValue).toHaveBeenCalledWith("document", [], { shouldValidate: true });
  expect(state.upload).not.toHaveBeenCalled();
});
