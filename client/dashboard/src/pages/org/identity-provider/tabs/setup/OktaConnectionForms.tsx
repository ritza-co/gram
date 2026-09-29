import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/Button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { RadioCard, RadioCardGroup } from "@/components/ui/RadioCard";
import { SettingsSection } from "@/components/page-templates";
import type {
  OktaIdentityProviderConnection,
  OktaIdentityProviderConnectionListingMode,
} from "@gram/client/models/components/oktaidentityproviderconnection.js";
import { useCreateIdentityProviderConnectionMutation } from "@gram/client/react-query/createIdentityProviderConnection.js";
import { useRecordIdentityProviderConnectionAgentMutation } from "@gram/client/react-query/recordIdentityProviderConnectionAgent.js";
import { useSubmitIdentityProviderConnectionClientIdMutation } from "@gram/client/react-query/submitIdentityProviderConnectionClientId.js";

import {
  inlineError,
  invalidateIdentityProviderQueries,
  SESSION_SECURITY,
} from "../../identityProviderQueries";
import { usesClientSecret } from "../../connectionView";
import { normalizeOktaOrgUrl } from "../../oktaConsoleLinks";
import {
  AGENT_SECTION_ID,
  CLIENT_ID_SECTION_ID,
  scrollToConnectionCard,
} from "../../tabs";

function isListingMode(
  value: string,
): value is OktaIdentityProviderConnectionListingMode {
  return value === "oin" || value === "custom_app";
}

function ListingModeChoice({
  value,
  onChange,
  disabled,
}: {
  value: OktaIdentityProviderConnectionListingMode;
  onChange: (value: OktaIdentityProviderConnectionListingMode) => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <RadioCardGroup
      aria-label="How to add Speakeasy to Okta"
      className="max-w-3xl"
      size="sm"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (isListingMode(next)) onChange(next);
      }}
    >
      <RadioCard
        value="oin"
        title="Install Speakeasy from the Okta Integration Network (recommended)"
      >
        Add the Speakeasy integration from Okta’s catalog, then paste the client
        ID and client secret Okta shows you.
      </RadioCard>
      <RadioCard value="custom_app" title="Create a custom API Services app">
        Create your own API Services app in Okta that signs in with Speakeasy’s
        public key. Use this if your Okta org cannot install catalog apps.
      </RadioCard>
    </RadioCardGroup>
  );
}

export function CreateConnectionForm(): JSX.Element {
  const queryClient = useQueryClient();
  const [orgUrl, setOrgUrl] = useState("");
  const [listingMode, setListingMode] =
    useState<OktaIdentityProviderConnectionListingMode>("oin");
  const create = useCreateIdentityProviderConnectionMutation({
    onSuccess: () => {
      toast.success("Okta connection created");
      void invalidateIdentityProviderQueries(queryClient);
    },
    onError: inlineError,
  });
  const trimmed = orgUrl.trim();
  const normalizedOrgUrl = normalizeOktaOrgUrl(trimmed);

  const createConnection = () => {
    if (create.isPending || normalizedOrgUrl === undefined) return;
    create.mutate({
      security: SESSION_SECURITY,
      request: {
        createIdentityProviderConnectionRequestBody: {
          orgUrl: normalizedOrgUrl,
          listingMode,
        },
      },
    });
  };

  return (
    <SettingsSection>
      <SettingsSection.Header>
        <SettingsSection.Title>
          Connect your Okta organization
        </SettingsSection.Title>
        <SettingsSection.Description>
          Choose how to add Speakeasy to Okta and enter your Okta organization
          URL. We’ll guide you through setting up the Okta app next. This does
          not change anything in Okta.
        </SettingsSection.Description>
      </SettingsSection.Header>
      <SettingsSection.Panel>
        <SettingsSection.Body>
          <ListingModeChoice
            value={listingMode}
            onChange={setListingMode}
            disabled={create.isPending}
          />
          <Field className="max-w-xl">
            <FieldLabel htmlFor="okta-org-url">
              Okta organization URL
            </FieldLabel>
            <Input
              id="okta-org-url"
              disabled={create.isPending}
              onEnter={createConnection}
              inputMode="url"
              autoCapitalize="none"
              aria-invalid={trimmed !== "" && normalizedOrgUrl === undefined}
              aria-describedby={
                trimmed !== "" && normalizedOrgUrl === undefined
                  ? "okta-org-url-help okta-org-url-error"
                  : "okta-org-url-help"
              }
              value={orgUrl}
              onChange={setOrgUrl}
              placeholder="https://example.okta.com"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              error={trimmed !== "" && normalizedOrgUrl === undefined}
            />
            <FieldDescription id="okta-org-url-help">
              Use your organization’s address starting with https:// and ending
              in .okta.com, .oktapreview.com, .okta-emea.com, or .okta.mil. Do
              not include a page address after the domain.
            </FieldDescription>
            {trimmed !== "" && normalizedOrgUrl === undefined && (
              <p
                id="okta-org-url-error"
                role="alert"
                className="text-destructive text-sm"
              >
                Enter an HTTPS Okta organization URL, such as
                https://example.okta.com, with nothing after the domain.
              </p>
            )}
          </Field>
          <ApiErrorAlert error={create.error} />
        </SettingsSection.Body>
        <SettingsSection.Footer>
          <SettingsSection.FooterHint>
            You’ll need Okta admin access to create the app and grant the
            required permissions (called scopes in Okta).
          </SettingsSection.FooterHint>
          <SettingsSection.FooterActions>
            <Button
              disabled={normalizedOrgUrl === undefined || create.isPending}
              onClick={createConnection}
            >
              {create.isPending ? "Creating..." : "Create connection"}
            </Button>
          </SettingsSection.FooterActions>
        </SettingsSection.Footer>
      </SettingsSection.Panel>
    </SettingsSection>
  );
}

