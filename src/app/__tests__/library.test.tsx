import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";

import LibraryScreen from "../(tabs)/library";
import { useLibrary } from "@/context/library-context";
import { loadLibraryManifest } from "@/storage/library-manifest";

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("@/audio", () => ({
  previewSignal: jest.fn(),
}));

jest.mock("@/context/library-context", () => ({
  getLibraryFileStore: jest.fn(),
  useLibrary: jest.fn(),
}));

jest.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({
    background: "white",
    backgroundElement: "white",
    backgroundSelected: "gray",
    danger: "red",
    text: "black",
    textSecondary: "gray",
  }),
}));

jest.mock("@/storage/library-manifest", () => ({
  loadLibraryManifest: jest.fn(),
}));

describe("LibraryScreen", () => {
  it("keeps the entered signal name when importing a file", async () => {
    const addSignalFromFile = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useLibrary).mockReturnValue({
      isLoaded: true,
      signals: [],
      scripts: [],
      addSignalFromUrl: jest.fn(),
      addScriptFromUrl: jest.fn(),
      addSignalFromFile,
      addScriptFromFile: jest.fn(),
      importManifest: jest.fn(),
      removeItem: jest.fn(),
      setSavedOffline: jest.fn(),
    });
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///picked/audio.mp3",
          name: "audio.mp3",
          mimeType: "audio/mpeg",
          size: 123,
          lastModified: 0,
        },
      ],
    });

    await render(<LibraryScreen />);
    await fireEvent.press(screen.getByText("Import new signal"));
    await fireEvent.changeText(
      screen.getAllByPlaceholderText("Name")[0],
      "My cue",
    );
    await fireEvent.press(screen.getByText("Import from file"));

    await waitFor(() => {
      expect(addSignalFromFile).toHaveBeenCalledWith(
        "file:///picked/audio.mp3",
        "audio.mp3",
        "My cue",
      );
    });
  });

  it("reviews and imports every item in a manifest", async () => {
    const importManifest = jest.fn().mockResolvedValue(undefined);
    const manifest = {
      url: "https://example.test/content/manifest.json",
      signals: [{ name: "chime", url: "https://example.test/chime.mp3" }],
      scripts: [
        { name: "training", url: "https://example.test/training.yaml" },
      ],
    };
    jest.mocked(useLibrary).mockReturnValue({
      isLoaded: true,
      signals: [],
      scripts: [],
      addSignalFromUrl: jest.fn(),
      addScriptFromUrl: jest.fn(),
      addSignalFromFile: jest.fn(),
      addScriptFromFile: jest.fn(),
      importManifest,
      removeItem: jest.fn(),
      setSavedOffline: jest.fn(),
    });
    jest.mocked(loadLibraryManifest).mockResolvedValue(manifest);

    await render(<LibraryScreen />);
    await fireEvent.press(screen.getByText("Import extension"));
    await fireEvent.changeText(
      screen.getByPlaceholderText("https://…/manifest.json"),
      manifest.url,
    );
    await fireEvent.press(screen.getByText("Review"));
    expect(await screen.findByText("Import this library?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Import 2 items"));

    await waitFor(() => expect(importManifest).toHaveBeenCalledWith(manifest));
  });
});
