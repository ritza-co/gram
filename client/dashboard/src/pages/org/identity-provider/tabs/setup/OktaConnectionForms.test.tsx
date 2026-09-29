import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { ClientIdForm, CreateConnectionForm } from "./OktaConnectionForms";
import { makeConnection } from "./testFixtures";

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  error: undefined,
}));
vi.mock("@gram/client/react-query/createIdentityProviderConnection.js", () => ({
  useCreateIdentityProviderConnectionMutation: () => mutation,
}));
vi.mock(
  "@gram/client/react-query/submitIdentityProviderConnectionClientId.js",
  () => ({
    useSubmitIdentityProviderConnectionClientIdMutation: () => mutation,
  }),
);
afterEach(cleanup);
beforeEach(() => {
  mutation.mutate.mockClear();
  mutation.isPending = false;
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

function chooseCustomApp() {
  fireEvent.click(
    screen.getByRole("radio", { name: "Create a custom API Services app" }),
  );
}

describe("CreateConnectionForm", () => {
  it("validates URL in text and guards Enter submissions", () => {
    const { rerender } = render(<CreateConnectionForm />, {
      wrapper: Wrapper,
    });
    chooseCustomApp();
    const input = screen.getByLabelText("Okta organization URL");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutation.mutate).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "http://example.okta.com" } });
    expect(screen.getByRole("alert").textContent).toContain(
      "Enter an HTTPS Okta organization URL",
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutation.mutate).not.toHaveBeenCalled();
    fireEvent.change(input, {
      target: { value: " https://example.okta.com/ " },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          createIdentityProviderConnectionRequestBody: {
            orgUrl: "https://example.okta.com",
            listingMode: "custom_app",
          },
        },
      }),
    );
    mutation.isPending = true;
    rerender(<CreateConnectionForm />);
    expect(input.hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutation.mutate).toHaveBeenCalledTimes(1);
  });

  it("creates an OIN connection by default", () => {
    render(<CreateConnectionForm />, { wrapper: Wrapper });
    expect(
      screen
        .getByRole("radio", {
          name: "Install Speakeasy from the Okta Integration Network (recommended)",
        })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.change(screen.getByLabelText("Okta organization URL"), {
      target: { value: "https://example.okta.com/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create connection" }));
    expect(mutation.mutate).toHaveBeenCalledExactlyOnceWith({
      security: expect.anything(),
      request: {
        createIdentityProviderConnectionRequestBody: {
          orgUrl: "https://example.okta.com",
          listingMode: "oin",
        },
      },
    });
  });

  it("creates a custom-app connection when chosen", () => {
    render(<CreateConnectionForm />, { wrapper: Wrapper });
    chooseCustomApp();
    fireEvent.change(screen.getByLabelText("Okta organization URL"), {
      target: { value: "https://example.okta.com/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create connection" }));
    expect(mutation.mutate).toHaveBeenCalledExactlyOnceWith({
      security: expect.anything(),
      request: {
        createIdentityProviderConnectionRequestBody: {
          orgUrl: "https://example.okta.com",
          listingMode: "custom_app",
        },
      },
    });
  });

  it("disables the button for a non-Okta URL and while pending", () => {
    const { rerender } = render(<CreateConnectionForm />, {
      wrapper: Wrapper,
    });
    fireEvent.change(screen.getByLabelText("Okta organization URL"), {
      target: { value: "https://unrelated.example.com" },
    });
    const create = screen.getByRole("button", { name: "Create connection" });
    expect(create.hasAttribute("disabled")).toBe(true);
    fireEvent.click(create);
    expect(mutation.mutate).not.toHaveBeenCalled();
    mutation.isPending = true;
    rerender(<CreateConnectionForm />);
    expect(
      screen
        .getByRole("button", { name: "Creating..." })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("ClientIdForm", () => {
  it("guards empty and pending client ID submissions", () => {
    const connection = makeConnection({ clientIdSubmitted: false });
    const { rerender } = render(<ClientIdForm connection={connection} />, {
      wrapper: Wrapper,
    });
    const input = screen.getByLabelText("Client ID");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutation.mutate).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "wlp00000000000000000" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "starting with 0oa",
    );
    fireEvent.change(input, { target: { value: " 0oa00000000000000000 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          submitIdentityProviderConnectionClientIDRequestBody: {
            id: connection.id,
            clientId: "0oa00000000000000000",
          },
        },
      }),
    );
    mutation.isPending = true;
    rerender(<ClientIdForm connection={connection} />);
    expect(input.hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutation.mutate).toHaveBeenCalledTimes(1);
  });

  it("does not ask for a client secret on custom-app connections", () => {
    const connection = makeConnection({ clientIdSubmitted: false });
    render(<ClientIdForm connection={connection} />, { wrapper: Wrapper });
    expect(screen.queryByLabelText("Client secret")).toBeNull();
    fireEvent.change(screen.getByLabelText("Client ID"), {
      target: { value: "0oa00000000000000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit and verify" }));
    expect(mutation.mutate).toHaveBeenCalledExactlyOnceWith({
      security: expect.anything(),
      request: {
        submitIdentityProviderConnectionClientIDRequestBody: {
          id: connection.id,
          clientId: "0oa00000000000000000",
        },
      },
    });
  });

  it("does not ask for a client secret on legacy OIN connections with a key set", () => {
    const connection = makeConnection({
      clientIdSubmitted: false,
      listingMode: "oin",
    });
    render(<ClientIdForm connection={connection} />, { wrapper: Wrapper });
    expect(screen.queryByLabelText("Client secret")).toBeNull();
    fireEvent.change(screen.getByLabelText("Client ID"), {
      target: { value: "0oa00000000000000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit and verify" }));
    expect(mutation.mutate).toHaveBeenCalledExactlyOnceWith({
      security: expect.anything(),
      request: {
        submitIdentityProviderConnectionClientIDRequestBody: {
          id: connection.id,
          clientId: "0oa00000000000000000",
        },
      },
    });
  });

  it("requires and sends the client secret on OIN connections", () => {
    const connection = makeConnection({
      clientIdSubmitted: false,
      listingMode: "oin",
      jwksUrl: undefined,
    });
    render(<ClientIdForm connection={connection} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("Client ID"), {
      target: { value: "0oa00000000000000000" },
    });
    const submit = screen.getByRole("button", { name: "Submit and verify" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    const secret = screen.getByLabelText("Client secret");
    expect(secret.getAttribute("type")).toBe("password");
    expect(secret.getAttribute("autocomplete")).toBe("new-password");
    fireEvent.change(secret, { target: { value: "s3cret-value" } });
    fireEvent.click(submit);
    expect(mutation.mutate).toHaveBeenCalledExactlyOnceWith({
      security: expect.anything(),
      request: {
        submitIdentityProviderConnectionClientIDRequestBody: {
          id: connection.id,
          clientId: "0oa00000000000000000",
          clientSecret: "s3cret-value",
        },
      },
    });
  });
});
