import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Text } from "react-native";

import { ErrorBoundary } from "../error-boundary";

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("kaboom");
  return <Text>All good</Text>;
}

describe("ErrorBoundary", () => {
  // React logs caught render errors to the console; silence it so a passing
  // test does not look like a failing one.
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders its children when nothing is wrong", async () => {
    await render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeTruthy();
  });

  it("shows a recovery screen instead of a blank one when a child throws", async () => {
    await render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByLabelText("Try again")).toBeTruthy();
  });

  it("reassures the user that their nights are still saved", async () => {
    await render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/still saved/)).toBeTruthy();
  });

  it("shows what happened, so a tester can report it", async () => {
    await render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("kaboom")).toBeTruthy();
  });

  it("reports the error to its owner", async () => {
    const onError = jest.fn();
    await render(
      <ErrorBoundary onError={onError}>
        <Boom explode />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("stays up even if the reporter itself throws", async () => {
    const onError = jest.fn(() => {
      throw new Error("reporter is broken too");
    });

    await render(
      <ErrorBoundary onError={onError}>
        <Boom explode />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("recovers when Try again is pressed and the cause is gone", async () => {
    // The point of the button: a transient failure must not mean the app is
    // finished until it is force-quit.
    let shouldFail = true;
    function Flaky() {
      if (shouldFail) throw new Error("kaboom");
      return <Text>All good</Text>;
    }

    await render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();

    shouldFail = false;
    fireEvent.press(screen.getByLabelText("Try again"));

    await waitFor(() => expect(screen.getByText("All good")).toBeTruthy());
  });
});