export function ClientIdForm({
  connection,
}: {
  connection: OktaIdentityProviderConnection;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const needsSecret = usesClientSecret(connection);
  const submit = useSubmitIdentityProviderConnectionClientIdMutation({
    // The request variables can carry the plaintext secret; reset clears them.
    gcTime: 0,
    onSuccess: (updated) => {
      submit.reset();
      setClientSecret("");
      if (updated.status === "verified") {
        toast.success("Connection verified");
      } else {
        toast.warning(
          "Client ID saved. Review the verification results below.",
        );
      }
      void invalidateIdentityProviderQueries(queryClient).then(
        scrollToConnectionCard,
      );
    },
    onError: inlineError,
  });
  const trimmed = clientId.trim();
  const validClientId = /^0oa[A-Za-z0-9]{17,}$/.test(trimmed);
  const showClientIdError = trimmed !== "" && !validClientId;
  const clientIdSource = needsSecret
    ? "the client ID Okta showed when you installed Speakeasy"
    : "the API Services app's client ID";
  const secret = clientSecret.trim();
  const canSubmit = validClientId && (!needsSecret || secret !== "");
  const submitClientId = () => {
    if (!canSubmit || submit.isPending) return;
    submit.mutate({
      security: SESSION_SECURITY,
      request: {
        submitIdentityProviderConnectionClientIDRequestBody: {
          id: connection.id,
          clientId: trimmed,
          ...(needsSecret ? { clientSecret: secret } : {}),
        },
      },
    });
  };

  return (
    <section
      id={CLIENT_ID_SECTION_ID}
      aria-label="Submit the Okta client ID"
      className="flex max-w-3xl flex-col gap-4"
    >
      <Field className="max-w-xl">
        <FieldLabel htmlFor="okta-client-id">Client ID</FieldLabel>
        <Input
          id="okta-client-id"
          disabled={submit.isPending}
          onEnter={submitClientId}
          aria-invalid={showClientIdError}
          aria-describedby={`okta-client-id-help${showClientIdError ? " okta-client-id-error" : ""}`}
          error={showClientIdError}
          value={clientId}
          onChange={setClientId}
          placeholder="0oa..."
          className="font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <FieldDescription id="okta-client-id-help">
          Use {clientIdSource}, not the single sign-on (SSO) app or AI agent ID.
          You can save this ID only once. To change it, revoke this connection
          and connect again.
        </FieldDescription>
        {showClientIdError && (
          <p
            id="okta-client-id-error"
            role="alert"
            className="text-destructive text-sm"
          >
            Enter an Okta client ID starting with 0oa followed by at least 17
            letters or numbers.
          </p>
        )}
      </Field>
      {needsSecret && (
        <ClientSecretField
          id="okta-client-secret"
          value={clientSecret}
          onChange={setClientSecret}
          onEnter={submitClientId}
          disabled={submit.isPending}
        />
      )}
      <ApiErrorAlert error={submit.error} />
      <div>
        <Button
          disabled={!canSubmit || submit.isPending}
          onClick={submitClientId}
        >
          {submit.isPending ? "Verifying..." : "Submit and verify"}
        </Button>
      </div>
    </section>
  );
}

/** Write-only: the saved secret is never read back, so the field always starts empty. */
export function ClientSecretField({
  id,
  value,
  onChange,
  onEnter,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <Field className="max-w-xl">
      <FieldLabel htmlFor={id}>Client secret</FieldLabel>
      <Input
        id={id}
        type="password"
        noAutofill
        disabled={disabled}
        onEnter={onEnter}
        aria-describedby={`${id}-help`}
        value={value}
        onChange={onChange}
        className="font-mono"
      />
      <FieldDescription id={`${id}-help`}>
        Okta shows the client secret only once, when you install Speakeasy.
        Speakeasy stores it encrypted and never displays it again. If you lost
        it, generate a new secret in Okta.
      </FieldDescription>
    </Field>
  );
}

export function AgentSetupForm({
  connection,
}: {
  connection: OktaIdentityProviderConnection;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState(connection.agentId ?? "");
  const [agentAppId, setAgentAppId] = useState(connection.agentAppId ?? "");
  const record = useRecordIdentityProviderConnectionAgentMutation({
    onSuccess: () => {
      toast.success("Agent details saved");
      void invalidateIdentityProviderQueries(queryClient);
    },
    onError: inlineError,
  });
  const dirty =
    agentId.trim() !== (connection.agentId ?? "") ||
    agentAppId.trim() !== (connection.agentAppId ?? "");

  const saveAgent = () => {
    if (!dirty || record.isPending) return;
    record.mutate({
      security: SESSION_SECURITY,
      request: {
        recordIdentityProviderConnectionAgentRequestBody: {
          id: connection.id,
          agentId: agentId.trim(),
          agentAppId: agentAppId.trim(),
        },
      },
    });
  };

  return (
    <section
      id={AGENT_SECTION_ID}
      aria-label="Save Okta AI agent"
      className="flex max-w-3xl flex-col gap-4"
    >
      <div className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="okta-agent-id">Agent ID</FieldLabel>
          <Input
            id="okta-agent-id"
            disabled={record.isPending}
            onEnter={saveAgent}
            aria-describedby="okta-agent-help"
            value={agentId}
            onChange={setAgentId}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="okta-agent-app-id">
            Bound application ID (optional)
          </FieldLabel>
          <Input
            id="okta-agent-app-id"
            disabled={record.isPending}
            onEnter={saveAgent}
            aria-describedby="okta-agent-help"
            value={agentAppId}
            onChange={setAgentAppId}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>
      <ApiErrorAlert error={record.error} />
      <FieldDescription id="okta-agent-help">
        The agent ID is the wlp... value in the Okta agent page URL, and it
        drives the deep links on the Cross App Access tab. The bound application
        ID is the Client ID of the app Okta created with the agent; with it,
        Speakeasy can check that app after each applications sync. Okta does not
        expose either through its API. Leave a field empty to clear it.
      </FieldDescription>
      <a
        href="https://help.okta.com/oie/en-us/content/topics/ai-agents/ai-agent-add-manually.htm"
        target="_blank"
        rel="noopener noreferrer"
        className="w-fit text-sm underline underline-offset-4"
      >
        Okta AI agent registration guide
      </a>
      <div>
        <Button disabled={!dirty || record.isPending} onClick={saveAgent}>
          {record.isPending ? "Saving..." : "Save agent"}
        </Button>
      </div>
    </section>
  );
}
