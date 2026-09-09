import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";

import LibraryScreen from "../(tabs)/library";
import { useLibrary } from "@/context/library-context";

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
    await fireEvent.changeText(
      screen.getAllByPlaceholderText("Name")[0],
      "My cue",
    );
    await fireEvent.press(screen.getAllByText("Add from file")[0]);

    await waitFor(() => {
      expect(addSignalFromFile).toHaveBeenCalledWith(
        "file:///picked/audio.mp3",
        "audio.mp3",
        "My cue",
      );
    });
  });
});
