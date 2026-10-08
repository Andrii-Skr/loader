import { afterEach, expect, it, vi } from "vitest";
const replace = vi.hoisted(() => vi.fn());
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: () => [false, vi.fn()],
  useEffect: vi.fn(),
  startTransition: (callback: () => void) => callback(),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard/publication-issue-mappings",
  useRouter: () => ({ replace }),
}));
vi.mock("@/components/providers/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light", theme: "light", setTheme: vi.fn() }),
}));
import { HeaderControls } from "./header-controls";
afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
});
it("keeps document context, repeated query parameters and hash when switching locale", () => {
  vi.stubGlobal("window", {
    location: {
      search: "?documentId=10&filter=document-unmatched&tag=a&tag=b",
      hash: "#allocation",
    },
  });
  const tree = HeaderControls({
    currentLocale: "ru",
    headerControlsLabel: "Controls",
    languageLabel: "Language",
    localeLabels: { ru: "Русский", uk: "Українська", en: "English" },
    themeLabel: "Theme",
    themeLabels: { light: "Light", dark: "Dark", system: "System" },
  });
  const localeButtons = tree.props.children[0].props.children[1].props.children;
  const ukrainian = localeButtons.find((button: { key: string }) => button.key === "uk");
  ukrainian.props.onClick();
  expect(replace).toHaveBeenCalledWith(
    "/dashboard/publication-issue-mappings?documentId=10&filter=document-unmatched&tag=a&tag=b#allocation",
    { locale: "uk" },
  );
});
